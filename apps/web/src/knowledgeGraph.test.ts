import { describe, expect, it } from 'vitest'
import type { KnowledgeTopic } from './api'
import { fieldColors, fieldOf, focusLayout, neighborsOf, NO_FIELD, noteState, swapColor, wholeLayout } from './knowledgeGraph'

const topic = (key: string, over: Partial<KnowledgeTopic> = {}): KnowledgeTopic =>
  ({ key, title: key, subject: 'Physics › Spin', status: 'draft', papers: [], uses: [], links: [], linkedBy: [], names: [], ...over })
const concept = (over: Partial<NonNullable<KnowledgeTopic['concept']>> = {}) => ({ id: 'c', status: 'draft', empty: false, ...over })

describe('지식 지도 계산 (11/28)', () => {
  it('점 모양은 앱이 이미 하는 판단을 따른다', () => {
    expect(noteState(topic('a', { concept: concept({ checked: 'ok' }) }))).toBe('checked')
    expect(noteState(topic('a', { concept: concept({ empty: true }) }))).toBe('empty')
    expect(noteState(topic('a', { concept: concept({ unfinished: ['TODO'] }) }))).toBe('wip')
    expect(noteState(topic('a', { concept: concept() }))).toBe('draft')
    expect(noteState(topic('a', { status: 'study' }))).toBe('study')
  })

  it('분야는 분류의 맨 위, 없으면 분류 없음', () => {
    expect(fieldOf(topic('a'))).toBe('Physics')
    expect(fieldOf(topic('a', { subject: '' }))).toBe(NO_FIELD)
  })

  it('이웃은 방향 없이, 지도에 있는 것끼리만', () => {
    const nb = neighborsOf([topic('a', { links: ['b', 'zz', 'a'] }), topic('b')])
    expect([...nb.get('a')!]).toEqual(['b'])
    expect([...nb.get('b')!]).toEqual(['a'])
  })

  it('고른 색이 먼저이고, 나머지는 겹치지 않게 받는다', () => {
    const c = fieldColors(['A', 'B', 'C', NO_FIELD], new Map([['B', 'violet']]))
    expect(c.get('B')).toBe('violet')
    expect(c.get(NO_FIELD)).toBe('gray')
    expect(new Set([c.get('A'), c.get('B'), c.get('C')]).size).toBe(3)
  })

  it('다른 분야가 쓰는 색을 고르면 두 분야가 맞바꾼다', () => {
    const now = new Map([['A', 'violet'], ['B', 'blue']] as const)
    expect(Object.fromEntries(swapColor(now, 'A', 'blue'))).toEqual({ A: 'blue', B: 'violet' })
    expect(Object.fromEntries(swapColor(now, 'A', 'teal'))).toEqual({ A: 'teal' })
    expect(swapColor(now, 'A', 'violet').size).toBe(0)
  })

  it('배치는 같은 자료면 늘 같고, 초점 보기는 가운데가 0,0', () => {
    const ts = [topic('a', { links: ['b'] }), topic('b', { links: ['c'] }), topic('c'), topic('d', { subject: 'Math' })]
    const nb = neighborsOf(ts)
    expect([...wholeLayout(ts, nb)]).toEqual([...wholeLayout(ts, nb)])
    const f = focusLayout('a', 1, nb)
    expect(f.pos.get('a')).toEqual({ x: 0, y: 0 })
    expect([...f.dist.keys()].sort()).toEqual(['a', 'b'])
    expect(focusLayout('a', 2, nb).dist.get('c')).toBe(2)
  })
})
