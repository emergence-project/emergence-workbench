import { describe, expect, it } from 'vitest'
import type { FlowNode } from './api'
import { layoutFlow, lineageOf } from './flowLayout'

const node = (id: string, date: string, from: string[] = [], topics = ['t']): FlowNode => ({
  id, file: `workbench/flow/${id}.yaml`, hash: 'h', kind: 'question', progress: 'open', short: id, title: id, topics, date,
  from: from.map((f) => ({ id: f, type: 'origin' })), fields: {}, evidence: [], sources: [], guesses: [], theorem: false,
})
const at = (l: ReturnType<typeof layoutFlow>, id: string) => { const p = l.placed.find((x) => x.node.id === id)!; return [p.c, p.r] }

describe('흐름 자리', () => {
  it('첫 갈래는 가운데 줄, 두 번째 자식은 가까운 빈 줄로', () => {
    const l = layoutFlow([node('a', '1'), node('b', '2', ['a']), node('c', '3', ['a']), node('d', '4', ['b', 'c'])], 't')
    expect(l.mid).toBe(2)
    expect(l.rows).toBe(5)
    expect(at(l, 'a')).toEqual([0, 2])
    expect(at(l, 'b')).toEqual([1, 2])
    expect(at(l, 'c')).toEqual([1, 3])
    expect(at(l, 'd')).toEqual([2, 2])
    expect(l.cols).toBe(3)
    expect(l.lines).toHaveLength(4)
  })

  it('앞선 점이 없는 늦은 점은 날짜가 이른 점들의 열에 선다', () => {
    const l = layoutFlow([node('a', '1'), node('b', '2', ['a']), node('z', '5')], 't')
    expect(at(l, 'z')).toEqual([1, 3])
  })

  it('다른 주제의 점은 그리지 않고 받는 점 앞에 알린다', () => {
    const l = layoutFlow([node('x', '1', [], ['other']), node('a', '2', ['x'])], 't')
    expect(l.placed.map((p) => p.node.id)).toEqual(['a'])
    expect(l.lines).toEqual([])
    expect(l.outside.get('a')?.map((n) => n.id)).toEqual(['x'])
  })

  it('갈래가 많으면 줄을 늘리고 중심선은 첫 갈래에 남는다', () => {
    const kids = ['b', 'c', 'd', 'e', 'f', 'g'].map((k, i) => node(k, String(i + 2), ['a']))
    const l = layoutFlow([node('a', '1'), ...kids], 't')
    expect(l.rows).toBe(6)
    expect(at(l, 'a')[1]).toBe(l.mid)
    expect(new Set(l.placed.filter((p) => p.c === 1).map((p) => p.r)).size).toBe(6)
  })

  it('고리가 있어도 멈춘다', () => {
    const l = layoutFlow([node('a', '1', ['b']), node('b', '2', ['a'])], 't')
    expect(l.placed).toHaveLength(2)
  })

  it('계보', () => {
    const l = layoutFlow([node('a', '1'), node('b', '2', ['a']), node('c', '3', ['b']), node('x', '4', ['a'])], 't')
    const g = lineageOf('b', l.lines)
    expect([...g.up].sort()).toEqual(['a', 'b'])
    expect([...g.down].sort()).toEqual(['b', 'c'])
  })
})
