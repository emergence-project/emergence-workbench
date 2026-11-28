import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { autoCustom, LIBRARY_RID } from '@rw/core'
import { agentChatsApi, APP_RID, CENTRAL_RID, type Attach, type Chat, type ChatMessageBody, type ChatScope } from './api'
import { askConfirm } from './askText'
import { t } from './i18n'
import { Icon } from './icons'
import { AppLinkProvider, MemoText } from './memo'
import { qk } from './queries'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { showChangesNext, useSideColumn, WorkAside, type PaneTab } from './WorkAside'
import { MoreMenu, type MoreItem } from './MoreMenu'
import { openRight } from './noteScreen'
import { useTerminalAvailable } from './TerminalPane'
import { ChatInfo, ChatSideTabs } from './AgentChatInfo'
import { chatLog, isAgentStep, ProcLine, type Step } from './WorkLog'
import { useMarkSeen } from './agentSeen'
import { Changes } from './AgentChanges'
import { openRecordComposer } from './RecordContext'
import { useRecords } from './projectQueries'
import { AGENT_PANEL_OPEN, agentPanelKey } from './agentPanelOpen'
import { ForeignBar } from './AgentForeign'
import { PermTable } from './AgentPermTable'
import { AppFixHint, ProjectPick, RecentChats } from './AgentProjectPick'
import { ChatHerePick, useChatHere } from './ChatHere'
import { agentOf, effortsOf, fitEffort, isClaude, useChatSettings, useNewChatAccount } from './AgentPick'
import { isReviewCommand, ReviewPane } from './AgentReview'
import { CENTRAL_PAGE, CentralBoard, CentralLine, CentralStart, ChatListError } from './CentralChat'
import { hostWhoAt, RoomManage, RoomStrip, useComposerRoom, VerdictLog } from './CentralRoom'
import { DebatePanel, DebateStrip, debateComposer } from './Debate'
import { APP_HINT, ChatQuoteMenu, Composer, CUSTOM_NAME, PopButton, settingsOf, sideQuestion, TRUST_NAME, trustOf, type Fill, type Settings } from './ChatComposer'
export { isLive, stateName, ChatStateMark, Delta, costName, useChatList, chatTitles, useChat, useProjects, projectName, chatGroupName, ChatGroups, rank, ChatLine, useBulkChats, notifyOn, setNotifyOn, notifyPermission, askNotify, notifyWhy, useAgentNotify, AgentRailCount } from './AgentChatParts'
import { isLive, useChatList, useChat, useProjects, ChatGroups, rank, ChatLine, askNotify } from './AgentChatParts'
export { TodoList, reviewOf } from './AgentChatItems'
import { type Ask, TodoBar, ItemView, ChatHead, QueuedBar } from './AgentChatItems'

/**
 * 에이전트 대화 (10/21 "프로젝트 관리 먼저", 같은 날 "에이전트 창 구조 다시" · "코덱스와 Claude 앱 더 참고"):
 * 앱이 맥의 Claude Code를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다(서버 agentChats.ts).
 * - 레일 "에이전트" 화면(AgentPage · AgentSide): 모든 프로젝트의 대화 목록 · 대화 · 오른쪽 세부 패널(바뀐 곳 · 작업)
 * - 오른쪽 사이드바의 에이전트 탭(AgentPanel, 10/22 안 A): 지금 프로젝트의 대화. 지금 보는 노트가 저절로 붙는다
 * - 입력란(Composer, ChatComposer.tsx): / 명령 · @ 붙이기 · 그림, 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기(도는 중에는 멈추기)
 * - 대화: 에이전트 글은 본문처럼, 생각 · 도구는 오른쪽 세부 패널의 작업 로그로 빼고 그 자리에 「과정 n」 한 줄, 계획 · 허락은 번호 붙은 세 답(1 · 2 · 3)
 * - 입력란 바로 위: 할 일 한 줄, 도는 동안 보낸 말("다음에 보냄")
 * 범위 밖 고치기와 파일 바로 쓰기는 서버가 막고, 명령은 허락 카드로 묻는다(사용자 차례 = 주황).
 */

export { effortsOf, fitEffort, modelName } from './AgentPick'
export { AGENT_OPEN, sendToAgent } from './ChatComposer'
export { CENTRAL_PAGE } from './CentralChat'

