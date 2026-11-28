import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldColor } from '@rw/core'
import { FIELD_COLORS } from '@rw/core'
import { subjectsApi, type KnowledgeTopic } from './api'
import { Icon } from './icons'
import { InfoOrAgent } from './AgentSide'
import { KnowledgeGraph, SHAPE_SVG, fieldHex, useThemeKey, type GraphHandle, type ZoomState } from './KnowledgeGraph'
import { NO_FIELD, NOTE_STATES, STATE_NAME as NOTE_STATE_NAME, STATE_TIP, fieldColors, fieldOf, fieldsBySize, neighborsOf, noteState, swapColor, type NoteState } from './knowledgeGraph'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { OPEN_RIGHT, setRightMode } from './noteScreen'
import { go } from './router'
import { store } from './store'
import { SUBJECTS_CHANGED, useSubjects } from './SubjectPicker'
import { t as tl } from './i18n'

/**
 * 지식 지도 (2026-11-28 "지식 지도 방식 개선", 설계 결정 6개). 보기는 둘뿐:
 * - 전체 지도: 모든 개념이 점 하나씩. 점 색 = 분야, 점 모양 = 노트 상태, 이름은 가리킬 때 팝업.
 *   분야 군집은 저절로 떨어져 놓이고 옮기지 않는다. 연결 없는 개념은 흐리게 자기 군집 둘레에.
 * - 초점 보기: 고른 개념과 이웃(한 단계 · 두 단계), 가운데와 바로 이웃만 이름.
 * 점을 누르면 오른쪽 사이드바에 미리 보기, 두 번 누르면 초점 보기. 조작은 지도 위 가운데 툴바 하나.
 */
export const STATUS_NAME: Record<KnowledgeTopic['status'], string> = { study: tl('Study만', 'Study only'), draft: tl('확인 전', 'Not reviewed'), reviewed: tl('확인함', 'Reviewed'), paper: tl('문헌', 'Literature') }

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

const DEPTH_KEY = 'rw-kmap-depth', LEGEND_KEY = 'rw-kmap-legend-folded'

/** 점 모양 그림 (범례 · 미리 보기) */
export function ShapeMark({ state, color }: { state: NoteState; color?: string }) {
  return <svg className="kg-shape" viewBox="0 0 64 64" aria-hidden="true" style={color ? { color } : undefined} dangerouslySetInnerHTML={{ __html: SHAPE_SVG[state] }} />
}

