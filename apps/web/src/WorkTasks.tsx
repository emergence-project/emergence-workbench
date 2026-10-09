import type { JournalEntry } from '@rw/core'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConflictError, taskRules, tasksApi, type NewTask, type Task, type TaskDiagnostic, type Topic, type Verdict } from './api'
import { Dialog } from './dialogs'
import type { FlashAction } from './flash'
import { localDate } from './format'
import { shortDate, WEEK_DAYS, weekStartOf } from './homeData'
import { Icon } from './icons'
import { go } from './router'
import { StatusDot } from './StatusDot'
import {
  agentName, agentPrompt, briefCounts, cardAsks, cardConclusion, judgeOrder, TASK_DOT, TASK_GROUPS, TASK_STATE_LABEL, taskLine, taskTiming, weekItems,
  taskTitles, type WeekItem, type WeekMark,
} from './taskView'
import { t } from './i18n'

/**
 * 작업 탭의 맡긴 일 (10/7 사용자 결정, 시안 v31): 브리핑 · 한 주 달력, 판단 카드, 맡긴 일 목록, 맡기기 창.
 * 보고서 한 장은 TaskReport.tsx. 파일 형식과 규칙: docs/agent-delegated-work.md
 */

/** 이 프로젝트의 맡긴 일. 파일이 바뀌면(version) 다시 읽는다 */
export function useTasks(rid: string, version: number) {
  const [state, setState] = useState<{ rid: string; version: number; tasks: Task[]; diagnostics: TaskDiagnostic[] } | null>(null)
  const reload = () => tasksApi(rid).scan().then(({ tasks, diagnostics }) => { for (const x of tasks) taskTitles.set(x.id, x.title); setState({ rid, version, tasks, diagnostics }) }).catch(() => setState((s) => s?.rid === rid ? { ...s, version } : { rid, version, tasks: [], diagnostics: [] }))
  useEffect(() => { void reload() }, [rid, version]) // eslint-disable-line react-hooks/exhaustive-deps
  return { tasks: state?.rid === rid ? state.tasks : [], diagnostics: state?.rid === rid ? state.diagnostics : [], loaded: state?.rid === rid && state.version === version, reload }
}

type Saved = (m: string, action?: FlashAction) => void

/**
 * 에이전트를 깨우는 말을 복사한다 (10/7): 맡긴 뒤 · 종결 조건 승인 뒤 · 수정 요청 뒤 알림의 버튼, 보고서 ⋯ 메뉴.
 * 실행은 앱 밖이므로 사용자가 그 프로젝트 폴더의 Claude Code나 Codex에 붙여 넣는다.
 */
export function copyAgentPrompt(file: string, onSaved: Saved) {
  const text = agentPrompt(file, taskRules.doc)
  const failed = () => onSaved(t(`복사하지 못했습니다. 이 말을 에이전트에게 주세요: ${text}`, `Could not copy. Give this to the agent: ${text}`))
  try {
    navigator.clipboard.writeText(text).then(() => onSaved(t('복사했습니다. 그 프로젝트 폴더의 Claude Code나 Codex에 붙여 넣으세요', "Copied. Paste it into Claude Code or Codex in that project's folder")), failed)
  } catch { failed() }
}
export const agentAction = (file: string, onSaved: Saved): FlashAction => ({ label: t('에이전트에게 줄 말 복사', 'Copy prompt for agent'), run: () => copyAgentPrompt(file, onSaved) })

