import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, api, notesApi, type Attach, type AttachKind, type Chat, type ChatEffort, type ChatItem, type ChatMessageBody, type ChatMode, type ChatModel, type ChatRow, type ChatScope, type ChatSettings, type ChatState, type ImageIn, type Todo } from './api'
import { askConfirm } from './askText'
import { Author } from './Author'
import { relativeTime } from './format'
import { t } from './i18n'
import { Icon } from './icons'
import { MemoText } from './memo'
import { qk } from './queries'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'

/**
 * 에이전트 대화 (10/21 "프로젝트 관리 먼저", 같은 날 "에이전트 창 구조 다시"):
 * 앱이 맥의 Claude Code를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다(서버 agentChats.ts).
 * - 레일 "에이전트" 화면(AgentPage · AgentSide): 모든 프로젝트의 대화 · 대화 · 오른쪽 작업 상태 칸
 * - 상단바 반짝이(AgentPanel): 지금 프로젝트의 대화를 오른쪽 사이드바 자리에서. 지금 보는 노트가 저절로 붙는다
 * - 입력란 하나(Composer): / 명령 · @ 붙이기 · 그림 붙여넣기, 맡기는 정도(읽기만 · 묻고 하기 · 계획 먼저 · 고치기 바로) · 모델 · 생각 깊이
 * - 대화: 계획 승인 카드 · 할 일 · 노트 고침 카드 · 하위 에이전트 · 허락 카드. 일하는 중에 보낸 지시는 다음 차례에 읽는다
 * 범위 밖 고치기와 파일 바로 쓰기는 서버가 막고, 명령은 허락 카드로 묻는다(사용자 차례 = 주황).
 */

const LIVE: ReadonlySet<ChatState> = new Set(['running', 'waiting', 'queued'])
export const isLive = (s: ChatState) => LIVE.has(s)

const STATE_NAME: Record<ChatState, string> = {
  running: t('일하는 중', 'Working'),
  waiting: t('허락 기다림', 'Needs approval'),
  queued: t('줄 섬', 'Queued'),
  idle: t('끝남', 'Done'),
  stopped: t('중지', 'Stopped'),
  error: t('오류', 'Error'),
}

/** 대화 상태: 일하는 중은 진행 점, 허락을 기다리면 사용자 차례 주황 점, 오류는 위험 색 글자, 나머지는 옅은 이름 */
export function ChatStateMark({ state, label }: { state: ChatState; label?: boolean }) {
  const name = STATE_NAME[state]
  if (state === 'running') return <span className="ac-state"><StatusDot s="in-progress" name={name} label={label} /></span>
  if (state === 'waiting') return <span className="ac-state" title={name}><span className="turn-dot" role="img" aria-label={name} />{label && <span className="g-name">{name}</span>}</span>
  if (state === 'error') return <span className="ac-state error-text">{name}</span>
  return label || state === 'queued' ? <span className="ac-state muted">{name}</span> : null
}

// ---------- 맡기는 정도 · 모델 · 생각 깊이 ----------

/** 맡기는 정도: 읽기만(write read) 또는 고치는 대화의 모드 셋 */
export type Trust = 'read' | ChatMode
const TRUSTS: Trust[] = ['read', 'ask', 'plan', 'edit']
const TRUST_NAME: Record<Trust, string> = { read: t('읽기만', 'Read only'), ask: t('묻고 하기', 'Ask first'), plan: t('계획 먼저', 'Plan first'), edit: t('고치기 바로', 'Edit freely') }
const TRUST_HINT: Record<Trust, string> = {
  read: t('읽고 답만 합니다. 명령은 묻고 돌립니다', 'Reads and answers only. Commands ask first'),
  ask: t('노트 고치기와 명령을 하나씩 묻습니다', 'Asks before each note edit and command'),
  plan: t('먼저 계획을 보이고, 승인하면 범위 안 노트는 묻지 않고 고칩니다. 명령은 묻습니다', 'Shows a plan first; once approved, edits notes in scope without asking. Commands ask'),
  edit: t('범위 안 노트를 바로 고칩니다. 명령 · 웹 · 범위 밖은 묻거나 막습니다', 'Edits notes in scope right away. Commands, web and out-of-scope work ask or are blocked'),
}
export const trustOf = (c: { write: string; mode: ChatMode }): Trust => (c.write === 'read' ? 'read' : c.mode)
const settingsOf = (v: Trust): ChatSettings => (v === 'read' ? { write: 'read' } : { write: 'notes', mode: v })
const MODEL_NAME: Record<ChatModel, string> = { default: t('기본 모델', 'Default model'), opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }
const EFFORT_NAME: Record<ChatEffort, string> = { low: t('생각 얕게', 'Think less'), medium: t('생각 보통', 'Think normally'), high: t('생각 깊게', 'Think more') }

interface Settings { trust: Trust; model: ChatModel; effort: ChatEffort }

// ---------- / 명령 ----------

const COMMANDS: { cmd: string; label: string; text: string }[] = [
  { cmd: t('/계산', '/run'), label: t('노트의 계산을 다시 돌리고 확인 절과 맞추기', 'Rerun the note\'s computation and match its checks'), text: t('이 노트의 계산을 다시 돌리고 결과를 확인(Checks) 절과 맞춰 줘. 다르면 고치고 무엇이 달랐는지 알려 줘.', 'Rerun the computation in this note and match the result with its Checks section. If it differs, fix it and tell me what changed.') },
  { cmd: t('/검토', '/review'), label: t('노트의 수식 · 논리 단계 검토', 'Review the note\'s equations and steps'), text: t('이 노트의 수식과 논리 단계를 검토해 줘. 틀리거나 빠진 단계는 그 자리에 기록(질문)으로 남기고, 노트는 고치지 마.', 'Review the equations and logical steps in this note. Leave a record (question) where a step is wrong or missing; do not change the note.') },
  { cmd: t('/기록', '/records'), label: t('답할 차례인 기록에 답하기', 'Answer the records waiting for an agent'), text: t('이 프로젝트에서 에이전트가 답할 차례인 기록에 답해 줘.', 'Answer the records in this project that wait for an agent.') },
  { cmd: t('/문헌', '/papers'), label: t('근거 문헌을 찾아 노트에 잇기', 'Find supporting papers and link them'), text: t('이 노트의 주장마다 근거가 되는 문헌을 라이브러리에서 찾아 이어 줘. 없으면 무엇이 없는지 알려 줘.', 'For each claim in this note, find a supporting paper in the library and link it. Tell me where none exists.') },
  { cmd: t('/흐름', '/flow'), label: t('한 일을 흐름 점으로 정리', 'Turn the work into flow dots'), text: t('이번에 한 일을 흐름 점으로 정리해 줘 (한 일 하나에 점 하나).', 'Add the work done here to the flow (one dot per piece of work).') },
  { cmd: t('/요약', '/summary'), label: t('오늘 이 프로젝트에서 한 일', 'What happened in this project today'), text: t('오늘 이 프로젝트에서 한 일을 짧게 요약해 줘.', 'Summarize briefly what happened in this project today.') },
]

