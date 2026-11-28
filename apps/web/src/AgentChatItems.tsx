/** 에이전트 대화의 항목들: 계획 · 허락 카드 · 할 일 · 바뀐 파일 줄 · 대화 머리 (AgentChats.tsx에서 나눔) */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LIBRARY_RID } from '@rw/core'
import { agentChatsApi, api, APP_RID, CENTRAL_RID, type AskAnswer, type Attach, type Chat, type ChatItem, type ChatMode, type Todo } from './api'
import { useCmdEnter } from './cmdEnter'
import { relativeTime } from './format'
import { t } from './i18n'
import { Icon } from './icons'
import { MemoText } from './memo'
import { Mockups } from './Mockups'
import { qk } from './queries'
import { go, href } from './router'
import { StatusDot } from './StatusDot'
import { secondsName } from './WorkLog'
import { inBackground, shownState } from './agentSeen'
import { useDismiss } from './useDismiss'
import { Changes, openChangeFile } from './AgentChanges'
import { InlineEdits } from './InlineEdits'
import { scopeName } from './AgentProjectPick'
import { RestoredLine, unchanged } from './AgentAskRestored'
import { isClaude } from './AgentPick'
import { ReviewButton, ReviewCard } from './AgentReview'
import { CentralBoardButton } from './CentralChat'
import { HostWho, hostWhoAt, MemberItem, RoomItem } from './CentralRoom'
import { DebateEnd, DebateLine, DebateMember } from './Debate'
import { ATTACH_NAME, TRUST_NAME, type Fill } from './ChatComposer'
import { contextName, tokensName } from './agentTokens'
import { errorOf, isLive, STATE_NAME, stateName, ChatStateMark, Delta, costName, CopyButton, useProjects, projectName, chatGroupName, TitleInput, useChatActions } from './AgentChatParts'

// ---------- 대화 줄들 ----------
// 생각 · 도구 묶음은 대화에 「과정 n」 한 줄로 접어 두고, 누르면 그 자리에서 펼친다 (WorkLog.tsx, 11/20)

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
  const sayKey = useCmdEnter(() => say?.send(note.trim()))
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
        <div className="ac-say-box" onCompositionEnd={sayKey.onCompositionEnd} onKeyDown={(e) => { // 칸 전체에서: 단추로 옮겨 간 뒤에도 (11/19 피드백 09:04). 한글을 친 직후의 ⌘↵는 조합이 끝난 뒤에 보낸다
          if (!sayKey.onKeyDown(e) && !e.nativeEvent.isComposing && e.key === 'Escape') { e.preventDefault(); setSaying(false) }
        }}>
          <textarea rows={2} autoFocus value={note} placeholder={say.placeholder} aria-label={say.placeholder} onChange={(e) => setNote(e.target.value)} />
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
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.answer(chat.id, id, a, more)) } catch (e) { onError(errorOf(e)) } finally { setBusy(false) }
  }
  return { busy, answer }
}

export type Ask = Extract<ChatItem, { kind: 'ask' }>

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
  edit: t('네, 편집은 늘 (편집 자동 수락)', 'Yes, always for edits (auto-accept edits)'),
  web: t('네, 웹 보기는 늘 (자동 허용 켜기)', 'Yes, always for the web (turn on auto)'),
}
const alwaysName = (it: Ask) => (it.does && ALWAYS_NAME[it.does]) || (it.does === 'run' ? t('네, 이 대화에서 이 프로그램은 늘', 'Yes, always for this program here') : t('네, 이 대화에서 이것은 늘', 'Yes, always for this in this conversation'))
const DOES_NAME: Record<NonNullable<Ask['does']>, string> = { read: t('읽기', 'Read'), edit: t('편집', 'Edit'), delete: t('삭제', 'Delete'), run: t('실행', 'Run'), web: t('웹 보기', 'Web'), outside: t('외부', 'Outside') }

