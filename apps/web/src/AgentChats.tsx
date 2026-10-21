import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, api, notesApi, type AskAnswer, type Attach, type AttachKind, type Chat, type ChatEffort, type ChatItem, type ChatMessageBody, type ChatMode, type ChatModel, type ChatRow, type ChatScope, type ChatSettings, type ChatState, type ImageIn, type Todo } from './api'
import { askConfirm } from './askText'
import { relativeTime } from './format'
import { t } from './i18n'
import { Icon } from './icons'
import { MemoText } from './memo'
import { qk } from './queries'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { useDismiss } from './useDismiss'

/**
 * 에이전트 대화 (10/21 "프로젝트 관리 먼저", 같은 날 "에이전트 창 구조 다시" · "코덱스와 Claude 앱 더 참고"):
 * 앱이 맥의 Claude Code를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다(서버 agentChats.ts).
 * - 레일 "에이전트" 화면(AgentPage · AgentSide): 모든 프로젝트의 대화 목록 · 대화 · 오른쪽 세부 패널(바뀐 곳 · 작업)
 * - 상단바 반짝이(AgentPanel): 지금 프로젝트의 대화를 오른쪽 사이드바 자리에서. 지금 보는 노트가 저절로 붙는다
 * - 입력란(Composer): / 명령 · @ 붙이기 · 그림, 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기(도는 중에는 멈추기)
 * - 대화: 에이전트 글은 본문처럼, 도구는 "n초 동안 일함 ›" 한 줄로 접고, 계획 · 허락은 번호 붙은 세 답(1 · 2 · 3)
 * - 입력란 바로 위: 할 일 한 줄, 도는 동안 보낸 말("다음에 보냄")
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
const WAIT_NAME: Record<NonNullable<ChatRow['wait']>, string> = { plan: t('계획 승인 기다림', 'Plan waits for you'), ask: t('허락 기다림', 'Needs approval') }
const stateName = (c: Pick<ChatRow, 'state' | 'wait'>) => (c.state === 'waiting' && c.wait ? WAIT_NAME[c.wait] : STATE_NAME[c.state])

/** 대화 상태: 일하는 중은 진행 점, 사용자 차례(허락 · 계획)는 주황 점, 오류는 위험 색 글자, 나머지는 옅은 이름 */
export function ChatStateMark({ state, label, name: given }: { state: ChatState; label?: boolean; name?: string }) {
  const name = given ?? STATE_NAME[state]
  if (state === 'running') return <span className="ac-state"><StatusDot s="in-progress" name={name} label={label} /></span>
  if (state === 'waiting') return <span className="ac-state" title={name}><span className="turn-dot" role="img" aria-label={name} />{label && <span className="g-name">{name}</span>}</span>
  if (state === 'error') return <span className="ac-state error-text">{name}</span>
  return label || state === 'queued' ? <span className="ac-state muted">{name}</span> : null
}

/** +n −n (노트 고침에서 더하고 뺀 줄) */
function Delta({ added, removed }: { added: number; removed: number }) {
  return <span className="ac-delta"><span className="ac-add">+{added}</span><span className="ac-del">−{removed}</span></span>
}

// ---------- 맡기는 정도 · 모델 · 생각 깊이 ----------

/** 맡기는 정도: 읽기만(write read) 또는 고치는 대화의 모드 셋 */
export type Trust = 'read' | ChatMode
const TRUSTS: Trust[] = ['read', 'ask', 'plan', 'edit']
const TRUST_NAME: Record<Trust, string> = { read: t('읽기만', 'Read only'), ask: t('묻고 하기', 'Ask first'), plan: t('계획 먼저', 'Plan first'), edit: t('고치기 바로', 'Edit freely') }
const TRUST_HINT: Record<Trust, string> = {
  read: t('읽고 답만 합니다. 명령은 묻고 돌립니다', 'Reads and answers only. Commands ask first'),
  ask: t('노트 고치기와 명령을 하나씩 묻습니다', 'Asks before each note edit and command'),
  plan: t('먼저 계획을 보이고, 승인할 때 이어 갈 방법을 고릅니다', 'Shows a plan first; you choose how to continue when you approve it'),
  edit: t('범위 안 노트를 바로 고칩니다. 명령 · 웹 · 범위 밖은 묻거나 막습니다', 'Edits notes in scope right away. Commands, web and out-of-scope work ask or are blocked'),
}
export const trustOf = (c: { write: string; mode: ChatMode }): Trust => (c.write === 'read' ? 'read' : c.mode)
const settingsOf = (v: Trust): ChatSettings => (v === 'read' ? { write: 'read' } : { write: 'notes', mode: v })
/** ⇧⇥: 다음 맡기는 정도 */
export const nextTrust = (v: Trust): Trust => TRUSTS[(TRUSTS.indexOf(v) + 1) % TRUSTS.length]!
const MODEL_NAME: Record<ChatModel, string> = { default: t('기본 모델', 'Default model'), opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }
const EFFORT_NAME: Record<ChatEffort, string> = { low: t('생각 얕게', 'Think less'), medium: t('생각 보통', 'Think normally'), high: t('생각 깊게', 'Think more') }
/** 입력란 아래 줄의 짧은 이름 (좁은 패널에서도 한 줄) */
const EFFORT_SHORT: Record<ChatEffort, string> = { low: t('얕게', 'Less'), medium: t('보통', 'Normal'), high: t('깊게', 'More') }

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

/** 목록 한 줄: 상태 점 · 이름, 아래 줄에 무엇을 기다리는지(상태) · +n −n · 시각 */
function ChatLine({ c, on, onOpen }: { c: ChatRow; on: boolean; onOpen(): void }) {
  return (
    <button className={`nav ac-line${on ? ' on' : ''}`} data-ui="대화 줄" data-ui-item={c.title} title={c.title} onClick={onOpen}>
      <span className="ac-line-top"><span className="ac-line-dot"><ChatStateMark state={c.state} name={stateName(c)} /></span><span className="label">{c.title}</span></span>
      <span className="ac-line-meta">
        {stateName(c)}
        {(c.added > 0 || c.removed > 0) && <> · <Delta added={c.added} removed={c.removed} /></>}
        {` · ${relativeTime(Date.parse(c.updated))}`}
      </span>
    </button>
  )
}