const ATTACH_NAME: Record<AttachKind, string> = { note: t('노트', 'Note'), topic: t('주제', 'Topic'), file: t('파일', 'File'), selection: t('고른 글', 'Selection'), paper: t('문헌', 'Paper'), record: t('기록', 'Record') }

// ---------- 노트에서 「에이전트에게」 (고른 글 메뉴) ----------

/** 상단바 패널을 열라는 알림 (App.tsx가 듣는다) */
export const AGENT_OPEN = 'rw-agent-open'
const inbox = new Map<string, Attach[]>()
let inboxTick = 0
const inboxListeners = new Set<() => void>()
/** 고른 글 · 노트를 지금 프로젝트의 에이전트 입력란에 붙이고 패널을 연다 */
export function sendToAgent(rid: string, a: Attach) {
  inbox.set(rid, [...(inbox.get(rid) ?? []), a])
  inboxTick++
  inboxListeners.forEach((f) => f())
  window.dispatchEvent(new CustomEvent(AGENT_OPEN))
}
function useInbox(rid: string, take: (a: Attach[]) => void) {
  const tick = useSyncExternalStore((f) => { inboxListeners.add(f); return () => { inboxListeners.delete(f) } }, () => inboxTick)
  const ref = useRef(take)
  ref.current = take
  useEffect(() => {
    const got = inbox.get(rid)
    if (got?.length) { inbox.delete(rid); ref.current(got) }
  }, [rid, tick])
}

// ---------- 목록 ----------

const useChatList = (rid?: string) => useQuery({ queryKey: qk.agentChatList(rid), queryFn: () => agentChatsApi.list(rid) })
const useChat = (id: string) => useQuery({ queryKey: qk.agentChat(id), queryFn: () => agentChatsApi.get(id) })
const useProjects = () => useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches

function scopeName(s: ChatScope, topics?: { id: string; title: string }[]): string {
  if (s.kind === 'project') return t('프로젝트 전체', 'Whole project')
  if (s.kind === 'topic') return `${t('주제', 'Topic')} · ${topics?.find((x) => x.id === s.target)?.title ?? s.target}`
  return `${t('노트', 'Note')} · ${s.target?.split('/').slice(-2, -1)[0] ?? s.target}`
}

/** 사용자 차례: 허락 · 계획을 기다리거나 오류로 멈춘 대화 */
const myTurn = (c: ChatRow) => c.state === 'waiting' || c.state === 'error'
const rank = (c: ChatRow) => (myTurn(c) ? 0 : isLive(c.state) ? 1 : 2)

function ChatLine({ c, on, project, onOpen }: { c: ChatRow; on: boolean; project?: string; onOpen(): void }) {
  const meta = [STATE_NAME[c.state], c.changed.length ? t(`바뀐 파일 ${c.changed.length}`, `${c.changed.length} changed`) : '', relativeTime(Date.parse(c.updated))].filter(Boolean).join(' · ')
  return (
    <button className={`nav ac-line${on ? ' on' : ''}`} data-ui="대화 줄" data-ui-item={c.title} title={c.title} onClick={onOpen}>
      <span className="ac-line-top"><span className="label">{c.title}</span><ChatStateMark state={c.state} /></span>
      <span className="ac-line-meta">{project ? `${project} · ` : ''}{meta}</span>
    </button>
  )
}

// ---------- 대화 줄들 ----------

type Step = Extract<ChatItem, { kind: 'step' }>
type Block = { kind: 'steps'; items: Step[] } | { kind: 'one'; item: Exclude<ChatItem, { kind: 'step' }> }

/** 이어진 도구 줄은 한 묶음으로 (요약 한 줄, 펼치면 모두) */
export function blocksOf(items: ChatItem[]): Block[] {
  const out: Block[] = []
  for (const it of items) {
    const last = out[out.length - 1]
    if (it.kind === 'step') {
      if (last?.kind === 'steps') last.items.push(it)
      else out.push({ kind: 'steps', items: [it] })
    } else out.push({ kind: 'one', item: it })
  }
  return out
}

const isAgentStep = (s: Step) => s.tool === 'Task' || s.tool === 'Agent'

/** 도구 묶음의 요약: 도구 n번 · 하위 에이전트 n (범위 밖 n) */
export function stepsSummary(items: Step[]): string {
  const agents = items.filter(isAgentStep).length
  const outside = items.filter((s) => s.outside).length
  const tools = items.length - agents
  return [
    tools ? t(`도구 ${tools}번`, `${tools} tool call${tools > 1 ? 's' : ''}`) : '',
    agents ? t(`하위 에이전트 ${agents}`, `${agents} subagent${agents > 1 ? 's' : ''}`) : '',
    outside ? t(`범위 밖 ${outside}`, `${outside} outside scope`) : '',
  ].filter(Boolean).join(' · ')
}

function StepLine({ s }: { s: Step }) {
  const agent = isAgentStep(s)
  return (
    <div className={`ac-step${s.sub ? ' sub' : ''}`} data-ui="도구 줄">
      <span className="ac-tool mono">{agent ? t('하위 에이전트', 'Subagent') : s.tool}</span>
      <span className="ac-sum" title={s.summary}>{s.summary}</span>
      {s.outside && <span className="tag" data-ui="범위 밖 태그" title={t('이 대화의 범위 밖을 읽었습니다', 'Read outside this conversation\'s scope')}>{t('범위 밖', 'Outside scope')}</span>}
    </div>
  )
}

function Steps({ items }: { items: Step[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="ac-steps">
      <button className="a ac-steps-toggle" data-ui="도구 줄 펼치기" aria-expanded={open} onClick={() => setOpen(!open)}>
        {stepsSummary(items)} {open ? '▾' : '›'}
      </button>
      {open && items.map((s, i) => <StepLine key={i} s={s} />)}
    </li>
  )
}

const ANSWERED: Record<'allow' | 'always' | 'deny', string> = { allow: t('허락함', 'Allowed'), always: t('이 대화에서 늘 허락함', 'Always allowed in this conversation'), deny: t('거절함', 'Declined') }

function useAnswer(chat: Chat, id: string, onError: (m: string) => void) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const answer = async (a: 'allow' | 'always' | 'deny') => {
    setBusy(true)
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.answer(chat.id, id, a)) } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  return { busy, answer }
}

