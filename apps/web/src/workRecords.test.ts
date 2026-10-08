import { describe, expect, it } from 'vitest'
import { RESEARCH_TARGET, type JournalEntry } from '@rw/core'
import type { CommentEntry, RecordFile } from './api/comments'
import { parseWorkFilter, workRecordGroups, type WorkRecordItem } from './workRecords'

const record = (id: string, kind: CommentEntry['kind'] = '메모', rest: Partial<CommentEntry> = {}): CommentEntry => ({ id, kind, body: id, where: '전체', rects: [], state: null, answers: [], ...rest })
const file = (target: string, comments: CommentEntry[]): RecordFile => ({ target, title: `${target} 제목`, hash: `${target}-hash`, comments })
const memo = (date: string, time: string, index: number, rest: Partial<JournalEntry> = {}): JournalEntry => ({ date, time, index, kind: 'memo', target: RESEARCH_TARGET, text: `${date} ${time} ${index}`, ...rest })
const label = (item: WorkRecordItem) => item.kind === 'record' ? item.entry.id : item.entry.text

describe('work filters', () => {
  it('restores each supported browser value and falls back to todos for old or invalid values', () => {
    expect(['판단', '맡긴 일', '할 일', '메모', '질문'].map(parseWorkFilter)).toEqual(['판단', '맡긴 일', '할 일', '메모', '질문'])
    for (const value of [null, '', '전체', 'memo', ' 메모', '"질문"']) expect(parseWorkFilter(value)).toBe('판단')
  })
})

describe('work record groups', () => {
  it('interleaves old journal memos with project records newest first', () => {
    const project = file('project', [record('c-20261006-092000'), record('c-20261006-121001')])
    const journal = [memo('2026-10-06', '10:30', 1), memo('2026-10-07', '09:00', 0), memo('2026-10-05', '23:00', 0)]
    const groups = workRecordGroups([project], journal, '메모')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.target).toBe('project')
    expect(groups[0]!.items.map(label)).toEqual([
      '2026-10-07 09:00 0', 'c-20261006-121001', '2026-10-06 10:30 1', 'c-20261006-092000', '2026-10-05 23:00 0',
    ])
  })

  it('uses numeric record suffixes and journal indices for same-time entries', () => {
    const project = file('project', [record('c-20261006-0930-2'), record('c-20261006-0930-10'), record('c-20261006-0930'), record('c-20261006-093001')])
    const journal = [memo('2026-10-06', '9:30', 2), memo('2026-10-06', '09:30', 12), memo('2026-10-06', '09:30', 1)]
    expect(workRecordGroups([project], journal, '메모')[0]!.items.map(label)).toEqual([
      'c-20261006-093001', 'c-20261006-0930-10', 'c-20261006-0930-2', 'c-20261006-0930',
      '2026-10-06 09:30 12', '2026-10-06 9:30 2', '2026-10-06 09:30 1',
    ])
  })

  it('puts project first and keeps note group order, including repeated IDs across targets', () => {
    const sameId = 'c-20261006-1200'
    const noteB = file('note-b', [record(sameId), record('c-20261007-0900')])
    const noteA = file('note-a', [record(sameId)])
    const project = file('project', [record(sameId)])
    const groups = workRecordGroups([noteB, project, noteA], [], '메모')
    expect(groups.map((group) => [group.target, group.title])).toEqual([
      ['project', '이 프로젝트'], ['note-b', 'note-b 제목'], ['note-a', 'note-a 제목'],
    ])
    expect(groups[1]!.items.map(label)).toEqual(['c-20261007-0900', sameId])
    expect(groups.flatMap((group) => group.items).filter((item) => label(item) === sameId)).toHaveLength(3)
    expect(groups[1]!.items[1]).toEqual({ kind: 'record', file: noteB, entry: noteB.comments[0] })
  })

  it('keeps only memo records and old comments, including unsorted memos', () => {
    const old = record('c-20261006-1100', '코멘트')
    const unsorted = record('c-20261006-1200', '메모', { unsorted: true })
    const project = file('project', [old, unsorted, record('todo', '할 일'), record('question', '질문'), record('highlight', '하이라이트')])
    const journal = [memo('2026-10-06', '13:00', 0), ...(['todo', 'status', 'done'] as const).map((kind, index) => memo('2026-10-07', '14:00', index, { kind }))]
    expect(workRecordGroups([project], journal, '메모')[0]!.items.map(label)).toEqual(['2026-10-06 13:00 0', unsorted.id, old.id])
  })

  it('includes questions in any state and never merges journal entries into questions', () => {
    const questions = (['대기', '답함', '끝냄'] as const).map((state, index) => record(`c-20261006-120${index}`, '질문', { state }))
    const files = [file('note-empty', [record('memo')]), file('project', [record('todo', '할 일')]), file('note-question', questions)]
    const groups = workRecordGroups(files, [memo('2026-10-07', '12:00', 0)], '질문')
    expect(groups.map((group) => group.target)).toEqual(['note-question'])
    expect(groups[0]!.items.map(label)).toEqual(questions.map((entry) => entry.id).reverse())
  })

  it('adds a project group for journal-only memos and omits all empty groups', () => {
    const journal = [memo('2026-10-06', '12:00', 0, { target: 'block-example' })]
    expect(workRecordGroups([], journal, '메모')).toEqual([{ target: 'project', title: '이 프로젝트', items: [{ kind: 'journal', entry: journal[0] }] }])
    expect(workRecordGroups([file('project', []), file('note-empty', [])], [], '메모')).toEqual([])
  })

  it('keeps unknown legacy IDs after dated records without changing the input', () => {
    const files = [file('note-example', [record('legacy-b'), record('c-20261006-1200'), record('legacy-a')])]
    const journal = [memo('2026-10-07', '12:00', 1), memo('2026-10-06', '12:00', 0)]
    const before = structuredClone({ files, journal })
    const groups = workRecordGroups(files, journal, '메모')
    expect(groups[1]!.items.map(label)).toEqual(['c-20261006-1200', 'legacy-b', 'legacy-a'])
    expect({ files, journal }).toEqual(before)
    expect(groups[1]!.items[0]!.entry).toBe(files[0]!.comments[1])
  })
})
