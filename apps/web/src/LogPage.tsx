import { awaitsUserReview, type JournalEntry } from '@rw/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { commentsApi, type CommentEntry, type ProjectInfo, type RecordFile, type ResearchApi, type ResearchSummary, type Topic } from './api'
import type { FlashAction } from './flash'
import { MemoList } from './memo'
import { reviewStatusLabel } from './reviewStatus'
import { askClaude, bumpPending, load, revealComment } from './Comments'
import { RecordList } from './RecordList'
import { recordRoute } from './recordsPanelHelpers'
import { go } from './router'
import { openFlowDot } from './FlowView'
import { needsJudgment } from './taskView'
import { isRecordFilter, parseWorkFilter, clearTodoFocus, peekTodoFocus, SECTION_FILTERS, TODO_FOCUS_EVENT, todoKey, WORK_FILTER_EVENT, WORK_FILTER_KEY, WORK_FILTER_LABEL, workRecordGroups, type WorkFilter, type WorkSection } from './workRecords'
import { JournalRecordRow, WorkComposer } from './WorkRecordViews'
import { useJournal, useProjectInfo, useRecords } from './projectQueries'
import { JudgeList, TaskDialog, TaskList, TaskWeek, useTasks, type TaskDraft } from './WorkTasks'
import { t } from './i18n'

/** 메모·할 일 고치기·지우기 (10/4 피드백) */
function useJournalEdit(rapi: ResearchApi, reload: () => Promise<unknown>, onSaved: (m: string) => void) {
  return {
    onEdit: async (e: JournalEntry, text: string) => { await rapi.editJournal(e, text).catch((err: Error) => { onSaved(err.message); throw err }); await reload(); onSaved(t('고쳤습니다', 'Edited')) },
    onDelete: (e: JournalEntry) => { rapi.deleteJournal(e).then(reload).then(() => onSaved(t('지웠습니다', 'Deleted'))).catch((err: Error) => onSaved(err.message)) },
  }
}

const NO_FILES: RecordFile[] = []

export function useTitles(summary: ResearchSummary) {
  const byId = useMemo(() => new Map(summary.blocks.map((b) => [b.id, b])), [summary.blocks])
  return (id: string) => byId.get(id)?.title ?? id
}

/**
 * 작업(section work): 위에 한 주 달력, 필터로 판단 · 맡긴 일을 보고, 아래 작업 일지는 날짜별로 유지한다.
 * 판단 · 맡긴 일은 에이전트에게 맡긴 일(10/7 작업 탭, WorkTasks.tsx)이다.
 * 기록(section records): 프로젝트의 메모 · 할 일 · 질문을 대상별로 모아 보고 적는다 (10/15 사용자 결정: 작업 탭에서 따로 뗌).
 */
