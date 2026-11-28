import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { DEFAULT_FIELD_ORDER, type FieldColor } from '@rw/core'
import type { KnowledgeTopic } from './api'
import { t as tl } from './i18n'

/**
 * 지식 지도의 계산 (2026-11-28 "지식 지도 방식 개선", 화면은 KnowledgeMap.tsx · KnowledgeGraph.tsx).
 * - 점 하나 = 주제 하나. 선은 개념 사이의 링크(본문 [[링크]] · related)를 방향 없이 하나로 (서로 링크해도 선 하나).
 * - 점 색 = 분야(분류의 맨 위), 점 모양 = 노트 상태. 연결 없는 점은 흐리게 자기 분야 군집 둘레에.
 * - 배치는 저장하지 않는다: 같은 자료면 늘 같은 자리 (d3-force를 정해진 시작점에서 정해진 횟수만 돌린다).
 */

export type NoteState = 'checked' | 'draft' | 'wip' | 'empty' | 'study'
export const NOTE_STATES: readonly NoteState[] = ['checked', 'draft', 'wip', 'empty', 'study']
export const STATE_NAME: Record<NoteState, string> = {
  checked: tl('확인함', 'Reviewed'), draft: tl('확인 전', 'Not reviewed'), wip: tl('작업 중', 'In progress'), empty: tl('빈 노트', 'Empty note'), study: tl('Study 원료만', 'Study material only'),
}
export const STATE_TIP: Record<NoteState, string> = {
  checked: tl('읽고 맞다고 확인한 개념노트', 'Concept notes you read and confirmed'),
  draft: tl('아직 확인하지 않은 개념노트 · 문헌 · Topic Review', 'Concept notes, literature and Topic Reviews not reviewed yet'),
  wip: tl('빈 절이나 TODO가 남은 개념노트', 'Concept notes with empty sections or TODOs'),
  empty: tl('제목 · 틀뿐인 개념노트', 'Concept notes with only a title or outline'),
  study: tl('개념노트 없이 Study 원료만 있는 주제', 'Topics with Study material but no concept note'),
}

/** 앱이 이미 하는 판단에서 (개념노트의 확인 · 미완성 · 빈 노트) */
export function noteState(t: KnowledgeTopic): NoteState {
  const c = t.concept
  if (!c) return t.status === 'study' ? 'study' : t.status === 'reviewed' ? 'checked' : 'draft'
  if (c.checked === 'ok') return 'checked'
  if (c.empty) return 'empty'
  if (c.unfinished?.length) return 'wip'
  return 'draft'
}

export const NO_FIELD = tl('분류 없음', 'No subject')
/** 분야 = 분류의 맨 위 */
export function fieldOf(t: KnowledgeTopic): string {
  const s = t.subject || (t.review ? 'Topic Review' : '')
  return s.split(/\s*›\s*/)[0] || NO_FIELD
}

/** 방향 없는 이웃 (지도에 있는 주제끼리만, 자기 자신 빼고) */
export function neighborsOf(topics: readonly KnowledgeTopic[]): Map<string, Set<string>> {
  const nb = new Map(topics.map((t) => [t.key, new Set<string>()]))
  for (const t of topics) for (const k of [...t.links, ...t.linkedBy]) if (k !== t.key && nb.has(k)) { nb.get(t.key)!.add(k); nb.get(k)!.add(t.key) }
  return nb
}

/** 분야마다 주제 수, 많은 것부터 (같으면 이름 차례). 분류 없음은 맨 뒤 */
export function fieldsBySize(topics: readonly KnowledgeTopic[]): { field: string; count: number }[] {
  const n = new Map<string, number>()
  for (const t of topics) n.set(fieldOf(t), (n.get(fieldOf(t)) ?? 0) + 1)
  return [...n].map(([field, count]) => ({ field, count }))
    .sort((a, b) => (a.field === NO_FIELD ? 1 : b.field === NO_FIELD ? -1 : b.count - a.count || a.field.localeCompare(b.field)))
}

/**
 * 분야 → 색 이름. chosen은 사용자가 고른 색(subjects.yaml `color:`). 안 고른 분야는 큰 분야부터
 * 기본 차례에서 아직 아무도 쓰지 않은 색을 받는다 (다 쓰면 다시 처음부터). 분류 없음은 늘 회색.
 */
export function fieldColors(fields: readonly string[], chosen: ReadonlyMap<string, FieldColor>): Map<string, FieldColor> {
  const out = new Map<string, FieldColor>()
  const used = new Set<FieldColor>()
  for (const f of fields) { const c = chosen.get(f); if (c && f !== NO_FIELD) { out.set(f, c); used.add(c) } }
  let i = 0
  for (const f of fields) {
    if (out.has(f)) continue
    if (f === NO_FIELD) { out.set(f, 'gray'); continue }
    const free = DEFAULT_FIELD_ORDER.find((c) => !used.has(c))
    const c = free ?? DEFAULT_FIELD_ORDER[i++ % DEFAULT_FIELD_ORDER.length]!
    out.set(f, c); used.add(c)
  }
  return out
}

