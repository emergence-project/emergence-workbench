/**
 * 연구 흐름의 자리 정하기 (프로젝트의 흐름 화면, 10/14). 자리는 파일에 적지 않고 여기서 계산한다.
 * - 열: 앞선 점 가운데 가장 오른쪽 열 + 1. 앞선 점이 없으면 날짜가 더 이른 점들의 가장 오른쪽 열.
 * - 줄: 앞선 점의 줄을 이어받고, 그 칸이 차 있으면 가장 가까운 빈 줄. 첫 시작점의 갈래가 가운데 줄(중심선)이다.
 * - 손으로 옮긴 점(layout.yaml)은 그 칸에 두고, 나머지는 그 칸을 피해 위 규칙대로 놓는다.
 * - 보이는 줄 (10/16 사용자 승인): layout.yaml rows가 있으면 그 범위, 없으면 기본 줄 수. 끌기로는 늘지 않고 ＋ 줄 · ×로만 바뀐다.
 *   점이 있는 줄은 늘 보인다. 줄은 주제와 따로다 (10/20 사용자: 줄 이름은 layout.yaml rows.names, 줄 수도 주제 수와 상관없다).
 */
import type { FlowEdge, FlowNode } from './api'

export type Placed = { node: FlowNode; c: number; r: number }
export type FlowLine = { from: string; to: string; type: FlowEdge }
export type FlowLayout = {
  placed: Placed[]
  lines: FlowLine[]
  cols: number
  rows: number
  /** 중심선 (첫 시작점의 갈래) */
  mid: number
}

/** 기본으로 보이는 줄 수 (가운데 줄이 중심선) */
export const MIN_ROWS = 5

export function layoutFlow(all: FlowNode[], manual: Record<string, { c: number; r: number }> = {}, opts: { rows?: { top: number; bottom: number } | null; minRows?: number } = {}): FlowLayout {
  const byId = new Map(all.map((n) => [n.id, n]))
  const mine = [...all].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))
  const known = new Set(mine.map((n) => n.id))
  const fixed = (id: string) => known.has(id) ? manual[id] : undefined
  const parents = (n: FlowNode) => n.from.filter((f) => known.has(f.id) && f.id !== n.id).map((f) => f.id)

  // 열
  const col = new Map<string, number>()
  const busy = new Set<string>()
  const colOf = (n: FlowNode): number => {
    const known = col.get(n.id)
    if (known !== undefined) return known
    const m = fixed(n.id)
    if (m) { col.set(n.id, m.c); return m.c }
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
  for (const n of mine) {
    const m = fixed(n.id)
    if (m) { row.set(n.id, m.r); taken.add(key(m.c, m.r)) }
  }
  for (const n of order) {
    if (row.has(n.id)) continue
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
  const least = Math.max(1, opts.minRows ?? 0)
  let top: number, bottom: number
  if (opts.rows) ({ top, bottom } = opts.rows)
  else { const size = Math.max(MIN_ROWS, least); top = -Math.floor((size - 1) / 2); bottom = top + size - 1 }
  if (bottom - top + 1 < least) bottom = top + least - 1
  const mid = Math.max(0, -top, -lo)
  const rows = Math.max(bottom, hi) + mid + 1

  const placed = order.map((node) => ({ node, c: col.get(node.id)!, r: row.get(node.id)! + mid }))
  const lines: FlowLine[] = []
  for (const n of mine) for (const f of n.from) if (f.id !== n.id && known.has(f.id)) lines.push({ from: f.id, to: n.id, type: f.type })
  const cols = placed.length ? Math.max(...placed.map((p) => p.c)) + 1 : 0
  return { placed, lines, cols, rows, mid }
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
