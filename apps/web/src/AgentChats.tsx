import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, api, type Chat, type ChatItem, type ChatRow, type ChatScope, type ChatState, type ChatWrite } from './api'
import { askConfirm } from './askText'
import { Author } from './Author'
import { ComposeBox } from './Conversation'
import { relativeTime } from './format'
import { t } from './i18n'
import { Icon } from './icons'
import { MemoText } from './memo'
import { qk } from './queries'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'

/**
 * 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21 사용자 결정 "프로젝트 관리 먼저"):
 * 앱이 맥의 Claude Code를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다(서버 agentChats.ts).
 * - 레일 "에이전트" 화면(AgentPage · AgentSide): 모든 프로젝트의 대화. 사이드바에 프로젝트마다 대화 줄
 * - 상단바 반짝이(AgentPanel): 지금 프로젝트의 대화를 오른쪽 사이드바 자리에서
 * 범위 밖 고치기와 파일 바로 쓰기는 서버가 막고, 명령은 허락 카드로 묻는다(사용자 차례 = 주황).
 */

const LIVE: ReadonlySet<ChatState> = new Set(['running', 'waiting', 'queued'])
export const isLive = (s: ChatState) => LIVE.has(s)

const STATE_NAME: Record<ChatState, string> = {
  running: t('도는 중', 'Running'),
  waiting: t('허락 기다림', 'Needs approval'),
  queued: t('줄 섬', 'Queued'),
  idle: t('답함', 'Replied'),
  stopped: t('중지', 'Stopped'),
  error: t('오류', 'Error'),
}
const WRITE_NAME: Record<ChatWrite, string> = { read: t('읽기만', 'Read only'), notes: t('노트 고치기', 'Edit notes') }

/** 대화 상태: 도는 중은 진행 점, 허락을 기다리면 사용자 차례 주황 점, 오류는 위험 색 글자, 나머지는 옅은 이름 */
export function ChatStateMark({ state, label }: { state: ChatState; label?: boolean }) {
  const name = STATE_NAME[state]
  if (state === 'running') return <span className="ac-state"><StatusDot s="in-progress" name={name} label={label} /></span>
  if (state === 'waiting') return <span className="ac-state" title={name}><span className="turn-dot" role="img" aria-label={name} />{label && <span className="g-name">{name}</span>}</span>
  if (state === 'error') return <span className="ac-state error-text">{name}</span>
  return label || state === 'queued' ? <span className="ac-state muted">{name}</span> : null
}

function scopeName(s: ChatScope, topics?: { id: string; title: string }[]): string {
  if (s.kind === 'project') return t('프로젝트 전체', 'Whole project')
  if (s.kind === 'topic') return `${t('주제', 'Topic')} · ${topics?.find((x) => x.id === s.target)?.title ?? s.target}`
  return `${t('노트', 'Note')} · ${s.target?.split('/').slice(-2, -1)[0] ?? s.target}`
}

const useChatList = (rid?: string) => useQuery({ queryKey: qk.agentChatList(rid), queryFn: () => agentChatsApi.list(rid) })
const useChat = (id: string) => useQuery({ queryKey: qk.agentChat(id), queryFn: () => agentChatsApi.get(id) })
const useProjects = () => useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches

// ---------- 대화 한 줄 (목록) ----------

function ChatLine({ c, on, project, onOpen }: { c: ChatRow; on: boolean; project?: string; onOpen(): void }) {
  return (
    <button className={`nav ac-line${on ? ' on' : ''}`} data-ui="대화 줄" data-ui-item={c.title} title={c.title} onClick={onOpen}>
      <span className="label">{c.title}</span>
      {project && <span className="meta">{project}</span>}
      <ChatStateMark state={c.state} />
    </button>
  )
}

// ---------- 대화 보기 ----------

type Block = { kind: 'steps'; items: Extract<ChatItem, { kind: 'step' }>[] } | { kind: 'one'; item: Exclude<ChatItem, { kind: 'step' }> }

/** 이어진 도구 줄은 한 묶음으로 (마지막 하나만 보이고 펼치면 모두) */
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

function StepLine({ s }: { s: Extract<ChatItem, { kind: 'step' }> }) {
  return (
    <div className="ac-step" data-ui="도구 줄">
      <span className="ac-tool mono">{s.tool}</span>
      <span className="ac-sum" title={s.summary}>{s.summary}</span>
      {s.outside && <span className="tag" data-ui="범위 밖 태그" title={t('이 대화의 범위 밖을 읽었습니다', 'Read outside this conversation\'s scope')}>{t('범위 밖', 'Outside scope')}</span>}
      {s.sub && <span className="muted ac-sub">{t('서브에이전트', 'Subagent')}</span>}
    </div>
  )
}

