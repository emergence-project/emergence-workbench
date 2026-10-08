import { describe, expect, it } from 'vitest'
import type { CommentEntry } from './api'
import { quotedRecordHighlights, recordRevealRange, recordSelectionFromLines } from './recordHelpers'

const record = (change: Partial<CommentEntry> = {}): CommentEntry => ({
  id: 'r1', kind: '메모', where: '2026-10-06', rects: [], body: '메모 본문', state: null,
  answers: [], quote: '고른 글', color: 'green', line: 7, prefix: '앞 ', suffix: ' 뒤', ...change,
})

describe('record reveal range', () => {
  it('uses a re-anchored line to choose repeated quotes', () => {
    expect(recordRevealRange('앞 글\n뒤 글', { quote: '글', line: 2 })).toEqual({ from: 6, to: 7 })
  })
  it('reveals a legacy line anchor and preserves CRLF offsets', () => {
    expect(recordRevealRange('머리\r\n본문\r\n끝', { line: 2 })).toEqual({ from: 4, to: 6 })
  })
  it('never guesses a lost or missing quote or an out-of-range line', () => {
    expect(recordRevealRange('본문', { quote: '옛 글', line: 1 })).toBeNull()
    expect(recordRevealRange('본문', { quote: '본문', lost: true })).toBeNull()
    expect(recordRevealRange('본문', { line: 2 })).toBeNull()
  })
})

describe('LaTeX selected text', () => {
  it('keeps the selected occurrence and surrounding text from its source line', () => {
    expect(recordSelectionFromLines('반복\n앞 반복 뒤\n끝', { from: 2, text: '반복' })).toEqual({ quote: '반복', line: 2, prefix: '반복\n앞 ', suffix: ' 뒤\n끝' })
  })
  it('uses exact editor offsets for repeated words on the same line', () => {
    expect(recordSelectionFromLines('반복 앞 반복 뒤', { from: 1, start: 5, text: '반복' })).toEqual({ quote: '반복', line: 1, prefix: '반복 앞 ', suffix: ' 뒤' })
  })
  it('matches CodeMirror offsets in a CRLF source without rewriting it', () => {
    const source = '머리\r\n앞 반복 뒤'
    expect(recordSelectionFromLines(source, { from: 2, start: 5, text: '반복' })).toEqual({ quote: '반복', line: 2, prefix: '머리\n앞 ', suffix: ' 뒤' })
    expect(source).toContain('\r\n')
  })
  it('does not attach missing selections or a match on a different line', () => {
    expect(recordSelectionFromLines('앞\n다른 줄', { from: 1, text: '다른' })).toBeUndefined()
    expect(recordSelectionFromLines('앞', null)).toBeUndefined()
  })
})

describe('quoted record highlights', () => {
  it('preserves anchors and colours for every record kind without changing the records', () => {
    const records = ['메모', '할 일', '질문'].map((kind, index) => record({ kind: kind as CommentEntry['kind'], id: `r${index}` }))
    const before = JSON.stringify(records)
    expect(quotedRecordHighlights(records)).toEqual(records.map((entry) => ({
      id: entry.id, rects: [], color: 'green', page: undefined,
      quote: '고른 글', line: 7, prefix: '앞 ', suffix: ' 뒤', lost: undefined,
    })))
    expect(JSON.stringify(records)).toBe(before)
  })
  it('omits unquoted or uncoloured records and retains lost status so painters do not guess', () => {
    expect(quotedRecordHighlights([record({ quote: undefined }), record({ color: undefined })])).toEqual([])
    expect(quotedRecordHighlights([record({ lost: true })])[0]?.lost).toBe(true)
  })
  it('retains PDF geometry', () => {
    expect(quotedRecordHighlights([record({ page: 3, rects: [[1, 2, 3, 4]] })])[0]).toMatchObject({ page: 3, rects: [[1, 2, 3, 4]] })
  })
})
