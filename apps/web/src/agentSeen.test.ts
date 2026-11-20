import { describe, expect, it } from 'vitest'
import { isUnseenIn, seenWith, type Seen } from './agentSeen'

const base: Seen = { since: '2026-11-16T00:00:00Z', ids: {} }
const chat = (o: Partial<{ id: string; state: 'idle' | 'running' | 'waiting' | 'queued' | 'stopped' | 'error'; archived: boolean; updated: string; tasks: number }> = {}) =>
  ({ id: 'a', state: 'idle' as const, archived: false, updated: '2026-11-16T01:00:00Z', ...o })

describe('확인하지 않은 대화', () => {
  it('처음 쓰기 전에 끝난 대화는 본 것으로 친다', () => {
    expect(isUnseenIn(base, chat({ updated: '2026-11-15T23:00:00Z' }))).toBe(false)
    expect(isUnseenIn(base, chat())).toBe(true)
  })
  it('끝난 대화만: 일하는 중 · 백그라운드 명령이 도는 중 · 멈춤 · 보관은 세지 않는다', () => {
    expect(isUnseenIn(base, chat({ state: 'running' }))).toBe(false)
    expect(isUnseenIn(base, chat({ state: 'stopped' }))).toBe(false)
    expect(isUnseenIn(base, chat({ archived: true }))).toBe(false)
    expect(isUnseenIn(base, chat({ tasks: 1 }))).toBe(false)
  })
  it('열어 본 뒤에 다시 바뀌면 다시 확인 안 함', () => {
    const seen = seenWith(base, 'a', '2026-11-16T01:00:00Z')
    expect(isUnseenIn(seen, chat())).toBe(false)
    expect(isUnseenIn(seen, chat({ updated: '2026-11-16T02:00:00Z' }))).toBe(true)
  })
  it('더 오래된 시각으로는 되돌리지 않는다', () => {
    const seen = seenWith(base, 'a', '2026-11-16T02:00:00Z')
    expect(seenWith(seen, 'a', '2026-11-16T01:00:00Z')).toBe(seen)
  })
})