/** 대화 하나: 머리, 주고받은 줄, 입력란 위의 할 일 · 다음에 보냄, 입력란 (auto = 지금 보는 노트) */
export function ChatView({ id, auto, head = true, pane, onPane, onChanges, tools, onBack, onDeleted, onSaved }: {
  id: string
  auto?: Attach
  head?: boolean
  pane?: boolean
  onPane?(): void
  /** 사이드바를 열고 변경사항 칸으로 (대화 줄의 고친 곳에서) */
  onChanges?(): void
  /** 머리 오른쪽 아이콘 단추 (에이전트 화면의 세부 패널 · 터미널) */
  tools?: ReactNode
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
  // 대화는 마지막 400줄만 두어 줄 수가 그대로일 수 있다: 바뀐 시각으로 본다
  const changed = chat?.updated
  useMarkSeen(id, changed)
  useEffect(() => { setOver({}); atEnd.current = true; setBehind(false) }, [id])
  useEffect(() => { const el = listRef.current; if (!el) return; if (atEnd.current) el.scrollTop = el.scrollHeight; else setBehind(true) }, [changed, id])
  const onScroll = () => { const el = listRef.current; if (!el) return; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; if (atEnd.current) setBehind(false) }
  const toEnd = () => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; atEnd.current = true; setBehind(false) }, room = useComposerRoom(chat?.rid === CENTRAL_RID)
  // 줄들은 대화 내용이 바뀔 때만 다시 그린다. 쓰는 중인 글(agent-draft)은 몇 번이고 오는데, 그때마다 긴 대화의 모든 줄(마크다운 · 수식)을 다시 그리면 화면이 무거워진다
  const act = useRef<{ rewind(point: string): void; changes?(): void }>({ rewind: () => undefined })
  const lines = useMemo(() => {
    if (!chat) return null
    const { blocks, log } = chatLog(chat.items), running = isLive(chat.state)
    const onChanges = onPane ? () => act.current.changes?.() : undefined
    return blocks.map((b, i) => b.kind === 'proc' ? <ProcLine key={i} from={b.from} to={b.to} log={log} live={running && i === blocks.length - 1} /> : <ItemView key={i} chat={chat} it={b.item} who={chat.rid === CENTRAL_RID && hostWhoAt(blocks, i)} onError={setFail} onChanges={onChanges} onRewind={(p) => act.current.rewind(p)} onPass={(text) => setFill({ text, n: Date.now() })} />)
  }, [id, chat?.items, chat?.state, chat?.updated, chat?.rid, chat?.machine, !!onPane]) // eslint-disable-line react-hooks/exhaustive-deps -- 쓰는 중인 글(draft)만 바뀐 chat은 줄을 다시 그리지 않는다
  if (!chat) return <div className="empty center">{error ? (error as Error).message : t('불러오는 중…', 'Loading…')}</div>
  const live = isLive(chat.state)
  const settings: Settings = { trust: trustOf(chat), model: chat.model, effort: chat.effort, agent: chat.agent, account: chat.account ?? 'default', ...(chat.rid !== APP_RID && autoCustom(chat) && !over.trust && { custom: true }), ...over }
  const change = (s: Partial<Settings>) => {
    setOver((o) => ({ ...o, ...s }))
    setFail(null)
    const q = saving.current
    q.n++
    q.chain = q.chain.then(async () => {
      try {
        client.setQueryData(qk.agentChat(id), await agentChatsApi.settings(id, { ...(s.trust && settingsOf(s.trust)), ...(s.model && { model: s.model }), ...(s.effort && { effort: s.effort }), ...(s.account && { account: s.account }) }))
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
    client.setQueryData(qk.agentChat(id), await (isReviewCommand(m.text) ? agentChatsApi.review(id) : side ? agentChatsApi.side(id, side) : agentChatsApi.send(id, m)))
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
  const openChanges = onChanges ?? (onPane ? () => { if (!pane) onPane() } : undefined)
  act.current = { rewind: (p) => void rewind(p), changes: openChanges }
  return (
    <AppLinkProvider feedback={chat.rid === CENTRAL_RID || chat.rid === APP_RID}><div className="ac-chat" data-ui="에이전트 대화">
      {head && <ChatHead chat={chat} pane={pane} onPane={onPane} tools={tools} onBack={onBack} onDeleted={onDeleted} onSaved={onSaved} onError={setFail} />}{head && chat.rid === CENTRAL_RID && <RoomStrip />}{head && <DebateStrip chat={chat} />}
      {chat.record && <RecordBanner rid={chat.rid} record={chat.record} />}
      <ol ref={listRef} className="ac-items" data-ui="대화 줄들" role="log" onScroll={onScroll}>
        {!!chat.trimmed && <li className="ac-note muted">{t(`오래된 앞 줄 ${chat.trimmed}개는 지웠습니다 (대화는 마지막 400줄만 둡니다)`, `${chat.trimmed} older lines were removed (a conversation keeps its last 400)`)}</li>}
        {lines}
        {!!chat.draft && <li className="ac-text ac-draft" data-ui="쓰는 중인 글"><MemoText text={chat.draft} /></li>}
        {chat.state === 'running' && <li className="ac-note muted ac-working" aria-live="polite"><StatusDot s="in-progress" name={chat.compacting ? t('앞 내용을 요약하는 중', 'Summarizing earlier messages') : t('작업 중', 'Working')} label /></li>}
        {!!chat.tasks && chat.state !== 'running' && <li className="ac-note muted ac-working" data-ui="뒤에서 도는 명령" aria-live="polite"><StatusDot s="in-progress" name={t(`백그라운드 명령 ${chat.tasks}개가 도는 중 · 끝나면 이어서 합니다`, `${chat.tasks} background command${chat.tasks > 1 ? 's' : ''} running · continues when done`)} label /></li>}
        {canResume && <li className="ac-note"><button className="btn sm" data-ui="이어 하기" onClick={() => void resume()}>{t('이어 하기', 'Continue')}</button><span className="muted ac-hint">{t('같은 대화에서 멈춘 곳부터', 'From where it stopped, in the same conversation')}</span></li>}
      </ol><ChatQuoteMenu list={listRef} onQuote={(a) => setFill({ attach: [a], n: Date.now() })} />
      {chat.machine ? <ForeignBar chat={chat} /> : <div className="ac-compose">
        {behind && <button className="btn sm ac-latest" data-ui="최신으로" onClick={toEnd}>{Icon.down}{t('최신으로', 'Latest')}</button>}
        {showTodos && <TodoBar todos={chat.todos} />}
        <QueuedBar chat={chat} onEdit={(f) => setFill({ ...f, n: Date.now() })} onError={setFail} />
        <Composer rid={chat.rid} keep={chat.id} auto={auto} settings={settings} agentFixed onSettings={(s) => void change(s)} onSubmit={send} onStop={live ? () => void stop() : undefined}
          placeholder={placeholder} fail={fail} fill={fill} room={debateComposer(chat) ?? room} />
        <div className="muted ac-keys">{/* 토론 입력란에는 권한 단추가 없다 */!chat.debate && t('⇧⇥ 권한 · ', '⇧⇥ permissions · ')}{t('⌘↵ 보내기', '⌘↵ send')}{live && t(' · Esc 멈추기', ' · Esc stop')}</div>
      </div>}
    </div></AppLinkProvider>
  )
}

// ---------- 새 대화 ----------

/** 새 대화: 고칠 프로젝트(rid가 없을 때, 여럿) · 입력란 하나 */
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
  // 앱 고치기면 고칠 앱 (11/20): 빈 값 = 이 앱, 아니면 이 컴퓨터에 받아 둔 다른 앱 (예: 퀀텀캐드)
  const [appPick, setAppPick] = useState(() => store.get<string>('rw-agent-app', ''))
  const apps = listed?.apps ?? []
  const target = app && apps.some((a) => a.id === appPick) ? appPick : ''
  // 고른 프로젝트만 고치고 다른 프로젝트 · 개념노트는 읽기만 (11/19 사용자 결정, '전체' 범위는 없앰). 함께 고칠 프로젝트는 also
  const [also, setAlso] = useState(() => store.get<string[]>('rw-agent-also', []))
  const [settings, change] = useChatSettings(), here = useChatHere(), acc = useNewChatAccount(settings.agent, app, change)
  const more = fixed || app ? [] : also.filter((r) => r !== rid && projects?.some((p) => p.id === r)), scope: ChatScope = app ? { kind: 'app', ...(target && { app: target }) } : { kind: 'project', ...(more.length && { also: more }) }
  const start = async (m: ChatMessageBody) => {
    if (!rid) return false
    askNotify()
    const c = await agentChatsApi.create({ rid, ...m, ...(here.here && { here: true }), scope, ...settingsOf(settings.trust), model: settings.model, effort: settings.effort, ...(settings.auto && { auto: settings.auto }), ...(acc.picked && { account: acc.picked }), ...(!isClaude(settings.agent) && { agent: agentOf(settings.agent) }) })
    void client.invalidateQueries({ queryKey: qk.agentChats })
    onCreated(c)
    return true
  }
  // 프로젝트가 하나도 없으면 고르기 칸이 비어 이유가 안 보인다 (10/21 맥미니): 무엇을 하면 되는지 적는다
  if (!fixed && projects && !projects.length && !appOk) return (
    <div className="ac-new" data-ui="새 대화"><p className="muted">{t('대화는 프로젝트 하나에서 엽니다. 등록한 프로젝트가 아직 없습니다: 레일의 ＋로 프로젝트를 등록하세요.', 'A conversation opens in one project, and no project is registered yet. Register one with ＋ on the rail.')}</p></div>
  )
  // 고칠 프로젝트는 입력란 아래 줄의 알약 버튼 하나 (11/8 14:16 제안, 시안 1-2절). 프로젝트가 정해진 좁은 패널은 그 프로젝트만
  const lead = !fixed && <ProjectPick picked={rid ? [rid, ...more] : []} projects={projects ?? []} appOk={appOk} apps={apps} appTarget={target} onAppTarget={(id) => { setAppPick(id); store.set('rw-agent-app', id) }} onPick={([r = '', ...rest]) => { setPick(r); store.set('rw-agent-project', r); setAlso(rest); store.set('rw-agent-also', rest) }} />
  return (
    <div className="ac-new" data-ui="새 대화">
      {rid && <Composer key={rid} rid={rid} keep={`new:${rid}`} lead={lead} auto={note ? { kind: 'note', ref: note.file, label: note.title } : undefined} settings={{ ...settings, ...(acc.account && { account: acc.account }) }} onSettings={acc.onSettings} onSubmit={start}
        placeholder={app ? t('고칠 것을 쓰세요 · 그림 붙여넣기', 'What should change in the app? · paste images') : t('맡길 일을 쓰세요 · / 명령 · @ 노트 붙이기 · 그림 붙여넣기', 'What should the agent do? · / commands · @ attach · paste images')} />}
      {rid && <ChatHerePick h={here} />}{app && <AppFixHint name={target && (apps.find((a) => a.id === target)?.name ?? target)} />}
    </div>
  )
}

// ---------- 오른쪽 세부 패널: 바뀐 곳 · 작업 (에이전트 화면) ----------

const PERM_OPEN_KEY = 'rw-agent-perm-open'
/** 세부 패널: 이 대화(맥락 창 · 기본 정보) · 바뀐 곳(있으면) · 잡은 파일(다른 대화 것도) · 이 대화의 허락 · 하위 에이전트 */
export function WorkColumn({ id, onSaved, tab = 'info', tabs }: { id: string; onSaved(m: string): void; tab?: PaneTab; tabs?: ReactNode }) {
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
  const hasEdits = chat.items.some((i) => i.kind === 'edit'); if (chat.debate) return <WorkAside>{tabs}<DebatePanel chat={chat} /><VerdictLog /><details className="ac-info-fold" data-ui="이 대화 접기"><summary>{t('이 대화', 'This conversation')} <span className="muted">{t('토큰 · 시각 ›', 'tokens · time ›')}</span></summary><ChatInfo chat={chat} /></details></WorkAside>
  // 중앙은 파일을 고치지 않으므로 이 칸을 작업 현황에 쓰고, 「이 대화」는 그 아래 접어 둔다
  if (chat.rid === CENTRAL_RID) return (
    <WorkAside>
      {tabs}<CentralBoard /><VerdictLog /><RoomManage />
      <details className="ac-info-fold" data-ui="이 대화 접기"><summary>{t('이 대화', 'This conversation')} <span className="muted">{t('모델 · 토큰 · 권한 ›', 'model · tokens · permissions ›')}</span></summary><ChatInfo chat={chat} /></details>
    </WorkAside>
  )
  return (
    <WorkAside>
      {tabs}
      {tab === 'changes' ? (hasEdits && !chat.machine ? <><h3>{t('변경사항', 'Changes')}</h3><Changes chat={chat} onSaved={onSaved} /></> : <span className="muted ac-hint">{t('아직 변경사항이 없습니다', 'Nothing has changed yet')}</span>)
        : tab === 'review' && isClaude(chat.agent) && !chat.machine ? <ReviewPane chat={chat} onError={onSaved} />
          : <>
      <ChatInfo chat={chat} />
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
          </>}
    </WorkAside>
  )
}

// ---------- 레일 "에이전트" 화면 ----------

export function AgentPage({ id, onSaved, side }: { id?: string; onSaved(m: string): void; side?: { open: boolean; onOpen(): void } }) {
  const chatPage = !!id && id !== CENTRAL_PAGE, col = useSideColumn(chatPage, useChat(id ?? '', chatPage).data?.rid) // 오른쪽 칸: 세부 패널 · 터미널
  return (
    <main className="stage full" data-ui="에이전트">
      <section className="pane">
        {id === CENTRAL_PAGE ? <CentralStart /> : id
          ? <div className="ac-page">
            <ChatView key={id} id={id} pane={col.work} onPane={col.togglePane} onChanges={() => col.show('changes')} tools={col.tools} onDeleted={() => go({ page: 'agent' })} onSaved={onSaved} />
            {col.work && /* 칸도 대화마다 새로(쓰던 코멘트 초안이 다른 대화로 넘어가지 않게). 키가 위 대화 칸과 같으면 앞 대화가 화면에 남는다 */ <WorkColumn key={`work:${id}`} id={id} onSaved={onSaved} tab={col.tab ?? 'info'} tabs={<ChatSideTabs id={id} col={col} />} />}{col.terminal(<ChatSideTabs id={id} col={col} />)}
          </div>
          : <div className="scroll"><div className="page-body ac-start">
            <h1 className="ac-h">{t('새 대화', 'New conversation')}</h1>
            <NewChat onCreated={(c) => go({ page: 'agent', id: c.id })} />
            {side && !side.open && <RecentChats onAll={side.onOpen} line={(c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => go({ page: 'agent', id: c.id })} />} />}
          </div></div>}
      </section>
    </main>
  )
}

/** 새 대화를 이 프로젝트(또는 워크벤치)에서 연다: 새 대화 화면이 이미 열려 있어도 고른 것을 바꾼다 */
const PICK_EVENT = 'rw-agent-pick'
export function newChatIn(rid: string): void {
  store.set('rw-agent-project', rid)
  window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: rid }))
  go({ page: 'agent' })
}

