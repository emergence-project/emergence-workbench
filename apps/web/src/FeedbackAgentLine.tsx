// 피드백 항목의 「에이전트에게 맡기기」와 맡은 대화 찾기. FeedbackPage.tsx가 길어 나눴다
import { agentTurns } from '@rw/core'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedbackItem } from './api'
import { agentChatsApi, type ChatRow } from './api/agentChats'
import { isLive } from './AgentChats'
import { Icon } from './icons'
import { HERE, t } from './i18n'
import { qk } from './queries'

/** 피드백 항목을 맡은 대화와 그 상태. 사용자가 그 뒤에 답했으면(승인 · 수정 · 진행 · 중단) 지난 대화는 보이지 않는다(show) */
export function useFeedbackChat(e: FeedbackItem) {
  const list = useQuery({ queryKey: qk.agentChatList(), queryFn: () => agentChatsApi.list() })
  const chat: ChatRow | undefined = list.data?.chats.find((c) => c.feedback === e.key || !!c.bundle?.includes(e.key))
  const live = !!chat && isLive(chat.state)
  const answeredAfter = !!chat && !!e.review && new Date(e.review.at).getTime() > new Date(chat.updated).getTime()
  return { list: list.data, chat, live, show: !!list.data?.app && !!chat && (live || !answeredAfter) }
}

/**
 * 「에이전트에게 맡기기」 (2단계 나, 10/21 "앱 안 대화", 10/22 "권한 넓히기"): 맡은 대화가 없거나 끝난 뒤 다시 에이전트 차례가 되면.
 * 앱 저장소가 있는 맥에서만 보인다. 항목 머리 줄 오른쪽 (10/28 07:38). 맡은 대화 자체는 주고받은 대화 옆에 (FeedbackChat.tsx, 11/23)
 */
export function AgentLine({ e }: { e: FeedbackItem }) {
  const client = useQueryClient()
  const { list, live } = useFeedbackChat(e)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!list?.app) return null
  const turn = agentTurns(e).length > 0
  if (!(turn && !live && list.handOff)) return null
  const handOff = async () => {
    setBusy(true); setError('')
    try {
      await agentChatsApi.handOff(e.key)
      await client.invalidateQueries({ queryKey: qk.agentChats })
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return (
    <>
      {error && <span className="error-text fbp-agent-error" role="alert">{error}</span>}
      {/* 고치기 · 지우기처럼 마우스를 올릴 때만 보이는 아이콘 (10/28 20:08 반려) */}
      <button type="button" className="icon-btn fbp-hand hover-actions" data-ui="에이전트에게 맡기기" disabled={busy} aria-label={t('에이전트에게 맡기기', 'Hand to agent')} title={t(`에이전트에게 맡기기: 이 피드백을 ${HERE.ko}의 Claude에게 맡깁니다. 따로 둔 작업 폴더에서 고치고 시험한 뒤 PR을 엽니다`, `Hand to agent: Claude on ${HERE.en} fixes and tests it in a separate work folder, then opens a PR`)} onClick={() => void handOff()}>{Icon.spark}</button>
    </>
  )
}