// ---------- 대화 줄들 ----------

type Step = Extract<ChatItem, { kind: 'step' }>
/** until = 이 도구 묶음 다음 줄의 시각 (얼마나 일했는지) */
type Block = { kind: 'steps'; items: Step[]; until?: string } | { kind: 'one'; item: Exclude<ChatItem, { kind: 'step' }> }

/** 이어진 도구 줄은 한 묶음으로 (요약 한 줄, 펼치면 모두). 할 일 줄은 입력란 위에 따로 보이므로 대화에서 뺀다 */
export function blocksOf(items: ChatItem[]): Block[] {
  const out: Block[] = []
  for (const it of items) {
    const last = out[out.length - 1]
    if (it.kind === 'step') {
      if (last?.kind === 'steps') last.items.push(it)
      else out.push({ kind: 'steps', items: [it] })
      continue
    }
    if (it.kind === 'todos' || (it.kind === 'user' && it.queued)) continue
    if (last?.kind === 'steps') last.until = it.at
    out.push({ kind: 'one', item: it })
  }
  return out
}

const isAgentStep = (s: Step) => s.tool === 'Task' || s.tool === 'Agent'
const isReadStep = (s: Step) => /^(Read|Grep|Glob|LS|NotebookRead)$|^(read|list|search|get)_/.test(s.tool)

const secondsName = (s: number) => (s < 60 ? t(`${s}초`, `${s}s`) : t(`${Math.round(s / 60)}분`, `${Math.round(s / 60)} min`))

/** 도구 묶음의 요약: n초 동안 일함 · 읽기 n번 · 도구 n번 · 하위 에이전트 n (범위 밖 n) */
export function stepsSummary(items: Step[], until?: string): string {
  const agents = items.filter(isAgentStep).length
  const reads = items.filter(isReadStep).length
  const outside = items.filter((s) => s.outside).length
  const tools = items.length - agents - reads
  const from = Date.parse(items[0]?.at ?? '')
  const to = Date.parse(until ?? items[items.length - 1]?.at ?? '')
  const secs = Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 1000) : 0
  return [
    secs >= 1 ? t(`${secondsName(secs)} 동안 일함`, `Worked for ${secondsName(secs)}`) : '',
    reads ? t(`읽기 ${reads}번`, `${reads} read${reads > 1 ? 's' : ''}`) : '',
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

function Steps({ items, until }: { items: Step[]; until?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="ac-steps">
      <button className="a ac-steps-toggle" data-ui="도구 줄 펼치기" aria-expanded={open} onClick={() => setOpen(!open)}>
        {stepsSummary(items, until)} {open ? '▾' : '›'}
      </button>
      {open && items.map((s, i) => <StepLine key={i} s={s} />)}
    </li>
  )
}

// ---------- 계획 · 허락: 번호 붙은 세 답 ----------

interface Choice { label: string; ui: string; run(): void }

/**
 * 번호 붙은 답 (Claude Code · 코덱스의 허락 고르기와 같은 모양): 1 · 2 · 3 키로 고른다.
 * 마지막 답(아니요, …)은 그 자리에 할 말 칸을 연다
 */
function Choices({ choices, say, busy }: { choices: Choice[]; say?: { label: string; placeholder: string; send(note: string): void }; busy: boolean }) {
  const [saying, setSaying] = useState(false)
  const [note, setNote] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // 입력 중이 아니면 첫 답에 초점 (번호 키로 바로 답한다)
    const a = document.activeElement
    if (!a || a === document.body) first.current?.focus({ preventScroll: true })
  }, [])
  const all = [...choices, ...(say ? [{ label: say.label, ui: '다르게 말하기', run: () => setSaying(true) }] : [])]
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (saying || e.metaKey || e.ctrlKey || e.altKey) return
    const n = Number(e.key)
    if (n >= 1 && n <= all.length) { e.preventDefault(); all[n - 1]!.run() }
  }
  return (
    <div className="ac-choices" role="group" onKeyDown={onKey}>
      {all.map((c, i) => (
        <button key={c.ui} ref={i === 0 ? first : undefined} className={`ac-choice${saying && i === all.length - 1 ? ' on' : ''}`} data-ui={c.ui} disabled={busy} onClick={c.run}>
          <span className="ac-choice-n mono">{i + 1}</span><span>{c.label}</span>
        </button>
      ))}
      {say && saying && (
        <div className="ac-say-box">
          <textarea rows={2} autoFocus value={note} placeholder={say.placeholder} aria-label={say.placeholder}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Escape') { e.preventDefault(); setSaying(false) }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); say.send(note.trim()) }
            }} />
          <div className="ac-card-row"><span className="sp" /><button className="btn sm" onClick={() => setSaying(false)}>{t('취소', 'Cancel')}</button><button className="btn primary sm" data-ui="다르게 말하기 보내기" disabled={busy} onClick={() => say.send(note.trim())}>{t('보내기', 'Send')}</button></div>
        </div>
      )}
    </div>
  )
}

function useAnswer(chat: Chat, id: string, onError: (m: string) => void) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const answer = async (a: AskAnswer, more?: { note?: string; mode?: ChatMode }) => {
    setBusy(true)
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.answer(chat.id, id, a, more)) } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  return { busy, answer }
}

type Ask = Extract<ChatItem, { kind: 'ask' }>

const answeredName = (it: Ask): string => {
  if (it.plan !== undefined) {
    if (it.answer === 'deny') return t('계획을 고쳐 달라고 함', 'Asked to revise the plan')
    return it.mode ? t(`계획 승인함 · ${TRUST_NAME[it.mode]}`, `Plan approved · ${TRUST_NAME[it.mode]}`) : t('계획 승인함', 'Plan approved')
  }
  return it.answer === 'allow' ? t('허락함', 'Allowed') : it.answer === 'always' ? t('이 대화에서 늘 허락함', 'Always allowed here') : t('거절함', 'Declined')
}

