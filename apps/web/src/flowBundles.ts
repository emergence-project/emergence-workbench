/**
 * 흐름의 묶음 (10/23 "판단 설계" 4단계): 질문 하나와 거기서 나온 작업 · 명제를 점 하나로 접는다. 화면에서만 계산하고 파일에는 적지 않는다.
 * - 질문은 자기 묶음을 연다. 작업 · 명제는 앞선 점(선의 출발)을 따라 올라가 처음 만나는 묶음에 든다.
 * - 명제에서 바로 시작한 작업(앞 명제에서 "발단")은 질문 없이 새 묶음을 연다. 문헌 읽기는 새 묶음을 열지 않고 낳은 점의 묶음에 든다.
 * - 열 = 생각 순서: 자기를 낳은 묶음보다 한 열 이상 오른쪽(가장 긴 앞 경로). 줄 = 주제(묶음 첫 점의 첫 주제), 한 칸에 둘 이상이면 아래로 쌓는다.
 * - 선: 점끼리의 선을 묶음끼리 하나로 합치고, 다른 길로 이미 이어진 선은 뺀다. 버린 묶음에서는 선이 나가지 않는다(버림은 끝).
 */
import type { FlowNode } from './api'

export type Bundle = {
  id: string
  /** 묶음을 연 질문. 질문 없이 시작한 묶음이면 null */
  question: FlowNode | null
  /** 묶음의 점 (질문 포함), 날짜 순 */
  nodes: FlowNode[]
  /** 대표 명제: 묶음의 가장 늦은 명제. 있으면 답이 나온 묶음 */
  answer: FlowNode | null
  /** 명제가 모두 승인됨 */
  judged: boolean
  topic: string | null
  /** 곁가지: 적어만 둔 질문 (점이 질문 하나뿐이고 카드가 아니며 시작하지 않음) */
  side: boolean
  dropped: boolean
  counts: { work: number; literature: number; finding: number; refuted: number }
  col: number
  /** 그 주제 줄 안에서 몇째로 쌓였나 */
  stack: number
}
export type BundleLine = { from: string; to: string; cross: boolean }
export type BundleLayout = { bundles: Bundle[]; of: Map<string, string>; lines: BundleLine[]; cols: number; topics: { id: string | null; depth: number }[] }

const WORK = new Set(['calc', 'analytic', 'proof'])

export function bundleFlow(all: FlowNode[], topicOrder: string[] = []): BundleLayout {
  const byId = new Map(all.map((n) => [n.id, n]))
  const sorted = [...all].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))
  const of = new Map<string, string>()
  const visiting = new Set<string>()
  const rootOf = (n: FlowNode): string => {
    const hit = of.get(n.id)
    if (hit) return hit
    if (n.kind === 'question' || visiting.has(n.id)) { of.set(n.id, n.id); return n.id }
    visiting.add(n.id)
    const froms = n.from.map((f) => ({ f, m: byId.get(f.id) })).filter((x): x is { f: typeof x.f; m: FlowNode } => !!x.m && x.m.id !== n.id)
    let r = n.id
    const first = froms.find((x) => x.f.type === 'origin') ?? froms[0]
    // 앞 명제에서 바로 "발단"한 작업은 새 묶음 (질문 없이 시작). 문헌 읽기는 늘 낳은 점의 묶음에
    if (first && !(first.f.type === 'origin' && first.m.kind === 'finding' && n.kind !== 'literature' && n.kind !== 'finding')) r = rootOf(first.m)
    visiting.delete(n.id)
    of.set(n.id, r)
    return r
  }
  for (const n of sorted) rootOf(n)

  const groups = new Map<string, FlowNode[]>()
  for (const n of sorted) { const r = of.get(n.id)!; groups.set(r, [...(groups.get(r) ?? []), n]) }
  const bundles: Bundle[] = [...groups].map(([id, nodes]) => {
    const head = byId.get(id)!
    const question = head.kind === 'question' ? head : null
    const findings = nodes.filter((n) => n.kind === 'finding')
    return {
      id, question, nodes,
      answer: findings.at(-1) ?? null,
      judged: findings.length > 0 && findings.every((n) => n.verdict === 'approve'),
      topic: head.topics[0] ?? nodes.find((n) => n.topics[0])?.topics[0] ?? null,
      side: !!question && nodes.length === 1 && !question.card && question.progress === 'open',
      dropped: head.result === 'dropped',
      counts: {
        work: nodes.filter((n) => WORK.has(n.kind)).length,
        literature: nodes.filter((n) => n.kind === 'literature').length,
        finding: findings.length,
        refuted: nodes.filter((n) => n.result === 'refuted').length,
      },
      col: 0, stack: 0,
    }
  })
  const bundleOf = new Map(bundles.map((b) => [b.id, b]))

  // 묶음끼리의 선: 합치고, 버린 묶음에서 나가는 선은 뺀다
  const out = new Map<string, Set<string>>()
  for (const n of sorted) for (const f of n.from) {
    const a = of.get(f.id), b = of.get(n.id)!
    if (!a || a === b || bundleOf.get(a)!.dropped) continue
    out.set(a, (out.get(a) ?? new Set()).add(b))
  }
  // 열: 가장 긴 앞 경로 (고리가 있으면 그 선은 무시)
  const col = new Map<string, number>()
  const state = new Map<string, 1 | 2>()
  const ins = new Map<string, string[]>()
  for (const [a, bs] of out) for (const b of bs) ins.set(b, [...(ins.get(b) ?? []), a])
  const colOf = (id: string): number => {
    if (state.get(id) === 2) return col.get(id)!
    if (state.get(id) === 1) return 0
    state.set(id, 1)
    const c = Math.max(-1, ...(ins.get(id) ?? []).map(colOf)) + 1
    state.set(id, 2); col.set(id, c)
    return c
  }
  for (const b of bundles) b.col = colOf(b.id)
  // 다른 길로 이미 이어진 선은 뺀다 (a → … → b가 두 걸음 이상으로 있으면 a → b를 그리지 않는다)
  const reach = (a: string, b: string, skip: boolean): boolean => {
    const seen = new Set<string>()
    const st = [...(out.get(a) ?? [])].filter((x) => !(skip && x === b))
    while (st.length) {
      const x = st.pop()!
      if (x === b) return true
      if (seen.has(x) || (col.get(x) ?? 0) >= (col.get(b) ?? 0)) continue
      seen.add(x)
      st.push(...(out.get(x) ?? []))
    }
    return false
  }
  const lines: BundleLine[] = []
  for (const [a, bs] of out) for (const b of bs) {
    if (reach(a, b, true)) continue
    lines.push({ from: a, to: b, cross: bundleOf.get(a)!.topic !== bundleOf.get(b)!.topic })
  }

  // 줄 = 주제. 주제 순서는 프로젝트의 주제 순서, 없는 주제는 뒤에, 주제가 없는 묶음은 맨 뒤
  const rank = (t: string | null) => t === null ? Infinity : topicOrder.indexOf(t) < 0 ? topicOrder.length : topicOrder.indexOf(t)
  const topicIds = [...new Set(bundles.map((b) => b.topic))].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)))
  const topics = topicIds.map((id) => {
    const used = new Map<number, number>()
    for (const b of bundles.filter((x) => x.topic === id).sort((x, y) => x.col - y.col)) { b.stack = used.get(b.col) ?? 0; used.set(b.col, b.stack + 1) }
    return { id, depth: Math.max(1, ...used.values()) }
  })
  return { bundles, of, lines, cols: Math.max(1, ...bundles.map((b) => b.col + 1)), topics }
}

