import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { createNodeImageProgram } from '@sigma/node-image'
import type { FieldColor } from '@rw/core'
import type { KnowledgeTopic } from './api'
import { fieldOf, focusLayout, nodeSize, noteState, STATE_NAME, wholeLayout, type NoteState } from './knowledgeLayout'
import { t as tl } from './i18n'

/**
 * 지식 지도의 그림 (sigma.js가 WebGL로 그린다, 계산은 knowledgeLayout.ts).
 * 전체 지도는 이름 없이 점만: 가리키면 팝업, 누르면 오른쪽 미리 보기, 두 번 누르면 초점 보기.
 * 초점 보기는 가운데와 바로 이웃의 이름을 그린다.
 */

/** 점 모양 (그림의 검은 부분을 점 색으로 칠한다) */
const svg = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`)}`
export const SHAPE_SVG: Record<NoteState, string> = {
  checked: '<circle cx="32" cy="32" r="17" fill="currentColor"/><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="6"/>',
  draft: '<circle cx="32" cy="32" r="28" fill="currentColor"/>',
  wip: '<path d="M32 3 L61 32 L32 61 L3 32 Z" fill="currentColor"/>',
  empty: '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="8"/>',
  study: '<rect x="10" y="10" width="44" height="44" fill="none" stroke="currentColor" stroke-width="8"/>',
}
const SHAPE_URL: Record<NoteState, string> = { checked: svg(SHAPE_SVG.checked), draft: svg(SHAPE_SVG.draft), wip: svg(SHAPE_SVG.wip), empty: svg(SHAPE_SVG.empty), study: svg(SHAPE_SVG.study) }

/** 확대 범위: 맞춘 크기의 약 0.8배–3.7배 (11/28 "확대/축소에 제한") */
const MIN_RATIO = 0.3, MAX_RATIO = 1.4
const BASE = { whole: 1.12, focus: 1.3 }

// ---------- 테마: 색은 tokens.css에서 읽고, 테마가 바뀌면 다시 그린다 ----------

