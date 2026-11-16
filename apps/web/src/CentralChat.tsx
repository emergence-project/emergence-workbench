// 중앙 대화 (11/16 사용자 결정 "중앙 에이전트", 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG §2):
// 대화 목록 맨 위에 고정한 「중앙」 줄, 처음 말하는 화면, 중앙 대화 안의 하위 대화 줄. 하위 대화는 보통 대화와 같은 화면으로 연다
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, api, APP_RID, type CentralKid, type ChatRow } from './api'
import { ChatStateMark, stateName } from './AgentChats'
import { t } from './i18n'
import { qk } from './queries'
import { go } from './router'

/** 중앙 대화가 아직 없을 때 여는 화면의 주소 id (#/agent/central) */
export const CENTRAL_PAGE = 'central'

const useCentral = () => useQuery({ queryKey: qk.agentCentral, queryFn: () => agentChatsApi.central() })
const mine = (k: Pick<CentralKid, 'state'>) => k.state === 'waiting' || k.state === 'error'

/** 대화 목록 맨 위의 「중앙」 줄: 하위 대화 수와 내 차례 수 */
export function CentralLine({ row, on }: { row?: ChatRow; on: boolean }) {
  const kids = (useCentral().data?.kids ?? []).filter((k) => !k.archived)
  const turn = kids.filter(mine).length
  return (
    <button className={`nav ac-line ac-central${on ? ' on' : ''}`} data-ui="중앙 대화 줄" onClick={() => go({ page: 'agent', id: row?.id ?? CENTRAL_PAGE })}>
      <span className="ac-line-top"><span className="ac-line-dot">{row && <ChatStateMark state={row.state} name={stateName(row)} />}</span><span className="label">{t('중앙', 'Central')}</span></span>
      <span className="ac-line-meta">
        {row ? <>{t(`하위 대화 ${kids.length}`, `${kids.length} sub-conversation${kids.length === 1 ? '' : 's'}`)}{turn > 0 && <> · <span className="ac-central-turn">{t(`내 차례 ${turn}`, `${turn} for you`)}</span></>}</>
          : t('질문 · 앱 고치기 · 프로젝트 작성을 한곳에서', 'Questions, app fixes and project writing in one place')}
      </span>
    </button>
  )
}

/** 중앙 대화가 없을 때: 첫 말을 보내면 중앙을 열고 그 대화로 간다 */
export function CentralStart() {
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
      go({ page: 'agent', id: c.id })
    } catch (e) { setFail((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="scroll"><div className="page-body ac-start" data-ui="중앙 시작">
      <h1 className="ac-h">{t('중앙', 'Central')}</h1>
      <p className="muted ac-central-what">{t(
        '무엇이든 여기에 먼저 말하세요. 질문에는 바로 답하고, 앱 고치기 · 프로젝트 작성 · 피드백 처리는 하위 대화를 열어 맡깁니다. 중앙은 읽기만 하고, 합치기와 다시 시작은 내가 합니다.',
        'Say anything here first. It answers questions directly and hands app fixes, project writing and feedback to sub-conversations. Central only reads; merging and restarting stay with you.',
      )}</p>
      <textarea id="central-first" className="ac-central-input" rows={4} value={text} autoFocus placeholder={t('예: 피드백에서 그림이 안 보인대. 고쳐 줘', 'Example: pictures do not show in feedback. Fix it')}
        aria-label={t('중앙에게 말하기', 'Talk to Central')} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }} />
      <div className="ac-central-send">
        {fail && <span className="error-text">{fail}</span>}
        <button className="btn primary" disabled={!text.trim() || busy} onClick={() => void submit()}>{t('보내기', 'Send')}</button>
      </div>
    </div></div>
  )
}

/** 중앙 대화 위의 하위 대화 줄: 상태 · 이름 · 어디서 · PR · 마지막 글. 닫은 것은 접어 둔다 */
export function CentralKids() {
  const kids = useCentral().data?.kids ?? []
  const projects = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() }).data?.researches
  const [closedOpen, setClosedOpen] = useState(false)
  if (!kids.length) return null
  const open = kids.filter((k) => !k.archived)
  const closed = kids.filter((k) => k.archived)
  const where = (rid: string) => (rid === APP_RID ? t('앱', 'App') : projects?.find((p) => p.id === rid)?.title ?? rid)
  const card = (k: CentralKid) => (
    <button key={k.id} className="ac-kid" data-ui="하위 대화 줄" data-ui-item={k.title} onClick={() => go({ page: 'agent', id: k.id })}>
      <span className="ac-kid-top">
        <span className="ac-line-dot"><ChatStateMark state={k.state} name={stateName(k)} /></span>
        <span className="ac-kid-title">{k.title}</span>
        <span className="ac-kid-open">{t('열기 ›', 'Open ›')}</span>
      </span>
      <span className={`ac-kid-meta${mine(k) ? ' turn' : ''}`}>{[where(k.rid), stateName(k), ...(k.pr ? [`PR #${k.pr.number}${k.merged ? t(' 합침', ' merged') : ''}`] : [])].join(' · ')}</span>
      {(k.summary ?? k.report) && <span className="ac-kid-report">{k.summary ?? k.report}</span>}
    </button>
  )
  return (
    <div className="ac-central-kids" data-ui="하위 대화">
      {open.map(card)}
      {!!closed.length && <button className="a ac-kid-closed" aria-expanded={closedOpen} onClick={() => setClosedOpen(!closedOpen)}>{t(`닫은 대화 ${closed.length}`, `${closed.length} closed`)} {closedOpen ? '‹' : '›'}</button>}
      {closedOpen && closed.map(card)}
    </div>
  )
}