/** 판단 하나를 보내고, 다른 곳에서 파일이 바뀌었으면 다시 읽으라고 알린다. 에이전트가 이어서 할 판단(종결 조건 승인 · 수정)이면 깨울 말 복사를 붙인다 */
export async function sendJudgment(rid: string, tk: Task, verdict: Verdict, extra: { note?: string; seconds?: number; endCondition?: string }, onSaved: Saved, reload: () => unknown) {
  try {
    await tasksApi(rid).judge(tk.id, { verdict, ...extra, baseHash: tk.hash })
    const wake = verdict === 'send-back' || (verdict === 'approve' && tk.state === 'proposed') ? agentAction(tk.file, onSaved) : undefined
    onSaved(verdict === 'approve' ? (tk.state === 'proposed' ? t('종결 조건을 승인했습니다', 'Approved the completion criteria') : t('승인했습니다', 'Approved')) : verdict === 'send-back' ? t('수정으로 돌려보냈습니다', 'Sent back to revise') : verdict === 'pause' ? t('멈춤으로 두었습니다', 'Set to blocked') : t('폐기했습니다', 'Dropped'), wake)
  } catch (e) {
    onSaved(e instanceof ConflictError ? t('에이전트가 파일을 고쳤습니다. 새 내용을 보고 다시 판단하세요', 'The agent edited the file. Read the new content and decide again') : (e as Error).message)
  }
  await reload()
}

/** 판단 버튼: 승인 · 수정 (동그라미 둘, 10/9 피드백과 같은 이름). 수정은 고칠 것 한 줄을 받는다. data-ui는 예전 이름 그대로 */
export function JudgeButtons({ onApprove, onSendBack, approveTip = t('승인', 'Approve') }: { onApprove(): void; onSendBack(): void; approveTip?: string }) {
  return <>
    <button className="icon-btn" data-ui="승인" data-tip={approveTip} aria-label={approveTip} onClick={onApprove}>{Icon.approve}</button>
    <button className="icon-btn" data-ui="수정 요청" data-tip={t('수정', 'Revise')} aria-label={t('수정', 'Revise')} onClick={onSendBack}>{Icon.sendBack}</button>
  </>
}

/** ⋯ 메뉴: 멈춤으로 두기 · 폐기 (상태 바꾸기) */
export function TaskMoreMenu({ items }: { items: { label: string; dot?: 'blocked' | 'stopped'; onClick(): void }[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <span className="tk-more" ref={box}>
      <button className={`icon-btn${open ? ' on' : ''}`} data-ui="더 보기 메뉴" data-tip={t('더 보기', 'More')} aria-label={t('더 보기', 'More')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{Icon.more}</button>
      {open && <div className="menu tk-menu" role="menu" data-ui="더 보기 항목">
        {items.map((it) => <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onClick() }}>{it.dot && <span className={`g ${it.dot}`} aria-hidden />}{it.label}</button>)}
      </div>}
    </span>
  )
}

/** 수정할 것 한 줄 */
export function SendBackRow({ onSend, onCancel }: { onSend(note: string): void; onCancel(): void }) {
  const [note, setNote] = useState('')
  return (
    <form className="tk-return" data-ui="수정 요청 입력란" onSubmit={(e) => { e.preventDefault(); if (note.trim()) onSend(note.trim()) }}>
      <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        placeholder={t('무엇을 고칠지 한 줄 (그만둘 일이면 "하지 마")', 'What to change, in one line ("don\'t do it" to stop the task)')} aria-label={t('수정할 내용', 'What to revise')} />
      <button className="btn" type="submit" disabled={!note.trim()}>{t('수정', 'Revise')}</button>
      <button className="icon-btn" type="button" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={onCancel}>{Icon.x}</button>
    </form>
  )
}

/** 번호 목록. 하나뿐이면 번호 없이 */
function Items({ list, empty }: { list: ReactNode[]; empty?: string }) {
  if (!list.length) return <p className="tk-none">{empty ?? t('없음', 'None')}</p>
  return <ol className={list.length === 1 ? 'one' : undefined}>{list.map((x, i) => <li key={i}>{x}</li>)}</ol>
}

/**
 * 판단 카드 (시안 v31): 접힌 줄 = 상태 점 · 제목 · 에이전트 · 시작 시각 · 작업 시간(끝 시각은 툴팁).
 * 펼치면 결론 · 작업 내용, 그 아래 왼쪽 사용자 확인 요청 | 오른쪽 남은 문제. 판단에 쓴 시간은 펼친 때부터 잰다(보이지 않음).
 */
