import { useEffect, useMemo, useRef, useState } from 'react'
import { ConflictError, flowApi, type FlowCells, type FlowNode, type NoteRow } from '../api'
import { lineageOf, type FlowLayout } from '../flowLayout'
import { go } from '../router'
import { assignLanes, planRoute, roundedPath, routePoints } from '../flowRoute'
import { store } from '../store'
import { setFlowSelection } from '../flowSelection'
import { flash } from '../flash'
import { t as tr } from '../i18n'
import { KIND, EDGE, markOf, stateOf, stateName, MarkSvg } from './marks'
import { Icon } from '../icons'
import type { TopicRef } from './data'
import { FlowCard } from './FlowCard'
import { newDraftNode, FlowEditor } from './FlowEditor'

const ZS = [0.5, 0.67, 0.8, 1, 1.25, 1.5]
const CW0 = 116, RH0 = 76, TOP = 30, LEFT = 30
/** 줄 이름 칸의 폭 (10/20 사용자: 줄 이름은 주제와 따로, 차트 왼쪽에 붙어 있다) */
const GUT = 112
const H_KEY = 'rw-flow-h', Z_KEY = 'rw-flow-zoom', SEL_KEY = 'rw-flow-sel', NAME_KEY = 'rw-flow-names'
const DEFAULT_H = TOP + 5 * RH0 + 16

/** 다른 화면(노트의 오른쪽 사이드바)에서 점을 열 때: 흐름 화면에서 고르고 보이게 한다 */
let revealNext: string | null = null
export function openFlowDot(rid: string, n: Pick<FlowNode, 'id'>) {
  store.set(SEL_KEY, { ...store.get<Record<string, string>>(SEL_KEY, {}), [rid]: n.id })
  revealNext = n.id
  go({ page: 'flow', rid })
}

type Cell = { c: number; r: number }

