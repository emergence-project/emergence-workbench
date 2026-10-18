import { describe, expect, it } from 'vitest'
import { compactStamp, localDate, localTime, stamp } from './time.js'

describe('현지 날짜·시각 도장', () => {
  const d = new Date(2026, 0, 5, 7, 3) // 현지 2026-01-05 07:03
  it('날짜와 시각은 두 자리로 채운다', () => {
    expect(localDate(d)).toBe('2026-01-05')
    expect(localTime(d)).toBe('07:03')
  })
  it('도장 세 모양은 저장된 모양 그대로다', () => {
    expect(stamp('space', d)).toBe('2026-01-05 07:03')
    expect(stamp('t', d)).toBe('2026-01-05T07:03')
    expect(stamp('compact', d)).toBe('20260105-0703')
  })
  it('있는 날짜·시각을 id 몸으로 바꾸고, 시각이 없으면 앞부분만', () => {
    expect(compactStamp('2026-10-18', '09:30')).toBe('20261018-0930')
    expect(compactStamp('2026-10-18')).toBe('20261018-')
  })
})
