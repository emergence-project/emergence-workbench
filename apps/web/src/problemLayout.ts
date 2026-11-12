/**
 * 흐름 차트의 배치 (11/12 사용자 결정 "점 = 시도로 되살리기"): 질문에서 시도가 왼쪽에서 오른쪽으로 갈라지는 나무.
 * 칸(c)은 깊이(질문 0, 그 바로 아래 시도 1 …), 줄(r)은 가지다. 맏이는 부모와 같은 줄을 이어 가고, 그 아래 형제는 새 줄로 갈라진다
 * (옛 흐름 차트의 "노선도" 모양: 곧게 가는 선과 둥글게 꺾여 내려가는 가지).
 */

export type ChartCell = { c: number; r: number }
export type ChartLayout = { at: Map<string, ChartCell>; cols: number; rows: number }
export type ChartGeo = { X(c: number): number; Y(r: number): number; width: number; height: number }

/** 질문의 자리 (언제나 첫 칸 첫 줄) */
export const ROOT: ChartCell = { c: 0, r: 0 }
/** 칸 폭 · 질문 칸 폭 · 줄 높이 · 첫 줄의 점 가운데까지 · 마지막 줄 점 아래(이름 두 줄과 상태 한 줄) */
export const CW = 148, ROOT_W = 76, RH = 92, TOP = 28, FOOT = 74

/** attempts는 나무 순서(부모 다음에 자식, 형제는 순서대로). 부모가 목록에 없는 시도는 질문 바로 아래로 본다 */
export function layoutTree(attempts: readonly { id: string; parent?: string }[]): ChartLayout {
  const ids = new Set(attempts.map((a) => a.id))
  const kids = new Map<string, string[]>()
  const tops: string[] = []
  for (const a of attempts) {
    if (a.parent && a.parent !== a.id && ids.has(a.parent)) kids.set(a.parent, [...(kids.get(a.parent) ?? []), a.id])
    else tops.push(a.id)
  }
  const at = new Map<string, ChartCell>()
  let lane = 0, cols = 1
  const place = (id: string, c: number): number => {
    // 고리(부모가 서로를 가리킴)는 한 번만 놓는다
    if (at.has(id)) return at.get(id)!.r
    const cell: ChartCell = { c, r: lane }
    at.set(id, cell)
    cols = Math.max(cols, c + 1)
    const below = kids.get(id) ?? []
    if (!below.length) { lane++; return cell.r }
    below.forEach((k) => place(k, c + 1))
    return cell.r
  }
  tops.forEach((id) => place(id, 1))
  // 고리 안에만 있어 위에서 닿지 않은 시도
  for (const a of attempts) if (!at.has(a.id)) place(a.id, 1)
  return { at, cols, rows: Math.max(1, lane) }
}

/**
 * 시도 화면의 경로 차트에 그릴 시도: 질문에서 이 시도까지의 길(위에서 아래로)과 바로 아래 시도들. 나무 순서(부모 다음에 자식)로 돌려준다.
 * 부모가 목록에 없으면 거기서 길이 끝나고, 부모가 서로를 가리켜도 멈춘다
 */
export function nearOf<T extends { id: string; parent?: string }>(attempts: readonly T[], id: string): T[] {
  const byId = new Map(attempts.map((x) => [x.id, x]))
  const path: T[] = []
  for (let x = byId.get(id); x && !path.includes(x); x = x.parent ? byId.get(x.parent) : undefined) path.unshift(x)
  return [...path, ...attempts.filter((x) => x.parent === id && !path.includes(x))]
}

export function chartGeo(l: ChartLayout): ChartGeo {
  return {
    X: (c) => (c === 0 ? ROOT_W / 2 : ROOT_W + (c - 0.5) * CW),
    Y: (r) => TOP + r * RH,
    width: ROOT_W + (l.cols - 1) * CW,
    height: TOP + (l.rows - 1) * RH + FOOT,
  }
}

/**
 * 부모 점에서 자식 점으로 가는 선의 꺾이는 점들. 같은 줄이면 곧게, 아니면 부모 줄로 가다가 자식 칸 바로 앞에서 내려가 자식 줄로 든다
 * (형제의 선이 같은 세로 줄기를 함께 쓴다). roundedPath로 둥글린다
 */
export function branchPoints(from: ChartCell, to: ChartCell, g: ChartGeo): [number, number][] {
  const x1 = g.X(from.c), y1 = g.Y(from.r), x2 = g.X(to.c), y2 = g.Y(to.r)
  if (from.r === to.r) return [[x1, y1], [x2, y2]]
  const xb = x2 - CW / 2
  return [[x1, y1], [xb, y1], [xb, y2], [x2, y2]]
}

/** 점 목록을 SVG 길로: 꺾이는 곳마다 r만큼 둥글게 (선분의 반을 넘지 않게. 옛 흐름 차트의 선, 10/16 "노선도처럼") */
export function roundedPath(pts: [number, number][], r = 12): string {
  const q = pts.filter((pt, i) => i === 0 || pt[0] !== pts[i - 1]![0] || pt[1] !== pts[i - 1]![1])
  const f = (v: number) => Math.round(v * 100) / 100
  if (q.length < 3) return q.map((pt, i) => `${i ? 'L' : 'M'}${f(pt[0])} ${f(pt[1])}`).join('')
  let d = `M${f(q[0]![0])} ${f(q[0]![1])}`
  for (let i = 1; i < q.length - 1; i++) {
    const [ax, ay] = q[i - 1]!, [bx, by] = q[i]!, [cx, cy] = q[i + 1]!
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by)
    // 처음 · 끝 선분은 점 밑으로 들어가니 끝까지 둥글려도 된다 (가운데 선분은 반씩 나눠 쓴다)
    const k = Math.min(r, i === 1 ? l1 : l1 / 2, i === q.length - 2 ? l2 : l2 / 2)
    d += `L${f(bx - (bx - ax) / l1 * k)} ${f(by - (by - ay) / l1 * k)}Q${f(bx)} ${f(by)} ${f(bx + (cx - bx) / l2 * k)} ${f(by + (cy - by) / l2 * k)}`
  }
  const z = q[q.length - 1]!
  return d + `L${f(z[0])} ${f(z[1])}`
}

/** 글자 폭: 한글 · 한자 · 전각은 1, 그 밖(라틴 · 숫자 · 기호)은 0.55 */
const wide = (ch: string) => (/[ᄀ-￿]/.test(ch) ? 1 : 0.55)

/**
 * 점 아래 이름을 줄마다 폭 n(한글 글자 수) 안에서 최대 lines줄로 나눈다. 줄 끝 가까이에 빈칸이 있으면 거기서 넘기고,
 * 다 들어가지 않으면 마지막 줄을 …로 줄인다
 */
export function wrapName(s: string, n: number, lines = 2): string[] {
  const out: string[] = []
  let rest = s.trim().replace(/\s+/g, ' ')
  while (rest && out.length < lines) {
    let sum = 0, cut = rest.length, space = -1
    for (let i = 0; i < rest.length; i++) {
      sum += wide(rest[i]!)
      if (sum > n) { cut = i; break }
      if (rest[i] === ' ') space = i
    }
    if (cut === rest.length) { out.push(rest); rest = ''; break }
    if (out.length === lines - 1) { out.push(`${rest.slice(0, Math.max(1, cut - 1)).trimEnd()}…`); rest = ''; break }
    // 낱말 사이에서 넘긴다. 빈칸이 줄의 앞 절반에만 있으면 글자에서 끊는다
    const at = space >= cut / 2 ? space : cut
    out.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  return out
}
