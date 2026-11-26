import { describe, expect, it } from 'vitest'
import { turnParts } from './turnCounts'

describe('프로젝트의 내 차례 수: 한 가지는 한 줄에서만 센다 (11/26)', () => {
  it('기록 줄은 흐름 결정을 더하지 않는다: 흐름은 흐름 줄에서만', () => {
    const p = turnParts({ ask: 3, task: 1, flow: 1, edit: 0 })
    expect(p).toEqual({ records: 4, flow: 1, edit: 0, total: 5 })
  })
  it('줄의 합이 전체(레일의 프로젝트 배지 · 탭 「내 차례」)와 같다', () => {
    const p = turnParts({ ask: 2, task: 3, flow: 4, edit: 5, review: 1 })
    expect(p.records + p.flow + p.edit).toBe(p.total)
    expect(p.total).toBe(15)
  })
})
