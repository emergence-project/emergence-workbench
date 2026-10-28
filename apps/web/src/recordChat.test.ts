import { describe, expect, it } from 'vitest'
import { liveChat, workedFor } from './recordChat'

describe('기록의 에이전트 대화', () => {
  it('일하는 중 · 허락 기다림 · 줄 섬만 일하는 중으로 본다', () => {
    expect(liveChat({ state: 'running' })).toBe(true)
    expect(liveChat({ state: 'waiting' })).toBe(true)
    expect(liveChat({ state: 'queued' })).toBe(true)
    expect(liveChat({ state: 'idle' })).toBe(false)
    expect(liveChat({ state: 'stopped' })).toBe(false)
    expect(liveChat(undefined)).toBe(false)
  })
  it('걸린 시간을 분:초로', () => {
    const t0 = Date.parse('2026-10-28T12:00:00Z')
    expect(workedFor('2026-10-28T12:00:00Z', t0 + 18_000)).toBe('0:18')
    expect(workedFor('2026-10-28T12:00:00Z', t0 + 725_000)).toBe('12:05')
    expect(workedFor('2026-10-28T12:00:00Z', t0 + 3_723_000)).toBe('1:02:03')
    expect(workedFor(undefined, t0)).toBeUndefined()
  })
})
