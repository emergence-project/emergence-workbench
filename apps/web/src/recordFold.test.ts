import { describe, expect, it } from 'vitest'
import { foldedCount, recordOpenKey } from './recordFold'

describe('foldedCount (기록 줄의 대화 접기)', () => {
  it('답이 둘 이상이면 마지막 답만 남기고 앞의 답을 접는다', () => {
    expect(foldedCount(4, false)).toBe(3)
    expect(foldedCount(2, false)).toBe(1)
  })
  it('답이 하나 이하이거나 펼쳤으면 접지 않는다', () => {
    expect(foldedCount(1, false)).toBe(0)
    expect(foldedCount(0, false)).toBe(0)
    expect(foldedCount(4, true)).toBe(0)
  })
  it('기억하는 이름은 프로젝트 · 대상 · 기록마다 다르다', () => {
    expect(recordOpenKey('r', 'note-a', 'c-1')).not.toBe(recordOpenKey('r', 'note-b', 'c-1'))
  })
})
