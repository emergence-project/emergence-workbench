import { describe, expect, it } from 'vitest'
import { tipPlace } from './tipPlace'

const box = { top: 0, left: 0, bottom: 700, right: 1200 }
const tip = { width: 100, height: 20 }
const at = (left: number, top: number, w = 24, h = 24) => ({ left, top, right: left + w, bottom: top + h })

describe('tipPlace', () => {
  it('leaves a tooltip that fits below and centered', () => {
    expect(tipPlace(at(500, 300), tip, box)).toEqual({ up: false, x: null })
  })
  it('moves up at the bottom edge, but only when there is room above', () => {
    expect(tipPlace(at(500, 670), tip, box).up).toBe(true)
    expect(tipPlace(at(500, 5, 24, 690), tip, box).up).toBe(false)
  })
  it('aligns to the edge it would cross', () => {
    expect(tipPlace(at(1170, 300), tip, box).x).toBe('end')
    expect(tipPlace(at(4, 300), tip, box).x).toBe('start')
  })
  it('respects the clipping panel, not only the window', () => {
    expect(tipPlace(at(500, 300), tip, { top: 0, left: 480, bottom: 330, right: 800 })).toEqual({ up: true, x: 'start' })
  })
  it('keeps a chosen alignment that fits and flips one that does not', () => {
    expect(tipPlace(at(1170, 300), tip, box, 'end').x).toBe(null)
    expect(tipPlace(at(1170, 300), tip, box, 'start').x).toBe('end')
    expect(tipPlace(at(4, 300), tip, box, 'end').x).toBe('start')
  })
  it('falls back to the left edge when wider than the box', () => {
    expect(tipPlace(at(40, 300), { width: 400, height: 20 }, { top: 0, left: 0, bottom: 700, right: 300 }).x).toBe('start')
  })
})
