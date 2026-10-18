import { t } from './i18n'
import { describe, expect, it } from 'vitest'
import { initials, isoDay, journalWhen, monthDay, recordDay, relativeTime, statusLabel, statusOf } from './format'

describe('format', () => {
  it('모르는 상태는 진행으로 본다', () => {
    expect(statusOf('blocked')).toBe('blocked')
    expect(statusOf('nonsense')).toBe('in-progress')
    expect(statusOf(undefined)).toBe('in-progress')
    expect(statusLabel('solved')).toBeTruthy()
  })

  it('상대 시각', () => {
    const now = new Date(2026, 9, 4, 15, 0).getTime()
    expect(relativeTime(now - 20_000, now)).toBe(t('방금', 'just now'))
    expect(relativeTime(now + 60_000, now)).toBe(t('방금', 'just now'))
    expect(relativeTime(now - 10 * 60_000, now)).toBe('10분 전')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3시간 전')
    expect(relativeTime(new Date(2026, 9, 3, 23, 0).getTime(), now)).toBe('어제')
    expect(relativeTime(new Date(2026, 8, 27, 9, 0).getTime(), now)).toBe('9/27')
  })

  it('일지 날짜', () => {
    const now = new Date(2026, 9, 4, 9, 0)
    expect(journalWhen('2026-10-04', '14:20', now)).toBe('오늘 14:20')
    expect(journalWhen('2026-10-03', '09:05', now)).toBe('어제 09:05')
    expect(journalWhen('2026-09-27', '09:05', now)).toBe('9/27')
  })

  it('프로젝트 머리글자', () => {
    expect(initials('alpha-project')).toBe('AP')
    expect(initials('Example Theory Notes')).toBe('ET')
    expect(initials('graph')).toBe('GR')
    expect(initials('연구 작업대')).toBe('연')
    expect(initials('Beta — Euler characteristic')).toBe('BE')
    expect(initials('')).toBe('?')
  })

  it('날짜 형식 (현지 날짜 · 월/일 · 기록 id의 날짜)', () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(monthDay('2026-10-07')).toBe('10/7')
    expect(monthDay('2026-01-05')).toBe('1/5')
    expect(monthDay('2026-10-07', true)).toBe('10/07')
    expect(recordDay('c-20261006-1200')).toBe('2026-10-06')
    expect(recordDay('c-20261006-120030-2')).toBe('2026-10-06')
    expect(recordDay('legacy')).toBe('')
  })
})
