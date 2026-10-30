import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useCmdEnter } from './cmdEnter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { autoCustom, autoOf, type ChatAutoValues } from '@rw/core'
import { agentChatsApi, api, APP_RID, notesApi, type AskAnswer, type Attach, type AttachKind, type Chat, type ChatEffort, type ChatItem, type ChatMessageBody, type ChatMode, type ChatModel, type ChatRow, type ModelChoice, type ChatScope, type ChatSettings, type ChatState, type ImageIn, type Todo } from './api'
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
import { flash } from './flash'
import { openRecordComposer } from './RecordContext'
import { useRecords } from './projectQueries'
import { AGENT_PANEL_OPEN, agentPanelKey } from './agentPanelOpen'
import { InlineEdits } from './InlineEdits'
import { AgentChip, AgentChoices, agentOf, effortsOf, fitEffort, isClaude, modelName, useModels } from './AgentPick'

/**
 * 에이전트 대화 (10/21 "프로젝트 관리 먼저", 같은 날 "에이전트 창 구조 다시" · "코덱스와 Claude 앱 더 참고"):
 * 앱이 맥의 Claude Code를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다(서버 agentChats.ts).
 * - 레일 "에이전트" 화면(AgentPage · AgentSide): 모든 프로젝트의 대화 목록 · 대화 · 오른쪽 세부 패널(바뀐 곳 · 작업)
 * - 오른쪽 사이드바의 에이전트 탭(AgentPanel, 10/22 안 A): 지금 프로젝트의 대화. 지금 보는 노트가 저절로 붙는다
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
export const stateName = (c: Pick<ChatRow, 'state' | 'wait'>) => (c.state === 'waiting' && c.wait ? WAIT_NAME[c.wait] : STATE_NAME[c.state])

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

/** 토큰 수: 1.2k · 48k · 1.3M */
export function tokensName(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
/** Claude Code가 주는 비용은 쓴 토큰을 API 요금으로 친 값이다. 구독 로그인이면 따로 청구되지 않는다 */
const costName = (usd: number) => t(`API 가격으로 약 $${usd.toFixed(2)} (구독 로그인이면 청구되지 않음)`, `About $${usd.toFixed(2)} at API prices (not billed on a subscription login)`)

/** 글 복사 (내 지시 · 에이전트 글 · 계획). 누르면 잠깐 체크 */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = () => void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }, () => undefined)
  return <button className="icon-btn sm ac-copy" data-ui="글 복사" data-tip={done ? t('복사했습니다', 'Copied') : t('복사', 'Copy')} aria-label={t('복사', 'Copy')} onClick={copy}>{done ? Icon.check : Icon.copy}</button>
}

/** 입력란을 바깥에서 채울 때 (기다리는 지시 고치기). n이 바뀌면 채운다 */
type Fill = { text: string; n: number; attach?: Attach[]; images?: ImageIn[] }

// ---------- 권한 · 모델 · 생각 깊이 ----------

/** 권한(예전 이름 맡기는 정도): 읽기 전용(write read) 또는 고치는 대화의 모드 셋 */
export type Trust = 'read' | ChatMode
/** ⇧⇥ 차례: Claude Code처럼 묻고 하기 → 편집 자동 허용 → 계획 모드, 그다음 읽기 전용 (10/22 사용자 결정 "Claude Code 방식") */
const TRUSTS: Trust[] = ['ask', 'edit', 'plan', 'read']
const TRUST_NAME: Record<Trust, string> = { read: t('읽기 전용', 'Read only'), ask: t('묻고 하기', 'Ask before edits'), plan: t('계획 모드', 'Plan mode'), edit: t('편집 자동 허용', 'Accept edits') }
/** 앱 고치기 대화의 맡기는 정도 설명 (작업 폴더에서 고치고 시험, 올리기는 앱) */
const APP_HINT: Record<Trust, string> = {
  read: t('읽기만 합니다', 'Reads only'),
  ask: t('파일을 고치거나 명령을 돌리거나 PR을 올릴 때마다 묻습니다', 'Asks before each file edit, command and before opening the PR'),
  plan: t('계획을 승인한 뒤 파일을 고치고 시험한 뒤 PR을 올립니다', 'Edits, tests and opens the PR after you approve the plan'),
  edit: t('작업 폴더에서 바로 고치고 시험한 뒤 PR을 올립니다', 'Edits and tests in its work folder, then opens the PR'),
}

const TRUST_HINT: Record<Trust, string> = {
  read: t('읽고 답만 합니다. 명령은 묻고 돌립니다', 'Reads and answers only. Commands ask first'),
  ask: t('노트 수정과 명령을 하나씩 묻습니다', 'Asks before each note edit and command'),
  plan: t('먼저 계획을 보이고, 승인할 때 이어 갈 방법을 고릅니다', 'Shows a plan first; you choose how to continue when you approve it'),
  edit: t('범위 안 노트를 바로 고칩니다. 명령 · 웹 · 범위 밖은 묻거나 막습니다', 'Edits notes in scope right away. Commands, web and out-of-scope work ask or are blocked'),
}
export const trustOf = (c: { write: string; mode: ChatMode }): Trust => (c.write === 'read' ? 'read' : c.mode)
const settingsOf = (v: Trust): ChatSettings => (v === 'read' ? { write: 'read' } : { write: 'notes', mode: v })
/** ⇧⇥: 다음 맡기는 정도 */
export const nextTrust = (v: Trust, claude = true): Trust => { const n = TRUSTS[(TRUSTS.indexOf(v) + 1) % TRUSTS.length]!; return n === 'plan' && !claude ? nextTrust(n) : n }
const EFFORT_NAME: Record<ChatEffort, string> = { low: t('생각 얕게', 'Think less'), medium: t('생각 보통', 'Think normally'), high: t('생각 깊게', 'Think more'), xhigh: t('생각 더 깊게', 'Think much more'), max: t('생각 가장 깊게', 'Think hardest') }
/** 입력란 아래 줄의 짧은 이름 (좁은 패널에서도 한 줄) */
const EFFORT_SHORT: Record<ChatEffort, string> = { low: t('얕게', 'Less'), medium: t('보통', 'Normal'), high: t('깊게', 'More'), xhigh: t('더 깊게', 'Much more'), max: t('가장 깊게', 'Hardest') }
export { effortsOf, fitEffort, modelName } from './AgentPick'

/** custom = 권한 표의 토글을 하나씩 바꿔 이름이 「직접 정함」 */
interface Settings { trust: Trust; model: ChatModel; effort: ChatEffort; custom?: boolean; agent: string }

// ---------- / 명령 ----------

const COMMANDS: { cmd: string; label: string; text: string }[] = [
  { cmd: t('/계산', '/run'), label: t('노트의 계산을 다시 돌리고 확인 절과 맞추기', 'Rerun the note\'s computation and match its checks'), text: t('이 노트의 계산을 다시 돌리고 결과를 확인(Checks) 절과 맞춰 줘. 다르면 고치고 무엇이 달랐는지 알려 줘.', 'Rerun the computation in this note and match the result with its Checks section. If it differs, fix it and tell me what changed.') },
  { cmd: t('/검토', '/review'), label: t('노트의 수식 · 논리 단계 검토', 'Review the note\'s equations and steps'), text: t('이 노트의 수식과 논리 단계를 검토해 줘. 틀리거나 빠진 단계는 그 자리에 기록(질문)으로 남기고, 노트는 고치지 마.', 'Review the equations and logical steps in this note. Leave a record (question) where a step is wrong or missing; do not change the note.') },
  { cmd: t('/기록', '/records'), label: t('답할 차례인 기록에 답하기', 'Answer the records waiting for an agent'), text: t('이 프로젝트에서 에이전트가 답할 차례인 기록에 답해 줘.', 'Answer the records in this project that wait for an agent.') },
  { cmd: t('/문헌', '/papers'), label: t('근거 문헌을 찾아 노트에 잇기', 'Find supporting papers and link them'), text: t('이 노트의 주장마다 근거가 되는 문헌을 라이브러리에서 찾아 이어 줘. 없으면 무엇이 없는지 알려 줘.', 'For each claim in this note, find a supporting paper in the library and link it. Tell me where none exists.') },
  { cmd: t('/흐름', '/flow'), label: t('한 일을 흐름 점으로 정리', 'Turn the work into flow dots'), text: t('이번에 한 일을 흐름 점으로 정리해 줘 (한 일 하나에 점 하나).', 'Add the work done here to the flow (one dot per piece of work).') },
  { cmd: t('/요약', '/summary'), label: t('오늘 이 프로젝트에서 한 일', 'What happened in this project today'), text: t('오늘 이 프로젝트에서 한 일을 짧게 요약해 줘.', 'Summarize briefly what happened in this project today.') },
  // Claude Code 명령: 그대로 보낸다 (에이전트가 아니라 Claude Code가 처리)
  { cmd: t('/곁', '/btw'), label: t('하던 일을 멈추지 않고 짧게 묻기 (작은 모델이 대화 요약만 보고 답함)', 'Ask a quick side question without interrupting (a small model answers from a summary)'), text: t('/곁 ', '/btw ') },
  { cmd: '/compact', label: t('앞 내용을 요약해 맥락 줄이기', 'Summarize earlier messages to shrink the context'), text: '/compact' },
  { cmd: '/context', label: t('맥락이 무엇에 얼마나 쓰였는지 보기', 'Show what fills the context'), text: '/context' },
]

/** 곁 질문이면 묻는 글 (/곁 · /btw 뒤), 아니면 없음 */
export function sideQuestion(text: string): string | undefined {
  const m = /^\/(곁|btw)\s+([\s\S]+)$/.exec(text.trim())
  return m?.[2]!.trim() || undefined
}

const ATTACH_NAME: Record<AttachKind, string> = { note: t('노트', 'Note'), topic: t('주제', 'Topic'), file: t('파일', 'File'), selection: t('고른 글', 'Selection'), paper: t('문헌', 'Paper'), record: t('기록', 'Record'), connector: t('커넥터', 'Connector') }

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
/** 탭 이름 (App.tsx tabTitle, 나란히 연 대화): 불러온 대화의 이름 */
export const chatTitles = new Map<string, string>()
const useChat = (id: string) => useQuery({ queryKey: qk.agentChat(id), queryFn: () => agentChatsApi.get(id).then((c) => { chatTitles.set(c.id, c.title); return c }) })
const useProjects = () => useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches

function scopeName(s: ChatScope, topics?: { id: string; title: string }[]): string {
  if (s.kind === 'project') return t('프로젝트 전체', 'Whole project')
  if (s.kind === 'app') return t('앱 수정', 'Fix the app')
  if (s.kind === 'topic') return `${t('주제', 'Topic')} · ${topics?.find((x) => x.id === s.target)?.title ?? s.target}`
  return `${t('노트', 'Note')} · ${s.target?.split('/').slice(-2, -1)[0] ?? s.target}`
}

/** 대화 목록 · 머리에 보일 프로젝트 이름 (앱 고치기 대화는 「앱」) */
const projectName = (rid: string, projects?: { id: string; title: string }[]) => (rid === APP_RID ? t('앱', 'App') : projects?.find((p) => p.id === rid)?.title ?? rid)

/** 사용자 차례: 허락 · 계획을 기다리거나 오류로 멈춘 대화 */
const myTurn = (c: ChatRow) => c.state === 'waiting' || c.state === 'error'
/** 대화의 묶음 (10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ 2절): 기록의 질문 · 지시가 연 대화와 직접 연 대화를 섞지 않는다 */
export const chatGroupName = (c: Pick<ChatRow, 'record'>) => c.record ? t('기록의 질문 · 지시', 'Record questions and instructions') : t('직접 연 대화', 'Conversations you opened')
function ChatGroups({ chats, line }: { chats: ChatRow[]; line(c: ChatRow): ReactNode }) {
  const records = chats.filter((c) => c.record)
  const direct = chats.filter((c) => !c.record)
  // 기록 대화가 없으면 묶음 머리 없이 예전 목록 그대로
  if (!records.length) return <>{direct.map(line)}</>
  return <>
    <div className="ac-sub-h" data-ui="기록 대화 묶음">{chatGroupName({ record: { target: '', id: '' } })} <span className="n">{records.length}</span></div>
    {records.map(line)}
    {!!direct.length && <div className="ac-sub-h" data-ui="직접 연 대화 묶음">{chatGroupName({})} <span className="n">{direct.length}</span></div>}
    {direct.map(line)}
  </>
}
const rank = (c: ChatRow) => (myTurn(c) ? 0 : isLive(c.state) ? 1 : 2)

