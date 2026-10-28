import { describe, expect, it } from 'vitest'
import { RESEARCH_TARGET, type JournalEntry } from '@rw/core'
import type { CommentEntry, RecordFile } from './api/comments'
import { agentTurnRecords, openTodoRecords, parseWorkFilter, placeKind, recordLine, recordPlaces, userTurnRecords, workRecordGroups, type WorkRecordItem } from './workRecords'

const record = (id: string, kind: CommentEntry['kind'] = '메모', rest: Partial<CommentEntry> = {}): CommentEntry => ({ id, kind, body: id, where: '전체', rects: [], state: null, answers: [], ...rest })
const file = (target: string, comments: CommentEntry[]): RecordFile => ({ target, title: `${target} 제목`, hash: `${target}-hash`, comments })
const memo = (date: string, time: string, index: number, rest: Partial<JournalEntry> = {}): JournalEntry => ({ date, time, index, kind: 'memo', target: RESEARCH_TARGET, text: `${date} ${time} ${index}`, ...rest })
const label = (item: WorkRecordItem) => item.kind === 'record' ? item.entry.id : item.entry.text

describe('work filters', () => {
  it('restores each tab\'s own values and falls back to that tab\'s first filter', () => {
    expect(['판단', '맡긴 일'].map((v) => parseWorkFilter(v, 'work'))).toEqual(['판단', '맡긴 일'])
    expect(['메모', '할 일', '질문'].map((v) => parseWorkFilter(v, 'records'))).toEqual(['메모', '할 일', '질문'])
    // 기록 필터는 이제 작업 탭에 없고, 작업 필터는 기록 탭에 없다 (10/15).
    for (const value of [null, '', '전체', 'memo', ' 메모', '"질문"', '할 일']) expect(parseWorkFilter(value, 'work')).toBe('판단')
    for (const value of [null, '', '판단']) expect(parseWorkFilter(value, 'records')).toBe('전체')
    expect(parseWorkFilter('전체', 'records')).toBe('전체')
    expect(parseWorkFilter('맡긴 일', 'records')).toBe('맡긴 일')
  })
})