function Steps({ items }: { items: Extract<ChatItem, { kind: 'step' }>[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 1) return <li className="ac-steps"><StepLine s={items[0]!} /></li>
  return (
    <li className="ac-steps">
      <button className="a ac-steps-toggle" data-ui="도구 줄 펼치기" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? t(`도구 ${items.length}번 접기`, `Hide ${items.length} tool calls`) : t(`도구 ${items.length}번 보기`, `Show ${items.length} tool calls`)}
      </button>
      {(open ? items : items.slice(-1)).map((s, i) => <StepLine key={i} s={s} />)}
    </li>
  )
}

const ANSWERED: Record<'allow' | 'always' | 'deny', string> = { allow: t('허락함', 'Allowed'), always: t('이 대화에서 늘 허락함', 'Always allowed in this conversation'), deny: t('거절함', 'Declined') }

function AskCard({ chat, it, onError }: { chat: Chat; it: Extract<ChatItem, { kind: 'ask' }>; onError(m: string): void }) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const answer = async (a: 'allow' | 'always' | 'deny') => {
    setBusy(true)
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.answer(chat.id, it.id, a)) } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <li className={`ac-ask${it.answer ? ' done' : ''}`} data-ui="허락 카드">
      <div className="ac-ask-head">
        {!it.answer && <span className="turn-dot" aria-hidden />}
        <b>{it.answer ? ANSWERED[it.answer] : t('허락이 필요합니다', 'Approval needed')}</b>
        <span className="ac-tool mono">{it.tool}</span>
      </div>
      <code className="ac-ask-sum">{it.summary}</code>
      {!it.answer && (
        <div className="ac-ask-row">
          <span className="sp" />
          <button className="btn sm" disabled={busy} data-ui="거절 버튼" onClick={() => void answer('deny')}>{t('거절', 'Decline')}</button>
          <button className="btn sm" disabled={busy} data-ui="늘 허락 버튼" data-tip={t('이 대화에서 같은 명령은 다시 묻지 않습니다', 'Do not ask again for the same command in this conversation')} onClick={() => void answer('always')}>{t('이 대화에서 늘', 'Always here')}</button>
          <button className="btn primary sm" disabled={busy} data-ui="허락 버튼" onClick={() => void answer('allow')}>{t('허락', 'Allow')}</button>
        </div>
      )}
    </li>
  )
}

function ItemView({ chat, it, onError }: { chat: Chat; it: Exclude<ChatItem, { kind: 'step' }>; onError(m: string): void }) {
  const when = <span className="muted ac-when" title={new Date(it.at).toLocaleString()}>{relativeTime(Date.parse(it.at))}</span>
  switch (it.kind) {
    case 'user': return <li className="fbp-say me ac-say" data-ui="내 지시"><div className="fbp-say-head"><b>{t('나', 'Me')}</b><span className="sp" />{when}</div><MemoText text={it.text} /></li>
    case 'text': return <li className="fbp-say ac-say" data-ui="에이전트 글"><div className="fbp-say-head"><b><Author by="claude" /></b>{it.sub && <span className="muted">{t('서브에이전트', 'Subagent')}</span>}<span className="sp" />{when}</div><MemoText text={it.text} /></li>
    case 'ask': return <AskCard chat={chat} it={it} onError={onError} />
    case 'blocked': return <li className="ac-note" data-ui="막은 일"><span className="ac-tool mono">{it.tool}</span><span>{t('막음', 'Blocked')} · {it.reason}</span></li>
    case 'result': return <li className="ac-note muted" data-ui="차례 끝">{it.ok ? `✓ ${t('이번 차례 끝', 'Turn done')}` : t('이번 차례 실패', 'Turn failed')}{it.cost !== undefined && ` · $${it.cost.toFixed(2)}`}</li>
    case 'error': return <li className="ac-note error-text" data-ui="대화 오류">! {it.text}</li>
  }
}