function AskCard({ chat, it, onError }: { chat: Chat; it: Ask; onError(m: string): void }) {
  const { busy, answer } = useAnswer(chat, it.id, onError)
  return (
    <li className={`ac-card ac-ask${it.answer ? ' done' : ' wait'}`} data-ui="허락 카드">
      <div className="ac-card-head">
        {!it.answer && <span className="turn-dot" aria-hidden />}
        <b>{it.answer ? answeredName(it) : t('허락이 필요합니다', 'Approval needed')}</b>
        <span className="ac-tool mono">{it.tool}</span>
      </div>
      <code className="ac-ask-sum">{it.summary}</code>
      {it.note && <div className="muted ac-hint">{t('한 말', 'Said')}: {it.note}</div>}
      {!it.answer && (
        <Choices busy={busy}
          choices={[
            { label: t('네', 'Yes'), ui: '허락 버튼', run: () => void answer('allow') },
            { label: t('네, 이 대화에서 이것은 늘', 'Yes, always for this in this conversation'), ui: '늘 허락 버튼', run: () => void answer('always') },
          ]}
          say={{ label: t('아니요, 다르게 하라고 말하기', 'No, tell it what to do instead'), placeholder: t('어떻게 하라고 할까요? (비워 두면 그냥 거절)', 'What should it do instead? (empty = just decline)'), send: (note) => void answer('deny', note ? { note } : undefined) }} />
      )}
    </li>
  )
}

