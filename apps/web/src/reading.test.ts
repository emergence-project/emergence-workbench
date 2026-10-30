import { describe, expect, it } from 'vitest'
import type { CommentEntry, NoteHighlight } from './api'
import { readingGroups, readingMarkdown } from './reading'

const rec = (id: string, kind: CommentEntry['kind'], extra: Partial<CommentEntry> = {}): CommentEntry =>
  ({ id, kind, where: '', rects: [], body: '', state: null, answers: [], ...extra })
const hl = (id: string, page: number, quote: string, y: number): NoteHighlight =>
  ({ ...rec(id, '하이라이트', { page, quote, rects: [[10, y, 50, 10]] }), kind: '하이라이트', color: 'green' })

describe('readingGroups', () => {
  it('groups records on the same passage, keeps highlight-only spots, sorts by page then height', () => {
    const groups = readingGroups({
      highlights: [hl('h1', 2, 'late passage', 300), hl('h2', 1, 'separating  cycle', 120)],
      comments: [
        rec('c1', '메모', { page: 1, quote: 'separating cycle', rects: [[10, 120, 50, 10]], body: 'why five', color: 'yellow' }),
        rec('c2', '질문', { page: 1, quote: 'separating cycle ', rects: [[10, 120, 50, 10]], body: 'same definition?' }),
        rec('c3', '메모', { body: 'compare with our note' }),
        rec('c4', '질문', { page: 1, quote: 'first line', rects: [[10, 40, 50, 10]], body: 'optimal?' }),
      ],
    })
    expect(groups.map((g) => g.key)).toEqual(['whole', '1|first line', '1|separating cycle', '2|late passage'])
    const pair = groups[2]!
    expect(pair.items.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(pair.highlightId).toBe('h2')
    expect(pair.color).toBe('green')
    expect(groups[3]!.items).toEqual([])
  })

  it('writes Markdown in page order with answers', () => {
    const groups = readingGroups({
      highlights: [],
      comments: [rec('c1', '질문', { page: 3, quote: 'bound', rects: [[0, 0, 1, 1]], body: 'optimal?', answers: [{ by: 'claude', at: '', body: 'yes' }] })],
    })
    const md = readingMarkdown('Paper', groups)
    expect(md).toContain('## 3쪽')
    expect(md).toContain('> bound')
    expect(md).toContain('- **질문** optimal?')
    expect(md).toContain('  - 답 (claude): yes')
  })
})
