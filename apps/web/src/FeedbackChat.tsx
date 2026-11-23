// 피드백 항목의 주고받은 대화 옆에 붙는 맡은 에이전트 대화 (11/23 "피드백 옆에 대화", 시안 feedback-chat)
import { localDate, localTime } from '@rw/core'
import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { FeedbackItem } from './api'
import { agentChatsApi, type ChatItem } from './api/agentChats'
import { ChatStateMark, stateName as chatStateName, useChat } from './AgentChats'
import { useFeedbackChat } from './FeedbackAgentLine'
import { feedbackChatPart } from './feedbackChatPart'
import { t } from './i18n'
import { MemoText } from './memo'
import { qk } from './queries'
import { href } from './router'

/** 대화 한 줄로 보일 것: 내 지시 · 에이전트 글 · 도구를 쓴 묶음(한 줄) · 오류 */
type Line = { kind: 'me' | 'text' | 'error'; text: string } | { kind: 'steps'; n: number; last: string; answer?: string }

function linesOf(items: ChatItem[], key: string): Line[] {
  const out: Line[] = []
  for (const it of items) {
    if (it.kind === 'user' && !it.auto) out.push({ kind: 'me', text: it.text })
    else if (it.kind === 'text' && !it.sub && it.text.trim()) out.push({ kind: 'text', text: it.text })
    else if (it.kind === 'error') out.push({ kind: 'error', text: it.text })
    else if (it.kind === 'step' && !it.sub) {
      const prev = out[out.length - 1]
      const answer = it.tool === 'feedback_answer' ? it.summary.replace(`${key} · `, '') : undefined
      const summary = `${it.tool} ${it.summary}`.trim()
      if (prev?.kind === 'steps' && !prev.answer && !answer) { prev.n++; prev.last = summary } else out.push({ kind: 'steps', n: 1, last: summary, answer })
    }
  }
  return out
}

/**
 * 맡은 대화 (11/23): 머리 줄(상태 · 맡김 시각 · PR · 대화 보기 · 일하는 중이면 멈추기)과 그 아래 이 항목 몫의 글.
 * 묶음 대화(피드백 여럿을 한 대화가 맡음)면 feedbackChatPart가 고른 이 항목 몫만. 도구를 쓴 줄은 이어진 것끼리 한 줄로 접는다.
 * open이 아니면(승인 기다림 · 끝나 접힌 항목) 머리 줄만. 일하는 중이면 늘 편다.
 */
export function FeedbackChat({ e, open }: { e: FeedbackItem; open: boolean }) {
  const client = useQueryClient()
  const { chat, live, show } = useFeedbackChat(e)
  const body = show && (open || live)
  const full = useChat(chat?.id ?? '', body).data
  const [error, setError] = useState('')
  if (!show || !chat) return null
  const handed = new Date(chat.handed ?? chat.created)
  const stop = () => void agentChatsApi.stop(chat.id).then(() => client.invalidateQueries({ queryKey: qk.agentChats }), (err: Error) => setError(err.message))
  const bundle = chat.bundle && chat.bundle.length > 1 ? chat.bundle : undefined
  const part = full && feedbackChatPart(full.items, e.key, bundle)
  const lines = part ? linesOf(part.items, e.key) : []
  const line = (l: Line, i: number): ReactNode => l.kind === 'steps'
    ? <li key={i} className="fbc-steps muted">{l.answer !== undefined ? `${t('기록', 'Recorded')} · ${l.answer}` : `${t(`도구 ${l.n}번`, `${l.n} tool use${l.n > 1 ? 's' : ''}`)} · ${l.last}`}</li>
    : <li key={i} className={l.kind === 'me' ? 'fbc-me' : l.kind === 'error' ? 'error-text' : 'fbc-text'}><MemoText text={l.text} /></li>
  return (
    <section className={`fbc${live ? ' fbc-live' : ''}`} data-ui="맡은 대화">
      <div className="fbp-agent fbc-head" data-ui="에이전트 진행">
        <b>{t('맡은 대화', 'Agent conversation')}</b>
        <ChatStateMark state={chat.state} label name={chat.state === 'running' ? t('답하는 중', 'Replying') : chatStateName(chat)} />
        <span className="muted">{t('맡김', 'Handed off')} {localDate(handed).slice(5)} {localTime(handed)}</span>
        {chat.pr && <a className="a" data-ui="대화 PR" href={chat.pr.url} target="_blank" rel="noreferrer">PR #{chat.pr.number}</a>}
        <a className="a" data-ui="대화 보기" href={href({ page: 'agent', id: chat.id })}>{t('대화 보기', 'Open conversation')}</a>
        {live && <button type="button" className="fb-link" data-ui="대화 멈추기" onClick={stop}>{t('멈추기', 'Stop')}</button>}
        {bundle && <span className="muted">{t(`묶음 ${bundle.length}건 중 이 항목 몫`, `This item's part of ${bundle.length} bundled`)}</span>}
        {error && <span className="error-text fbp-agent-error">{error}</span>}
      </div>
      {body && part && (lines.length
        ? <ol className="fbc-items">{lines.map(line)}</ol>
        : <p className="muted fbc-empty">{live ? t('아직 이 항목에 쓴 글이 없습니다', 'Nothing written for this item yet') : t('이 항목에 쓴 글이 없습니다', 'Nothing written for this item')}</p>)}
    </section>
  )
}