export function TaskCard({ rid, task: tk, open, onToggle, onSaved, reload, onEditProposal }: {
  rid: string; task: Task; open: boolean; onToggle(): void; onSaved: Saved; reload(): unknown; onEditProposal(t: Task): void
}) {
  const opened = useRef<number | null>(null)
  if (open && opened.current === null) opened.current = Date.now()
  if (!open) opened.current = null
  const seconds = () => (opened.current === null ? undefined : (Date.now() - opened.current) / 1000)
  const [sendBack, setSendBack] = useState(false)
  const judge = (verdict: Verdict, note?: string) => sendJudgment(rid, tk, verdict, { note, seconds: seconds() }, onSaved, reload)
  const timing = taskTiming(tk)
  const proposed = tk.state === 'proposed'
  return (
    <article className={`tk${open ? ' open' : ''}`} data-ui="판단 카드" data-ui-item={tk.id}>
      <button className="tk-row" aria-expanded={open} onClick={onToggle}>
        <StatusDot s={TASK_DOT[tk.state]} name={TASK_STATE_LABEL[tk.state]} />
        <span className="tk-title">{tk.title}</span>
        <span className="tk-meta"><span>{agentName(tk.agent)}</span><span title={timing.tip}>{timing.text}</span></span>
        <span className="tk-chev" aria-hidden />
      </button>
      {open && <div className="tk-open">
        <dl className="tk-kv">
          <dt>{t('결론', 'Conclusion')}</dt><dd className="tk-concl">{cardConclusion(tk) || <span className="tk-none">{t('아직 없음', 'None yet')}</span>}</dd>
          <dt>{t('작업 내용', 'Task')}</dt><dd>{tk.task}</dd>
        </dl>
        <div className="tk-2col">
          <div><div className="tk-h turn">{t('사용자 확인 요청', 'Asks for you')}</div><Items list={cardAsks(tk).map((a) => a.q)} /></div>
          <div><div className="tk-h">{t('남은 문제', 'Open issues')}</div><Items list={tk.issues.map((x) => x.text)} /></div>
        </div>
        <div className="tk-actions">
          {proposed
            ? <button className="btn" data-ui="고쳐서 승인" onClick={() => onEditProposal(tk)}>{Icon.pencil}{t('고쳐서 승인', 'Edit and approve')}</button>
            : <button className="btn" data-ui="보고서 열기" onClick={() => go({ page: 'task', rid, task: tk.id })}>{t('보고서 열기', 'Open report')}</button>}
          <span className="sp" />
          <JudgeButtons approveTip={proposed ? t('승인: 이 종결 조건으로 시작', 'Approve: start with these completion criteria') : t('승인', 'Approve')} onApprove={() => void judge('approve')} onSendBack={() => setSendBack(true)} />
          <TaskMoreMenu items={[{ label: t('멈춤으로 두기', 'Set to blocked'), dot: 'blocked', onClick: () => void judge('pause') }, { label: t('폐기', 'Drop'), dot: 'stopped', onClick: () => void judge('discard') }]} />
        </div>
        {sendBack && <SendBackRow onCancel={() => setSendBack(false)} onSend={(note) => { setSendBack(false); void judge('send-back', note) }} />}
      </div>}
    </article>
  )
}

/** 판단: 사용자 차례인 맡긴 일 (오래 기다린 것부터). 첫 카드는 펼쳐 둔다 */
export function JudgeList({ rid, tasks, loaded, onSaved, reload, onEditProposal, children }: {
  rid: string; tasks: Task[]; loaded: boolean; onSaved: Saved; reload(): unknown; onEditProposal(t: Task): void; children?: ReactNode
}) {
  const list = judgeOrder(tasks)
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)
  const shown = openId === undefined ? list[0]?.id ?? null : openId
  return (
    <div className="tk-list" data-ui="판단 목록">
      {list.map((t) => <TaskCard key={t.id} rid={rid} task={t} open={shown === t.id} onToggle={() => setOpenId(shown === t.id ? null : t.id)} onSaved={onSaved} reload={reload} onEditProposal={onEditProposal} />)}
      {!list.length && <p className="muted tk-empty">{loaded ? t('판단할 것이 없습니다. 맡긴 일의 결과가 오면 여기에 보입니다.', 'Nothing to decide. Results of delegated tasks show up here.') : t('불러오는 중…', 'Loading…')}</p>}
      {children}
    </div>
  )
}