/** 계획 먼저: 에이전트가 보인 계획. 승인할 때 이어 갈 맡기는 정도(고치기 바로 · 묻고 하기)를 함께 고른다 */
function PlanCard({ chat, it, onError }: { chat: Chat; it: Ask; onError(m: string): void }) {
  const { busy, answer } = useAnswer(chat, it.id, onError)
  return (
    <li className={`ac-card ac-plan${it.answer ? ' done' : ' wait'}`} data-ui="계획 카드">
      <div className="ac-card-head">
        {!it.answer && <span className="turn-dot" aria-hidden />}
        <b>{it.answer ? answeredName(it) : t('계획', 'Plan')}</b>
      </div>
      <MemoText text={it.plan ?? ''} />
      {it.note && <div className="muted ac-hint">{t('한 말', 'Said')}: {it.note}</div>}
      {!it.answer && <>
        <div className="muted ac-hint ac-choices-q">{t('이대로 할까요? 명령은 승인 뒤에도 묻습니다', 'Go ahead? Commands still ask after approval')}</div>
        <Choices busy={busy}
          choices={[
            { label: t('네, 노트는 바로 고치기', 'Yes, edit notes right away'), ui: '계획 승인 버튼', run: () => void answer('allow', { mode: 'edit' }) },
            { label: t('네, 고칠 때마다 묻기', 'Yes, ask before each edit'), ui: '계획 승인 묻기 버튼', run: () => void answer('allow', { mode: 'ask' }) },
          ]}
          say={{ label: t('아니요, 이렇게 바꿔서…', 'No, change it like this…'), placeholder: t('계획에서 무엇을 바꿀까요?', 'What should change in the plan?'), send: (note) => void answer('deny', note ? { note } : undefined) }} />
      </>}
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

/** 입력란 바로 위 할 일 한 줄 (지금 하는 일), 누르면 목록 */
function TodoBar({ todos }: { todos: Todo[] }) {
  const [open, setOpen] = useState(false)
  const now = todos.find((x) => x.state === 'in_progress') ?? todos.find((x) => x.state === 'pending')
  return (
    <div className="ac-bar ac-todo-bar" data-ui="할 일 줄">
      <button className="ac-bar-line" aria-expanded={open} onClick={() => setOpen(!open)}>
        <TodoMark s={now?.state ?? 'completed'} />
        <span className="ac-bar-text">{todoCount(todos)}{now && ` · ${now.text}`}</span>
        <span className="muted">{open ? '▾' : '›'}</span>
      </button>
      {open && <TodoList todos={todos} />}
    </div>
  )
}

const reviewOf = (rid: string, file: string) => go({ page: 'review', key: `note:${rid}:${file}` })

/** 노트 고침: 대화 안에는 한 줄(무엇을 · +n −n), 바뀐 곳은 오른쪽 칸과 수정 검토에서 */
function EditLine({ chat, it, onChanges }: { chat: Chat; it: Extract<ChatItem, { kind: 'edit' }>; onChanges?(): void }) {
  return (
    <li className="ac-edit-line" data-ui="노트 고침 줄">
      <span className="ac-edit-what">{t('노트 고침', 'Edited')}</span>
      <span className="mono ac-file" title={it.file}>{it.file}</span>
      <Delta added={it.added} removed={it.removed} />
      <button className="a ac-edit-go" data-ui="바뀐 곳 보기" onClick={() => (onChanges ? onChanges() : reviewOf(chat.rid, it.file))}>{onChanges ? t('바뀐 곳 보기', 'View changes') : t('수정 검토에서 보기', 'Open in edit review')}</button>
      {it.reason && <span className="muted ac-hint ac-edit-why">{it.reason}</span>}
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

function ItemView({ chat, it, onError, onChanges }: { chat: Chat; it: Exclude<ChatItem, { kind: 'step' }>; onError(m: string): void; onChanges?(): void }) {
  const when = new Date(it.at).toLocaleString()
  switch (it.kind) {
    case 'user': return (
      <li className="ac-me" data-ui="내 지시" title={when}>
        <MemoText text={it.text} />
        <AttachChips attach={it.attach} images={it.images} />
      </li>
    )
    case 'text': return <li className={`ac-text${it.sub ? ' sub' : ''}`} data-ui="에이전트 글" title={when}>{it.sub && <span className="muted ac-hint">{t('하위 에이전트', 'Subagent')}</span>}<MemoText text={it.text} /></li>
    case 'ask': return it.plan !== undefined ? <PlanCard chat={chat} it={it} onError={onError} /> : <AskCard chat={chat} it={it} onError={onError} />
    case 'todos': return null
    case 'edit': return <EditLine chat={chat} it={it} onChanges={onChanges} />
    case 'blocked': return <li className="ac-note" data-ui="막은 일"><span className="ac-tool mono">{it.tool}</span><span>{t('막음', 'Blocked')} · {it.reason}</span></li>
    case 'result': return <li className="ac-note muted" data-ui="차례 끝">{it.ok ? `✓ ${t('이번 차례 끝', 'Turn done')}` : t('이번 차례 실패', 'Turn failed')}{it.seconds !== undefined && ` · ${secondsName(it.seconds)}`}{it.cost !== undefined && it.cost > 0 && ` · $${it.cost.toFixed(2)}`}</li>
    case 'error': return <li className="ac-note error-text" data-ui="대화 오류">! {it.text}</li>
  }
}

// ---------- 입력란 ----------

type Menu = { kind: '/' | '@'; start: number; query: string }
type MenuPick = { key: string; label: string; meta?: string; run(): void }

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

/** 입력란 아래 줄의 작은 메뉴 버튼 (＋ · 맡기는 정도 · 모델과 생각) */
function PopButton({ label, ui, tip, children, wide }: { label: ReactNode; ui: string; tip: string; children(close: () => void): ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  return (
    <span className="ac-pop" ref={box}>
      <button className={`ac-pop-btn${open ? ' on' : ''}`} data-ui={ui} data-tip={open ? undefined : tip} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div className={`menu ac-pop-menu${wide ? ' wide' : ''}`} role="menu" data-ui={`${ui} 항목`}>{children(() => setOpen(false))}</div>}
    </span>
  )
}

/**
 * 에이전트 입력란: 붙인 것(지금 보는 노트는 저절로) · 글 칸(/ 명령 · @ 붙이기 · 그림 붙여넣기),
 * 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기(도는 중이고 글이 없으면 멈추기). ⇧⇥로 맡기는 정도를 바꾼다.
 * 대화 중에 바꾼 설정은 다음 차례부터 (onSettings)
 */
function Composer({ rid, auto, settings, onSettings, onSubmit, onStop, placeholder, fail: outerFail, fill, autoFocus }: {
  rid: string
  auto?: Attach
  settings: Settings
  onSettings(s: Partial<Settings>): void
  onSubmit(m: ChatMessageBody): Promise<boolean>
  /** 도는 중이면 멈추기 (글이 비었을 때 보내기 자리) */
  onStop?(): void
  placeholder: string
  fail?: string | null
  /** 바깥에서 글 칸을 채울 때 (기다리는 지시 고치기). n이 바뀌면 채운다 */
  fill?: { text: string; n: number }
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
  const file = useRef<HTMLInputElement>(null)
  useInbox(rid, (got) => { setAttach((a) => [...a, ...got]); box.current?.focus() })
  const autoKey = auto ? `${auto.kind}:${auto.ref}` : ''
  useEffect(() => setAutoOff(false), [autoKey])
  useEffect(() => { if (fill) { setText(fill.text); setCaret(fill.text.length); box.current?.focus() } }, [fill?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (() => { const m = menuAt(text, caret); return m && m.start !== closed ? m : null })()
  const notes = useQuery({ queryKey: qk.notes(rid), queryFn: () => notesApi(rid).list(), enabled: menu?.kind === '@' }).data
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: menu?.kind === '@' }).data
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree(), enabled: menu?.kind === '@' && (menu.query.length >= 2) }).data

  const focusAt = (at: number) => requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at) })
  const replaceToken = (insert: string) => {
    if (!menu) return
    const v = text.slice(0, menu.start) + insert + text.slice(caret)
    setText(v)
    const at = menu.start + insert.length
    setCaret(at)
    focusAt(at)
  }
  const addAttach = (a: Attach) => { setAttach((xs) => (xs.some((x) => x.kind === a.kind && x.ref === a.ref && !x.text) ? xs : [...xs, a])); replaceToken('') }

  const picks: MenuPick[] = (() => {
    if (!menu) return []
    const q = menu.query.toLowerCase()
    if (menu.kind === '/') {
      return COMMANDS.filter((c) => c.cmd.slice(1).toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q))
        .map((c) => ({ key: c.cmd, label: c.cmd, meta: c.label, run: () => { setText(c.text); setCaret(c.text.length); requestAnimationFrame(() => box.current?.focus()) } }))
    }
    const has = (s: string) => s.toLowerCase().includes(q)
    const out: MenuPick[] = []
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
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onSettings({ trust: nextTrust(settings.trust) }); return }
    if (e.key === 'Escape' && onStop && !text) { e.preventDefault(); onStop(); return }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
  }
  const startToken = (ch: '@' | '/') => {
    if (ch === '/') { setText('/'); setCaret(1); setClosed(null); focusAt(1); return }
    const at = box.current?.selectionStart ?? text.length
    const pre = text.slice(0, at)
    const insert = `${pre && !/\s$/.test(pre) ? ' ' : ''}@`
    setText(pre + insert + text.slice(at)); setClosed(null)
    setCaret(at + insert.length)
    focusAt(at + insert.length)
  }
  const stopping = !!onStop && !text.trim()
  const shownFail = fail ?? outerFail

  return (
    <div className="ac-composer" data-ui="에이전트 입력란" onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}>
      {(all.length > 0 || images.length > 0) && (
        <div className="ac-chips">
          {auto && !autoOff && <span className="tag ac-chip" title={auto.ref}>{ATTACH_NAME[auto.kind]} · {auto.label}<button className="ac-chip-x" aria-label={t('빼기', 'Remove')} onClick={() => setAutoOff(true)}>{Icon.x}</button></span>}
          {attach.map((a, i) => <span key={i} className="tag ac-chip" title={a.text ?? a.ref}>{ATTACH_NAME[a.kind]} · {a.label}<button className="ac-chip-x" aria-label={t('빼기', 'Remove')} onClick={() => setAttach((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
          {images.map((im, i) => <span key={`i${i}`} className="tag ac-chip" title={im.name}>{t('그림', 'Image')} · {im.name}<button className="ac-chip-x" aria-label={t('빼기', 'Remove')} onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
        </div>
      )}
      <div className="ac-input">
        <textarea ref={box} rows={2} value={text} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
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
      {shownFail && <span className="error-text ac-hint">{shownFail}</span>}
      <div className="ac-compose-row">
        <PopButton ui="붙이기 버튼" tip={t('붙이기 · 명령 · 그림', 'Attach · commands · images')} label={<span className="ac-pop-ico">{Icon.plus}</span>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); startToken('@') }}>{t('노트 · 주제 · 파일 붙이기', 'Attach a note, topic or file')}<span className="muted mono ac-key">@</span></button>
            <button role="menuitem" onClick={() => { close(); startToken('/') }}>{t('명령', 'Commands')}<span className="muted mono ac-key">/</span></button>
            <button role="menuitem" onClick={() => { close(); file.current?.click() }}>{t('그림 고르기', 'Choose images')}<span className="muted ac-key">{t('붙여넣기도', 'or paste')}</span></button>
          </>}
        </PopButton>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = '' }} />
        <PopButton ui="맡기는 정도" tip={t('얼마나 맡길지 (⇧⇥)', 'How much to hand over (⇧⇥)')} wide label={<>{TRUST_NAME[settings.trust]} ▾</>}>
          {(close) => TRUSTS.map((v) => (
            <button key={v} role="menuitemradio" aria-checked={settings.trust === v} className={`ac-pop-item${settings.trust === v ? ' on' : ''}`} onClick={() => { close(); onSettings({ trust: v }) }}>
              <span className="ac-pop-check" aria-hidden>{settings.trust === v ? Icon.check : null}</span>
              <span className="ac-pop-what"><span>{TRUST_NAME[v]}</span><span className="muted">{TRUST_HINT[v]}</span></span>
            </button>
          ))}
        </PopButton>
        <PopButton ui="모델 고르기" tip={t('모델 · 생각 깊이', 'Model · thinking')} label={<>{MODEL_NAME[settings.model]} · {EFFORT_SHORT[settings.effort]} ▾</>}>
          {(close) => <>
            <div className="ac-pop-h">{t('모델', 'Model')}</div>
            {(Object.keys(MODEL_NAME) as ChatModel[]).map((m) => <button key={m} role="menuitemradio" aria-checked={settings.model === m} className={settings.model === m ? 'on' : ''} onClick={() => { close(); onSettings({ model: m }) }}><span className="ac-pop-check" aria-hidden>{settings.model === m ? Icon.check : null}</span>{MODEL_NAME[m]}</button>)}
            <div className="ac-pop-h">{t('생각', 'Thinking')}</div>
            {(Object.keys(EFFORT_NAME) as ChatEffort[]).map((m) => <button key={m} role="menuitemradio" aria-checked={settings.effort === m} className={settings.effort === m ? 'on' : ''} onClick={() => { close(); onSettings({ effort: m }) }}><span className="ac-pop-check" aria-hidden>{settings.effort === m ? Icon.check : null}</span>{EFFORT_NAME[m]}</button>)}
          </>}
        </PopButton>
        <span className="sp" />
        {stopping
          ? <button className="ac-send stop" data-ui="대화 멈추기" data-tip={t('멈추기 (Esc)', 'Stop (Esc)')} aria-label={t('멈추기', 'Stop')} onClick={onStop}><span className="ac-stop-sq" aria-hidden /></button>
          : <button className="ac-send" data-ui="지시 보내기" data-tip={t('보내기 (⌘↵)', 'Send (⌘↵)')} aria-label={t('보내기', 'Send')} disabled={busy || !text.trim()} onClick={() => void submit()}>{Icon.up}</button>}
      </div>
    </div>
  )
}

