/** 에이전트 대화 화면의 바탕 부품: 상태 이름 · 목록 줄 · 대화 자료 받기 · 알림 (AgentChats.tsx에서 나눔) */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LIBRARY_RID } from '@rw/core'
import { agentChatsApi, api, APP_RID, CENTRAL_RID, DEBATE_RID, type ChatItem, type ChatRow, type ChatState } from './api'
import { askConfirm } from './askText'
import { relativeTime } from './format'
import { HERE, t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { go } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { asksMe, inBackground, isUnseen, myTurn, shownState, useSeen } from './agentSeen'
import { flash } from './flash'
import { AgentChip, isClaude } from './AgentPick'

/** 잡은 오류의 글 (단언 없이) */
export const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

const LIVE: ReadonlySet<ChatState> = new Set(['running', 'waiting', 'queued'])
export const isLive = (s: ChatState) => LIVE.has(s)

export const STATE_NAME: Record<ChatState, string> = {
  running: t('작업 중', 'Working'),
  waiting: t('허락 기다림', 'Needs approval'),
  queued: t('대기', 'Queued'),
  idle: t('종료', 'Done'),
  stopped: t('중지', 'Stopped'),
  error: t('오류', 'Error'),
}
const WAIT_NAME: Record<NonNullable<ChatRow['wait']>, string> = { plan: t('계획 승인 기다림', 'Plan waits for you'), ask: t('허락 기다림', 'Needs approval') }
/** 줄 선 대화는 「대기 n번째」 (11/20 시안 1절: 상태 이름 「일하는 중」→「작업 중」 · 「끝남」→「종료」 · 「줄 섬」→「대기」) */
export const stateName = (c: Pick<ChatRow, 'state' | 'wait'> & Partial<Pick<ChatRow, 'queue' | 'tasks' | 'asks' | 'archived'>>) => (c.wait ? WAIT_NAME[c.wait] : asksMe(c) ? t('답 기다림', 'Waits for your answer') : c.state === 'queued' && c.queue ? t(`대기 ${c.queue}번째`, `Queued #${c.queue}`) : inBackground(c) ? t(`작업 중 · 백그라운드 명령 ${c.tasks}개`, `Working · ${c.tasks} background command${c.tasks! > 1 ? 's' : ''}`) : STATE_NAME[c.state])

/** 대화 상태: 작업 중은 진행 점, 사용자 차례(허락 · 계획)는 주황 점, 오류는 위험 색 글자, 나머지는 옅은 이름 */
export function ChatStateMark({ state, label, name: given }: { state: ChatState; label?: boolean; name?: string }) {
  const name = given ?? STATE_NAME[state]
  if (state === 'running') return <span className="ac-state"><StatusDot s="in-progress" name={name} label={label} /></span>
  if (state === 'waiting') return <span className="ac-state" title={name}><span className="turn-dot" role="img" aria-label={name} />{label && <span className="g-name">{name}</span>}</span>
  if (state === 'error') return <span className="ac-state error-text">{name}</span>
  return label || state === 'queued' ? <span className="ac-state muted">{name}</span> : null
}

/** +n −n (노트 고침에서 더하고 뺀 줄) */
export function Delta({ added, removed }: { added: number; removed: number }) {
  return <span className="ac-delta"><span className="ac-add">+{added}</span><span className="ac-del">−{removed}</span></span>
}

/** Claude Code가 주는 비용은 쓴 토큰을 API 요금으로 친 값이다. 구독 로그인이면 따로 청구되지 않는다 */
export const costName = (usd: number) => t(`API 가격으로 약 $${usd.toFixed(2)} (구독 로그인이면 청구되지 않음)`, `About $${usd.toFixed(2)} at API prices (not billed on a subscription login)`)

/** 글 복사 (내 지시 · 에이전트 글 · 계획). 누르면 잠깐 체크 */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = () => void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }, () => undefined)
  return <button className="icon-btn sm ac-copy" data-ui="글 복사" data-tip={done ? t('복사했습니다', 'Copied') : t('복사', 'Copy')} aria-label={t('복사', 'Copy')} onClick={copy}>{done ? Icon.check : Icon.copy}</button>
}


// ---------- 목록 ----------

export const useChatList = (rid?: string) => { useSeen(); return useQuery({ queryKey: qk.agentChatList(rid), queryFn: () => agentChatsApi.list(rid) }) }
/** 탭 이름 (App.tsx tabTitle, 나란히 연 대화): 불러온 대화의 이름 */
export const chatTitles = new Map<string, string>()
export const useChat = (id: string, enabled = true) => useQuery({ queryKey: qk.agentChat(id), queryFn: () => agentChatsApi.get(id).then((c) => { chatTitles.set(c.id, c.title); return c }), enabled })
export const useProjects = () => useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches


/** 대화 목록 · 머리에 보일 프로젝트 이름 (앱 고치기 대화는 「앱」) */
export const projectName = (rid: string, projects?: { id: string; title: string }[]) => (rid === APP_RID ? t('앱', 'App') : rid === CENTRAL_RID ? t('중앙', 'Central') : rid === DEBATE_RID ? t('토론', 'Debate') : rid === LIBRARY_RID ? t('지식', 'Knowledge') : projects?.find((p) => p.id === rid)?.title ?? rid)

/** 대화의 묶음 (10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ 2절): 기록의 질문 · 지시가 연 대화와 직접 연 대화를 섞지 않는다 */
export const chatGroupName = (c: Pick<ChatRow, 'record'>) => c.record ? t('기록의 질문 · 지시', 'Record questions and instructions') : t('직접 연 대화', 'Conversations you opened')
export function ChatGroups({ chats, line }: { chats: ChatRow[]; line(c: ChatRow): ReactNode }) {
  const [records, direct] = [chats.filter((c) => c.record), chats.filter((c) => !c.record)]
  // 기록 대화가 없으면 묶음 머리 없이 예전 목록 그대로
  if (!records.length) return <>{direct.map(line)}</>
  return <>
    <div className="ac-sub-h" data-ui="기록 대화 묶음">{chatGroupName({ record: { target: '', id: '' } })} <span className="n">{records.length}</span></div>
    {records.map(line)}
    {!!direct.length && <div className="ac-sub-h" data-ui="직접 연 대화 묶음">{chatGroupName({})} <span className="n">{direct.length}</span></div>}
    {direct.map(line)}
  </>
}
export const rank = (c: ChatRow) => (myTurn(c) ? 0 : isLive(c.state) || inBackground(c) ? 1 : 2)

/** 목록 한 줄: 상태 점 · 이름, 아래 줄에 무엇을 기다리는지(상태) · +n −n · 시각 */
/** where = 줄의 상태 글 뒤에 붙일 대상 이름 (대화 목록 대상 「전체」에서, 11/20 시안 1절) */
export function ChatLine({ c, on, onOpen, actions = false, pick, where }: { c: ChatRow; on: boolean; onOpen(): void; actions?: boolean; pick?: { on: boolean; disabled?: string; toggle(): void }; where?: string }) {
  const [editing, setEditing] = useState(false)
  const { rename } = useChatActions(c.id)
  const line = (
    <button className={`nav ac-line${on && !pick ? ' on' : ''}${pick?.on ? ' picked' : ''}`} data-ui="대화 줄" data-ui-item={c.title} title={pick?.disabled ?? c.title}
      disabled={!!pick?.disabled} aria-pressed={pick ? pick.on : undefined} onClick={pick ? pick.toggle : onOpen}>
      <span className="ac-line-top">{pick && <span className={`ac-pick${pick.on ? ' on' : ''}`} aria-hidden />}<span className="ac-line-dot">{asksMe(c) ? <span className="turn-dot" role="img" aria-label={t('답 기다림', 'Waits for your answer')} title={t('에이전트가 묻고 답을 기다리는 대화', 'The agent asked and waits for your answer')} /> : isUnseen(c) ? <span className="turn-dot" role="img" aria-label={t('확인하지 않음', 'Not checked')} title={t('끝났는데 아직 열어 보지 않은 대화', 'Finished and not opened yet')} /> : <ChatStateMark state={shownState(c)} name={stateName(c)} />}</span>
        <span className={`label${editing ? ' hide' : ''}`}>{c.title}</span></span>
      <span className="ac-line-meta">
        {c.local && <><span className="tag ac-here" data-ui="이 맥 태그" title={t('서버가 아닌 이 컴퓨터에서 도는 대화', 'Runs on this computer, not on the server')}>{t(HERE.ko, HERE.En)}</span> </>}{!isClaude(c.agent) && <><AgentChip agent={c.agent} /> · </>}{c.machine ?? stateName(c)}{where && ` · ${where}`}
        {(c.added > 0 || c.removed > 0) && <> · <Delta added={c.added} removed={c.removed} /></>}
        {` · ${relativeTime(Date.parse(c.updated))}`}
      </span>{c.archived && c.summary && <span className="ac-line-sum" data-ui="결과 요약">{c.summary.split('\n')[0]}</span>}
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
export function TitleInput({ value, onDone, className }: { value: string; onDone(title: string | null): void; className?: string }) {
  const [text, setText] = useState(value)
  const done = useRef(false)
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v !== null && v.trim() && v.trim() !== value ? v.trim() : null) }
  return <input className={`ac-title-input${className ? ` ${className}` : ''}`} autoFocus aria-label={t('대화 제목', 'Conversation title')} value={text} maxLength={60}
    onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={() => finish(text)}
    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); finish(text) } else if (e.key === 'Escape') { e.preventDefault(); finish(null) } }} />
}