export function KnowledgeMap({ topics, focus, rightOpen, onSaved }: { topics: KnowledgeTopic[]; focus?: string; rightOpen: boolean; onSaved(m: string): void }) {
  const byKey = useMemo(() => new Map(topics.map((t) => [t.key, t])), [topics])
  const nb = useMemo(() => neighborsOf(topics), [topics])
  const fields = useMemo(() => fieldsBySize(topics), [topics])
  const { tree } = useSubjects()
  // 사용자가 고른 분야 색: subjects.yaml 맨 위 분류의 color (분야 이름 = 분류 이름)
  const top = useMemo(() => (tree?.enabled ? tree.items.filter((s) => s.parent === null) : []), [tree])
  const chosen = useMemo(() => new Map(top.flatMap((s) => (s.color ? [[s.name, s.color] as const] : []))), [top])
  const colors = useMemo(() => fieldColors(fields.map((f) => f.field), chosen), [fields, chosen])
  const theme = useThemeKey()
  const hex = useMemo(() => { void theme; return new Map([...colors].map(([f, c]) => [f, fieldHex(c)])) }, [colors, theme])

  const f = focus ? byKey.get(focus) : undefined
  const [picked, setPicked] = useState<string | null>(focus ?? null)
  useEffect(() => { if (focus) setPicked(focus) }, [focus])
  const [depth, setDepthState] = useState<1 | 2>(() => (store.get<number>(DEPTH_KEY, 2) === 1 ? 1 : 2))
  const setDepth = (d: 1 | 2) => { setDepthState(d); store.set(DEPTH_KEY, d) }
  const [zoom, setZoom] = useState<ZoomState>({ pct: 100, atMin: false, atMax: false })
  // 폰 폭에서는 처음에 접어 둔다 (지도가 가려지지 않게)
  const [folded, setFoldedState] = useState(() => store.get<boolean>(LEGEND_KEY, window.innerWidth < 760))
  const setFolded = (v: boolean) => { setFoldedState(v); store.set(LEGEND_KEY, v) }
  const [colorsOpen, setColorsOpen] = useState(false)
  const graph = useRef<GraphHandle>(null)
  // 지나온 길 (초점을 옮길 때마다 쌓고, 앞의 것을 누르면 거기까지 되돌린다)
  const [trail, setTrail] = useState<string[]>([])

  const pick = (key: string | null) => {
    setPicked(key)
    if (key) { setRightMode('info'); window.dispatchEvent(new Event(OPEN_RIGHT)) }
  }
  const toFocus = (key: string) => {
    if (f) { const i = trail.indexOf(key); setTrail(i >= 0 ? trail.slice(0, i) : [...trail, f.key].slice(-6)) } else setTrail([])
    go({ page: 'kmap', topic: key })
  }
  const toWhole = () => { setTrail([]); go({ page: 'kmap' }) }

  const isolated = useMemo(() => topics.filter((t) => (nb.get(t.key)?.size ?? 0) === 0).length, [topics, nb])
  const stateCount = useMemo(() => { const n = new Map<NoteState, number>(); for (const t of topics) n.set(noteState(t), (n.get(noteState(t)) ?? 0) + 1); return n }, [topics])

  // 분야 색 바꾸기: 다른 분야가 쓰는 색이면 두 분야를 맞바꾼다 (한 번에 저장)
  const idOf = (field: string) => top.find((s) => s.name === field)?.id
  const saveColors = async (changes: Map<string, FieldColor | null>) => {
    if (!tree) return
    const body: Record<string, FieldColor | null> = {}
    for (const [field, c] of changes) { const id = idOf(field); if (id) body[id] = c }
    if (!Object.keys(body).length) return
    try { await subjectsApi.colors(body, tree.hash); window.dispatchEvent(new Event(SUBJECTS_CHANGED)) }
    catch (e) { const m = e instanceof Error ? e.message : String(e); onSaved(tl(`분야 색을 저장하지 못했습니다: ${m}`, `Could not save the field color: ${m}`)) }
  }
  const colorable = !!tree?.enabled && fields.some((x) => idOf(x.field))

  const shown = f ? f.title : null
  const body = topics.length === 0 ? <p className="muted lib-hint kg-empty">{tl('보여 줄 개념이 없습니다.', 'No concepts to show.')}</p> : (
    <KnowledgeGraph ref={graph} topics={topics} nb={nb} colors={colors} focus={f ? { key: f.key, depth } : undefined}
      picked={picked} onPick={pick} onFocus={toFocus} onZoom={setZoom} />
  )

  return (
    <div className={`kh-layout kg-layout${rightOpen ? '' : ' no-right'}`}>
      <div className="kn-map" data-ui={f ? '지식 지도 초점' : '지식 지도'}>
        <div className="kn-map-bar" data-ui="지식 지도 머리줄">
          {f ? (
            <span className="kn-trail">
              <a className="a" onClick={toWhole}>{tl('전체 지도', 'Full map')}</a> ›{' '}
              {trail.map((k) => <span key={k}><a className="a" onClick={() => toFocus(k)}>{byKey.get(k)?.title ?? k}</a> › </span>)}
              <b>{shown}</b>
            </span>
          ) : (
            <span><b>{tl('전체 지도', 'Full map')}</b> <span className="muted">· {tl(`개념 ${topics.length} · 연결 없음 ${isolated}`, `${topics.length} concepts · ${isolated} unlinked`)}</span></span>
          )}
        </div>
        <div className="kg-area">
          {body}
          <div className="kg-tools-wrap">
            <div className="kg-tools" data-ui="지식 지도 툴바">
              <MapSearch topics={topics} onGo={toFocus} />
              {f && <>
                <span className="kg-sep" />
                <span className="kg-seg" role="radiogroup" aria-label={tl('이웃 범위', 'Neighbor range')}>
                  <button className={`kg-tool${depth === 1 ? ' on' : ''}`} role="radio" aria-checked={depth === 1} title={tl('바로 이웃만', 'Direct neighbors only')} onClick={() => setDepth(1)}><span className="ico">{Icon.ring1}</span><span>{tl('이웃', 'Neighbors')}</span></button>
                  <button className={`kg-tool${depth === 2 ? ' on' : ''}`} role="radio" aria-checked={depth === 2} title={tl('이웃의 이웃까지', 'Neighbors of neighbors too')} onClick={() => setDepth(2)}><span className="ico">{Icon.ring2}</span><span>{tl('두 단계', 'Two steps')}</span></button>
                </span>
              </>}
              <span className="kg-sep" />
              <button className="kg-tool" data-ui="축소" aria-label={tl('축소', 'Zoom out')} title={tl('축소', 'Zoom out')} disabled={zoom.atMin} onClick={() => graph.current?.zoomOut()}><span className="ico">{Icon.minus}</span></button>
              <button className="kg-tool kg-zoom" data-ui="맞추기 비율" title={tl('화면에 맞추기 (100%)', 'Fit to screen (100%)')} onClick={() => graph.current?.fit()}>{zoom.pct}%</button>
              <button className="kg-tool" data-ui="확대" aria-label={tl('확대', 'Zoom in')} title={tl('확대', 'Zoom in')} disabled={zoom.atMax} onClick={() => graph.current?.zoomIn()}><span className="ico">{Icon.plus}</span></button>
              <button className="kg-tool" data-ui="화면에 맞추기" aria-label={tl('화면에 맞추기', 'Fit to screen')} title={tl('화면에 맞추기', 'Fit to screen')} onClick={() => graph.current?.fit()}><span className="ico">{Icon.maximize}</span></button>
              {colorable && <>
                <span className="kg-sep" />
                <button className={`kg-tool labeled${colorsOpen ? ' on' : ''}`} data-ui="분야 색" aria-expanded={colorsOpen} title={tl('분야 색 바꾸기', 'Change field colors')} onClick={() => setColorsOpen(!colorsOpen)}>
                  <span className="kg-dots" aria-hidden="true">{fields.slice(0, 4).map((x) => <i key={x.field} style={{ background: hex.get(x.field) }} />)}</span>
                  <span className="kg-tool-label">{tl('분야 색', 'Field colors')}</span>
                </button>
              </>}
            </div>
            {colorsOpen && colorable && <ColorPanel fields={fields.map((x) => x.field).filter((x) => idOf(x))} colors={colors} hasChosen={chosen.size > 0}
              onPick={(field, c) => { void saveColors(swapColor(colors, field, c)) }}
              onReset={() => { void saveColors(new Map(top.filter((s) => s.color).map((s) => [s.name, null]))) }}
              onClose={() => setColorsOpen(false)} />}
          </div>
        </div>
        <Legend fields={fields} hex={hex} states={stateCount} isolated={isolated} folded={folded} onFold={setFolded} />
      </div>
      {rightOpen && <InfoOrAgent ui="지식 지도 미리 보기" onSaved={onSaved}>
        <Preview t={picked ? byKey.get(picked) : undefined} nb={nb} byKey={byKey} color={picked && byKey.get(picked) ? hex.get(fieldOf(byKey.get(picked)!)) : undefined}
          focused={!!f && picked === f.key} onPick={pick} onFocus={toFocus} />
      </InfoOrAgent>}
    </div>
  )
}