/** 끝난 일은 처음에 이만큼만 */
const CLOSED_SHOWN = 5

/** 맡긴 일: 판단 대기 · 진행 · 멈춤 · 해결 · 폐기로 묶은 목록. 줄을 누르면 보고서 */
export function TaskList({ rid, tasks, loaded, diagnostics = [] }: { rid: string; tasks: Task[]; loaded: boolean; diagnostics?: TaskDiagnostic[] }) {
  const [all, setAll] = useState(false)
  if (!tasks.length && !diagnostics.length) return <p className="muted tk-empty">{loaded ? t('맡긴 일이 없습니다. 오른쪽 위 "맡기기"로 에이전트에게 일을 맡겨 보세요.', 'No delegated tasks. Use "Delegate" at the top right to give an agent a task.') : t('불러오는 중…', 'Loading…')}</p>
  return (
    <div className="tk-groups" data-ui="맡긴 일 목록">
      {diagnostics.length > 0 && <div className="banner danger" role="alert" data-ui="작업 파일 오류">
        <div><strong>{t('작업 파일 오류', 'Task file errors')} {diagnostics.length}</strong>
          {diagnostics.map((d, i) => <div key={`${d.file}:${d.line}:${i}`}><code>{d.file}:{d.line}{d.column ? `:${d.column}` : ''}</code> · {d.message}</div>)}
        </div>
      </div>}
      {TASK_GROUPS.map((g) => {
        const rows = tasks.filter((t) => (g.states as readonly string[]).includes(t.state))
        if (!rows.length) return null
        const shown = g.key === 'closed' && !all ? rows.slice(0, CLOSED_SHOWN) : rows
        return <section key={g.key} className="tk-group">
          <div className="tk-group-h">{g.title} <span className={`tk-cnt${g.key === 'judge' ? ' turn' : ''}`}>{rows.length}</span></div>
          <div className="tk-table">
            {shown.map((t) => (
              <button key={t.id} className="tk-line" data-ui="맡긴 일 줄" data-ui-item={t.id} onClick={() => go({ page: 'task', rid, task: t.id })} title={`${TASK_STATE_LABEL[t.state]} · ${t.file}`}>
                <StatusDot s={TASK_DOT[t.state]} name={TASK_STATE_LABEL[t.state]} />
                <span className="tk-line-t">{t.title}</span>
                <span className="tk-line-c">{taskLine(t)}</span>
                <span className="tk-line-m">{agentName(t.agent)} · {shortDate(t.created.slice(0, 10))}</span>
              </button>
            ))}
            {shown.length < rows.length && <div className="tk-line-more"><button className="a" onClick={() => setAll(true)}>{t(`지난 작업 ${rows.length - shown.length}개 더 보기`, `Show ${rows.length - shown.length} more past tasks`)}</button></div>}
          </div>
        </section>
      })}
    </div>
  )
}

/** 하루 칸에 보일 항목 수. 나머지는 "외 N개" (홈 달력과 같은 규칙) */
const SHOWN = 3
const MARK: Record<WeekMark, string> = { given: '↘', result: '', returned: '↗', done: '✓', memo: '·', status: '⇄', due: '⚑' }
function Mark({ m }: { m: WeekMark }) {
  return m === 'result' ? <span className="g blocked" aria-hidden /> : <i aria-hidden>{MARK[m]}</i>
}

/**
 * 브리핑 한 줄과 이 프로젝트의 한 주 달력 (시안: 맡김 · 결과 도착(사용자 차례) · 끝낸 할 일 · 메모 · 마감).
 * 날짜를 누르면 그날 항목을 아래에 모두 펼친다.
 */
