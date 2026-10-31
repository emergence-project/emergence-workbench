import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { userTurn } from '@rw/core'
import { api, type FeedbackItem } from './api'
import { notifyPermission } from './AgentChats'
import { t } from './i18n'
import { qk } from './queries'
import { go } from './router'
import { store } from './store'

// ---------- 피드백 알림 (10/31 시안 7절, 피드백 10/30 23:58): 새로 「확인 필요」가 된 항목마다 한 번 맥 알림 ----------

const KEY = 'rw-feedback-notify'
/** 피드백 알림을 켰는가 (설정 › 에이전트 › 알림, 기본 켬) */
export const feedbackNotifyOn = () => store.get<boolean>(KEY, true)
export const setFeedbackNotifyOn = (v: boolean) => store.set(KEY, v)

/** 피드백 화면과 같은 키라 요청 하나를 나눠 쓴다 (FeedbackPage FEEDBACK_ALL) */
const FEEDBACK_ALL = [...qk.feedback, 'all'] as const

/** 내 차례 하나의 표: 같은 항목이 다시 처리되어(handled_at이 바뀌어) 또 내 차례가 되면 새 표 */
const turnKey = (e: FeedbackItem) => `${e.key}@${e.status?.handled_at ?? ''}`

/** 지난번에 없던 내 차례 (처음 읽을 때는 알리지 않는다: before가 null) */
export function newTurns(before: Set<string> | null, entries: FeedbackItem[], now = Date.now()): FeedbackItem[] {
  if (!before) return []
  return entries.filter((e) => userTurn(e, now) && !before.has(turnKey(e)))
}

/** 알림 글: 묻는 것이 있으면 그것, 없으면 처리 첫 줄이나 교정한 원문 */
export function turnBody(e: FeedbackItem): string {
  const s = e.status
  const line = (s?.ask || s?.note?.split('\n')[0] || s?.clean || e.text).replace(/\s+/g, ' ')
  return `${s?.state ?? t('대기', 'Waiting')} · ${line.slice(0, 140)}`
}

/** 피드백 목록을 보고 새 내 차례를 알린다. 창을 보고 있으면 알리지 않는다(레일의 수가 보인다). 알림을 누르면 피드백 화면(확인 필요가 먼저 열린다) */
export function useFeedbackNotify(): void {
  const all = useQuery({ queryKey: FEEDBACK_ALL, queryFn: () => api.feedbackAll() })
  const entries = all.data?.enabled ? all.data.entries : undefined
  const last = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!entries) return
    const fresh = newTurns(last.current, entries)
    last.current = new Set(entries.filter((e) => userTurn(e)).map(turnKey))
    if (!fresh.length || !feedbackNotifyOn() || notifyPermission() !== 'granted' || (document.hasFocus() && !document.hidden)) return
    for (const e of fresh) {
      const n = new Notification(t('피드백 확인 필요', 'Feedback needs review'), { body: turnBody(e), tag: `feedback-${e.key}` })
      n.onclick = () => { window.focus(); go({ page: 'feedback' }); n.close() }
    }
  }, [entries])
}
