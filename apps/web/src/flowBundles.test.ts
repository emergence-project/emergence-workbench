import { describe, expect, it } from 'vitest'
import type { FlowEdge, FlowNode } from './api'
import { bundleFlow, layoutBundle } from './flowBundles'

const node = (id: string, kind: FlowNode['kind'], date: string, from: [string, FlowEdge][] = [], extra: Partial<FlowNode> = {}): FlowNode => ({
  id, file: `workbench/flow/${id}.yaml`, hash: 'h', kind, progress: 'done', short: id, title: id, topics: ['t'], date,
  from: from.map(([f, type]) => ({ id: f, type })), fields: {}, evidence: [], steps: [], gaps: [], sources: [], guesses: [], theorem: false, judgments: [], ...extra,
})

describe('흐름 묶음', () => {
  it('작업 · 명제는 처음 만나는 질문의 묶음에, 질문은 새 묶음을 연다', () => {
    const l = bundleFlow([
      node('q', 'question', '1'),
      node('read', 'literature', '2', [['q', 'origin']]),
      node('calc', 'calc', '3', [['read', 'origin']]),
      node('f', 'finding', '4', [['calc', 'support']]),
      node('q2', 'question', '5', [['f', 'origin']]),
    ])
    expect(l.bundles.map((b) => [b.id, b.nodes.map((n) => n.id)])).toEqual([['q', ['q', 'read', 'calc', 'f']], ['q2', ['q2']]])
    expect(l.bundles[0]!.answer?.id).toBe('f')
    expect(l.bundles[0]!.counts).toEqual({ work: 1, literature: 1, finding: 1, refuted: 0 })
    expect(l.lines).toEqual([{ from: 'q', to: 'q2', cross: false }])
    expect(l.bundles.map((b) => b.col)).toEqual([0, 1])
  })

  it('앞 명제에서 바로 시작한 작업은 질문 없는 묶음, 문헌 읽기는 그 명제의 묶음에 남는다', () => {
    const l = bundleFlow([
      node('q', 'question', '1'),
      node('f', 'finding', '2', [['q', 'origin']]),
      node('c', 'calc', '3', [['f', 'origin']]),
      node('r', 'literature', '4', [['f', 'origin']]),
    ])
    expect(l.of.get('c')).toBe('c')
    expect(l.of.get('r')).toBe('q')
    expect(l.bundles.find((b) => b.id === 'c')!.question).toBeNull()
  })

  it('버린 묶음에서는 선이 나가지 않고, 다른 길로 이어진 선은 뺀다', () => {
    const l = bundleFlow([
      node('a', 'question', '1'),
      node('b', 'question', '2', [['a', 'origin']]),
      node('c', 'question', '3', [['a', 'origin'], ['b', 'origin']]),
      node('x', 'question', '4', [], { result: 'dropped' }),
      node('y', 'question', '5', [['x', 'origin']]),
    ])
    expect(l.lines.map((x) => `${x.from}>${x.to}`).sort()).toEqual(['a>b', 'b>c'])
    expect(l.bundles.find((b) => b.id === 'c')!.col).toBe(2)
  })

  it('판단: 명제가 모두 승인되어야 판단된 묶음, 적어만 둔 질문은 곁가지', () => {
    const l = bundleFlow([
      node('q', 'question', '1'),
      node('f1', 'finding', '2', [['q', 'origin']], { verdict: 'approve' }),
      node('f2', 'finding', '3', [['q', 'origin']]),
      node('s', 'question', '4', [], { progress: 'open' }),
    ])
    expect(l.bundles.find((b) => b.id === 'q')!.judged).toBe(false)
    expect(l.bundles.find((b) => b.id === 's')!.side).toBe(true)
  })

  it('줄은 주제 순서, 같은 칸은 아래로 쌓는다', () => {
    const l = bundleFlow([
      node('a', 'question', '1', [], { topics: ['u'] }),
      node('b', 'question', '2', [], { topics: ['t'] }),
      node('c', 'question', '3', [], { topics: ['t'] }),
    ], ['t', 'u'])
    expect(l.topics).toEqual([{ id: 't', depth: 2 }, { id: 'u', depth: 1 }])
    expect(l.bundles.find((b) => b.id === 'c')!.stack).toBe(1)
  })

  it('묶음 안의 자리', () => {
    const l = bundleFlow([node('q', 'question', '1'), node('a', 'calc', '2', [['q', 'origin']]), node('b', 'calc', '3', [['q', 'origin']]), node('f', 'finding', '4', [['a', 'support'], ['b', 'support']])])
    expect(layoutBundle(l.bundles[0]!)).toEqual([{ id: 'q', c: 0, r: 0 }, { id: 'a', c: 1, r: 0 }, { id: 'b', c: 1, r: 1 }, { id: 'f', c: 2, r: 0 }])
  })

  it('묶음 안의 자리: 날짜가 뒤섞여도 여는 점이 처음, 닫는 점이 끝 (10/31 피드백)', () => {
    // 작업의 날짜가 질문보다 이르고(한꺼번에 만든 점), 명제 뒤에 작업이 더 있어도 명제가 마지막 열에 홀로 온다
    const l = bundleFlow([
      node('q', 'question', '5'),
      node('a', 'calc', '1', [['q', 'origin']]),
      node('b', 'calc', '2', [['a', 'origin']]),
      node('f', 'finding', '3', [['a', 'support']]),
      node('c', 'calc', '4', [['f', 'use']]),
    ])
    const at = new Map(layoutBundle(l.bundles.find((x) => x.id === 'q')!).map((p) => [p.id, p]))
    expect(at.get('q')).toEqual({ id: 'q', c: 0, r: 0 })
    expect(at.get('a')!.c).toBe(1)
    expect(at.get('b')!.c).toBe(2)
    expect(at.get('c')!.c).toBe(3)
    expect(at.get('f')).toEqual({ id: 'f', c: 4, r: 0 })
  })
})
