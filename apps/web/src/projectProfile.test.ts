import { describe, expect, it } from 'vitest'
import { noteKindChoices } from './noteKinds'
import { attentionOf, filterProjects, issueTip, lastWorkMs, moveId, stateCounts } from './projectProfile'

const P = (id: string, kind: 'research' | 'work', state: 'active' | 'paused' | 'done') => ({ id, kind, state })
const list = [P('alpha', 'research', 'active'), P('ops', 'work', 'active'), P('ns', 'research', 'paused'), P('old', 'research', 'done')]

describe('홈 거르기 (성격 · 진행 상태)', () => {
  it('성격으로 거른 뒤 진행 상태마다 센다', () => {
    expect(stateCounts(list, 'all')).toEqual({ active: 2, paused: 1, done: 1 })
    expect(stateCounts(list, 'work')).toEqual({ active: 1, paused: 0, done: 0 })
  })
  it('두 거르기를 함께 쓰고 순서는 그대로 둔다', () => {
    expect(filterProjects(list, 'all', 'active').map((r) => r.id)).toEqual(['alpha', 'ops'])
    expect(filterProjects(list, 'research', 'active').map((r) => r.id)).toEqual(['alpha'])
    expect(filterProjects(list, 'work', 'done')).toEqual([])
  })
})

describe('끌어서 순서 바꾸기', () => {
  it('뒤에서 앞으로 끌면 그 앞에, 앞에서 뒤로 끌면 그 뒤에 놓는다', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })
  it('거른 화면에서 끌어도 보이지 않는 것의 자리는 그대로', () => {
    // b가 숨어 있을 때 d를 a 위로
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c'])
    expect(moveId(['a', 'b'], 'a', 'a')).toEqual(['a', 'b'])
    expect(moveId(['a', 'b'], 'x', 'a')).toEqual(['a', 'b'])
  })
})

describe('상태 기호와 최근 시각', () => {
  it('확인 필요 · 업데이트 필요 · 둘 다', () => {
    expect(attentionOf(0, 0)).toBeNull()
    expect(attentionOf(2, 0)).toBe('check')
    expect(attentionOf(0, 3)).toBe('update')
    expect(attentionOf(1, 1)).toBe('both')
    expect(issueTip(2, 0)).toBe('확인이 필요한 노트 2개')
    expect(issueTip(0, 1)).toBe('판단할 맡긴 일 1개')
    expect(issueTip(1, 3)).toBe('확인이 필요한 노트 1개 · 판단할 맡긴 일 3개')
  })
  it('최근 시각은 보조 노트를 고친 때와 일지 기록 중 늦은 것', () => {
    const at = new Date('2026-10-05T09:52:00').getTime()
    expect(lastWorkMs({ blocks: [{ mtime: at - 1000 }] as never }, [{ date: '2026-10-05', time: '09:52' }])).toBe(at)
    expect(lastWorkMs({ blocks: [] }, [])).toBeUndefined()
  })
})

describe('노트 성격 고르기', () => {
  it('설계는 업무 프로젝트에서만 고른다', () => {
    expect(noteKindChoices('work')).toContain('design')
    expect(noteKindChoices('research')).not.toContain('design')
  })
})