export function TaskWeek({ rid, tasks, entries, now = new Date() }: { rid: string; tasks: Task[]; entries: JournalEntry[]; now?: Date }) {
  const [start, setStart] = useState(() => weekStartOf(now))
  const [picked, setPicked] = useState<string | null>(null)
  const today = localDate(now)
  const days = Array.from({ length: 7 }, (_, i) => localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  const shift = (n: number) => { setPicked(null); setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + n * 7)) }
  const byDay = weekItems(tasks, entries)
  const itemsOn = (iso: string) => (byDay.get(iso) ?? []).filter((x) => (x.mark === 'due' ? iso >= today : iso <= today))
  const thisWeek = Array.from({ length: 7 }, (_, i) => localDate(new Date(weekStartOf(now).getFullYear(), weekStartOf(now).getMonth(), weekStartOf(now).getDate() + i)))
  const c = briefCounts(tasks, thisWeek.filter((d) => d >= today), byDay)
  const lastDays = c.lastResult === null ? null : Math.max(0, Math.floor((now.getTime() - c.lastResult) / 86_400_000))
  const openItem = (x: WeekItem) => { if (x.task) go({ page: 'task', rid, task: x.task }) }
  return (
    <section className="tk-week" data-ui="작업 달력">
      <div className="tk-brief" data-ui="브리핑">
        <span className={c.judge ? 'turn' : ''}><b>{t(`판단 ${c.judge}`, `${c.judge} to decide`)}</b>{t(' 기다림', '')}</span>
        <span>{t(`맡긴 일 ${c.working} 진행 중`, `${c.working} delegated in progress`)}</span>
        <span>{t(`이번 주 마감 ${c.due}`, `${c.due} due this week`)}</span>
        {lastDays !== null && <span className="muted">{t('마지막 결과', 'Last result')} {lastDays === 0 ? t('오늘', 'today') : t(`${lastDays}일 전`, `${lastDays} d ago`)}</span>}
        <span className="sp" />
        <button className="icon-btn" aria-label={t('지난주', 'Last week')} data-tip={t('지난주', 'Last week')} onClick={() => shift(-1)}>‹</button>
        <button className="fb-link" onClick={() => { setPicked(null); setStart(weekStartOf(now)) }}>{t('이번 주', 'This week')}</button>
        <button className="icon-btn" aria-label={t('다음 주', 'Next week')} data-tip={t('다음 주', 'Next week')} onClick={() => shift(1)}>›</button>
      </div>
      <div className="tk-wk" data-ui="주 칸">
        {days.map((iso, i) => {
          const items = itemsOn(iso)
          return (
            <button key={iso} className={`tk-wd${iso === today ? ' is-today' : ''}${iso > today ? ' future' : ''}${picked === iso ? ' on' : ''}`} data-ui="하루" aria-pressed={picked === iso}
              onClick={() => setPicked(picked === iso ? null : iso)} title={items.map((x) => `${x.time} ${x.text}`).join('\n') || undefined}>
              <span className="tk-wh"><b>{WEEK_DAYS[i]}</b> {shortDate(iso)}{iso === today && t(' 오늘', ' today')}</span>
              {items.slice(0, SHOWN).map((x) => <span key={x.key} className={`tk-ev m-${x.mark}`}><Mark m={x.mark} />{x.text}</span>)}
              {items.length > SHOWN && <span className="tk-ev-more">{t(`외 ${items.length - SHOWN}개`, `+${items.length - SHOWN} more`)}</span>}
            </button>
          )
        })}
      </div>
      {picked && <div className="tk-day" data-ui="하루 자세히">
        <div className="tk-day-h">{shortDate(picked)} ({WEEK_DAYS[new Date(`${picked}T00:00`).getDay()]}) <button className="icon-btn" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={() => setPicked(null)}>{Icon.x}</button></div>
        {itemsOn(picked).map((x) => (
          <div key={x.key} className={`tk-day-i m-${x.mark}`}>
            <span className="tm">{x.time}</span><Mark m={x.mark} /><span className="tx">{x.text}</span>
            {x.task ? <button className="a" onClick={() => openItem(x)}>{t('보고서', 'Report')}</button> : <span />}
          </div>
        ))}
        {!itemsOn(picked).length && <p className="muted tk-none">{t('이날은 기록이 없습니다.', 'No records on this day.')}</p>}
      </div>}
      <div className="tk-legend">↘ {t('맡김', 'Delegated')} · <span className="g blocked" aria-hidden /> {t('결과 도착(판단 대기) · ↗ 판단한 결과 · ✓ 끝낸 할 일 · · 메모 · ⇄ 상태 바꿈 · ⚑ 마감 · 날짜를 누르면 그날을 자세히 봅니다', 'Result in (awaiting decision) · ↗ Decided result · ✓ Done to-do · · Memo · ⇄ Status changed · ⚑ Due · Click a date to see that day')}</div>
    </section>
  )
}