export function WorkPage({ rid, rapi, summary, topics, onSaved, focus, firstPartOf, onOpenPdf, section = 'work' }: {
  rid: string; rapi: ResearchApi; summary: ResearchSummary; topics: Topic[]; onSaved(message: string, action?: FlashAction): void; focus?: 'log'
  firstPartOf(target: string): string | undefined; onOpenPdf(file: RecordFile): boolean; section?: WorkSection
}) {
  const { entries, loaded: journalLoaded, reload, toggle } = useJournal(rapi)
  const edit = useJournalEdit(rapi, reload, onSaved)
  const titleOf = useTitles(summary)
  // 할 일의 정본은 기록 파일이다 (2026-10-16). 일지에는 끝낸 일 · 상태 · 메모 (예전 일지의 끝낸 할 일 포함)
  const past = entries.filter((e) => !(e.kind === 'todo' && !e.done))
  const records_ = section === 'records'
  const [filter, setFilter] = useState<WorkFilter>(() => {
    try { return parseWorkFilter(localStorage.getItem(WORK_FILTER_KEY[section]), section) } catch { return SECTION_FILTERS[section][0]! }
  })
  const chooseFilter = (next: WorkFilter) => {
    setFilter(next)
    try { localStorage.setItem(WORK_FILTER_KEY[section], next) } catch { /* 저장할 수 없어도 거르기는 쓴다. */ }
  }
  // 오른쪽 사이드바 기록의 "모두 보기"가 고른 필터
  useEffect(() => {
    if (!records_) return
    const take = (e: Event) => setFilter(parseWorkFilter((e as CustomEvent<string>).detail, 'records'))
    window.addEventListener(WORK_FILTER_EVENT, take)
    return () => window.removeEventListener(WORK_FILTER_EVENT, take)
  }, [records_])
  // 첫 화면 작업 패널에서 누른 할 일: 할 일 필터로 바꾸고 그 항목으로 스크롤해 잠깐 표시한다.
  const [focusTodo, setFocusTodo] = useState<string | null>(() => section === 'records' ? peekTodoFocus() : null)
  useEffect(() => {
    if (!records_) return
    const take = () => { const key = peekTodoFocus(); if (key) { setFilter('할 일'); setFocusTodo(key) } }
    window.addEventListener(TODO_FOCUS_EVENT, take)
    return () => window.removeEventListener(TODO_FOCUS_EVENT, take)
  }, [records_])
  const { tasks, diagnostics, loaded: tasksLoaded, error: tasksError, reload: reloadTasks } = useTasks(rid)
  const [dialog, setDialog] = useState<TaskDraft | null>(null)
  const judgeCount = tasks.filter(needsJudgment).length
  const recordsQuery = useRecords(rid)
  const files = recordsQuery.data?.files ?? NO_FILES
  useEffect(() => {
    if (!focusTodo || filter !== '할 일') return
    const item = document.querySelector<HTMLElement>(`[data-ui="할 일"] [data-todo-key="${CSS.escape(focusTodo)}"]`)
    if (!item) return
    clearTodoFocus(focusTodo)
    item.scrollIntoView({ block: 'center' })
    item.classList.add('flash')
    const timer = setTimeout(() => { item.classList.remove('flash'); setFocusTodo(null) }, 1600)
    return () => clearTimeout(timer)
  }, [focusTodo, filter, files])
  const recordsLoaded = recordsQuery.isFetched && !recordsQuery.isFetching
  const recordsError = recordsQuery.error?.message ?? null
  const groups = workRecordGroups(files, entries, filter === '질문' || filter === '지시' || filter === '할 일' ? filter : '메모')
  const count = filter === '판단' ? judgeCount : filter === '맡긴 일' ? tasks.length + new Set(diagnostics.map((d) => d.file)).size : groups.reduce((n, group) => n + group.items.length, 0)
  const openRecord = (file: RecordFile, entry: CommentEntry) => {
    if (!(entry.page && onOpenPdf(file))) {
      const route = recordRoute(rid, file, firstPartOf)
      if (file.target.startsWith('flow-') && file.source) openFlowDot(rid, { id: file.source })
      else if (route) go(route)
    }
    if (!entry.lost) revealComment(rid, file.target, entry.id)
  }
  const projectQuery = useProjectInfo(rid)
  const project = projectQuery.data ?? null
  const projectLoaded = projectQuery.isFetched
  const reviews = project?.reviews.filter((r) => awaitsUserReview(r.status)) ?? []
  const logRef = useRef<HTMLElement>(null)
  const scrolled = useRef(false)
  useEffect(() => { scrolled.current = false }, [rid, focus])
  // 화면이 보이고 일지 위의 프로젝트 작업·검토 목록까지 받은 뒤, 이 이동에서 한 번만 내려간다.
  useEffect(() => {
    if (focus !== 'log' || !journalLoaded || !projectLoaded || !tasksLoaded || (isRecordFilter(filter) && !recordsLoaded) || scrolled.current || !logRef.current) return
    logRef.current.scrollIntoView({ block: 'start' })
    scrolled.current = true
  }, [rid, focus, journalLoaded, projectLoaded, tasksLoaded, filter, recordsLoaded])
  return (
    <div className="ws-doc" data-ui={records_ ? '기록 화면' : '할 일'}>
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <div className="segmented small" role="group" aria-label={records_ ? t('기록 필터', 'Records filter') : t('작업 필터', 'Work filter')} data-ui={records_ ? '기록 거르기' : '작업 거르기'}>
            {SECTION_FILTERS[section].map((f) => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => chooseFilter(f)}>{WORK_FILTER_LABEL[f]}
              {f === '판단' && judgeCount > 0 && <span className="rail-count tk-turn">{judgeCount}</span>}</button>)}
          </div>
          <span className="crumb muted" title={filter === '할 일' ? t('남은 할 일', 'Open to-dos') : WORK_FILTER_LABEL[filter]}>{t(`${count}개`, String(count))}</span>
          <span className="sp" />
          {!records_ && <button className="btn" data-ui="맡기기" title={t('에이전트에게 일을 맡깁니다: 작업 내용과 종결 조건을 적으면 작업 파일이 생깁니다', 'Delegate work to an agent: write the task and its completion criteria to create a task file')} onClick={() => setDialog({})}>＋ {t('맡기기', 'Delegate')}</button>}
        </div>
        <div className="memo-list work-page">
          {!records_ && <TaskWeek rid={rid} tasks={tasks} entries={entries} todos={summary.todos} />}
          {filter === '판단' ? <JudgeList rid={rid} tasks={tasks} loaded={tasksLoaded} onSaved={onSaved} reload={reloadTasks}
            onEditProposal={(t) => setDialog({ mode: 'proposal', from: t, endCondition: t.proposal?.endCondition.length === 1 ? t.proposal.endCondition[0] : (t.proposal?.endCondition ?? []).map((c, i) => `${i + 1}) ${c}`).join('\n') })}>
            {reviews.length > 0 && <Reviews list={reviews} />}
          </JudgeList>
          : filter === '맡긴 일' ? <TaskList rid={rid} tasks={tasks} diagnostics={diagnostics} loaded={tasksLoaded} error={tasksError} />
          : <>
          {filter === '할 일' && <>
            <div className="work-h" title={t('체크하면 작업 일지에 완료로 남습니다 · 글 앞에 "10/20까지 —"처럼 날짜를 쓰면 마감', 'Checked items are logged as done in the work journal · Start with a date like "10/20까지 —" to set a deadline')}>{t('할 일', 'To-do')}</div>
            {project?.tasks && project.tasks.rows.length > 0 && <ProjectTasks t={project.tasks} />}
            {project?.tasks && <div className="todo-sec-h" title="workbench/comments/">{t('앱 할 일', 'App to-dos')}</div>}
          </>}
          <div className="work-records" data-ui={filter === '할 일' ? '할 일' : '작업 기록 목록'}>
            {recordsError && <div className="banner danger" role="alert">{recordsError}</div>}
            {!count && <p className="empty records-empty">{!recordsLoaded || !journalLoaded ? t('불러오는 중…', 'Loading…') : recordsError ? t('기록을 불러오지 못했습니다.', 'Could not load records.') : filter === '할 일' ? t('남은 할 일이 없습니다.', 'No open to-dos.') : t(`아직 ${filter === '질문' ? '질문이' : filter === '지시' ? '지시가' : '메모가'} 없습니다. 노트에서 글을 골라 적거나 아래에 적어 보세요.`, `No ${filter === '질문' ? 'questions' : filter === '지시' ? 'instructions' : 'memos'} yet. Select text in a note to write one, or write below.`)}</p>}
            {groups.map((group) => <div className="record-group" key={group.target}>
              {group.items.map((item) => item.kind === 'record'
                ? <div key={`${item.file.target}/${item.entry.id}`} data-todo-key={todoKey({ target: item.file.target, id: item.entry.id })}><RecordList rid={rid} file={item.file} filter={filter} items={[item.entry]} work onGo={(c) => openRecord(item.file, c)} /></div>
                : <JournalRecordRow key={`journal/${item.entry.date}/${item.entry.index}`} entry={item.entry} rid={rid} titleOf={titleOf} rapi={rapi} reload={reload} onSaved={onSaved} />)}
            </div>)}
          </div></>}
          {isRecordFilter(filter) && <WorkComposer key={rid} filter={filter} onSave={async (kind, text) => {
            const result = await commentsApi(rid).add('project', { kind, title: summary.research.title, text })
            await load(rid, 'project', true); bumpPending()
            if (kind === '질문') void askClaude(rid, 'project', result.entry.id)
            onSaved(t(`${kind} 저장됨`, `${WORK_FILTER_LABEL[kind]} saved`))
          }} />}
          {!records_ && <section ref={logRef} className="work-log" data-ui="기록">
            <div className="work-h" title={t('끝낸 할 일, 상태 변화, 메모 · workbench/log/', 'Finished to-dos, status changes, memos · workbench/log/')}>{t('작업 일지', 'Work journal')}</div>
            <MemoList entries={past} rid={rid} titleOf={titleOf} onToggle={toggle} {...edit}
              empty={t('아직 기록이 없습니다. 할 일을 끝내거나 노트의 상태를 바꾸면 여기에 쌓입니다.', 'No records yet. Finishing a to-do or changing a note status adds one here.')} />
          </section>}
        </div>
      </section>
      {dialog && <TaskDialog rid={rid} topics={topics} draft={dialog} onClose={() => setDialog(null)} onSaved={onSaved} reload={reloadTasks} />}
    </div>
  )
}

