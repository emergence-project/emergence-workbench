import { describe, expect, it } from 'vitest'
import { dayOf, mergeRecent, shortSubject } from './knowledgeRecent'

describe('지식 첫 화면 최근 노트', () => {
  it('고친 것과 연 것을 합쳐 늦은 순으로, 같은 노트는 늦은 쪽 하나', () => {
    const edited = [
      { id: 'a', title: 'A', subject: 'X', mtime: 100 },
      { id: 'b', title: 'B', subject: '', mtime: 300 },
    ]
    const rows = [{ id: 'a', title: 'A', subject: 'X' }, { id: 'c', title: 'C', subject: '' }, { id: 'b', title: 'B', subject: '' }]
    const opened = [{ id: 'a', at: 200 }, { id: 'b', at: 250 }, { id: 'gone', at: 999 }, { id: 'c' }]
    const r = mergeRecent(edited, rows, opened, 3)
    expect(r.map((x) => [x.id, x.kind])).toEqual([['b', 'edited'], ['a', 'opened'], ['c', 'opened']])
    expect(mergeRecent(edited, rows, opened, 1).map((x) => x.id)).toEqual(['b'])
  })
  it('날짜와 긴 분류를 줄인다', () => {
    const now = new Date(2026, 9, 6, 12).getTime()
    expect(dayOf(now - 3_600_000, now)).toBe('오늘')
    expect(dayOf(now - 86_400_000, now)).toBe('어제')
    expect(dayOf(new Date(2026, 8, 27).getTime(), now)).toBe('9/27')
    expect(shortSubject('Mathematics › GT › Map Coloring')).toBe('Mathematics › … › Map Coloring')
    expect(shortSubject('Mathematics › GT')).toBe('Mathematics › GT')
    expect(shortSubject('')).toBe('')
  })
})
