import { describe, expect, it } from 'vitest'
import { commonPairs } from './historyPaint'

/** 공통 부분이 가장 긴지 (LCS 길이와 같은지) */
function lcs(a: string[], b: string[]): number {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
  return L[0]![0]!
}

describe('이력 보기의 낱말 비교 (11/16 시안 2절 ③′)', () => {
  it('짝은 같은 낱말이고 순서를 지키며 가장 길다', () => {
    const cases: [string, string][] = [
      ['the plateau appears at one third of the saturation', 'the plateau appears at 1/3 of the saturation'],
      ['a b c', 'a b c'], ['', 'a b'], ['a b', ''], ['a b c d e', 'e d c b a'], ['x a y b z', 'a b c'],
    ]
    for (const [s, t] of cases) {
      const a = s ? s.split(' ') : [], b = t ? t.split(' ') : []
      const p = commonPairs(a, b)!
      expect(p.every(([i, j]) => a[i] === b[j])).toBe(true)
      expect(p.every(([i, j], k) => k === 0 || (i > p[k - 1]![0] && j > p[k - 1]![1]))).toBe(true)
      expect(p.length).toBe(lcs(a, b))
    }
  })
  it('바뀐 것이 한도를 넘으면 null (칠하지 않는다)', () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`), b = Array.from({ length: 50 }, (_, i) => `b${i}`)
    expect(commonPairs(a, b, 10)).toBeNull()
    expect(commonPairs(a, b, 100)).toEqual([])
  })
})
