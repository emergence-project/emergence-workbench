import { RESEARCH_TARGET, type JournalEntry } from '@rw/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { commentsApi, type CommentEntry, type ProjectInfo, type RecordFile, type ResearchApi, type ResearchSummary, type Topic } from './api'
import type { FlashAction } from './flash'
import { oldestFirst } from './homeData'
import { MemoList } from './memo'
import { reviewStatusLabel } from './reviewStatus'
import { askClaude, bumpPending, load, revealComment, usePendingTick } from './Comments'
import { RecordList } from './RecordList'
import { recordRoute } from './recordsPanelHelpers'
import { go } from './router'
import { needsJudgment } from './taskView'
import { isRecordFilter, parseWorkFilter, clearTodoFocus, peekTodoFocus, TODO_FOCUS_EVENT, WORK_FILTER_KEY, WORK_FILTERS, workRecordGroups, type WorkFilter } from './workRecords'
import { JournalRecordRow, WorkComposer } from './WorkRecordViews'
import { useJournal } from './useJournal'
import { JudgeList, TaskDialog, TaskList, TaskWeek, useTasks, type TaskDraft } from './WorkTasks'
import { t } from './i18n'

/** 메모·할 일 고치기·지우기 (10/4 피드백) */
function useJournalEdit(rapi: ResearchApi, reload: () => Promise<unknown>, onSaved: (m: string) => void) {
  return {
    onEdit: async (e: JournalEntry, text: string) => { await rapi.editJournal(e, text).catch((err: Error) => { onSaved(err.message); throw err }); await reload(); onSaved(t('고쳤습니다', 'Edited')) },
    onDelete: (e: JournalEntry) => { rapi.deleteJournal(e).then(reload).then(() => onSaved(t('지웠습니다', 'Deleted'))).catch((err: Error) => onSaved(err.message)) },
  }
}

export function useTitles(summary: ResearchSummary) {
  const byId = useMemo(() => new Map(summary.blocks.map((b) => [b.id, b])), [summary.blocks])
  return (id: string) => byId.get(id)?.title ?? id
}

/**
 * 작업: 위에 브리핑과 한 주 달력, 필터로 판단 · 맡긴 일 · 할 일 · 메모 · 질문을 골라 보고 적고, 아래 작업 일지는 날짜별로 유지한다.
 * 판단 · 맡긴 일은 에이전트에게 맡긴 일(10/7 작업 탭, WorkTasks.tsx)이다.
 */