export function FlowChart({ rid, focus, all, cells, lay, rowNames, warn, notes, topics, reload }: {
  rid: string; focus?: string; all: FlowNode[]; cells: FlowCells; lay: FlowLayout; rowNames: Record<string, string>; warn: number; notes: NoteRow[]; topics: TopicRef[]; reload(): void
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
  // 빈틈 있는 점을 굵게 (10/20): 주제 필터처럼 가리지 않고 드러내기만 한다
  const [gapOn, setGapOn] = useState(false)
  const gapCount = all.filter((n) => n.gaps.length > 0).length
  const [height, setHeightState] = useState(() => store.get<number>(H_KEY, DEFAULT_H))
  const setHeight = (h: number) => { setHeightState(h); store.set(H_KEY, h) }
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(800)
  // 줄 이름은 차트 상자 바깥 왼쪽에 (10/20 사용자). 왼쪽에 자리가 없으면(사이드바를 켜 좁을 때) 상자 안 왼쪽에 붙인다
  const [outside, setOutside] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const hasDots = lay.placed.length > 0
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      setBoxW(el.clientWidth)
      setScrollTop(el.scrollTop)
      const pane = el.closest('.scroll') ?? el.parentElement
      setOutside(!!pane && el.getBoundingClientRect().left - pane.getBoundingClientRect().left >= GUT + 8)
    }
    const ro = new ResizeObserver(fit)
    if (el.closest('.scroll')) ro.observe(el.closest('.scroll')!)
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
  // 줄 더하기·빼기 (10/16 사용자 승인): 맨 위·맨 아래 가장자리의 ＋ 줄, 빈 가장자리 줄의 ×.
  // 줄 이름 (10/20 사용자): 주제와 따로. 줄 수도 주제 수와 상관없이 한 줄까지 뺀다
  const least = 1
  const setRows = (top: number, bottom: number, names: Record<string, string> = rowNames) => api.rows({ top, bottom, names }).then(reload, fail)
  const rowTop = -lay.mid, rowBottom = lay.rows - 1 - lay.mid
  const emptyRow = (r: number) => r !== lay.mid && !lay.placed.some((p) => p.r === r) && draftAt?.r !== r
  const canDrop = (r: number) => lay.rows > least && (r === 0 || r === lay.rows - 1) && emptyRow(r)
  const ROW_ADD = 28
  // 줄 이름 (10/21 사용자): 차트 왼쪽 줄 이름 고치기 칸과, 점을 누른 아래 자세히(그 점이 있는 줄)에서 고친다
  const saveRowName = (r: number, text: string) => {
    const key = String(r - lay.mid), t = text.trim()
    if (t === (rowNames[key] ?? '')) return
    const { [key]: _, ...rest } = rowNames
    void setRows(rowTop, rowBottom, t ? { ...rest, [key]: t } : rest)
  }
  // 빈 맨 위 · 맨 아래 줄 빼기: 줄 이름 고치기 칸 안에 (10/21 사용자 "제거도 편집으로"). 줄 이름이 숨는 좁은 창에서만 ＋ 줄 옆 ×
  const edgeTools = (top: boolean) => {
    const r = top ? 0 : lay.rows - 1
    return <span className="fl-rowedge" style={{ top: top ? 4 : H - 32 }}>
      <button className="fl-rowadd" data-ui="흐름 줄 더하기" title={top ? tr('위에 줄 더하기', 'Add a row above') : tr('아래에 줄 더하기', 'Add a row below')}
        onClick={(e) => { e.stopPropagation(); void (top ? setRows(rowTop - 1, rowBottom) : setRows(rowTop, rowBottom + 1)) }}>＋ {tr('줄', 'Row')}</button>
      {!outside && canDrop(r) && <button className="icon-btn sm" data-ui="흐름 줄 빼기" title={top ? tr('맨 위 빈 줄 빼기', 'Remove the empty top row') : tr('맨 아래 빈 줄 빼기', 'Remove the empty bottom row')} aria-label={top ? tr('맨 위 빈 줄 빼기', 'Remove the empty top row') : tr('맨 아래 빈 줄 빼기', 'Remove the empty bottom row')}
        onClick={(e) => { e.stopPropagation(); void (top ? setRows(rowTop + 1, rowBottom) : setRows(rowTop, rowBottom - 1)) }}>{Icon.x}</button>}
    </span>
  }
  // 줄 옮기기 (10/21 사용자): ▶를 위아래로 끌면 그 줄의 점과 이름이 함께 간다
  const rowDrag = useRef<{ r: number; y: number; moved: boolean } | null>(null)
  const [rowGhost, setRowGhost] = useState<number | null>(null)
  const rowAt = (e: React.PointerEvent) => { const el = box.current; if (!el) return null; const y = e.clientY - el.getBoundingClientRect().top + el.scrollTop; return Math.max(0, Math.min(lay.rows - 1, Math.floor((y - TOP) / RH))) }
  const rowHandle = (r: number) => ({
    onPointerDown: (e: React.PointerEvent) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); rowDrag.current = { r, y: e.clientY, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId) },
    onPointerMove: (e: React.PointerEvent) => {
      const d = rowDrag.current
      if (!d || (!d.moved && Math.abs(e.clientY - d.y) < 5)) return
      d.moved = true
      const to = rowAt(e)
      setRowGhost(to !== null && to !== d.r ? to : null)
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = rowDrag.current
      rowDrag.current = null
      setRowGhost(null)
      if (!d?.moved) return
      dragged.current = true
      const to = rowAt(e)
      if (to === null || to === d.r) return
      const now = Object.fromEntries(lay.placed.map((p) => [p.node.id, { c: p.c, r: p.r - lay.mid }]))
      api.moveRow({ from: d.r - lay.mid, to: to - lay.mid, cells: now }).then(reload, fail)
    },
    onLostPointerCapture: () => { rowDrag.current = null; setRowGhost(null) },
  })
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
    if ((e.target as Element).closest('.fl-node, .fl-rowheads') || !box.current) return
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
  const selRow = s ? lay.placed.find((p) => p.node.id === s.id)?.r : undefined
  // 줄 이름 고치기 칸 (10/21 사용자): 차트 왼쪽의 줄 이름을 누르면 이름과 줄 빼기를 함께 둔 칸이 열린다
  const [rowEdit, setRowEdit] = useState<number | null>(null)
  // 이름 칸 높이에 들어가는 줄 수만 보이고 넘치면 …로 줄인다 (10/21 사용자: 좁아서 깨질 것 같으면 …)
  const headH = Math.max(18, RH - 8)
  const clamp = Math.max(1, Math.floor(headH / 16))
  const heads = (
        <div className={`fl-rowheads${outside ? ' out' : ''}`} data-ui="흐름 줄 이름" style={{ width: GUT, height: H, ...(outside && { transform: `translateY(${-scrollTop}px)` }) }}>
          {edgeTools(true)}
          {Array.from({ length: lay.rows }, (_, r) => {
            const name = rowNames[String(r - lay.mid)]
            return <button key={r} type="button" className={`fl-rowhead${rowGhost === r ? ' to' : ''}${rowEdit === r ? ' on' : ''}${name ? '' : ' blank'}`} style={{ top: Y(r) - headH / 2, height: headH }}
              data-ui="흐름 줄 이름 단추" title={name ? tr(`${name} — 눌러서 이름 고치기 · 줄 빼기`, `${name} — click to rename or remove the row`) : tr('줄 이름 붙이기', 'Name this row')} onClick={(e) => { e.stopPropagation(); setRowEdit(r) }}>
              {name ? <span className="fl-rowname"><span className="fl-rowname-t" style={{ WebkitLineClamp: clamp }}>{name}</span></span> : <span className="fl-rowname-add" aria-hidden>{Icon.pencil}</span>}
            </button>
          })}
          {edgeTools(false)}
        </div>
  )
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
        {gapCount > 0 && <button className={`btn${gapOn ? ' on' : ''}`} data-ui="흐름 빈틈 보기" aria-pressed={gapOn} title={tr('빈틈(근거 · 결과 · 이유 · 다음 할 일 · 단계 확인이 빠진 곳)이 있는 점을 굵게', 'Highlight dots with gaps (missing evidence, result, reason, next step or step checks)')} onClick={() => setGapOn(!gapOn)}>{tr(`빈틈 ${gapCount}`, `Gaps ${gapCount}`)}</button>}
        {lay.placed.length > 0 && <span className="fl-zoom" data-ui="흐름 확대">
          <span className="fl-zl">{tr('가로', 'Width')}</span>
          <button className="icon-btn" title={tr('가로 좁히기', 'Narrower')} aria-label={tr('가로 좁히기', 'Narrower')} onClick={() => step('x', -1)}>−</button>
          <button className="icon-btn" title={tr('가로 넓히기', 'Wider')} aria-label={tr('가로 넓히기', 'Wider')} onClick={() => step('x', 1)}>＋</button>
          <span className="fl-zl">{tr('세로', 'Height')}</span>
          <button className="icon-btn" title={tr('세로 좁히기', 'Shorter')} aria-label={tr('세로 좁히기', 'Shorter')} onClick={() => step('y', -1)}>−</button>
          <button className="icon-btn" title={tr('세로 넓히기', 'Taller')} aria-label={tr('세로 넓히기', 'Taller')} onClick={() => step('y', 1)}>＋</button>
          <button className={`btn${names ? ' on' : ''}`} data-ui="흐름 이름 보기" aria-pressed={names} title={tr('점 이름 켜기·끄기 (꺼도 고른 점과 그 앞뒤 점은 보임)', 'Show or hide dot names (the selected dot and its lineage still show)')} onClick={() => setNames(!names)}>{tr('이름', 'Names')}</button>
          <button className={`btn${zoom.fit ? ' on' : ''}`} aria-pressed={zoom.fit} title={tr('가로를 상자 폭에 맞추기', 'Fit the width to the box')} onClick={() => setZoom({ ...zoom, fit: !zoom.fit })}>{tr('전체 보기', 'Fit')}</button>
        </span>}
        <button className="btn" data-ui="흐름 점 더하기" title={tr('앞선 점 없이 새로 시작하는 점을 더합니다. 이어지는 점은 점을 누르고 자세히의 ＋로', 'Add a dot that starts fresh. For a following dot, select a dot and use ＋ in its details')}
          onClick={() => startDraft([])}>＋ {tr('시작점', 'Start')}</button>
      </div>
      {lay.placed.length === 0 && (draftEditor || <p className="fl-hint muted">{tr('흐름의 점이 없습니다. ＋ 시작점으로 첫 걸음(질문·계산·증명…)을 더합니다.', 'No dots yet. Add the first step (a question, calculation, proof…) with ＋ Start.')}</p>)}
      {lay.placed.length > 0 && <><div className="fl-wrap">
      {outside && <div className="fl-rowclip" style={{ width: GUT, height }}>{heads}</div>}
      {outside && rowEdit !== null && rowEdit < lay.rows && <RowEditor key={rowEdit} top={Y(rowEdit) - scrollTop + headH / 2 + 4} name={rowNames[String(rowEdit - lay.mid)] ?? ''}
        canDrop={canDrop(rowEdit)} empty={emptyRow(rowEdit)} onClose={() => setRowEdit(null)}
        onSave={(text) => { saveRowName(rowEdit, text); setRowEdit(null) }}
        onDrop={() => { const top = rowEdit === 0; setRowEdit(null); void (top ? setRows(rowTop + 1, rowBottom) : setRows(rowTop, rowBottom - 1)) }} />}
      <div className="fl-box" ref={box} style={{ height }} data-ui="흐름 차트" onScroll={(e) => { if (outside) setScrollTop(e.currentTarget.scrollTop) }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClick={(e) => { if (!picking && !(e.target as Element).closest('.fl-node, .fl-rowhead')) setSel(null) }}>
        <div className="fl-canvas" style={{ width: W, height: H }}>
        {/* 줄 이름은 상자 바깥 왼쪽에만 둔다. 자리가 없으면 이름 · 연필 · ×는 숨고 ▶ 끌기와 ＋ 줄만 남는다(10/20). */}
        {!outside && <div className="fl-rowheads slim" style={{ height: H }}>{edgeTools(true)}{edgeTools(false)}</div>}
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
          {rowGhost !== null && <rect className="fl-ghost" x={2} y={TOP + RH * rowGhost + 2} width={W - 4} height={RH - 4} rx={8} />}
          {ghost && <rect className="fl-ghost" x={LEFT + CW * ghost.c + 4} y={TOP + RH * (ghost.r + lay.mid) + 2} width={CW - 8} height={RH - 4} rx={8} />}
          {lay.placed.map(({ node: n, c, r }) => {
            const picked = !!picking?.includes(n.id) || !!draft?.from.includes(n.id)
            const x = X(c), y = Y(r), on = n.id === sel && !picking, lg = inLin(n.id) && !on && !picked
            const hot = (!!focus && n.topics.includes(focus)) || (gapOn && n.gaps.length > 0)
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
                // 끌어 놓을 칸 표시는 다른 칸 위일 때만 (제자리면 점 자체가 보인다)
                const to = cellAt(e)
                setGhost(to && (to.c !== c || to.r !== r - lay.mid) ? to : null)
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
              // 누름을 놓치는 경우(창 밖에서 놓음 등)에도 끌기 표시가 남지 않게 (10/19 피드백 10:39: 다른 점에 점선 상자가 남음)
              onLostPointerCapture={() => { if (drag.current?.id === n.id) drag.current = null; setGhost(null) }}
              onClick={() => { setGhost(null); if (dragged.current) { dragged.current = false; return } tap(n.id) }} onDoubleClick={() => { setSel(n.id); center(n.id) }}
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
              {start && <g className="fl-startmark" {...rowHandle(r)}><title>{tr('시작점: 앞선 점이 없다 · 위아래로 끌어 줄 옮기기', 'Start: no earlier dot · drag up or down to move the row')}</title>
                <path className="fl-start" d={`M${LEFT - 22} ${y - 7}L${LEFT - 13} ${y}L${LEFT - 22} ${y + 7}Z`} />
                {!lay.placed.some((o) => o.r === r && o.c < c) && <path className="fl-start-line" d={`M${LEFT - 13} ${y}H${x - 20}`} />}
              </g>}
              {n.gaps.length > 0 && <circle className="fl-gapdot" cx={x + 14} cy={y - 14} r={4}><title>{`${tr('빈틈', 'Gaps')}\n${n.gaps.map((g) => `· ${g.text}`).join('\n')}`}</title></circle>}
              {n.end && <line className="fl-end" x1={x + 20} y1={y - 10} x2={x + 20} y2={y + 10}><title>{tr('흐름 종료', 'Flow ends')}</title></line>}
              {on || (names ? !compact : lg || hot || picked) ? <text className={`fl-name${on || lg || hot || picked ? ' strong' : ''}`} x={x} y={y + (compact ? 27 : 30)} textAnchor="middle">{n.short}{cites.length > 0 && <tspan className="fl-cite" dx={3}>§{cites.length > 1 ? cites.length : ''}<title>{cites.map((e) => e.title ?? e.ref).join('\n')}</title></tspan>}</text> : null}
            </g>
          })}
        </svg>
        </div>
      </div>
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
        : s ? <FlowCard reveal={reveal} rid={rid} n={s} all={all} byId={byId} notes={notes} manual={!!cells[s.id]} row={selRow === undefined ? undefined : { name: rowNames[String(selRow - lay.mid)] ?? '', save: (t) => saveRowName(selRow, t) }} onPick={(id) => { setSel(id); center(id) }}
        onAdd={() => startDraft([s.id])} onPickFrom={() => { setEditing(null); setPicking([s.id]) }} onEdit={() => setEditing(s)} onUnplace={() => void place(s.id, null)} reload={reload} fail={fail}
        onDeleted={() => { setSel(null); reload() }} />
        : <p className="fl-hint muted">{tr('점을 누르면 아래에 자세히 보입니다. 두 번 누르면 가운데로, 끌면 다른 칸으로 옮깁니다.', 'Click a dot to see it below. Double-click to center it; drag it to another cell.')}</p>}
      </>}
    </section>
  )
}