// ---------- 대화 하나 ----------

/** 대화의 머리: 이름 · 프로젝트 · 범위, 오른쪽 상태 · +n −n 바뀐 곳 · 작업 · ⋯(보관 · 지우기) */
function ChatHead({ chat, onBack, pane, onPane, onDeleted, onSaved, onError }: {
  chat: Chat
  onBack?(): void
  /** 오른쪽 세부 패널(바뀐 곳 · 작업)이 열렸는지와 여닫기. 없으면(패널) 바뀐 곳은 에이전트 화면에서 연다 */
  pane?: boolean
  onPane?(): void
  onDeleted(): void
  onSaved(m: string): void
  onError(m: string): void
}) {
  const client = useQueryClient()
  const projects = useProjects()
  const topics = useQuery({ queryKey: qk.topics(chat.rid), queryFn: () => api.research(chat.rid).topics(), enabled: chat.scope.kind === 'topic' }).data
  const project = projects?.find((p) => p.id === chat.rid)?.title ?? chat.rid
  const live = isLive(chat.state)
  const remove = async () => {
    if (!await askConfirm({ title: t('이 대화를 지울까요?', 'Delete this conversation?'), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토는 그대로 남습니다. 지우지 않고 숨기려면 보관함에 넣으세요.', 'Only the conversation is deleted. Notes, records and edit review stay. To hide it without deleting, archive it.'), ok: t('지우기', 'Delete') })) return
    try { await agentChatsApi.remove(chat.id); void client.invalidateQueries({ queryKey: qk.agentChats }); onSaved(t('대화를 지웠습니다', 'Conversation deleted')); onDeleted() } catch (e) { onError((e as Error).message) }
  }
  const archive = async (v: boolean) => {
    try {
      client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.archive(chat.id, v))
      void client.invalidateQueries({ queryKey: qk.agentChats })
      onSaved(v ? t('보관함에 넣었습니다', 'Archived') : t('보관함에서 꺼냈습니다', 'Unarchived'))
    } catch (e) { onError((e as Error).message) }
  }
  const added = chat.items.reduce((s, i) => s + (i.kind === 'edit' ? i.added : 0), 0)
  const removed = chat.items.reduce((s, i) => s + (i.kind === 'edit' ? i.removed : 0), 0)
  return (
    <div className="ac-head" data-ui="대화 헤더">
      {onBack && <button className="icon-btn sm" data-ui="대화 목록으로" data-tip={t('대화 목록', 'Conversations')} aria-label={t('대화 목록으로', 'Back to conversations')} onClick={onBack}>{Icon.back}</button>}
      <div className="ac-head-what">
        <div className="ac-title" title={chat.title}>{chat.title}</div>
        <div className="ac-meta">
          <button className="a" data-ui="대화 프로젝트" onClick={() => go({ page: 'overview', rid: chat.rid })}>{project}</button>
          <span>·</span><span>{scopeName(chat.scope, topics)}</span>
          {chat.archived && <span className="tag">{t('보관함', 'Archived')}</span>}
        </div>
      </div>
      <ChatStateMark state={chat.state} label name={stateName({ state: chat.state, wait: chat.items.some((i) => i.kind === 'ask' && !i.answer && i.plan !== undefined) ? 'plan' : 'ask' })} />
      {!!chat.changed.length && (
        <button className={`btn sm ac-changes-btn${pane ? ' on' : ''}`} data-ui="바뀐 곳 버튼" aria-pressed={onPane ? !!pane : undefined} data-tip={onPane ? t('바뀐 곳 · 작업 패널 여닫기', 'Show or hide changes and work') : t('에이전트 화면에서 바뀐 곳 보기', 'View changes in the agent page')}
          onClick={() => (onPane ? onPane() : go({ page: 'agent', id: chat.id }))}>
          <Delta added={added} removed={removed} />{t('바뀐 곳', 'Changes')}
        </button>
      )}
      {onPane && !chat.changed.length && <button className={`btn sm${pane ? ' on' : ''}`} data-ui="작업 버튼" aria-pressed={!!pane} onClick={onPane}>{t('작업', 'Work')}</button>}
      <HeadMore live={live} archived={!!chat.archived} onArchive={(v) => void archive(v)} onRemove={() => void remove()} />
    </div>
  )
}

function HeadMore({ live, archived, onArchive, onRemove }: { live: boolean; archived: boolean; onArchive(v: boolean): void; onRemove(): void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  return (
    <span className="ac-pop" ref={box}>
      <button className={`icon-btn sm${open ? ' on' : ''}`} data-ui="대화 더 보기" data-tip={open ? undefined : t('더 보기', 'More')} aria-label={t('더 보기', 'More')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{Icon.more}</button>
      {open && (
        <div className="menu ac-head-menu" role="menu" data-ui="대화 더 보기 항목">
          <button role="menuitem" disabled={live && !archived} title={live ? t('도는 대화는 멈춘 뒤 보관합니다', 'Stop it before archiving') : undefined} onClick={() => { setOpen(false); onArchive(!archived) }}>{archived ? t('보관함에서 꺼내기', 'Unarchive') : t('보관함에 넣기', 'Archive')}</button>
          <button role="menuitem" className="danger" data-ui="대화 지우기" disabled={live} onClick={() => { setOpen(false); onRemove() }}>{t('지우기', 'Delete')}</button>
        </div>
      )}
    </span>
  )
}

/** 입력란 위: 도는 동안 보낸 말 (다음 차례에 읽는다). 연필은 빼서 입력란으로, ×는 빼기 */
function QueuedBar({ chat, onEdit, onError }: { chat: Chat; onEdit(text: string): void; onError(m: string): void }) {
  const client = useQueryClient()
  const queued = chat.items.filter((i): i is Extract<ChatItem, { kind: 'user' }> => i.kind === 'user' && !!i.queued)
  if (!queued.length) return null
  const unqueue = async (i: number) => {
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.unqueue(chat.id, i)); return true } catch (e) { onError((e as Error).message); return false }
  }
  return (
    <div className="ac-bar" data-ui="다음에 보냄">
      {queued.map((q, i) => (
        <div key={q.at + i} className="ac-bar-line ac-queued">
          <span className="muted ac-queued-h">{t('다음에 보냄', 'Sends next')}</span>
          <span className="ac-bar-text" title={q.text}>{q.text}</span>
          <button className="icon-btn sm" data-ui="기다리는 지시 고치기" data-tip={t('입력란에서 고치기', 'Edit in the input')} aria-label={t('고치기', 'Edit')} onClick={async () => { if (await unqueue(i)) onEdit(q.text) }}>{Icon.pencil}</button>
          <button className="icon-btn sm" data-ui="기다리는 지시 빼기" data-tip={t('빼기', 'Remove')} aria-label={t('빼기', 'Remove')} onClick={() => void unqueue(i)}>{Icon.x}</button>
        </div>
      ))}
    </div>
  )
}

/** 대화 하나: 머리, 주고받은 줄, 입력란 위의 할 일 · 다음에 보냄, 입력란 (auto = 지금 보는 노트) */
export function ChatView({ id, auto, head = true, pane, onPane, onBack, onDeleted, onSaved }: {
  id: string
  auto?: Attach
  head?: boolean
  pane?: boolean
  onPane?(): void
  onBack?(): void
  onDeleted(): void
  onSaved(m: string): void
}) {
  const client = useQueryClient()
  const { data: chat, error } = useChat(id)
  const [fail, setFail] = useState<string | null>(null)
  const [fill, setFill] = useState<{ text: string; n: number }>()
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
  const stop = async () => { try { client.setQueryData(qk.agentChat(id), await agentChatsApi.stop(id)) } catch (e) { setFail((e as Error).message) } }
  const placeholder = chat.state === 'waiting' ? t('위 카드에 답하거나 이어서 쓰기', 'Answer the card above, or keep writing')
    : chat.state === 'queued' ? t('앞 대화가 끝나면 시작합니다 · 이어서 쓰기', 'Starts when a running conversation finishes · keep writing')
      : live ? t('보내면 다음 차례에 읽습니다', 'Sent now, read next turn')
        : t('이어서 쓰기 · / 명령 · @ 붙이기', 'Continue · / commands · @ attach')
  const showTodos = chat.todos.length > 0 && (live || chat.todos.some((x) => x.state !== 'completed'))
  const openChanges = onPane ? () => { if (!pane) onPane() } : undefined
  return (
    <div className="ac-chat" data-ui="에이전트 대화">
      {head && <ChatHead chat={chat} pane={pane} onPane={onPane} onBack={onBack} onDeleted={onDeleted} onSaved={onSaved} onError={setFail} />}
      <ol ref={listRef} className="ac-items" data-ui="대화 줄들">
        {blocksOf(chat.items).map((b, i) => b.kind === 'steps' ? <Steps key={i} items={b.items} until={b.until} /> : <ItemView key={i} chat={chat} it={b.item} onError={setFail} onChanges={openChanges} />)}
        {chat.state === 'running' && <li className="ac-note muted ac-working" aria-live="polite"><StatusDot s="in-progress" name={t('일하는 중', 'Working')} label /></li>}
      </ol>
      <div className="ac-compose">
        {showTodos && <TodoBar todos={chat.todos} />}
        <QueuedBar chat={chat} onEdit={(text) => setFill({ text, n: Date.now() })} onError={setFail} />
        <Composer rid={chat.rid} auto={auto} settings={settings} onSettings={(s) => void change(s)} onSubmit={send} onStop={live ? () => void stop() : undefined}
          placeholder={placeholder} fail={fail} fill={fill} />
        <div className="muted ac-keys">{t('⇧⇥ 맡기는 정도 · ⌘↵ 보내기', '⇧⇥ hand-over level · ⌘↵ send')}{live && t(' · Esc 멈추기', ' · Esc stop')}</div>
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
      {rid && <Composer key={rid} rid={rid} auto={note ? { kind: 'note', ref: note.file, label: note.title } : undefined} settings={settings} onSettings={change} onSubmit={start}
        placeholder={t('맡길 일을 쓰세요 · / 명령 · @ 노트 붙이기 · 그림 붙여넣기', 'What should the agent do? · / commands · @ attach · paste images')} />}
      <span className="muted ac-hint">{TRUST_HINT[settings.trust]}. {t('범위 밖은 읽기만 합니다', 'Outside the scope it only reads')}</span>
    </div>
  )
}

// ---------- 오른쪽 세부 패널: 바뀐 곳 · 작업 (에이전트 화면) ----------

type Edit = Extract<ChatItem, { kind: 'edit' }>

/** 바뀐 곳에 단 코멘트를 에이전트에게 보낼 지시로 */
export function commentMessage(notes: { file: string; old: string; new: string; text: string }[]): ChatMessageBody {
  return {
    text: [t('바뀐 곳에 코멘트를 달았습니다. 하나씩 반영해 주세요.', 'I commented on the changes. Please address each one.'), ...notes.map((n, i) => `${i + 1}. ${n.file}: ${n.text}`)].join('\n'),
    attach: notes.map((n) => ({ kind: 'selection' as const, ref: n.file, label: (n.new || n.old).slice(0, 40), text: [n.old && `- ${n.old}`, n.new && `+ ${n.new}`].filter(Boolean).join('\n').slice(0, 4000) })),
  }
}

/** 바뀐 곳: 파일마다 고친 문단(− · +), 문단을 누르면 코멘트, 모아서 에이전트에게 보내기. 승인 · 되돌리기는 수정 검토에서 */
function Changes({ chat, onSaved }: { chat: Chat; onSaved(m: string): void }) {
  const client = useQueryClient()
  const edits = chat.items.filter((i): i is Edit => i.kind === 'edit')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const files = [...new Set(edits.map((e) => e.file))]
  const ready = Object.entries(notes).filter(([, v]) => v.trim())
  const send = async () => {
    const list = ready.map(([k, v]) => { const [ei, pi] = k.split(':').map(Number); const e = edits[ei!]!; const p = e.parts[pi!]!; return { file: e.file, old: p.old, new: p.new, text: v.trim() } })
    setBusy(true); setFail(null)
    try {
      client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.send(chat.id, commentMessage(list)))
      setNotes({}); setOpen(null)
      onSaved(t('코멘트를 에이전트에게 보냈습니다', 'Comments sent to the agent'))
    } catch (e) { setFail((e as Error).message) } finally { setBusy(false) }
  }
  if (!edits.length) return null
  return (
    <section className="ac-changes" data-ui="바뀐 곳">
      {files.map((f) => {
        const mine = edits.map((e, ei) => ({ e, ei })).filter((x) => x.e.file === f)
        return (
          <div key={f} className="ac-change-file">
            <div className="ac-work-row">
              <span className="mono ac-file" title={f}>{f}</span>
              <Delta added={mine.reduce((s, x) => s + x.e.added, 0)} removed={mine.reduce((s, x) => s + x.e.removed, 0)} />
            </div>
            {mine.map(({ e, ei }) => e.parts.map((p, pi) => {
              const k = `${ei}:${pi}`
              return (
                <div key={k} className={`ac-diff ac-diff-part${open === k ? ' on' : ''}`}>
                  <button className="ac-diff-hit" data-ui="바뀐 곳 코멘트" aria-expanded={open === k} title={t('눌러서 코멘트', 'Click to comment')} onClick={() => setOpen(open === k ? null : k)}>
                    {p.old && <div className="ac-diff-old"><span aria-hidden>− </span>{p.old}</div>}
                    {p.new && <div className="ac-diff-new"><span aria-hidden>+ </span>{p.new}</div>}
                  </button>
                  {notes[k]?.trim() && open !== k && <div className="ac-diff-note"><b>{t('나', 'Me')}</b> · {notes[k]}</div>}
                  {open === k && <textarea className="ac-diff-input" rows={2} autoFocus value={notes[k] ?? ''} placeholder={t('이 고침에 코멘트', 'Comment on this change')} aria-label={t('코멘트', 'Comment')}
                    onChange={(ev) => setNotes({ ...notes, [k]: ev.target.value })}
                    onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); setOpen(null) } }} />}
                </div>
              )
            }))}
            {mine.at(-1)?.e.reason && <span className="muted ac-hint">{mine.at(-1)!.e.reason}</span>}
            <div className="ac-card-row"><span className="sp" /><button className="btn sm" data-ui="수정 검토로" onClick={() => reviewOf(chat.rid, f)}>{t('수정 검토에서 승인 · 되돌리기', 'Approve or revert in edit review')}</button></div>
          </div>
        )
      })}
      {fail && <span className="error-text ac-hint">{fail}</span>}
      <div className="ac-card-row">
        <span className="muted ac-hint">{ready.length ? t(`코멘트 ${ready.length}개`, `${ready.length} comment(s)`) : t('문단을 누르면 코멘트를 답니다', 'Click a change to comment')}</span>
        <span className="sp" />
        <button className="btn primary sm" data-ui="코멘트 보내기" disabled={!ready.length || busy} onClick={() => void send()}>{t('에이전트에게 보내기', 'Send to the agent')}</button>
      </div>
    </section>
  )
}

