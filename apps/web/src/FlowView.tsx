/**
 * 연구 흐름 (주제 화면, 10/14 시안 "주제 화면 시안" · "GAMC 연구 흐름"): 점 하나 = 생각의 한 걸음, 선 = "어디서 왔나".
 * 가로는 생각의 순서(날짜가 아니다), 기호는 종류, 색은 상태. 1단계는 읽기만 한다 (파일은 workbench/flow/*.yaml, 에이전트가 쓴다).
 * 점을 누르면 아래에 자세히, 두 번 누르면 그 점을 가운데로. 계보(앞선 점·뒤따른 점)는 늘 크게 보인다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flowApi, type FlowEvidence, type FlowKind, type FlowNode, type NoteRow } from './api'
import { layoutFlow, lineageOf, type FlowLayout } from './flowLayout'
import { MathText } from './cardParts'
import { StatusDot } from './StatusDot'
import { routeOfNote } from './RightSidebar'
import { go } from './router'
import { store } from './store'
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
  literature: { act: true, name: () => tr('문헌', 'Literature'), def: () => tr('선행 연구의 검토. 검토 자체가 다음 걸음을 낳았을 때만 점이고, 근거로 쓴 논문은 받는 점 위의 §로 붙는다.', 'Reviewing prior work. A dot only when the review led to the next step; papers used as evidence hang as § above the dot.') },
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
const H_KEY = 'rw-flow-h', Z_KEY = 'rw-flow-zoom', SEL_KEY = 'rw-flow-sel'
const DEFAULT_H = TOP + 5 * RH0 + 16

export function FlowSection({ rid, tid, version, notes }: { rid: string; tid: string; version: number; notes: NoteRow[] }) {
  const [all, setAll] = useState<FlowNode[] | null>(null)
  const [warn, setWarn] = useState(0)
  useEffect(() => {
    flowApi(rid).scan().then((r) => { setAll(r.nodes); setWarn(r.diagnostics.length) }).catch(() => setAll([]))
  }, [rid, version])
  const lay = useMemo(() => all ? layoutFlow(all, tid) : null, [all, tid])
  if (!all || !lay || !lay.placed.length) return null
  return <FlowChart key={tid} rid={rid} all={all} lay={lay} warn={warn} notes={notes} />
}

function FlowChart({ rid, all, lay, warn, notes }: { rid: string; all: FlowNode[]; lay: FlowLayout; warn: number; notes: NoteRow[] }) {
  const ids = new Set(lay.placed.map((p) => p.node.id))
  const [sel, setSelState] = useState<string | null>(() => { const s = store.get<Record<string, string>>(SEL_KEY, {})[rid]; return s && ids.has(s) ? s : null })
  // 누른 점의 자세히가 화면 밖이면 보이게 (처음 열 때 기억한 점으로는 움직이지 않는다)
  const reveal = useRef(false)
  const setSel = (id: string | null) => { reveal.current = !!id; setSelState(id); store.set(SEL_KEY, { ...store.get<Record<string, string>>(SEL_KEY, {}), [rid]: id ?? undefined }) }
  const [zoom, setZoomState] = useState<{ x: number; y: number; fit: boolean }>(() => store.get(Z_KEY, { x: 1, y: 1, fit: false }))
  const setZoom = (z: typeof zoom) => { setZoomState(z); store.set(Z_KEY, z) }
  const [height, setHeightState] = useState(() => store.get<number>(H_KEY, DEFAULT_H))
  const setHeight = (h: number) => { setHeightState(h); store.set(H_KEY, h) }
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(800)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitCW = Math.max(32, Math.min(CW0, (boxW - LEFT - 8) / Math.max(1, lay.cols)))
  const CW = zoom.fit ? fitCW : CW0 * zoom.x
  const RH = RH0 * zoom.y
  const compact = CW < 64 || RH < 48
  const X = (c: number) => LEFT + CW * c + CW / 2
  const Y = (r: number) => TOP + RH * r + RH / 2 - 6
  const W = LEFT + CW * lay.cols + CW / 2
  const H = TOP + RH * lay.rows + 1
  const at = new Map(lay.placed.map((p) => [p.node.id, p]))
  const byId = new Map(all.map((n) => [n.id, n]))
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
    if ((e.target as Element).closest('.fl-node') || !box.current) return
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

  const route = (x1: number, y1: number, x2: number, y2: number, xm: number) =>
    y1 === y2 || x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${x1 + CW * 0.6} ${y1} ${xm - CW * 0.6} ${y2} ${xm} ${y2}L${x2} ${y2}`

  const s = sel ? byId.get(sel) : undefined
  return (
    <section className="fl" data-ui="흐름">
      <div className="fl-bar">
        <h2 className="fl-title">{tr('흐름', 'Flow')}</h2>
        <span className="fl-sum">{tr(`점 ${lay.placed.length}`, `${lay.placed.length} dots`)}{warn > 0 && <span className="fl-warn" title={tr('형식에 맞지 않는 곳이 있습니다. pnpm agent:check로 봅니다.', 'Some files do not match the format. See pnpm agent:check.')}> · {tr(`형식 경고 ${warn}`, `${warn} format warnings`)}</span>}</span>
        <span className="sp" />
        <span className="fl-zoom" data-ui="흐름 확대">
          <span className="fl-zl">{tr('가로', 'Width')}</span>
          <button className="icon-btn" title={tr('가로 좁히기', 'Narrower')} aria-label={tr('가로 좁히기', 'Narrower')} onClick={() => step('x', -1)}>−</button>
          <button className="icon-btn" title={tr('가로 넓히기', 'Wider')} aria-label={tr('가로 넓히기', 'Wider')} onClick={() => step('x', 1)}>＋</button>
          <span className="fl-zl">{tr('세로', 'Height')}</span>
          <button className="icon-btn" title={tr('세로 좁히기', 'Shorter')} aria-label={tr('세로 좁히기', 'Shorter')} onClick={() => step('y', -1)}>−</button>
          <button className="icon-btn" title={tr('세로 넓히기', 'Taller')} aria-label={tr('세로 넓히기', 'Taller')} onClick={() => step('y', 1)}>＋</button>
          <button className={`btn small${zoom.fit ? ' on' : ''}`} aria-pressed={zoom.fit} title={tr('가로를 상자 폭에 맞추기', 'Fit the width to the box')} onClick={() => setZoom({ ...zoom, fit: !zoom.fit })}>{tr('전체 보기', 'Fit')}</button>
        </span>
      </div>
      <div className="fl-box" ref={box} style={{ height }} data-ui="흐름 차트" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClick={(e) => { if (!(e.target as Element).closest('.fl-node')) setSel(null) }}>
        <svg className="fl-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('연구 흐름', 'Research flow')}>
          {Array.from({ length: lay.cols }, (_, c) => c > 0 && <line key={`c${c}`} className="fl-grid" x1={X(c)} y1={1} x2={X(c)} y2={H} />)}
          {Array.from({ length: lay.rows }, (_, r) => <line key={`r${r}`} className={r === lay.mid ? 'fl-mid' : 'fl-grid'} x1={LEFT} y1={Y(r)} x2={W} y2={Y(r)} />)}
          {lay.lines.map((l) => {
            const p = at.get(l.from)!, n = at.get(l.to)!
            const x1 = X(p.c), y1 = Y(p.r), x2 = X(n.c), y2 = Y(n.r)
            const on = edgeOn(l.from, l.to)
            const cls = `fl-e${on ? ' on' : ''}${l.type === 'use' ? ' use' : p.node.kind === 'literature' ? ' lit' : ''}`
            return <g key={`${l.from}>${l.to}`}>
              <path className={cls} d={route(x1, y1, x2, y2, n.c - p.c > 1 ? X(p.c + 1) : x2)}><title>{EDGE[l.type]!()}</title></path>
              {l.type === 'refute' && <path className={`fl-bar-x${on ? ' on' : ''}`} d={`M${x2 - 24} ${y2 - 7}V${y2 + 7}`} />}
            </g>
          })}
          {lay.placed.map(({ node: n, c, r }) => {
            const x = X(c), y = Y(r), on = n.id === sel, lg = inLin(n.id) && !on
            const refs = n.evidence.filter((e) => e.kind === 'paper' && e.ref)
            const out = lay.outside.get(n.id)
            const start = !n.from.length
            return <g key={n.id} className={`fl-node${on ? ' sel' : ''}`} tabIndex={0} role="button" data-id={n.id}
              aria-label={`${n.short}: ${KIND[markOf(n)].name()}, ${stateName(n)}`}
              onClick={() => setSel(n.id)} onDoubleClick={() => { setSel(n.id); center(n.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(n.id) } }}>
              <rect className="fl-hit" x={x - CW / 2 + 4} y={y - 18} width={CW - 8} height={compact ? 34 : 52} rx={6} />
              {lg && (KIND[markOf(n)].act
                ? <rect className="fl-ring" x={x - 18} y={y - 18} width={36} height={36} rx={8} />
                : <circle className="fl-ring" cx={x} cy={y} r={19} />)}
              <MarkSvg m={markOf(n)} x={x} y={y} state={stateOf(n)} big={on || lg} />
              {refs.length > 0 && <g className="fl-refs">
                <title>{refs.map((e) => e.ref).join('\n')}</title>
                <path className="fl-e lit" d={`M${x} ${y - 22}L${x} ${y - 17}`} />
                {refs.length > 1 && <rect className="fl-ref" x={x - 6} y={y - 45} width={18} height={18} rx={4} />}
                <rect className="fl-ref" x={x - 9} y={y - 42} width={18} height={18} rx={4} />
                <text className="fl-ref-t" x={x} y={y - 28.5} textAnchor="middle">§</text>
              </g>}
              {out ? <path className="fl-start out" d={`M${x - 29} ${y - 7}L${x - 20} ${y}L${x - 29} ${y + 7}Z`}><title>{tr('다른 주제에서', 'From another topic')}: {out.map((o) => o.short).join(', ')}</title></path>
                : start && <path className="fl-start" d={`M${x - 29} ${y - 7}L${x - 20} ${y}L${x - 29} ${y + 7}Z`}><title>{tr('시작점: 앞선 점이 없다', 'Start: no earlier dot')}</title></path>}
              {n.end && <line className="fl-end" x1={x + 20} y1={y - 10} x2={x + 20} y2={y + 10}><title>{tr('갈래 종결', 'Branch closed')}</title></line>}
              {!compact || on ? <text className={`fl-name${on || lg ? ' strong' : ''}`} x={x} y={y + (compact ? 27 : 30)} textAnchor="middle">{n.short}</text> : <title>{n.short} · {n.title}</title>}
            </g>
          })}
        </svg>
      </div>
      <div className="fl-size" data-ui="흐름 크기 조절" role="separator" aria-orientation="horizontal" title={tr('끌어 높이 바꾸기 · 두 번 누르면 처음 높이', 'Drag to resize · double-click to reset')}
        onPointerDown={(e) => { sizing.current = { y: e.clientY, h: height }; (e.target as Element).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { const s0 = sizing.current; if (s0) setHeightState(Math.max(160, Math.min(1200, s0.h + e.clientY - s0.y))) }}
        onPointerUp={() => { if (sizing.current) { sizing.current = null; setHeight(box.current?.clientHeight ?? height) } }}
        onDoubleClick={() => setHeight(DEFAULT_H)} />
      {s ? <FlowCard reveal={reveal} rid={rid} n={s} all={all} byId={byId} inTopic={ids} notes={notes} onPick={(id) => { setSel(id); center(id) }} />
        : <p className="fl-hint muted">{tr('점을 누르면 아래에 자세히 보입니다. 두 번 누르면 그 점을 가운데로 옮깁니다.', 'Click a dot to see it below. Double-click to center it.')}</p>}
    </section>
  )
}

function FlowCard({ reveal, rid, n, all, byId, inTopic, notes, onPick }: {
  reveal: React.MutableRefObject<boolean>; rid: string; n: FlowNode; all: FlowNode[]; byId: Map<string, FlowNode>; inTopic: Set<string>; notes: NoteRow[]; onPick(id: string): void
}) {
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
  const openLink = (m: FlowNode) => {
    if (inTopic.has(m.id)) return onPick(m.id)
    store.set(SEL_KEY, { ...store.get<Record<string, string>>(SEL_KEY, {}), [rid]: m.id })
    if (m.topics[0]) go({ page: 'topic', rid, tid: m.topics[0] })
  }
  const link = ({ f, m }: { f: { type: string }; m: FlowNode }) => (
    <li key={m.id}>
      <span className="fl-ety">{EDGE[f.type]!()}</span>
      <button className="a fl-pill" onClick={() => openLink(m)} title={m.title}><MarkIcon n={m} size={16} /><span>{m.short}</span></button>
      {!inTopic.has(m.id) && <span className="muted">{tr('다른 주제', 'other topic')}</span>}
    </li>
  )
  return (
    <article className="fl-card" ref={el} data-ui="흐름 점 자세히">
      <div className="fl-head"><MarkIcon n={n} size={30} /><span className="fl-short">{n.short}</span>{n.date && <span className="muted">{n.date}</span>}</div>
      <div className="fl-full">{n.title}</div>
      <div className="fl-cls">
        <span title={K.def()}><i>{tr('종류', 'Kind')}</i>{K.act ? tr('행위', 'Action') : tr('진술', 'Statement')} · {K.name()}</span>
        {hasProof && !n.theorem && <span className="muted">{tr('증명 승인 대기 · 승인하면 정리', 'Proof awaiting approval · becomes a theorem when approved')}</span>}
        <span><i>{tr('상태', 'State')}</i><StatusDot s={DOT[stateOf(n)]} name={stateName(n)} label /></span>
        {n.end && <span>{tr('갈래 종결', 'Branch closed')}</span>}
      </div>
      <section className="fl-sec">
        <h3>{tr('설명', 'Description')}</h3>
        {order.length ? <dl className="fl-fields">{order.map((f) => <div key={f}><dt>{FIELD[f]?.() ?? f}</dt><dd><MathText text={n.fields[f]!} /></dd></div>)}</dl>
          : <span className="muted">{tr('아직 없음', 'None yet')}</span>}
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
            <td className="vc"><Check e={e} role="human" /></td>
          </tr>)}</tbody>
        </table></div> : <span className="muted">{tr('없음', 'None')}</span>}
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

function Check({ e, role }: { e: FlowEvidence; role: 'agent' | 'human' }) {
  const c = [...e.checks].reverse().find((x) => x.role === role)
  const name = role === 'agent' ? tr('에이전트 검토', 'Agent check') : tr('사람 승인', 'Human approval')
  const tip = c ? `${name}: ${c.by} · ${c.at}${c.note ? `\n${c.note}` : ''}` : `${name}: ${tr('안 됨', 'not yet')}`
  return <span className={`fl-check${c ? ' on' : ''}`} role="img" aria-label={tip} title={tip}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>{c
      ? <><circle cx="8" cy="8" r="7" /><path d="M4.6 8.2l2.2 2.2 4.4-4.6" /></>
      : <circle cx="8" cy="8" r="6.2" />}</svg>
  </span>
}

const Chain = <svg className="fl-chain" width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.9.9" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.2 9.1a2.6 2.6 0 0 0 3.7 3.7l.9-.9" /></svg>
