import { describe, expect, it } from 'vitest'
import { editNotes } from './editNotes'

describe('edit notes (10/20 18:01)', () => {
  it('drops empty, repeated and per-change reasons, keeps the order written', () => {
    const hunks = [{ reason: { reason: '부호를 원문에 맞춤', at: 't' } }, {}]
    expect(editNotes(['  ', '절 3 정리', '부호를  원문에 맞춤', '절 3 정리 ', '그림 번호 고침'], hunks)).toEqual(['절 3 정리', '그림 번호 고침'])
    expect(editNotes([], hunks)).toEqual([])
  })
})