/** 목록 한 줄: 상태 점 · 이름, 아래 줄에 무엇을 기다리는지(상태) · +n −n · 시각 */
function ChatLine({ c, on, onOpen, actions = false, pick }: { c: ChatRow; on: boolean; onOpen(): void; actions?: boolean; pick?: { on: boolean; disabled?: string; toggle(): void } }) {
  const [editing, setEditing] = useState(false)
  const { rename } = useChatActions(c.id)
  const line = (
    <button className={`nav ac-line${on && !pick ? ' on' : ''}${pick?.on ? ' picked' : ''}`} data-ui="대화 줄" data-ui-item={c.title} title={pick?.disabled ?? c.title}
      disabled={!!pick?.disabled} aria-pressed={pick ? pick.on : undefined} onClick={pick ? pick.toggle : onOpen}>
      <span className="ac-line-top">{pick && <span className={`ac-pick${pick.on ? ' on' : ''}`} aria-hidden />}<span className="ac-line-dot"><ChatStateMark state={c.state} name={stateName(c)} /></span>
        <span className={`label${editing ? ' hide' : ''}`}>{c.title}</span></span>
      <span className="ac-line-meta">
        {stateName(c)}
        {(c.added > 0 || c.removed > 0) && <> · <Delta added={c.added} removed={c.removed} /></>}
        {` · ${relativeTime(Date.parse(c.updated))}`}
      </span>
    </button>
  )
  if (!actions || pick) return line
  // 목록 줄의 고치기 (10/28 피드백 21:19, 시안 5절): 줄에 마우스를 올리면 오른쪽 위에 연필.
  // 지우기는 줄마다 두지 않고 보관함에서 골라 한꺼번에 (10/28 시안 4절 코멘트 "보관된 채팅만 지울 수 있게")
  return (
    <div className="ac-line-wrap">
      {line}
      {editing ? <TitleInput className="ac-line-edit" value={c.title} onDone={(v) => { setEditing(false); if (v !== null) void rename(v) }} />
        : <span className="ac-line-actions hover-actions" data-ui="대화 줄 고치기·지우기">
          <button className="icon-btn sm tip-end" data-tip={t('제목 바꾸기', 'Rename')} aria-label={t('제목 바꾸기', 'Rename')} onClick={() => setEditing(true)}>{Icon.pencil}</button>
        </span>}
    </div>
  )
}

/** 제목 입력란: Enter · 칸을 벗어나면 저장, Esc는 취소. 바뀐 것이 없으면 null */
function TitleInput({ value, onDone, className }: { value: string; onDone(title: string | null): void; className?: string }) {
  const [text, setText] = useState(value)
  const done = useRef(false)
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v !== null && v.trim() && v.trim() !== value ? v.trim() : null) }
  return <input className={`ac-title-input${className ? ` ${className}` : ''}`} autoFocus aria-label={t('대화 제목', 'Conversation title')} value={text} maxLength={60}
    onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={() => finish(text)}
    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); finish(text) } else if (e.key === 'Escape') { e.preventDefault(); finish(null) } }} />
}

