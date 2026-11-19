// 피드백 항목의 에이전트 줄 (맡기기 단추 · 맡은 대화 · 답하는 중). FeedbackPage.tsx가 길어 나눴다
import { agentTurns, localDate, localTime } from '@rw/core'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedbackItem } from './api'
import { agentChatsApi, type ChatRow } from './api/agentChats'
import { ChatStateMark, isLive, stateName as chatStateName } from './AgentChats'
import { Icon } from './icons'
import { t } from './i18n'
import { qk } from './queries'
import { href } from './router'

/**
 * 피드백을 맡은 에이전트 대화 (2단계 나, 10/21 "앱 안 대화", 10/22 "권한 넓히기"): 맡긴 시각 · 상태 · PR · 대화 보기 · 멈추기.
 * 맡은 대화가 없거나 끝난 뒤 다시 에이전트 차례가 되면 「에이전트에게 맡기기」. 앱 저장소가 있는 맥에서만 보인다.
 * 버튼은 항목 머리 줄 오른쪽(part "button"), 대화 줄은 대화가 있을 때만 본문 아래(part "line") (10/28 07:38).
 * 사용자가 그 뒤에 답했으면(승인 · 수정 · 진행 · 중단) 지난 대화 줄은 감춘다.
 * 대화가 일하는 중이면 그 줄은 본문 아래가 아니라 주고받은 대화 맨 아래에 「답하는 중 · 대화 보기」로(part "replying", 11/20 논의).
 */
export function AgentLine({ e, part }: { e: FeedbackItem; part: 'button' | 'line' | 'replying' }) {
  const client = useQueryClient()
  const list = useQuery({ queryKey: qk.agentChatList(), queryFn: () => agentChatsApi.list() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!list.data?.app) return null
  const chat: ChatRow | undefined = list.data.chats.find((c) => c.feedback === e.key || !!c.bundle?.includes(e.key))
  const live = !!chat && isLive(chat.state)
  const turn = agentTurns(e).length > 0
  const answeredAfter = !!chat && !!e.review && new Date(e.review.at).getTime() > new Date(chat.updated).getTime()
  const showChat = !!chat && (live || !answeredAfter)
  const canHand = turn && !live && list.data.handOff
  if (part === 'button' ? !canHand : part === 'replying' ? !live : !showChat || live) return null
  const handOff = async () => {
    setBusy(true); setError('')
    try {
      await agentChatsApi.handOff(e.key)
      await client.invalidateQueries({ queryKey: qk.agentChats })
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const handed = chat && new Date(chat.handed ?? chat.created)
  const stop = () => void agentChatsApi.stop(chat!.id).then(() => client.invalidateQueries({ queryKey: qk.agentChats }), (err: Error) => setError(err.message))
  if (part === 'button') return (
    <>
      {error && <span className="error-text fbp-agent-error" role="alert">{error}</span>}
      {/* 고치기 · 지우기처럼 마우스를 올릴 때만 보이는 아이콘 (10/28 20:08 반려) */}
      <button type="button" className="icon-btn fbp-hand hover-actions" data-ui="에이전트에게 맡기기" disabled={busy} aria-label={t('에이전트에게 맡기기', 'Hand to agent')} title={t('에이전트에게 맡기기: 이 피드백을 이 맥의 Claude에게 맡깁니다. 따로 둔 작업 폴더에서 고치고 시험한 뒤 PR을 엽니다', 'Hand to agent: Claude on this Mac fixes and tests it in a separate work folder, then opens a PR')} onClick={() => void handOff()}>{Icon.spark}</button>
    </>
  )
  if (part === 'replying') return (
    <div className="fbp-agent fbp-replying" data-ui="답하는 중">
      <ChatStateMark state={chat!.state} label name={chat!.state === 'running' ? t('답하는 중', 'Replying') : chatStateName(chat!)} />
      <a className="a" data-ui="대화 보기" href={href({ page: 'agent', id: chat!.id })}>{t('대화 보기', 'Open conversation')}</a>
      <button type="button" className="fb-link" data-ui="대화 멈추기" onClick={stop}>{t('멈추기', 'Stop')}</button>
      {error && <span className="error-text fbp-agent-error">{error}</span>}
    </div>
  )
  return (
    <div className="fbp-agent" data-ui="에이전트 진행">
      <ChatStateMark state={chat!.state} label name={chatStateName(chat!)} />
      <span className="muted">{t('맡김', 'Handed off')} {localDate(handed!).slice(5)} {localTime(handed!)}</span>
      {chat!.pr && <a className="a" data-ui="대화 PR" href={chat!.pr.url} target="_blank" rel="noreferrer">PR #{chat!.pr.number}</a>}
      <a className="a" data-ui="대화 보기" href={href({ page: 'agent', id: chat!.id })}>{t('대화 보기', 'Open conversation')}</a>
      {live && <button type="button" className="fb-link" data-ui="대화 멈추기" onClick={stop}>{t('멈추기', 'Stop')}</button>}
      {error && <span className="error-text fbp-agent-error">{error}</span>}
    </div>
  )
}
