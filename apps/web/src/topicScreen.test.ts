import { describe, expect, it } from 'vitest'
import type { NoteRow } from './api'
import { cardTime, charCount, descriptionLines } from './cardParts'
import { LOOSE_TOPIC_ID } from './noteKinds'
import { gridColumns, notesInPeriod, notesOfTopic, periodStart, sortNotes, sortTopics } from './topicNotes'

const row = (id: string, p: Partial<NoteRow>): NoteRow => ({
  id, type: 'block', file: `workbench/blocks/${id}.md`, format: 'md', title: id, status: 'in-progress', topics: [], star: false, mtime: 0, hash: '', ...p,
})

describe('주제 화면 노트 순서', () => {
  const list = [
    row('b', { mtime: 3, status: 'solved' }),
    row('a', { mtime: 1, status: 'blocked' }),
    row('c', { mtime: 2, star: true, status: 'stopped' }),
    row('d', { mtime: 4 }),
  ]
  it('★는 어느 정렬에서도 앞', () => {
    expect(sortNotes(list, 'recent').map((n) => n.id)).toEqual(['c', 'd', 'b', 'a'])
    expect(sortNotes(list, 'name').map((n) => n.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(sortNotes(list, 'status').map((n) => n.id)).toEqual(['c', 'd', 'a', 'b'])
  })
  it('여러 주제에 든 노트는 든 모든 주제에, "노트들"은 아는 주제가 없는 노트', () => {
    const notes = [row('x', { topics: ['t1', 't2'] }), row('y', { topics: ['t2'] }), row('z', { topics: [] }), row('w', { topics: ['gone'] })]
    expect(notesOfTopic('t2', notes, ['t1', 't2']).map((n) => n.id)).toEqual(['x', 'y'])
    expect(notesOfTopic('t1', notes, ['t1', 't2']).map((n) => n.id)).toEqual(['x'])
    expect(notesOfTopic(LOOSE_TOPIC_ID, notes, ['t1', 't2']).map((n) => n.id)).toEqual(['z', 'w'])
  })
})

describe('카드 글', () => {
  it('설명의 "- " 줄은 글머리표, 빈 줄은 뺀다', () => {
    expect(descriptionLines('첫 줄\n\n- 둘째\n- 셋째')).toEqual([{ text: '첫 줄', bullet: false }, { text: '둘째', bullet: true }, { text: '셋째', bullet: true }])
  })
  it('글자 수는 줄바꿈을 세지 않는다', () => expect(charCount('가나\n다')).toBe(3))
  it('시각은 "월/일 시:분"', () => {
    const now = new Date(2026, 9, 5, 12)
    expect(cardTime(new Date(2026, 9, 5, 9, 40).getTime(), now)).toBe('10/5 09:40')
    expect(cardTime(new Date(2025, 0, 2).getTime(), now)).toBe('2025/1/2')
  })
})

describe('첫 화면 주제 · 노트 섹션', () => {
  const t = (title: string, p: Partial<{ star: boolean; updated: number; byStatus: Record<string, number> }>) => ({ title, star: false, updated: 0, byStatus: {}, ...p })
  const topics = [
    t('나', { updated: 3, byStatus: { solved: 2 } }),
    t('가', { updated: 1, byStatus: { 'in-progress': 1 } }),
    t('다', { updated: 2, star: true }),
    t('라', { updated: 4, byStatus: { blocked: 1 } }),
  ]
  it('주제 정렬: ★ 먼저, 최근 작업 · 상태(진행 → 멈춤 → 해결, 노트 없으면 뒤) · 이름', () => {
    expect(sortTopics(topics, 'recent').map((x) => x.title)).toEqual(['다', '라', '나', '가'])
    expect(sortTopics(topics, 'status').map((x) => x.title)).toEqual(['다', '가', '라', '나'])
    expect(sortTopics(topics, 'name').map((x) => x.title)).toEqual(['다', '가', '나', '라'])
  })
  it('기간: 오늘 0시 · 이번 주 월요일 0시부터', () => {
    const now = new Date(2026, 9, 7, 15, 0) // 10/7 수요일
    expect(new Date(periodStart('today', now))).toEqual(new Date(2026, 9, 7))
    expect(new Date(periodStart('week', now))).toEqual(new Date(2026, 9, 5))
    expect(new Date(periodStart('week', new Date(2026, 9, 11, 9)))).toEqual(new Date(2026, 9, 5)) // 일요일은 그 주 월요일부터
    const notes = [row('a', { mtime: new Date(2026, 9, 7, 9).getTime() }), row('b', { mtime: new Date(2026, 9, 5, 1).getTime() }), row('c', { mtime: new Date(2026, 9, 4).getTime() })]
    expect(notesInPeriod(notes, 'today', now).map((n) => n.id)).toEqual(['a'])
    expect(notesInPeriod(notes, 'week', now).map((n) => n.id)).toEqual(['a', 'b'])
    expect(notesInPeriod(notes, 'all', now)).toHaveLength(3)
  })
  it('한 줄에 들어가는 카드 수', () => {
    expect(gridColumns(580)).toBe(3)
    expect(gridColumns(579)).toBe(2)
    expect(gridColumns(100)).toBe(1)
  })
})