/** 한 분야의 색을 바꾼다. 다른 분야가 쓰던 색이면 두 분야의 색을 맞바꾼다 (같은 색 둘은 생기지 않는다). 바뀐 분야 → 새 색 */
export function swapColor(colors: ReadonlyMap<string, FieldColor>, field: string, color: FieldColor): Map<string, FieldColor> {
  const changes = new Map<string, FieldColor>()
  const old = colors.get(field)
  if (!old || old === color) return changes
  for (const [f, c] of colors) if (f !== field && c === color) changes.set(f, old)
  changes.set(field, color)
  return changes
}

export interface Placed { x: number; y: number }
interface SimNode extends SimulationNodeDatum { id: string }
interface SimLink extends SimulationLinkDatum<SimNode> { cross?: boolean }

/** 주제가 이보다 많으면 배치를 덜 돌린다 (점이 수천 개여도 화면이 멈추지 않게) */
const HEAVY = 1500

/**
 * 전체 지도: 분야마다 중심을 원 위에 (큰 분야가 넓게), 분야 안에서 링크로 당기고 분야 사이 링크는 약하게.
 * 연결 없는 점은 중심으로 약하게 당겨 군집 둘레에 떠 있다. 같은 자료면 늘 같은 결과.
 */
export function wholeLayout(topics: readonly KnowledgeTopic[], nb: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Placed> {
  const field = new Map(topics.map((t) => [t.key, fieldOf(t)]))
  const sizes = fieldsBySize(topics)
  const total = sizes.reduce((s, f) => s + f.count + 8, 0)
  const center = new Map<string, Placed>()
  let acc = 0
  for (const { field: f, count } of sizes) {
    const share = count + 8
    const a = ((acc + share / 2) / total) * Math.PI * 2 - Math.PI / 2
    acc += share
    const r = sizes.length === 1 ? 0 : 470 * (0.75 + 0.25 * Math.min(1, count / 50))
    center.set(f, { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8 })
  }
  const keys = [...topics.map((t) => t.key)].sort()
  const nodes: SimNode[] = keys.map((k, i) => { const c = center.get(field.get(k)!)!; return { id: k, x: c.x + (i % 9) * 4, y: c.y + (i % 7) * 4 } })
  const links: SimLink[] = []
  for (const k of keys) for (const m of nb.get(k) ?? []) if (k < m) links.push({ source: k, target: m, cross: field.get(k) !== field.get(m) })
  const iso = (d: SimNode) => (nb.get(d.id)?.size ?? 0) === 0
  const cx = (d: SimNode) => center.get(field.get(d.id)!)!.x, cy = (d: SimNode) => center.get(field.get(d.id)!)!.y
  const sim = forceSimulation(nodes)
    .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => (l.cross ? 150 : 34)).strength((l) => (l.cross ? 0.02 : 0.5)))
    .force('charge', forceManyBody<SimNode>().strength((d) => (iso(d) ? -30 : -60)).distanceMax(240))
    .force('x', forceX<SimNode>(cx).strength((d) => (iso(d) ? 0.06 : 0.13)))
    .force('y', forceY<SimNode>(cy).strength((d) => (iso(d) ? 0.06 : 0.13)))
    .force('collide', forceCollide<SimNode>(9))
    .stop()
  sim.tick(nodes.length > HEAVY ? 150 : 420)
  return new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
}

/** 초점 보기: 가운데 주제와 depth 단계 안의 이웃. 가운데는 0,0에 고정 */
export function focusLayout(key: string, depth: 1 | 2, nb: ReadonlyMap<string, ReadonlySet<string>>): { pos: Map<string, Placed>; dist: Map<string, number> } {
  const dist = new Map([[key, 0]])
  let front = [key]
  for (let d = 1; d <= depth; d++) {
    const next: string[] = []
    for (const k of front) for (const m of [...(nb.get(k) ?? [])].sort()) if (!dist.has(m)) { dist.set(m, d); next.push(m) }
    front = next
  }
  const keys = [...dist.keys()]
  const nodes: SimNode[] = keys.map((k, i) => k === key ? { id: k, x: 0, y: 0, fx: 0, fy: 0 } : { id: k, x: Math.cos(i) * 100 * dist.get(k)!, y: Math.sin(i) * 100 * dist.get(k)! })
  const set = new Set(keys)
  const links: SimLink[] = []
  for (const k of keys) for (const m of nb.get(k) ?? []) if (k < m && set.has(m)) links.push({ source: k, target: m })
  const sim = forceSimulation(nodes)
    .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(90).strength(0.3))
    .force('charge', forceManyBody<SimNode>().strength(-500))
    .force('collide', forceCollide<SimNode>(34))
    .stop()
  sim.tick(300)
  return { pos: new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])), dist }
}

/** 점 크기 = 연결 수 */
export const nodeSize = (degree: number) => 3 + Math.sqrt(degree) * 2.3
