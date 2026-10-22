import { describe, expect, it } from 'vitest'
import { feedbackSummary, feedbackWhen, hasFeedbackList, ISSUE_URL_MAX, issueDraftUrl, issuesDraftUrl } from './feedbackFormat'

describe('feedbackSummary', () => {
  it('separates every list item, including nested and numbered items', () => {
    expect(feedbackSummary('- 첫 항목\n  - 하위 항목\n    * 더 아래\n1. 번호 항목\n2) 다음 번호')).toBe('첫 항목 · 하위 항목 · 더 아래 · 번호 항목 · 다음 번호')
  })

  it('ignores empty lines and normalizes whitespace without removing inline hyphens', () => {
    expect(feedbackSummary(' \r\n-  a - b\r\n\r\n\t* c\t d\r\n')).toBe('a - b · c d')
    expect(feedbackSummary(' -2는 음수, **강조**는 그대로 ')).toBe('-2는 음수, **강조**는 그대로')
    expect(feedbackSummary(' \n\t')).toBe('')
  })
})

describe('feedbackWhen', () => {
  it('omits only the current year and keeps the same month-day and time form', () => {
    expect(feedbackWhen('2026-10-04', '09:30', 2026)).toBe('10-04 09:30')
    expect(feedbackWhen('2025-10-04', '09:30', 2026)).toBe('2025-10-04 09:30')
    expect(feedbackWhen('2027-01-01', '00:00', 2026)).toBe('2027-01-01 00:00')
  })
})

describe('hasFeedbackList', () => {
  it('follows MemoText list syntax, including indented and numbered lists', () => {
    for (const text of ['- 항목', '설명\n  * 하위', '1. 번호', '\t2) 번호']) expect(hasFeedbackList(text)).toBe(true)
    for (const text of ['', '일반 문장', 'a - b', '-2는 음수', '*강조*', '-']) expect(hasFeedbackList(text)).toBe(false)
  })
})

describe('issueDraftUrl', () => {
  it('prefills the bug form fields by id and leaves the picture out', () => {
    const url = new URL(issueDraftUrl('https://github.com/o/r/issues/new', {
      text: '- 칩이 너무 작다\n- 글자가 겹친다', area: '블록 › 속성 표', snippet: '다른 시도', route: '#/r/x', version: 'abc1234', environment: '1440×900 · 라이트',
    }))
    const q = url.searchParams
    expect(url.origin + url.pathname).toBe('https://github.com/o/r/issues/new')
    expect(q.get('template')).toBe('bug.yml')
    expect(q.get('title')).toBe('칩이 너무 작다')
    expect(q.get('what')).toBe('- 칩이 너무 작다\n- 글자가 겹친다\n\n> 다른 시도')
    expect(q.get('area')).toBe('블록 › 속성 표')
    expect(q.get('route')).toBe('#/r/x')
    expect(q.get('version')).toBe('abc1234')
    expect(q.get('environment')).toBe('1440×900 · 라이트')
    expect([...q.keys()]).not.toContain('image')
  })

  it('shortens a long title and skips a missing version', () => {
    const q = new URL(issueDraftUrl('https://x/issues/new', { text: 'a'.repeat(100), area: 'p', route: '#/', version: null, environment: 'e' })).searchParams
    expect(q.get('title')).toHaveLength(80)
    expect(q.has('version')).toBe(false)
  })
})

describe('issuesDraftUrl', () => {
  const item = (i: number, text = `항목 ${i}`) => ({ date: '2026-10-22', time: `10:0${i}`, kind: '수정', text, area: `부위 ${i}`, route: '#/r/x', version: 'abc1234' })
  it('numbers the picked items in one bug form', () => {
    const { url, included } = issuesDraftUrl('https://github.com/o/r/issues/new', [item(1), item(2)], '맥')
    const q = new URL(url).searchParams
    expect(included).toBe(2)
    expect(q.get('title')).toBe('피드백 2개 (2026-10-22)')
    expect(q.get('what')).toBe('1. [수정] 항목 1\n   (2026-10-22 10:01 · 부위 1 · #/r/x · v abc1234)\n\n2. [수정] 항목 2\n   (2026-10-22 10:02 · 부위 2 · #/r/x · v abc1234)')
    expect(q.get('area')).toBe('부위 1, 부위 2')
    expect(q.get('version')).toBe('abc1234')
  })
  it('stops before the address gets too long', () => {
    const long = Array.from({ length: 9 }, (_, i) => item(i, '가'.repeat(300)))
    const { url, included } = issuesDraftUrl('https://github.com/o/r/issues/new', long, '맥')
    expect(included).toBeLessThan(9)
    expect(url.length).toBeLessThanOrEqual(ISSUE_URL_MAX)
  })
})
