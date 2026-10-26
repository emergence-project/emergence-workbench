import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { go } from '../router'
import type { FlowNode } from '../api'
import { bundleFlow, layoutBundle, type Bundle } from '../flowBundles'
import { roundedPath } from '../flowRoute'
import { t as tr } from '../i18n'
import { Icon } from '../icons'
import type { TopicRef } from './data'
import { KIND, markOf, markState, markTurn, stateOf, MarkSvg, judgedOf, turnOf } from './marks'

const CW = 170, RH = 96, TOP = 14, LEFT = 128

/** 묶음의 겉모양: 답이 나온 묶음은 대표 명제, 아니면 질문(질문 없이 시작했으면 첫 점) */
const faceOf = (b: Bundle): FlowNode => b.answer ?? b.question ?? b.nodes[0]!
const nameOf = (b: Bundle) => faceOf(b).short
const turnCount = (b: Bundle) => b.nodes.filter(turnOf).length

/**
 * 접은 흐름 (10/23 "판단 설계" 4단계): 묶음 하나가 점 하나. 속이 찬 것은 명제가 모두 승인된 묶음, 빈 것은 판단 전,
 * 주황 고리는 판단할 것이 든 묶음. 누르면 그 묶음의 점을 작은 흐름으로 보이는 창이 열린다.
 */
export function FlowBundles({ rid, all, topics, focus, foldSwitch, onOpenDot }: {
  rid: string; all: FlowNode[]; topics: TopicRef[]; focus?: string; foldSwitch: ReactNode; onOpenDot(id: string): void
}) {
  const lay = useMemo(() => bundleFlow(all, topics.map((x) => x.id)), [all, topics])
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState<Bundle | null>(null)
  const title = (id: string | null) => id === null ? tr('주제 없음', 'No topic') : topics.find((x) => x.id === id)?.title ?? id
  const rowTop = new Map<string | null, number>()
  let y0 = 0
  for (const t of lay.topics) { rowTop.set(t.id, y0); y0 += t.depth }
  const X = (b: Bundle) => LEFT + CW * b.col + CW / 2
  const Y = (b: Bundle) => TOP + RH * (rowTop.get(b.topic)! + b.stack) + RH / 2 - 14
  const W = LEFT + CW * lay.cols + 16, H = TOP + RH * y0
  const byId = new Map(lay.bundles.map((b) => [b.id, b]))
  const waiting = lay.bundles.reduce((s, b) => s + turnCount(b), 0)
  // 같은 틈(받는 묶음 바로 앞)에 여러 선이 오면 7px씩 비킨다
  const slot = new Map<string, number>()
  const lines = lay.lines.map((l) => {
    const a = byId.get(l.from)!, b = byId.get(l.to)!
    const x1 = X(a) + 18, y1 = Y(a), x2 = X(b) - 18, y2 = Y(b)
    if (y1 === y2) return { l, d: `M${x1} ${y1}H${x2}` }
    const key = `${b.col}`, k = slot.get(key) ?? 0
    slot.set(key, k + 1)
    const xb = X(b) - CW / 2 + 8 + 7 * k
    return { l, d: roundedPath([[x1, y1], [xb, y1], [xb, y2], [x2, y2]], 12) }
  })
  const hot = (b: Bundle) => !focus || b.nodes.some((n) => n.topics.includes(focus))
  return (
    <section className="fl" data-ui="흐름">
      <div className="fl-bar">
        {foldSwitch}
        <span className="fl-sum">{tr(`묶음 ${lay.bundles.length}`, `${lay.bundles.length} bundles`)}{waiting > 0 && <span className="fl-turn-name"> · {tr(`판단 대기 ${waiting}`, `${waiting} to judge`)}</span>}</span>
      </div>
      {lay.bundles.length === 0 ? <p className="fl-hint muted">{tr('흐름의 점이 없습니다. 펼치기에서 ＋ 시작점으로 첫 걸음을 더합니다.', 'No dots yet. Choose Open and add the first step with ＋ Start.')}</p>
        : <div className="fl-box fl-bundles" data-ui="흐름 묶음" onClick={(e) => { if (!(e.target as Element).closest('.fl-node')) setSel(null) }}>
          <svg className="fl-svg" width={W} height={H} role="img" aria-label={tr('접은 흐름', 'Folded flow')}>
            {lay.topics.map((t, i) => <g key={String(t.id)}>
              {i > 0 && <line className="fl-grid" x1={0} x2={W} y1={TOP + RH * rowTop.get(t.id)! - 8} y2={TOP + RH * rowTop.get(t.id)! - 8} />}
              <text className="fl-topic" x={12} y={TOP + RH * rowTop.get(t.id)! + RH / 2 - 10}>{title(t.id)}</text>
            </g>)}
            {lines.map(({ l, d }) => <path key={`${l.from}>${l.to}`} className={`fl-e${l.cross ? ' cross' : ''}${sel && (l.from === sel || l.to === sel) ? ' on' : ''}`} d={d} />)}
            {lay.bundles.map((b) => {
              const x = X(b), y = Y(b), face = faceOf(b), m = markOf(face)
              const c = b.counts
              const tally = [c.work && tr(`작업 ${c.work}`, `${c.work} work`), c.literature && tr(`문헌 ${c.literature}`, `${c.literature} reading`), c.finding && tr(`명제 ${c.finding}`, `${c.finding} propositions`), c.refuted && tr(`반증 ${c.refuted}`, `${c.refuted} refuted`)].filter(Boolean).join(' · ')
              return <g key={b.id} className={`fl-node fl-bundle${b.side ? ' side' : ''}${hot(b) ? '' : ' dim'}`} data-id={b.id} tabIndex={0} role="button"
                aria-label={`${b.answer ? '!' : '?'} ${nameOf(b)}`}
                onClick={() => { setSel(b.id); setOpen(b) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(b.id); setOpen(b) } }}>
                <title>{`${b.question?.title ?? face.title}\n${tr(`점 ${b.nodes.length}`, `${b.nodes.length} dots`)}${tally ? ` · ${tally}` : ''}`}</title>
                <rect className="fl-hit" x={x - CW / 2 + 6} y={y - 20} width={CW - 12} height={64} rx={6} />
                {!b.question && <circle className="fl-noq" cx={x} cy={y} r={22}><title>{tr('질문 없이 시작', 'Started without a question')}</title></circle>}
                {sel === b.id && <circle className="fl-ring sel" cx={x} cy={y} r={19} />}
                {turnCount(b) > 0 && sel !== b.id && <circle className="fl-turn" cx={x} cy={y} r={19} />}
                <MarkSvg m={m} x={x} y={y} state={markState(face)} judged={b.answer ? b.judged : undefined} turn={markTurn(face)} />
                <text className="fl-name" x={x} y={y + 32} textAnchor="middle">{nameOf(b)}</text>
                {tally && <text className="fl-tally" x={x} y={y + 47} textAnchor="middle">{tally}</text>}
              </g>
            })}
          </svg>
        </div>}
      {open && <BundleWindow rid={rid} b={open} onClose={() => setOpen(null)} onOpenDot={(id) => { setOpen(null); onOpenDot(id) }} />}
    </section>
  )
}