/** 대화 제목 바꾸기 · 지우기 (머리 ⋯ 메뉴와 목록 줄이 함께 쓴다) */
export function useChatActions(id: string) {
  const client = useQueryClient()
  const rename = async (title: string) => {
    try { client.setQueryData(qk.agentChat(id), await agentChatsApi.rename(id, title)); void client.invalidateQueries({ queryKey: qk.agentChats }) } catch (e) { flash(errorOf(e)) }
  }
  const remove = async (): Promise<boolean> => {
    if (!await askConfirm({ title: t('이 대화를 지울까요?', 'Delete this conversation?'), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토는 그대로 남습니다.', 'Only the conversation is deleted. Notes, records and edit review stay.'), ok: t('삭제', 'Delete') })) return false
    try { await agentChatsApi.remove(id); void client.invalidateQueries({ queryKey: qk.agentChats }); flash(t('대화를 지웠습니다', 'Conversation deleted')); return true } catch (e) { flash(errorOf(e)); return false }
  }
  return { rename, remove }
}

/** 고른 대화 여러 개를 보관 · 복원 · 지우기 (지우기는 보관한 것만, 한 번 묻고) */
export function useBulkChats() {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const run = async (ids: string[], one: (id: string) => Promise<unknown>, done: string) => {
    setBusy(true)
    try { for (const id of ids) await one(id); flash(done) } catch (e) { flash(errorOf(e)) } finally { setBusy(false); void client.invalidateQueries({ queryKey: qk.agentChats }) }
  }
  const archive = (ids: string[], v: boolean) => run(ids, (id) => agentChatsApi.archive(id, v), v ? t(`${ids.length}개를 보관함에 넣었습니다`, `Archived ${ids.length}`) : t(`${ids.length}개를 보관함에서 꺼냈습니다`, `Unarchived ${ids.length}`))
  const remove = async (ids: string[]): Promise<boolean> => {
    if (!await askConfirm({ title: t(`보관한 대화 ${ids.length}개를 지울까요?`, `Delete ${ids.length} archived conversations?`), hint: t('대화 기록만 사라집니다. 노트 · 기록과 수정 검토, 바꾼 파일과 PR은 그대로 남습니다.', 'Only the conversations are deleted. Notes, records, edit review, changed files and PRs stay.'), ok: t('삭제', 'Delete') })) return false
    await run(ids, (id) => agentChatsApi.remove(id), t(`${ids.length}개를 지웠습니다`, `Deleted ${ids.length}`))
    return true
  }
  return { busy, archive, remove }
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
  useSeen()
  // 중앙은 목록에 보이는 하나만 (보이지 않는 옛 중앙 · 이 맥의 중앙은 세지 않는다)
  const shown = list?.filter((c) => !c.archived && (c.rid !== CENTRAL_RID || !c.local)) ?? []
  // 알림 종과 같은 셈 (11/27 결정): 답할 것(허락 · 계획을 기다림, 에이전트가 묻고 끝냄)만 주황 수, 끝났는데 열어 보지 않은 대화 · 오류는 파랑 점(소식)
  const n = shown.filter((c) => c.state === 'waiting' || c.wait || asksMe(c)).length
  const news = shown.filter((c) => c.state !== 'waiting' && !c.wait && !asksMe(c) && (c.state === 'error' || isUnseen(c))).length
  if (n) return <span className="rail-count" title={t(`답할 대화 ${n}개 (허락 · 계획을 기다리거나 에이전트가 물음)`, `${n} conversation(s) to answer (waiting for approval or a plan, or the agent asked)`)}>{n}</span>
  return news ? <span className="rail-new" role="img" aria-label={t(`새 소식이 있는 대화 ${news}개`, `${news} conversation(s) with news`)} title={t(`새 소식이 있는 대화 ${news}개 (끝났는데 열어 보지 않음 · 오류)`, `${news} conversation(s) with news (finished and not opened, or stopped with an error)`)} /> : null
}
