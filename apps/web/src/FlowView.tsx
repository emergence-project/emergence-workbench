/**
 * 연구 흐름 (프로젝트의 흐름 화면, 10/14 시안 "GAMC 연구 흐름"): 점 하나 = 생각의 한 걸음, 선 = "어디서 왔나".
 * 처음에는 주제 화면에 두었으나 생각은 주제를 넘나들어 프로젝트 하나에 한 흐름으로 옮겼다 (10/14 사용자). 주제는 필터로 굵게 본다.
 * 가로는 생각의 순서(날짜가 아니다), 기호는 종류, 색은 상태. 파일은 workbench/flow/*.yaml (에이전트도 쓴다).
 * 점을 누르면 아래에 자세히, 두 번 누르면 그 점을 가운데로. 계보(앞선 점·뒤따른 점)는 늘 크게 보인다.
 * 2단계 (10/14): ＋ 점으로 더하고, 점을 끌어 옮기고(layout.yaml), 자세히의 연필로 고치고, 사람 승인은 근거 표의 동그라미로.
 * 10/15: 고치기는 창이 아니라 자세히 자리에서 하고, 설명 칸은 노트처럼 그린다(줄 바꿈, $$…$$ 줄 수식, ![설명](그림) 그림).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ConflictError, LIBRARY_SCOPE, FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_KINDS, flowApi, type FlowCells, type FlowEdge, type FlowEvidence, type FlowKind, type FlowNode, type FlowProgress, type FlowResult, type FlowScan, type NoteRow } from './api'
import { layoutFlow, lineageOf, type FlowLayout } from './flowLayout'
import { MathText } from './cardParts'
import { StatusDot } from './StatusDot'
import { routeOfNote } from './RightSidebar'
import { go } from './router'
import { assignLanes, planRoute, roundedPath, routePoints } from './flowRoute'
import { store } from './store'
import { qk } from './queries'
import { setFlowSelection } from './flowSelection'
import { Dialog } from './dialogs'
import { NoteMarkdown } from './NoteMarkdown'
import { forgetFigures, useFigureList, useFigureUrl } from './figureEmbed'
import { figuresApi } from './api/figures'
import { askConfirm } from './askText'
import { flash } from './flash'
import { Icon } from './icons'
import { useDismiss } from './useDismiss'
import { t as tr } from './i18n'
import type { BlockStatus } from '@rw/core'

type Mark = FlowKind | 'theorem' | 'guess'
const KIND: Record<Mark, { act: boolean; name: () => string; def: () => string }> = {
  question: { act: false, name: () => tr('질문', 'Question'), def: () => tr('답을 구할 대상으로 세운 물음. 예상 답이 있으면 기호가 전구 속 ?로 바뀐다.', 'A question set out to be answered. With an expected answer the mark becomes a bulb with ?.') },
  guess: { act: false, name: () => tr('질문 (예상 답 있음)', 'Question (expected answer)'), def: () => tr('예상 답(가설)을 함께 적은 질문.', 'A question written with an expected answer (a hypothesis).') },
  finding: { act: false, name: () => tr('발견', 'Finding'), def: () => tr('계산이나 문헌에서 확인된 사실. 특정 모형·조건에서 성립이 확인되었으나 일반성은 확립되지 않았다.', 'A fact confirmed by a calculation or the literature, for given models or conditions; generality not established.') },
  theorem: { act: false, name: () => tr('정리', 'Theorem'), def: () => tr('증명으로 확립된 발견. 따로 고르지 않는다: 발견의 근거에 사람이 승인한 증명이 있으면 정리로 보인다.', 'A finding established by proof. Not chosen directly: a finding shows as a theorem when its evidence has a human-approved proof.') },
  calc: { act: true, name: () => tr('수치 계산', 'Numerical calculation'), def: () => tr('컴퓨터로 수치를 구하는 계산. 모형·크기·매개변수와 코드가 있고, 결과가 수치·그림이다.', 'A computation of numbers: model, size, parameters and code, with numbers or figures as the result.') },
  analytic: { act: true, name: () => tr('이론 계산', 'Analytic calculation'), def: () => tr('식으로 값이나 표현을 구하는 계산. 주장의 참을 보이는 것은 증명이다.', 'Deriving a value or expression by hand. Showing a claim true is a proof.') },
  proof: { act: true, name: () => tr('증명', 'Proof'), def: () => tr('증명 또는 유도. 가정에서 결론으로 가는 단계가 있다. 실패한 시도도 포함한다.', 'A proof or derivation, with steps from assumptions to conclusion. Failed attempts count too.') },
  literature: { act: true, name: () => tr('문헌', 'Literature'), def: () => tr('선행 연구의 검토. 검토 자체가 다음 걸음을 낳았을 때만 점이고, 근거로 쓴 논문은 받는 점 이름 뒤의 §로 보인다.', 'Reviewing prior work. A dot only when the review led to the next step; papers used as evidence show as § after the dot\'s name.') },
}
const FIELD: Record<string, () => string> = {
  question: () => tr('물음', 'Question'), guess: () => tr('예상 답', 'Expected answer'), motivation: () => tr('동기', 'Motivation'),
  statement: () => tr('진술', 'Statement'), condition: () => tr('조건', 'Conditions'),
  goal: () => tr('목적', 'Goal'), setup: () => tr('설정', 'Setup'), method: () => tr('방법', 'Method'), result: () => tr('결과', 'Result'),
  reading: () => tr('문헌', 'Reading'), gain: () => tr('얻은 것', 'What it gave'),
}
const EDGE: Record<string, () => string> = { origin: () => tr('발단', 'Origin'), support: () => tr('근거', 'Support'), refute: () => tr('반박', 'Refutes'), use: () => tr('사용', 'Uses') }
const EVK: Record<FlowEvidence['kind'], () => string> = { calc: () => tr('수치 계산', 'Numerics'), analytic: () => tr('이론 계산', 'Analytic'), proof: () => tr('증명', 'Proof'), other: () => tr('그 밖', 'Other'), paper: () => tr('논문', 'Paper') }

const markOf = (n: FlowNode): Mark => n.theorem ? 'theorem' : n.kind === 'question' && n.fields.guess ? 'guess' : n.kind
/** 그림의 상태 이름 (색 class) */
const stateOf = (n: FlowNode): 'open' | 'active' | 'paused' | 'solved' | 'refuted' | 'dropped' => n.progress !== 'done' ? n.progress : n.result ?? 'solved'
function stateName(n: FlowNode): string {
  const act = KIND[n.kind].act
  switch (stateOf(n)) {
    case 'open': return tr('미해결', 'Open')
    case 'active': return tr('진행', 'In progress')
    case 'paused': return tr('멈춤', 'Paused')
    case 'solved': return act ? tr('끝남 · 성공', 'Done · succeeded') : tr('끝남 · 해결', 'Done · solved')
    case 'refuted': return act ? tr('끝남 · 실패', 'Done · failed') : tr('끝남 · 반증', 'Done · refuted')
    case 'dropped': return tr('끝남 · 폐기', 'Done · dropped')
  }
}
const DOT: Record<ReturnType<typeof stateOf>, BlockStatus> = { open: 'in-progress', active: 'in-progress', paused: 'blocked', solved: 'solved', refuted: 'stopped', dropped: 'stopped' }

/** 점 기호: 진술은 원, 행위는 둥근 네모. 속이 빈 것은 미해결(점선)과 폐기 */
function MarkSvg({ m, x, y, state, big }: { m: Mark; x: number; y: number; state: string; big?: boolean }) {
  const r = big ? 14 : 13
  const body = KIND[m].act
    ? <rect className="fl-b" x={x - r + 1} y={y - r + 1} width={2 * r - 2} height={2 * r - 2} rx={5} />
    : <circle className="fl-b" cx={x} cy={y} r={r} />
  let g: ReactNode
  if (m === 'finding') g = <>
    <path className="fl-gs" d={`M${x - 9.5} ${y}Q${x} ${y - 9.5} ${x + 9.5} ${y}Q${x} ${y + 9.5} ${x - 9.5} ${y}Z`} />
    <circle className="fl-g" cx={x} cy={y} r={4.3} />
  </>
  else if (m === 'guess') g = <>
    <path className="fl-gs" d={`M${x - 3} ${y + 5.2}h6M${x - 2.2} ${y + 7.6}h4.4M${x - 3.2} ${y + 3}c-4.6-2.6-4.6-12 3.2-12s7.8 9.4 3.2 12z`} />
    <text className="fl-g" x={x} y={y + 1.6} fontSize={8.5} fontWeight={800} textAnchor="middle">?</text>
  </>
  else {
    const ch = { question: '?', theorem: 'T', calc: 'π', analytic: '∫', proof: '∴', literature: '§' }[m]
    const serif = m === 'theorem' || m === 'calc'
    const fs = { '∴': 20, '∫': 14, T: 17, 'π': 18 }[ch] ?? 15
    const dy = { '∴': 6.5, '∫': 5, T: 6 }[ch] ?? 5.5
    g = <text className={`fl-g${serif ? ' serif' : ''}${m === 'calc' ? ' italic' : ''}`} x={x} y={y + dy} fontSize={fs} fontWeight={serif ? 700 : 800} textAnchor="middle">{ch}</text>
  }
  return <g className={`fl-m s-${state}`}>{body}{g}</g>
}
const MarkIcon = ({ n, size = 20 }: { n: FlowNode; size?: number }) =>
  <svg className="fl-icon" width={size} height={size} viewBox="0 0 30 30" aria-hidden><MarkSvg m={markOf(n)} x={15} y={15} state={stateOf(n)} /></svg>

const ZS = [0.5, 0.67, 0.8, 1, 1.25, 1.5]
const CW0 = 116, RH0 = 76, TOP = 30, LEFT = 30
const H_KEY = 'rw-flow-h', Z_KEY = 'rw-flow-zoom', SEL_KEY = 'rw-flow-sel', NAME_KEY = 'rw-flow-names'
const DEFAULT_H = TOP + 5 * RH0 + 16

type TopicRef = { id: string; title: string }