// ---------- 오른쪽 사이드바의 에이전트 탭 패널 ----------

/** 지금 프로젝트의 대화. 머리줄(11/28): 「에이전트 대화」와 대화 목록 · 나란히 · 넓게 보기. 연 대화는 그 아래 둘째 줄(제목, 묶음과 상태 · 시각)에 보이고 프로젝트마다 기억한다 */
export function AgentPanel({ rid, note, onSaved, onBeside, terminal, recordTarget }: {
  rid: string
  note?: { file: string; title: string }
  onSaved(m: string): void
  /** 연 대화를 노트 옆 패널의 탭으로 */
  onBeside?(id: string): void
  /** 이 사이드바에 터미널 칸이 있다 (머리줄의 터미널 버튼) */
  terminal?: boolean
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
  const list = useChatList(rid).data?.chats, centralRow = useChatList().data?.chats.find((c) => c.rid === CENTRAL_RID && !c.archived && !c.local)
  const known = open && (list?.some((c) => c.id === open) || open === centralRow?.id)
  const current = open && (known || !list) ? open : null
  const auto: Attach | undefined = note ? { kind: 'note', ref: note.file, label: note.title } : undefined
  const sorted = [...(list ?? [])].filter((c) => !c.archived || c.id === current).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))
  // 머리줄 (11/28 틀): 왼쪽 이름, 오른쪽에 대화 목록(보기 버튼이라 목록을 볼 때 불) · 변경사항 · 터미널, 나머지(나란히 · 넓게 보기)는 ⋯ 안
  const opened = useChat(current ?? '', !!current).data
  const [added, removed] = (opened?.items ?? []).reduce(([x, y], i) => (i.kind === 'edit' ? [x + i.added, y + i.removed] : [x, y]), [0, 0])
  const canTerm = useTerminalAvailable() && !!terminal
  const more: MoreItem[] = [
    ...(onBeside ? [{ label: t('노트 옆 패널에 나란히', 'Side by side with the note'), ui: '대화 자리', disabled: !current, note: current ? undefined : t('대화를 먼저 여세요', 'Open a conversation first'), onClick: () => { if (current) onBeside(current) } }] : []),
    { label: t('에이전트 화면에서 넓게 보기', 'Open wide in the agent page'), ui: '넓게 보기', onClick: () => go(current ? { page: 'agent', id: current } : { page: 'agent' }) },
  ]
  const head = (
    <div className="rs-head rs-name ac-panel-head" data-ui="오른쪽 사이드바 머리줄">
      <span className="rs-name-t">{t('에이전트 대화', 'Agent chat')}</span>
      <button className={`icon-btn sm${current ? '' : ' on'}`} data-ui="대화 목록으로" aria-pressed={!current} disabled={!current}
        data-tip={rid === LIBRARY_RID ? t('지식의 대화 목록', 'Knowledge conversations') : t('이 프로젝트의 대화 목록', 'Conversations in this project')} aria-label={t('대화 목록', 'Conversations')} onClick={() => setOpen(null)}>{Icon.list}</button>
      <button className="icon-btn sm ac-panel-changes" data-ui="패널 변경사항" disabled={!current || !opened?.changed.length}
        data-tip={!current ? t('변경사항 (대화를 먼저 여세요)', 'Changes (open a conversation first)') : opened?.changed.length ? t(`변경사항 +${added} −${removed} · 에이전트 화면에서 보기`, `Changes +${added} −${removed}, view in the agent page`) : t('변경사항 (아직 없음)', 'Changes (none yet)')}
        aria-label={t('변경사항', 'Changes')} onClick={() => { if (current) { showChangesNext(); go({ page: 'agent', id: current }) } }}>{Icon.diff}{!!opened?.changed.length && <i className="ac-side-dot" />}</button>
      {canTerm && <button className="icon-btn sm" data-ui="패널 터미널" data-tip={t('터미널 (이 프로젝트 폴더)', 'Terminal (this project folder)')} aria-label={t('터미널', 'Terminal')} onClick={() => openRight('terminal')}>{Icon.terminal}</button>}
      <MoreMenu small items={more} />
    </div>
  )
  // 안 A (10/28 23:08 결정): 목록 ↔ 대화. 대화를 열면 둘째 줄이 제목 · 묶음 · 상태 · ⋯ 이다
  if (current) return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      {head}
      <PanelChat key={current} id={current} auto={auto} onDeleted={() => setOpen(null)} onSaved={onSaved} recordTarget={recordTarget} />
    </div>
  )
  return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      {head}
      {/* 새 대화의 범위 · 입력란은 연 대화의 입력란처럼 패널 아래에 고정하고, 대화 목록은 그 위에서 스크롤 (10/27 17:06 피드백) */}
      <div className="rs-scroll ac-panel-list"><div className="ac-panel-chats">
        <div className="set-side"><ChatListError rid={rid} /><CentralLine row={centralRow} on={false} onOpen={centralRow ? setOpen : undefined} /><ChatGroups chats={sorted} line={(c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => setOpen(c.id)} />} /></div>
      </div></div>
      <div className="ac-compose ac-new-dock"><NewChat rid={rid} note={note} onCreated={(c) => setOpen(c.id)} /></div>
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

/** 패널 안의 대화: 둘째 줄(제목 · 묶음 · 상태 · ⋯)과 대화. 목록으로 가기는 머리줄의 대화 목록 버튼이나 onBack(머리줄이 없는 곳). 바뀐 곳은 에이전트 화면에서 */
export function PanelChat({ id, auto, onBack, onDeleted, onSaved, tools, recordTarget }: { id: string; auto?: Attach; onBack?(): void; onDeleted(): void; onSaved(m: string): void; tools?: ReactNode; recordTarget?: { target: string; title: string; source?: string } }) {
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

/** 노트 옆 패널의 대화 탭: 머리 · 대화 · 입력란 (지금 보는 노트가 저절로 붙는다) */
export function ChatTab({ id, auto, onSaved }: { id: string; auto?: Attach; onSaved(m: string): void }) {
  return <div className="ac-tab"><ChatView id={id} auto={auto} onDeleted={() => onSaved(t('대화를 지웠습니다. 탭을 닫으세요', 'Conversation deleted. Close the tab'))} onSaved={onSaved} /></div>
}
