import { describe, expect, it } from 'vitest'
import type { BlockRow, ManuscriptPart } from './api'
import { groupPartProblems } from './partProblems'

const part = (id: string, file = id): ManuscriptPart => ({ id, file, title: id, appendix: false })
const block = (id: string, status?: string, grounds?: string[]): BlockRow => ({ id, status, grounds, alternatives: [], extra: {}, hash: id, mtime: 0 })

describe('manuscript part problems', () => {
  it('shows progress and paused notes while retaining stopped and solved records in order', () => {
    const blocks = ['in-progress', 'stopped', 'blocked', 'solved', 'stopped'].map((status, i) => block(String(i), status, ['chapter.tex']))
    const before = structuredClone(blocks)
    const result = groupPartProblems([part('chapter.tex')], 'chapter.tex', blocks)
    expect(result.open.map((b) => b.id)).toEqual(['0', '2'])
    expect(result.records.map((b) => b.id)).toEqual(['1', '3', '4'])
    expect(result.stopped).toBe(2)
    expect(result.solved).toBe(1)
    expect(blocks).toEqual(before)
    expect([...result.open, ...result.records]).toHaveLength(blocks.length)
    expect(result.records[0]).toBe(blocks[1])
  })

  it('restricts the list to exact grounds in the current file and counts repeated grounds once', () => {
    const parts = [part('one.tex'), part('other.tex')]
    const blocks = [
      block('here', 'blocked', ['one.tex', 'one.tex', 'other.tex']),
      block('other', 'stopped', ['other.tex']),
      block('prefix', 'solved', ['one.tex#not-a-part']),
      block('none', 'in-progress'),
    ]
    const result = groupPartProblems(parts, 'one.tex', blocks)
    expect(result.open.map((b) => b.id)).toEqual(['here'])
    expect(result.records).toEqual([])
    expect(result.stopped + result.solved).toBe(0)
  })

  it('retains section-grounded notes for single-file manuscripts without pulling in another manuscript', () => {
    const parts = [part('main.tex#first', 'main.tex'), part('main.tex#second', 'main.tex'), part('notes.tex#first', 'notes.tex')]
    const blocks = [
      block('first', 'in-progress', ['main.tex#first']),
      block('second', 'solved', ['main.tex#second']),
      block('other', 'blocked', ['notes.tex#first']),
    ]
    const result = groupPartProblems(parts, 'main.tex', blocks)
    expect(result.open.map((b) => b.id)).toEqual(['first'])
    expect(result.records.map((b) => b.id)).toEqual(['second'])
    expect(result.solved).toBe(1)
  })

  it('keeps missing and unrecognized states visible using the existing progress fallback', () => {
    const result = groupPartProblems([part('main.tex')], 'main.tex', [
      block('missing', undefined, ['main.tex']), block('unknown', 'legacy-state', ['main.tex']),
    ])
    expect(result.open.map((b) => b.id)).toEqual(['missing', 'unknown'])
    expect(result.records).toEqual([])
  })

  it('keeps completed-only records accessible and an unrelated file empty', () => {
    const blocks = [block('done', 'solved', ['main.tex'])]
    expect(groupPartProblems([part('main.tex')], 'main.tex', blocks)).toMatchObject({ open: [], records: blocks, stopped: 0, solved: 1 })
    expect(groupPartProblems([part('main.tex')], 'other.tex', blocks)).toEqual({ open: [], records: [], stopped: 0, solved: 0 })
  })
})