/** 접힌 묶음의 창: 그 묶음의 점만 작은 흐름으로. 점을 누르면 펼친 흐름에서 그 점을 연다 */
function BundleWindow({ rid, b, onClose, onOpenDot }: { rid: string; b: Bundle; onClose(): void; onOpenDot(id: string): void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const pos = layoutBundle(b)
  const cw = 112, rh = 76
  const at = new Map(pos.map((p) => [p.id, p]))
  const X = (c: number) => 20 + cw * c + cw / 2, Y = (r: number) => 26 + rh * r
  const W = 40 + cw * Math.max(1, ...pos.map((p) => p.c + 1)), H = 30 + rh * Math.max(1, ...pos.map((p) => p.r + 1))
  const turns = b.nodes.filter(turnOf)
  const face = faceOf(b)
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog wide fl-bwin" role="dialog" aria-modal="true" aria-label={nameOf(b)} data-ui="흐름 묶음 창">
        <div className="dialog-head fl-bwin-head">
          <span>{b.answer ? '!' : '?'} {nameOf(b)}</span>
          <button className="icon-btn" title={tr('닫기', 'Close')} aria-label={tr('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
        </div>
        <div className="dialog-body">
          {(b.question?.title ?? face.title) !== nameOf(b) && <p className="muted fl-bwin-q">{b.question?.title ?? face.title}</p>}
          <div className="fl-bwin-chart">
            <svg className="fl-svg" width={W} height={H} role="img" aria-label={tr('묶음의 점', 'Dots in the bundle')}>
              {b.nodes.flatMap((n) => n.from.filter((f) => at.has(f.id)).map((f) => {
                const p = at.get(f.id)!, q = at.get(n.id)!
                const x1 = X(p.c) + 16, y1 = Y(p.r), x2 = X(q.c) - 16, y2 = Y(q.r), xb = X(q.c) - cw / 2 + 10
                return <path key={`${f.id}>${n.id}`} className={`fl-e${f.type === 'use' ? ' use' : ''}`} d={y1 === y2 ? `M${x1} ${y1}H${x2}` : roundedPath([[x1, y1], [xb, y1], [xb, y2], [x2, y2]], 10)} />
              }))}
              {b.nodes.map((n) => {
                const p = at.get(n.id)!, x = X(p.c), y = Y(p.r)
                return <g key={n.id} className="fl-node" data-id={n.id} tabIndex={0} role="button" aria-label={`${KIND[markOf(n)].name()} · ${n.short}`}
                  onClick={() => onOpenDot(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDot(n.id) } }}>
                  <title>{`${KIND[markOf(n)].name()} · ${n.title}`}</title>
                  <rect className="fl-hit" x={x - cw / 2 + 4} y={y - 18} width={cw - 8} height={48} rx={6} />
                  {turnOf(n) && <circle className="fl-turn" cx={x} cy={y} r={19} />}
                  <MarkSvg m={markOf(n)} x={x} y={y} state={markState(n)} judged={judgedOf(n)} turn={markTurn(n)} />
                  <text className="fl-name" x={x} y={y + 30} textAnchor="middle">{n.short}</text>
                </g>
              })}
            </svg>
          </div>
        </div>
        <div className="dialog-foot">
          {turns.length > 0 && <button className="btn" data-ui="흐름 묶음 판단할 것" onClick={() => { onClose(); go({ page: 'judge', rid, id: turns[0]!.id }) }}>{tr(`판단할 것 ${turns.length} 보기`, `View ${turns.length} to judge`)}</button>}
          <button className="btn primary" data-ui="흐름 묶음 펼치기" onClick={() => onOpenDot(b.id)}>{tr('흐름에서 펼치기', 'Open in the flow')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
