import { useMemo, useState } from 'react'
import type { KnowledgeTopic } from './api'
import { Icon } from './icons'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { go } from './router'
import { t as tl } from './i18n'

/**
 * 지식 지도 — 증명 구조 지도(층·초점)와 따로, 개념 사이의 연결을 본다.
 * - 전체: Study 분류마다 구역, 그 안에 주제. 선은 Study·Topic Review의 [[링크]]. 테두리는 상태.
 *   주제를 누르면 이웃만 진하게, 한 번 더 누르면 초점 보기.
 * - 초점: 가운데 주제, 왼쪽 전제(이 주제가 링크하는 것), 오른쪽 이어지는 개념(이 주제를 링크하는 것), 아래 쓰는 프로젝트.
 */
export const STATUS_NAME: Record<KnowledgeTopic['status'], string> = { study: tl('Study만', 'Study only'), draft: tl('확인 전', 'Not reviewed'), reviewed: tl('확인함', 'Reviewed'), paper: tl('문헌', 'Literature') }
export const NO_SUBJECT = tl('분류 없음', 'No subject')
export const subjectOf = (t: KnowledgeTopic) => t.subject || (t.review ? 'Topic Review' : NO_SUBJECT)

export function KnowledgeStatus({ s }: { s: KnowledgeTopic['status'] }) {
  return <span className={`kn-st ${s}`}>{STATUS_NAME[s]}</span>
}

/** 가진 것: S Study 원료 · C 개념노트 · R Topic Review · 문헌노트 수 */
/** 이 주제에 있는 자료를 말로 적는다 (없는 것은 적지 않는다) */
export function sourceWords(t: KnowledgeTopic): string {
  const have = [
    t.study && tl('Study 원료', 'Study material'),
    t.concept && tl('개념노트', 'Concept note'),
    t.review && 'Topic Review',
    t.papers.length > 0 && tl(`문헌노트 ${t.papers.length}`, `Literature notes ${t.papers.length}`),
  ].filter(Boolean)
  return have.length ? have.join(' · ') : tl('자료 없음', 'No materials')
}

export function Sources({ t }: { t: KnowledgeTopic }) {
  return <span className="kn-src">{sourceWords(t)}</span>
}

const NODE_W = 172, NODE_H = 28, GAP_X = 12, GAP_Y = 14, PAD = 14, HEAD = 30, CL_GAP = 16

interface Layout { w: number; h: number; clusters: { name: string; x: number; y: number; w: number; h: number }[]; pos: Map<string, { x: number; y: number }> }

/** 분류 구역을 선반처럼 채운다. 구역 안에서는 이웃끼리 붙도록 연결을 따라 늘어놓는다 */
function layout(topics: KnowledgeTopic[], width: number): Layout {
  const groups = new Map<string, KnowledgeTopic[]>()
  for (const t of topics) { const g = subjectOf(t); groups.set(g, [...(groups.get(g) ?? []), t]) }
  const inSet = new Set(topics.map((t) => t.key))
  const degree = (t: KnowledgeTopic) => t.links.filter((k) => inSet.has(k)).length + t.linkedBy.filter((k) => inSet.has(k)).length
  const byKey = new Map(topics.map((t) => [t.key, t]))
  const boxes = [...groups].map(([name, ts]) => {
    // 연결을 따라가며 순서를 정한다 (차수 큰 것부터)
    const left = new Set(ts.map((t) => t.key))
    const order: KnowledgeTopic[] = []
    const seeds = [...ts].sort((a, b) => degree(b) - degree(a) || a.title.localeCompare(b.title))
    for (const s of seeds) {
      if (!left.has(s.key)) continue
      const queue = [s]
      left.delete(s.key)
      while (queue.length) {
        const t = queue.shift()!
        order.push(t)
        for (const k of [...t.links, ...t.linkedBy]) if (left.has(k)) { left.delete(k); queue.push(byKey.get(k)!) }
      }
    }
    const cols = Math.max(1, Math.min(Math.floor((width - 2 * PAD) / (NODE_W + GAP_X)), Math.ceil(Math.sqrt(order.length * 0.8))))
    const rows = Math.ceil(order.length / cols)
    return { name, order, cols, w: cols * (NODE_W + GAP_X) - GAP_X + 2 * PAD, h: HEAD + rows * (NODE_H + GAP_Y) - GAP_Y + PAD }
  }).sort((a, b) => b.order.length - a.order.length || a.name.localeCompare(b.name))

  const clusters: Layout['clusters'] = []
  const pos: Layout['pos'] = new Map()
  let x = 0, y = 0, rowH = 0, maxW = 0
  for (const b of boxes) {
    if (x > 0 && x + b.w > width) { x = 0; y += rowH + CL_GAP; rowH = 0 }
    clusters.push({ name: b.name, x, y, w: b.w, h: b.h })
    b.order.forEach((t, i) => pos.set(t.key, { x: x + PAD + (i % b.cols) * (NODE_W + GAP_X), y: y + HEAD + Math.floor(i / b.cols) * (NODE_H + GAP_Y) }))
    x += b.w + CL_GAP
    rowH = Math.max(rowH, b.h)
    maxW = Math.max(maxW, x - CL_GAP)
  }
  return { w: Math.max(maxW, 200), h: y + rowH, clusters, pos }
}