/** 세부 패널: 바뀐 곳(있으면) · 잡은 파일(다른 대화 것도) · 이 대화의 허락 · 하위 에이전트 · 사용량 */
export function WorkColumn({ id, onSaved }: { id: string; onSaved(m: string): void }) {
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
  const hasEdits = chat.items.some((i) => i.kind === 'edit')
  return (
    <aside className="ac-work" data-ui="작업 상태">
      {hasEdits && <><h3>{t('바뀐 곳', 'Changes')}</h3><Changes chat={chat} onSaved={onSaved} /></>}
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
      {!!results.length && <div className="muted ac-hint ac-usage">{t(`차례 ${results.length}번`, `${results.length} turn${results.length > 1 ? 's' : ''}`)}{secs > 0 && ` · ${secondsName(secs)}`}{cost > 0 && ` · $${cost.toFixed(2)}`}</div>}
    </aside>
  )
}

// ---------- 레일 "에이전트" 화면 ----------

const PANE_KEY = 'rw-agent-pane'

export function AgentPage({ id, onSaved }: { id?: string; onSaved(m: string): void }) {
  const [pane, setPaneState] = useState(() => store.get<boolean>(PANE_KEY, true))
  const setPane = (v: boolean) => { setPaneState(v); store.set(PANE_KEY, v) }
  return (
    <main className="stage full" data-ui="에이전트">
      <section className="pane">
        {id
          ? <div className="ac-page">
            <ChatView key={id} id={id} pane={pane} onPane={() => setPane(!pane)} onDeleted={() => go({ page: 'agent' })} onSaved={onSaved} />
            {pane && <WorkColumn id={id} onSaved={onSaved} />}
          </div>
          : <div className="scroll"><div className="page-body ac-start">
            <h1 className="ac-h">{t('새 대화', 'New conversation')}</h1>
            <NewChat onCreated={(c) => go({ page: 'agent', id: c.id })} />
          </div></div>}
      </section>
    </main>
  )
}