function AskCard({ chat, it, onError }: { chat: Chat; it: Ask; onError(m: string): void }) {
  const { busy, answer } = useAnswer(chat, it.id, onError)
  // 앱이 다시 켜진 뒤의 카드: 바뀐 것이 있거나 아직 세는 중이면 「늘」을 숨기고, 허락은 에이전트가 바뀐 것을 보고 다시 판단한다
  const changed = !!it.restored && !unchanged(it.since)
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
      {!it.answer && <RestoredLine it={it} />}
      {!it.answer && (
        <Choices busy={busy}
          choices={[
            { label: changed ? t('네, 변경사항을 보고 다시 판단하게', 'Yes, but re-check what changed first') : t('네', 'Yes'), ui: '허락 버튼', run: () => void answer('allow') },
            // 삭제 · 외부는 「늘」 없이 한 번씩 (되돌리기 어려워서). 다시 켠 뒤에는 바뀐 것이 없을 때만
            ...(it.once || changed ? [] : [{ label: alwaysName(it), ui: '늘 허락 버튼', run: () => void answer('always') }]),
          ]}
          say={{ label: t('아니요, 다르게 하라고 말하기', 'No, tell it what to do instead'), placeholder: t('어떻게 하라고 할까요? (비워 두면 그냥 거절)', 'What should it do instead? (empty = just decline)'), send: (note) => void answer('deny', note ? { note } : undefined) }} />
      )}
    </li>
  )
}