/** 다른 화면(노트의 오른쪽 사이드바)에서 점을 열 때: 흐름 화면에서 고르고 보이게 한다 */
let revealNext: string | null = null
export function openFlowDot(rid: string, n: Pick<FlowNode, 'id'>) {
  store.set(SEL_KEY, { ...store.get<Record<string, string>>(SEL_KEY, {}), [rid]: n.id })
  revealNext = n.id
  go({ page: 'flow', rid })
}

/** 흐름 자료 읽기 (화면 캐시 qk.flow: 흐름 파일 알림이 오면, 화면이 쓰면 다시 읽는다) */
const EMPTY: FlowScan = { nodes: [], diagnostics: [], layout: {}, rows: null }
function useFlow(rid: string) {
  const client = useQueryClient()
  const { data } = useQuery({ queryKey: qk.flow(rid), queryFn: () => flowApi(rid).scan().catch(() => EMPTY) })
  const reload = useCallback(() => { void client.invalidateQueries({ queryKey: qk.flow(rid) }) }, [client, rid])
  return { scan: data ?? null, reload }
}

/** 흐름 화면 (왼쪽 사이드바의 "흐름"): 프로젝트의 점 전부. topic이면 그 주제의 점을 굵게 */
export function FlowPage({ rid, topic, notes, topics }: { rid: string; topic?: string; notes: NoteRow[]; topics: TopicRef[] }) {
  const { scan, reload } = useFlow(rid)
  const lay = useMemo(() => scan ? layoutFlow(scan.nodes, scan.layout, { rows: scan.rows, minRows: topics.length }) : null, [scan, topics.length])
  return <div className="ws-doc" data-ui="흐름 화면">
    <section className="pane">
      <div className="scroll"><div className="page-body fl-page">
        {scan && lay ? <FlowChart rid={rid} focus={topic && topics.some((x) => x.id === topic) ? topic : undefined} all={scan.nodes} cells={scan.layout} lay={lay} warn={scan.diagnostics.length} notes={notes} topics={topics} reload={reload} />
          : <p className="muted">{tr('불러오는 중…', 'Loading…')}</p>}
      </div></div>
    </section>
  </div>
}

/** 주제 화면의 한 줄: 이 주제의 점 수와 흐름 화면으로 가는 링크 (흐름은 프로젝트 하나에 하나) */
export function TopicFlowLink({ rid, tid }: { rid: string; tid: string }) {
  const { scan } = useFlow(rid)
  if (!scan) return null
  const n = scan.nodes.filter((x) => x.topics.includes(tid)).length
  return <p className="fl-topic-link" data-ui="주제 흐름 링크">
    <span className="muted">{n ? tr(`이 주제의 흐름 점 ${n}개`, `${n} flow dots in this topic`) : tr('이 주제의 흐름 점이 없습니다', 'No flow dots in this topic')}</span>
    <button className="a" onClick={() => go({ page: 'flow', rid, topic: tid })}>{tr('흐름에서 보기', 'View in flow')}</button>
  </p>
}

type Cell = { c: number; r: number }

/** 차트 안의 글자 버튼 (＋ 줄 · ×): 누르기와 Enter·Space */
function RowButton({ x, y, label, onPress, children, 'data-ui': ui }: { x: number; y: number; label: string; onPress(): void; children: ReactNode; 'data-ui': string }) {
  return <g className="fl-rowbtn" data-ui={ui} role="button" tabIndex={0} aria-label={label}
    onClick={(e) => { e.stopPropagation(); onPress() }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress() } }}>
    <title>{label}</title>
    <text x={x} y={y}>{children}</text>
  </g>
}