/**
 * 묶음 안의 점 자리 (묶음 창의 작은 흐름): 여는 점(질문, 없으면 첫 점)이 첫 열에 홀로, 닫는 점(대표 명제)이 마지막 열에 홀로,
 * 그 사이는 묶음 안의 가장 긴 앞 경로(고리는 무시). 같은 열은 앞선 점의 줄 순서로 아래로 쌓는다. 점의 날짜 순서와 상관없다.
 */
export function layoutBundle(b: Bundle): { id: string; c: number; r: number }[] {
  const byId = new Map(b.nodes.map((n) => [n.id, n]))
  const col = new Map<string, number>()
  const state = new Map<string, 1 | 2>()
  const parents = (n: FlowNode) => n.from.filter((f) => byId.has(f.id) && f.id !== n.id)
  const colOf = (id: string): number => {
    if (state.get(id) === 2) return col.get(id)!
    if (state.get(id) === 1) return -1
    state.set(id, 1)
    const c = Math.max(-1, ...parents(byId.get(id)!).map((f) => colOf(f.id))) + 1
    state.set(id, 2); col.set(id, c)
    return c
  }
  for (const n of b.nodes) colOf(n.id)
  const head = byId.has(b.id) ? b.id : b.nodes[0]!.id
  const rest = b.nodes.filter((n) => n.id !== head && n.id !== b.answer?.id)
  // 여는 점만 첫 열에: 앞선 점이 묶음 밖에 있어 0열에 온 점은 한 열씩 민다
  if (rest.some((n) => col.get(n.id) === 0)) for (const n of rest) col.set(n.id, col.get(n.id)! + 1)
  col.set(head, 0)
  if (b.answer && b.answer.id !== head) col.set(b.answer.id, Math.max(0, ...rest.map((n) => col.get(n.id)!)) + 1)
  // 줄: 열 순서대로, 같은 열은 앞선 점의 줄(없으면 날짜 순)로
  const row = new Map<string, number>()
  const cols = [...new Set(col.values())].sort((x, y) => x - y)
  for (const c of cols) {
    const here = b.nodes.filter((n) => col.get(n.id) === c)
    const key = (n: FlowNode) => Math.min(Infinity, ...parents(n).map((f) => row.get(f.id) ?? Infinity))
    here.sort((x, y) => key(x) - key(y) || b.nodes.indexOf(x) - b.nodes.indexOf(y)).forEach((n, i) => row.set(n.id, i))
  }
  return b.nodes.map((n) => ({ id: n.id, c: col.get(n.id)!, r: row.get(n.id)! }))
}