const clip = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function KnowledgeMap({ topics, focus, onOpen }: { topics: KnowledgeTopic[]; focus?: string; onOpen(key: string): void }) {
  const byKey = useMemo(() => new Map(topics.map((t) => [t.key, t])), [topics])
  const f = focus ? byKey.get(focus) : undefined
  if (f) return <FocusView t={f} byKey={byKey} onOpen={onOpen} />
  return <WholeMap topics={topics} byKey={byKey} />
}

/** 전체 지도를 분류 하나씩 그리기 시작하는 주제 수 */
const WHOLE_LIMIT = 400
const topArea = (subject: string) => subject.split(/\s*›\s*/)[0] || NO_SUBJECT

function WholeMap({ topics, byKey }: { topics: KnowledgeTopic[]; byKey: Map<string, KnowledgeTopic> }) {
  const [only, setOnly] = useState<'all' | 'noted' | 'used'>('all')
  const [sel, setSel] = useState<string | null>(null)
  // 전체 지도는 주제가 많으면 분류 하나씩 (노트가 수만 개여도 한 번에 다 그리지 않는다)
  const areas = useMemo(() => [...new Set(topics.filter((t) => t.status !== 'paper').map((t) => topArea(t.subject)))].sort((a, b) => (a === NO_SUBJECT ? 1 : b === NO_SUBJECT ? -1 : a.localeCompare(b))), [topics])
  const many = topics.length > WHOLE_LIMIT
  const [area, setArea] = useState<string>('')
  const curArea = area || (many ? areas[0] ?? '' : '')
  const shown = useMemo(() => topics.filter((t) => t.status !== 'paper' && (!curArea || topArea(t.subject) === curArea) && (only === 'all' || (only === 'noted' ? t.concept || t.review : t.uses.length > 0))), [topics, only, curArea])
  const L = useMemo(() => layout(shown, 1180), [shown])
  const near = useMemo(() => {
    if (!sel) return null
    const t = byKey.get(sel)
    return new Set([sel, ...(t?.links ?? []), ...(t?.linkedBy ?? [])])
  }, [sel, byKey])
  const edges = useMemo(() => shown.flatMap((t) => t.links.filter((k) => L.pos.has(k)).map((k) => [t.key, k] as const)), [shown, L])

  return (
    <div className="kn-map" data-ui="지식 지도">
      <div className="kn-map-bar">
        <span className="sp" />
        {areas.length > 1 && (
          <select className="mini-select" value={curArea} aria-label={tl('분류', 'Subject')} title={many ? tl('주제가 많아 분류 하나씩 그립니다', 'Many topics, so one subject is drawn at a time') : undefined} onChange={(e) => setArea(e.target.value)}>
            {!many && <option value="">{tl('모든 분류', 'All subjects')}</option>}
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <div className="segmented small" role="radiogroup">
          <button className={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>{tl('전체', 'All')} {topics.filter((t) => t.status !== 'paper').length}</button>
          <button className={only === 'noted' ? 'on' : ''} onClick={() => setOnly('noted')} title={tl('개념노트나 Topic Review가 있는 주제', 'Topics with a concept note or Topic Review')}>{tl('정리된 것', 'Written up')}</button>
          <button className={only === 'used' ? 'on' : ''} onClick={() => setOnly('used')} title={tl('프로젝트 노트가 기대는 주제', 'Topics that project notes depend on')}>{tl('프로젝트가 쓰는 것', 'Used by projects')}</button>
        </div>
      </div>
      <div className="kn-map-scroll" onClick={() => setSel(null)}>
        {shown.length === 0 ? <p className="muted lib-hint">{tl('보여 줄 주제가 없습니다.', 'No topics to show.')}</p> : (
          <svg width={L.w} height={L.h} viewBox={`0 0 ${L.w} ${L.h}`}>
            {L.clusters.map((c) => (
              <g key={c.name} className="kn-cl"><rect x={c.x} y={c.y} width={c.w} height={c.h} /><text x={c.x + PAD} y={c.y + 20}>{c.name}</text></g>
            ))}
            {edges.map(([a, b]) => {
              const p = L.pos.get(a)!, q = L.pos.get(b)!
              const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H / 2, x2 = q.x + NODE_W / 2, y2 = q.y + NODE_H / 2
              const my = (y1 + y2) / 2
              const hot = sel !== null && (a === sel || b === sel)
              return <path key={`${a}>${b}`} className={`kn-eg${hot ? ' hot' : ''}${sel && !hot ? ' dim' : ''}`} d={`M${x1} ${y1} C${x1} ${my},${x2} ${my},${x2} ${y2}`} />
            })}
            {shown.map((t) => {
              const p = L.pos.get(t.key)!
              return (
                <g key={t.key} className={`kn-nd ${t.status}${sel === t.key ? ' sel' : ''}${near && !near.has(t.key) ? ' dim' : ''}`} transform={`translate(${p.x},${p.y})`}
                  onClick={(e) => { e.stopPropagation(); if (sel === t.key) go({ page: 'library', view: 'map', topic: t.key }); else setSel(t.key) }}>
                  <title>{`${t.title} — ${STATUS_NAME[t.status]}${t.uses.length ? tl(` · 쓰는 곳 ${t.uses.length}`, ` · used in ${t.uses.length}`) : ''}\n${sel === t.key ? tl('한 번 더 누르면 초점 보기', 'Click again to focus') : tl('누르면 이웃을 봅니다', 'Click to see neighbors')}`}</title>
                  <rect width={NODE_W} height={NODE_H} />
                  <text x={10} y={18}>{clip(t.title)}</text>
                  {t.uses.length > 0 && <svg className="kn-used" x={NODE_W - 15} y={3} width={12} height={12} viewBox="0 0 24 24" aria-hidden="true">{(Icon.research as React.ReactElement<{ children?: React.ReactNode }>).props.children}</svg>}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <div className="kn-legend">
        <span title={tl('한 개념이 다른 개념을 링크하면, 링크한 대상이 전제입니다. 증명 구조 지도와는 따로입니다.', 'When a concept links to another, the linked one is a prerequisite. This is separate from the proof structure map.')}>{tl('— 전제(링크)', '— Prerequisite (link)')}</span>
        <span><i className="study" />{STATUS_NAME.study}</span><span><i className="draft" />{STATUS_NAME.draft}</span><span><i className="reviewed" />{STATUS_NAME.reviewed}</span>
        <span><span className="kn-used" aria-hidden="true">{Icon.research}</span>{tl('프로젝트가 씀', 'Used by a project')}</span>
        <span className="sp" />
        {sel && byKey.get(sel) && <><span>{byKey.get(sel)!.title}</span><button className="btn" onClick={() => go({ page: 'library', view: 'map', topic: sel })}>{tl('초점 보기', 'Focus')}</button><button className="btn" onClick={() => go({ page: 'library', topic: sel })}>{tl('열기', 'Open')}</button></>}
      </div>
    </div>
  )
}

function FocusView({ t, byKey, onOpen }: { t: KnowledgeTopic; byKey: Map<string, KnowledgeTopic>; onOpen(key: string): void }) {
  // 지나온 길 (초점을 옮길 때마다 쌓고, 앞의 것을 누르면 거기까지 되돌린다)
  const [trail, setTrail] = useState<string[]>([])
  const move = (key: string) => {
    const i = trail.indexOf(key)
    setTrail(i >= 0 ? trail.slice(0, i) : [...trail, t.key].slice(-6))
    go({ page: 'library', view: 'map', topic: key })
  }
  const col = (keys: string[], empty: string) => (
    <div className="kn-stack">
      {keys.length === 0 && <p className="muted kn-none">{empty}</p>}
      {keys.map((k) => byKey.get(k)).filter((x): x is KnowledgeTopic => !!x).map((n) => (
        <button key={n.key} className="kn-n" onClick={() => move(n.key)} title={tl('누르면 이 주제로 초점을 옮깁니다', 'Click to focus on this topic')}>
          <span className="t"><b>{n.title}</b><span>{subjectOf(n)}</span></span><KnowledgeStatus s={n.status} />
        </button>
      ))}
    </div>
  )
  return (
    <div className="kn-map" data-ui="지식 지도 초점">
      <div className="kn-map-bar">
        <span className="kn-trail">{trail.map((k) => <span key={k}><a className="a" onClick={() => move(k)}>{byKey.get(k)?.title ?? k}</a> › </span>)}<b>{t.title}</b></span>
        <span className="sp" />
        <button className="btn" onClick={() => go({ page: 'library', view: 'map' })}>{tl('← 전체 지도', '← Full map')}</button>
      </div>
      <div className="kn-focus">
        <div><p className="kn-colh">{tl('전제 — 이것이 기대는 개념', 'Prerequisites: concepts this depends on')}</p>{col(t.links, tl('링크한 개념이 없습니다', 'No linked concepts'))}</div>
        <div className="kn-arrow">→</div>
        <div className="kn-center">
          <div className="kn-center-top"><KnowledgeStatus s={t.status} /><Sources t={t} /></div>
          <h3>{t.title}</h3>
          <p className="muted">{subjectOf(t)}</p>
          {t.summary && <div className="kn-summary"><ObsidianMarkdown text={t.summary} /></div>}
          <button className="btn primary" onClick={() => onOpen(t.key)}>{tl('열기', 'Open')}</button>
        </div>
        <div className="kn-arrow">→</div>
        <div><p className="kn-colh">{tl('이어지는 개념 — 이것을 쓰는 개념', 'Next concepts: concepts that use this')}</p>{col(t.linkedBy, tl('이 주제를 링크한 개념이 없습니다', 'No concepts link to this topic'))}</div>
      </div>
      <div className="kn-uses">
        <span className="muted">{tl('쓰는 프로젝트', 'Used in projects')}</span>
        {t.uses.length === 0 && <span className="muted">{tl('아직 없음', 'None yet')}</span>}
        {t.uses.map((u, i) => (
          <button key={i} className="dep-chip" onClick={() => go(u.note ? { page: 'block', rid: u.rid, bid: u.note } : { page: 'map', rid: u.rid })}>{u.project}{u.noteTitle ? ` · ${u.noteTitle}` : ''}</button>
        ))}
      </div>
    </div>
  )
}
