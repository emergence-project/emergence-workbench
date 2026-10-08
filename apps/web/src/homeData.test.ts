import { describe, expect, it } from 'vitest'
import { localDate } from './format'
import { WEEK_DAYS, weekStartOf } from './homeData'

describe('한 일 달력의 주', () => {
  it('일요일에 시작한다 (10/5 피드백)', () => {
    expect(WEEK_DAYS[0]).toBe('일')
    expect(WEEK_DAYS[6]).toBe('토')
    // 2026-10-05는 월요일 → 그 주는 10/4(일)–10/10(토)
    expect(localDate(weekStartOf(new Date(2026, 9, 5, 15, 30)))).toBe('2026-10-04')
    expect(localDate(weekStartOf(new Date(2026, 9, 10, 23, 59)))).toBe('2026-10-04')
    // 일요일은 그날이 주의 첫날
    expect(localDate(weekStartOf(new Date(2026, 9, 11, 0, 5)))).toBe('2026-10-11')
    // 달이 넘어가는 주
    expect(localDate(weekStartOf(new Date(2026, 10, 1)))).toBe('2026-11-01')
    expect(localDate(weekStartOf(new Date(2026, 9, 31)))).toBe('2026-10-25')
  })
})