/** 대화 하나: 머리(이름 · 범위 · 상태 · 멈추기 · 지우기), 주고받은 줄, 아래 입력란 */
export function ChatView({ id, onBack, onDeleted, onSaved }: { id: string; onBack?(): void; onDeleted(): void; onSaved(m: string): void }) {
  const client = useQueryClient()
  const { data: chat, error } = useChat(id)
  const projects = useProjects()
  const topics = useQuery({ queryKey: qk.topics(chat?.rid ?? ''), queryFn: () => api.research(chat!.rid).topics(), enabled: chat?.scope.kind === 'topic' }).data
  const [text, setText] = useState('')
  const [fail, setFail] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const n = chat?.items.length ?? 0
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [n, id])
  if (!chat) return <div className="empty center">{error ? (error as Error).message : t('불러오는 중…', 'Loading…')}</div>
  const live = isLive(chat.state)
  const project = projects?.find((p) => p.id === chat.rid)?.title ?? chat.rid
  const sendIt = async () => {
    const v = text.trim()
    if (!v) return
    setFail(null)
    try { client.setQueryData(qk.agentChat(id), await agentChatsApi.send(id, v)); setText('') } catch (e) { setFail((e as Error).message) }
  }
  const stop = async () => { try { client.setQueryData(qk.agentChat(id), await agentChatsApi.stop(id)) } catch (e) { setFail((e as Error).message) } }
  const remove = async () => {
    if (!await askConfirm({ title: t('이 대화를 지울까요?', 'Delete this conversation?'), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토는 그대로 남습니다.', 'Only the conversation is deleted. Notes, records and edit review stay.'), ok: t('지우기', 'Delete') })) return
    try { await agentChatsApi.remove(id); void client.invalidateQueries({ queryKey: qk.agentChats }); onSaved(t('대화를 지웠습니다', 'Conversation deleted')); onDeleted() } catch (e) { setFail((e as Error).message) }
  }
  return (
    <div className="ac-chat" data-ui="에이전트 대화">
      <div className="ac-head" data-ui="대화 헤더">
        {onBack && <button className="icon-btn sm" data-ui="대화 목록으로" data-tip={t('대화 목록', 'Conversations')} aria-label={t('대화 목록으로', 'Back to conversations')} onClick={onBack}>{Icon.back}</button>}
        <div className="ac-head-what">
          <div className="ac-title" title={chat.title}>{chat.title}</div>
          <div className="ac-meta">
            <button className="a" data-ui="대화 프로젝트" onClick={() => go({ page: 'overview', rid: chat.rid })}>{project}</button>
            <span className="tag">{scopeName(chat.scope, topics)}</span>
            <span className="tag">{WRITE_NAME[chat.write]}</span>
          </div>
        </div>
        <ChatStateMark state={chat.state} label />
        {live
          ? <button className="btn sm" data-ui="대화 멈추기" onClick={() => void stop()}>{t('멈추기', 'Stop')}</button>
          : <button className="icon-btn sm" data-ui="대화 지우기" data-tip={t('지우기', 'Delete')} aria-label={t('대화 지우기', 'Delete conversation')} onClick={() => void remove()}>{Icon.trash}</button>}
      </div>
      {!!chat.claims.length && <div className="ac-claims muted" data-ui="잡은 파일">{t('고치는 중', 'Changing')}: {chat.claims.join(', ')}</div>}
      <ol ref={listRef} className="fbp-thread ac-items" data-ui="대화 줄들">
        {blocksOf(chat.items).map((b, i) => b.kind === 'steps' ? <Steps key={i} items={b.items} /> : <ItemView key={i} chat={chat} it={b.item} onError={setFail} />)}
      </ol>
      <div className="ac-compose" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendIt() } }}>
        <ComposeBox value={text} onChange={setText} placeholder={t('이어서 지시하기', 'Continue the conversation')} error={fail}
          waiting={live ? (chat.state === 'queued' ? t('앞 대화가 끝나면 시작합니다', 'Starts when a running conversation finishes') : chat.state === 'waiting' ? t('위 허락 카드에 답해 주세요', 'Answer the approval card above') : t('에이전트가 일하는 중입니다', 'The agent is working')) : undefined}>
          <button className="btn primary sm" data-ui="지시 보내기" data-tip={t('보내기 (⌘↵)', 'Send (⌘↵)')} disabled={!text.trim()} onClick={() => void sendIt()}>{t('보내기', 'Send')}</button>
        </ComposeBox>
      </div>
    </div>
  )
}

// ---------- 새 대화 ----------