function FlowChart({ rid, focus, all, cells, lay, warn, notes, topics, reload }: {
  rid: string; focus?: string; all: FlowNode[]; cells: FlowCells; lay: FlowLayout; warn: number; notes: NoteRow[]; topics: TopicRef[]; reload(): void
}) {
  const ids = new Set(lay.placed.map((p) => p.node.id))
  const [sel, setSelState] = useState<string | null>(() => { const s = store.get<Record<string, string>>(SEL_KEY, {})[rid]; return s && ids.has(s) ? s : null })
  // 누른 점의 자세히가 화면 밖이면 보이게 (처음 열 때 기억한 점으로는 움직이지 않는다)
  const reveal = useRef(revealNext !== null && revealNext === sel)
  useEffect(() => { if (revealNext && revealNext === sel) { revealNext = null; requestAnimationFrame(() => center(sel)) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * 새 점 (10/16 사용자 승인 "이어서 · 지정 · 새로 시작"): 창 없이 차트에 점선 점이 생기고 자세히 자리에서 바로 적는다.
   * from이 비면 시작점: 저장하면 맨 왼쪽 열의 새 아랫줄에 둔다 (layout.yaml)
   */
  const [draft, setDraft] = useState<{ from: string[] } | null>(null)
  /** 앞선 점 고르기: 차트에서 누른 점을 모은다 */
  const [picking, setPicking] = useState<string[] | null>(null)
  const [editing, setEditing] = useState<FlowNode | null>(null)
  // 점 끌어 옮기기: 5px 넘게 움직이면 끌기, 놓은 칸이 그 점의 자리가 된다 (layout.yaml)
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const [ghost, setGhost] = useState<Cell | null>(null)
  const api = useMemo(() => flowApi(rid), [rid])
  const fail = (e: unknown) => { flash(e instanceof ConflictError ? tr('그새 파일이 바뀌었습니다. 다시 읽었으니 한 번 더 해 주세요.', 'The file changed in the meantime. It has been reloaded; try again.') : (e as Error).message); reload() }
  const place = (id: string, at: Cell | null) => api.place({ id, at }).then(reload, fail)
  const setSel = (id: string | null) => { if (id !== sel) setEditing(null); reveal.current = !!id; setSelState(id); store.set(SEL_KEY, { ...store.get<Record<string, string>>(SEL_KEY, {}), [rid]: id ?? undefined }) }
  const [zoom, setZoomState] = useState<{ x: number; y: number; fit: boolean }>(() => store.get(Z_KEY, { x: 1, y: 1, fit: false }))
  const setZoom = (z: typeof zoom) => { setZoomState(z); store.set(Z_KEY, z) }
  // 점 이름 (짧은 제목) 켜기·끄기 (10/16): 꺼도 고른 점과 그 앞뒤 점의 이름은 보인다
  const [names, setNamesState] = useState(() => store.get<boolean>(NAME_KEY, true))
  const setNames = (v: boolean) => { setNamesState(v); store.set(NAME_KEY, v) }
  const [height, setHeightState] = useState(() => store.get<number>(H_KEY, DEFAULT_H))
  const setHeight = (h: number) => { setHeightState(h); store.set(H_KEY, h) }
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(800)
  const hasDots = lay.placed.length > 0
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasDots])

  const fitCW = Math.max(32, Math.min(CW0, (boxW - LEFT - 8) / Math.max(1, lay.cols)))
  const CW = zoom.fit ? fitCW : CW0 * zoom.x
  const RH = RH0 * zoom.y
  const compact = CW < 64 || RH < 48
  const X = (c: number) => LEFT + CW * c + CW / 2
  const Y = (r: number) => TOP + RH * r + RH / 2 - 6
  const cellAt = (e: React.PointerEvent): Cell | null => {
    const el = box.current
    if (!el) return null
    const b = el.getBoundingClientRect()
    const x = e.clientX - b.left + el.scrollLeft, y = e.clientY - b.top + el.scrollTop
    const c = Math.max(0, Math.min(lay.cols, Math.floor((x - LEFT) / CW)))
    const r = Math.max(0, Math.min(lay.rows - 1, Math.floor((y - TOP) / RH)))
    return { c, r: r - lay.mid }
  }
  const W = LEFT + CW * (lay.cols + 1)
  const at = new Map(lay.placed.map((p) => [p.node.id, p]))
  const byId = new Map(all.map((n) => [n.id, n]))
  // 새 점의 칸: 이으면 앞선 점들의 다음 열, 첫 앞선 점의 줄에서 가까운 빈 줄. 시작점이면 맨 왼쪽 열의 새 아랫줄
  const draftAt = (() => {
    if (!draft) return null
    const ps = draft.from.map((id) => at.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
    if (!ps.length) return { c: 0, r: lay.placed.length ? Math.max(...lay.placed.map((p) => p.r)) + 1 : lay.mid }
    const c = 1 + Math.max(...ps.map((p) => p.c))
    const used = new Set(lay.placed.filter((p) => p.c === c).map((p) => p.r))
    let r = ps[0]!.r
    for (let d = 1; used.has(r); d++) r = ps[0]!.r + (d % 2 ? (d + 1) / 2 : -d / 2)
    return { c, r }
  })()
  const draftNode = draft ? newDraftNode(draft.from.map((id) => byId.get(id)).filter((m): m is FlowNode => !!m), focus) : null
  // 줄 더하기·빼기 (10/16 사용자 승인): 맨 위·맨 아래 가장자리의 ＋ 줄, 빈 가장자리 줄의 ×. 줄 수는 주제 수 밑으로 줄지 않는다
  const least = Math.max(1, topics.length)
  const setRows = (top: number, bottom: number) => api.rows({ top, bottom }).then(reload, fail)
  const rowTop = -lay.mid, rowBottom = lay.rows - 1 - lay.mid
  const emptyRow = (r: number) => r !== lay.mid && !lay.placed.some((p) => p.r === r) && draftAt?.r !== r
  const canDrop = (r: number) => lay.rows > least && (r === 0 || r === lay.rows - 1) && emptyRow(r)
  const ROW_ADD = 28
  const H = TOP + RH * Math.max(lay.rows, draftAt ? draftAt.r + 1 : 0) + 1 + ROW_ADD
  const lin = sel && at.has(sel) ? lineageOf(sel, lay.lines) : null
  const inLin = (id: string) => !!lin && (lin.up.has(id) || lin.down.has(id))
  const edgeOn = (a: string, b: string) => !!lin && ((lin.up.has(a) && lin.up.has(b)) || (lin.down.has(a) && lin.down.has(b)))

  /** 두 번 누른 점을 가운데로 (가로·세로 모두) */
  const center = (id: string) => {
    const p = at.get(id), el = box.current
    if (!p || !el) return
    el.scrollTo({ left: X(p.c) - el.clientWidth / 2, top: Y(p.r) - el.clientHeight / 2, behavior: 'smooth' })
  }
  // 바탕을 끌면 화면을 옮긴다
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('.fl-node, .fl-rowbtn') || !box.current) return
    pan.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop }
    box.current.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const p = pan.current, el = box.current
    if (!p || !el) return
    el.scrollLeft = p.l - (e.clientX - p.x)
    el.scrollTop = p.t - (e.clientY - p.y)
  }
  const onUp = () => { pan.current = null }
  // 크기 막대: 끌어 높이를 바꾸고, 두 번 누르면 처음 높이로
  const sizing = useRef<{ y: number; h: number } | null>(null)

  const step = (axis: 'x' | 'y', d: number) => {
    const i = ZS.indexOf(zoom[axis])
    const z = ZS[Math.max(0, Math.min(ZS.length - 1, (i < 0 ? 3 : i) + d))]!
    setZoom({ ...zoom, [axis]: z, fit: axis === 'x' ? false : zoom.fit })
  }

  // 선 길 (노선도처럼, flowRoute.ts): 점을 뚫지 않게 줄 위나 줄 사이 통로로 간다
  const busyCells = new Set(lay.placed.map((q) => `${q.c}:${q.r}`))
  const busy = (c: number, r: number) => busyCells.has(`${c}:${r}`)
  const geo = { X, Y, CW, RH }
  const plans = new Map(lay.lines.map((l) => { const p = at.get(l.from)!, n = at.get(l.to)!; return [`${l.from}>${l.to}`, { key: `${l.from}>${l.to}`, from: l.from, plan: planRoute(p, n, busy), c0: Math.min(p.c, n.c), c1: Math.max(p.c, n.c) }] }))
  const lanes = assignLanes([...plans.values()])
  const route = (p: { c: number; r: number }, n: { c: number; r: number }, key?: string) =>
    roundedPath(routePoints(p, n, (key && plans.get(key)?.plan) || planRoute(p, n, busy), geo, key ? lanes.get(key) ?? 0 : 0))

  const s = sel ? byId.get(sel) : undefined
  /** 점 누르기: 앞선 점을 고르는 중이면 넣고 빼기, 아니면 고르기 */
  const tap = (id: string) => { if (picking) setPicking(picking.includes(id) ? picking.filter((x) => x !== id) : [...picking, id]); else setSel(id) }
  const startDraft = (from: string[]) => { setPicking(null); setEditing(null); setDraft({ from }) }
  const madeDraft = (made: FlowNode) => {
    const cell = draft && !draft.from.length && draftAt && lay.placed.length ? { c: 0, r: draftAt.r - lay.mid } : null
    setDraft(null)
    setSel(made.id)
    if (cell) void place(made.id, cell)
    else reload()
  }
  const draftEditor = draftNode && <FlowEditor key="new" rid={rid} n={draftNode} create all={all} notes={notes} topics={topics} onClose={() => setDraft(null)} onSaved={(made) => made ? madeDraft(made) : setDraft(null)} />
  // 고른 점을 오른쪽 사이드바 기록에 알린다: 거기서 적는 기록이 이 점에 붙는다.
  useEffect(() => { setFlowSelection(s ? { rid, id: s.id, title: s.title } : null) }, [rid, s?.id, s?.title]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setFlowSelection(null), [])
  return (
    <section className="fl" data-ui="흐름">
      <div className="fl-bar">
        <h2 className="fl-title">{tr('흐름', 'Flow')}</h2>
        <span className="fl-sum">{tr(`점 ${lay.placed.length}`, `${lay.placed.length} dots`)}{warn > 0 && <span className="fl-warn" title={tr('형식에 맞지 않는 곳이 있습니다. pnpm agent:check로 봅니다.', 'Some files do not match the format. See pnpm agent:check.')}> · {tr(`형식 경고 ${warn}`, `${warn} format warnings`)}</span>}</span>
        <span className="sp" />
        {topics.length > 0 && <label className="fl-filter" data-ui="흐름 주제 필터"><span className="fl-zl">{tr('주제', 'Topic')}</span>
          <select value={focus ?? ''} onChange={(e) => go({ page: 'flow', rid, ...(e.target.value && { topic: e.target.value }) })}>
            <option value="">{tr('전체', 'All')}</option>
            {topics.map((x) => <option key={x.id} value={x.id}>{x.title}{` (${all.filter((n) => n.topics.includes(x.id)).length})`}</option>)}
          </select></label>}
        {lay.placed.length > 0 && <span className="fl-zoom" data-ui="흐름 확대">
          <span className="fl-zl">{tr('가로', 'Width')}</span>
          <button className="icon-btn" title={tr('가로 좁히기', 'Narrower')} aria-label={tr('가로 좁히기', 'Narrower')} onClick={() => step('x', -1)}>−</button>
          <button className="icon-btn" title={tr('가로 넓히기', 'Wider')} aria-label={tr('가로 넓히기', 'Wider')} onClick={() => step('x', 1)}>＋</button>
          <span className="fl-zl">{tr('세로', 'Height')}</span>
          <button className="icon-btn" title={tr('세로 좁히기', 'Shorter')} aria-label={tr('세로 좁히기', 'Shorter')} onClick={() => step('y', -1)}>−</button>
          <button className="icon-btn" title={tr('세로 넓히기', 'Taller')} aria-label={tr('세로 넓히기', 'Taller')} onClick={() => step('y', 1)}>＋</button>
          <button className={`btn small${names ? ' on' : ''}`} data-ui="흐름 이름 보기" aria-pressed={names} title={tr('점 이름 켜기·끄기 (꺼도 고른 점과 그 앞뒤 점은 보임)', 'Show or hide dot names (the selected dot and its lineage still show)')} onClick={() => setNames(!names)}>{tr('이름', 'Names')}</button>
          <button className={`btn small${zoom.fit ? ' on' : ''}`} aria-pressed={zoom.fit} title={tr('가로를 상자 폭에 맞추기', 'Fit the width to the box')} onClick={() => setZoom({ ...zoom, fit: !zoom.fit })}>{tr('전체 보기', 'Fit')}</button>
        </span>}
        <button className="btn small" data-ui="흐름 점 더하기" title={tr('앞선 점 없이 새로 시작하는 점을 더합니다. 이어지는 점은 점을 누르고 자세히의 ＋로', 'Add a dot that starts fresh. For a following dot, select a dot and use ＋ in its details')}
          onClick={() => startDraft([])}>＋ {tr('시작점', 'Start')}</button>
      </div>
      {lay.placed.length === 0 && (draftEditor || <p className="fl-hint muted">{tr('흐름의 점이 없습니다. ＋ 시작점으로 첫 걸음(질문·계산·증명…)을 더합니다.', 'No dots yet. Add the first step (a question, calculation, proof…) with ＋ Start.')}</p>)}
      {lay.placed.length > 0 && <><div className="fl-box" ref={box} style={{ height }} data-ui="흐름 차트" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClick={(e) => { if (!picking && !(e.target as Element).closest('.fl-node')) setSel(null) }}>
        <svg className="fl-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('연구 흐름', 'Research flow')}>
          {Array.from({ length: lay.cols }, (_, c) => c > 0 && <line key={`c${c}`} className="fl-grid" x1={X(c)} y1={1} x2={X(c)} y2={H} />)}
          {Array.from({ length: lay.rows }, (_, r) => <line key={`r${r}`} className={r === lay.mid ? 'fl-mid' : 'fl-grid'} x1={LEFT} y1={Y(r)} x2={W} y2={Y(r)} />)}
          {lay.lines.map((l) => {
            const p = at.get(l.from)!, n = at.get(l.to)!
            const x1 = X(p.c), y1 = Y(p.r), x2 = X(n.c), y2 = Y(n.r)
            const on = edgeOn(l.from, l.to)
            const cls = `fl-e${on ? ' on' : ''}${l.type === 'use' ? ' use' : p.node.kind === 'literature' ? ' lit' : ''}`
            return <g key={`${l.from}>${l.to}`}>
              <path className={cls} d={route(p, n, `${l.from}>${l.to}`)}><title>{EDGE[l.type]!()}</title></path>
              {l.type === 'refute' && <path className={`fl-bar-x${on ? ' on' : ''}`} d={`M${x2 - 24} ${y2 - 7}V${y2 + 7}`} />}
            </g>
          })}
          {draftAt && <g className="fl-draft" data-ui="흐름 새 점">
            {draft!.from.map((id) => { const p = at.get(id); return p && <path key={id} className="fl-e fl-draft-e" d={route(p, draftAt)} /> })}
            {!draft!.from.length && <path className="fl-start" d={`M${LEFT - 22} ${Y(draftAt.r) - 7}L${LEFT - 13} ${Y(draftAt.r)}L${LEFT - 22} ${Y(draftAt.r) + 7}Z`} />}
            <circle className="fl-ghost" cx={X(draftAt.c)} cy={Y(draftAt.r)} r={14} />
            <text className="fl-name strong" x={X(draftAt.c)} y={Y(draftAt.r) + 30} textAnchor="middle">{draftNode?.short || tr('새 점', 'New dot')}</text>
          </g>}
          <RowButton data-ui="흐름 줄 더하기" x={8} y={14} label={tr('위에 줄 더하기', 'Add a row above')} onPress={() => setRows(rowTop - 1, rowBottom)}>＋ {tr('줄', 'Row')}</RowButton>
          <RowButton data-ui="흐름 줄 더하기" x={8} y={H - 12} label={tr('아래에 줄 더하기', 'Add a row below')} onPress={() => setRows(rowTop, rowBottom + 1)}>＋ {tr('줄', 'Row')}</RowButton>
          {[0, lay.rows - 1].filter((r, i, a) => a.indexOf(r) === i && canDrop(r)).map((r) =>
            <RowButton key={`x${r}`} data-ui="흐름 줄 빼기" x={LEFT - 24} y={Y(r) + 5} label={tr('빈 줄 빼기', 'Remove this empty row')} onPress={() => setRows(r === 0 ? rowTop + 1 : rowTop, r === 0 ? rowBottom : rowBottom - 1)}>×</RowButton>)}
          {ghost && <rect className="fl-ghost" x={LEFT + CW * ghost.c + 4} y={TOP + RH * (ghost.r + lay.mid) + 2} width={CW - 8} height={RH - 4} rx={8} />}
          {lay.placed.map(({ node: n, c, r }) => {
            const picked = !!picking?.includes(n.id) || !!draft?.from.includes(n.id)
            const x = X(c), y = Y(r), on = n.id === sel && !picking, lg = inLin(n.id) && !on && !picked
            const hot = !!focus && n.topics.includes(focus)
            const start = !n.from.length
            // 근거로 단 논문은 이름 뒤 작은 §(둘 이상이면 수)로 (10/16: 점 위 배지 대신)
            const cites = n.evidence.filter((e) => e.kind === 'paper' && e.ref)
            return <g key={n.id} className={`fl-node${on ? ' sel' : ''}${picked ? ' pick' : ''}`} tabIndex={0} role="button" data-id={n.id}
              aria-label={`${n.short}: ${KIND[markOf(n)].name()}, ${stateName(n)}`}
              onPointerDown={(e) => { if (e.button === 0) { drag.current = { id: n.id, x: e.clientX, y: e.clientY, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId) } }}
              onPointerMove={(e) => {
                const d = drag.current
                if (!d || d.id !== n.id || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5)) return
                d.moved = true
                setGhost(cellAt(e))
              }}
              onPointerUp={(e) => {
                const d = drag.current
                drag.current = null
                if (!d?.moved) return
                dragged.current = true
                setGhost(null)
                const to = cellAt(e)
                if (to && (to.c !== c || to.r !== r - lay.mid)) void place(n.id, to)
              }}
              onPointerCancel={() => { drag.current = null; setGhost(null) }}
              onClick={() => { if (dragged.current) { dragged.current = false; return } tap(n.id) }} onDoubleClick={() => { setSel(n.id); center(n.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(n.id) } }}>
              {/* 가리키면 종류와 이름 (10/16 사용자: 기호의 뜻이 바로 오지 않을 때) */}
              <title>{`${KIND[markOf(n)].name()} · ${n.short}${n.title && n.title !== n.short ? `\n${n.title}` : ''}`}</title>
              {hot && <rect className="fl-focus" x={x - CW / 2 + 4} y={y - 18} width={CW - 8} height={compact ? 34 : 52} rx={6} />}
              <rect className="fl-hit" x={x - CW / 2 + 4} y={y - 18} width={CW - 8} height={compact ? 34 : 52} rx={6} />
              {/* 고른 점 · 이을 점 · 계보는 점에 바짝 두른 테두리로 (10/16 사용자: 둥근 네모 대신) */}
              {(lg || on || picked) && (KIND[markOf(n)].act
                ? <rect className={`fl-ring${on ? ' sel' : picked ? ' pick' : ''}`} x={x - 18} y={y - 18} width={36} height={36} rx={8} />
                : <circle className={`fl-ring${on ? ' sel' : picked ? ' pick' : ''}`} cx={x} cy={y} r={19} />)}
              <MarkSvg m={markOf(n)} x={x} y={y} state={stateOf(n)} big={on || lg || hot || picked} />
              {/* 시작점 ▶는 차트 왼쪽 벽에 붙여 한 세로줄에 세운다 (10/15 12:11 제안). 그 줄에서 앞에 다른 점이 없으면 점까지 선으로 잇는다 */}
              {start && <g className="fl-startmark"><title>{tr('시작점: 앞선 점이 없다', 'Start: no earlier dot')}</title>
                <path className="fl-start" d={`M${LEFT - 22} ${y - 7}L${LEFT - 13} ${y}L${LEFT - 22} ${y + 7}Z`} />
                {!lay.placed.some((o) => o.r === r && o.c < c) && <path className="fl-start-line" d={`M${LEFT - 13} ${y}H${x - 20}`} />}
              </g>}
              {n.end && <line className="fl-end" x1={x + 20} y1={y - 10} x2={x + 20} y2={y + 10}><title>{tr('갈래 종결', 'Branch closed')}</title></line>}
              {on || (names ? !compact : lg || hot || picked) ? <text className={`fl-name${on || lg || hot || picked ? ' strong' : ''}`} x={x} y={y + (compact ? 27 : 30)} textAnchor="middle">{n.short}{cites.length > 0 && <tspan className="fl-cite" dx={3}>§{cites.length > 1 ? cites.length : ''}<title>{cites.map((e) => e.title ?? e.ref).join('\n')}</title></tspan>}</text> : null}
            </g>
          })}
        </svg>
      </div>
      <div className="fl-size" data-ui="흐름 크기 조절" role="separator" aria-orientation="horizontal" title={tr('끌어 높이 바꾸기 · 두 번 누르면 처음 높이', 'Drag to resize · double-click to reset')}
        onPointerDown={(e) => { sizing.current = { y: e.clientY, h: height }; (e.target as Element).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { const s0 = sizing.current; if (s0) setHeightState(Math.max(160, Math.min(1200, s0.h + e.clientY - s0.y))) }}
        onPointerUp={() => { if (sizing.current) { sizing.current = null; setHeight(box.current?.clientHeight ?? height) } }}
        onDoubleClick={() => setHeight(DEFAULT_H)} />
      {draftEditor ? draftEditor
        : picking ? <div className="fl-card fl-picking" data-ui="흐름 앞선 점 고르기">
          <div className="fl-head"><span className="fl-short">{tr('앞선 점 고르기', 'Choose earlier dots')}</span>
            <span className="fl-tools">
              <button className="btn" onClick={() => setPicking(null)}>{tr('취소', 'Cancel')}</button>
              <button className="btn primary" disabled={!picking.length} onClick={() => startDraft(picking)}>{tr('완료', 'Done')}</button>
            </span></div>
          <p className="fl-help">{picking.length
            ? tr(`새 점이 ${picking.map((id) => byId.get(id)?.short ?? id).join(' · ')}에서 이어집니다. 점을 더 누르면 더하고, 다시 누르면 뺍니다.`, `The new dot follows ${picking.map((id) => byId.get(id)?.short ?? id).join(' · ')}. Click more dots to add; click again to remove.`)
            : tr('차트에서 새 점이 이어질 점을 누릅니다. 여러 개를 고를 수 있습니다.', 'Click the dots the new one follows. You can choose several.')}</p>
        </div>
        : s && editing?.id === s.id ? <FlowEditor key={s.id} rid={rid} n={editing} all={all} notes={notes} topics={topics} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
        : s ? <FlowCard reveal={reveal} rid={rid} n={s} all={all} byId={byId} notes={notes} manual={!!cells[s.id]} onPick={(id) => { setSel(id); center(id) }}
        onAdd={() => startDraft([s.id])} onPickFrom={() => { setEditing(null); setPicking([s.id]) }} onEdit={() => setEditing(s)} onUnplace={() => void place(s.id, null)} reload={reload} fail={fail}
        onDeleted={() => { setSel(null); reload() }} />
        : <p className="fl-hint muted">{tr('점을 누르면 아래에 자세히 보입니다. 두 번 누르면 가운데로, 끌면 다른 칸으로 옮깁니다.', 'Click a dot to see it below. Double-click to center it; drag it to another cell.')}</p>}
      </>}
    </section>
  )
}

