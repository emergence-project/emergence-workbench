import { describe, expect, it } from 'vitest'
import type { CommentEntry } from './api/comments'
import { inSideKinds, flatRecords, recordRuns, classifiedRecordCount, filterRecords, recordDate, recordPdfTab, recordRoute, rebaseRecordEdit, isUserTurnRecord, filterByStatus, sortRecords, recordWhen } from './recordsPanelHelpers'
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
  it('사이드바 필터 메뉴 (11/28): 종류마다 거르고, 예전 지시는 질문과 함께, 하이라이트는 언제나 뺀다', () => {
    const all = [entry('메모', { id: 'm' }), entry('코멘트', { id: 'old' }), entry('할 일', { id: 't', state: '대기' }), entry('질문', { id: 'q', state: '대기' }), entry('지시', { id: 'i', state: '대기' }), entry('하이라이트', { id: 'h' })]
    expect(all.filter((c) => inSideKinds(c, new Set(['메모', '할 일', '질문']))).map((c) => c.id)).toEqual(['m', 'old', 't', 'q', 'i'])
    expect(all.filter((c) => inSideKinds(c, new Set(['질문']))).map((c) => c.id)).toEqual(['q', 'i'])
    expect(all.filter((c) => inSideKinds(c, new Set())).map((c) => c.id)).toEqual([])
  })
  it('한 목록 (11/28): 여러 대상의 기록을 내 차례 · 고정 · 최근 것 순으로 섞고, 완료는 따로, 할 일에 이은 질문은 그 할 일이 보이면 뺀다', () => {
    const file = (target: string, comments: ReturnType<typeof entry>[]) => ({ target, title: target, hash: target, comments })
    const a = file('note-a', [entry('메모', { id: 'c-20261001-0900' }), entry('메모', { id: 'c-20261003-0900', pinned: true }), entry('할 일', { id: 'c-20261002-0900', state: '대기' }),
      entry('질문', { id: 'c-20261004-0900', state: '대기', todo: 'c-20261002-0900' })])
    const b = file('note-b', [entry('질문', { id: 'c-20260901-0900', state: '대기', by: 'claude' }), entry('메모', { id: 'c-20261005-0900' }), entry('할 일', { id: 'c-20261006-0900', state: '끝냄' })])
    const all = new Set(['메모', '할 일', '질문'] as const)
    const flat = flatRecords([a, b], all)
    expect(flat.open.map((r) => `${r.file.target.slice(5)}:${r.c.id.slice(8, 10)}`)).toEqual(['b:01', 'a:03', 'b:05', 'a:02', 'a:01'])
    expect(flat.done.map((r) => r.c.id)).toEqual(['c-20261006-0900'])
    expect(flatRecords([a, b], all, 'old').open.map((r) => r.c.id.slice(8, 10))).toEqual(['01', '03', '01', '02', '05'])
    // 할 일을 거르면 그 할 일에 이은 질문은 제 줄로 나온다
    expect(flatRecords([a], new Set(['질문'] as const)).open.map((r) => r.c.id)).toEqual(['c-20261004-0900'])
    expect(recordRuns(flat.open).map((run) => [run.file.target, run.items.length])).toEqual([['note-b', 1], ['note-a', 1], ['note-b', 1], ['note-a', 2]])
  })
  it('splits records into in progress and done, memos stay in progress (10/18)', () => {
    const memo = entry('메모', { id: 'm' }), open = entry('할 일', { id: 'o', state: '대기' }), done = entry('할 일', { id: 'd', state: '끝냄' }), answered = entry('질문', { id: 'a', state: '답함' })
    expect(filterByStatus([memo, open, done, answered], '진행 중')).toEqual([memo, open, answered])
    expect(filterByStatus([memo, open, done, answered], '완료')).toEqual([done])
  })
  it('orders your turn first, then newest first (10/18)', () => {
    const old = entry('메모', { id: 'c-20261001-0900' }), recent = entry('메모', { id: 'c-20261012-1437' })
    const asked = entry('질문', { id: 'c-20260901-0800', by: 'claude-code', state: '대기' })
    expect(sortRecords([old, recent, asked]).map((c) => c.id)).toEqual([asked.id, recent.id, old.id])
  })
  it('shows the time for today and the date before (10/18)', () => {
    const now = new Date(2026, 9, 18, 15, 0)
    expect(recordWhen('c-20261018-1420', now)).toEqual({ label: '14:20', title: '2026-10-18 14:20' })
    expect(recordWhen('c-20261012-0905', now)).toEqual({ label: '10/12', title: '2026-10-12 09:05' })
    expect(recordWhen('legacy', now).label).toBe('')
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
    expect(recordRoute('r', { target: 'block-proof', source: 'proof' }, () => undefined)).toBeNull()
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
    expect(recordPdfTab({ target: 'block-proof', source: 'proof' }, () => undefined)).toBeNull()
    expect(recordPdfTab({ target: 'manuscript' }, () => '')).toEqual({ k: 'mspdf' })
    expect(recordPdfTab({ target: 'manuscript-key' }, () => 'workbench/notes/한글/main.tex')).toEqual({ k: 'mspdf', ms: 'workbench/notes/한글/main.tex' })
    expect(recordPdfTab({ target: 'manuscript-missing' }, () => undefined)).toBeNull()
    expect(recordPdfTab({ target: 'paper-example', source: 'example.pdf' }, () => undefined)).toBeNull()
  })
})

describe('user turn records (10/15)', () => {
  it('is an agent-written question or instruction still waiting', () => {
    expect(isUserTurnRecord({ kind: '질문', by: 'claude', state: '대기' })).toBe(true)
    expect(isUserTurnRecord({ kind: '지시', by: 'codex', state: '대기' })).toBe(true)
    expect(isUserTurnRecord({ kind: '질문', state: '대기' })).toBe(false)
    expect(isUserTurnRecord({ kind: '질문', by: 'claude', state: '답함' })).toBe(false)
    expect(isUserTurnRecord({ kind: '메모', by: 'claude', state: null })).toBe(false)
  })
})