/** 개념 찾기: 이름을 고르거나 적고 Enter면 그 개념의 초점 보기 */
function MapSearch({ topics, onGo }: { topics: readonly KnowledgeTopic[]; onGo(key: string): void }) {
  const [q, setQ] = useState('')
  const titles = useMemo(() => [...topics].sort((a, b) => a.title.localeCompare(b.title)), [topics])
  const find = (v: string, exact: boolean) => {
    const s = v.trim().toLowerCase()
    if (!s) return undefined
    return titles.find((t) => t.title.toLowerCase() === s) ?? (exact ? undefined : titles.find((t) => t.title.toLowerCase().includes(s)))
  }
  const goTo = (t: KnowledgeTopic | undefined) => { if (t) { onGo(t.key); setQ('') } }
  return (
    <label className="kg-search" data-ui="개념 찾기">
      <span className="ico">{Icon.search}</span>
      <input type="search" list="kg-names" value={q} placeholder={tl('개념 찾기', 'Find a concept')} aria-label={tl('개념 찾기', 'Find a concept')}
        onChange={(e) => { setQ(e.target.value); const hit = find(e.target.value, true); const typed = e.nativeEvent instanceof InputEvent && e.nativeEvent.inputType === 'insertText'; if (hit && !typed) goTo(hit) }}
        onKeyDown={(e) => { if (e.key === 'Enter') goTo(find(q, false)) }} />
      <datalist id="kg-names">{titles.map((t) => <option key={t.key} value={t.title} />)}</datalist>
    </label>
  )
}