function FlowCard({ reveal, rid, n, all, byId, notes, manual, onPick, onAdd, onPickFrom, onEdit, onUnplace, onDeleted, reload, fail }: {
  reveal: React.MutableRefObject<boolean>; rid: string; n: FlowNode; all: FlowNode[]; byId: Map<string, FlowNode>; notes: NoteRow[]
  /** 손으로 옮긴 자리인지 */
  manual: boolean
  onPick(id: string): void; onAdd(): void; onPickFrom(): void; onEdit(): void; onUnplace(): void; onDeleted(): void; reload(): void; fail(e: unknown): void
}) {
  const [approving, setApproving] = useState<number | null>(null)
  const remove = async () => {
    const out = all.filter((m) => m.from.some((f) => f.id === n.id)).length
    const ok = await askConfirm({
      title: tr(`점 "${n.short}"을 지울까요?`, `Delete the dot "${n.short}"?`),
      hint: tr(`점 파일(${n.file})과 이 점의 기록을 workbench/flow/.trash/로 옮깁니다${out ? `. 이 점에서 이어진 선 ${out}개도 빠집니다` : ''}. 근거로 단 노트·논문은 그대로 남습니다.`, `Moves the dot file (${n.file}) and this dot's records to workbench/flow/.trash/${out ? `, and removes the ${out} line(s) leading from it` : ''}. Notes and papers used as evidence stay.`),
      ok: tr('지우기', 'Delete'),
    })
    if (!ok) return
    try { await flowApi(rid).remove(n.id, n.hash); flash(tr(`점 "${n.short}"을 지웠습니다`, `Deleted the dot "${n.short}"`)); onDeleted() } catch (e) { fail(e) }
  }
  const K = KIND[markOf(n)]
  const el = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!reveal.current) return
    reveal.current = false
    el.current?.scrollIntoView({ block: 'nearest' })
  }, [n.id, reveal])
  const order = [...Object.keys(FIELD).filter((f) => n.fields[f]), ...Object.keys(n.fields).filter((f) => !FIELD[f])]
  const prev = n.from.map((f) => ({ f, m: byId.get(f.id)! })).filter((x) => x.m)
  const next = all.filter((m) => m.from.some((f) => f.id === n.id)).map((m) => ({ f: m.from.find((f) => f.id === n.id)!, m }))
  const hasProof = n.kind === 'finding' && n.evidence.some((e) => e.kind === 'proof')
  const openLink = (m: FlowNode) => onPick(m.id)
  const link = ({ f, m }: { f: { type: string }; m: FlowNode }) => (
    <li key={m.id}>
      <span className="fl-ety">{EDGE[f.type]!()}</span>
      <button className="a fl-pill" onClick={() => openLink(m)} title={m.title}><MarkIcon n={m} size={16} /><span>{m.short}</span></button>
    </li>
  )
  return (
    <article className="fl-card" ref={el} data-ui="흐름 점 자세히">
      <div className="fl-head"><MarkIcon n={n} size={30} /><span className="fl-short">{n.short}</span>{n.date && <span className="muted">{n.date}</span>}
        <span className="fl-tools">
          {manual && <button className="btn small" title={tr('손으로 옮긴 자리를 풀고 자동 자리로', 'Release the manual position')} onClick={onUnplace}>{tr('자동 자리로', 'Auto position')}</button>}
          <NextDotButtons onAdd={onAdd} onPickFrom={onPickFrom} />
          <button className="icon-btn" data-ui="흐름 점 고치기" title={tr('고치기', 'Edit')} aria-label={tr('점 고치기', 'Edit dot')} onClick={onEdit}>{Icon.pencil}</button>
          <button className="icon-btn" data-ui="흐름 점 지우기" title={tr('지우기', 'Delete')} aria-label={tr('점 지우기', 'Delete dot')} onClick={() => void remove()}>{Icon.trash}</button>
        </span>
      </div>
      <div className="fl-full">{n.title}</div>
      <div className="fl-cls">
        <span title={K.def()}><i>{tr('종류', 'Kind')}</i>{K.act ? tr('행위', 'Action') : tr('진술', 'Statement')} · {K.name()}</span>
        {hasProof && !n.theorem && <span className="muted">{tr('증명 승인 대기 · 승인하면 정리', 'Proof awaiting approval · becomes a theorem when approved')}</span>}
        <span><i>{tr('상태', 'State')}</i><StatusDot s={DOT[stateOf(n)]} name={stateName(n)} label /></span>
        {n.end && <span>{tr('갈래 종결', 'Branch closed')}</span>}
      </div>
      <section className="fl-sec">
        <h3>{tr('설명', 'Description')}</h3>
        {order.length ? <dl className="fl-fields">{order.map((f) => <div key={f}><dt>{FIELD[f]?.() ?? f}</dt><dd><FlowText rid={rid} text={n.fields[f]!} /></dd></div>)}</dl>
          : <span className="muted">{tr('아직 없음. 연필로 적습니다.', 'None yet. Use the pencil to write.')}</span>}
      </section>
      <section className="fl-sec" data-ui="흐름 근거">
        <h3>{tr('근거', 'Evidence')}</h3>
        {n.evidence.length ? <div className="fl-tbox"><table className="fl-ev">
          <thead><tr><th>{tr('종류', 'Kind')}</th><th>{tr('내용', 'What it shows')}</th><th>{tr('노트와 출처', 'Note and source')}</th>
            <th className="vc" title={tr('에이전트가 확인했는지', 'Checked by an agent')}>{tr('AI 검토', 'AI check')}</th>
            <th className="vc" title={tr('사람이 승인했는지', 'Approved by a person')}>{tr('사람 승인', 'Approved')}</th></tr></thead>
          <tbody>{n.evidence.map((e, i) => <tr key={i}>
            <td className="kd">{EVK[e.kind]()}</td>
            <td>{e.text ? <MathText text={e.text} /> : <span className="muted">—</span>}</td>
            <td><EvidenceSource rid={rid} e={e} notes={notes} /></td>
            <td className="vc"><Check e={e} role="agent" /></td>
            <td className="vc"><Check e={e} role="human" onClick={() => setApproving(i)} /></td>
          </tr>)}</tbody>
        </table></div> : <span className="muted">{tr('없음. 연필로 노트·논문을 근거로 답니다.', 'None. Use the pencil to attach notes or papers.')}</span>}
        {approving !== null && n.evidence[approving] && <ApproveDialog rid={rid} n={n} ev={approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); reload() }} fail={fail} />}
      </section>
      {(n.guesses.length > 0 || n.sources.length > 0) && <details className="fl-sec fl-fold">
        <summary><h3>{tr('기록', 'Records')}</h3><span className="muted">{n.guesses.length > 0 && tr(`추정 ${n.guesses.length} · `, `${n.guesses.length} guessed · `)}{tr(`출처 ${n.sources.length}`, `${n.sources.length} sources`)}</span></summary>
        {n.guesses.length > 0 && <><h4>{tr('추정 (에이전트가 짐작한 것)', 'Guessed by the agent')}</h4><ul>{n.guesses.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
        {n.sources.length > 0 && <><h4>{tr('출처', 'Sources')}</h4><ul className="fl-src">{n.sources.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
        <p className="muted fl-file">{n.file}</p>
      </details>}
      <details className="fl-sec fl-fold" data-ui="흐름 연결">
        <summary><h3>{tr('연결', 'Links')}</h3><span className="muted">{tr(`이전 ${prev.length} · 이후 ${next.length}`, `${prev.length} before · ${next.length} after`)}</span></summary>
        <div className="fl-links">
          <div><h4>{tr('이전', 'Before')}</h4>{prev.length ? <ul>{prev.map(link)}</ul> : <span className="muted">{tr('없음 (시작점)', 'None (start)')}</span>}</div>
          <div><h4>{tr('이후', 'After')}</h4>{next.length ? <ul>{next.map(link)}</ul> : <span className="muted">{tr('없음', 'None')}</span>}</div>
        </div>
      </details>
    </article>
  )
}

function EvidenceSource({ rid, e, notes }: { rid: string; e: FlowEvidence; notes: NoteRow[] }) {
  if (e.ref) return <button className="a fl-ref-link" title={tr('라이브러리에서 열기', 'Open in the library')} onClick={() => go({ page: 'shelf', open: e.ref })}>{Chain}<span>{e.title ?? e.ref}</span></button>
  const file = e.file ?? ''
  // 노트 폴더(note.md · note.yaml · 그림)의 어느 파일이든 그 노트로
  const dir = (f: string) => f.replace(/\/[^/]*$/, '')
  const row = notes.find((x) => x.file === file) ?? notes.find((x) => /\/note\.(md|tex)$/.test(x.file) && dir(x.file) === dir(file))
  const block = /^workbench\/blocks\/([^/]+)\.(tex|md)$/.exec(file)
  const open = row ? () => go(routeOfNote(rid, row)) : block ? () => go({ page: 'block', rid, bid: block[1]! }) : null
  const label = e.title ?? (row?.title || file)
  return open ? <button className="a fl-note" title={file} onClick={open}>{label}</button> : <span className="fl-note" title={file}>{label}</span>
}

/** 그 역할의 마지막 기록이 거둔 것이 아니면 확인됨 */
const lastCheck = (e: FlowEvidence, role: 'agent' | 'human') => [...e.checks].reverse().find((x) => x.role === role)
const approvedBy = (e: FlowEvidence, role: 'agent' | 'human') => { const c = lastCheck(e, role); return !!c && !c.revoked }

function Check({ e, role, onClick }: { e: FlowEvidence; role: 'agent' | 'human'; onClick?(): void }) {
  const c = lastCheck(e, role), on = approvedBy(e, role)
  const name = role === 'agent' ? tr('에이전트 검토', 'Agent check') : tr('사람 승인', 'Human approval')
  const tip = c ? `${name}: ${c.revoked ? tr('거둠', 'revoked') + ' · ' : ''}${c.by} · ${c.at}${c.note ? `\n${c.note}` : ''}` : `${name}: ${tr('안 됨', 'not yet')}`
  const mark = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>{on
    ? <><circle cx="8" cy="8" r="7" /><path d="M4.6 8.2l2.2 2.2 4.4-4.6" /></>
    : <circle cx="8" cy="8" r="6.2" />}</svg>
  if (onClick) return <button className={`fl-check${on ? ' on' : ''}`} data-ui="흐름 사람 승인" aria-label={`${tip}. ${on ? tr('누르면 승인 거두기', 'Click to revoke') : tr('누르면 승인', 'Click to approve')}`} title={`${tip}\n${on ? tr('누르면 승인을 거둡니다', 'Click to revoke') : tr('누르면 승인합니다', 'Click to approve')}`} onClick={onClick}>{mark}</button>
  return <span className={`fl-check${on ? ' on' : ''}`} role="img" aria-label={tip} title={tip}>{mark}</span>
}

const Chain = <svg className="fl-chain" width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.9.9" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.2 9.1a2.6 2.6 0 0 0 3.7 3.7l.9-.9" /></svg>

// ---------- 고치기 (2단계) ----------

const PROGRESS: Record<FlowProgress, () => string> = { open: () => tr('미해결', 'Open'), active: () => tr('진행', 'In progress'), paused: () => tr('멈춤', 'Paused'), done: () => tr('끝남', 'Done') }
const resultName = (r: FlowResult, act: boolean) => r === 'solved' ? (act ? tr('성공', 'Succeeded') : tr('해결', 'Solved')) : r === 'refuted' ? (act ? tr('실패', 'Failed') : tr('반증', 'Refuted')) : tr('폐기', 'Dropped')
/** 받는 점의 종류로 정하는 기본 선 종류 (서버가 종류 없는 선을 읽는 규칙과 같다) */
const defaultEdge = (k: FlowKind): FlowEdge => k === 'question' ? 'origin' : 'support'

function KindPicker({ value, onChange, compact }: { value: FlowKind; onChange(k: FlowKind): void; compact?: boolean }) {
  return <div className={compact ? 'fl-kinds fl-kinds-row' : 'fl-kinds'} role="radiogroup" aria-label={tr('종류', 'Kind')} data-ui="흐름 종류 고르기">
    {FLOW_KINDS.map((k) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} title={KIND[k].def()} onClick={() => onChange(k)}>
      <svg className="fl-icon" width={compact ? 18 : 22} height={compact ? 18 : 22} viewBox="0 0 30 30" aria-hidden><MarkSvg m={k} x={15} y={15} state="active" /></svg>
      <span>{KIND[k].name()}</span>
    </button>)}
  </div>
}

/** 자세히의 ＋ (이 점에서 잇기)와 ▾ (앞선 점 여러 개 고르기) */
function NextDotButtons({ onAdd, onPickFrom }: { onAdd(): void; onPickFrom(): void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(!!open, box, () => setOpen(false))
  return <span className="fl-next" ref={box}>
    <button className="icon-btn" data-ui="흐름 다음 점" title={tr('이 점에서 이어지는 점 더하기', 'Add a dot following this one')} aria-label={tr('다음 점 더하기', 'Add next dot')} onClick={onAdd}>{Icon.plus}</button>
    <button className={`icon-btn fl-next-more${open ? ' on' : ''}`} data-ui="흐름 다음 점 메뉴" title={tr('다른 방법으로 잇기', 'Other ways to link')} aria-label={tr('다른 방법으로 잇기', 'Other ways to link')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>▾</button>
    {open && <div className="menu fl-next-pop" role="menu">
      <button role="menuitem" onClick={() => { setOpen(false); onAdd() }}>{tr('이 점에서 잇기', 'Follow this dot')}</button>
      <button role="menuitem" onClick={() => { setOpen(false); onPickFrom() }}>{tr('앞선 점 여러 개 고르기…', 'Choose several earlier dots…')}</button>
    </div>}
  </span>
}

/** 새 점의 처음 값: 앞선 점이 질문이면 증명, 아니면 질문. 주제는 고른 주제, 없으면 첫 앞선 점의 주제 */
function newDraftNode(from: FlowNode[], topic?: string): FlowNode {
  const kind: FlowKind = from[0] ? (from[0].kind === 'question' ? 'proof' : 'question') : 'question'
  const d = new Date(), p2 = (v: number) => String(v).padStart(2, '0')
  return {
    id: '', file: '', hash: '', kind, progress: 'open', short: '', title: '', topics: topic ? [topic] : from[0]?.topics ?? [],
    date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, from: from.map((m) => ({ id: m.id, type: defaultEdge(kind) })),
    fields: {}, evidence: [], sources: [], guesses: [], theorem: false,
  }
}

type EvRow = { kind: FlowEvidence['kind']; text: string; title: string; src: string }
const evRow = (e: FlowEvidence): EvRow => ({ kind: e.kind, text: e.text, title: e.title ?? '', src: e.ref ?? e.file ?? '' })

/** 설명 칸: 노트와 같게 그린다 (줄 바꿈 · $…$ · $$…$$ · ![설명](그림 파일 이름)은 이 프로젝트·공용 그림 라이브러리에서 찾는다) */
function FlowText({ rid, text }: { rid: string; text: string }) {
  const figure = useFigureUrl(rid)
  const options = useMemo(() => ({ figure }), [figure])
  return <div className="fl-text"><NoteMarkdown text={text} options={options} /></div>
}

/**
 * 점 고치기: 이름·종류·상태·설명·근거·연결·주제를 한 번에. 창이 아니라 자세히가 있던 자리에서 고친다
 * (10/14 23:15 사용자: 팝업이 아닌 화면에서. docs/design-system.md 6절의 예외)
 */
function FlowEditor({ rid, n, create, all, notes, topics, onClose, onSaved }: {
  rid: string; n: FlowNode
  /** 새 점: 저장하면 만들고, 만든 점을 onSaved로 돌려준다 */
  create?: boolean
  all: FlowNode[]; notes: NoteRow[]; topics: TopicRef[]; onClose(): void; onSaved(made?: FlowNode): void
}) {
  const [short, setShort] = useState(n.short)
  const [title, setTitle] = useState(n.title)
  const [date, setDate] = useState(n.date ?? '')
  const [kind, setKind] = useState(n.kind)
  const [progress, setProgress] = useState(n.progress)
  const [result, setResult] = useState<FlowResult>(n.result ?? 'solved')
  const [end, setEnd] = useState(!!n.end)
  const [fields, setFields] = useState<Record<string, string>>(n.fields)
  const [ev, setEv] = useState<EvRow[]>(n.evidence.map(evRow))
  const [from, setFrom] = useState(n.from)
  const [tops, setTops] = useState(n.topics)
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const figs = (useFigureList()?.figures ?? []).filter((f) => f.scope === rid || f.scope === LIBRARY_SCOPE)
  /** 설명 칸마다 글 칸 (그림을 커서 자리에 넣으려고) */
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const act = KIND[kind].act
  const shownFields = [...FLOW_FIELDS[kind], ...Object.keys(fields).filter((f) => !FLOW_FIELDS[kind].includes(f) && fields[f]?.trim())]
  const byId = new Map(all.map((m) => [m.id, m]))
  const candidates = all.filter((m) => m.id !== n.id && !from.some((f) => f.id === m.id))
    .sort((a, b) => Number(!a.topics.some((x) => tops.includes(x))) - Number(!b.topics.some((x) => tops.includes(x))) || a.short.localeCompare(b.short))
  const topicTitle = (id: string) => topics.find((x) => x.id === id)?.title ?? id
  const setEvAt = (i: number, p: Partial<EvRow>) => setEv(ev.map((x, j) => j === i ? { ...x, ...p } : x))

  const save = async () => {
    if (!short.trim()) return setError(tr('짧은 제목을 적어 주세요.', 'Enter a short title.'))
    const bad = ev.findIndex((x) => !x.src.trim())
    if (bad >= 0) return setError(tr(`근거 ${bad + 1}에 노트 경로나 논문 키를 적어 주세요.`, `Evidence ${bad + 1} needs a note path or a paper key.`))
    setBusy(true); setError(null)
    const set = {
      short: short.trim(), title: title.trim() || short.trim(), date: date.trim(), kind, progress, result: progress === 'done' ? result : null, end, topics: tops, from,
      fields: Object.fromEntries(Object.entries(fields).filter(([k]) => shownFields.includes(k)).map(([k, v]) => [k, v])),
      evidence: ev.map((x) => ({ kind: x.kind, text: x.text, ...(x.title.trim() && { title: x.title.trim() }), ...(x.kind === 'paper' ? { ref: x.src.trim() } : { file: x.src.trim() }) })),
    }
    try {
      if (!create) { await flowApi(rid).patch(n.id, n.hash, set); return onSaved() }
      // 만들기가 받는 칸으로 만들고, 나머지(날짜·설명·근거·결과·종결)가 있으면 이어서 고친다
      const made = await flowApi(rid).create({ kind, short: set.short, title: set.title, progress, ...(tops.length && { topics: tops }), ...(from.length && { from }) })
      const more = set.date !== made.date || end || progress === 'done' || set.evidence.length > 0 || Object.values(set.fields).some((v) => v.trim())
      if (more) await flowApi(rid).patch(made.id, made.hash, set).catch((e: Error) => flash(tr(`점은 만들었지만 나머지 칸을 저장하지 못했습니다: ${e.message}`, `The dot was created, but the other fields were not saved: ${e.message}`)))
      onSaved(made)
    } catch (e) {
      setBusy(false)
      setError(e instanceof ConflictError ? tr('다른 곳에서 점 파일이 바뀌어 저장하지 않았습니다. 취소하고 다시 고쳐 주세요.', 'The dot file changed elsewhere, so nothing was saved. Cancel and edit again.') : (e as Error).message)
    }
  }
  /** 설명 칸 f의 커서 자리(없으면 끝)에 그림 줄을 넣는다 */
  const insertFigure = (f: string, file: string) => {
    const el = areas.current[f]
    const old = fields[f] ?? ''
    const at = el && document.activeElement === el ? el.selectionStart : old.length
    const before = old.slice(0, at).replace(/\s+$/, '')
    const after = old.slice(at).replace(/^\s+/, '')
    const line = `![](${file})`
    setFields((cur) => ({ ...cur, [f]: `${before}${before ? '\n\n' : ''}${line}\n${after ? `\n${after}` : ''}` }))
  }
  /** 컴퓨터의 그림 · 붙여 넣은 그림을 이 프로젝트의 workbench/figures/에 두고 그 칸에 넣는다 (10/16 사용자 승인 "그림 ▾") */
  const addFiles = async (f: string, files: File[]) => {
    const pics = files.filter((x) => FIGURE_FILE.test(x.name) || /^image\//.test(x.type))
    if (!pics.length) return
    setError(null)
    const taken = new Set(figs.filter((x) => x.scope === rid).map((x) => x.file.toLowerCase()))
    for (const x of pics) {
      try {
        const file = await uploadFigure(rid, n.id || 'flow', x, taken)
        taken.add(file.toLowerCase())
        insertFigure(f, file)
      } catch (e) { setError((e as Error).message) }
    }
    forgetFigures()
  }
  // 저장 · 취소는 머리 줄에만 (10/16 사용자 승인)
  const buttons = <>
    <button className="btn" onClick={onClose}>{tr('취소', 'Cancel')}</button>
    <button className="btn primary" disabled={busy} onClick={() => void save()}>{create ? tr('만들기', 'Create') : tr('저장', 'Save')}</button>
  </>

  // 자세히와 같은 배치로, 칸마다 상자를 두지 않는다 (10/15 반려 "박스가 너무 많다")
  return <article className={`fl-card fl-editing${create ? ' fl-new' : ''}`} data-ui={create ? '흐름 새 점 창' : '흐름 점 고치기 창'} aria-label={create ? tr('새 점', 'New dot') : tr('점 고치기', 'Edit dot')}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
    <div className="fl-head"><MarkIcon n={{ ...n, kind, progress, result: progress === 'done' ? result : undefined }} size={30} />
      <input className="fl-in fl-short fl-grow" autoFocus aria-label={tr('짧은 제목', 'Short title')} placeholder={tr('짧은 제목', 'Short title')} value={short} maxLength={60} onChange={(e) => setShort(e.target.value)} />
      <input className="fl-in fl-date-in" aria-label={tr('날짜', 'Date')} value={date} placeholder="2026-10-14" maxLength={20} onChange={(e) => setDate(e.target.value)} />
      <span className="fl-tools">{buttons}</span></div>
    <input className="fl-in fl-full" aria-label={tr('제목', 'Title')} placeholder={tr('제목 (비우면 짧은 제목)', 'Title (empty = short title)')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />

    <div className="fl-cls fl-cls-edit">
      <span><i>{tr('종류', 'Kind')}</i><KindPicker value={kind} onChange={setKind} compact /></span>
      <span><i>{tr('상태', 'State')}</i>
        <span className="segmented small" role="radiogroup" aria-label={tr('진행', 'Progress')}>
          {(['open', 'active', 'paused', 'done'] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={progress === p} className={progress === p ? 'on' : ''} onClick={() => setProgress(p)}>{PROGRESS[p]()}</button>)}
        </span>
        {progress === 'done' && <span className="segmented small" role="radiogroup" aria-label={tr('결과', 'Result')}>
          {(['solved', 'refuted', 'dropped'] as const).map((r) => <button key={r} type="button" role="radio" aria-checked={result === r} className={result === r ? 'on' : ''} onClick={() => setResult(r)}>{resultName(r, act)}</button>)}
        </span>}
        <label className="check"><input type="checkbox" checked={end} onChange={(e) => setEnd(e.target.checked)} />{tr('갈래 종결', 'Branch closed')}</label>
      </span>
    </div>

    <section className="fl-sec">
      <h3>{tr('설명', 'Description')}</h3>
      <dl className="fl-fields">{shownFields.map((f) => <div key={f}><dt>{FIELD[f]?.() ?? f}{!FLOW_FIELDS[kind].includes(f) && <em> {tr('다른 종류', 'other kind')}</em>}</dt>
        <dd className="fl-field">
          <FigureMenu figs={figs} onPick={(file) => insertFigure(f, file)} onFiles={(xs) => void addFiles(f, xs)} />
          <textarea ref={(el) => { areas.current[f] = el }} className="fl-in" aria-label={FIELD[f]?.() ?? f} rows={Math.min(12, Math.max(2, (fields[f] ?? '').split('\n').length + 1))} value={fields[f] ?? ''}
            onChange={(e) => setFields({ ...fields, [f]: e.target.value })}
            onPaste={(e) => { const xs = [...e.clipboardData.files]; if (xs.length) { e.preventDefault(); void addFiles(f, xs) } }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
            onDrop={(e) => { const xs = [...e.dataTransfer.files]; if (xs.length) { e.preventDefault(); void addFiles(f, xs) } }} />
          {/[$]|!\[/.test(fields[f] ?? '') && <div className="fl-preview" data-ui="흐름 설명 미리보기"><FlowText rid={rid} text={fields[f] ?? ''} /></div>}
        </dd></div>)}</dl>
      <p className="fl-help">{tr('글 속 수식 $…$, 줄 수식은 $$…$$를 따로 한 줄에, 빈 줄은 문단을 나눈다. 그림은 칸 오른쪽 위 "그림"으로 넣거나 붙여넣기(⌘V) · 끌어 놓기로 넣는다.', 'Inline math $…$; display math $$…$$ on its own line; a blank line starts a paragraph. Add figures with "Figure" at the top right of a field, or paste (⌘V) or drop them in.')}</p>
    </section>

    <section className="fl-sec" data-ui="흐름 근거 고치기">
      <h3>{tr('근거', 'Evidence')}</h3>
      <datalist id="fl-note-files">{notes.map((x) => <option key={x.file} value={x.file}>{x.title}</option>)}</datalist>
      <div className="fl-evlist">{ev.map((x, i) => <div key={i} className="fl-evrow">
        <select className="fl-in" aria-label={tr('근거 종류', 'Evidence kind')} value={x.kind} onChange={(e) => setEvAt(i, { kind: e.target.value as EvRow['kind'] })}>{FLOW_EVIDENCE.map((k) => <option key={k} value={k}>{EVK[k]()}</option>)}</select>
        <input className="fl-in" aria-label={x.kind === 'paper' ? tr('논문 키', 'Paper key') : tr('노트 경로', 'Note path')} list={x.kind === 'paper' ? undefined : 'fl-note-files'} value={x.src}
          placeholder={x.kind === 'paper' ? tr('논문 키 (예: kitaev2006)', 'Paper key (e.g. kitaev2006)') : tr('노트 경로 (workbench/…)', 'Note path (workbench/…)')} onChange={(e) => setEvAt(i, { src: e.target.value })} />
        <input className="fl-in" aria-label={tr('보이는 이름', 'Shown name')} value={x.title} placeholder={tr('보이는 이름 (비우면 노트 제목)', 'Shown name (empty = note title)')} onChange={(e) => setEvAt(i, { title: e.target.value })} />
        <button type="button" className="icon-btn" title={tr('이 근거 빼기 (확인 기록도 빠짐)', 'Remove this evidence (and its checks)')} aria-label={tr('근거 빼기', 'Remove evidence')} onClick={() => setEv(ev.filter((_, j) => j !== i))}>{Icon.x}</button>
        <input className="fl-in fl-evtext" aria-label={tr('무엇을 보이는지', 'What it shows')} value={x.text} placeholder={tr('이 근거가 무엇을 보이는지', 'What this evidence shows')} onChange={(e) => setEvAt(i, { text: e.target.value })} />
      </div>)}</div>
      <div className="fl-linkrow"><button type="button" className="a" onClick={() => setEv([...ev, { kind: kind === 'calc' || kind === 'analytic' || kind === 'proof' ? kind : 'other', text: '', title: '', src: '' }])}>＋ {tr('근거', 'Evidence')}</button>
        <span className="fl-help">{tr('경로·키가 같은 근거는 AI 검토·사람 승인 기록이 그대로 남습니다.', 'Evidence with the same path or key keeps its AI check and approval records.')}</span></div>
    </section>

    <section className="fl-sec" data-ui="흐름 연결 고치기">
      <h3>{tr('앞선 점', 'Earlier dots')}</h3>
      <ul className="fl-fromlist">{from.map((f, i) => { const m = byId.get(f.id); return <li key={f.id}>
        <select className="fl-in" aria-label={tr('선 종류', 'Line type')} value={f.type} onChange={(e) => setFrom(from.map((g, j) => j === i ? { ...g, type: e.target.value as FlowEdge } : g))}>{FLOW_EDGES.map((x) => <option key={x} value={x}>{EDGE[x]!()}</option>)}</select>
        {m && <MarkIcon n={m} size={16} />}<span className="fl-grow">{m?.short ?? f.id}</span>
        <button type="button" className="icon-btn" title={tr('이 선 빼기', 'Remove this line')} aria-label={tr('선 빼기', 'Remove line')} onClick={() => setFrom(from.filter((_, j) => j !== i))}>{Icon.x}</button>
      </li> })}</ul>
      {!from.length && <span className="muted fl-help">{tr('없음 (시작점)', 'None (start)')}</span>}
      {candidates.length > 0 && <div className="fl-linkrow">
        <select className="fl-in fl-grow" aria-label={tr('이을 점', 'Dot to link')} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{tr('이을 점 고르기…', 'Choose a dot to link…')}</option>
          {candidates.map((m) => <option key={m.id} value={m.id}>{m.short}{m.topics.some((x) => tops.includes(x)) ? '' : ` · ${m.topics.map(topicTitle).join(', ')}`}</option>)}
        </select>
        <button type="button" className="btn small" disabled={!pick} onClick={() => { setFrom([...from, { id: pick, type: defaultEdge(kind) }]); setPick('') }}>{tr('잇기', 'Link')}</button>
      </div>}
    </section>

    {topics.length > 0 && <section className="fl-sec"><h3>{tr('주제', 'Topics')}</h3>
      <div className="fl-topics">{[...new Set([...topics.map((x) => x.id), ...tops])].map((id) => <label key={id} className="check">
        <input type="checkbox" checked={tops.includes(id)} onChange={(e) => setTops(e.target.checked ? [...tops, id] : tops.filter((x) => x !== id))} />{topicTitle(id)}</label>)}</div>
    </section>}
    {error && <p className="error-text">{error}</p>}
  </article>
}

/** 그림 라이브러리가 받는 파일 (서버 figures.ts kindOf와 같은 확장자) */
const FIGURE_FILE = /\.(png|jpe?g|svg|pdf|tikz|tex)$/i
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }

/**
 * 그림 하나를 이 프로젝트의 그림 폴더(workbench/figures/)에 올리고 파일 이름을 돌려준다.
 * 붙여 넣은 그림은 이름이 없거나 "image.png"라서 점 id와 시각으로 이름을 짓고, 같은 이름이 있으면 -2, -3 …을 붙인다.
 */
async function uploadFigure(rid: string, dot: string, x: File, taken: Set<string>): Promise<string> {
  const pasted = !x.name || /^image\.(png|jpe?g)$/i.test(x.name)
  const ext = pasted ? IMAGE_EXT[x.type] ?? 'png' : x.name.replace(/^.*\./, '').toLowerCase()
  if (!FIGURE_FILE.test(`.${ext}`)) throw new Error(tr('그림은 png · jpg · svg · pdf · tikz 파일이어야 합니다', 'A figure must be a png · jpg · svg · pdf · tikz file'))
  const d = new Date()
  const p2 = (v: number) => String(v).padStart(2, '0')
  const stem = pasted ? `${dot}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
    : x.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._()-]/gu, '-').slice(0, 100) || dot
  let name = `${stem}.${ext}`
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${stem}-${i}.${ext}`
  await figuresApi.upload(new File([x], name, { type: x.type }), rid)
  return name
}

/** 설명 칸의 "그림 ▾": 컴퓨터에서 고르기 · 그림 라이브러리에서 고르기 (붙여넣기 · 끌어 놓기는 칸에서) */
function FigureMenu({ figs, onPick, onFiles }: { figs: { id: string; file: string; name: string; scope: string }[]; onPick(file: string): void; onFiles(files: File[]): void }) {
  const [open, setOpen] = useState<false | 'menu' | 'library'>(false)
  const box = useRef<HTMLSpanElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useDismiss(!!open, box, () => setOpen(false))
  return <span className={`fl-figmenu${open ? ' open' : ''}`} ref={box}>
    <button type="button" className={`btn sm${open ? ' on' : ''}`} data-ui="흐름 그림 넣기" aria-haspopup="menu" aria-expanded={!!open} onClick={() => setOpen(open ? false : 'menu')}>{Icon.image}{tr('그림', 'Figure')} ▾</button>
    <input ref={input} type="file" hidden multiple accept=".png,.jpg,.jpeg,.svg,.pdf,.tikz,.tex,image/*" onChange={(e) => { const xs = [...(e.target.files ?? [])]; e.target.value = ''; if (xs.length) onFiles(xs) }} />
    {open === 'menu' && <div className="menu fl-figmenu-pop" role="menu" data-ui="흐름 그림 메뉴">
      <button role="menuitem" onClick={() => { setOpen(false); input.current?.click() }}>{tr('컴퓨터에서 고르기…', 'Choose from computer…')}</button>
      <button role="menuitem" disabled={!figs.length} onClick={() => setOpen('library')}>{tr('그림 라이브러리에서 고르기…', 'Choose from figure library…')}</button>
      <p className="fl-figmenu-hint">{figs.length ? tr('붙여넣기(⌘V)와 끌어 놓기도 됩니다', 'You can also paste (⌘V) or drop') : tr('그림 라이브러리가 비어 있습니다. 붙여넣기(⌘V)와 끌어 놓기도 됩니다', 'The figure library is empty. You can also paste (⌘V) or drop')}</p>
    </div>}
    {open === 'library' && <div className="menu fl-figmenu-pop fl-figmenu-lib" role="menu" data-ui="흐름 그림 메뉴">
      {figs.map((x) => <button key={x.id} role="menuitem" onClick={() => { setOpen(false); onPick(x.file) }}>{Icon.image}<span className="fl-grow">{x.name}</span></button>)}
    </div>}
  </span>
}

/** 사람 승인 또는 거두기. 기록은 덧붙이기만 한다 */
function ApproveDialog({ rid, n, ev, onClose, onDone, fail }: { rid: string; n: FlowNode; ev: number; onClose(): void; onDone(): void; fail(e: unknown): void }) {
  const e = n.evidence[ev]!
  const on = approvedBy(e, 'human')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try { await flowApi(rid).check(n.id, { baseHash: n.hash, ev, revoked: on || undefined, note: note.trim() || undefined }); onDone() } catch (x) { onClose(); fail(x) }
  }
  return <Dialog title={on ? tr('승인 거두기', 'Revoke approval') : tr('근거 승인', 'Approve evidence')} ui="흐름 승인" onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}>{tr('취소', 'Cancel')}</button>
    <button className="btn primary" disabled={busy} onClick={() => void submit()}>{on ? tr('거두기', 'Revoke') : tr('승인', 'Approve')}</button>
  </>}>
    <p className="fl-help">{on
      ? tr('이 근거의 사람 승인을 거둡니다. 지금까지의 기록은 그대로 남고 거둔 기록이 더해집니다.', 'Revokes the human approval of this evidence. Earlier records stay; a revoke record is added.')
      : tr('이 근거를 읽고 확인했다고 기록합니다.', 'Records that you read and confirmed this evidence.')}
      {n.kind === 'finding' && e.kind === 'proof' && !on && ' ' + tr('증명을 승인하면 이 발견은 정리가 됩니다.', 'Approving the proof makes this finding a theorem.')}</p>
    <div className="fl-approve-ev"><b>{EVK[e.kind]()}</b> · {e.title ?? e.ref ?? e.file}<div>{e.text ? <MathText text={e.text} /> : null}</div></div>
    <label className="field"><span>{tr('메모', 'Note')} <em>{tr('선택', 'optional')}</em></span><input autoFocus value={note} maxLength={500} onChange={(x) => setNote(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') void submit() }} /></label>
  </Dialog>
}

// ---------- 노트 오른쪽 사이드바의 흐름 칸 ----------

/** 이 노트(같은 노트 폴더의 파일 포함)를 근거로 단 점인지 */
const citesNote = (n: FlowNode, file: string) => {
  const dir = (f: string) => f.replace(/\/[^/]*$/, '')
  const folder = /\/note\.(md|tex|yaml)$/.test(file) ? dir(file) : null
  return n.evidence.some((e) => e.file && (e.file === file || (folder && dir(e.file) === folder)))
}

/** 노트 정보 갈래의 "흐름": 이 노트를 근거로 단 점 (누르면 주제 화면의 흐름에서 그 점), 그리고 점에 근거로 잇기 */
export function NoteFlow({ rid, row, onSaved }: { rid: string; row: NoteRow; onSaved(m: string): void }) {
  const { scan, reload } = useFlow(rid)
  const all = scan?.nodes ?? null
  const [pick, setPick] = useState('')
  if (!all) return null
  const mine = all.filter((n) => citesNote(n, row.file))
  // 노트의 주제에 든 점을 먼저
  const rest = all.filter((n) => !mine.includes(n))
    .sort((a, b) => Number(!a.topics.some((x) => row.topics.includes(x))) - Number(!b.topics.some((x) => row.topics.includes(x))) || a.short.localeCompare(b.short))
  const kind: FlowEvidence['kind'] = row.kind === 'calc' ? 'calc' : row.kind === 'proof' ? 'proof' : 'other'
  const link = async (id: string) => {
    const n = all.find((x) => x.id === id)
    if (!n) return
    try {
      await flowApi(rid).patch(n.id, n.hash, { evidence: [...n.evidence.map((e) => ({ kind: e.kind, text: e.text, ...(e.title && { title: e.title }), ...(e.ref ? { ref: e.ref } : e.file ? { file: e.file } : {}) })), { kind, text: '', title: row.title, file: row.file }] })
      onSaved(tr(`점 "${n.short}"에 이 노트를 근거로 달았습니다`, `Attached this note to the dot "${n.short}" as evidence`))
    } catch (e) { onSaved(e instanceof ConflictError ? tr('그새 점 파일이 바뀌었습니다. 다시 해 주세요.', 'The dot file changed in the meantime. Try again.') : (e as Error).message) }
    setPick('')
    reload()
  }
  return <>
    {mine.length ? <ul className="rs-list">{mine.map((n) => <li key={n.id}>
      <button type="button" className="a fl-pill" title={`${n.title}\n${tr('흐름 화면에서 열기', 'Open in the flow')}`} onClick={() => openFlowDot(rid, n)}>
        <MarkIcon n={n} size={16} /><span>{n.short}</span></button>
    </li>)}</ul> : <p className="empty rs-empty">{tr('이 노트를 근거로 단 점이 없습니다', 'No dot uses this note as evidence')}</p>}
    {rest.length > 0 && <select className="rs-select rs-add" data-ui="노트 흐름 잇기" value={pick} aria-label={tr('점에 근거로 잇기', 'Attach to a dot as evidence')}
      onChange={(e) => { setPick(e.target.value); if (e.target.value) void link(e.target.value) }}>
      <option value="">{tr('＋ 점에 잇기…', '＋ Attach to a dot…')}</option>
      {rest.map((n) => <option key={n.id} value={n.id}>{n.short}</option>)}
    </select>}
  </>
}

/** 소개 › 기호와 의미의 흐름 표 (10/15 피드백 "기호와 의미 절"): 차트와 같은 그림과 이름을 써서 둘이 어긋나지 않는다 */
export function FlowSymbolTable() {
  const mark = (m: Mark, state = 'active') => <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><MarkSvg m={m} x={15} y={15} state={state} /></svg>
  const line = (cls: string) => <svg className="fl-icon" width={40} height={14} viewBox="0 0 40 14" aria-hidden><path className={cls} d="M2 7H38" /></svg>
  const kinds: Mark[] = ['question', 'guess', 'finding', 'theorem', 'calc', 'analytic', 'proof', 'literature']
  const states: { s: ReturnType<typeof stateOf>; m: Mark; name: string; meaning: string }[] = [
    { s: 'open', m: 'question', name: tr('미해결', 'Open'), meaning: tr('아직 손대지 않음 (속이 빈 점선)', 'Not started yet (hollow, dashed)') },
    { s: 'active', m: 'question', name: tr('진행', 'In progress'), meaning: tr('하고 있는 걸음', 'A step being worked on') },
    { s: 'paused', m: 'question', name: tr('멈춤', 'Paused'), meaning: tr('무엇을 기다리는 중', 'Waiting for something') },
    { s: 'solved', m: 'question', name: tr('끝남 · 해결 / 성공', 'Done · solved / succeeded'), meaning: tr('진술은 해결, 행위는 성공', 'Solved for a statement, succeeded for an action') },
    { s: 'refuted', m: 'question', name: tr('끝남 · 반증 / 실패', 'Done · refuted / failed'), meaning: tr('틀린 것으로 끝남 (속이 찬 회색)', 'Ended as wrong (filled gray)') },
    { s: 'dropped', m: 'question', name: tr('끝남 · 폐기', 'Done · dropped'), meaning: tr('그만둔 걸음, 지우지 않음 (속이 빈 회색)', 'A step given up, not deleted (hollow gray)') },
  ]
  const lines: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: line('fl-e'), name: `${EDGE.origin!()} · ${EDGE.support!()} · ${EDGE.refute!()}`, meaning: tr('앞 걸음이 이 걸음을 낳음 · 받침 · 반박함. 선을 가리키면 이름이 뜹니다', 'The earlier step started, supports or refutes this one. Hover a line to see its name') },
    { mark: line('fl-e use'), name: EDGE.use!(), meaning: tr('앞 걸음의 결과를 가져다 씀 (점선)', 'Uses the earlier step\'s result (dotted)') },
    { mark: line('fl-e lit'), name: tr('문헌에서', 'From literature'), meaning: tr('문헌 점에서 나온 선 (끊긴 선)', 'A line from a literature dot (dashed)') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><text className="fl-name fl-cite" x={15} y={20} textAnchor="middle">§2</text></svg>, name: tr('근거 논문', 'Evidence papers'), meaning: tr('점 이름 뒤의 §: 근거로 단 논문 (둘 이상이면 수)', '§ after a dot\'s name: papers attached as evidence (a count when several)') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><path className="fl-start" d="M9 8L18 15L9 22Z" /></svg>, name: tr('시작점', 'Start'), meaning: tr('앞선 점이 없는 점', 'A dot with no earlier dot') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><line className="fl-end" x1={15} y1={5} x2={15} y2={25} /></svg>, name: tr('갈래 종결', 'Branch closed'), meaning: tr('이 갈래는 여기서 끝냄', 'This branch ends here') },
  ]
  const group = (name: string) => <tr className="about-sym-group"><td colSpan={3}>{name}</td></tr>
  return (
    <table className="about-sym-table">
      <thead><tr><th>{tr('기호', 'Symbol')}</th><th>{tr('이름', 'Name')}</th><th>{tr('뜻', 'Meaning')}</th></tr></thead>
      <tbody>
        {group(tr('종류 (동그라미 진술 · 둥근 네모 행위)', 'Kind (circle statement · rounded square action)'))}
        {kinds.map((k) => <tr key={k}><td className="about-sym">{mark(k)}</td><td>{KIND[k].name()}</td><td>{KIND[k].def()}</td></tr>)}
        {group(tr('상태 (색)', 'State (color)'))}
        {states.map((x) => <tr key={x.s}><td className="about-sym">{mark(x.m, x.s)}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('선과 표시', 'Lines and marks'))}
        {lines.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
      </tbody>
    </table>
  )
}