function AskCard({ chat, it, onError }: { chat: Chat; it: Extract<ChatItem, { kind: 'ask' }>; onError(m: string): void }) {
  const { busy, answer } = useAnswer(chat, it.id, onError)
  return (
    <li className={`ac-card ac-ask${it.answer ? ' done' : ' wait'}`} data-ui="허락 카드">
      <div className="ac-card-head">
        {!it.answer && <span className="turn-dot" aria-hidden />}
        <b>{it.answer ? ANSWERED[it.answer] : t('허락이 필요합니다', 'Approval needed')}</b>
        <span className="ac-tool mono">{it.tool}</span>
      </div>
      <code className="ac-ask-sum">{it.summary}</code>
      {!it.answer && (
        <div className="ac-card-row">
          <span className="muted ac-hint">{t('늘 허락하면 이 대화에서 같은 일은 다시 묻지 않습니다', 'Always: not asked again in this conversation')}</span>
          <span className="sp" />
          <button className="btn sm" disabled={busy} data-ui="거절 버튼" onClick={() => void answer('deny')}>{t('거절', 'Decline')}</button>
          <button className="btn sm" disabled={busy} data-ui="늘 허락 버튼" onClick={() => void answer('always')}>{t('늘 허락', 'Always')}</button>
          <button className="btn primary sm" disabled={busy} data-ui="허락 버튼" onClick={() => void answer('allow')}>{t('허락', 'Allow')}</button>
        </div>
      )}
    </li>
  )
}

/** 계획 먼저: 에이전트가 보인 계획. 승인하면 그대로 하고, 고치기를 누르면 에이전트가 무엇을 바꿀지 묻는다 */
function PlanCard({ chat, it, onError }: { chat: Chat; it: Extract<ChatItem, { kind: 'ask' }>; onError(m: string): void }) {
  const { busy, answer } = useAnswer(chat, it.id, onError)
  return (
    <li className={`ac-card ac-plan${it.answer ? ' done' : ' wait'}`} data-ui="계획 카드">
      <div className="ac-card-head">
        {!it.answer && <span className="turn-dot" aria-hidden />}
        <b>{it.answer ? (it.answer === 'deny' ? t('계획을 고치기로 함', 'Asked to revise the plan') : t('계획 승인함', 'Plan approved')) : t('계획을 보고 승인해 주세요', 'Review and approve the plan')}</b>
      </div>
      <MemoText text={it.plan ?? ''} />
      {!it.answer && (
        <div className="ac-card-row">
          <span className="muted ac-hint">{t('승인하면 범위 안 노트는 묻지 않고 고칩니다. 명령은 그대로 묻습니다', 'Once approved, notes in scope are edited without asking. Commands still ask')}</span>
          <span className="sp" />
          <button className="btn sm" disabled={busy} data-ui="계획 고치기 버튼" onClick={() => void answer('deny')}>{t('고쳐 달라고 하기', 'Ask to revise')}</button>
          <button className="btn primary sm" disabled={busy} data-ui="계획 승인 버튼" onClick={() => void answer('allow')}>{t('이대로 하기', 'Go ahead')}</button>
        </div>
      )}
    </li>
  )
}

function TodoMark({ s }: { s: Todo['state'] }) {
  if (s === 'completed') return <span className="ac-todo-mark done" role="img" aria-label={t('끝남', 'Done')}>{Icon.check}</span>
  if (s === 'in_progress') return <span className="ac-todo-mark"><StatusDot s="in-progress" name={t('하는 중', 'Doing')} /></span>
  return <span className="ac-todo-mark box" role="img" aria-label={t('아직', 'Not started')} />
}

export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className="ac-todos">
      {todos.map((x, i) => <li key={i} className={x.state}><TodoMark s={x.state} /><span>{x.text}</span></li>)}
    </ul>
  )
}

const todoCount = (todos: Todo[]) => t(`할 일 ${todos.filter((x) => x.state === 'completed').length} / ${todos.length}`, `To-do ${todos.filter((x) => x.state === 'completed').length} / ${todos.length}`)

function TodoCard({ todos }: { todos: Todo[] }) {
  return (
    <li className="ac-card" data-ui="할 일 카드">
      <div className="ac-card-head"><b>{todoCount(todos)}</b></div>
      <TodoList todos={todos} />
    </li>
  )
}

const reviewOf = (rid: string, file: string) => go({ page: 'review', key: `note:${rid}:${file}` })

/** 노트 고침: 바뀐 곳(줄인 앞뒤 글)과 수정 검토로 가는 버튼. 되돌리기 · 승인은 수정 검토에서 문단마다 */
function EditCard({ chat, it }: { chat: Chat; it: Extract<ChatItem, { kind: 'edit' }> }) {
  return (
    <li className="ac-card" data-ui="노트 고침 카드">
      <div className="ac-card-head">
        <b>{t('노트 고침', 'Note edited')}</b>
        <span className="mono ac-add">+{it.added}</span><span className="mono ac-del">−{it.removed}</span>
      </div>
      <div className="mono ac-file" title={it.file}>{it.file}</div>
      {it.reason && <div className="muted ac-hint">{it.reason}</div>}
      {it.parts.map((p, i) => (
        <div key={i} className="ac-diff">
          {p.old && <div className="ac-diff-old"><span aria-hidden>− </span>{p.old}</div>}
          {p.new && <div className="ac-diff-new"><span aria-hidden>+ </span>{p.new}</div>}
        </div>
      ))}
      <div className="ac-card-row">
        <span className="muted ac-hint">{t('되돌리기 · 승인은 수정 검토에서 문단마다', 'Revert or approve each paragraph in edit review')}</span>
        <span className="sp" />
        <button className="btn sm" data-ui="수정 검토로" onClick={() => reviewOf(chat.rid, it.file)}>{t('수정 검토에서 보기', 'Open in edit review')}</button>
      </div>
    </li>
  )
}

function AttachChips({ attach, images }: { attach?: Attach[]; images?: number }) {
  if (!attach?.length && !images) return null
  return (
    <div className="ac-chips">
      {attach?.map((a, i) => <span key={i} className="tag" title={a.text ?? a.ref}>{ATTACH_NAME[a.kind]} · {a.label}</span>)}
      {!!images && <span className="tag">{t(`그림 ${images}`, `${images} image${images > 1 ? 's' : ''}`)}</span>}
    </div>
  )
}

