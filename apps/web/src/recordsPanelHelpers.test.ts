import { describe, expect, it } from 'vitest'
import type { CommentEntry } from './api/comments'
import { classifiedRecordCount, filterRecords, recordDate, recordPdfTab, recordRoute, rebaseRecordEdit, filterForActiveRecord } from './recordsPanelHelpers'
import { normalizeRightMode } from './noteScreen'
const entry = (kind: CommentEntry['kind'], rest: Partial<CommentEntry> = {}): CommentEntry => ({ id: 'c-20261006-1200', kind, body: 'text', where: '전체', rects: [], state: null, answers: [], ...rest })

describe('sidebar records', () => {
  it('counts classified source records without counting split children or concurrently changed records', () => {
    const memo = entry('메모', { id: 'memo', unsorted: true })
    const split = entry('메모', { id: 'split', unsorted: true })
    const changed = entry('메모', { id: 'changed', unsorted: true })
    const removed = entry('메모', { id: 'removed', unsorted: true })
    const pending = entry('메모', { id: 'pending', unsorted: true })
    const sorted = entry('메모', { id: 'sorted' })
    expect(classifiedRecordCount([memo, split, changed, removed, pending, sorted], [
      { ...memo, kind: '할 일', unsorted: undefined }, { ...split, split: true, unsorted: undefined },
      { ...changed, body: 'changed outside', unsorted: undefined }, pending, sorted,
      entry('할 일', { id: 'child-todo' }), entry('질문', { id: 'child-question' }),
    ])).toBe(2)
    expect(filterRecords([{ ...split, split: true, unsorted: undefined }], '메모')).toHaveLength(1)
  })
  it('reveals a saved or clicked record hidden by the current filter', () => {
    const question = entry('질문', { id: 'question' })
    expect(filterForActiveRecord('메모', [question], question.id)).toBe('전체')
    expect(filterForActiveRecord('질문', [question], question.id)).toBe('질문')
    expect(filterForActiveRecord('메모', [question], 'missing')).toBe('메모')
  })
  it('keeps a draft when answers arrive and refuses to rebase over an externally changed body', () => {
    const draft = { text: 'my edit', original: 'old body', hash: 'old hash' }
    expect(rebaseRecordEdit(draft, 'old body', 'answer appended')).toEqual({ ...draft, hash: 'answer appended' })
    expect(rebaseRecordEdit(draft, 'agent edit', 'new hash')).toBe(draft)
  })
  it('keeps old comments and unsorted records in memo filtering without mixing in highlights', () => {
    const old = entry('코멘트'), pending = entry('메모', { unsorted: true }), question = entry('질문'), todo = entry('할 일')
    const input = [old, pending, question, todo, entry('하이라이트')]
    expect(filterRecords(input, '전체')).toEqual([old, pending, question, todo])
    expect(filterRecords(input, '메모')).toEqual([old, pending])
    expect(filterRecords(input, '질문')).toEqual([question])
    expect(filterRecords(input, '할 일')).toEqual([todo])
  })
  it('opens notes by source path and never guesses a note path from a slug', () => {
    expect(recordRoute('r', { target: 'calc-identity', source: 'workbench/calc/identity/note.md' }, () => undefined)).toEqual({ page: 'part', rid: 'r', file: 'workbench/calc/identity/note.md' })
    expect(recordRoute('r', { target: 'note-missing' }, () => undefined)).toBeNull()
    expect(recordRoute('r', { target: 'project' }, () => 'part.tex')).toBeNull()
    expect(recordRoute('r', { target: 'block-proof', source: 'proof' }, () => undefined)).toEqual({ page: 'block', rid: 'r', bid: 'proof' })
    expect(recordRoute('r', { target: 'manuscript' }, () => 'main.tex')).toEqual({ page: 'part', rid: 'r', file: 'main.tex' })
  })
  it('migrates both saved old writing modes and tolerates legacy ids', () => {
    expect(normalizeRightMode('memo')).toBe('records')
    expect(normalizeRightMode('comments')).toBe('records')
    expect(normalizeRightMode('info')).toBe('info')
    expect(recordDate('c-20261006-1200')).toBe('10/6')
    expect(recordDate('legacy')).toBe('')
  })
  it('opens PDF anchors in the matching result tab without guessing a manuscript key', () => {
    expect(recordPdfTab({ target: 'block-proof', source: 'proof' }, () => undefined)).toEqual({ k: 'pdf', bid: 'proof' })
    expect(recordPdfTab({ target: 'manuscript' }, () => '')).toEqual({ k: 'mspdf' })
    expect(recordPdfTab({ target: 'manuscript-key' }, () => 'workbench/notes/한글/main.tex')).toEqual({ k: 'mspdf', ms: 'workbench/notes/한글/main.tex' })
    expect(recordPdfTab({ target: 'manuscript-missing' }, () => undefined)).toBeNull()
    expect(recordPdfTab({ target: 'paper-example', source: 'example.pdf' }, () => undefined)).toBeNull()
  })
})