/** 계획 먼저: 에이전트가 보인 계획. 승인할 때 이어 갈 맡기는 정도(고치기 바로 · 수동)를 함께 고른다 */
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
      {!it.answer && <RestoredLine it={it} />}
      {!it.answer && <>
        <div className="muted ac-hint ac-choices-q">{t('이대로 할까요? 명령은 승인 뒤에도 묻습니다', 'Go ahead? Commands still ask after approval')}</div>
        <Choices busy={busy}
          choices={[
            // 앱 고치기 대화는 노트가 아니라 작업 폴더의 파일을 고친다
            { label: t('네, 편집 자동 수락', 'Yes, auto-accept edits'), ui: '계획 승인 버튼', run: () => void answer('allow', { mode: 'edit' }) },
            { label: t('네, 수동', 'Yes, manual'), ui: '계획 승인 묻기 버튼', run: () => void answer('allow', { mode: 'ask' }) },
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
export function TodoBar({ todos }: { todos: Todo[] }) {
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

export const reviewOf = (rid: string, file: string) => go({ page: 'review', key: `note:${rid}:${file}` })

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
      {onChanges && <button className="a ac-edit-go" data-ui="바뀐 곳 보기" onClick={() => { openChangeFile(chat.id, it.file); onChanges() }}>{t('변경사항 보기', 'View changes')}</button>}
      {inline && <button className="a ac-edit-go" data-ui="바뀐 곳 보기" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('고친 곳 접기', 'Hide changes') : t('고친 곳 검토 ›', 'Review changes ›')}</button>}
      {it.reason && <span className="muted ac-hint ac-edit-why">{it.reason}</span>}
      {inline && open && <div className="ac-edit-inline"><InlineEdits rid={chat.rid} files={[it.file]} /></div>}
    </li>
  )
}

function AttachChips({ attach, images, names }: { attach?: Attach[]; images?: number; names?: string[] }) { // 그림은 파일 이름으로 (11/20: 「그림 1」이 이름처럼 읽혔다), 이름 없던 지시는 장수로
  if (!attach?.length && !images) return null
  return (
    <div className="ac-chips">
      {attach?.map((a, i) => <span key={i} className="tag" title={a.text ?? a.ref}>{ATTACH_NAME[a.kind]} · {a.label}</span>)}
      {names?.length ? names.map((n, i) => <span key={`i${i}`} className="tag" title={n}>{t('그림', 'Image')} · {n || i + 1}</span>) : !!images && <span className="tag">{t(`그림 ${images}장`, `${images} image${images > 1 ? 's' : ''}`)}</span>}
    </div>
  )
}

export function ItemView({ chat, it, who, onError, onChanges, onRewind, onPass }: { chat: Chat; it: Exclude<ChatItem, { kind: 'step' | 'think' }>; who?: ReturnType<typeof hostWhoAt>; onError(m: string): void; onChanges?(): void; onRewind?(point: string): void; onPass?(text: string): void }) {
  const when = new Date(it.at).toLocaleString()
  switch (it.kind) {
    // 중앙을 저절로 깨운 알림은 옅은 한 줄 (11/19: 진행은 작업 현황에서 보고, 대화에는 짧게)
    case 'user': return it.auto ? <li className="ac-note muted ac-auto" data-ui="자동 알림" title={`${when}\n${it.text}`}><span className="ac-auto-text">{it.text}</span></li> : (
      <li className="ac-me" data-ui="내 지시" title={when}>
        <MemoText text={it.text} />
        <AttachChips attach={it.attach} images={it.images} names={it.imageNames} /><Mockups text={it.text} chat={chat.id} /><CopyButton text={it.text} />
        {it.point && onRewind && !isLive(chat.state) && (
          <button className="icon-btn sm ac-rewind" data-ui="여기로 되돌리기" data-tip={t('여기로 되돌리기', 'Rewind to here')} aria-label={t('여기로 되돌리기', 'Rewind to here')} onClick={() => onRewind(it.point!)}>{Icon.revert}</button>
        )}
      </li>
    )
    case 'text': return <li className={`ac-text${it.sub ? ' sub' : ''}`} data-ui="에이전트 글" title={when}>{who && <HostWho votes={who} />}{it.sub && <span className="muted ac-hint">{t('하위 에이전트', 'Subagent')}</span>}<MemoText text={it.text} /><Mockups text={it.text} chat={chat.id} /><CopyButton text={it.text} /></li>
    case 'ask': return it.plan !== undefined ? <PlanCard chat={chat} it={it} onError={onError} /> : <AskCard chat={chat} it={it} onError={onError} />
    case 'todos': return null
    case 'edit': return <EditLine chat={chat} it={it} onChanges={onChanges} />
    case 'blocked': return <li className="ac-note" data-ui="막은 일"><span className="ac-tool mono">{it.tool}</span><span>{t('막음', 'Blocked')} · {it.reason}</span></li>
    case 'bypass': return <li className="ac-note" data-ui="우회 실행" title={when}><span className="ac-tool mono">Bash</span><span>{it.how === 'once' ? t('허락으로 우회 (한 번)', 'Bypassed with permission (once)') : t('허락으로 우회 (이 대화에서 늘)', 'Bypassed with permission (always in this chat)')} · <code>{it.command}</code></span></li>
    case 'result': return (
      <li className="ac-note muted" data-ui="차례 끝" title={[it.context && t('지금 에이전트가 들고 있는 앞 내용의 크기 / 요약하는 선', 'Earlier conversation the agent holds / where it is summarized'), it.tokens && t(`이번 차례에 처리한 토큰 ${tokensName(it.tokens.in + it.tokens.out)} (요청마다 앞 내용을 다시 읽은 몫까지 더한 값)`, `Tokens processed this turn ${tokensName(it.tokens.in + it.tokens.out)} (counts the earlier conversation re-read on every request)`), it.cost && costName(it.cost)].filter(Boolean).join('\n') || undefined}>
        {it.ok ? `✓ ${t('이번 차례 끝', 'Turn done')}` : t('이번 차례 실패', 'Turn failed')}{it.seconds !== undefined && ` · ${secondsName(it.seconds)}`}{it.context ? ` · ${t('컨텍스트', 'Context')} ${contextName(it.context)}` : it.tokens && ` · ${t('토큰', 'Tokens')} ${tokensName(it.tokens.in + it.tokens.out)}`}
      </li>
    )
    case 'error': return <li className="ac-note error-text" data-ui="대화 오류">! {it.text}</li>
    case 'side': return (
      <li className="ac-sideq" data-ui="곁 질문" title={when}>
        <div className="muted ac-hint">{t('곁 질문', 'Side question')} · {it.q}</div>
        {it.answer ? <MemoText text={it.answer} /> : it.error ? <span className="error-text">! {it.error}</span> : <span className="muted">{t('답하는 중…', 'Answering…')}</span>}
      </li>
    )
    case 'review': return <ReviewCard chat={chat} it={it} onPass={onPass} onError={onError} />
    case 'member': return it.stage ? <DebateMember it={it} /> : <MemberItem it={it} />; case 'room': return <RoomItem it={it} />; case 'debate': return <DebateLine it={it} />
    case 'compact': return (
      <li className="ac-note muted" data-ui="앞 내용 요약" title={when}>
        {it.auto ? t('앞 내용을 요약해 이어 갑니다', 'Summarized earlier messages to keep going') : t('앞 내용을 요약했습니다', 'Summarized earlier messages')}
        {` · ${t('컨텍스트', 'Context')} ${tokensName(it.before)}${it.after !== undefined ? ` → ${tokensName(it.after)}` : ''}`}
      </li>
    )
  }
}

// ---------- 대화 하나 ----------

/** 대화의 머리: 이름 · 프로젝트 · 범위, 오른쪽 상태 · +n −n 바뀐 곳 · 작업 · ⋯(보관 · 지우기) */
export function ChatHead({ chat, onBack, pane, onPane, onDeleted, onSaved, onError, compact = false, tools, onRecord }: {
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
    } catch (e) { onError(errorOf(e)) }
  }
  const [added, removed] = chat.items.reduce(([a, r], i) => (i.kind === 'edit' ? [a + i.added, r + i.removed] : [a, r]), [0, 0])
  // 맥락 크기는 늘 보이게 (세부는 작업 패널의 사용량). 요약하는 선(compactAt)을 넘으면 앞 내용을 요약한다
  const results = chat.items.filter((i): i is Extract<ChatItem, { kind: 'result' }> => i.kind === 'result')
  const context = [...results].reverse().find((r) => r.context)?.context
  const cost = results.reduce((s, r) => s + (r.cost ?? 0), 0)
  const sname = stateName({ state: chat.state, tasks: chat.tasks, asks: chat.asks, archived: chat.archived, wait: chat.items.some((i) => i.kind === 'ask' && !i.answer && i.plan !== undefined) ? 'plan' : 'ask' })
  return (
    <div className="ac-head" data-ui="대화 헤더">
      {onBack && <button className="icon-btn sm" data-ui="대화 목록으로" data-tip={t('대화 목록', 'Conversations')} aria-label={t('대화 목록으로', 'Back to conversations')} onClick={onBack}>{Icon.back}</button>}
      <div className="ac-head-what">
        {renaming ? <TitleInput value={chat.title} onDone={(v) => { setRenaming(false); if (v !== null) void actions.rename(v) }} />
          : <div className="ac-title" title={chat.title}>{chat.title}</div>}
        {compact ? <div className="ac-meta compact" data-ui="대화 묶음 줄">
          <span className="ac-meta-who">{chat.rid === APP_RID ? project : chatGroupName(chat)}</span><span className="sp" />
          <span>{sname} · {relativeTime(Date.parse(chat.updated))}</span>
          {chat.archived && <span className="tag">{chat.machine ?? t('보관함', 'Archived')}</span>}
        </div> : <div className="ac-meta">
          {chat.parent && <><button className="a" data-ui="중앙 작업 현황으로" data-tip={t('중앙의 작업 현황에서 다른 맡긴 일과 함께 보기', 'See it with the other handed-off work in Central')} onClick={() => go({ page: 'agent', id: chat.parent })}>{t('‹ 중앙 · 작업 현황', '‹ Central · work status')}</button><span>·</span></>}
          {chat.rid === APP_RID || chat.rid === LIBRARY_RID ? <span>{project}</span> : <button className="a" data-ui="대화 프로젝트" onClick={() => go({ page: 'overview', rid: chat.rid })}>{project}</button>}
          <span>·</span><span>{scopeName(chat.scope, topics)}</span>
          {chat.pr && <><span>·</span><a className="a" data-ui="대화 PR" href={chat.pr.url} target="_blank" rel="noreferrer">PR #{chat.pr.number}</a></>}
          {context && <><span>·</span><span data-ui="대화 맥락" title={[isClaude(chat.agent) ? t(`지금 에이전트가 들고 있는 앞 내용의 크기. ${tokensName(context.compactAt ?? context.window)}쯤 되면 앞 내용을 요약해 줄입니다`, `How much earlier conversation the agent holds. Around ${tokensName(context.compactAt ?? context.window)} it is summarized`) : t('지금 에이전트가 들고 있는 앞 내용의 크기 (에이전트가 알려 준 값)', 'How much earlier conversation the agent holds (as the agent reports it)'), cost > 0 ? costName(cost) : ''].filter(Boolean).join('\n')}>{t('컨텍스트', 'Context')} {contextName(context)}</span></>}{inBackground(chat) && <><span>·</span><span data-ui="대화 백그라운드 명령">{t(`백그라운드 명령 ${chat.tasks}개`, `${chat.tasks} background command${chat.tasks! > 1 ? 's' : ''}`)}</span></>}
          {chat.archived && <span className="tag">{chat.machine ?? t('보관함', 'Archived')}</span>}
        </div>}
      </div>
      {/* 상태는 색 아이콘만 (11/23 사용자 결정: 목록 줄과 같이, 이름은 가리키면). 차례가 끝난 대화는 아무것도 없고 옆의 해결 아이콘이 그 뜻 */}
      <ChatStateMark state={shownState(chat)} name={!compact && inBackground(chat) ? STATE_NAME.running : sname} />
      {/* 차례가 끝난 것은 해결이 아니다: 사용자가 해결로 보면 동그라미 체크로 보관함에 넣는다 (11/23 피드백 시안 chat-resolve-circle 1, 토론의 「토론 끝내기」와 같은 자리) */}
      {chat.state === 'idle' && !chat.tasks && !chat.archived && !chat.machine && !chat.debate && chat.rid !== CENTRAL_RID && (
        <button className="icon-btn sm ac-resolve" data-ui="해결 보관 버튼" data-tip={t('해결 (보관함으로)', 'Resolve (to the archive)')} aria-label={t('해결 (보관함으로)', 'Resolve (to the archive)')} onClick={() => void archive(true)}>{Icon.approve}</button>
      )}
      {/* 사이드바가 있는 에이전트 화면에서는 변경사항 · 검토가 사이드바 아이콘 줄에 있다 (11/23 시안 chat-head-icons 안 B) */}
      {!!chat.changed.length && !compact && !onPane && (
        <button className="btn sm ac-changes-btn" data-ui="바뀐 곳 버튼" data-tip={t('에이전트 화면에서 변경사항 보기', 'View changes in the agent page')} onClick={() => go({ page: 'agent', id: chat.id })}>
          <Delta added={added} removed={removed} />{t('변경사항', 'Changes')}
        </button>
      )}
      {chat.rid === CENTRAL_RID && !compact && <CentralBoardButton narrowOnly={!!pane} />}{!compact && !chat.machine && <DebateEnd chat={chat} onError={onError} />}
      {!chat.machine && !onPane && <ReviewButton chat={chat} onError={onError} />}{tools}
      {!chat.machine && <HeadMore live={live} archived={!!chat.archived} onRename={() => setRenaming(true)} onArchive={(v) => void archive(v)} onRemove={() => void remove()} onRecord={onRecord} />}
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
          <button role="menuitem" disabled={live && !archived} title={live ? t('도는 대화는 멈춘 뒤 보관합니다', 'Stop it before archiving') : undefined} onClick={() => { setOpen(false); onArchive(!archived) }}>{archived ? t('보관함에서 복원', 'Restore') : t('보관함에 넣기', 'Archive')}</button>
          <button role="menuitem" className="danger" data-ui="대화 지우기" disabled={live || !archived} title={!archived ? t('보관함에 넣은 대화만 지웁니다', 'Only archived conversations can be deleted') : undefined} onClick={() => { setOpen(false); onRemove() }}>{t('삭제', 'Delete')}</button>
        </div>
      )}
    </span>
  )
}

/** 입력란 위: 도는 동안 보낸 말 (다음 차례에 읽는다). 연필은 빼서 입력란으로, ×는 빼기 */
export function QueuedBar({ chat, onEdit, onError }: { chat: Chat; onEdit(f: Omit<Fill, 'n'>): void; onError(m: string): void }) {
  const client = useQueryClient()
  const queued = chat.items.filter((i): i is Extract<ChatItem, { kind: 'user' }> => i.kind === 'user' && !!i.queued)
  if (!queued.length) return null
  const unqueue = async (i: number) => {
    try { const r = await agentChatsApi.unqueue(chat.id, i); client.setQueryData(qk.agentChat(chat.id), r.chat); return r } catch (e) { onError(errorOf(e)); return null }
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
