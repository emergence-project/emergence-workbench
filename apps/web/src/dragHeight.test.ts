import { describe, expect, it } from 'vitest'
import { clampDragHeight } from './dragHeight'

describe('clampDragHeight', () => {
  it('keeps a height inside the available range', () => {
    expect(clampDragHeight(240, 80, 600)).toBe(240)
  })

  it('clamps saved or dragged heights at both ends', () => {
    expect(clampDragHeight(-20, 80, 600)).toBe(80)
    expect(clampDragHeight(900, 80, 600)).toBe(600)
  })

  it('fits a saved height after the sidebar gets shorter', () => {
    expect(clampDragHeight(500, 80, 300)).toBe(300)
  })

  it('uses the default for invalid storage and still bounds that default', () => {
    expect(clampDragHeight(Number.NaN, 80, 600, 240)).toBe(240)
    expect(clampDragHeight(Number.POSITIVE_INFINITY, 80, 180, 240)).toBe(180)
    expect(clampDragHeight(Number.NEGATIVE_INFINITY, 80, 600)).toBe(80)
  })

  it('keeps the minimum when the available maximum falls below it', () => {
    expect(clampDragHeight(240, 80, 40)).toBe(80)
  })
})