function subscribeTheme(f: () => void) {
  const mo = new MutationObserver(f)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] })
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', f)
  return () => { mo.disconnect(); mq?.removeEventListener?.('change', f) }
}
const themeKey = () => `${document.documentElement.getAttribute('data-theme') ?? ''}/${window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'd' : 'l'}`
export const useThemeKey = () => useSyncExternalStore(subscribeTheme, themeKey)

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
/** 색을 바탕색 쪽으로 섞는다 (연결 없는 점을 흐리게) */
function mix(hex: string, bg: string, a: number): string {
  const p = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  if (!/^#[0-9a-f]{6}/i.test(hex) || !/^#[0-9a-f]{6}/i.test(bg)) return hex
  const [r, g, b] = p(hex), [R, G, B] = p(bg)
  return `rgb(${Math.round(r! * a + R! * (1 - a))},${Math.round(g! * a + G! * (1 - a))},${Math.round(b! * a + B! * (1 - a))})`
}
export const fieldHex = (c: FieldColor) => cssVar(`--field-${c}`) || cssVar('--text-3')

export interface GraphHandle { zoomIn(): void; zoomOut(): void; fit(): void }
export interface ZoomState { pct: number; atMin: boolean; atMax: boolean }

interface Props {
  topics: readonly KnowledgeTopic[]
  nb: ReadonlyMap<string, ReadonlySet<string>>
  colors: ReadonlyMap<string, FieldColor>
  /** 있으면 초점 보기 */
  focus?: { key: string; depth: 1 | 2 }
  picked: string | null
  onPick(key: string | null): void
  onFocus(key: string): void
  onZoom(z: ZoomState): void
}

export const KnowledgeGraph = forwardRef<GraphHandle, Props>(function KnowledgeGraph({ topics, nb, colors, focus, picked, onPick, onFocus, onZoom }, ref) {
  const box = useRef<HTMLDivElement>(null)
  const sigma = useRef<Sigma | null>(null)
  const pickedRef = useRef(picked)
  const hoverRef = useRef<string | null>(null)
  const cb = useRef({ onPick, onFocus, onZoom })
  cb.current = { onPick, onFocus, onZoom }
  const [pop, setPop] = useState<{ key: string; x: number; y: number } | null>(null)
  const [broken, setBroken] = useState<string | null>(null)
  const theme = useThemeKey()
  const byKey = useMemo(() => new Map(topics.map((t) => [t.key, t])), [topics])

  // 자리 (색 · 테마와 따로: 색을 바꿔도 점이 움직이지 않는다)
  const focusKey = focus?.key, depth = focus?.depth
  const layout = useMemo(() => focusKey && depth
    ? (() => { const f = focusLayout(focusKey, depth, nb); return { pos: f.pos, dist: f.dist } })()
    : { pos: wholeLayout(topics, nb), dist: null }, [topics, nb, focusKey, depth])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const bg = cssVar('--bg')
    const C = { edge: cssVar('--line-strong'), hot: cssVar('--text-2'), dim: cssVar('--line'), label: cssVar('--text') }
    const g = new Graph({ type: 'undirected' })
    for (const [k, p] of layout.pos) {
      const t = byKey.get(k)
      if (!t) continue
      const deg = nb.get(k)?.size ?? 0
      const base = fieldHex(colors.get(fieldOf(t)) ?? 'gray')
      const d = layout.dist?.get(k)
      g.addNode(k, {
        x: p.x, y: -p.y, type: 'shape', image: SHAPE_URL[noteState(t)],
        size: d === undefined ? nodeSize(deg) : d === 0 ? 15 : d === 1 ? 9 : 6,
        color: deg === 0 ? mix(base, bg, 0.35) : base,
        label: d !== undefined && d <= 1 ? t.title : '', forceLabel: d !== undefined && d <= 1,
      })
    }
    g.forEachNode((k) => { for (const m of nb.get(k) ?? []) if (k < m && g.hasNode(m)) g.addEdge(k, m, { color: focusKey && (k === focusKey || m === focusKey) ? C.hot : C.edge }) })
    const labels = !!focusKey
    let s: Sigma
    try {
    s = new Sigma(g, el, {
      allowInvalidContainer: true,
      nodeProgramClasses: { shape: createNodeImageProgram({ drawingMode: 'color', keepWithinCircle: false, padding: 0, correctCentering: false }) },
      renderLabels: labels,
      ...(labels ? {} : { defaultDrawNodeHover: () => undefined }),
      labelFont: getComputedStyle(document.body).fontFamily, labelSize: 12, labelColor: { color: C.label },
      labelRenderedSizeThreshold: 100, zIndex: true,
      minCameraRatio: MIN_RATIO, maxCameraRatio: MAX_RATIO, cameraPanBoundaries: true,
      // 휠 · 트랙패드는 아래에서 움직인 양만큼만 (sigma 기본은 신호마다 ×1.7이라 너무 민감했다, 11/28). 1이면 기본 확대가 꺼진다
      zoomingRatio: 1,
      nodeReducer: (n, a) => {
        const on = hoverRef.current ?? (focusKey ? null : pickedRef.current)
        if (!on || n === on || g.areNeighbors(n, on)) return on && (n === on || g.areNeighbors(n, on)) ? { ...a, zIndex: 1 } : a
        return { ...a, color: C.dim, label: '', forceLabel: false }
      },
      edgeReducer: (e, a) => {
        const on = hoverRef.current ?? (focusKey ? null : pickedRef.current)
        return on ? (g.hasExtremity(e, on) ? { ...a, color: C.hot, size: 1.5 } : { ...a, hidden: true }) : a
      },
    })
    } catch (e) {
      // WebGL을 쓸 수 없는 브라우저: 지도 대신 까닭을 보인다 (화면 전체가 깨지지 않게)
      setBroken((e instanceof Error && e.message) || 'WebGL')
      return
    }
    setBroken(null)
    sigma.current = s
    const base = focusKey ? BASE.focus : BASE.whole
    const cam = s.getCamera()
    cam.setState({ ratio: base })
    const zoom = () => { const r = cam.ratio; cb.current.onZoom({ pct: Math.round((base / r) * 100), atMin: r >= MAX_RATIO - 1e-3, atMax: r <= MIN_RATIO + 1e-3 }) }
    cam.on('updated', zoom); zoom()
    s.getMouseCaptor().on('wheel', (e) => {
      const r = cam.getBoundedRatio(cam.ratio * Math.exp(-Math.max(-1, Math.min(1, e.delta)) * 0.22))
      if (r !== cam.ratio) cam.setState(s.getViewportZoomedState({ x: e.x, y: e.y }, r))
    })
    s.on('enterNode', ({ node }) => {
      hoverRef.current = node; s.refresh()
      const a = s.getNodeDisplayData(node)
      if (a) { const p = s.framedGraphToViewport({ x: a.x, y: a.y }); setPop({ key: node, x: p.x, y: p.y }) }
    })
    s.on('leaveNode', () => { hoverRef.current = null; setPop(null); s.refresh() })
    s.on('clickNode', ({ node }) => cb.current.onPick(node))
    s.on('clickStage', () => { if (!focusKey) cb.current.onPick(null) })
    s.on('doubleClickNode', (e) => { e.preventSigmaDefault(); cb.current.onFocus(e.node) })
    s.on('doubleClickStage', (e) => e.preventSigmaDefault())
    return () => { s.kill(); sigma.current = null; hoverRef.current = null; setPop(null) }
  }, [layout, byKey, nb, colors, focusKey, theme])

  useEffect(() => { pickedRef.current = picked; sigma.current?.refresh() }, [picked])

  useImperativeHandle(ref, () => ({
    zoomIn: () => { void sigma.current?.getCamera().animatedZoom({ duration: 200, factor: 1.25 }) },
    zoomOut: () => { void sigma.current?.getCamera().animatedUnzoom({ duration: 200, factor: 1.25 }) },
    fit: () => { void sigma.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: focusKey ? BASE.focus : BASE.whole }, { duration: 200 }) },
  }), [focusKey])

  const hovered = pop ? byKey.get(pop.key) : undefined
  return (
    <div className="kg-canvas" ref={box} data-ui="지식 지도 그림">
      {broken && <p className="muted kg-empty">{tl(`이 브라우저에서 지도를 그리지 못했습니다 (${broken}). 하드웨어 가속(WebGL)이 꺼져 있는지 확인해 주세요.`, `Could not draw the map in this browser (${broken}). Check whether hardware acceleration (WebGL) is turned off.`)}</p>}
      {pop && hovered && (
        <div className="kg-pop" style={{ left: pop.x + 12, top: pop.y - 10 }} role="tooltip">
          <b>{hovered.title}</b>
          <span>{STATE_NAME[noteState(hovered)]} · {fieldOf(hovered)} · {tl(`연결 ${nb.get(pop.key)?.size ?? 0}`, `${nb.get(pop.key)?.size ?? 0} links`)}</span>
        </div>
      )}
    </div>
  )
})