const unlink = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '')

/** 프로젝트 자체 작업 목록 (research.yaml sources.tasks). 정본은 그 파일 — 여기서는 읽기만 */
function ProjectTasks({ t: tasks }: { t: NonNullable<ProjectInfo['tasks']> }) {
  const keep = tasks.columns.map((c, i) => [c, i] as const).filter(([c]) => !/파일|file/i.test(c))
  return (
    <section className="todo-sec" data-ui="프로젝트 작업 목록">
      <div className="todo-sec-h">{t('프로젝트 작업 목록', 'Project task list')} <span className="muted">{tasks.file} {t('— 정본, 읽기만', '(source of truth, read only)')}</span></div>
      <table className="task-table">
        <thead><tr>{keep.map(([c]) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{tasks.rows.map((r, j) => <tr key={j}>{keep.map(([column, i]) => {
          const text = unlink(r[i] ?? '')
          const label = /^(상태|status)$/i.test(column.trim()) ? reviewStatusLabel(text) : text
          return <td key={i} title={label}>{label}</td>
        })}</tr>)}</tbody>
      </table>
    </section>
  )
}

/** 사용자 차례인 검토 문서 (research.yaml sources.reviews, status in-review) */
function Reviews({ list }: { list: ProjectInfo['reviews'] }) {
  const by = new Map<string, ProjectInfo['reviews']>()
  for (const r of list) by.set(r.status, [...(by.get(r.status) ?? []), r])
  return (
    <section className="todo-sec" data-ui="검토 대기 문서">
      <div className="todo-sec-h">{t('검토 대기 문서', 'Documents awaiting review')} <span className="rail-count">{list.length}</span> <span className="muted">{t('물리·수학 검토는 사용자만', 'Only the user does physics and math review')}</span></div>
      {[...by].map(([st, docs]) => (
        <details key={st} className="review-group">
          <summary><b>{reviewStatusLabel(st)}</b> {docs.length}</summary>
          <ul>{docs.map((d) => <li key={d.file}>{d.title} <span className="muted mono">{d.file}</span></li>)}</ul>
        </details>
      ))}
    </section>
  )
}