/** 새 대화: 프로젝트(rid가 없을 때) · 범위 · 고치기 단계 · 지시 */
export function NewChat({ rid: fixed, note, onCreated }: { rid?: string; note?: { file: string; title: string }; onCreated(c: Chat): void }) {
  const client = useQueryClient()
  const projects = useProjects()
  const [pick, setPick] = useState(() => store.get<string>('rw-agent-project', ''))
  const rid = fixed ?? (projects?.some((p) => p.id === pick) ? pick : projects?.[0]?.id ?? '')
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: !!rid }).data
  const [kind, setKind] = useState<ChatScope['kind']>(note ? 'note' : 'project')
  const [topic, setTopic] = useState('')
  const [write, setWrite] = useState<ChatWrite>('notes')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const topicId = topic || topics?.[0]?.id || ''
  const scope: ChatScope = kind === 'note' && note ? { kind, target: note.file } : kind === 'topic' && topicId ? { kind, target: topicId } : { kind: 'project' }
  const start = async () => {
    if (!text.trim() || !rid) return
    setBusy(true); setFail(null)
    try {
      const c = await agentChatsApi.create({ rid, text, scope, write })
      void client.invalidateQueries({ queryKey: qk.agentChats })
      setText('')
      onCreated(c)
    } catch (e) { setFail((e as Error).message) } finally { setBusy(false) }
  }
  const kinds: [ChatScope['kind'], string][] = [['project', t('프로젝트', 'Project')], ['topic', t('주제', 'Topic')], ...(note ? [['note', t('이 노트', 'This note')] as [ChatScope['kind'], string]] : [])]
  return (
    <div className="ac-new" data-ui="새 대화" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void start() } }}>
      {!fixed && (
        <label className="ac-field"><span className="rs-label">{t('프로젝트', 'Project')}</span>
          <select className="rs-select" data-ui="대화 프로젝트 고르기" value={rid} onChange={(e) => { setPick(e.target.value); store.set('rw-agent-project', e.target.value); setTopic('') }}>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
      )}
      <div className="ac-field"><span className="rs-label">{t('범위', 'Scope')}</span>
        <div className="segmented small full" role="radiogroup" aria-label={t('범위', 'Scope')} data-ui="대화 범위">
          {kinds.map(([k, label]) => <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} disabled={k === 'topic' && !topics?.length} onClick={() => setKind(k)}>{label}</button>)}
        </div>
        {kind === 'topic' && !!topics?.length && (
          <select className="rs-select" data-ui="대화 주제 고르기" value={topicId} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        )}
        {kind === 'note' && note && <span className="muted ac-hint" title={note.file}>{note.title}</span>}
      </div>
      <div className="ac-field"><span className="rs-label">{t('고치기', 'Changes')}</span>
        <div className="segmented small full" role="radiogroup" aria-label={t('고치기', 'Changes')} data-ui="대화 고치기 단계">
          {(['read', 'notes'] as const).map((w) => <button key={w} role="radio" aria-checked={write === w} className={write === w ? 'on' : ''} onClick={() => setWrite(w)}>{WRITE_NAME[w]}</button>)}
        </div>
        <span className="muted ac-hint">{write === 'read' ? t('읽고 답만 합니다. 명령은 묻고 돌립니다', 'Reads and answers only. Commands ask first') : t('범위 안 노트를 고치고 수정 검토에 올립니다. 명령은 묻고 돌립니다', 'Edits notes in scope; changes go to edit review. Commands ask first')}</span>
      </div>
      <ComposeBox value={text} onChange={setText} placeholder={t('에이전트에게 맡길 일', 'What should the agent do?')} error={fail}>
        <button className="btn primary sm" data-ui="대화 시작" data-tip={t('시작 (⌘↵)', 'Start (⌘↵)')} disabled={busy || !text.trim() || !rid} onClick={() => void start()}>{t('시작', 'Start')}</button>
      </ComposeBox>
    </div>
  )
}

// ---------- 레일 "에이전트" 화면 ----------