/** 분야 색 창: 분야 목록만, 누른 분야 아래에 색 12개. 흰 점이 있는 색은 다른 분야의 색이고 누르면 맞바꾼다 */
function ColorPanel({ fields, colors, hasChosen, onPick, onReset, onClose }: {
  fields: string[]; colors: ReadonlyMap<string, FieldColor>; hasChosen: boolean; onPick(field: string, c: FieldColor): void; onReset(): void; onClose(): void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const theme = useThemeKey()
  const hexOf = useMemo(() => { void theme; return new Map(FIELD_COLORS.map((c) => [c, fieldHex(c)])) }, [theme])
  useEffect(() => {
    const away = (e: MouseEvent) => { const el = e.target; if (panel.current && el instanceof Element && !panel.current.contains(el) && !el.closest('[data-ui="분야 색"]')) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div className="kg-colors" ref={panel} data-ui="분야 색 창" role="dialog" aria-label={tl('분야 색', 'Field colors')}>
      {fields.map((field) => {
        const cur = colors.get(field)
        const on = open === field
        return (
          <div key={field}>
            <button className={`kg-crow${on ? ' on' : ''}`} aria-expanded={on} onClick={() => setOpen(on ? null : field)}>
              <i style={{ background: cur && hexOf.get(cur) }} /><span className="kg-cname">{field}</span><span className={`ico kg-chev${on ? '' : ' kg-down'}`}>{Icon.fold}</span>
            </button>
            {on && (
              <div className="kg-pal">
                {FIELD_COLORS.map((c) => {
                  const by = [...colors].find(([g, x]) => g !== field && x === c)?.[0]
                  return <button key={c} className={`kg-sw${c === cur ? ' on' : ''}${by ? ' taken' : ''}`} style={{ background: hexOf.get(c) }}
                    aria-label={by ? tl(`${by}와 색 맞바꾸기`, `Swap colors with ${by}`) : c} title={by ? tl(`${by}와 색 맞바꾸기`, `Swap colors with ${by}`) : undefined}
                    aria-pressed={c === cur} onClick={() => onPick(field, c)} />
                })}
                <span className="kg-pal-hint">{tl('흰 점: 다른 분야 색 · 누르면 맞바꿈', 'White dot: another field’s color, click to swap')}</span>
              </div>
            )}
          </div>
        )
      })}
      {hasChosen && <div className="kg-colors-foot"><button className="a" onClick={onReset}>{tl('모두 기본값', 'Reset all')}</button></div>}
    </div>
  )
}

/** 범례 (지도 아래 한 띠): 분야 · 점 색 | 상태 · 점 모양 | 읽는 법. 오른쪽 위 ⌄로 접으면 한 줄 */
function Legend({ fields, hex, states, isolated, folded, onFold }: {
  fields: { field: string; count: number }[]; hex: ReadonlyMap<string, string>; states: ReadonlyMap<NoteState, number>; isolated: number; folded: boolean; onFold(v: boolean): void
}) {
  if (folded) return (
    <button className="kg-legend kg-legend-mini" data-ui="지도 범례" title={tl('범례 펴기', 'Show legend')} onClick={() => onFold(false)}>
      <b>{tl('범례', 'Legend')}</b>
      <span className="kg-mini-dots">{fields.map((x) => <i key={x.field} style={{ background: hex.get(x.field) }} />)}</span>
      <span className="kg-mini-dots">{NOTE_STATES.map((s) => <ShapeMark key={s} state={s} />)}</span>
      <span className="muted">{tl('흐린 점 = 연결 없음', 'Faded dot = unlinked')}</span>
      <span className="ico kg-chev">{Icon.fold}</span>
    </button>
  )
  return (
    <div className="kg-legend" data-ui="지도 범례">
      <button className="kg-fold" aria-label={tl('범례 접기', 'Fold legend')} title={tl('범례 접기', 'Fold legend')} onClick={() => onFold(true)}><span className="ico kg-down">{Icon.fold}</span></button>
      <div className="kg-lgrp kg-lfields">
        <p>{tl('분야 · 점 색', 'Field · dot color')}</p>
        <div className="kg-lcols">{fields.map((x) => <div key={x.field} className="kg-lr"><i className="kg-lsw" style={{ background: hex.get(x.field) }} /><span className="kg-ln">{x.field}</span><span className="kg-lc">{x.count}</span></div>)}</div>
      </div>
      <div className="kg-lgrp">
        <p>{tl('상태 · 점 모양', 'Status · dot shape')}</p>
        {NOTE_STATES.map((s) => <div key={s} className="kg-lr" title={STATE_TIP[s]}><ShapeMark state={s} /><span className="kg-ln">{NOTE_STATE_NAME[s]}</span><span className="kg-lc">{states.get(s) ?? 0}</span></div>)}
      </div>
      <div className="kg-lgrp">
        <p>{tl('읽는 법', 'How to read')}</p>
        <div className="kg-lr"><span className="kg-lsize" aria-hidden="true"><i /><i /></span><span className="kg-ln">{tl('크기 = 연결 수', 'Size = number of links')}</span><span /></div>
        <div className="kg-lr"><i className="kg-lsw kg-faded" /><span className="kg-ln">{tl('흐린 점 = 연결 없음', 'Faded dot = unlinked')}</span><span className="kg-lc">{isolated}</span></div>
        <div className="kg-lr"><span className="kg-lline" aria-hidden="true" /><span className="kg-ln">{tl('선 = 링크 (본문 · related)', 'Line = link (text · related)')}</span><span /></div>
        <p className="kg-lhint">{tl('가리키면 이름 · 누르면 미리 보기 · 두 번 누르면 초점 보기', 'Hover for the name · click to preview · double-click to focus')}</p>
      </div>
    </div>
  )
}

/** 오른쪽 사이드바: 고른 개념의 미리 보기 */
function Preview({ t, nb, byKey, color, focused, onPick, onFocus }: {
  t?: KnowledgeTopic; nb: ReadonlyMap<string, ReadonlySet<string>>; byKey: ReadonlyMap<string, KnowledgeTopic>; color?: string; focused: boolean; onPick(k: string): void; onFocus(k: string): void
}) {
  if (!t) return <div className="rs-pad"><p className="muted kg-pv-empty">{tl('지도에서 점을 누르면 여기에 미리 봅니다.', 'Click a dot on the map to preview it here.')}</p></div>
  const st = noteState(t)
  const near = [...(nb.get(t.key) ?? [])].map((k) => byKey.get(k)).filter((x): x is KnowledgeTopic => !!x).sort((a, b) => a.title.localeCompare(b.title))
  return (
    <div className="rs-pad kg-pv" data-ui="지식 지도 미리 보기 내용">
      <p className="kg-pv-st"><ShapeMark state={st} color={color} /> {NOTE_STATE_NAME[st]} · {sourceWords(t)}</p>
      <h3 className="kg-pv-title">{t.title}</h3>
      <p className="muted kg-pv-sub">{t.subject || NO_FIELD} · {tl(`연결 ${near.length}`, `${near.length} links`)}</p>
      {t.summary && <div className="kg-pv-sum"><ObsidianMarkdown text={t.summary} /></div>}
      <div className="kg-pv-act">
        <button className="btn primary" onClick={() => go({ page: 'library', topic: t.key })}>{tl('열기', 'Open')}</button>
        {!focused && <button className="btn" onClick={() => onFocus(t.key)}>{tl('초점 보기', 'Focus')}</button>}
      </div>
      {near.length > 0 && <>
        <p className="kg-pv-h">{tl(`이웃 ${near.length}`, `Neighbors ${near.length}`)}</p>
        <div className="kg-chips">{near.map((n) => <button key={n.key} className="dep-chip" onClick={() => onPick(n.key)}>{n.title}</button>)}</div>
      </>}
      {t.uses.length > 0 && <>
        <p className="kg-pv-h">{tl('쓰는 프로젝트', 'Used in projects')}</p>
        <div className="kg-chips">{t.uses.map((u, i) => (
          <button key={i} className="dep-chip" onClick={() => go(u.file ? { page: 'part', rid: u.rid, file: u.file } : { page: 'map', rid: u.rid })}>{u.project}{u.noteTitle ? ` · ${u.noteTitle}` : ''}</button>
        ))}</div>
      </>}
    </div>
  )
}
