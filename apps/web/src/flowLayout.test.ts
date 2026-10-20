import { describe, expect, it } from 'vitest'
import type { FlowNode } from './api'
import { layoutFlow, lineageOf } from './flowLayout'

const node = (id: string, date: string, from: string[] = [], topics = ['t']): FlowNode => ({
  id, file: `workbench/flow/${id}.yaml`, hash: 'h', kind: 'question', progress: 'open', short: id, title: id, topics, date,
  from: from.map((f) => ({ id: f, type: 'origin' })), fields: {}, evidence: [], steps: [], gaps: [], sources: [], guesses: [], theorem: false,
})
const at = (l: ReturnType<typeof layoutFlow>, id: string) => { const p = l.placed.find((x) => x.node.id === id)!; return [p.c, p.r] }

describe('흐름 자리', () => {
  it('첫 갈래는 가운데 줄, 두 번째 자식은 가까운 빈 줄로', () => {
    const l = layoutFlow([node('a', '1'), node('b', '2', ['a']), node('c', '3', ['a']), node('d', '4', ['b', 'c'])])
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
    const l = layoutFlow([node('a', '1'), node('b', '2', ['a']), node('z', '5')])
    expect(at(l, 'z')).toEqual([1, 3])
  })

  it('주제가 달라도 한 흐름에 그리고 선을 잇는다', () => {
    const l = layoutFlow([node('x', '1', [], ['other']), node('a', '2', ['x'])])
    expect(l.placed.map((p) => p.node.id)).toEqual(['x', 'a'])
    expect(l.lines).toEqual([{ from: 'x', to: 'a', type: 'origin' }])
  })

  it('갈래가 많으면 줄을 늘리고 중심선은 첫 갈래에 남는다', () => {
    const kids = ['b', 'c', 'd', 'e', 'f', 'g'].map((k, i) => node(k, String(i + 2), ['a']))
    const l = layoutFlow([node('a', '1'), ...kids])
    expect(l.rows).toBe(6)
    expect(at(l, 'a')[1]).toBe(l.mid)
    expect(new Set(l.placed.filter((p) => p.c === 1).map((p) => p.r)).size).toBe(6)
  })

  it('보이는 줄: 적힌 범위를 쓰되 점이 있는 줄은 늘 보이고, 최소 줄 수(주제 수) 밑으로 줄지 않는다', () => {
    const one = [node('a', '1')]
    expect(layoutFlow(one, {}, { rows: { top: -1, bottom: 2 } })).toMatchObject({ mid: 1, rows: 4 })
    expect(layoutFlow(one, {}, { rows: { top: 0, bottom: 0 } })).toMatchObject({ mid: 0, rows: 1 })
    expect(layoutFlow(one, { a: { c: 0, r: -2 } }, { rows: { top: 0, bottom: 0 } })).toMatchObject({ mid: 2, rows: 3 })
    expect(layoutFlow(one, {}, { rows: { top: 0, bottom: 0 }, minRows: 3 })).toMatchObject({ mid: 0, rows: 3 })
    expect(layoutFlow(one, {}, { minRows: 7 })).toMatchObject({ mid: 3, rows: 7 })
  })

  it('고리가 있어도 멈춘다', () => {
    const l = layoutFlow([node('a', '1', ['b']), node('b', '2', ['a'])])
    expect(l.placed).toHaveLength(2)
  })

  it('계보', () => {
    const l = layoutFlow([node('a', '1'), node('b', '2', ['a']), node('c', '3', ['b']), node('x', '4', ['a'])])
    const g = lineageOf('b', l.lines)
    expect([...g.up].sort()).toEqual(['a', 'b'])
    expect([...g.down].sort()).toEqual(['b', 'c'])
  })
})

describe('손으로 옮긴 자리', () => {
  it('정한 칸에 두고, 그 뒤 점은 그 열을 따르며 다른 점은 그 칸을 피한다', () => {
    const a = node('a', '1'), b = node('b', '2', ['a']), c = node('c', '3', ['a'])
    const lay = layoutFlow([a, b, c], { b: { c: 3, r: 0 }, zz: { c: 9, r: 9 } })
    const at = Object.fromEntries(lay.placed.map((p) => [p.node.id, [p.c, p.r - lay.mid]]))
    expect(at).toEqual({ a: [0, 0], b: [3, 0], c: [1, 0] })
    const lay2 = layoutFlow([a, b, c], { a: { c: 1, r: 0 } })
    const at2 = Object.fromEntries(lay2.placed.map((p) => [p.node.id, [p.c, p.r - lay2.mid]]))
    expect(at2).toEqual({ a: [1, 0], b: [2, 0], c: [2, 1] })
  })
})
