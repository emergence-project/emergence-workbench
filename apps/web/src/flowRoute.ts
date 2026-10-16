/**
 * 흐름 차트의 선 길 (10/16 사용자 승인 "노선도처럼"): 가로와 45° 사선만 쓰고 꺾이는 곳은 둥글게.
 * 가는 줄에 점이 없으면 줄 위로 가고, 점을 뚫게 될 때만 줄 사이 빈 곳(통로)으로 비켜 간다.
 * 줄 사이 통로에는 자리가 둘(위 줄에서 1/3 · 2/3 지점, 10/16 사용자)이다. 열 구간이 겹치는 선은 다른 자리로 가고, 같은 점에서 나온 선은 한 자리를 함께 쓴다.
 */

export type Cell = { c: number; r: number }

/**
 * straight: 같은 줄, 사이에 점 없음 · first: 첫 칸 사이에서 꺾어 받는 점의 줄로 · last: 내 줄로 가다가 마지막 칸 사이에서 꺾음 ·
 * channel: 받는 점 쪽 통로(ch 줄의 바로 위)를 따라 감
 */
export type RoutePlan = { kind: 'straight' | 'first' | 'last' } | { kind: 'channel'; ch: number }

/** 선 하나의 길을 고른다. busy(c, r)는 그 칸에 점이 있는지 */
export function planRoute(p: Cell, n: Cell, busy: (c: number, r: number) => boolean): RoutePlan {
  const free = (r: number) => { for (let c = Math.min(p.c, n.c) + 1; c < Math.max(p.c, n.c); c++) if (busy(c, r)) return false; return true }
  if (p.r === n.r) return free(n.r) ? { kind: 'straight' } : { kind: 'channel', ch: n.r }
  if (Math.abs(n.c - p.c) <= 1 || free(n.r)) return { kind: 'first' }
  if (free(p.r)) return { kind: 'last' }
  return { kind: 'channel', ch: n.r > p.r ? n.r : n.r + 1 }
}

/** 통로 선마다 자리 0(1/3 지점)·1(2/3 지점)을 준다: 같은 통로에서 열 구간이 겹치는 다른 점의 선과는 다른 자리 */
export function assignLanes(lines: { key: string; from: string; plan: RoutePlan; c0: number; c1: number }[]): Map<string, 0 | 1> {
  const out = new Map<string, 0 | 1>()
  const used = new Map<number, { from: string; c0: number; c1: number; lane: 0 | 1 }[]>()
  for (const l of [...lines].sort((a, b) => a.c0 - b.c0 || a.c1 - b.c1 || a.key.localeCompare(b.key))) {
    if (l.plan.kind !== 'channel') continue
    const list = used.get(l.plan.ch) ?? []
    const same = list.find((x) => x.from === l.from)
    const clash = (lane: 0 | 1) => list.some((x) => x.lane === lane && x.from !== l.from && x.c0 < l.c1 && l.c0 < x.c1)
    const lane: 0 | 1 = same ? same.lane : clash(0) && !clash(1) ? 1 : 0
    list.push({ from: l.from, c0: l.c0, c1: l.c1, lane })
    used.set(l.plan.ch, list)
    out.set(l.key, lane)
  }
  return out
}

export type Geo = { X(c: number): number; Y(r: number): number; CW: number; RH: number }

/** 길을 점의 목록으로: 사선은 두 열 사이 빈 곳 가운데에 두고, 점 둘레(20px)를 비운다 */
export function routePoints(p: Cell, n: Cell, plan: RoutePlan, g: Geo, lane: 0 | 1 = 0): [number, number][] {
  const x1 = g.X(p.c), y1 = g.Y(p.r), x2 = g.X(n.c), y2 = g.Y(n.r)
  const dir = Math.sign(n.c - p.c) || 1
  const room = Math.max(4, g.CW - 40)
  /** c열과 그다음 열 사이에서 ya → yb로 내려가는 사선 */
  const diag = (c: number, ya: number, yb: number): [number, number][] => {
    if (ya === yb) return []
    const gx = g.X(c) + dir * g.CW / 2, dx = Math.min(Math.abs(yb - ya), room)
    return [[gx - dir * dx / 2, ya], [gx + dir * dx / 2, yb]]
  }
  const last = n.c - dir
  if (plan.kind === 'straight') return [[x1, y1], [x2, y2]]
  if (plan.kind === 'first') return [[x1, y1], ...diag(p.c, y1, y2), [x2, y2]]
  if (plan.kind === 'last') return [[x1, y1], ...diag(last, y1, y2), [x2, y2]]
  if (plan.kind !== 'channel') return [[x1, y1], [x2, y2]]
  // 통로의 자리: 위 줄에서 1/3(0) · 2/3(1) 지점
  const cy = g.Y(plan.ch) - g.RH + g.RH * (lane ? 2 : 1) / 3
  return [[x1, y1], ...diag(p.c, y1, cy), ...diag(last, cy, y2), [x2, y2]]
}

/** 점 목록을 SVG 길로: 꺾이는 곳마다 r만큼 둥글게 (선분 반을 넘지 않게) */
export function roundedPath(pts: [number, number][], r = 8): string {
  const q = pts.filter((pt, i) => i === 0 || pt[0] !== pts[i - 1]![0] || pt[1] !== pts[i - 1]![1])
  const f = (v: number) => Math.round(v * 100) / 100
  if (q.length < 3) return q.map((pt, i) => `${i ? 'L' : 'M'}${f(pt[0])} ${f(pt[1])}`).join('')
  let d = `M${f(q[0]![0])} ${f(q[0]![1])}`
  for (let i = 1; i < q.length - 1; i++) {
    const [ax, ay] = q[i - 1]!, [bx, by] = q[i]!, [cx, cy] = q[i + 1]!
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by)
    const k = Math.min(r, l1 / 2, l2 / 2)
    const sx = bx - (bx - ax) / l1 * k, sy = by - (by - ay) / l1 * k
    const ex = bx + (cx - bx) / l2 * k, ey = by + (cy - by) / l2 * k
    d += `L${f(sx)} ${f(sy)}Q${f(bx)} ${f(by)} ${f(ex)} ${f(ey)}`
  }
  const z = q[q.length - 1]!
  return d + `L${f(z[0])} ${f(z[1])}`
}