export function WorkPage({ rid, rapi, summary, version, topics, onSaved, focus, firstPartOf, onOpenPdf }: {
  rid: string; rapi: ResearchApi; summary: ResearchSummary; version: number; topics: Topic[]; onSaved(message: string, action?: FlashAction): void; focus?: 'log'
  firstPartOf(target: string): string | undefined; onOpenPdf(file: RecordFile): boolean
}) {
  const { entries, loaded: journalLoaded, reload, toggle } = useJournal(rapi, version)
  const edit = useJournalEdit(rapi, reload, onSaved)
  const titleOf = useTitles(summary)
  const open = oldestFirst(entries.filter((e) => e.kind === 'todo' && !e.done))
  const past = entries.filter((e) => !(e.kind === 'todo' && !e.done))
  const [filter, setFilter] = useState<WorkFilter>(() => {
    try { return parseWorkFilter(localStorage.getItem(WORK_FILTER_KEY)) } catch { return '판단' }
  })
  const chooseFilter = (next: WorkFilter) => {
    setFilter(next)
    try { localStorage.setItem(WORK_FILTER_KEY, next) } catch { /* 저장할 수 없어도 거르기는 쓴다. */ }
  }
  // 첫 화면 작업 패널에서 누른 할 일: 할 일 필터로 바꾸고 그 항목으로 스크롤해 잠깐 표시한다.
  const [focusTodo, setFocusTodo] = useState<string | null>(() => peekTodoFocus())
  useEffect(() => {
    const take = () => { const key = peekTodoFocus(); if (key) { setFilter('할 일'); setFocusTodo(key) } }
    window.addEventListener(TODO_FOCUS_EVENT, take)
    return () => window.removeEventListener(TODO_FOCUS_EVENT, take)
  }, [])
  useEffect(() => {
    if (!focusTodo || filter !== '할 일') return
    const item = document.querySelector<HTMLElement>(`[data-ui="할 일"] [data-todo-key="${CSS.escape(focusTodo)}"]`)
    if (!item) return
    clearTodoFocus(focusTodo)
    item.scrollIntoView({ block: 'center' })
    item.classList.add('flash')
    const timer = setTimeout(() => { item.classList.remove('flash'); setFocusTodo(null) }, 1600)
    return () => clearTimeout(timer)
  }, [focusTodo, filter, entries])
  const { tasks, diagnostics, loaded: tasksLoaded, reload: reloadTasks } = useTasks(rid, version)
  const [dialog, setDialog] = useState<TaskDraft | null>(null)
  const judgeCount = tasks.filter(needsJudgment).length
  const tick = usePendingTick()
  const [records, setRecords] = useState<{ rid: string; version: number; tick: number; files: RecordFile[]; error: string | null } | null>(null)
  useEffect(() => {
    let current = true
    commentsApi(rid).records().then(({ files }) => {
      if (current) setRecords({ rid, version, tick, files, error: null })
    }).catch((e: Error) => {
      if (current) setRecords((previous) => ({ rid, version, tick, files: previous?.rid === rid ? previous.files : [], error: e.message }))
    })
    return () => { current = false }
  }, [rid, version, tick])
  const files = records?.rid === rid ? records.files : []
  const recordsLoaded = records?.rid === rid && records.version === version && records.tick === tick
  const recordsError = records?.rid === rid ? records.error : null
  const groups = workRecordGroups(files, entries, filter === '질문' ? '질문' : '메모')
  const count = filter === '판단' ? judgeCount : filter === '맡긴 일' ? tasks.length + new Set(diagnostics.map((d) => d.file)).size : filter === '할 일' ? open.length : groups.reduce((n, group) => n + group.items.length, 0)
  const openRecord = (file: RecordFile, entry: CommentEntry) => {
    if (!(entry.page && onOpenPdf(file))) {
      const route = recordRoute(rid, file, firstPartOf)
      if (route) go(route)
    }
    if (!entry.lost) revealComment(rid, file.target, entry.id)
  }
  const [projectResult, setProjectResult] = useState<{ rapi: ResearchApi; version: number; project: ProjectInfo | null } | null>(null)
  useEffect(() => {
    let current = true
    rapi.project().catch(() => null).then((project) => { if (current) setProjectResult({ rapi, version, project }) })
    return () => { current = false }
  }, [rapi, version])
  const project = projectResult?.rapi === rapi ? projectResult.project : null
  const projectLoaded = projectResult?.rapi === rapi && projectResult.version === version
  const reviews = project?.reviews.filter((r) => r.status !== 'accepted') ?? []
  const logRef = useRef<HTMLElement>(null)
  const scrolled = useRef(false)
  useEffect(() => { scrolled.current = false }, [rid, focus])
  // 화면이 보이고 일지 위의 프로젝트 작업·검토 목록까지 받은 뒤, 이 이동에서 한 번만 내려간다.
  useEffect(() => {
    if (focus !== 'log' || !journalLoaded || !projectLoaded || !tasksLoaded || ((filter === '메모' || filter === '질문') && !recordsLoaded) || scrolled.current || !logRef.current) return
    logRef.current.scrollIntoView({ block: 'start' })
    scrolled.current = true
  }, [rid, focus, journalLoaded, projectLoaded, tasksLoaded, filter, recordsLoaded])
  return (
    <div className="ws-doc" data-ui="할 일">
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <div className="segmented small" role="group" aria-label={t('작업 필터', 'Work filter')} data-ui="작업 거르기">
            {WORK_FILTERS.map((f) => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => chooseFilter(f)}>{FILTER_LABEL[f]}
              {f === '판단' && judgeCount > 0 && <span className="tk-cnt turn">{judgeCount}</span>}</button>)}
          </div>
          <span className="crumb muted" title={filter === '할 일' ? t('남은 할 일', 'Open to-dos') : FILTER_LABEL[filter]}>{t(`${count}개`, String(count))}</span>
          <span className="sp" />
          <button className="btn" data-ui="맡기기" title={t('에이전트에게 일을 맡깁니다: 작업 내용과 종결 조건을 적으면 작업 파일이 생깁니다', 'Delegate work to an agent: write the task and its completion criteria to create a task file')} onClick={() => setDialog({})}>＋ {t('맡기기', 'Delegate')}</button>
        </div>
        <div className="memo-list work-page">
          <TaskWeek rid={rid} tasks={tasks} entries={entries} />
          {filter === '판단' ? <JudgeList rid={rid} tasks={tasks} loaded={tasksLoaded} onSaved={onSaved} reload={reloadTasks}
            onEditProposal={(t) => setDialog({ mode: 'proposal', from: t, endCondition: t.proposal?.endCondition.length === 1 ? t.proposal.endCondition[0] : (t.proposal?.endCondition ?? []).map((c, i) => `${i + 1}) ${c}`).join('\n') })}>
            {reviews.length > 0 && <Reviews list={reviews} />}
          </JudgeList>
          : filter === '맡긴 일' ? <TaskList rid={rid} tasks={tasks} diagnostics={diagnostics} loaded={tasksLoaded} />
          : filter === '할 일' ? <>
          <div className="work-h" title={t('체크하면 작업 일지로 갑니다 · 글 앞에 "10/20까지 —"처럼 날짜를 쓰면 마감', 'Checked items move to the work journal · Start with a date like "10/20까지 —" to set a deadline')}>{t('할 일', 'To-do')}</div>
          {project?.tasks && project.tasks.rows.length > 0 && <ProjectTasks t={project.tasks} />}
          {project?.tasks && <div className="todo-sec-h" title="workbench/log/">{t('앱 할 일', 'App to-dos')}</div>}
          <MemoList entries={open} rid={rid} titleOf={titleOf} onToggle={toggle} {...edit} hideTodoKind empty={t('남은 할 일이 없습니다.', 'No open to-dos.')} />
          </> : <div className="work-records" data-ui="작업 기록 목록">
            {recordsError && <div className="banner danger" role="alert">{recordsError}</div>}
            {!count && <p className="muted records-empty">{!recordsLoaded || !journalLoaded ? t('불러오는 중…', 'Loading…') : recordsError ? t('기록을 불러오지 못했습니다.', 'Could not load records.') : t(`아직 ${filter === '질문' ? '질문이' : '메모가'} 없습니다. 노트에서 글을 골라 적거나 아래에 적어 보세요.`, `No ${filter === '질문' ? 'questions' : 'memos'} yet. Select text in a note to write one, or write below.`)}</p>}
            {groups.map((group) => <div className="record-group" key={group.target}>
              {group.items.map((item) => item.kind === 'record'
                ? <RecordList key={`${item.file.target}/${item.entry.id}`} rid={rid} file={item.file} filter={filter} items={[item.entry]} work onGo={(c) => openRecord(item.file, c)} />
                : <JournalRecordRow key={`journal/${item.entry.date}/${item.entry.index}`} entry={item.entry} rid={rid} titleOf={titleOf} rapi={rapi} reload={reload} onSaved={onSaved} />)}
            </div>)}
          </div>}
          {isRecordFilter(filter) && <WorkComposer key={rid} filter={filter} onSave={async (kind, text) => {
            if (kind === '할 일') {
              await rapi.addJournal('todo', text, RESEARCH_TARGET); await reload()
            } else {
              const result = await commentsApi(rid).add('project', { kind, title: summary.research.title, text })
              await load(rid, 'project', true); bumpPending()
              if (kind === '질문') void askClaude(rid, 'project', result.entry.id)
            }
            onSaved(t(`${kind} 저장됨`, `${FILTER_LABEL[kind]} saved`))
          }} />}
          <section ref={logRef} className="work-log" data-ui="기록">
            <div className="work-h" title={t('끝낸 할 일, 상태 변화, 메모 · workbench/log/', 'Finished to-dos, status changes, memos · workbench/log/')}>{t('작업 일지', 'Work journal')}</div>
            <MemoList entries={past} rid={rid} titleOf={titleOf} onToggle={toggle} {...edit}
              empty={t('아직 기록이 없습니다. 할 일을 끝내거나 노트의 상태를 바꾸면 여기에 쌓입니다.', 'No records yet. Finishing a to-do or changing a note status adds one here.')} />
          </section>
        </div>
      </section>
      {dialog && <TaskDialog rid={rid} topics={topics} draft={dialog} onClose={() => setDialog(null)} onSaved={onSaved} reload={reloadTasks} />}
    </div>
  )
}

/** 필터 이름 (값은 한국어 그대로 저장한다) */
const FILTER_LABEL: Record<WorkFilter, string> = { '판단': t('판단', 'To decide'), '맡긴 일': t('맡긴 일', 'Delegated'), '할 일': t('할 일', 'To-do'), '메모': t('메모', 'Memo'), '질문': t('질문', 'Question') }

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

/** 검토 상태가 accepted가 아닌 문서 (research.yaml sources.reviews) */
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