describe('work record groups', () => {
  it('to-dos come from records only: open ones, earliest deadline first, then the oldest written (2026-10-16)', () => {
    const project = file('project', [
      record('c-20261009-0900', '할 일', { body: '마감 없는 나중 것', state: '대기' }),
      record('c-20261008-0900', '할 일', { body: '마감 없는 먼저 것', state: '대기' }),
      record('c-20261009-1000', '할 일', { body: '10/12까지 — 늦은 마감', state: '대기' }),
      record('c-20261009-1100', '할 일', { body: '10/10 — 이른 마감', state: '대기' }),
      record('c-20261009-1200', '할 일', { body: '끝낸 것', state: '끝냄' }),
      record('c-20261009-1300', '메모'),
    ])
    const topic = file('topic-coloring', [record('c-20261009-1400', '할 일', { body: '주제 할 일', state: '대기' })])
    const journal = [memo('2026-10-09', '09:00', 0), { ...memo('2026-10-09', '09:30', 1), kind: 'todo' as const, done: false, text: '예전 일지 할 일' }]
    const groups = workRecordGroups([topic, project], journal, '할 일')
    expect(groups.map((g) => [g.target, g.items.map((item) => item.kind === 'record' ? item.entry.body : item.entry.text)])).toEqual([
      ['project', ['10/10 — 이른 마감', '10/12까지 — 늦은 마감', '마감 없는 먼저 것', '마감 없는 나중 것']],
      ['topic-coloring', ['주제 할 일']],
    ])
  })

  it('lists every kind and state under 전체, note by note, without highlights (10/22 12:09)', () => {
    const project = file('project', [record('c-20261020-1000', '지시', { state: '답함' })])
    const note = file('note-a', [record('c-20261019-1000', '할 일', { state: '끝냄' }), record('c-20261021-1000', '질문', { state: '대기' }), record('c-20261021-1100', '하이라이트')])
    const groups = workRecordGroups([note, project], [], '전체')
    expect(groups.map((g) => [g.target, g.items.map(label)])).toEqual([
      ['project', ['c-20261020-1000']],
      ['note-a', ['c-20261021-1000', 'c-20261019-1000']],
    ])
  })

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

describe('record turns (10/21 작업 탭을 기록 안으로)', () => {
  const files = [
    file('project', [
      record('c-20261010-0900', '질문', { body: '에이전트가 물은 나중 것', by: 'claude', state: '대기' }),
      record('c-20261009-0900', '지시', { body: '에이전트가 묻는 먼저 지시', by: 'claude', state: '대기' }),
      record('c-20261009-1000', '질문', { body: '답한 에이전트 질문', by: 'claude', state: '끝냄' }),
      record('c-20261009-1100', '질문', { body: '내가 쓴 질문\n둘째 줄', state: '대기' }),
      record('c-20261009-1200', '지시', { body: '내가 쓴 끝난 지시', state: '끝냄' }),
      record('c-20261009-1300', '할 일', { body: '10/10 할 일', state: '대기' }),
      record('c-20261009-1400', '할 일', { body: '끝낸 할 일', state: '끝냄' }),
      record('c-20261009-1500', '메모'),
    ]),
    file('note-a', [record('c-20261008-0900', '질문', { body: '노트의 내 질문', state: '대기' })]),
  ]
  const ids = (list: { entry: CommentEntry }[]) => list.map((x) => x.entry.id)
  it('your turn: questions and instructions agents wrote that wait, oldest first', () => {
    expect(ids(userTurnRecords(files))).toEqual(['c-20261009-0900', 'c-20261010-0900'])
  })
  it('agents\' turn: questions and instructions you wrote that wait, across targets', () => {
    expect(ids(agentTurnRecords(files))).toEqual(['c-20261008-0900', 'c-20261009-1100'])
  })
  it('open to-dos only', () => {
    expect(ids(openTodoRecords(files))).toEqual(['c-20261009-1300'])
  })
  it('a row shows the first line of the body, or of the quote when the body is empty', () => {
    expect(recordLine(record('x', '질문', { body: ' 첫 줄\n둘째 ' }))).toBe('첫 줄')
    expect(recordLine(record('x', '메모', { body: '', quote: '인용\n뒤' }))).toBe('인용')
    expect(recordLine(record('x', '메모', { body: '' }))).toBe('')
  })
})

describe('recordPlaces (기록이 달린 곳 목록)', () => {
  const rec = (id: string, extra: Partial<CommentEntry> = {}) => ({ kind: 'record' as const, file: {} as RecordFile, entry: { id, kind: '메모', body: 'x', ...extra } as CommentEntry })
  it('갈래 차례로 묶고, 갈래 안에서는 최근 기록이 있는 곳이 위로, 내 차례를 센다', () => {
    const places = recordPlaces([
      { target: 'note-a', title: 'A', items: [rec('c-20261001-1000')] },
      { target: 'project', title: '이 프로젝트', items: [rec('c-20260901-1000')] },
      { target: 'note-b', title: 'B', items: [rec('c-20261020-1000'), rec('c-20261021-1000', { kind: '질문', by: 'claude', state: '대기' })] },
      { target: 'topic-t', title: 'T', items: [rec('c-20261002-1000')] },
      { target: 'flow-x', title: 'X', items: [rec('c-20261003-1000')] },
    ])
    expect(places.map((p) => p.target)).toEqual(['project', 'topic-t', 'note-b', 'note-a', 'flow-x'])
    expect(places.find((p) => p.target === 'note-b')).toMatchObject({ count: 2, turn: 1, kind: 'note' })
  })
  it('원고 · 그 밖', () => {
    expect(placeKind('manuscript')).toBe('manuscript')
    expect(placeKind('02-five-color')).toBe('manuscript')
    expect(placeKind('statement-s1')).toBe('other')
  })
})