/** 대화 제목 바꾸기 · 지우기 (머리 ⋯ 메뉴와 목록 줄이 함께 쓴다) */
function useChatActions(id: string) {
  const client = useQueryClient()
  const rename = async (title: string) => {
    try { client.setQueryData(qk.agentChat(id), await agentChatsApi.rename(id, title)); void client.invalidateQueries({ queryKey: qk.agentChats }) } catch (e) { flash((e as Error).message) }
  }
  const remove = async (): Promise<boolean> => {
    if (!await askConfirm({ title: t('이 대화를 지울까요?', 'Delete this conversation?'), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토는 그대로 남습니다.', 'Only the conversation is deleted. Notes, records and edit review stay.'), ok: t('삭제', 'Delete') })) return false
    try { await agentChatsApi.remove(id); void client.invalidateQueries({ queryKey: qk.agentChats }); flash(t('대화를 지웠습니다', 'Conversation deleted')); return true } catch (e) { flash((e as Error).message); return false }
  }
  return { rename, remove }
}

/** 고른 대화 여러 개를 보관 · 꺼내기 · 지우기 (지우기는 보관한 것만, 한 번 묻고) */
function useBulkChats() {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const run = async (ids: string[], one: (id: string) => Promise<unknown>, done: string) => {
    setBusy(true)
    try { for (const id of ids) await one(id); flash(done) } catch (e) { flash((e as Error).message) } finally { setBusy(false); void client.invalidateQueries({ queryKey: qk.agentChats }) }
  }
  const archive = (ids: string[], v: boolean) => run(ids, (id) => agentChatsApi.archive(id, v), v ? t(`${ids.length}개를 보관함에 넣었습니다`, `Archived ${ids.length}`) : t(`${ids.length}개를 보관함에서 꺼냈습니다`, `Unarchived ${ids.length}`))
  const remove = async (ids: string[]): Promise<boolean> => {
    if (!await askConfirm({ title: t(`보관한 대화 ${ids.length}개를 지울까요?`, `Delete ${ids.length} archived conversations?`), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토, 바꾼 파일과 PR은 그대로 남습니다.', 'Only the conversations are deleted. Notes, records, edit review, changed files and PRs stay.'), ok: t('삭제', 'Delete') })) return false
    await run(ids, (id) => agentChatsApi.remove(id), t(`${ids.length}개를 지웠습니다`, `Deleted ${ids.length}`))
    return true
  }
  return { busy, archive, remove }
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
  if (it.expired) return t('답하기 전에 멈춤', 'Stopped before an answer')
  if (it.plan !== undefined) {
    if (it.answer === 'deny') return t('계획을 고쳐 달라고 함', 'Asked to revise the plan')
    return it.mode ? t(`계획 승인함 · ${TRUST_NAME[it.mode]}`, `Plan approved · ${TRUST_NAME[it.mode]}`) : t('계획 승인함', 'Plan approved')
  }
  return it.answer === 'allow' ? t('허락함', 'Allowed') : it.answer === 'always' ? t('이 대화에서 늘 허락함', 'Always allowed here') : t('거절함', 'Declined')
}

/** 「늘」 버튼 말: 토글이 있는 일은 그 토글을 켠다고, 실행은 그 프로그램을 */
const ALWAYS_NAME: Partial<Record<NonNullable<Ask['does']>, string>> = {
  read: t('네, 읽기는 늘 (자동 허용 켜기)', 'Yes, always for reading (turn on auto)'),
  edit: t('네, 편집은 늘 (편집 자동 허용)', 'Yes, always for edits (accept edits)'),
  web: t('네, 웹 보기는 늘 (자동 허용 켜기)', 'Yes, always for the web (turn on auto)'),
}
const alwaysName = (it: Ask) => (it.does && ALWAYS_NAME[it.does]) || (it.does === 'run' ? t('네, 이 대화에서 이 프로그램은 늘', 'Yes, always for this program here') : t('네, 이 대화에서 이것은 늘', 'Yes, always for this in this conversation'))
const DOES_NAME: Record<NonNullable<Ask['does']>, string> = { read: t('읽기', 'Read'), edit: t('편집', 'Edit'), delete: t('삭제', 'Delete'), run: t('실행', 'Run'), web: t('웹 보기', 'Web'), outside: t('외부', 'Outside') }

function AskCard({ chat, it, onError }: { chat: Chat; it: Ask; onError(m: string): void }) {
  const { busy, answer } = useAnswer(chat, it.id, onError)
  return (
    <li className={`ac-card ac-ask${it.answer ? ' done' : ' wait'}`} data-ui="허락 카드">
      <div className="ac-card-head">
        {!it.answer && <span className="turn-dot" aria-hidden />}
        <b>{it.answer ? answeredName(it) : t('허락이 필요합니다', 'Approval needed')}</b>
        {it.does && <span className="tag">{DOES_NAME[it.does]}</span>}
        <span className="ac-tool mono">{it.tool}</span>
      </div>
      <code className="ac-ask-sum">{it.summary}</code>
      {it.note && <div className="muted ac-hint">{t('한 말', 'Said')}: {it.note}</div>}
      {!it.answer && (
        <Choices busy={busy}
          choices={[
            { label: t('네', 'Yes'), ui: '허락 버튼', run: () => void answer('allow') },
            // 삭제 · 외부는 「늘」 없이 한 번씩 (되돌리기 어려워서)
            ...(it.once ? [] : [{ label: alwaysName(it), ui: '늘 허락 버튼', run: () => void answer('always') }]),
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
        <span className="sp" />
        <CopyButton text={it.plan ?? ''} />
      </div>
      <MemoText text={it.plan ?? ''} />
      {it.note && <div className="muted ac-hint">{t('한 말', 'Said')}: {it.note}</div>}
      {!it.answer && <>
        <div className="muted ac-hint ac-choices-q">{t('이대로 할까요? 명령은 승인 뒤에도 묻습니다', 'Go ahead? Commands still ask after approval')}</div>
        <Choices busy={busy}
          choices={[
            // 앱 고치기 대화는 노트가 아니라 작업 폴더의 파일을 고친다
            { label: t('네, 편집 자동 허용', 'Yes, accept edits'), ui: '계획 승인 버튼', run: () => void answer('allow', { mode: 'edit' }) },
            { label: t('네, 묻고 하기', 'Yes, ask before edits'), ui: '계획 승인 묻기 버튼', run: () => void answer('allow', { mode: 'ask' }) },
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
  // 오른쪽 사이드바의 대화에서는 고친 곳을 이 줄 아래에 펼쳐 그 자리에서 검토한다 (10/28 사용자 정정: 페이지를 옮기지 않고)
  const [open, setOpen] = useState(false)
  const inline = !onChanges && chat.rid !== APP_RID
  return (
    <li className="ac-edit-line" data-ui="노트 고침 줄">
      <span className="ac-edit-what">{it.via === 'command' ? t('명령으로 고침', 'Changed by a command') : chat.rid === APP_RID ? t('파일 고침', 'Edited file') : t('노트 고침', 'Edited')}</span>
      <span className="mono ac-file" title={it.file}>{it.file}</span>
      <Delta added={it.added} removed={it.removed} />
      {onChanges && <button className="a ac-edit-go" data-ui="바뀐 곳 보기" onClick={onChanges}>{t('변경사항 보기', 'View changes')}</button>}
      {inline && <button className="a ac-edit-go" data-ui="바뀐 곳 보기" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('고친 곳 접기', 'Hide changes') : t('고친 곳 검토 ›', 'Review changes ›')}</button>}
      {it.reason && <span className="muted ac-hint ac-edit-why">{it.reason}</span>}
      {inline && open && <div className="ac-edit-inline"><InlineEdits rid={chat.rid} files={[it.file]} /></div>}
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

function ItemView({ chat, it, onError, onChanges, onRewind }: { chat: Chat; it: Exclude<ChatItem, { kind: 'step' }>; onError(m: string): void; onChanges?(): void; onRewind?(point: string): void }) {
  const when = new Date(it.at).toLocaleString()
  switch (it.kind) {
    case 'user': return (
      <li className="ac-me" data-ui="내 지시" title={when}>
        <MemoText text={it.text} />
        <AttachChips attach={it.attach} images={it.images} />
        <CopyButton text={it.text} />
        {it.point && onRewind && !isLive(chat.state) && (
          <button className="icon-btn sm ac-rewind" data-ui="여기로 되돌리기" data-tip={t('여기로 되돌리기', 'Rewind to here')} aria-label={t('여기로 되돌리기', 'Rewind to here')} onClick={() => onRewind(it.point!)}>{Icon.revert}</button>
        )}
      </li>
    )
    case 'text': return <li className={`ac-text${it.sub ? ' sub' : ''}`} data-ui="에이전트 글" title={when}>{it.sub && <span className="muted ac-hint">{t('하위 에이전트', 'Subagent')}</span>}<MemoText text={it.text} /><CopyButton text={it.text} /></li>
    case 'ask': return it.plan !== undefined ? <PlanCard chat={chat} it={it} onError={onError} /> : <AskCard chat={chat} it={it} onError={onError} />
    case 'todos': return null
    case 'edit': return <EditLine chat={chat} it={it} onChanges={onChanges} />
    case 'blocked': return <li className="ac-note" data-ui="막은 일"><span className="ac-tool mono">{it.tool}</span><span>{t('막음', 'Blocked')} · {it.reason}</span></li>
    case 'result': return (
      <li className="ac-note muted" data-ui="차례 끝" title={it.cost ? costName(it.cost) : undefined}>
        {it.ok ? `✓ ${t('이번 차례 끝', 'Turn done')}` : t('이번 차례 실패', 'Turn failed')}{it.seconds !== undefined && ` · ${secondsName(it.seconds)}`}{it.tokens && ` · ${t('토큰', 'Tokens')} ${tokensName(it.tokens.in + it.tokens.out)}`}
      </li>
    )
    case 'error': return <li className="ac-note error-text" data-ui="대화 오류">! {it.text}</li>
    case 'think': return (
      <li className="ac-think" data-ui="에이전트 생각" title={when}>
        <details><summary className="muted">{t('생각', 'Thinking')}</summary><MemoText text={it.text} /></details>
      </li>
    )
    case 'side': return (
      <li className="ac-sideq" data-ui="곁 질문" title={when}>
        <div className="muted ac-hint">{t('곁 질문', 'Side question')} · {it.q}</div>
        {it.answer ? <MemoText text={it.answer} /> : it.error ? <span className="error-text">! {it.error}</span> : <span className="muted">{t('답하는 중…', 'Answering…')}</span>}
      </li>
    )
    case 'compact': return (
      <li className="ac-note muted" data-ui="앞 내용 요약" title={when}>
        {it.auto ? t('앞 내용을 요약해 이어 갑니다', 'Summarized earlier messages to keep going') : t('앞 내용을 요약했습니다', 'Summarized earlier messages')}
        {` · ${t('맥락', 'Context')} ${tokensName(it.before)}${it.after !== undefined ? ` → ${tokensName(it.after)}` : ''}`}
      </li>
    )
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

type Box = { top: number; bottom: number; left: number; right: number }
/**
 * 메뉴 자리: 바라는 쪽(위, down이면 아래)에 안 들어가고 반대쪽이 더 넓으면 뒤집고, 들어갈 높이를 넘으면 그 높이까지(스크롤).
 * 가로는 단추 왼쪽(down이면 오른쪽)에 맞추되 보이는 칸(box) 안으로 민다. x = 단추 왼쪽에서 메뉴 왼쪽까지
 */
export function fitMenu(menu: { width: number; height: number }, btn: Box, box: Box, down = false, gap = 4): { down: boolean; x: number; max?: number } {
  const above = btn.top - box.top - gap
  const below = box.bottom - btn.bottom - gap
  const flip = down ? menu.height > below && above > below : menu.height > above && below > above
  const d = down !== flip
  const room = Math.floor(d ? below : above)
  const want = down ? btn.right - menu.width : btn.left
  const left = Math.max(box.left + gap, Math.min(want, box.right - gap - menu.width))
  return { down: d, x: left - btn.left, ...(menu.height > room && { max: Math.max(room, 0) }) }
}

/** 메뉴가 보이는 칸: 창과, 넘친 것을 자르는 조상(패널 등)이 겹치는 곳 */
function visibleBox(el: Element): Box {
  const b: Box = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth }
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
    const r = p.getBoundingClientRect()
    b.top = Math.max(b.top, r.top); b.left = Math.max(b.left, r.left); b.bottom = Math.min(b.bottom, r.bottom); b.right = Math.min(b.right, r.right)
  }
  return b
}

/** 입력란 아래 줄의 작은 메뉴 버튼 (＋ · 맡기는 정도 · 모델과 생각). 메뉴는 패널 · 창 끝에서 잘리지 않게 뒤집거나 민다 (fitMenu) */
function PopButton({ label, ui, tip, children, wide, down, icon }: { label: ReactNode; ui: string; tip: string; children(close: () => void): ReactNode; wide?: boolean; down?: boolean; icon?: boolean }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof fitMenu> | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useDismiss(open, box, () => setOpen(false))
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return }
    const btn = box.current?.firstElementChild
    const m = pop.current
    if (btn && m) setPlace(fitMenu({ width: m.offsetWidth, height: m.scrollHeight }, btn.getBoundingClientRect(), visibleBox(m), down))
  }, [open, down])
  const d = place ? place.down : down
  return (
    <span className="ac-pop" ref={box}>
      <button className={`${icon ? 'icon-btn sm' : 'ac-pop-btn'}${open ? ' on' : ''}`} data-ui={ui} data-tip={open ? undefined : tip} aria-label={icon ? tip : undefined} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div ref={pop} className={`menu ac-pop-menu${wide ? ' wide' : ''}${d ? ' down' : ''}`} role="menu" data-ui={`${ui} 항목`}
        style={place ? { left: place.x, right: 'auto', ...(place.max !== undefined && { maxHeight: place.max, overflowY: 'auto' }) } : { visibility: 'hidden' }}>{children(() => setOpen(false))}</div>}
    </span>
  )
}

/**
 * 에이전트 입력란: 붙인 것(지금 보는 노트는 저절로) · 글 칸(/ 명령 · @ 붙이기 · 그림 붙여넣기),
 * 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기(도는 중이고 글이 없으면 멈추기). ⇧⇥로 맡기는 정도를 바꾼다.
 * 대화 중에 바꾼 설정은 다음 차례부터 (onSettings)
 */
function Composer({ rid, auto, settings, onSettings, onSubmit, onStop, placeholder, fail: outerFail, fill, autoFocus, agentFixed }: {
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
  fill?: Fill
  autoFocus?: boolean
  /** 이미 시작한 대화: 에이전트를 바꾸지 못한다 */
  agentFixed?: boolean
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
  useEffect(() => {
    if (!fill) return
    setText(fill.text); setCaret(fill.text.length)
    // 기다리던 지시를 고칠 때 붙인 것 · 그림도 함께 돌아온다
    if (fill.attach?.length) setAttach((a) => [...a, ...fill.attach!])
    if (fill.images?.length) setImages((xs) => [...xs, ...fill.images!.map((im, i) => ({ ...im, name: t(`그림 ${i + 1}`, `Image ${i + 1}`) }))].slice(0, 4))
    box.current?.focus()
  }, [fill?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (() => { const m = menuAt(text, caret); return m && m.start !== closed ? m : null })()
  // 앱 고치기 대화는 연구 프로젝트가 아니라 @로 붙일 노트 · 주제가 없다
  const research = rid !== APP_RID
  const notes = useQuery({ queryKey: qk.notes(rid), queryFn: () => notesApi(rid).list(), enabled: research && menu?.kind === '@' }).data
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: research && menu?.kind === '@' }).data
  // 맥의 Claude Code 스킬 · 커넥터 (10/21 22:40): / 메뉴 · @ 메뉴에 함께 보인다
  const extras = useQuery({ queryKey: qk.agentExtras, queryFn: () => agentChatsApi.extras(), enabled: !!menu, staleTime: 60_000 }).data
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree(), enabled: research && menu?.kind === '@' && (menu.query.length >= 2) }).data

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
      const fill = (v: string) => { setText(v); setCaret(v.length); requestAnimationFrame(() => box.current?.focus()) }
      const cmds = COMMANDS.filter((c) => c.cmd.slice(1).toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q))
        .map((c) => ({ key: c.cmd, label: c.cmd, meta: c.label, run: () => fill(c.text) }))
      // 스킬: 고르면 그 스킬을 쓰라는 글로 시작한다 (에이전트가 Skill 도구로 읽는다)
      const skills = (extras?.skills ?? []).filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
        .map((s) => ({ key: `s:${s.name}`, label: s.name, meta: `${t('스킬', 'Skill')}${s.description ? ` · ${s.description}` : ''}`, run: () => fill(t(`「${s.name}」 스킬로 `, `Using the ${s.name} skill, `)) }))
      return [...cmds, ...skills].slice(0, 12)
    }
    const has = (s: string) => s.toLowerCase().includes(q)
    const out: MenuPick[] = []
    // 커넥터는 몇 개뿐이라 앞에 둔다 (노트가 많아도 묻히지 않게)
    for (const c of extras?.connectors ?? []) if (has(c.name)) out.push({ key: `c:${c.name}`, label: c.name, meta: ATTACH_NAME.connector, run: () => addAttach({ kind: 'connector', ref: c.name, label: c.name }) })
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
    if (!files.length) return
    e.preventDefault()
    // 그림이 아닌 파일은 조용히 사라지지 않게 알린다
    void addImages(files).then((ok) => { if (!ok) setFail(research ? t('그림만 끌어 놓을 수 있습니다. 노트 · 파일은 @로 붙이세요', 'Only images can be dropped. Attach notes and files with @') : t('그림만 끌어 놓을 수 있습니다', 'Only images can be dropped')) })
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
  const sendKey = useCmdEnter(() => void submit())
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) { if (!menu) sendKey.onKeyDown(e); return }
    if (menu && picks.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % picks.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + picks.length) % picks.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); picks[hi]?.run(); return }
    }
    if (menu && e.key === 'Escape') { e.preventDefault(); setClosed(menu.start); return }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onSettings({ trust: nextTrust(settings.trust, isClaude(settings.agent)) }); return }
    if (e.key === 'Escape' && onStop && !text) { e.preventDefault(); onStop(); return }
    sendKey.onKeyDown(e)
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
  const models = useModels(settings.agent)
  const efforts = effortsOf(settings.model, models)

  return (
    <div className="ac-composer" data-ui="에이전트 입력란" onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}>
      {(all.length > 0 || images.length > 0) && (
        <div className="ac-chips">
          {auto && !autoOff && <span className="tag ac-chip" title={auto.ref}>{ATTACH_NAME[auto.kind]} · {auto.label}<button className="ac-chip-x" aria-label={t('제거', 'Remove')} onClick={() => setAutoOff(true)}>{Icon.x}</button></span>}
          {attach.map((a, i) => <span key={i} className="tag ac-chip" title={a.text ?? a.ref}>{ATTACH_NAME[a.kind]} · {a.label}<button className="ac-chip-x" aria-label={t('제거', 'Remove')} onClick={() => setAttach((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
          {images.map((im, i) => <span key={`i${i}`} className="tag ac-chip" title={im.name}>{t('그림', 'Image')} · {im.name}<button className="ac-chip-x" aria-label={t('제거', 'Remove')} onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
        </div>
      )}
      <div className="ac-input">
        <textarea ref={box} rows={2} value={text} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setClosed(null) }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)} onKeyDown={onKey} onCompositionEnd={sendKey.onCompositionEnd} onPaste={onPaste} />
        {menu && (
          <div className={`ac-menu${(box.current?.getBoundingClientRect().top ?? 999) < 320 ? ' down' : ''}`} role="listbox" data-ui={menu.kind === '/' ? '명령 메뉴' : '붙이기 메뉴'}>
            {picks.length
              ? picks.map((p, i) => (
                <button key={p.key} role="option" aria-selected={i === hi} className={`ac-menu-item${i === hi ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => p.run()}>
                  <span className={menu.kind === '/' ? 'mono ac-menu-cmd' : 'ac-menu-label'}>{p.label}</span>
                  {p.meta && <span className="muted ac-menu-meta">{p.meta}</span>}
                </button>
              ))
              : <div className="muted ac-menu-none">{menu.kind === '@' ? (menu.query ? t('맞는 것이 없습니다', 'Nothing matches') : t('노트 · 주제 · 커넥터 이름을 쓰세요 (파일은 두 글자부터)', 'Type a note, topic or connector name (files from two letters)')) : t('맞는 명령이 없습니다', 'No matching command')}</div>}
          </div>
        )}
      </div>
      {shownFail && <span className="error-text ac-hint">{shownFail}</span>}
      <div className="ac-compose-row">
        <PopButton ui="붙이기 버튼" tip={t('붙이기 · 명령 · 그림', 'Attach · commands · images')} label={<span className="ac-pop-ico">{Icon.plus}</span>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); startToken('@') }}>{t('노트 · 주제 · 파일 · 커넥터 붙이기', 'Attach a note, topic, file or connector')}<span className="muted mono ac-key">@</span></button>
            <button role="menuitem" onClick={() => { close(); startToken('/') }}>{t('명령 · 스킬', 'Commands and skills')}<span className="muted mono ac-key">/</span></button>
            <button role="menuitem" onClick={() => { close(); file.current?.click() }}>{t('그림 고르기', 'Choose images')}<span className="muted ac-key">{t('붙여넣기도', 'or paste')}</span></button>
          </>}
        </PopButton>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = '' }} />
        <PopButton ui="맡기는 정도" tip={t('권한 (⇧⇥)', 'Permissions (⇧⇥)')} wide label={<>{settings.custom ? CUSTOM_NAME : TRUST_NAME[settings.trust]} ▾</>}>
          {(close) => TRUSTS.filter((v) => v !== 'plan' || isClaude(settings.agent)).map((v) => (
            <button key={v} role="menuitemradio" aria-checked={settings.trust === v} className={`ac-pop-item${settings.trust === v ? ' on' : ''}`} onClick={() => { close(); onSettings({ trust: v }) }}>
              <span className="ac-pop-check" aria-hidden>{settings.trust === v ? Icon.check : null}</span>
              <span className="ac-pop-what"><span>{TRUST_NAME[v]}</span><span className="muted">{(rid === APP_RID ? APP_HINT : TRUST_HINT)[v]}</span></span>
            </button>
          ))}
        </PopButton>
        <PopButton ui="모델 고르기" tip={t('모델 · 생각 깊이', 'Model · thinking')} label={<>{!isClaude(settings.agent) && <><AgentChip agent={settings.agent} /> </>}{modelName(settings.model, models)}{efforts.length > 0 && ` · ${EFFORT_SHORT[settings.effort]}`} ▾</>}>
          {(close) => <>
            <AgentChoices agent={settings.agent} fixed={agentFixed} onPick={(a) => { close(); if (a !== settings.agent) onSettings({ agent: a, model: 'default', effort: 'medium', ...(a !== 'claude-code' && settings.trust === 'plan' && { trust: 'ask' }) }) }} />
            <div className="ac-pop-h">{t('모델', 'Model')}</div>
            {models.map((m) => <button key={m.value} role="menuitemradio" aria-checked={settings.model === m.value} className={settings.model === m.value ? 'on' : ''} onClick={() => { close(); onSettings({ model: m.value, ...fitEffort(settings.effort, effortsOf(m.value, models)) }) }}><span className="ac-pop-check" aria-hidden>{settings.model === m.value ? Icon.check : null}</span>{modelName(m.value, models)}</button>)}
            {efforts.length > 0 && <div className="ac-pop-h">{t('생각', 'Thinking')}</div>}
            {efforts.map((m) => <button key={m} role="menuitemradio" aria-checked={settings.effort === m} className={settings.effort === m ? 'on' : ''} onClick={() => { close(); onSettings({ effort: m }) }}><span className="ac-pop-check" aria-hidden>{settings.effort === m ? Icon.check : null}</span>{EFFORT_NAME[m]}</button>)}
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
function ChatHead({ chat, onBack, pane, onPane, onDeleted, onSaved, onError, compact = false, tools, onRecord }: {
  chat: Chat
  onBack?(): void
  /** 오른쪽 사이드바 패널 (10/28 안 A): ‹ 목록으로 · 제목 한 줄 · 아래 줄은 묶음 · 상태 · 시각 */
  compact?: boolean
  /** 머리 오른쪽에 더 놓을 버튼 (패널의 자리 · 넓게 보기) */
  tools?: ReactNode
  /** 「기록으로 남기기」 (직접 연 대화, 적기 칸이 있는 패널에서만) */
  onRecord?(): void
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
  const project = projectName(chat.rid, projects)
  const live = isLive(chat.state)
  const actions = useChatActions(chat.id)
  const [renaming, setRenaming] = useState(false)
  const remove = async () => { if (await actions.remove()) onDeleted() }
  const archive = async (v: boolean) => {
    try {
      client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.archive(chat.id, v))
      void client.invalidateQueries({ queryKey: qk.agentChats })
      onSaved(v ? t('보관함에 넣었습니다', 'Archived') : t('보관함에서 꺼냈습니다', 'Unarchived'))
    } catch (e) { onError((e as Error).message) }
  }
  const added = chat.items.reduce((s, i) => s + (i.kind === 'edit' ? i.added : 0), 0)
  const removed = chat.items.reduce((s, i) => s + (i.kind === 'edit' ? i.removed : 0), 0)
  // 맥락 크기는 늘 보이게 (세부는 작업 패널의 사용량). 12만이 넘으면 앞 내용을 요약한다
  const results = chat.items.filter((i): i is Extract<ChatItem, { kind: 'result' }> => i.kind === 'result')
  const context = [...results].reverse().find((r) => r.context)?.context
  const cost = results.reduce((s, r) => s + (r.cost ?? 0), 0)
  const sname = stateName({ state: chat.state, wait: chat.items.some((i) => i.kind === 'ask' && !i.answer && i.plan !== undefined) ? 'plan' : 'ask' })
  return (
    <div className="ac-head" data-ui="대화 헤더">
      {onBack && <button className="icon-btn sm" data-ui="대화 목록으로" data-tip={t('대화 목록', 'Conversations')} aria-label={t('대화 목록으로', 'Back to conversations')} onClick={onBack}>{Icon.back}</button>}
      <div className="ac-head-what">
        {renaming ? <TitleInput value={chat.title} onDone={(v) => { setRenaming(false); if (v !== null) void actions.rename(v) }} />
          : <div className="ac-title" title={chat.title}>{chat.title}</div>}
        {compact ? <div className="ac-meta compact" data-ui="대화 묶음 줄">
          <span>{chat.rid === APP_RID ? project : chatGroupName(chat)}</span><span>·</span><span>{stateName({ state: chat.state, wait: chat.items.some((i) => i.kind === 'ask' && !i.answer && i.plan !== undefined) ? 'plan' : 'ask' })}</span>
          <span>·</span><span>{relativeTime(Date.parse(chat.updated))}</span>
          {chat.archived && <span className="tag">{t('보관함', 'Archived')}</span>}
        </div> : <div className="ac-meta">
          {chat.rid === APP_RID ? <span>{project}</span> : <button className="a" data-ui="대화 프로젝트" onClick={() => go({ page: 'overview', rid: chat.rid })}>{project}</button>}
          <span>·</span><span>{scopeName(chat.scope, topics)}</span>
          {chat.pr && <><span>·</span><a className="a" data-ui="대화 PR" href={chat.pr.url} target="_blank" rel="noreferrer">PR #{chat.pr.number}</a></>}
          {context && <><span>·</span><span data-ui="대화 맥락" title={[t('지금 에이전트가 들고 있는 앞 내용의 크기. 12만이 넘으면 앞 내용을 요약해 줄입니다', 'How much earlier conversation the agent holds. Over 120k it is summarized'), cost > 0 ? costName(cost) : ''].filter(Boolean).join('\n')}>{t('맥락', 'Context')} {tokensName(context.used)}</span></>}
          {chat.archived && <span className="tag">{t('보관함', 'Archived')}</span>}
        </div>}
      </div>
      <ChatStateMark state={chat.state} label={!compact} name={sname} />
      {!!chat.changed.length && !compact && (
        <button className={`btn sm ac-changes-btn${pane ? ' on' : ''}`} data-ui="바뀐 곳 버튼" aria-pressed={onPane ? !!pane : undefined} data-tip={onPane ? t('변경사항 · 작업 패널 여닫기', 'Show or hide changes and work') : t('에이전트 화면에서 변경사항 보기', 'View changes in the agent page')}
          onClick={() => (onPane ? onPane() : go({ page: 'agent', id: chat.id }))}>
          <Delta added={added} removed={removed} />{t('변경사항', 'Changes')}
        </button>
      )}
      {onPane && !chat.changed.length && <button className={`btn sm${pane ? ' on' : ''}`} data-ui="작업 버튼" aria-pressed={!!pane} onClick={onPane}>{t('작업', 'Work')}</button>}
      {tools}
      <HeadMore live={live} archived={!!chat.archived} onRename={() => setRenaming(true)} onArchive={(v) => void archive(v)} onRemove={() => void remove()} onRecord={onRecord} />
    </div>
  )
}

function HeadMore({ live, archived, onRename, onArchive, onRemove, onRecord }: { live: boolean; archived: boolean; onRename(): void; onArchive(v: boolean): void; onRemove(): void; onRecord?(): void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  return (
    <span className="ac-pop" ref={box}>
      <button className={`icon-btn sm${open ? ' on' : ''}`} data-ui="대화 더 보기" data-tip={open ? undefined : t('더 보기', 'More')} aria-label={t('더 보기', 'More')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{Icon.more}</button>
      {open && (
        <div className="menu ac-head-menu" role="menu" data-ui="대화 더 보기 항목">
          <button role="menuitem" data-ui="대화 제목 바꾸기" onClick={() => { setOpen(false); onRename() }}>{t('제목 바꾸기', 'Rename')}</button>
          {onRecord && <button role="menuitem" data-ui="기록으로 남기기" onClick={() => { setOpen(false); onRecord() }}>{t('기록으로 남기기', 'Keep as a record')}</button>}
          <button role="menuitem" disabled={live && !archived} title={live ? t('도는 대화는 멈춘 뒤 보관합니다', 'Stop it before archiving') : undefined} onClick={() => { setOpen(false); onArchive(!archived) }}>{archived ? t('보관함에서 꺼내기', 'Unarchive') : t('보관함에 넣기', 'Archive')}</button>
          <button role="menuitem" className="danger" data-ui="대화 지우기" disabled={live || !archived} title={!archived ? t('보관함에 넣은 대화만 지웁니다', 'Only archived conversations can be deleted') : undefined} onClick={() => { setOpen(false); onRemove() }}>{t('삭제', 'Delete')}</button>
        </div>
      )}
    </span>
  )
}

/** 입력란 위: 도는 동안 보낸 말 (다음 차례에 읽는다). 연필은 빼서 입력란으로, ×는 빼기 */
function QueuedBar({ chat, onEdit, onError }: { chat: Chat; onEdit(f: Omit<Fill, 'n'>): void; onError(m: string): void }) {
  const client = useQueryClient()
  const queued = chat.items.filter((i): i is Extract<ChatItem, { kind: 'user' }> => i.kind === 'user' && !!i.queued)
  if (!queued.length) return null
  const unqueue = async (i: number) => {
    try { const r = await agentChatsApi.unqueue(chat.id, i); client.setQueryData(qk.agentChat(chat.id), r.chat); return r } catch (e) { onError((e as Error).message); return null }
  }
  return (
    <div className="ac-bar" data-ui="다음에 보냄">
      {queued.map((q, i) => (
        <div key={q.at + i} className="ac-bar-line ac-queued">
          <span className="muted ac-queued-h">{t('다음에 보냄', 'Sends next')}</span>
          <span className="ac-bar-text" title={q.text}>{q.text}</span>
          <button className="icon-btn sm" data-ui="기다리는 지시 고치기" data-tip={t('입력란에서 수정', 'Edit in the input')} aria-label={t('수정', 'Edit')} onClick={async () => { const r = await unqueue(i); if (r) onEdit({ text: q.text, attach: q.attach, images: r.images }) }}>{Icon.pencil}</button>
          <button className="icon-btn sm" data-ui="기다리는 지시 빼기" data-tip={t('제거', 'Remove')} aria-label={t('제거', 'Remove')} onClick={() => void unqueue(i)}>{Icon.x}</button>
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
  const [fill, setFill] = useState<Fill>()
  const listRef = useRef<HTMLOListElement>(null)
  // 맨 아래를 보고 있을 때만 새 줄을 따라 내려간다. 위로 올려 읽는 중이면 「최신으로」를 보인다
  const atEnd = useRef(true)
  const [behind, setBehind] = useState(false)
  // 고른 설정은 서버 답을 기다리지 않고 바로 보이고(over), 고친 순서대로 하나씩 보낸다 (⇧⇥를 빨리 눌러도 하나도 잃지 않게)
  const [over, setOver] = useState<Partial<Settings>>({})
  const saving = useRef({ chain: Promise.resolve(), n: 0 })
  useEffect(() => setOver({}), [id])
  // 대화는 마지막 400줄만 두어 줄 수가 그대로일 수 있다: 바뀐 시각으로 본다
  const changed = chat?.updated
  useEffect(() => { atEnd.current = true; setBehind(false) }, [id])
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (atEnd.current) el.scrollTop = el.scrollHeight
    else setBehind(true)
  }, [changed, id])
  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (atEnd.current) setBehind(false)
  }
  const toEnd = () => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; atEnd.current = true; setBehind(false) }
  if (!chat) return <div className="empty center">{error ? (error as Error).message : t('불러오는 중…', 'Loading…')}</div>
  const live = isLive(chat.state)
  const settings: Settings = { trust: trustOf(chat), model: chat.model, effort: chat.effort, agent: chat.agent, ...(chat.rid !== APP_RID && autoCustom(chat) && !over.trust && { custom: true }), ...over }
  const change = (s: Partial<Settings>) => {
    setOver((o) => ({ ...o, ...s }))
    setFail(null)
    const q = saving.current
    q.n++
    q.chain = q.chain.then(async () => {
      try {
        client.setQueryData(qk.agentChat(id), await agentChatsApi.settings(id, { ...(s.trust && settingsOf(s.trust)), ...(s.model && { model: s.model }), ...(s.effort && { effort: s.effort }) }))
      } catch (e) { setFail((e as Error).message) }
      if (--q.n === 0) setOver({})
    })
    if (live) onSaved(t('다음 차례부터 바뀝니다', 'Applies from the next turn'))
  }
  const send = async (m: ChatMessageBody) => {
    setFail(null)
    askNotify()
    // 곁 질문: 에이전트에게 보내지 않고 작은 모델이 따로 답한다
    const side = sideQuestion(m.text)
    client.setQueryData(qk.agentChat(id), await (side ? agentChatsApi.side(id, side) : agentChatsApi.send(id, m)))
    return true
  }
  const stop = async () => { try { client.setQueryData(qk.agentChat(id), await agentChatsApi.stop(id)) } catch (e) { setFail((e as Error).message) } }
  // 되돌리기 (Claude Code의 rewind): 이 지시와 그 뒤를 지우고, 지운 지시는 입력란에서 고쳐 다시 보낸다
  const rewind = async (point: string) => {
    const app = chat.rid === APP_RID
    if (!await askConfirm({
      title: t('여기로 되돌릴까요?', 'Rewind to here?'),
      hint: app
        ? t('이 지시와 그 뒤 대화를 지우고, 작업 폴더의 파일도 이 지시를 보내기 전으로 되돌립니다. 지운 지시는 입력란에 다시 넣습니다.', 'Deletes this message and everything after it, and puts the work folder files back to before it. The message goes back into the input.')
        : t('이 지시와 그 뒤 대화를 지웁니다. 노트 고침은 수정 검토에 그대로 남으니 거기서 되돌리세요. 지운 지시는 입력란에 다시 넣습니다.', 'Deletes this message and everything after it. Note edits stay in edit review; revert them there. The message goes back into the input.'),
      ok: t('되돌리기', 'Rewind'),
    })) return
    setFail(null)
    try {
      const r = await agentChatsApi.rewind(id, point)
      client.setQueryData(qk.agentChat(id), r.chat)
      setFill({ text: r.text, attach: r.attach, n: Date.now() })
      onSaved(r.files ? t(`되돌렸습니다 · 파일 ${r.files}개`, `Rewound · ${r.files} file${r.files > 1 ? 's' : ''}`) : t('되돌렸습니다', 'Rewound'))
    } catch (e) { setFail((e as Error).message) }
  }
  const resume = async () => { setFail(null); try { client.setQueryData(qk.agentChat(id), await agentChatsApi.resume(id)) } catch (e) { setFail((e as Error).message) } }
  // 오류 · 멈춤(앱 재시작 포함)으로 끝난 대화는 같은 세션에서 이어 한다
  const canResume = chat.state === 'error' || chat.state === 'stopped'
  const placeholder = chat.state === 'waiting' ? t('위 카드에 답하거나 이어서 쓰기', 'Answer the card above, or keep writing')
    : chat.state === 'queued' ? t('앞 대화가 끝나면 시작합니다 · 이어서 쓰기', 'Starts when a running conversation finishes · keep writing')
      : live ? t('보내면 다음 차례에 읽습니다', 'Sent now, read next turn')
        : chat.rid === APP_RID ? t('이어서 쓰기 · 그림 붙여넣기', 'Continue · paste images') : t('이어서 쓰기 · / 명령 · @ 붙이기', 'Continue · / commands · @ attach')
  const showTodos = chat.todos.length > 0 && (live || chat.todos.some((x) => x.state !== 'completed'))
  const openChanges = onPane ? () => { if (!pane) onPane() } : undefined
  return (
    <div className="ac-chat" data-ui="에이전트 대화">
      {head && <ChatHead chat={chat} pane={pane} onPane={onPane} onBack={onBack} onDeleted={onDeleted} onSaved={onSaved} onError={setFail} />}
      {chat.record && <RecordBanner rid={chat.rid} record={chat.record} />}
      <ol ref={listRef} className="ac-items" data-ui="대화 줄들" role="log" onScroll={onScroll}>
        {!!chat.trimmed && <li className="ac-note muted">{t(`오래된 앞 줄 ${chat.trimmed}개는 지웠습니다 (대화는 마지막 400줄만 둡니다)`, `${chat.trimmed} older lines were removed (a conversation keeps its last 400)`)}</li>}
        {blocksOf(chat.items).map((b, i) => b.kind === 'steps' ? <Steps key={i} items={b.items} until={b.until} /> : <ItemView key={i} chat={chat} it={b.item} onError={setFail} onChanges={openChanges} onRewind={(p) => void rewind(p)} />)}
        {!!chat.draft && <li className="ac-text ac-draft" data-ui="쓰는 중인 글"><MemoText text={chat.draft} /></li>}
        {chat.state === 'running' && <li className="ac-note muted ac-working" aria-live="polite"><StatusDot s="in-progress" name={chat.compacting ? t('앞 내용을 요약하는 중', 'Summarizing earlier messages') : t('일하는 중', 'Working')} label /></li>}
        {!!chat.tasks && chat.state !== 'running' && <li className="ac-note muted ac-working" data-ui="뒤에서 도는 명령" aria-live="polite"><StatusDot s="in-progress" name={t(`뒤에서 명령 ${chat.tasks}개가 도는 중 · 끝나면 이어서 합니다`, `${chat.tasks} background command${chat.tasks > 1 ? 's' : ''} running · continues when done`)} label /></li>}
        {canResume && <li className="ac-note"><button className="btn sm" data-ui="이어 하기" onClick={() => void resume()}>{t('이어 하기', 'Continue')}</button><span className="muted ac-hint">{t('같은 대화에서 멈춘 곳부터', 'From where it stopped, in the same conversation')}</span></li>}
      </ol>
      <div className="ac-compose">
        {behind && <button className="btn sm ac-latest" data-ui="최신으로" onClick={toEnd}>{Icon.down}{t('최신으로', 'Latest')}</button>}
        {showTodos && <TodoBar todos={chat.todos} />}
        <QueuedBar chat={chat} onEdit={(f) => setFill({ ...f, n: Date.now() })} onError={setFail} />
        <Composer rid={chat.rid} auto={auto} settings={settings} agentFixed onSettings={(s) => void change(s)} onSubmit={send} onStop={live ? () => void stop() : undefined}
          placeholder={placeholder} fail={fail} fill={fill} />
        <div className="muted ac-keys">{t('⇧⇥ 권한 · ⌘↵ 보내기', '⇧⇥ permissions · ⌘↵ send')}{live && t(' · Esc 멈추기', ' · Esc stop')}</div>
      </div>
    </div>
  )
}

// ---------- 새 대화 ----------

const SETTINGS_KEY = 'rw-agent-settings'
const defaultSettings = (): Settings => ({ trust: 'edit', model: 'default', effort: 'medium', agent: 'claude-code', ...store.get<Partial<Settings>>(SETTINGS_KEY, {}) })

/** 새 대화: 프로젝트(rid가 없을 때) · 범위(지금 보는 곳에서) · 입력란 하나 */
export function NewChat({ rid: fixed, note, onCreated }: { rid?: string; note?: { file: string; title: string }; onCreated(c: Chat): void }) {
  const client = useQueryClient()
  const projects = useProjects()
  // 앱 고치기 대화는 에이전트 화면에서만, 앱 저장소가 있는 맥에서만 (2단계 10/21)
  const listed = useChatList().data
  const appOk = !fixed && !!listed?.app
  const [pick, setPick] = useState(() => store.get<string>('rw-agent-project', ''))
  useEffect(() => {
    const on = (e: Event) => setPick((e as CustomEvent<string>).detail)
    window.addEventListener(PICK_EVENT, on)
    return () => window.removeEventListener(PICK_EVENT, on)
  }, [])
  const rid = fixed ?? (projects?.some((p) => p.id === pick) || (appOk && pick === APP_RID) ? pick : projects?.[0]?.id ?? '')
  const app = rid === APP_RID
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: !!rid && !app }).data
  const [kind, setKind] = useState<ChatScope['kind']>(note ? 'note' : 'project')
  const [topic, setTopic] = useState('')
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const topicId = topic || topics?.[0]?.id || ''
  const scope: ChatScope = app ? { kind: 'app' } : kind === 'note' && note ? { kind, target: note.file } : kind === 'topic' && topicId ? { kind, target: topicId } : { kind: 'project' }
  const change = (s: Partial<Settings>) => { const v = { ...settings, ...s }; setSettings(v); store.set(SETTINGS_KEY, v) }
  const start = async (m: ChatMessageBody) => {
    if (!rid) return false
    askNotify()
    const c = await agentChatsApi.create({ rid, ...m, scope, ...settingsOf(settings.trust), model: settings.model, effort: settings.effort, ...(!isClaude(settings.agent) && { agent: agentOf(settings.agent) }) })
    void client.invalidateQueries({ queryKey: qk.agentChats })
    onCreated(c)
    return true
  }
  // 프로젝트가 하나도 없으면 고르기 칸이 비어 이유가 안 보인다 (10/21 맥미니): 무엇을 하면 되는지 적는다
  if (!fixed && projects && !projects.length && !appOk) return (
    <div className="ac-new" data-ui="새 대화"><p className="muted">{t('대화는 프로젝트 하나에서 엽니다. 등록한 프로젝트가 아직 없습니다: 레일의 ＋로 프로젝트를 등록하세요.', 'A conversation opens in one project, and no project is registered yet. Register one with ＋ on the rail.')}</p></div>
  )
  const kinds: [ChatScope['kind'], string][] = [['project', t('프로젝트', 'Project')], ['topic', t('주제', 'Topic')], ...(note ? [['note', t('이 노트', 'This note')] as [ChatScope['kind'], string]] : [])]
  return (
    <div className="ac-new" data-ui="새 대화">
      <div className="ac-new-row">
        {!fixed && (
          <select className="rs-select" data-ui="대화 프로젝트 고르기" aria-label={t('프로젝트', 'Project')} value={rid} onChange={(e) => { setPick(e.target.value); store.set('rw-agent-project', e.target.value); setTopic('') }}>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            {appOk && <option value={APP_RID}>{t('워크벤치 전체: 앱 수정', 'Whole workbench: fix the app')}</option>}
          </select>
        )}
        {!app && <span className="rs-label">{t('범위', 'Scope')}</span>}
        {!app && (
          <div className="segmented small" role="radiogroup" aria-label={t('범위', 'Scope')} data-ui="대화 범위">
            {kinds.map(([k, label]) => <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} disabled={k === 'topic' && !topics?.length} onClick={() => setKind(k)}>{label}</button>)}
          </div>
        )}
        {!app && kind === 'topic' && !!topics?.length && (
          <select className="rs-select" data-ui="대화 주제 고르기" aria-label={t('주제', 'Topic')} value={topicId} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        )}
      </div>
      {rid && <Composer key={rid} rid={rid} auto={note ? { kind: 'note', ref: note.file, label: note.title } : undefined} settings={settings} onSettings={change} onSubmit={start}
        placeholder={app ? t('고칠 것을 쓰세요 · 그림 붙여넣기', 'What should change in the app? · paste images') : t('맡길 일을 쓰세요 · / 명령 · @ 노트 붙이기 · 그림 붙여넣기', 'What should the agent do? · / commands · @ attach · paste images')} />}
      <span className="muted ac-hint">{app
        ? t('앱 저장소의 따로 둔 폴더에서 고치고 시험합니다. 커밋 · PR은 앱이 하고, GitHub CI가 한 번 더 봅니다. 연구 프로젝트는 읽기만 합니다', 'Edits and tests in a separate folder of the app repository. The app commits and opens the PR, and GitHub CI checks again. Research projects are read-only')
        : `${TRUST_HINT[settings.trust]}. ${t('범위 밖은 읽기만 합니다', 'Outside the scope it only reads')}`}</span>
    </div>
  )
}

// ---------- 오른쪽 세부 패널: 바뀐 곳 · 작업 (에이전트 화면) ----------

type Edit = Extract<ChatItem, { kind: 'edit' }>

/** 바뀐 곳에 단 코멘트를 에이전트에게 보낼 지시로 */
export function commentMessage(notes: { file: string; old: string; new: string; text: string }[]): ChatMessageBody {
  return {
    text: [t('변경사항에 코멘트를 달았습니다. 하나씩 반영해 주세요.', 'I commented on the changes. Please address each one.'), ...notes.map((n, i) => `${i + 1}. ${n.file}: ${n.text}`)].join('\n'),
    attach: notes.map((n) => ({ kind: 'selection' as const, ref: n.file, label: (n.new || n.old).slice(0, 40), text: [n.old && `- ${n.old}`, n.new && `+ ${n.new}`].filter(Boolean).join('\n').slice(0, 4000) })),
  }
}

/** 바뀐 곳: 파일마다 고친 문단(− · +), 문단을 누르면 코멘트, 모아서 에이전트에게 보내기. 승인 · 되돌리기는 수정 검토에서(파일 줄 오른쪽 「수정 검토 ›」, 10/28 21:39 정렬) */
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
              {chat.rid !== APP_RID && <button className="a ac-change-review" data-ui="수정 검토로" title={t('수정 검토에서 승인 · 되돌리기', 'Approve or revert in edit review')} onClick={() => reviewOf(chat.rid, f)}>{t('수정 검토 ›', 'Edit review ›')}</button>}
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

/** 맥락 창이 이만큼 차면 /compact를 권한다 */
const COMPACT_HINT = 0.8

/**
 * 「이 대화」 칸 (10/28 20:10 피드백 "컨텍스트 윈도우, 기본정보등이 다 있으면", 시안 1절):
 * 맥락 창 막대 · 모델 · 범위 · 쓴 토큰과 가격 · 일한 시간 · 시작과 마지막 · 작업 폴더(앱 고치기). 차례가 끝나기 전에도 보인다
 */
function ChatInfo({ chat }: { chat: Chat }) {
  const models = useModels()
  const topics = useQuery({ queryKey: qk.topics(chat.rid), queryFn: () => api.research(chat.rid).topics(), enabled: chat.scope.kind === 'topic' }).data
  const results = chat.items.filter((i): i is Extract<ChatItem, { kind: 'result' }> => i.kind === 'result')
  const cost = results.reduce((s, r) => s + (r.cost ?? 0), 0)
  const secs = results.reduce((s, r) => s + (r.seconds ?? 0), 0)
  const tokens = results.reduce((s, r) => s + (r.tokens ? r.tokens.in + r.tokens.out : 0), 0)
  const context = [...results].reverse().find((r) => r.context)?.context
  const share = context ? Math.min(1, context.used / context.window) : 0
  const when = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  return (
    <section className="ac-info" data-ui="이 대화 정보">
      <h3>{t('이 대화', 'This conversation')}</h3>
      <div className="ac-work-row"><span>{t('컨텍스트 창', 'Context window')}</span>
        <span className="muted">{context ? `${tokensName(context.used)} / ${tokensName(context.window)} · ${Math.round(share * 100)}%` : t('첫 차례가 끝나면 보입니다', 'Shown after the first turn')}</span></div>
      {context && <div className="ac-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t('컨텍스트 창', 'Context window')}><i style={{ width: `${share * 100}%` }} /></div>}
      {context && share >= COMPACT_HINT && <span className="muted ac-hint">{t('컨텍스트 창이 많이 찼습니다. /compact로 앞 내용을 요약할 수 있습니다', 'The context window is nearly full. /compact summarizes earlier turns')}</span>}
      <dl className="ac-info-list">
        <dt>{t('모델', 'Model')}</dt><dd><AgentChip agent={chat.agent} /> {modelName(chat.model, models)}{effortsOf(chat.model, models).length > 0 && ` · ${EFFORT_NAME[chat.effort]}`}</dd>
        <dt>{t('범위', 'Scope')}</dt><dd>{scopeName(chat.scope, topics)}</dd>
        <dt>{t('사용 토큰', 'Tokens used')}</dt><dd>{tokens > 0 ? `${tokensName(tokens)} (${t(`차례 ${results.length}번`, `${results.length} turn${results.length > 1 ? 's' : ''}`)})` : t('아직 없음', 'None yet')}{cost > 0 && <span className="muted" title={costName(cost)}> · {t(`API 가격 약 $${cost.toFixed(2)}`, `about $${cost.toFixed(2)} at API prices`)}</span>}</dd>
        {secs > 0 && <><dt>{t('일한 시간', 'Time worked')}</dt><dd>{secondsName(secs)}</dd></>}
        <dt>{t('시작', 'Started')}</dt><dd>{when(chat.created)} <span className="muted">· {t('마지막', 'last')} {when(chat.updated)}</span></dd>
        {chat.branch && <><dt>{t('작업 폴더', 'Work folder')}</dt><dd className="mono ac-file" title={chat.branch}>{chat.branch}</dd></>}
      </dl>
    </section>
  )
}

/** 하나씩 바꿔 권한 이름의 기본값과 다를 때의 이름 */
const CUSTOM_NAME = t('직접 정함', 'Custom')
type PermRow = { ui: string; name: string; what: string; turn?: keyof ChatAutoValues | 'edit'; asks?: boolean }
/** 권한 표 (10/28 사용자 결정 "권한을 명령 대신 하는 일로", 시안 4절): 앱이 명령을 하는 일로 나누고, 켠 것은 묻지 않는다 */
const PERM_ROWS: PermRow[] = [
  { ui: '읽기', name: t('읽기', 'Read'), what: t('ls · cat · grep · git log (프로젝트와 등록한 폴더 안)', 'ls · cat · grep · git log (inside the project and registered folders)'), turn: 'read' },
  { ui: '편집', name: t('편집', 'Edit'), what: t('범위 안 노트 수정 · sed -i · mv', 'Edit notes in scope · sed -i · mv'), turn: 'edit' },
  { ui: '지우기', name: t('삭제', 'Delete'), what: t('rm · 파일 삭제 · 고친 것 버리기', 'rm · deleting files · discarding changes'), asks: true },
  { ui: '실행', name: t('실행', 'Run'), what: t('python · julia · pnpm test …', 'python · julia · pnpm test …'), turn: 'run' },
  { ui: '웹 보기', name: t('웹 보기', 'Web'), what: t('웹 검색 · 페이지 읽기', 'Web search · reading pages'), turn: 'web' },
  { ui: '외부', name: t('외부', 'Outside'), what: t('폴더 밖 · git push · 설치 · 내려받기', 'Outside the folders · git push · installs · downloads'), asks: true },
]

function PermTable({ chat, onSaved }: { chat: Chat; onSaved(m: string): void }) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const auto = autoOf(chat)
  const readOnly = chat.write === 'read'
  const set = async (row: PermRow, on: boolean) => {
    setBusy(true)
    try {
      const body: ChatSettings = row.turn === 'edit'
        ? { write: 'notes', mode: on ? 'edit' : 'ask', auto }
        : { auto: { ...auto, [row.turn!]: on } }
      client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.settings(chat.id, body))
      if (isLive(chat.state) && row.turn === 'edit') onSaved(t('다음 차례부터 바뀝니다', 'Applies from the next turn'))
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="ac-perm" role="table" aria-label={t('권한', 'Permissions')}>
      <div className="ac-perm-row ac-perm-head" role="row"><span role="columnheader">{t('하는 일', 'Does')}</span><span role="columnheader">{t('자동 허용', 'Auto')}</span></div>
      {PERM_ROWS.map((r) => {
        const on = r.turn === 'edit' ? chat.mode === 'edit' && !readOnly : r.turn ? auto[r.turn] : false
        const blocked = readOnly && (r.turn === 'edit' || r.ui === '삭제')
        return (
          <div key={r.ui} className="ac-perm-row" role="row" data-ui={`권한 ${r.ui}`}>
            <span className="ac-perm-what" role="cell"><b>{r.name}</b><span className="muted">{r.what}</span></span>
            <span role="cell" className="ac-perm-ctl">
              {blocked ? <span className="muted">{t('막음', 'Blocked')}</span>
                : r.asks ? <span className="muted">{t('늘 물음', 'Always asks')}</span>
                : <button type="button" role="switch" className="switch" aria-checked={on} aria-label={r.name} disabled={busy} onClick={() => void set(r, !on)} />}
            </span>
          </div>
        )
      })}
      {chat.mode === 'plan' && !readOnly && <span className="muted ac-hint">{t('계획 모드: 계획을 승인하기 전에는 편집 · 삭제를 막습니다', 'Plan mode: edits and deletes are blocked until you approve the plan')}</span>}
    </div>
  )
}

const PERM_OPEN_KEY = 'rw-agent-perm-open'

/** 세부 패널: 이 대화(맥락 창 · 기본 정보) · 바뀐 곳(있으면) · 잡은 파일(다른 대화 것도) · 이 대화의 허락 · 하위 에이전트 */
export function WorkColumn({ id, onSaved }: { id: string; onSaved(m: string): void }) {
  const client = useQueryClient()
  const [permOpen, setPermOpen] = useState(() => store.get<boolean>(PERM_OPEN_KEY, false))
  const setPerm = (v: boolean) => { setPermOpen(v); store.set(PERM_OPEN_KEY, v) }
  const chat = useChat(id).data
  const work = useQuery({ queryKey: qk.agentWork, queryFn: () => agentChatsApi.work() }).data
  if (!chat) return null
  const others = (work?.chats ?? []).filter((c) => c.id !== chat.id && c.rid === chat.rid && c.claims.length)
  const agents = chat.items.filter((i): i is Step => i.kind === 'step' && isAgentStep(i))
  const forget = async (label: string) => client.setQueryData(qk.agentChat(id), await agentChatsApi.forget(id, label))
  const trust = trustOf(chat)
  const hasEdits = chat.items.some((i) => i.kind === 'edit')
  return (
    <aside className="ac-work" data-ui="작업 상태">
      <ChatInfo chat={chat} />
      {hasEdits && <><h3>{t('변경사항', 'Changes')}</h3><Changes chat={chat} onSaved={onSaved} /></>}
      <section data-ui="잡은 파일">
        <h3>{t('사용 중인 파일', 'Claimed files')}</h3>
        {chat.claims.map((f) => <div key={f} className="ac-work-row"><span className="mono ac-file" title={f}>{f}</span><span className="tag">{t('이 대화', 'This')}</span></div>)}
        {others.flatMap((o) => o.claims.map((f) => <div key={`${o.id}${f}`} className="ac-work-row"><span className="mono ac-file muted" title={f}>{f}</span><button className="a ac-other" title={o.title} onClick={() => go({ page: 'agent', id: o.id })}>{o.title}</button></div>))}
        {!chat.claims.length && !others.length && <span className="muted ac-hint">{t('지금 고치는 파일이 없습니다', 'No file is being changed now')}</span>}
        <span className="muted ac-hint">{t('다른 대화가 사용 중인 파일은 읽기만 합니다', 'Files claimed by another conversation are read only')}</span>
      </section>
      {/* 권한은 이름 한 줄만, 토글은 「상세 보기」로 펼쳐서 (10/28 21:19 수정 요청) */}
      <section data-ui="이 대화의 허락">
        <h3>{t('이 대화의 권한', 'Permissions here')}</h3>
        <div className="ac-work-row">
          <span className="ac-perm-name">{chat.rid !== APP_RID && autoCustom(chat) ? CUSTOM_NAME : TRUST_NAME[trust]}</span>
          {!!chat.always.length && <span className="muted">{t(`늘 허락 ${chat.always.length}`, `${chat.always.length} always allowed`)}</span>}
          <button className="a" data-ui="권한 상세 보기" aria-expanded={permOpen} onClick={() => setPerm(!permOpen)}>{permOpen ? t('접기', 'Collapse') : t('상세 보기 ›', 'Details ›')}</button>
        </div>
        {permOpen && (chat.rid === APP_RID ? <span className="muted ac-hint">{APP_HINT[trust]}</span> : <PermTable chat={chat} onSaved={onSaved} />)}
        {permOpen && chat.always.map((a) => (
          <div key={a} className="ac-work-row">
            <span className="ac-file" title={a}>{a}</span><span className="muted">{t('늘', 'Always')}</span>
            <button className="icon-btn sm" aria-label={t('늘 허락 제거', 'Stop always allowing')} data-tip={t('다시 묻게 합니다', 'Ask again next time')} onClick={() => void forget(a)}>{Icon.x}</button>
          </div>
        ))}
      </section>
      {!!agents.length && (
        <section data-ui="하위 에이전트">
          <h3>{t('하위 에이전트', 'Subagents')}</h3>
          {agents.map((s, i) => <div key={i} className="ac-work-row"><span className="ac-file" title={s.summary}>{s.summary}</span></div>)}
        </section>
      )}
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

/** 새 대화를 이 프로젝트(또는 워크벤치)에서 연다: 새 대화 화면이 이미 열려 있어도 고른 것을 바꾼다 */
const PICK_EVENT = 'rw-agent-pick'
function newChatIn(rid: string): void {
  store.set('rw-agent-project', rid)
  window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: rid }))
  go({ page: 'agent' })
}

const FOLD_KEY = 'rw-agent-fold'

/**
 * 사이드바 (10/22 "프로젝트별로, 워크벤치 전역은 따로"): 새 대화, 걸러 보기(내 차례 · 일하는 중 · 모두),
 * 맨 위 「워크벤치」(앱 자체를 고치는 대화 · 피드백 처리), 그 아래 등록한 프로젝트마다 접는 묶음(＋로 그 프로젝트에서 새 대화), 맨 아래 보관함
 */
export function AgentSide({ id }: { id?: string }) {
  const listed = useChatList().data
  const list = listed?.chats
  const projects = useProjects()
  const [filter, setFilterState] = useState<Filter>(() => store.get<Filter>('rw-agent-filter', 'all'))
  const setFilter = (f: Filter) => { setFilterState(f); store.set('rw-agent-filter', f) }
  const [fold, setFoldState] = useState<string[]>(() => store.get<string[]>(FOLD_KEY, []))
  const toggle = (rid: string) => { const v = fold.includes(rid) ? fold.filter((x) => x !== rid) : [...fold, rid]; setFoldState(v); store.set(FOLD_KEY, v) }
  const count = (f: Filter) => (list ?? []).filter(keepFor(f)).length
  const by = useMemo(() => {
    const m = new Map<string, ChatRow[]>()
    for (const c of [...(list ?? [])].filter(keepFor(filter)).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))) m.set(c.rid, [...(m.get(c.rid) ?? []), c])
    return m
  }, [list, filter])
  // 묶음 차례: 워크벤치, 등록한 프로젝트 (대화가 있는데 등록에서 빠진 프로젝트도 끝에)
  const rids = [...(projects ?? []).map((p) => p.id), ...[...by.keys()].filter((r) => r !== APP_RID && !projects?.some((p) => p.id === r))]
  const showApp = !!listed?.app || by.has(APP_RID)
  const archived = count('archived')
  // 여러 개 고르기 (10/28 피드백 21:19 코멘트, 시안 4절): 목록에서는 보관만, 보관함에서는 꺼내기 · 지우기
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const bulk = useBulkChats()
  const stopPicking = () => { setPicking(false); setPicked([]) }
  const shown = [...by.values()].flat()
  const pickOf = (c: ChatRow) => picking ? {
    on: picked.includes(c.id),
    disabled: filter !== 'archived' && isLive(c.state) ? t('도는 대화는 멈춘 뒤 보관합니다', 'Stop it before archiving') : undefined,
    toggle: () => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id]),
  } : undefined
  const group = (rid: string, name: string, hint?: string) => {
    const chats = by.get(rid) ?? []
    // 걸러 볼 때는 대화가 없는 묶음을 숨긴다 (모두 · 보관함은 프로젝트를 다 보인다)
    if (!chats.length && filter !== 'all') return null
    const open = !fold.includes(rid)
    const app = rid === APP_RID
    return (
      <div key={rid} className={`ac-group${app ? ' app' : ''}`} data-ui={app ? '워크벤치 대화' : '프로젝트 대화'} data-ui-item={app ? undefined : name}>
        <div className={`ac-group-h${open ? ' open' : ''}`}>
          <button className="ac-group-name" aria-expanded={open} onClick={() => toggle(rid)} title={name}>
            <span className="tree-chev" aria-hidden><span>›</span></span>
            <span className="label">{name}</span>
            {!!chats.length && <span className="n">{chats.length}</span>}
          </button>
          {filter !== 'archived' && (rid === APP_RID ? listed?.app : true) && (
            <button className="icon-btn sm" data-ui="이 묶음에서 새 대화" data-tip={t('여기서 새 대화', 'New conversation here')} aria-label={t(`${name}에서 새 대화`, `New conversation in ${name}`)} onClick={() => newChatIn(rid)}>{Icon.plus}</button>
          )}
        </div>
        {open && <ChatGroups chats={chats} line={(c) => <ChatLine key={c.id} c={c} on={c.id === id} actions pick={pickOf(c)} onOpen={() => go({ page: 'agent', id: c.id })} />} />}
        {open && !chats.length && hint && <div className="muted ac-group-empty">{hint}</div>}
      </div>
    )
  }
  return (
    <div className="set-side ac-list" data-ui="대화 목록">
      <button className={`nav${!id ? ' on' : ''}`} data-ui="새 대화 줄" onClick={() => go({ page: 'agent' })}><span className="label">{t('＋ 새 대화', '＋ New conversation')}</span></button>
      {!!list?.length && filter !== 'archived' && (
        <div className="segmented small full ac-filter" role="radiogroup" aria-label={t('걸러 보기', 'Filter')} data-ui="대화 필터">
          {(['mine', 'live', 'all'] as const).map((f) => <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{FILTER_NAME[f]}{f !== 'all' && count(f) ? ` ${count(f)}` : ''}</button>)}
        </div>
      )}
      {filter === 'archived' && <button className="a ac-archive-back" data-ui="보관함 닫기" onClick={() => { stopPicking(); setFilter('all') }}>‹ {t('보관함', 'Archive')} {archived}</button>}
      {!!shown.length && (picking
        ? <div className="ac-pickbar" data-ui="대화 고르기 툴바">
          <b>{t(`${picked.length}개 고름`, `${picked.length} picked`)}</b>
          <span className="sp" />
          {filter === 'archived'
            ? <>
              <button className="btn sm" disabled={!picked.length || bulk.busy} onClick={() => void bulk.archive(picked, false).then(stopPicking)}>{t('꺼내기', 'Unarchive')}</button>
              <button className="btn sm danger" data-ui="대화 지우기" disabled={!picked.length || bulk.busy} onClick={() => void bulk.remove(picked).then((ok) => { if (ok) { if (id && picked.includes(id)) go({ page: 'agent' }); stopPicking() } })}>{t('삭제', 'Delete')}</button>
            </>
            : <button className="btn sm" disabled={!picked.length || bulk.busy} onClick={() => void bulk.archive(picked, true).then(stopPicking)}>{t('보관', 'Archive')}</button>}
          <button className="btn sm" onClick={stopPicking}>{t('끝', 'Done')}</button>
        </div>
        : <button className="a ac-pick-start" data-ui="대화 여러 개 고르기" onClick={() => setPicking(true)}>{filter === 'archived' ? t('골라서 꺼내기 · 삭제', 'Pick to unarchive or delete') : t('선택 보관', 'Pick to archive')}</button>)}
      {list && !!list.length && filter !== 'all' && !by.size && <div className="empty">{filter === 'mine' ? t('답할 대화가 없습니다', 'Nothing waits for you') : filter === 'live' ? t('일하는 대화가 없습니다', 'No conversation is working') : t('보관한 대화가 없습니다', 'Nothing archived')}</div>}
      {showApp && (
        <>
          <div className="ac-side-h">{t('워크벤치 전체', 'Whole workbench')}</div>
          {group(APP_RID, t('앱 수정 · 피드백', 'App fixes · feedback'), t('앱 자체를 고치는 대화입니다. 피드백을 맡기면 여기에 생깁니다', 'Conversations that fix the app itself. Feedback you hand off shows up here'))}
        </>
      )}
      {!!rids.length && <div className="ac-side-h">{t('프로젝트', 'Projects')}</div>}
      {rids.map((rid) => group(rid, projectName(rid, projects)))}
      {filter !== 'archived' && archived > 0 && <button className="a ac-archive-link" data-ui="보관함 열기" onClick={() => { stopPicking(); setFilter('archived') }}>{t(`보관함 ${archived} ›`, `Archive ${archived} ›`)}</button>}
    </div>
  )
}

const SHIPPED_SEEN = 'rw-feedback-shipped-seen'
/**
 * 상단바 "#n 반영됨" (2단계 다, 10/21): 피드백을 맡은 대화의 PR을 앱이 합쳤고, 그 커밋이 지금 도는 앱에 들어왔을 때.
 * 누르면 피드백 화면으로, ×로 닫으면 이 브라우저에서 다시 보이지 않는다.
 */
export function ShippedNotice() {
  const list = useChatList().data?.chats
  const [seen, setSeen] = useState<string[]>(() => store.get<string[]>(SHIPPED_SEEN, []))
  const fresh = (list ?? []).filter((c) => c.shipped && c.pr && !seen.includes(c.id))
  if (!fresh.length) return null
  const names = fresh.map((c) => `#${c.pr!.number}`).join(' · ')
  const close = () => { const next = [...seen, ...fresh.map((c) => c.id)].slice(-200); store.set(SHIPPED_SEEN, next); setSeen(next) }
  return (
    <span className="tb-shipped" data-ui="반영됨 알림">
      <button type="button" className="a" title={t('피드백 화면에서 보기', 'See it on the Feedback screen')} onClick={() => go({ page: 'feedback' })}>{t(`${names} 반영됨`, `${names} shipped`)}</button>
      <button type="button" className="icon-btn sm" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={close}>{Icon.x}</button>
    </span>
  )
}

/** 레일 배지: 답을 기다리는 대화 수 (사용자 차례) */
// ---------- 알림 (10/22): 일하던 대화가 답을 마치거나 · 내 차례가 되거나 · 오류로 멈추면 맥 알림 ----------

const NOTIFY_KEY = 'rw-agent-notify'
/** 대화 알림을 켰는가 (설정 › 에이전트, 기본 켬) */
export const notifyOn = () => store.get<boolean>(NOTIFY_KEY, true)
export const setNotifyOn = (v: boolean) => store.set(NOTIFY_KEY, v)
/** 맥(브라우저)이 알림을 허락했는가: granted · denied · default(아직 묻지 않음) · none(알림이 없는 곳) */
export const notifyPermission = (): NotificationPermission | 'none' => (typeof Notification === 'undefined' ? 'none' : Notification.permission)
/** 알림 허락을 묻는다 (누르는 때에만 물을 수 있다: 보내기 · 설정의 버튼) */
export function askNotify(): void {
  if (notifyOn() && notifyPermission() === 'default') void Notification.requestPermission()
}

/** 알릴 바뀜: 일하던(돌거나 기다리거나 줄 선) 대화가 내 차례(허락 · 계획) · 끝남 · 오류로. 알리지 않으면 null */
export function notifyWhy(before: ChatState | undefined, c: Pick<ChatRow, 'state' | 'wait'>): string | null {
  if (!before || before === c.state) return null
  if (c.state === 'waiting') return stateName(c)
  if (!isLive(before)) return null
  if (c.state === 'idle') return t('답을 마쳤습니다', 'Finished its reply')
  if (c.state === 'error') return t('오류로 멈췄습니다', 'Stopped with an error')
  return null
}

/** 대화 목록을 보고 바뀐 대화를 알린다. 창을 보고 있으면 알리지 않는다(레일의 수가 보인다). 알림을 누르면 그 대화로 */
export function useAgentNotify(): void {
  const list = useChatList().data?.chats
  const last = useRef<Map<string, ChatState> | null>(null)
  useEffect(() => {
    if (!list) return
    const before = last.current
    last.current = new Map(list.map((c) => [c.id, c.state]))
    if (!before || !notifyOn() || notifyPermission() !== 'granted' || (document.hasFocus() && !document.hidden)) return
    for (const c of list) {
      const why = notifyWhy(before.get(c.id), c)
      if (!why) continue
      const show = (body: string) => {
        const n = new Notification(c.title, { body, tag: `agent-${c.id}` })
        n.onclick = () => { window.focus(); go({ page: 'agent', id: c.id }); n.close() }
      }
      // 답을 마쳤으면 마지막 글 앞부분을 함께
      if (c.state !== 'idle') { show(why); continue }
      agentChatsApi.get(c.id).then((chat) => {
        const text = [...chat.items].reverse().find((i): i is Extract<ChatItem, { kind: 'text' }> => i.kind === 'text' && !i.sub)?.text
        show(text ? `${why} · ${text.replace(/\s+/g, ' ').slice(0, 140)}` : why)
      }, () => show(why))
    }
  }, [list])
}

export function AgentRailCount() {
  const list = useChatList().data?.chats
  const n = list?.filter(myTurn).length ?? 0
  return n ? <span className="rail-count" title={t(`답을 기다리는 대화 ${n}개`, `${n} conversation(s) waiting for you`)}>{n}</span> : null
}

// ---------- 오른쪽 사이드바의 에이전트 탭 패널 ----------

/** 패널 자리: 오른쪽 사이드바 자리 · 작업 화면 아래 (나란히는 대화를 노트 옆 패널의 탭으로 연다) */
export type AgentPlace = 'right' | 'bottom'

/** 지금 프로젝트의 대화. 머리에서 대화를 고르고(▾) · 자리 · 새 대화 · 에이전트 화면에서 넓게 보기. 연 대화는 프로젝트마다 기억한다 */
export function AgentPanel({ rid, note, onSaved, place = 'right', onPlace, onBeside, recordTarget }: {
  rid: string
  note?: { file: string; title: string }
  onSaved(m: string): void
  place?: AgentPlace
  onPlace?(p: AgentPlace): void
  /** 연 대화를 노트 옆 패널의 탭으로 */
  onBeside?(id: string): void
  /** 오른쪽 사이드바 적기 칸의 대상 (「기록으로 남기기」 초안이 그 칸에 뜬다) */
  recordTarget?: { target: string; title: string; source?: string }
}) {
  const key = agentPanelKey(rid)
  const [open, setOpenState] = useState<string | null>(() => store.get<string | null>(key, null))
  const setOpen = (v: string | null) => { setOpenState(v); store.set(key, v) }
  // 기록 · 수정 검토의 「대화 보기」가 이 패널에서 대화를 연다 (agentPanelOpen.ts)
  useEffect(() => {
    const take = (e: Event) => { const d = (e as CustomEvent<{ rid: string; id: string }>).detail; if (d.rid === rid) setOpenState(d.id) }
    window.addEventListener(AGENT_PANEL_OPEN, take)
    return () => window.removeEventListener(AGENT_PANEL_OPEN, take)
  }, [rid])
  const list = useChatList(rid).data?.chats
  const known = open && list?.some((c) => c.id === open)
  const current = open && (known || !list) ? open : null
  const auto: Attach | undefined = note ? { kind: 'note', ref: note.file, label: note.title } : undefined
  const sorted = [...(list ?? [])].filter((c) => !c.archived || c.id === current).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))
  const placeMenu = onPlace && (
    <PopButton icon down ui="대화 자리" tip={t('패널 자리', 'Panel position')} label={Icon.split}>
      {(close) => <>
        {(['right', 'bottom'] as const).map((v) => (
          <button key={v} role="menuitemradio" aria-checked={place === v} className={place === v ? 'on' : ''} onClick={() => { close(); onPlace(v) }}>
            <span className="ac-pop-check" aria-hidden>{place === v ? Icon.check : null}</span>{v === 'right' ? t('오른쪽 사이드바 자리', 'In the right sidebar') : t('작업 화면 아래', 'Below the workspace')}
          </button>
        ))}
        {onBeside && <button role="menuitem" disabled={!current} title={current ? undefined : t('대화를 먼저 여세요', 'Open a conversation first')} onClick={() => { close(); if (current) onBeside(current) }}>
          <span className="ac-pop-check" aria-hidden />{t('노트 옆 패널에 나란히', 'Side by side with the note')}
        </button>}
      </>}
    </PopButton>
  )
  // 안 A (10/28 23:08 결정): 목록 ↔ 대화. 대화를 열면 머리가 ‹ · 제목 · 묶음 · 상태 · ⋯ 로 바뀐다
  if (current) return (
    <div className={`rs ac-panel${place === 'bottom' ? ' bottom' : ''}`} data-ui="에이전트 패널">
      <PanelChat key={current} id={current} auto={auto} onBack={() => setOpen(null)} onDeleted={() => setOpen(null)} onSaved={onSaved} recordTarget={recordTarget} tools={<>
        {placeMenu}
        <button className="icon-btn sm" data-ui="넓게 보기" data-tip={t('에이전트 화면에서 넓게 보기', 'Open wide in the agent page')} aria-label={t('넓게 보기', 'Open wide')} onClick={() => go({ page: 'agent', id: current })}>{Icon.openNote}</button>
      </>} />
    </div>
  )
  const newChat = <NewChat rid={rid} note={note} onCreated={(c) => setOpen(c.id)} />
  const chats = !!sorted.length && <div className="ac-panel-chats">
    <div className="set-side"><ChatGroups chats={sorted} line={(c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => setOpen(c.id)} />} /></div>
  </div>
  return (
    <div className={`rs ac-panel${place === 'bottom' ? ' bottom' : ''}`} data-ui="에이전트 패널">
      <div className="rs-head ac-panel-head">
        <span className="ac-panel-name" aria-hidden>{Icon.spark}</span>
        <span className="ac-panel-title">{t('이 프로젝트의 대화', 'Conversations in this project')}</span>
        <span className="sp" />
        {placeMenu}
      </div>
      {/* 오른쪽 자리: 새 대화의 범위 · 입력란은 연 대화의 입력란처럼 패널 아래에 고정하고, 대화 목록은 그 위에서 스크롤 (10/27 17:06 피드백) */}
      {place === 'bottom'
        ? <div className="rs-scroll ac-panel-list">{newChat}{chats}</div>
        : <><div className="rs-scroll ac-panel-list">{chats}</div><div className="ac-compose ac-new-dock">{newChat}</div></>}
    </div>
  )
}

/** 기록에 딸린 대화의 맨 위 (10/28 시안 2절): 맡은 기록 하나와 「기록으로 가기 ›」. 답은 차례가 끝나면 앱이 그 기록에 적는다 */
function RecordBanner({ rid, record }: { rid: string; record: { target: string; id: string } }) {
  const files = useRecords(rid).data?.files
  const file = files?.find((f) => f.target === record.target)
  const c = file?.comments.find((x) => x.id === record.id)
  // 기록 보기 (10/28 사용자 정정): 기록 화면으로 가지 않고 이 자리에서 기록의 답을 펼친다
  const [open, setOpen] = useState(false)
  return (
    <div className="ac-record" data-ui="맡은 기록">
      <div className="ac-record-h muted">{t('이 대화는 기록 하나를 맡았습니다. 차례가 끝나면 마지막 글이 그 기록의 답으로 붙습니다.', 'This conversation handles one record. When a turn ends, its last message is added to that record as the answer.')}</div>
      <div className="ac-record-body">
        <span className="ac-record-kind" aria-hidden>{c?.kind === '지시' ? Icon.send : Icon.ask}</span>
        <span className="ac-record-text" title={c?.body}>{c ? c.body.split('\n')[0] : files ? t('기록을 찾지 못했습니다 (지웠을 수 있음)', 'Record not found (it may have been deleted)') : '…'}</span>
      </div>
      <div className="ac-record-foot muted">
        <span>{file ? (file.target === 'project' ? t('이 프로젝트', 'This project') : file.title) : ''}</span>
        <span className="sp" />
        {c && c.answers.length > 0 && <button className="a" data-ui="기록 보기" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('기록 접기', 'Hide the record') : t(`기록 보기 · 답 ${c.answers.length} ›`, `Show the record · ${c.answers.length} answers ›`)}</button>}
      </div>
      {open && c && <div className="ac-record-answers">
        {c.answers.map((a, i) => <div key={i} className="ac-record-answer"><div className="muted ac-record-who">{a.by === 'claude' ? 'Claude' : a.by} · {a.at}</div><MemoText text={a.body} /></div>)}
      </div>}
    </div>
  )
}

/** 패널 안의 대화: 머리(‹ · 제목 · 묶음 · 상태 · ⋯)와 대화. 바뀐 곳은 에이전트 화면에서 */
function PanelChat({ id, auto, onBack, onDeleted, onSaved, tools, recordTarget }: { id: string; auto?: Attach; onBack(): void; onDeleted(): void; onSaved(m: string): void; tools?: ReactNode; recordTarget?: { target: string; title: string; source?: string } }) {
  const chat = useChat(id).data
  const [fail, setFail] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  // 기록으로 남기기 (10/28 시안 2절): 에이전트가 대화에서 초안을 쓰고, 초안은 적기 칸에 뜬다. 사용자가 고쳐 「저장」해야 기록이 된다
  const keep = recordTarget && chat && !chat.record && chat.rid !== APP_RID ? async () => {
    if (drafting) return
    setDrafting(true); setFail(null)
    try {
      const d = await agentChatsApi.recordDraft(chat.id, recordTarget.target === 'project' ? t('이 프로젝트', 'this project') : recordTarget.title)
      openRecordComposer(chat.rid, recordTarget, {}, { text: d.text, kind: '메모' })
    } catch (e) { setFail((e as Error).message) } finally { setDrafting(false) }
  } : undefined
  return (
    <div className="ac-panel-chat">
      {chat && <ChatHead chat={chat} compact onBack={onBack} tools={tools} onRecord={keep} onDeleted={onDeleted} onSaved={onSaved} onError={setFail} />}
      {drafting && <div className="muted ac-hint" role="status">{t('기록 초안을 쓰는 중…', 'Writing a record draft…')}</div>}
      {fail && <div className="error-text ac-hint">{fail}</div>}
      <ChatView id={id} auto={auto} head={false} onDeleted={onDeleted} onSaved={onSaved} />
    </div>
  )
}

// ---------- 아래 자리 · 나란히 ----------

const DOCK_KEY = 'rw-agent-dock-h'

/** 작업 화면 아래 자리: 위 경계를 끌어 높이를 바꾼다 (높이는 기억한다) */
/** 패널 자리가 작업 화면 아래일 때 오른쪽 사이드바의 에이전트 탭: 그 자리를 알리고 열고 닫거나 이리로 옮긴다 */
export function AgentBelow({ open, onOpen, onHere }: { open: boolean; onOpen(v: boolean): void; onHere(): void }) {
  return (
    <div className="ac-below rs-pad" data-ui="에이전트 아래 자리 안내">
      <p className="muted">{open ? t('에이전트 패널은 작업 화면 아래에 열려 있습니다.', 'The agent panel is open below the workspace.') : t('에이전트 패널을 작업 화면 아래에 두었습니다.', 'The agent panel is placed below the workspace.')}</p>
      <div className="ac-below-acts">
        <button className="btn sm" onClick={() => onOpen(!open)}>{open ? t('아래 패널 닫기', 'Close the panel below') : t('아래 패널 열기', 'Open the panel below')}</button>
        <button className="btn sm" onClick={onHere}>{t('여기로 옮기기', 'Move it here')}</button>
      </div>
    </div>
  )
}

export function AgentDock({ children }: { children: ReactNode }) {
  const [h, setH] = useState(() => store.get<number>(DOCK_KEY, 320))
  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const y0 = e.clientY, h0 = h
    let last = h0
    const onMove = (ev: PointerEvent) => { last = Math.max(160, Math.min(window.innerHeight - 200, h0 + y0 - ev.clientY)); setH(last) }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); document.body.classList.remove('resizing'); store.set(DOCK_KEY, last) }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return (
    <section className="ac-dock" data-ui="에이전트 아래 자리" style={{ height: h }}>
      <div className="ac-dock-edge" role="separator" aria-label={t('에이전트 패널 경계 — 끌어서 높이 조절', 'Agent panel border: drag to resize')} onPointerDown={drag} />
      {children}
    </section>
  )
}

/** 노트 옆 패널의 대화 탭: 머리 · 대화 · 입력란 (지금 보는 노트가 저절로 붙는다) */
export function ChatTab({ id, auto, onSaved }: { id: string; auto?: Attach; onSaved(m: string): void }) {
  return <div className="ac-tab"><ChatView id={id} auto={auto} onDeleted={() => onSaved(t('대화를 지웠습니다. 탭을 닫으세요', 'Conversation deleted. Close the tab'))} onSaved={onSaved} /></div>
}