function ItemView({ chat, it, onError }: { chat: Chat; it: Exclude<ChatItem, { kind: 'step' }>; onError(m: string): void }) {
  const when = <span className="muted ac-when" title={new Date(it.at).toLocaleString()}>{relativeTime(Date.parse(it.at))}</span>
  switch (it.kind) {
    case 'user': return (
      <li className="fbp-say me ac-say" data-ui="내 지시">
        <div className="fbp-say-head"><b>{t('나', 'Me')}</b>{it.queued && <span className="tag">{t('다음 차례에 읽음', 'Read next turn')}</span>}<span className="sp" />{when}</div>
        <MemoText text={it.text} />
        <AttachChips attach={it.attach} images={it.images} />
      </li>
    )
    case 'text': return <li className={`fbp-say ac-say${it.sub ? ' sub' : ''}`} data-ui="에이전트 글"><div className="fbp-say-head"><b><Author by="claude" /></b>{it.sub && <span className="muted">{t('하위 에이전트', 'Subagent')}</span>}<span className="sp" />{when}</div><MemoText text={it.text} /></li>
    case 'ask': return it.plan !== undefined ? <PlanCard chat={chat} it={it} onError={onError} /> : <AskCard chat={chat} it={it} onError={onError} />
    case 'todos': return <TodoCard todos={it.todos} />
    case 'edit': return <EditCard chat={chat} it={it} />
    case 'blocked': return <li className="ac-note" data-ui="막은 일"><span className="ac-tool mono">{it.tool}</span><span>{t('막음', 'Blocked')} · {it.reason}</span></li>
    case 'result': return <li className="ac-note muted" data-ui="차례 끝">{it.ok ? `✓ ${t('이번 차례 끝', 'Turn done')}` : t('이번 차례 실패', 'Turn failed')}{it.seconds !== undefined && ` · ${it.seconds < 60 ? t(`${it.seconds}초`, `${it.seconds}s`) : t(`${Math.round(it.seconds / 60)}분`, `${Math.round(it.seconds / 60)} min`)}`}{it.cost !== undefined && it.cost > 0 && ` · $${it.cost.toFixed(2)}`}</li>
    case 'error': return <li className="ac-note error-text" data-ui="대화 오류">! {it.text}</li>
  }
}

// ---------- 입력란 ----------

type Menu = { kind: '/' | '@'; start: number; query: string }
type Pick = { key: string; label: string; meta?: string; run(): void }

/** 커서 앞의 / 명령(맨 앞에서만) · @ 붙이기 낱말 */
export function menuAt(text: string, caret: number): Menu | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)([/@])([^\s/@]*)$/.exec(before)
  if (!m) return null
  const start = before.length - m[3]!.length - 1
  if (m[2] === '/' && before.slice(0, start).trim()) return null
  return { kind: m[2] as '/' | '@', start, query: m[3]! }
}

const MAX_IMAGE = 5 * 1024 * 1024
function readImage(f: File): Promise<ImageIn & { name: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ type: f.type as ImageIn['type'], data: String(r.result).split(',')[1] ?? '', name: f.name || t('붙여 넣은 그림', 'Pasted image') })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

/**
 * 에이전트 입력란: 붙인 것(지금 보는 노트는 저절로) · / 명령 · @ 붙이기 · 그림 붙여넣기, 아래 줄에 맡기는 정도 · 모델 · 생각 깊이 · 보내기.
 * 대화 중에 바꾼 설정은 다음 차례부터 (onSettings)
 */