export type TaskDraft = Partial<NewTask> & { mode?: 'new' | 'proposal' | 'next'; from?: Task; nextIndex?: number }

/**
 * 맡기기 창: 제목 · 주제 · 맡을 에이전트 · 작업 내용 · 종결 조건(직접 적기 / 에이전트가 먼저 제안) · 참고 자료 · 하지 말 것.
 * 다음 지시를 고쳐 맡길 때와 종결 조건 제안을 고쳐 승인할 때도 같은 창을 쓴다.
 */
export function TaskDialog({ rid, topics, draft, onClose, onSaved, reload }: {
  rid: string; topics: Topic[]; draft: TaskDraft; onClose(): void; onSaved: Saved; reload(): unknown
}) {
  const mode = draft.mode ?? 'new'
  const [title, setTitle] = useState(draft.title ?? '')
  const [topic, setTopic] = useState(draft.topic ?? '')
  const [agent, setAgent] = useState(draft.agent ?? 'claude-code')
  const [task, setTask] = useState(draft.task ?? '')
  const [endMode, setEndMode] = useState<'self' | 'agent'>(draft.endCondition || mode !== 'new' ? 'self' : 'agent')
  const [end, setEnd] = useState(draft.endCondition ?? '')
  const [refs, setRefs] = useState((draft.references ?? []).join('\n'))
  const [avoid, setAvoid] = useState(draft.avoid ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const proposal = mode === 'proposal'
  const ready = proposal ? !!end.trim() : !!title.trim() && !!task.trim() && (endMode === 'agent' || !!end.trim())
  const submit = async () => {
    if (!ready || busy) return
    setBusy(true); setError(null)
    const input: NewTask = {
      title: title.trim(), task: task.trim(), agent, ...(topic ? { topic } : {}), ...(avoid.trim() ? { avoid: avoid.trim() } : {}),
      ...(endMode === 'self' && end.trim() ? { endCondition: end.trim() } : {}),
      references: refs.split('\n').map((x) => x.trim()).filter(Boolean),
    }
    try {
      if (proposal && draft.from) {
        await tasksApi(rid).judge(draft.from.id, { verdict: 'approve', endCondition: end.trim(), baseHash: draft.from.hash })
        onSaved(t('고친 종결 조건으로 승인했습니다', 'Approved with the edited completion criteria'), agentAction(draft.from.file, onSaved))
      } else if (mode === 'next' && draft.from && draft.nextIndex) {
        const { started } = await tasksApi(rid).next(draft.from.id, { i: draft.nextIndex, action: 'start', edit: input, baseHash: draft.from.hash })
        onSaved(t('고쳐서 맡겼습니다', 'Edited and delegated'), started && agentAction(started.file, onSaved))
      } else {
        const made = await tasksApi(rid).create(input)
        onSaved(t('맡겼습니다', 'Delegated'), agentAction(made.file, onSaved))
      }
      await reload()
      onClose()
    } catch (e) {
      setError(e instanceof ConflictError ? t('에이전트가 파일을 고쳤습니다. 닫고 새 내용을 본 뒤 다시 하세요', 'The agent edited the file. Close, read the new content, and try again') : (e as Error).message)
      setBusy(false)
    }
  }
  const head = proposal ? t('종결 조건 고쳐서 승인', 'Edit and approve completion criteria') : mode === 'next' ? t('다음 지시 고쳐서 맡기기', 'Edit and delegate next instruction') : t('맡기기', 'Delegate')
  return (
    <Dialog title={head} ui="맡기기" wide onClose={onClose} footer={<>
      <span className="muted tk-path">{proposal ? draft.from?.file : t('workbench/tasks/에 작업 파일 하나가 생깁니다', 'Creates one task file in workbench/tasks/')}</span>
      <span className="sp" />
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={!ready || busy} onClick={() => void submit()} title="⌘↵">{proposal ? t('승인', 'Approve') : t('맡기기', 'Delegate')}</button>
    </>}>
      <div className="tk-form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() } }}>
        {error && <div className="banner danger" role="alert">{error}</div>}
        {proposal ? <>
          <p className="muted tk-form-note">{draft.from?.title} · {t('에이전트가 제안한 종결 조건을 고칩니다. 승인하면 이 조건으로 시작합니다.', 'Edit the completion criteria the agent proposed. Approving starts the task with these criteria.')}</p>
          <label className="field"><span>{t('종결 조건', 'Completion criteria')}</span><textarea autoFocus rows={4} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </> : <>
          <label className="field"><span>{t('제목', 'Title')} <em>{t('보고서 제목과 파일 이름이 됩니다', 'Becomes the report title and file name')}</em></span><input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="tk-form-2">
            <label className="field"><span>{t('주제', 'Topic')} <em>{t('선택', 'Optional')}</em></span>
              <select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">{t('없음', 'None')}</option>{topics.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
            <div className="field"><span>{t('맡을 에이전트', 'Agent')}</span>
              <div className="segmented small" role="radiogroup" aria-label={t('맡을 에이전트', 'Agent')}>
                {(['claude-code', 'codex'] as const).map((a) => <button key={a} type="button" role="radio" aria-checked={agent === a} className={agent === a ? 'on' : ''} onClick={() => setAgent(a)}>{agentName(a)}</button>)}
              </div></div>
          </div>
          <label className="field"><span>{t('작업 내용', 'Task')}</span><textarea rows={3} value={task} onChange={(e) => setTask(e.target.value)} /></label>
          <div className="field"><span>{t('종결 조건', 'Completion criteria')} <em>{t('무엇과 대조해 어떤 기준이면 끝인지', 'What to compare against and when it counts as done')}</em></span>
            <div className="tk-radio" role="radiogroup" aria-label={t('종결 조건', 'Completion criteria')}>
              <label><input type="radio" name="tk-end" checked={endMode === 'agent'} onChange={() => setEndMode('agent')} /> {t('에이전트가 먼저 제안하고, 내가 승인한 뒤 시작', 'Agent proposes first; start after I approve')}</label>
              <label><input type="radio" name="tk-end" checked={endMode === 'self'} onChange={() => setEndMode('self')} /> {t('직접 적기', 'Write them myself')}</label>
            </div>
            {endMode === 'self' && <textarea rows={2} value={end} aria-label={t('종결 조건', 'Completion criteria')} placeholder={t('예: legacy 결과와 모든 k에서 1e-8 이내로 같다', 'Example: matches the legacy result within 1e-8 at every k')} onChange={(e) => setEnd(e.target.value)} />}
          </div>
          <label className="field"><span>{t('참고 자료', 'References')} <em>{t('선택 · 에이전트가 먼저 읽을 노트 · 논문 · 폴더, 한 줄에 하나', 'Optional · notes, papers, or folders the agent reads first, one per line')}</em></span><textarea rows={2} value={refs} onChange={(e) => setRefs(e.target.value)} /></label>
          <label className="field"><span>{t('하지 말 것', "Don't")} <em>{t('선택', 'Optional')}</em></span><input value={avoid} placeholder={t('예: 공개 함수 이름은 바꾸지 않는다', 'Example: do not rename public functions')} onChange={(e) => setAvoid(e.target.value)} /></label>
        </>}
      </div>
    </Dialog>
  )
}
