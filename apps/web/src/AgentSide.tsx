// 어느 화면에서나 오른쪽 사이드바로 에이전트와 대화 (11/16 사용자 "모든 페이지에서 오른쪽 사이드바를 통해서 메인 에이전트 또는 에이전트와 대화").
// 프로젝트 밖 화면(홈 · 피드백 · 소개 · 설정 …)의 오른쪽 사이드바: 맨 위에 「중앙」, 그 아래 모든 프로젝트의 최근 대화, 아래 입력란은 중앙에게 말한다.
// 대화를 누르면 이 사이드바 안에서 연다(페이지를 옮기지 않음). 프로젝트 화면은 원래의 오른쪽 사이드바 에이전트 탭을 쓰고, 그 목록 맨 위에도 「중앙」이 있다
import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, CENTRAL_RID, devicesApi } from './api'
import { serverSkew } from './DeviceList'
import { ChatLine, PanelChat, rank, useChatList } from './AgentChats'
import { CENTRAL_PAGE, CentralLine } from './CentralChat'
import { t } from './i18n'
import { screenLine } from './screenView'
import { Icon } from './icons'
import { useOfferRightModes, useRightMode, type RightMode } from './noteScreen'
import { qk } from './queries'
import { go } from './router'
import { store } from './store'
import { TerminalPane, useTerminalAvailable } from './TerminalPane'
export { useTerminalAvailable } from './TerminalPane'

const KEY = 'rw-agent-panel-all'
/** 사이드바 목록에 보일 최근 대화 수 (나머지는 에이전트 화면에서) */
const RECENT = 12

/** 프로젝트 밖 화면의 오른쪽 사이드바 에이전트 */
export function GlobalAgentPanel({ onSaved }: { onSaved(m: string): void }) {
  const [open, setOpenState] = useState<string | null>(() => store.get<string | null>(KEY, null))
  const setOpen = (v: string | null) => { setOpenState(v); store.set(KEY, v) }
  const list = useChatList().data?.chats
  const central = list?.find((c) => c.rid === CENTRAL_RID && !c.archived && !c.local)
  const current = open && (!list || list.some((c) => c.id === open)) ? open : null
  const wide = (id: string) => (
    <button className="icon-btn sm" data-ui="넓게 보기" data-tip={t('에이전트 화면에서 넓게 보기', 'Open wide in the agent page')} aria-label={t('넓게 보기', 'Open wide')} onClick={() => go({ page: 'agent', id })}>{Icon.openNote}</button>
  )
  if (current) return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      <PanelChat key={current} id={current} onBack={() => setOpen(null)} onDeleted={() => setOpen(null)} onSaved={onSaved} tools={wide(current)} />
    </div>
  )
  const recent = (list ?? []).filter((c) => !c.archived && c.rid !== CENTRAL_RID).sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated)).slice(0, RECENT)
  return (
    <div className="rs ac-panel" data-ui="에이전트 패널">
      <div className="rs-head ac-panel-head">
        <span className="ac-panel-name" aria-hidden>{Icon.spark}</span>
        <span className="ac-panel-title">{t('에이전트', 'Agents')}</span>
        <span className="sp" />
        {wide(central?.id ?? CENTRAL_PAGE)}
      </div>
      <div className="rs-scroll ac-panel-list">
        <div className="set-side">
          <ChatPlaceNote />
          <CentralLine row={central} on={false} onOpen={setOpen} />
          {!!recent.length && <div className="ac-sub-h">{t('최근 대화', 'Recent conversations')}</div>}
          {recent.map((c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => setOpen(c.id)} />)}
        </div>
      </div>
      <div className="ac-compose ac-new-dock"><TalkToCentral onOpened={setOpen} /></div>
    </div>
  )
}

/** 대화가 서버에서 돌면 한 줄로 (3단계). 닿지 못하면 그 까닭 */
function ChatPlaceNote() {
  const q = useQuery({ queryKey: qk.chatPlace, queryFn: devicesApi.chatPlace, refetchInterval: 60_000 })
  const p = q.data
  if (!p?.remote) return null
  const name = p.server?.label ?? p.server?.machine ?? ''
  return <>
    <p className={`ac-place${p.error ? ' error-text' : ''}`} data-ui="대화 서버">{p.error ? t(`서버(${name})에 닿지 않습니다`, `Cannot reach the server (${name})`) : t(`대화는 ${name}에서 돕니다`, `Chats run on ${name}`)}</p>
    {!p.error && <ServerSkewNote />}
  </>
}

/** 서버의 앱 버전이 이 컴퓨터와 다르면 한 줄 (11/21: 서버가 옛 버전이라 중앙 대화 화면이 죽었다). 서버는 일하는 대화가 있으면 다시 시작을 미룬다 */
function ServerSkewNote() {
  const skew = serverSkew(useQuery({ queryKey: qk.devices, queryFn: devicesApi.get, refetchInterval: 60_000 }).data?.devices)
  if (!skew) return null
  return <p className="ac-place ac-skew" data-ui="서버 버전 다름">{t(`${skew.name}의 앱(${skew.server})이 이 컴퓨터(${skew.here})와 다릅니다: ${skew.gap}. 대화 화면이 맞지 않으면 두 컴퓨터를 새 버전으로 다시 시작하세요`, `The app on ${skew.name} (${skew.server}) differs from this computer (${skew.here}): ${skew.gap}. If chat screens look wrong, restart both on the new version`)}</p>
}