/** 줄 이름 고치기 칸: 이름 · 줄 빼기(맨 위 · 맨 아래 빈 줄만) · 취소 · 저장. 바깥을 누르거나 Esc면 닫는다 */
function RowEditor({ top, name, canDrop, empty, onClose, onSave, onDrop }: { top: number; name: string; canDrop: boolean; empty: boolean; onClose(): void; onSave(text: string): void; onDrop(): void }) {
  const [text, setText] = useState(name)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node) && !(e.target as Element).closest?.('.fl-rowhead')) onClose() }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [onClose])
  const why = canDrop ? '' : empty ? tr('맨 위 · 맨 아래 빈 줄만 뺄 수 있습니다', 'Only an empty top or bottom row can be removed') : tr('점이 있는 줄은 뺄 수 없습니다. 점을 다른 줄로 옮긴 뒤 뺍니다', 'A row with dots cannot be removed. Move its dots first')
  return (
    <div ref={box} className="fl-rowpop" data-ui="흐름 줄 고치기 칸" style={{ top, left: -GUT }} onClick={(e) => e.stopPropagation()}>
      <input autoFocus aria-label={tr('줄 이름', 'Row name')} placeholder={tr('줄 이름', 'Row name')} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave(text) } else if (e.key === 'Escape') onClose() }} />
      <div className="fl-rowpop-foot">
        <button type="button" className="btn sm" data-ui="흐름 줄 빼기" disabled={!canDrop} title={why || undefined} onClick={onDrop}>{tr('줄 빼기', 'Remove row')}</button>
        <span className="sp" />
        <button type="button" className="btn sm" onClick={onClose}>{tr('취소', 'Cancel')}</button>
        <button type="button" className="btn primary sm" onClick={() => onSave(text)}>{tr('저장', 'Save')}</button>
      </div>
    </div>
  )
}
