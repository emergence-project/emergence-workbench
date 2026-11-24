/*
 * 확인하지 않은 대화 (11/16 피드백 「내가 확인하지 않은 대화를 알림을 뜨게해줘」).
 * 끝난 대화를 열어 본 마지막 시각을 이 브라우저에 남기고, 그 뒤에 바뀐 끝난 대화를 「확인 안 함」으로 센다.
 * 처음 쓰는 날(since) 전의 대화는 이미 본 것으로 친다.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { ChatRow, ChatState } from './api/agentChats'
import { store } from './store'

/** 차례는 끝났지만 백그라운드 명령이 돌아 끝나면 저절로 이어 갈 대화: 「종료」가 아니라 「작업 중」으로 보인다 (11/20 피드백). 넓은 대화 머리는 「작업 중」만 보이고 명령 수는 제목 아래 줄에 둔다(긴 상태 글이 제목을 누르지 않게) */
export const inBackground = (c: Pick<ChatRow, 'state' | 'tasks'>) => c.state === 'idle' && !!c.tasks
/** 표시 상태 (백그라운드 명령이 돌면 작업 중) */
export const shownState = (c: Pick<ChatRow, 'state' | 'tasks'>): ChatState => (inBackground(c) ? 'running' : c.state)

const KEY = 'rw-agent-seen'
const MAX = 400
export type Seen = { since: string; ids: Record<string, string> }

/** 순수 판단: 보관하지 않은 끝난 대화가 마지막으로 본 뒤에 바뀌었는가 (백그라운드 명령이 도는 대화는 아직 끝나지 않은 것) */
export const isUnseenIn = (seen: Seen, c: Pick<ChatRow, 'id' | 'state' | 'archived' | 'updated' | 'tasks'>) =>
  !c.archived && c.state === 'idle' && !c.tasks && c.updated > (seen.ids[c.id] ?? seen.since)

/** 순수 기록: 이 대화를 updated 시각까지 봤다 (오래된 것부터 MAX개를 넘으면 버린다) */
export function seenWith(seen: Seen, id: string, updated: string): Seen {
  if ((seen.ids[id] ?? '') >= updated) return seen
  const ids = Object.fromEntries([...Object.entries(seen.ids).filter(([k]) => k !== id), [id, updated] as const].slice(-MAX))
  return { ...seen, ids }
}

let current: Seen | null = null
const listeners = new Set<() => void>()
const read = (): Seen => {
  if (current) return current
  const got = store.get<Seen | null>(KEY, null)
  current = got && typeof got.since === 'string' ? got : { since: new Date().toISOString(), ids: {} }
  if (!got) store.set(KEY, current)
  return current
}
// 다른 창(탭)에서 본 것도 따라간다
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { current = null; listeners.forEach((f) => f()) } })

export const isUnseen = (c: ChatRow) => isUnseenIn(read(), c)
/** 에이전트가 묻고 끝낸 대화: 읽기만 해서는 풀리지 않고 답해야 풀린다 (11/24, 서버의 asks) */
export const asksMe = (c: Partial<Pick<ChatRow, 'asks' | 'archived'>>) => !!c.asks && !c.archived
/** 사용자 차례: 허락 · 계획을 기다리거나 오류로 멈춘 대화, 에이전트가 묻고 끝낸 대화, 끝났는데 아직 열어 보지 않은 대화 */
export const myTurn = (c: ChatRow) => c.state === 'waiting' || (c.state === 'error' && !c.archived) || asksMe(c) || isUnseen(c)
export function markSeen(id: string, updated: string) {
  const next = seenWith(read(), id, updated)
  if (next === current) return
  current = next
  store.set(KEY, next)
  listeners.forEach((f) => f())
}
/** 본 기록이 바뀌면 다시 그린다 */
export const useSeen = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, read)

/** 대화 화면이 떠 있고 창을 보고 있을 때 본 것으로 남긴다 (창을 보지 않으면 다시 볼 때) */
export function useMarkSeen(id: string, updated: string | undefined) {
  useEffect(() => {
    if (!updated) return
    const mark = () => markSeen(id, updated)
    if (document.hasFocus()) { mark(); return }
    window.addEventListener('focus', mark, { once: true })
    return () => window.removeEventListener('focus', mark)
  }, [id, updated])
}