/** 프로젝트 밖 화면의 터미널: rid의 폴더(중앙은 앱 저장소, 못 찾으면 홈)에서 연다. rid를 아직 모르면(대화 목록을 받는 중) 기다린다.
 *  한 번 열면 다른 갈래 · 다른 대화로 가도 셸을 그대로 둔다 */
function useSideTerminal(mode: RightMode, rid: string | null = CENTRAL_RID) {
  const able = useTerminalAvailable()
  const [opened, setOpened] = useState(false)
  useEffect(() => { if (able && mode === 'terminal' && rid !== null) setOpened(true) }, [able, mode, rid])
  const on = able && mode === 'terminal'
  return { able, on, pane: able && opened && <div className="rs-col" hidden={!on}><TerminalPane rid={rid ?? undefined} /></div> }
}

/** 에이전트 화면에서 연 대화의 프로젝트 (중앙 · 대화를 고르지 않음은 중앙). 목록을 받는 중이면 null */
function useChatRid(id: string | undefined): string | null {
  const list = useChatList().data?.chats
  if (!id || id === CENTRAL_PAGE) return CENTRAL_RID
  if (!list) return null
  return list.find((c) => c.id === id)?.rid ?? CENTRAL_RID
}

/** 자기 오른쪽 사이드바가 있는 화면(지식 · 논문 · 그림 첫 화면)의 사이드바: 상단바의 갈래 아이콘(정보 · 에이전트 · 터미널, 11/21 안 A)으로 그 화면 정보와 에이전트를 오간다.
 *  고른 갈래는 노트 화면의 오른쪽 사이드바 갈래와 같은 기억(noteScreen) */
export function InfoOrAgent({ ui, onSaved, children }: { ui: string; onSaved(m: string): void; children: ReactNode }) {
  const chosen = useRightMode()
  const term = useSideTerminal(chosen)
  const mode: RightMode = chosen === 'agent' || term.on ? chosen : 'info'
  const side = mode !== 'info'
  useOfferRightModes(term.able ? ['info', 'agent', 'terminal'] : ['info', 'agent'], mode)
  return (
    <aside className={`kh-side kh-side-tabs${side ? ' kh-side-agent' : ''}`} data-ui={mode === 'agent' ? '에이전트 사이드바' : mode === 'terminal' ? '터미널 사이드바' : ui}>
      {mode === 'agent' ? <GlobalAgentPanel onSaved={onSaved} /> : mode === 'info' && children}
      {term.pane}
    </aside>
  )
}

/** 프로젝트 밖 화면의 에이전트 사이드바 (App.tsx): 이 컴퓨터에서 연 화면이면 상단바 아이콘으로 에이전트 · 터미널을 오간다.
 *  에이전트 화면(terminalOnly: 새 대화 · 중앙)은 터미널만. 대화를 연 화면은 대화 머리 「>_」가 오른쪽 칸을 터미널로 바꾼다(AgentChats.tsx의 AgentPage). 터미널은 그 대화의 프로젝트 폴더, 그 밖은 중앙(앱 저장소)에서 연다 */
export function AgentSideBody({ onSaved, terminalOnly, chatId }: { onSaved(m: string): void; terminalOnly?: boolean; chatId?: string }) {
  const chosen = useRightMode()
  const chatRid = useChatRid(terminalOnly ? chatId : undefined)
  const term = useSideTerminal(terminalOnly ? 'terminal' : chosen, chatRid)
  useOfferRightModes(terminalOnly ? ['terminal'] : term.able ? ['agent', 'terminal'] : ['agent'], terminalOnly || term.on ? 'terminal' : 'agent')
  if (terminalOnly) return term.pane
  return <>
    {!term.on && <GlobalAgentPanel onSaved={onSaved} />}
    {term.pane}
  </>
}

/** 사이드바 아래 입력란: 중앙에게 말한다 (중앙이 없으면 연다). 보낸 뒤 그 대화를 사이드바에서 연다 */
function TalkToCentral({ onOpened }: { onOpened(id: string): void }) {
  const client = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setFail(null)
    try {
      const c = await agentChatsApi.talk(text.trim(), screenLine())
      client.setQueryData(qk.agentChat(c.id), c)
      void client.invalidateQueries({ queryKey: qk.agentChatLists })
      setText('')
      onOpened(c.id)
    } catch (e) { setFail(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="ac-side-talk" data-ui="중앙에게 말하기">
      <textarea className="ac-central-input" rows={3} value={text} placeholder={t('중앙에게 말하기 · ⌘↩ 보내기', 'Talk to Central · ⌘↩ to send')} aria-label={t('중앙에게 말하기', 'Talk to Central')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }} />
      <div className="ac-central-send">
        {fail && <span className="error-text">{fail}</span>}
        <button className="btn primary" disabled={!text.trim() || busy} onClick={() => void submit()}>{t('보내기', 'Send')}</button>
      </div>
    </div>
  )
}
