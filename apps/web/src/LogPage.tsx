import { awaitsUserReview, type JournalEntry } from '@rw/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type CommentEntry, type ProjectInfo, type RecordFile, type ResearchApi, type ResearchSummary, type Topic } from './api'
import type { FlashAction } from './flash'
import { MemoList } from './memo'
import { reviewStatusLabel } from './reviewStatus'
import { askClaude, revealComment } from './Comments'
import { recordWrites } from './useRecordActions'
import { RecordList } from './RecordList'
import { recordRoute } from './recordsPanelHelpers'
import { go } from './router'
import { openFlowDot } from './FlowView'
import { useFlow } from './flow/data'
import { JudgeQueue, judgeTurns } from './flow/JudgeQueue'
import { threadCounts } from './flow/threadModel'
import { needsJudgment, openTaskId, taskRowKey } from './taskView'
import { agentTurnRecords, isRecordFilter, openTodoRecords, parseWorkFilter, clearTodoFocus, peekTodoFocus, RECORD_VIEWS, SECTION_FILTERS, TODO_FOCUS_EVENT, todoKey, userTurnRecords, WORK_FILTER_EVENT, WORK_FILTER_KEY, WORK_FILTER_LABEL, workRecordGroups, type FlatRecord, type RecordFilter, type RecordView, type WorkFilter } from './workRecords'
import { EditReviewRow, TurnRecordRow } from './RecordTurns'
import { JournalRecordRow, WorkComposer } from './WorkRecordViews'
import { useAgentEdits, useJournal, useProjectInfo, useRecords } from './projectQueries'
import { JudgeList, TaskDialog, TaskList, TaskWeek, useTasks, type TaskDraft } from './WorkTasks'
import { t } from './i18n'
import { PendingRecords } from './RecordsPublish'

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
 * 기록 화면 (10/21 사용자 결정 "작업 탭을 기록 안으로", 시안 10/21 17:48 · 달력 안 B):
 * 위 고르기로 내 차례 · 에이전트 차례 · 모두를 본다. 원본은 그대로다(기록 = workbench/comments, 맡긴 일 = workbench/tasks, 일지 = workbench/log).
 * - 내 차례: 한 주 달력, 그 아래 한 줄씩 판단(맡긴 일 결과) → 에이전트가 물은 질문 · 지시 → 검토 대기 문서 → 수정 검토 → 할 일. 누르면 그 줄만 펼친다.
 * - 에이전트 차례: 진행 · 멈춤인 맡긴 일, 내가 쓴 질문 · 지시가 대기.
 * - 모두: 종류(메모 · 할 일 · 질문 · 지시 · 맡긴 일)로 거르고 적는다. 끝낸 것과 작업 일지는 맨 아래에 접어 둔다.
 * 옛 작업 탭 주소(#/…/todo, #/…/log)도 이 화면을 연다.
 */
export function WorkPage({ rid, rapi, summary, topics, onSaved, focus, firstPartOf, onOpenPdf, version = 0 }: {
  rid: string; rapi: ResearchApi; summary: ResearchSummary; topics: Topic[]; onSaved(message: string, action?: FlashAction): void
  /** log: 옛 작업 일지 주소. 모두를 열고 작업 일지를 펼쳐 그 자리로 내려간다 */
  focus?: 'log'
  firstPartOf(target: string): string | undefined; onOpenPdf(file: RecordFile): boolean
  /** 파일 알림마다 오른다: 안 올린 기록 줄이 다시 읽는다 */
  version?: number
}) {
  const { entries, loaded: journalLoaded, reload, toggle } = useJournal(rapi)
  const edit = useJournalEdit(rapi, reload, onSaved)
  const titleOf = useTitles(summary)
  // 할 일의 정본은 기록 파일이다 (2026-10-16). 일지에는 끝낸 일 · 상태 · 메모 (예전 일지의 끝낸 할 일 포함)
  const past = entries.filter((e) => !(e.kind === 'todo' && !e.done))
  // 처음 열면 내 차례 (오른쪽 사이드바 "모두 보기"와 첫 화면 할 일은 모두로 연다)
  const [view, setView] = useState<RecordView>(() => focus === 'log' || peekTodoFocus() ? 'all' : 'mine')
  const [filter, setFilter] = useState<WorkFilter>(() => {
    try { return parseWorkFilter(localStorage.getItem(WORK_FILTER_KEY.records), 'records') } catch { return '메모' }
  })
  const chooseFilter = (next: WorkFilter) => {
    setFilter(next)
    try { localStorage.setItem(WORK_FILTER_KEY.records, next) } catch { /* 저장할 수 없어도 거르기는 쓴다. */ }
  }
  // 오른쪽 사이드바 기록의 "모두 보기"가 고른 필터
  useEffect(() => {
    const take = (e: Event) => { setView('all'); setFilter(parseWorkFilter((e as CustomEvent<string>).detail, 'records')) }
    window.addEventListener(WORK_FILTER_EVENT, take)
    return () => window.removeEventListener(WORK_FILTER_EVENT, take)
  }, [])
  // 첫 화면 작업 패널에서 누른 할 일: 모두 › 할 일로 바꾸고 그 항목으로 스크롤해 잠깐 표시한다.
  const [focusTodo, setFocusTodo] = useState<string | null>(() => peekTodoFocus())
  useEffect(() => {
    const take = () => { const key = peekTodoFocus(); if (key) { setView('all'); setFilter('할 일'); setFocusTodo(key) } }
    window.addEventListener(TODO_FOCUS_EVENT, take)
    return () => window.removeEventListener(TODO_FOCUS_EVENT, take)
  }, [])
  const { tasks, diagnostics, loaded: tasksLoaded, error: tasksError, reload: reloadTasks } = useTasks(rid)
  const [dialog, setDialog] = useState<TaskDraft | null>(null)
  const flow = useFlow(rid).scan
  const flowTurns = flow ? judgeTurns(flow.nodes) : { queued: [], ready: [] }
  const judgeCount = tasks.filter(needsJudgment).length + flowTurns.queued.length + flowTurns.ready.length
  const recordsQuery = useRecords(rid)
  const files = recordsQuery.data?.files ?? NO_FILES
  useEffect(() => {
    if (!focusTodo || view !== 'all' || filter !== '할 일') return
    const item = document.querySelector<HTMLElement>(`[data-ui="할 일"] [data-todo-key="${CSS.escape(focusTodo)}"]`)
    if (!item) return
    clearTodoFocus(focusTodo)
    item.scrollIntoView({ block: 'center' })
    item.classList.add('flash')
    const timer = setTimeout(() => { item.classList.remove('flash'); setFocusTodo(null) }, 1600)
    return () => clearTimeout(timer)
  }, [focusTodo, view, filter, files])
  const recordsLoaded = recordsQuery.isFetched && !recordsQuery.isFetching
  const recordsError = recordsQuery.error?.message ?? null
  const groups = workRecordGroups(files, entries, filter === '전체' || filter === '질문' || filter === '지시' || filter === '할 일' ? filter : '메모')
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
  const edits = useAgentEdits(rid).data
  const editCount = edits ? edits.reviews.length + edits.attempts.length : 0
  const askRecords = userTurnRecords(files)
  const todoRecords = openTodoRecords(files)
  const agentRecords = agentTurnRecords(files)
  const agentTasks = tasks.filter((x) => x.state === 'working' || x.state === 'paused')
  const mineCount = judgeCount + askRecords.length + reviews.length + editCount + todoRecords.length
  const agentCount = agentTasks.length + agentRecords.length
  const count = filter === '맡긴 일' ? tasks.length + new Set(diagnostics.map((d) => d.file)).size : groups.reduce((n, group) => n + group.items.length, 0)
  // 내 차례 · 에이전트 차례에서 펼친 줄 하나 (판단 카드와 기록 줄이 함께 쓴다)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const toggleRow = (key: string) => setOpenRow((k) => k === key ? null : key)
  const recordRow = (item: FlatRecord, turn: boolean) => {
    const key = `${item.file.target}/${item.entry.id}`
    return <TurnRecordRow key={key} rid={rid} item={item} turn={turn} open={openRow === key} onToggle={() => toggleRow(key)} onGo={openRecord} />
  }
  const logRef = useRef<HTMLDetailsElement>(null)
  const scrolled = useRef(false)
  useEffect(() => { scrolled.current = false }, [rid, focus])
  // 옛 작업 일지 주소: 화면과 목록을 받은 뒤, 이 이동에서 한 번만 작업 일지를 펼쳐 내려간다.
  useEffect(() => {
    if (focus !== 'log' || !journalLoaded || !projectLoaded || !tasksLoaded || scrolled.current || !logRef.current) return
    logRef.current.open = true
    logRef.current.scrollIntoView({ block: 'start' })
    scrolled.current = true
  }, [rid, focus, journalLoaded, projectLoaded, tasksLoaded, view])
  const loading = !recordsLoaded || !tasksLoaded
  return (
    <div className="ws-doc" data-ui="기록 화면">
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <div className="segmented small" role="group" aria-label={t('기록 보기', 'Records view')} data-ui="기록 차례">
            {RECORD_VIEWS.map((v) => <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => { setView(v); setOpenRow(null) }}>
              {v === 'mine' ? t('내 차례', 'Your turn') : v === 'agent' ? t('에이전트 차례', "Agents' turn") : t('모두', 'All')}
              {v === 'mine' && mineCount > 0 && <span className={judgeCount + askRecords.length + reviews.length + editCount > 0 ? 'rail-count tk-turn' : 'tk-cnt'}>{mineCount}</span>}
              {v === 'agent' && agentCount > 0 && <span className="tk-cnt">{agentCount}</span>}</button>)}
          </div>
          <span className="sp" />
          <button className="btn" data-ui="맡기기" title={t('에이전트에게 일을 맡깁니다: 작업 내용과 종결 조건을 적으면 작업 파일이 생깁니다', 'Delegate work to an agent: write the task and its completion criteria to create a task file')} onClick={() => setDialog({})}>＋ {t('맡기기', 'Delegate')}</button>
        </div>
        <PendingRecords rid={rid} />
        <div className="memo-list work-page">
          {recordsError && <div className="banner danger" role="alert">{recordsError}</div>}
          {view === 'mine' && <>
            <TaskWeek rid={rid} tasks={tasks} entries={entries} todos={summary.todos} />
            <div className="tk-list" data-ui="내 차례 목록">
              {flow && <JudgeQueue rid={rid} nodes={flow.nodes} threads={threadCounts(files)} />}
              <JudgeList rid={rid} tasks={tasks} loaded={tasksLoaded} onSaved={onSaved} reload={reloadTasks} emptyText={null} openId={openTaskId(openRow)} onToggle={(id) => toggleRow(taskRowKey(id))}
                onEditProposal={(x) => setDialog({ mode: 'proposal', from: x, endCondition: x.proposal?.endCondition.length === 1 ? x.proposal.endCondition[0] : (x.proposal?.endCondition ?? []).map((c, i) => `${i + 1}) ${c}`).join('\n') })} />
              {askRecords.map((item) => recordRow(item, true))}
              {reviews.length > 0 && <Reviews list={reviews} />}
              {editCount > 0 && <EditReviewRow rid={rid} count={editCount} />}
              {todoRecords.map((item) => recordRow(item, false))}
              {!mineCount && <p className="empty tk-empty">{loading ? t('불러오는 중…', 'Loading…') : t('지금 내 차례인 것이 없습니다. 맡긴 일의 결과, 에이전트의 질문, 할 일이 생기면 여기에 보입니다.', 'Nothing is waiting for you. Results of delegated tasks, agent questions and to-dos show up here.')}</p>}
            </div>
          </>}
          {view === 'agent' && <div className="tk-list" data-ui="에이전트 차례 목록">
            {agentTasks.length > 0 && <TaskList rid={rid} tasks={agentTasks} loaded={tasksLoaded} error={tasksError} diagnostics={diagnostics} />}
            {agentRecords.map((item) => recordRow(item, false))}
            {!agentCount && <p className="empty tk-empty">{loading ? t('불러오는 중…', 'Loading…') : t('에이전트가 맡은 것이 없습니다. 질문 · 지시를 적거나 일을 맡기면 여기에 보입니다.', 'Agents have nothing in hand. Questions, instructions and delegated tasks show up here.')}</p>}
          </div>}
          {view === 'all' && <>
            <div className="work-all-head">
              <div className="segmented small" role="group" aria-label={t('기록 필터', 'Records filter')} data-ui="기록 거르기">
                {SECTION_FILTERS.records.map((f) => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => chooseFilter(f)}>{WORK_FILTER_LABEL[f]}</button>)}
              </div>
              <span className="crumb muted" title={filter === '할 일' ? t('남은 할 일', 'Open to-dos') : WORK_FILTER_LABEL[filter]}>{t(`${count}개`, String(count))}</span>
            </div>
            {filter === '맡긴 일' ? <TaskList rid={rid} tasks={tasks} diagnostics={diagnostics} loaded={tasksLoaded} error={tasksError} />
            : <>
              {filter === '할 일' && project?.tasks && project.tasks.rows.length > 0 && <>
                <ProjectTasks t={project.tasks} />
                <div className="todo-sec-h" title="workbench/comments/">{t('앱 할 일', 'App to-dos')}</div>
              </>}
              <div className="work-records" data-ui={filter === '할 일' ? '할 일' : '작업 기록 목록'}>
                {!count && <p className="empty records-empty">{!recordsLoaded || !journalLoaded ? t('불러오는 중…', 'Loading…') : recordsError ? t('기록을 불러오지 못했습니다.', 'Could not load records.') : filter === '할 일' ? t('남은 할 일이 없습니다.', 'No open to-dos.') : filter === '전체' ? t('아직 기록이 없습니다. 노트에서 글을 골라 적거나 오른쪽 사이드바 기록에 적어 보세요.', 'No records yet. Select text in a note, or write in the right sidebar Records.') : t(`아직 ${filter === '질문' ? '질문이' : filter === '지시' ? '지시가' : '메모가'} 없습니다. 노트에서 글을 골라 적거나 아래에 적어 보세요.`, `No ${filter === '질문' ? 'questions' : filter === '지시' ? 'instructions' : 'memos'} yet. Select text in a note to write one, or write below.`)}</p>}
                {groups.map((group) => <div className="record-group" key={group.target}>
                  {group.items.map((item) => item.kind === 'record'
                    ? <div key={`${item.file.target}/${item.entry.id}`} data-todo-key={todoKey({ target: item.file.target, id: item.entry.id })}><RecordList rid={rid} file={item.file} filter={filter as RecordFilter | '전체'} items={[item.entry]} work onGo={(c) => openRecord(item.file, c)} /></div>
                    : <JournalRecordRow key={`journal/${item.entry.date}/${item.entry.index}`} entry={item.entry} rid={rid} titleOf={titleOf} rapi={rapi} reload={reload} onSaved={onSaved} />)}
                </div>)}
              </div>
              {isRecordFilter(filter) && <WorkComposer key={rid} filter={filter} onSave={async (kind, text) => {
                const result = await recordWrites(rid).add('project', { kind, title: summary.research.title, text })
                if (kind === '질문') void askClaude(rid, 'project', result.entry.id)
                onSaved(t(`${kind} 저장됨`, `${WORK_FILTER_LABEL[kind]} saved`))
              }} />}
            </>}
            <details ref={logRef} className="work-log" data-ui="기록">
              <summary className="work-h" title={t('끝낸 할 일, 상태 변화, 메모 · workbench/log/ (읽기만 해도 됩니다)', 'Finished to-dos, status changes, memos · workbench/log/')}>{t('작업 일지', 'Work journal')} <span className="muted">{t(`끝낸 것 · 상태 변화 ${past.length}`, `Done · status changes ${past.length}`)}</span></summary>
              <MemoList entries={past} rid={rid} titleOf={titleOf} onToggle={toggle} {...edit}
                empty={t('아직 기록이 없습니다. 할 일을 끝내거나 노트의 상태를 바꾸면 여기에 쌓입니다.', 'No records yet. Finishing a to-do or changing a note status adds one here.')} />
            </details>
          </>}
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