/** 지금 도는 대화와 잡은 파일 (서버 /api/agent-work, MCP · STATUS와 같은 것) */
function WorkNow() {
  const work = useQuery({ queryKey: qk.agentWork, queryFn: () => agentChatsApi.work() }).data
  const projects = useProjects()
  if (!work?.chats.length) return null
  return (
    <section className="ac-work" data-ui="지금 도는 대화">
      <h2 className="ac-h">{t('지금 도는 대화', 'Running now')}</h2>
      <ul className="ac-work-list">
        {work.chats.map((c) => (
          <li key={c.id}>
            <button className="a" onClick={() => go({ page: 'agent', id: c.id })}>{c.title}</button>
            <span className="muted">{projects?.find((p) => p.id === c.rid)?.title ?? c.rid} · {scopeName(c.scope)}</span>
            <ChatStateMark state={c.state} />
            {!!c.claims.length && <span className="muted ac-sum" title={c.claims.join('\n')}>{t('고치는 중', 'Changing')}: {c.claims.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AgentPage({ id, onSaved }: { id?: string; onSaved(m: string): void }) {
  return (
    <main className="stage full" data-ui="에이전트">
      <section className="pane">
        {id
          ? <div className="ac-page"><ChatView key={id} id={id} onDeleted={() => go({ page: 'agent' })} onSaved={onSaved} /></div>
          : <div className="scroll"><div className="page-body ac-start">
            <NewChat onCreated={(c) => go({ page: 'agent', id: c.id })} />
            <WorkNow />
          </div></div>}
      </section>
    </main>
  )
}

/** 사이드바: 새 대화, 프로젝트마다 대화 줄 (사용자 차례 · 도는 것이 위, 그다음 최근) */
export function AgentSide({ id }: { id?: string }) {
  const list = useChatList().data?.chats
  const projects = useProjects()
  const groups = useMemo(() => {
    const rank = (c: ChatRow) => (c.state === 'waiting' ? 0 : isLive(c.state) ? 1 : 2)
    const by = new Map<string, ChatRow[]>()
    for (const c of [...(list ?? [])].sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))) by.set(c.rid, [...(by.get(c.rid) ?? []), c])
    return [...by.entries()]
  }, [list])
  return (
    <div className="set-side ac-side" data-ui="대화 목록">
      <button className={`nav${!id ? ' on' : ''}`} data-ui="새 대화 줄" onClick={() => go({ page: 'agent' })}><span className="label">{t('＋ 새 대화', '＋ New conversation')}</span></button>
      {list && !list.length && <div className="empty">{t('대화가 아직 없습니다. 새 대화로 일을 맡기세요.', 'No conversations yet. Start one to hand off work.')}</div>}
      {groups.map(([rid, chats]) => (
        <div key={rid}>
          <div className="ac-side-h">{projects?.find((p) => p.id === rid)?.title ?? rid}</div>
          {chats.map((c) => <ChatLine key={c.id} c={c} on={c.id === id} onOpen={() => go({ page: 'agent', id: c.id })} />)}
        </div>
      ))}
    </div>
  )
}

/** 레일 배지: 허락을 기다리는 대화 수 (사용자 차례) */
export function AgentRailCount() {
  const list = useChatList().data?.chats
  const n = list?.filter((c) => c.state === 'waiting').length ?? 0
  return n ? <span className="rail-count" title={t(`허락을 기다리는 대화 ${n}개`, `${n} conversation(s) waiting for approval`)}>{n}</span> : null
}

// ---------- 상단바 반짝이: 오른쪽 사이드바 자리의 패널 ----------

/** 지금 프로젝트의 대화. 연 대화는 프로젝트마다 기억한다 */
export function AgentPanel({ rid, note, onSaved }: { rid: string; note?: { file: string; title: string }; onSaved(m: string): void }) {
  const key = `rw-agent-panel-${rid}`
  const [open, setOpenState] = useState<string | null>(() => store.get<string | null>(key, null))
  const setOpen = (v: string | null) => { setOpenState(v); store.set(key, v) }
  const list = useChatList(rid).data?.chats
  const known = open && list?.some((c) => c.id === open)
  const shown: ReactNode = open && (known || !list)
    ? <ChatView key={open} id={open} onBack={() => setOpen(null)} onDeleted={() => setOpen(null)} onSaved={onSaved} />
    : (
      <div className="rs-scroll ac-panel-list">
        <NewChat rid={rid} note={note} onCreated={(c) => setOpen(c.id)} />
        {!!list?.length && <>
          <div className="ac-side-h">{t('이 프로젝트의 대화', 'Conversations in this project')}</div>
          <div className="set-side">{list.map((c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => setOpen(c.id)} />)}</div>
        </>}
      </div>
    )
  return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      <div className="rs-head ac-panel-head"><span className="ac-panel-name">{Icon.spark}{t('에이전트', 'Agent')}</span></div>
      {shown}
    </div>
  )
}
