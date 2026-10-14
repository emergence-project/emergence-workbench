/**
 * 연구 흐름의 자리 정하기 (주제 화면의 흐름, 10/14). 자리는 파일에 적지 않고 여기서 계산한다.
 * - 열: 주제 안의 앞선 점 가운데 가장 오른쪽 열 + 1. 앞선 점이 없으면 날짜가 더 이른 점들의 가장 오른쪽 열.
 * - 줄: 앞선 점의 줄을 이어받고, 그 칸이 차 있으면 가장 가까운 빈 줄. 첫 시작점의 갈래가 가운데 줄(중심선)이다.
 * - 다른 주제의 점은 그리지 않고, 받는 점 앞에 속이 빈 시작 표시(▷)로 알린다.
 */
import type { FlowEdge, FlowNode } from './api'

export type Placed = { node: FlowNode; c: number; r: number }
export type FlowLine = { from: string; to: string; type: FlowEdge }
export type FlowLayout = {
  placed: Placed[]
  lines: FlowLine[]
  /** 다른 주제에서 온 선: 받는 점 id → 보내는 점 */
  outside: Map<string, FlowNode[]>
  cols: number
  rows: number
  /** 중심선 (첫 시작점의 갈래) */
  mid: number
}

/** 기본으로 보이는 줄 수 (가운데 줄이 중심선) */
export const MIN_ROWS = 5

export function layoutFlow(all: FlowNode[], tid: string): FlowLayout {
  const byId = new Map(all.map((n) => [n.id, n]))
  const mine = all.filter((n) => n.topics.includes(tid))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))
  const inTopic = new Set(mine.map((n) => n.id))
  const parents = (n: FlowNode) => n.from.filter((f) => inTopic.has(f.id) && f.id !== n.id).map((f) => f.id)

  // 열
  const col = new Map<string, number>()
  const busy = new Set<string>()
  const colOf = (n: FlowNode): number => {
    const known = col.get(n.id)
    if (known !== undefined) return known
    if (busy.has(n.id)) return 0 // 고리: 끊는다
    busy.add(n.id)
    const ps = parents(n)
    let c: number
    if (ps.length) c = 1 + Math.max(...ps.map((p) => colOf(byId.get(p)!)))
    else {
      const earlier = mine.filter((m) => m !== n && (m.date ?? '') < (n.date ?? '') && col.has(m.id))
      c = earlier.length ? Math.max(...earlier.map((m) => col.get(m.id)!)) : 0
    }
    busy.delete(n.id)
    col.set(n.id, c)
    return c
  }
  for (const n of mine) colOf(n)

  // 줄 (0 = 중심선, 위는 음수)
  const order = [...mine].sort((a, b) => col.get(a.id)! - col.get(b.id)! || (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))
  const row = new Map<string, number>()
  const taken = new Set<string>()
  const key = (c: number, r: number) => `${c}:${r}`
  for (const n of order) {
    const c = col.get(n.id)!
    const p = parents(n).find((id) => row.has(id))
    const want = p !== undefined ? row.get(p)! : 0
    let r = want
    for (let d = 1; taken.has(key(c, r)); d++) {
      // 아래 먼저, 그다음 위 (+1, -1, +2, -2 …)
      r = want + (d % 2 ? (d + 1) / 2 : -d / 2)
    }
    row.set(n.id, r)
    taken.add(key(c, r))
  }
  const rs = [...row.values()]
  const lo = rs.length ? Math.min(...rs) : 0
  const hi = rs.length ? Math.max(...rs) : 0
  const half = (MIN_ROWS - 1) / 2
  const mid = Math.max(half, -lo)
  const rows = Math.max(MIN_ROWS, mid + hi + 1)

  const placed = order.map((node) => ({ node, c: col.get(node.id)!, r: row.get(node.id)! + mid }))
  const lines: FlowLine[] = []
  const outside = new Map<string, FlowNode[]>()
  for (const n of mine) for (const f of n.from) {
    if (f.id === n.id) continue
    if (inTopic.has(f.id)) lines.push({ from: f.id, to: n.id, type: f.type })
    else {
      const src = byId.get(f.id)
      if (src) outside.set(n.id, [...(outside.get(n.id) ?? []), src])
    }
  }
  const cols = placed.length ? Math.max(...placed.map((p) => p.c)) + 1 : 0
  return { placed, lines, outside, cols, rows, mid }
}

/** 고른 점의 계보: 앞선 점(조상)과 뒤따른 점(자손). 둘 다 그 점 자신을 담는다 */
export function lineageOf(id: string, lines: FlowLine[]): { up: Set<string>; down: Set<string> } {
  const walk = (step: (l: FlowLine, at: string) => string | null) => {
    const seen = new Set([id])
    const stack = [id]
    while (stack.length) {
      const at = stack.pop()!
      for (const l of lines) {
        const n = step(l, at)
        if (n && !seen.has(n)) { seen.add(n); stack.push(n) }
      }
    }
    return seen
  }
  return { up: walk((l, at) => (l.to === at ? l.from : null)), down: walk((l, at) => (l.from === at ? l.to : null)) }
}
