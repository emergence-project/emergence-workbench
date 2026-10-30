import { describe, expect, it } from 'vitest'
import { findInPage, type TextPiece } from './pdfNav'

const piece = (str: string, x: number, y = 100, h = 10): TextPiece => ({ str, x, y, w: str.length * 5, h })

describe('findInPage', () => {
  it('finds every match, case-insensitively', () => {
    const hits = findInPage([piece('Kempe chain and kempe CHAIN', 0)], 'kempe chain', 3)
    expect(hits).toHaveLength(2)
    expect(hits[0]).toEqual({ page: 3, rects: [[0, 91.5, 55, 10]] })
    expect(hits[1]!.rects[0]![0]).toBe(16 * 5)
  })

  it('joins pieces that split a word and spaces apart distant ones', () => {
    // "Kem" + "pe" touch; "chain" sits a word gap away
    const pieces = [piece('Kem', 0), piece('pe', 15), piece('chain', 40)]
    const hits = findInPage(pieces, 'kempe chain', 1)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.rects).toHaveLength(3)
    expect(findInPage(pieces, 'kem pe', 1)).toHaveLength(0)
  })

  it('treats runs of whitespace as one space and ignores an empty query', () => {
    expect(findInPage([piece('a   planar\tgraph', 0)], 'planar graph', 1)).toHaveLength(1)
    expect(findInPage([piece('anything', 0)], '   ', 1)).toEqual([])
  })

  it('matches across lines', () => {
    const hits = findInPage([piece('separating', 0, 100), piece('cycle', 0, 114)], 'separating cycle', 2)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.rects.map((r) => r[1])).toEqual([91.5, 105.5])
  })
})
