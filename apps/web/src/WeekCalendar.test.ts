import { describe, expect, it } from 'vitest'
import { gcalDay } from './WeekCalendar'
import type { GoogleEvent } from './api'

const ev = (id: string, date: string, endDate: string): GoogleEvent => ({ id, calendar: '기본', title: id, date, endDate })

describe('한 일 달력의 구글 일정', () => {
  it('여러 날 일정은 시작한 날에만 다 보이고 나머지 날은 이어 보인다', () => {
    const list = [ev('학회', '2026-10-26', '2026-10-28')]
    expect(gcalDay(list, '2026-10-26', '2026-10-25')).toEqual([{ e: list[0], cont: false }])
    expect(gcalDay(list, '2026-10-27', '2026-10-25')).toEqual([{ e: list[0], cont: true }])
    expect(gcalDay(list, '2026-10-29', '2026-10-25')).toEqual([])
  })
  it('이 주보다 먼저 시작한 일정은 이 주 첫날에 다 보인다', () => {
    const list = [ev('출장', '2026-10-30', '2026-11-03')]
    expect(gcalDay(list, '2026-11-01', '2026-11-01')[0]!.cont).toBe(false)
    expect(gcalDay(list, '2026-11-02', '2026-11-01')[0]!.cont).toBe(true)
  })
})