function Composer({ rid, auto, settings, onSettings, onSubmit, placeholder, hint, sendLabel, autoFocus }: {
  rid: string
  auto?: Attach
  settings: Settings
  onSettings(s: Partial<Settings>): void
  onSubmit(m: ChatMessageBody): Promise<boolean>
  placeholder: string
  hint?: string
  sendLabel: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [attach, setAttach] = useState<Attach[]>([])
  const [images, setImages] = useState<(ImageIn & { name: string })[]>([])
  const [autoOff, setAutoOff] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hi, setHi] = useState(0)
  const [closed, setClosed] = useState<number | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useInbox(rid, (got) => { setAttach((a) => [...a, ...got]); box.current?.focus() })
  const autoKey = auto ? `${auto.kind}:${auto.ref}` : ''
  useEffect(() => setAutoOff(false), [autoKey])

  const menu = (() => { const m = menuAt(text, caret); return m && m.start !== closed ? m : null })()
  const notes = useQuery({ queryKey: qk.notes(rid), queryFn: () => notesApi(rid).list(), enabled: menu?.kind === '@' }).data
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: menu?.kind === '@' }).data
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree(), enabled: menu?.kind === '@' && (menu.query.length >= 2) }).data

  const replaceToken = (insert: string) => {
    if (!menu) return
    const v = text.slice(0, menu.start) + insert + text.slice(caret)
    setText(v)
    const at = menu.start + insert.length
    setCaret(at)
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at) })
  }
  const addAttach = (a: Attach) => { setAttach((xs) => (xs.some((x) => x.kind === a.kind && x.ref === a.ref && !x.text) ? xs : [...xs, a])); replaceToken('') }

  const picks: Pick[] = (() => {
    if (!menu) return []
    const q = menu.query.toLowerCase()
    if (menu.kind === '/') {
      return COMMANDS.filter((c) => c.cmd.slice(1).toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q))
        .map((c) => ({ key: c.cmd, label: c.cmd, meta: c.label, run: () => { setText(c.text); setCaret(c.text.length); requestAnimationFrame(() => box.current?.focus()) } }))
    }
    const has = (s: string) => s.toLowerCase().includes(q)
    const out: Pick[] = []
    for (const n of notes ?? []) if (has(n.title) || has(n.file)) out.push({ key: `n:${n.file}`, label: n.title, meta: ATTACH_NAME.note, run: () => addAttach({ kind: 'note', ref: n.file, label: n.title }) })
    for (const x of topics ?? []) if (has(x.title) || has(x.id)) out.push({ key: `t:${x.id}`, label: x.title, meta: ATTACH_NAME.topic, run: () => addAttach({ kind: 'topic', ref: x.id, label: x.title }) })
    if (q.length >= 2) for (const f of tree?.files ?? []) if (has(f.path)) out.push({ key: `f:${f.path}`, label: f.path, meta: ATTACH_NAME.file, run: () => addAttach({ kind: 'file', ref: f.path, label: f.path.split('/').pop() ?? f.path }) })
    return out.slice(0, 8)
  })()
  useEffect(() => setHi(0), [menu?.kind, menu?.query])

  const addImages = async (files: File[]) => {
    const ok = files.filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type))
    if (!ok.length) return false
    if (ok.some((f) => f.size > MAX_IMAGE)) { setFail(t('그림은 한 장에 5MB까지입니다', 'Images can be up to 5 MB each')); return true }
    const read = await Promise.all(ok.map(readImage))
    setImages((xs) => [...xs, ...read].slice(0, 4))
    return true
  }
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files]
    if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); void addImages(files) }
  }
  const onDrop = (e: DragEvent) => {
    const files = [...e.dataTransfer.files]
    if (files.length) { e.preventDefault(); void addImages(files) }
  }

  const all = [...(auto && !autoOff ? [auto] : []), ...attach]
  const submit = async () => {
    const v = text.trim()
    if (!v || busy) return
    setBusy(true); setFail(null)
    try {
      const ok = await onSubmit({ text: v, ...(all.length && { attach: all }), ...(images.length && { images: images.map(({ type, data }) => ({ type, data })) }) })
      if (ok) { setText(''); setCaret(0); setAttach([]); setImages([]) }
    } catch (e) { setFail((e as Error).message) } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (menu && picks.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % picks.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + picks.length) % picks.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); picks[hi]?.run(); return }
    }
    if (menu && e.key === 'Escape') { e.preventDefault(); setClosed(menu.start); return }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
  }
  const startAttach = () => {
    const at = box.current?.selectionStart ?? text.length
    const pre = text.slice(0, at)
    const insert = `${pre && !/\s$/.test(pre) ? ' ' : ''}@`
    const v = pre + insert + text.slice(at)
    setText(v); setClosed(null)
    const c = at + insert.length
    setCaret(c)
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(c, c) })
  }

  return (
    <div className="ac-composer" data-ui="에이전트 입력란" onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}>
      <div className="ac-chips">
        {auto && !autoOff && <span className="tag ac-chip" title={auto.ref}>{t('지금 보는', 'Viewing')} {ATTACH_NAME[auto.kind]} · {auto.label}<button className="ac-chip-x" aria-label={t('빼기', 'Remove')} onClick={() => setAutoOff(true)}>{Icon.x}</button></span>}
        {attach.map((a, i) => <span key={i} className="tag ac-chip" title={a.text ?? a.ref}>{ATTACH_NAME[a.kind]} · {a.label}<button className="ac-chip-x" aria-label={t('빼기', 'Remove')} onClick={() => setAttach((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
        {images.map((im, i) => <span key={`i${i}`} className="tag ac-chip" title={im.name}>{t('그림', 'Image')} · {im.name}<button className="ac-chip-x" aria-label={t('빼기', 'Remove')} onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
        <button className="a ac-attach" data-ui="붙이기 버튼" data-tip={t('노트 · 주제 · 파일을 붙입니다 (@). 그림은 붙여넣기 · 끌어 놓기', 'Attach a note, topic or file (@). Paste or drop images')} onClick={startAttach}>＋ {t('붙이기', 'Attach')}</button>
      </div>
      <div className="ac-input">
        <textarea ref={box} rows={3} value={text} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setClosed(null) }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)} onKeyDown={onKey} onPaste={onPaste} />
        {menu && (
          <div className="ac-menu" role="listbox" data-ui={menu.kind === '/' ? '명령 메뉴' : '붙이기 메뉴'}>
            {picks.length
              ? picks.map((p, i) => (
                <button key={p.key} role="option" aria-selected={i === hi} className={`ac-menu-item${i === hi ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => p.run()}>
                  <span className={menu.kind === '/' ? 'mono ac-menu-cmd' : 'ac-menu-label'}>{p.label}</span>
                  {p.meta && <span className="muted ac-menu-meta">{p.meta}</span>}
                </button>
              ))
              : <div className="muted ac-menu-none">{menu.kind === '@' ? (menu.query ? t('맞는 것이 없습니다', 'Nothing matches') : t('노트 · 주제 이름을 쓰세요 (파일은 두 글자부터)', 'Type a note or topic name (files from two letters)')) : t('맞는 명령이 없습니다', 'No matching command')}</div>}
          </div>
        )}
      </div>
      {(fail || hint) && (fail ? <span className="error-text ac-hint">{fail}</span> : <span className="muted ac-hint">{hint}</span>)}
      <div className="ac-compose-row">
        <div className="segmented small" role="radiogroup" aria-label={t('맡기는 정도', 'How much to hand over')} data-ui="맡기는 정도">
          {TRUSTS.map((v) => <button key={v} role="radio" aria-checked={settings.trust === v} className={settings.trust === v ? 'on' : ''} data-tip={TRUST_HINT[v]} onClick={() => onSettings({ trust: v })}>{TRUST_NAME[v]}</button>)}
        </div>
        <select className="rs-select ac-pick" data-ui="모델 고르기" aria-label={t('모델', 'Model')} value={settings.model} onChange={(e) => onSettings({ model: e.target.value as ChatModel })}>
          {(Object.keys(MODEL_NAME) as ChatModel[]).map((m) => <option key={m} value={m}>{MODEL_NAME[m]}</option>)}
        </select>
        <select className="rs-select ac-pick" data-ui="생각 깊이 고르기" aria-label={t('생각 깊이', 'Thinking')} value={settings.effort} onChange={(e) => onSettings({ effort: e.target.value as ChatEffort })}>
          {(Object.keys(EFFORT_NAME) as ChatEffort[]).map((m) => <option key={m} value={m}>{EFFORT_NAME[m]}</option>)}
        </select>
        <span className="sp" />
        <button className="btn primary sm" data-ui="지시 보내기" data-tip={t('보내기 (⌘↵)', 'Send (⌘↵)')} disabled={busy || !text.trim()} onClick={() => void submit()}>{sendLabel}</button>
      </div>
    </div>
  )
}

// ---------- 대화 하나 ----------

/** 대화의 머리: 이름 · 프로젝트 · 범위 · 상태 · 멈추기 / 지우기 */
function ChatHead({ chat, onBack, onDeleted, onSaved, onError }: { chat: Chat; onBack?(): void; onDeleted(): void; onSaved(m: string): void; onError(m: string): void }) {
  const client = useQueryClient()
  const projects = useProjects()
  const topics = useQuery({ queryKey: qk.topics(chat.rid), queryFn: () => api.research(chat.rid).topics(), enabled: chat.scope.kind === 'topic' }).data
  const project = projects?.find((p) => p.id === chat.rid)?.title ?? chat.rid
  const live = isLive(chat.state)
  const stop = async () => { try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.stop(chat.id)) } catch (e) { onError((e as Error).message) } }
  const remove = async () => {
    if (!await askConfirm({ title: t('이 대화를 지울까요?', 'Delete this conversation?'), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토는 그대로 남습니다.', 'Only the conversation is deleted. Notes, records and edit review stay.'), ok: t('지우기', 'Delete') })) return
    try { await agentChatsApi.remove(chat.id); void client.invalidateQueries({ queryKey: qk.agentChats }); onSaved(t('대화를 지웠습니다', 'Conversation deleted')); onDeleted() } catch (e) { onError((e as Error).message) }
  }
  return (
    <div className="ac-head" data-ui="대화 헤더">
      {onBack && <button className="icon-btn sm" data-ui="대화 목록으로" data-tip={t('대화 목록', 'Conversations')} aria-label={t('대화 목록으로', 'Back to conversations')} onClick={onBack}>{Icon.back}</button>}
      <div className="ac-head-what">
        <div className="ac-title" title={chat.title}>{chat.title}</div>
        <div className="ac-meta">
          <button className="a" data-ui="대화 프로젝트" onClick={() => go({ page: 'overview', rid: chat.rid })}>{project}</button>
          <span className="tag">{scopeName(chat.scope, topics)}</span>
        </div>
      </div>
      <ChatStateMark state={chat.state} label />
      {live
        ? <button className="btn sm" data-ui="대화 멈추기" onClick={() => void stop()}>{t('멈추기', 'Stop')}</button>
        : <button className="icon-btn sm" data-ui="대화 지우기" data-tip={t('지우기', 'Delete')} aria-label={t('대화 지우기', 'Delete conversation')} onClick={() => void remove()}>{Icon.trash}</button>}
    </div>
  )
}

/** 대화 하나: 머리, 주고받은 줄, 아래 입력란 (auto = 지금 보는 노트) */
export function ChatView({ id, auto, head = true, onBack, onDeleted, onSaved }: { id: string; auto?: Attach; head?: boolean; onBack?(): void; onDeleted(): void; onSaved(m: string): void }) {
  const client = useQueryClient()
  const { data: chat, error } = useChat(id)
  const [fail, setFail] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const n = chat?.items.length ?? 0
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [n, id])
  if (!chat) return <div className="empty center">{error ? (error as Error).message : t('불러오는 중…', 'Loading…')}</div>
  const live = isLive(chat.state)
  const settings: Settings = { trust: trustOf(chat), model: chat.model, effort: chat.effort }
  const change = async (s: Partial<Settings>) => {
    try {
      client.setQueryData(qk.agentChat(id), await agentChatsApi.settings(id, { ...(s.trust && settingsOf(s.trust)), ...(s.model && { model: s.model }), ...(s.effort && { effort: s.effort }) }))
      if (live) onSaved(t('다음 차례부터 바뀝니다', 'Applies from the next turn'))
    } catch (e) { setFail((e as Error).message) }
  }
  const send = async (m: ChatMessageBody) => {
    client.setQueryData(qk.agentChat(id), await agentChatsApi.send(id, m))
    return true
  }
  const hint = chat.state === 'waiting' ? t('위 카드에 답해 주세요', 'Answer the card above')
    : chat.state === 'queued' ? t('앞 대화가 끝나면 시작합니다', 'Starts when a running conversation finishes')
      : live ? t('지금 보내면 다음 차례에 읽습니다', 'Sent now, read next turn') : undefined
  return (
    <div className="ac-chat" data-ui="에이전트 대화">
      {head && <ChatHead chat={chat} onBack={onBack} onDeleted={onDeleted} onSaved={onSaved} onError={setFail} />}
      <ol ref={listRef} className="fbp-thread ac-items" data-ui="대화 줄들">
        {blocksOf(chat.items).map((b, i) => b.kind === 'steps' ? <Steps key={i} items={b.items} /> : <ItemView key={i} chat={chat} it={b.item} onError={setFail} />)}
        {fail && <li className="ac-note error-text">! {fail}</li>}
      </ol>
      <div className="ac-compose">
        <Composer rid={chat.rid} auto={auto} settings={settings} onSettings={(s) => void change(s)} onSubmit={send}
          placeholder={t('이어서 쓰기 · / 명령 · @ 붙이기', 'Continue · / commands · @ attach')} hint={hint} sendLabel={t('보내기', 'Send')} />
      </div>
    </div>
  )
}

// ---------- 새 대화 ----------

const SETTINGS_KEY = 'rw-agent-settings'
const defaultSettings = (): Settings => ({ trust: 'edit', model: 'default', effort: 'medium', ...store.get<Partial<Settings>>(SETTINGS_KEY, {}) })

/** 새 대화: 프로젝트(rid가 없을 때) · 범위(지금 보는 곳에서) · 입력란 하나 */
export function NewChat({ rid: fixed, note, onCreated }: { rid?: string; note?: { file: string; title: string }; onCreated(c: Chat): void }) {
  const client = useQueryClient()
  const projects = useProjects()
  const [pick, setPick] = useState(() => store.get<string>('rw-agent-project', ''))
  const rid = fixed ?? (projects?.some((p) => p.id === pick) ? pick : projects?.[0]?.id ?? '')
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: !!rid }).data
  const [kind, setKind] = useState<ChatScope['kind']>(note ? 'note' : 'project')
  const [topic, setTopic] = useState('')
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const topicId = topic || topics?.[0]?.id || ''
  const scope: ChatScope = kind === 'note' && note ? { kind, target: note.file } : kind === 'topic' && topicId ? { kind, target: topicId } : { kind: 'project' }
  const change = (s: Partial<Settings>) => { const v = { ...settings, ...s }; setSettings(v); store.set(SETTINGS_KEY, v) }
  const start = async (m: ChatMessageBody) => {
    if (!rid) return false
    const c = await agentChatsApi.create({ rid, ...m, scope, ...settingsOf(settings.trust), model: settings.model, effort: settings.effort })
    void client.invalidateQueries({ queryKey: qk.agentChats })
    onCreated(c)
    return true
  }
  const kinds: [ChatScope['kind'], string][] = [['project', t('프로젝트', 'Project')], ['topic', t('주제', 'Topic')], ...(note ? [['note', t('이 노트', 'This note')] as [ChatScope['kind'], string]] : [])]
  return (
    <div className="ac-new" data-ui="새 대화">
      <div className="ac-new-row">
        {!fixed && (
          <select className="rs-select" data-ui="대화 프로젝트 고르기" aria-label={t('프로젝트', 'Project')} value={rid} onChange={(e) => { setPick(e.target.value); store.set('rw-agent-project', e.target.value); setTopic('') }}>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
        <span className="rs-label">{t('범위', 'Scope')}</span>
        <div className="segmented small" role="radiogroup" aria-label={t('범위', 'Scope')} data-ui="대화 범위">
          {kinds.map(([k, label]) => <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} disabled={k === 'topic' && !topics?.length} onClick={() => setKind(k)}>{label}</button>)}
        </div>
        {kind === 'topic' && !!topics?.length && (
          <select className="rs-select" data-ui="대화 주제 고르기" aria-label={t('주제', 'Topic')} value={topicId} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        )}
      </div>
      <span className="muted ac-hint">{TRUST_HINT[settings.trust]}. {t('범위 밖은 읽기만 합니다', 'Outside the scope it only reads')}</span>
      {rid && <Composer key={rid} rid={rid} auto={note ? { kind: 'note', ref: note.file, label: note.title } : undefined} settings={settings} onSettings={change} onSubmit={start}
        placeholder={t('맡길 일을 쓰세요 · / 명령 · @ 노트 붙이기 · 그림 붙여넣기', 'What should the agent do? · / commands · @ attach · paste images')} sendLabel={t('시작', 'Start')} />}
    </div>
  )
}

// ---------- 작업 상태 칸 (에이전트 화면 오른쪽) ----------

/** 이 대화의 할 일 · 바뀐 파일 · 잡은 파일(다른 대화 것도) · 허락 · 하위 에이전트 · 사용량 */
export function WorkColumn({ id }: { id: string }) {
  const client = useQueryClient()
  const chat = useChat(id).data
  const work = useQuery({ queryKey: qk.agentWork, queryFn: () => agentChatsApi.work() }).data
  if (!chat) return null
  const others = (work?.chats ?? []).filter((c) => c.id !== chat.id && c.rid === chat.rid && c.claims.length)
  const agents = chat.items.filter((i): i is Step => i.kind === 'step' && isAgentStep(i))
  const results = chat.items.filter((i): i is Extract<ChatItem, { kind: 'result' }> => i.kind === 'result')
  const cost = results.reduce((s, r) => s + (r.cost ?? 0), 0)
  const secs = results.reduce((s, r) => s + (r.seconds ?? 0), 0)
  const forget = async (label: string) => client.setQueryData(qk.agentChat(id), await agentChatsApi.forget(id, label))
  const trust = trustOf(chat)
  return (
    <aside className="ac-work" data-ui="작업 상태">
      {!!chat.todos.length && <section><h3>{todoCount(chat.todos)}</h3><TodoList todos={chat.todos} /></section>}
      <section data-ui="바뀐 파일">
        <h3>{t('바뀐 파일', 'Changed files')}</h3>
        {chat.changed.length
          ? chat.changed.map((f) => <button key={f} className="a mono ac-file" title={f} onClick={() => reviewOf(chat.rid, f)}>{f}</button>)
          : <span className="muted ac-hint">{t('아직 없음. 고친 노트는 여기와 수정 검토에 함께 뜹니다', 'None yet. Edited notes show here and in edit review')}</span>}
      </section>
      <section data-ui="잡은 파일">
        <h3>{t('잡은 파일', 'Claimed files')}</h3>
        {chat.claims.map((f) => <div key={f} className="ac-work-row"><span className="mono ac-file" title={f}>{f}</span><span className="tag">{t('이 대화', 'This')}</span></div>)}
        {others.flatMap((o) => o.claims.map((f) => <div key={`${o.id}${f}`} className="ac-work-row"><span className="mono ac-file muted" title={f}>{f}</span><button className="a ac-other" title={o.title} onClick={() => go({ page: 'agent', id: o.id })}>{o.title}</button></div>))}
        {!chat.claims.length && !others.length && <span className="muted ac-hint">{t('지금 고치는 파일이 없습니다', 'No file is being changed now')}</span>}
        <span className="muted ac-hint">{t('다른 대화가 잡은 파일은 읽기만 합니다', 'Files claimed by another conversation are read only')}</span>
      </section>
      <section data-ui="이 대화의 허락">
        <h3>{t('이 대화의 허락', 'Permissions here')}</h3>
        <div className="ac-work-row"><span>{TRUST_NAME[trust]}</span><span className="muted">{MODEL_NAME[chat.model]} · {EFFORT_NAME[chat.effort]}</span></div>
        <span className="muted ac-hint">{TRUST_HINT[trust]}</span>
        {chat.always.map((a) => (
          <div key={a} className="ac-work-row">
            <span className="ac-file" title={a}>{a}</span><span className="muted">{t('늘', 'Always')}</span>
            <button className="icon-btn sm" aria-label={t('늘 허락 빼기', 'Stop always allowing')} data-tip={t('다시 묻게 합니다', 'Ask again next time')} onClick={() => void forget(a)}>{Icon.x}</button>
          </div>
        ))}
      </section>
      {!!agents.length && (
        <section data-ui="하위 에이전트">
          <h3>{t('하위 에이전트', 'Subagents')}</h3>
          {agents.map((s, i) => <div key={i} className="ac-work-row"><span className="ac-file" title={s.summary}>{s.summary}</span></div>)}
        </section>
      )}
      {!!results.length && <div className="muted ac-hint ac-usage">{t(`차례 ${results.length}번`, `${results.length} turn${results.length > 1 ? 's' : ''}`)}{secs > 0 && ` · ${secs < 60 ? t(`${secs}초`, `${secs}s`) : t(`${Math.round(secs / 60)}분`, `${Math.round(secs / 60)} min`)}`}{cost > 0 && ` · $${cost.toFixed(2)}`}</div>}
    </aside>
  )
}

// ---------- 레일 "에이전트" 화면 ----------

export function AgentPage({ id, onSaved }: { id?: string; onSaved(m: string): void }) {
  return (
    <main className="stage full" data-ui="에이전트">
      <section className="pane">
        {id
          ? <div className="ac-page"><ChatView key={id} id={id} onDeleted={() => go({ page: 'agent' })} onSaved={onSaved} /><WorkColumn id={id} /></div>
          : <div className="scroll"><div className="page-body ac-start">
            <h1 className="ac-h">{t('새 대화', 'New conversation')}</h1>
            <NewChat onCreated={(c) => go({ page: 'agent', id: c.id })} />
          </div></div>}
      </section>
    </main>
  )
}

type Filter = 'mine' | 'live' | 'all'
const FILTER_NAME: Record<Filter, string> = { mine: t('내 차례', 'My turn'), live: t('일하는 중', 'Working'), all: t('모두', 'All') }

/** 사이드바: 새 대화, 걸러 보기(내 차례 · 일하는 중 · 모두), 프로젝트마다 대화 줄 */
export function AgentSide({ id }: { id?: string }) {
  const list = useChatList().data?.chats
  const projects = useProjects()
  const [filter, setFilterState] = useState<Filter>(() => store.get<Filter>('rw-agent-filter', 'all'))
  const setFilter = (f: Filter) => { setFilterState(f); store.set('rw-agent-filter', f) }
  const count = (f: Filter) => (list ?? []).filter((c) => (f === 'mine' ? myTurn(c) : f === 'live' ? isLive(c.state) && !myTurn(c) : true)).length
  const groups = useMemo(() => {
    const keep = (c: ChatRow) => (filter === 'mine' ? myTurn(c) : filter === 'live' ? isLive(c.state) && !myTurn(c) : true)
    const by = new Map<string, ChatRow[]>()
    for (const c of [...(list ?? [])].filter(keep).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))) by.set(c.rid, [...(by.get(c.rid) ?? []), c])
    return [...by.entries()]
  }, [list, filter])
  return (
    <div className="set-side ac-side" data-ui="대화 목록">
      <button className={`nav${!id ? ' on' : ''}`} data-ui="새 대화 줄" onClick={() => go({ page: 'agent' })}><span className="label">{t('＋ 새 대화', '＋ New conversation')}</span></button>
      {!!list?.length && (
        <div className="segmented small full ac-filter" role="radiogroup" aria-label={t('걸러 보기', 'Filter')} data-ui="대화 필터">
          {(['mine', 'live', 'all'] as const).map((f) => <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{FILTER_NAME[f]}{f !== 'all' && count(f) ? ` ${count(f)}` : ''}</button>)}
        </div>
      )}
      {list && !list.length && <div className="empty">{t('대화가 아직 없습니다. 새 대화로 일을 맡기세요.', 'No conversations yet. Start one to hand off work.')}</div>}
      {list && !!list.length && !groups.length && <div className="empty">{filter === 'mine' ? t('답할 대화가 없습니다', 'Nothing waits for you') : t('일하는 대화가 없습니다', 'No conversation is working')}</div>}
      {groups.map(([rid, chats]) => (
        <div key={rid}>
          <div className="ac-side-h">{projects?.find((p) => p.id === rid)?.title ?? rid}</div>
          {chats.map((c) => <ChatLine key={c.id} c={c} on={c.id === id} onOpen={() => go({ page: 'agent', id: c.id })} />)}
        </div>
      ))}
    </div>
  )
}

/** 레일 배지: 답을 기다리는 대화 수 (사용자 차례) */
export function AgentRailCount() {
  const list = useChatList().data?.chats
  const n = list?.filter((c) => c.state === 'waiting').length ?? 0
  return n ? <span className="rail-count" title={t(`답을 기다리는 대화 ${n}개`, `${n} conversation(s) waiting for you`)}>{n}</span> : null
}

// ---------- 상단바 반짝이: 오른쪽 사이드바 자리의 패널 ----------

/** 지금 프로젝트의 대화. 머리에서 대화를 고르고(▾) · 새 대화 · 에이전트 화면에서 넓게 보기. 연 대화는 프로젝트마다 기억한다 */
export function AgentPanel({ rid, note, onSaved }: { rid: string; note?: { file: string; title: string }; onSaved(m: string): void }) {
  const key = `rw-agent-panel-${rid}`
  const [open, setOpenState] = useState<string | null>(() => store.get<string | null>(key, null))
  const setOpen = (v: string | null) => { setOpenState(v); store.set(key, v) }
  const list = useChatList(rid).data?.chats
  const known = open && list?.some((c) => c.id === open)
  const current = open && (known || !list) ? open : null
  const chat = list?.find((c) => c.id === current)
  const auto: Attach | undefined = note ? { kind: 'note', ref: note.file, label: note.title } : undefined
  const sorted = [...(list ?? [])].sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))
  return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      <div className="rs-head ac-panel-head">
        <span className="ac-panel-name" aria-hidden>{Icon.spark}</span>
        <select className="rs-select ac-switch" data-ui="대화 고르기" aria-label={t('대화 고르기', 'Pick a conversation')} value={current ?? ''} onChange={(e) => setOpen(e.target.value || null)}>
          <option value="">{t('새 대화', 'New conversation')}</option>
          {sorted.map((c) => <option key={c.id} value={c.id}>{c.title}{myTurn(c) ? ` · ${STATE_NAME[c.state]}` : ''}</option>)}
        </select>
        {chat && <ChatStateMark state={chat.state} />}
        <span className="sp" />
        {current && <button className="icon-btn sm" data-ui="새 대화 버튼" data-tip={t('새 대화', 'New conversation')} aria-label={t('새 대화', 'New conversation')} onClick={() => setOpen(null)}>{Icon.plus}</button>}
        {current && <button className="icon-btn sm" data-ui="넓게 보기" data-tip={t('에이전트 화면에서 넓게 보기', 'Open wide in the agent page')} aria-label={t('넓게 보기', 'Open wide')} onClick={() => go({ page: 'agent', id: current })}>{Icon.openNote}</button>}
      </div>
      {current
        ? <PanelChat key={current} id={current} auto={auto} onDeleted={() => setOpen(null)} onSaved={onSaved} />
        : (
          <div className="rs-scroll ac-panel-list">
            <NewChat rid={rid} note={note} onCreated={(c) => setOpen(c.id)} />
            {!!sorted.length && <>
              <div className="ac-side-h">{t('이 프로젝트의 대화', 'Conversations in this project')}</div>
              <div className="set-side">{sorted.map((c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => setOpen(c.id)} />)}</div>
            </>}
          </div>
        )}
    </div>
  )
}

/** 패널 안의 대화: 머리 대신 한 줄(범위 · 멈추기 · 지우기)과 할 일 요약 */
function PanelChat({ id, auto, onDeleted, onSaved }: { id: string; auto?: Attach; onDeleted(): void; onSaved(m: string): void }) {
  const chat = useChat(id).data
  const [fail, setFail] = useState<string | null>(null)
  return (
    <div className="ac-panel-chat">
      {chat && <ChatHead chat={chat} onDeleted={onDeleted} onSaved={onSaved} onError={setFail} />}
      {fail && <div className="error-text ac-hint">{fail}</div>}
      <ChatView id={id} auto={auto} head={false} onDeleted={onDeleted} onSaved={onSaved} />
    </div>
  )
}

