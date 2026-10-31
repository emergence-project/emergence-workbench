import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from './api'
import { newTurns, turnBody } from './feedbackNotify'

const NOW = new Date('2026-10-31T12:00').getTime()
const entry = (key: string, overrides: Partial<FeedbackItem> = {}): FeedbackItem => ({
  key, date: '2026-10-31', time: '10:29', kind: '제안', target: '피드백', text: key, n: 1, ...overrides,
})

describe('피드백 알림 (10/31 시안 7절)', () => {
  const asked = entry('물음', { status: { state: '확인 필요', ask: '권한을 하는 일로 나눌까요?', handled_at: '2026-10-31T11:00' } })
  const waiting = entry('대기')
  it('처음 읽을 때는 알리지 않고, 그 뒤 새로 확인 필요가 된 항목만 한 번 알린다', () => {
    expect(newTurns(null, [asked, waiting], NOW)).toEqual([])
    expect(newTurns(new Set(), [asked, waiting], NOW).map((e) => e.key)).toEqual(['물음'])
    expect(newTurns(new Set(['물음@2026-10-31T11:00']), [asked], NOW)).toEqual([])
  })
  it('다시 처리되어 또 확인 필요가 되면 다시 알린다', () => {
    const again = { ...asked, status: { ...asked.status!, handled_at: '2026-10-31T11:30' } }
    expect(newTurns(new Set(['물음@2026-10-31T11:00']), [again], NOW).map((e) => e.key)).toEqual(['물음'])
  })
  it('알림 글은 상태와 묻는 것', () => {
    expect(turnBody(asked)).toBe('확인 필요 · 권한을 하는 일로 나눌까요?')
  })
})
