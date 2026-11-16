// 어느 화면에서나 오른쪽 사이드바로 에이전트와 대화 (11/16 사용자 "모든 페이지에서 오른쪽 사이드바를 통해서 메인 에이전트 또는 에이전트와 대화").
// 프로젝트 밖 화면(홈 · 피드백 · 소개 · 설정 …)의 오른쪽 사이드바: 맨 위에 「중앙」, 그 아래 모든 프로젝트의 최근 대화, 아래 입력란은 중앙에게 말한다.
// 대화를 누르면 이 사이드바 안에서 연다(페이지를 옮기지 않음). 프로젝트 화면은 원래의 오른쪽 사이드바 에이전트 탭을 쓰고, 그 목록 맨 위에도 「중앙」이 있다
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, CENTRAL_RID } from './api'
import { ChatLine, PanelChat, rank, useChatList } from './AgentChats'
import { CENTRAL_PAGE, CentralLine } from './CentralChat'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { go } from './router'
import { store } from './store'

const KEY = 'rw-agent-panel-all'
/** 사이드바 목록에 보일 최근 대화 수 (나머지는 에이전트 화면에서) */
const RECENT = 12

/** 프로젝트 밖 화면의 오른쪽 사이드바 에이전트 */
export function GlobalAgentPanel({ onSaved }: { onSaved(m: string): void }) {
  const [open, setOpenState] = useState<string | null>(() => store.get<string | null>(KEY, null))
  const setOpen = (v: string | null) => { setOpenState(v); store.set(KEY, v) }
  const list = useChatList().data?.chats
  const central = list?.find((c) => c.rid === CENTRAL_RID && !c.archived)
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
          <CentralLine row={central} on={false} onOpen={setOpen} />
          {!!recent.length && <div className="ac-sub-h">{t('최근 대화', 'Recent conversations')}</div>}
          {recent.map((c) => <ChatLine key={c.id} c={c} on={false} onOpen={() => setOpen(c.id)} />)}
        </div>
      </div>
      <div className="ac-compose ac-new-dock"><TalkToCentral onOpened={setOpen} /></div>
    </div>
  )
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
      const c = await agentChatsApi.talk(text.trim())
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
