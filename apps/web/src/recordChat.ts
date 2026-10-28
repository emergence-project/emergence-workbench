import type { ChatRow } from './api/agentChats'

/** 기록의 에이전트 대화가 일하는 중인지 (10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ 1-3): 줄 선 것 · 허락을 기다리는 것도 */
export function liveChat(chat: Pick<ChatRow, 'state'> | undefined): boolean {
  return !!chat && (chat.state === 'running' || chat.state === 'waiting' || chat.state === 'queued')
}

/** 걸린 시간 "0:18" · "12:05" · "1:02:03" (이번 차례를 연 지시부터) */
export function workedFor(since: string | undefined, now: number): string | undefined {
  if (!since) return undefined
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  if (!Number.isFinite(s)) return undefined
  const two = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`
}