type Filter = 'mine' | 'live' | 'all' | 'archived'
const FILTER_NAME: Record<Exclude<Filter, 'archived'>, string> = { mine: t('내 차례', 'My turn'), live: t('일하는 중', 'Working'), all: t('모두', 'All') }
const keepFor = (f: Filter) => (c: ChatRow) => (f === 'archived' ? c.archived : !c.archived && (f === 'mine' ? myTurn(c) : f === 'live' ? isLive(c.state) && !myTurn(c) : true))

/** 사이드바: 새 대화, 걸러 보기(내 차례 · 일하는 중 · 모두), 프로젝트마다 대화 줄, 맨 아래 보관함 */
export function AgentSide({ id }: { id?: string }) {
  const list = useChatList().data?.chats
  const projects = useProjects()
  const [filter, setFilterState] = useState<Filter>(() => store.get<Filter>('rw-agent-filter', 'all'))
  const setFilter = (f: Filter) => { setFilterState(f); store.set('rw-agent-filter', f) }
  const count = (f: Filter) => (list ?? []).filter(keepFor(f)).length
  const groups = useMemo(() => {
    const by = new Map<string, ChatRow[]>()
    for (const c of [...(list ?? [])].filter(keepFor(filter)).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))) by.set(c.rid, [...(by.get(c.rid) ?? []), c])
    return [...by.entries()]
  }, [list, filter])
  const archived = count('archived')
  return (
    <div className="set-side ac-side" data-ui="대화 목록">
      <button className={`nav${!id ? ' on' : ''}`} data-ui="새 대화 줄" onClick={() => go({ page: 'agent' })}><span className="label">{t('＋ 새 대화', '＋ New conversation')}</span></button>
      {!!list?.length && filter !== 'archived' && (
        <div className="segmented small full ac-filter" role="radiogroup" aria-label={t('걸러 보기', 'Filter')} data-ui="대화 필터">
          {(['mine', 'live', 'all'] as const).map((f) => <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{FILTER_NAME[f]}{f !== 'all' && count(f) ? ` ${count(f)}` : ''}</button>)}
        </div>
      )}
      {filter === 'archived' && <button className="a ac-archive-back" data-ui="보관함 닫기" onClick={() => setFilter('all')}>‹ {t('보관함', 'Archive')} {archived}</button>}
      {list && !list.length && <div className="empty">{t('대화가 아직 없습니다. 새 대화로 일을 맡기세요.', 'No conversations yet. Start one to hand off work.')}</div>}
      {list && !!list.length && !groups.length && <div className="empty">{filter === 'mine' ? t('답할 대화가 없습니다', 'Nothing waits for you') : filter === 'live' ? t('일하는 대화가 없습니다', 'No conversation is working') : filter === 'archived' ? t('보관한 대화가 없습니다', 'Nothing archived') : t('대화가 없습니다', 'No conversations')}</div>}
      {groups.map(([rid, chats]) => (
        <div key={rid}>
          <div className="ac-side-h">{projects?.find((p) => p.id === rid)?.title ?? rid}</div>
          {chats.map((c) => <ChatLine key={c.id} c={c} on={c.id === id} onOpen={() => go({ page: 'agent', id: c.id })} />)}
        </div>
      ))}
      {filter !== 'archived' && archived > 0 && <button className="a ac-archive-link" data-ui="보관함 열기" onClick={() => setFilter('archived')}>{t(`보관함 ${archived} ›`, `Archive ${archived} ›`)}</button>}
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
  const sorted = [...(list ?? [])].filter((c) => !c.archived || c.id === current).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))
  return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      <div className="rs-head ac-panel-head">
        <span className="ac-panel-name" aria-hidden>{Icon.spark}</span>
        <select className="rs-select ac-switch" data-ui="대화 고르기" aria-label={t('대화 고르기', 'Pick a conversation')} value={current ?? ''} onChange={(e) => setOpen(e.target.value || null)}>
          <option value="">{t('새 대화', 'New conversation')}</option>
          {sorted.map((c) => <option key={c.id} value={c.id}>{c.title}{myTurn(c) ? ` · ${stateName(c)}` : ''}</option>)}
        </select>
        {chat && <ChatStateMark state={chat.state} name={stateName(chat)} />}
        <span className="sp" />
        {chat && (chat.added > 0 || chat.removed > 0) && <button className="btn sm ac-changes-btn" data-ui="바뀐 곳 버튼" data-tip={t('에이전트 화면에서 바뀐 곳 보기', 'View changes in the agent page')} onClick={() => go({ page: 'agent', id: chat.id })}><Delta added={chat.added} removed={chat.removed} /></button>}
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

/** 패널 안의 대화: 머리(이름 · 범위 · ⋯)와 대화. 바뀐 곳은 에이전트 화면에서 */
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
