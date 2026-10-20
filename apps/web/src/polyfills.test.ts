import { describe, expect, it } from 'vitest'

describe('Math.sumPrecise 채우기', () => {
  it('브라우저에 없을 때 채운 함수가 명세처럼 더한다', async () => {
    const M = Math as { sumPrecise?: (xs: Iterable<number>) => number }
    const own = M.sumPrecise
    delete M.sumPrecise
    try {
      await import('./polyfills')
      const f = M.sumPrecise!
      expect(Object.is(f([]), -0)).toBe(true)
      expect(f([0.1, 0.2, 0.3])).toBe(0.6)
      expect(f([1e20, 0.1, -1e20])).toBe(0.1)
      expect(f([1, Infinity])).toBe(Infinity)
      expect(f([-0, -0])).toBe(-0)
      expect(() => f(['1' as unknown as number])).toThrow(TypeError)
    } finally {
      if (own) M.sumPrecise = own
    }
  })
})
