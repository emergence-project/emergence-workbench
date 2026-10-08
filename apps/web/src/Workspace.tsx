import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { go, href, registerRouteGuard, type Route } from './router'
import { Icon } from './icons'
import { api, type ResearchApi } from './api'
import { AutosaveContext, AutosaveGroup, hasClosingTabs } from './autosave'
import { t } from './i18n'

/**
 * 작업 화면: 두 칸 + 칸마다 탭 + 오른쪽 사이드바 (예전 이름 "맥락 칸", data-ui는 그대로).
 * - 사이드바나 링크로 무엇을 열면(주소가 바뀌면) 지금 칸의 고른 탭 자리에 연다 (브라우저처럼 같은 탭에서 이동, 10/8 버그 "탭이 자꾸 늘어나").
 *   이미 어느 칸에 열려 있으면 그 탭으로 간다. 새 탭은 ⌘/Ctrl+클릭으로 열 때, 고른 탭이 없거나 PDF일 때,
 *   고른 탭에 저장하지 않은 고침이 있을 때만 생긴다. 바꿔 낸 노트의 결과 PDF 탭도 함께 닫는다.
 * - 노트는 Overleaf처럼 늘 왼쪽 칸에, 그 PDF는 오른쪽 칸에 연다 (10/7 버그). 실제 PDF가 있을 때만 PDF를 연다.
 *   오른쪽 칸에 다른 노트가 보이고 있으면 그 노트 탭을 왼쪽 칸으로 옮기고 PDF를 앞에 띄운다.
 *   오른쪽 칸에 옮겨 둔 노트의 탭을 직접 누르면 그 자리에 둔다. 다시 불러온 배치는 노트 왼쪽 · PDF 오른쪽으로 바로잡는다.
 * - 탭은 다른 칸으로 끌어 옮기고, 칸 머리(탭 줄의 빈 곳)를 다른 칸으로 끌어 두 칸을 맞바꾸고(10/5 시안: 맞바꾸기 버튼 대신), 경계선을 끌어 크기를 바꾼다.
 *   두 번째 칸·오른쪽 사이드바는 끌 수 있다. 탭 줄은 탭이 없어도 늘 보인다 (10/5 시안).
 * - 배치는 프로젝트마다 이 브라우저에 기억한다.
 * - 첫 화면은 탭으로 열지 않는다. 지금 칸에 고른 탭이 없을 때(탭을 모두 닫았거나 프로젝트 이름을 눌렀을 때) 그 칸에 보인다.
 * - 맥 창(1200px 안팎)에서 쓰는 칸이 좁아지지 않게: 첫 화면을 보는 동안은 그 칸 하나만 넓게 보이고,
 *   탭이 없는 빈 칸은 기본으로 숨긴다(직접 두 칸을 켜거나 탭을 끄는 동안에는 보인다). 맥락 칸(메모)은 처음에 접혀 있다.
 */
export type Tab =
  | { k: 'overview' } | { k: 'log' } | { k: 'map' } | { k: 'todo' } | { k: 'info' } | { k: 'notes' } | { k: 'concepts' } | { k: 'papers' }
  | { k: 'block'; bid: string } | { k: 'pdf'; bid: string } | { k: 'doc'; name: string } | { k: 'statement'; sid: string }
  | { k: 'part'; file: string } | { k: 'mspdf'; ms?: string } | { k: 'concept'; id: string } | { k: 'paper'; id: string } | { k: 'topic'; tid: string } | { k: 'task'; task: string }

export const tabKey = (t: Tab) => ('task' in t ? `task:${t.task}` : 'tid' in t ? `topic:${t.tid}` : 'bid' in t ? `${t.k}:${t.bid}` : 'name' in t ? `doc:${t.name}` : 'sid' in t ? `statement:${t.sid}` : 'file' in t ? `part:${t.file}` : 'id' in t ? `${t.k}:${t.id}` : t.k === 'mspdf' && t.ms ? `mspdf:${t.ms}` : t.k)

/**
 * 갈래 화면(첫 화면 · 프로젝트 정보 · 할 일 · 지도 · 기록)은 탭이 아니다: 사이드바에서 고르면 칸에 고른 탭이 없을 때처럼
 * 그 칸에 보이고, 탭 줄에는 열어 둔 문서(장, 보조 노트, PDF …)만 남는다 (2026-10-03 피드백)
 */
export type SectionPage = 'overview' | 'info' | 'todo' | 'log' | 'map' | 'notes' | 'concepts' | 'papers'
const SECTIONS: readonly string[] = ['overview', 'info', 'todo', 'log', 'map', 'notes', 'concepts', 'papers'] satisfies SectionPage[]
export const isSection = (page: string): page is SectionPage => SECTIONS.includes(page)

export function tabOfRoute(r: Route): Tab | null {
  if (isSection(r.page)) return null
  switch (r.page) {
    case 'statement': return { k: 'statement', sid: r.sid }
    case 'block': return { k: 'block', bid: r.bid }
    case 'doc': return { k: 'doc', name: r.name }
    case 'part': return { k: 'part', file: r.file }
    case 'topic': return { k: 'topic', tid: r.tid }
    case 'concept': return { k: 'concept', id: r.id }
    case 'paper': return { k: 'paper', id: r.id }
    case 'task': return { k: 'task', task: r.task }
    default: return null
  }
}

/** 탭을 누르면 갈 주소. 결과 PDF 탭은 주소가 없다 (블록 주소를 바꾸지 않는다) */
function routeOfTab(rid: string, t: Tab): Route | null {
  switch (t.k) {
    case 'overview': return { page: 'overview', rid }
    case 'log': return { page: 'log', rid }
    case 'map': return { page: 'map', rid }
    case 'todo': return { page: 'todo', rid }
    case 'info': return { page: 'info', rid }
    case 'notes': return { page: 'notes', rid }
    case 'concepts': return { page: 'concepts', rid }
    case 'papers': return { page: 'papers', rid }
    case 'statement': return { page: 'statement', rid, sid: t.sid }
    case 'block': return { page: 'block', rid, bid: t.bid }
    case 'pdf': return null
    case 'doc': return { page: 'doc', rid, name: t.name }
    case 'part': return { page: 'part', rid, file: t.file }
    case 'topic': return { page: 'topic', rid, tid: t.tid }
    case 'mspdf': return null
    case 'concept': return { page: 'concept', rid, id: t.id }
    case 'paper': return { page: 'paper', rid, id: t.id }
    case 'task': return { page: 'task', rid, task: t.task }
  }
}

/** Use the latest layout: selection and pane ownership may change while saving. */
export function closeWorkspaceTab(layout: Layout, key: string, rid: string, groups?: Map<string, AutosaveGroup>): { layout: Layout; route: Route | null } {
  const i = paneOf(layout, key)
  if (i === -1) return { layout, route: null }
  groups?.delete(key)
  const p = layout.panes[i]
  const idx = p.tabs.findIndex((t) => tabKey(t) === key)
  const tabs = p.tabs.filter((t) => tabKey(t) !== key)
  const nextActive = p.active === key ? tabs[Math.min(idx, tabs.length - 1)] ?? null : tabs.find((t) => tabKey(t) === p.active) ?? null
  const other = (1 - i) as 0 | 1
  const o = layout.panes[other]
  const otherActive = layout.split ? o.tabs.find((t) => tabKey(t) === o.active) : undefined
  const focused = p.active === key && layout.focus === i
  const moveFocus = focused && !nextActive && !!otherActive
  const next = { ...withPane(layout, i, { tabs, active: nextActive ? tabKey(nextActive) : null }), focus: moveFocus ? other : layout.focus }
  const route = focused ? (nextActive && routeOfTab(rid, nextActive)) || (otherActive && routeOfTab(rid, otherActive)) || (!nextActive && !otherActive ? { page: 'overview', rid } as Route : null) : null
  return { layout: next, route }
}

interface PaneState { tabs: Tab[]; active: string | null }
export interface Layout {
  panes: [PaneState, PaneState]
  focus: 0 | 1
  split: boolean
  /** Explicitly opening two panes keeps the empty pane visible, including on section pages. */
  showBothPanes?: boolean
  ctx: boolean
  /** 왼쪽 칸이 두 칸 중 차지하는 비율 */
  frac: number
  ctxWidth: number
  /** 저장 형식 판. 2부터 맥락 칸이 처음에 접혀 있다 */
  v?: number
}

export interface TabRenderContext {
  active: boolean; visibleTabs: Tab[]
  /** 지금 칸(초점)에서 보이는 탭: 왼쪽 사이드바 절 목차와 오른쪽 사이드바가 이 노트를 따른다 */
  focused: boolean
}

// Keep button ownership and polling consistent with the panes actually rendered below.
export function workspaceVisibility(layout: Layout, page: string, dragging = false): { shown: (0 | 1)[]; visibleTabs: Tab[] } {
  const focused = layout.split ? layout.focus : 0
  const atHome = isSection(page)
  const shown: (0 | 1)[] = layout.split && layout.showBothPanes ? [0, 1]
    : atHome && !dragging ? [focused]
    : !layout.split ? [0]
    : dragging ? [0, 1]
    : (() => { const panes = ([0, 1] as const).filter((i) => layout.panes[i].tabs.length > 0); return panes.length ? [...panes] : [0] })()
  const visibleTabs = shown.flatMap((i) => atHome && i === focused ? [] : layout.panes[i].tabs.filter((t) => tabKey(t) === layout.panes[i].active))
  return { shown, visibleTabs }
}

export const hasVisibleManuscriptEditor = (tabs: Tab[], ms: string, msOfFile: (file: string) => string | undefined): boolean =>
  tabs.some((t) => t.k === 'part' && msOfFile(t.file) === ms)

const DEFAULT: Layout = { panes: [{ tabs: [], active: null }, { tabs: [], active: null }], focus: 0, split: true, ctx: false, frac: 0.5, ctxWidth: 300, v: 2 }
const storeKey = (rid: string) => `rw-ws-${rid}`

const isNoteTab = (t: Tab) => t.k === 'part' || t.k === 'block'
const isPdfTab = (t: Tab) => t.k === 'pdf' || t.k === 'mspdf'

/** 탭 목록과 칸 배치는 복원하되, 이전 노트·결과의 선택은 주소로 다시 정한다. 노트 탭은 왼쪽 칸, PDF 탭은 오른쪽 칸으로 바로잡는다. */
export function restoreLayout(v: Layout): Layout {
  const kept = v.panes.map((p) => p.tabs.filter((t) => !isSection(t.k)))
  const tabs: [Tab[], Tab[]] = [
    [...kept[0]!.filter((t) => !isPdfTab(t)), ...kept[1]!.filter(isNoteTab)],
    [...kept[1]!.filter((t) => !isNoteTab(t)), ...kept[0]!.filter(isPdfTab)],
  ]
  const panes = tabs.map((ts, i) => ({
    tabs: ts,
    active: ts.some((t) => tabKey(t) === v.panes[i]!.active && !isNoteTab(t) && !isPdfTab(t)) ? v.panes[i]!.active : null,
  })) as Layout['panes']
  return (v.v ?? 1) < 2 ? { ...DEFAULT, ...v, panes, focus: 0, ctx: false, v: 2 } : { ...DEFAULT, ...v, panes, focus: 0 }
}

function load(rid: string): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(rid)) ?? 'null') as Layout | null
    // 판 2 전에 저장한 배치는 맥락 칸을 한 번 접는다 (전에는 늘 켜져 있어 쓰는 칸이 좁았다)
    if (v && Array.isArray(v.panes) && v.panes.length === 2) {
      // 전에 저장한 갈래 탭(첫 화면 · 할 일 · 지도 · 기록 …)은 뺀다 (갈래는 이제 탭이 아니다)
      return restoreLayout(v)
    }
  } catch { /* 무시 */ }
  return DEFAULT
}

/** 프로젝트마다 배치를 기억하는 상태. App이 들고 제목줄 단추(칸 켜고 끄기)와 작업 화면이 함께 쓴다 */
/** Toggle the drawn panes; merging keeps every tab and the focused selection. */
export function toggleSplit(l: Layout, page: string): Layout {
  if (hasClosingTabs()) return l
  if (workspaceVisibility(l, page).shown.length !== 2) return { ...l, split: true, showBothPanes: true }
  const [a, b] = l.panes
  const tabs = [...a.tabs, ...b.tabs.filter((t) => !a.tabs.some((x) => tabKey(x) === tabKey(t)))]
  const active = l.focus === 1 && b.active ? b.active : a.active ?? b.active
  return { ...l, split: false, showBothPanes: false, focus: 0, panes: [{ tabs, active }, { tabs: [], active: null }] }
}

/** 원고(메인 노트)의 PDF 탭. research.yaml에 적은 첫 원고(key '')는 ms 없이 */
export const manuscriptPdfTab = (ms: string): Tab => (ms ? { k: 'mspdf', ms } : { k: 'mspdf' })

/** 주소를 먼저 연 뒤 결과 PDF에 초점을 준다. 갈래 화면이 PDF를 가리지 않게 같은 주소가 된 뒤에만 적용한다. */
export interface WorkspaceOpenRequest { route: Route; tab: Tab }
export function applyWorkspaceOpenRequest(l: Layout, route: Route, request: WorkspaceOpenRequest): Layout {
  if (hasClosingTabs()) return l
  if (href(route) !== href(request.route) || isSection(route.page)) return l
  const at = paneOf(l, tabKey(request.tab))
  const here = at === -1 ? (l.split ? l.focus : 0) : at
  return { ...withPane(l, here, addTab(l.panes[here], request.tab)), focus: here, split: l.split || here === 1 }
}

/**
 * 노트를 컴파일하면 그 PDF를 노트 옆 칸에 보인다 (10/5 09:52 "compile을 누른 뒤 PDF를 보는 버튼이 어디에 있어?").
 * from 탭(노트)이 고른 칸의 다른 칸에 PDF 탭을 열거나 고르고, 두 칸이 꺼져 있으면 켠다. 노트 칸에 PDF 탭이 있었으면 옆 칸으로 옮긴다.
 * 이미 옆 칸에 보이면 그대로 둔다.
 */
export function showBeside(l: Layout, t: Tab, from: string): Layout {
  if (hasClosingTabs()) return l
  const key = tabKey(t)
  if (l.split && l.panes[0].active === from && l.panes[1].active === key) return l
  // 노트는 왼쪽 칸, PDF는 오른쪽 칸 (Overleaf처럼)
  let next = l
  const at = paneOf(next, from)
  const note = at === -1 ? undefined : next.panes[at].tabs.find((x) => tabKey(x) === from)
  if (note && at === 1) next = withPane(next, 1, removeTab(next.panes[1], from))
  if (note) next = withPane(next, 0, addTab(next.panes[0], note))
  if (paneOf(next, key) === 0) next = withPane(next, 0, removeTab(next.panes[0], key))
  return { ...withPane(next, 1, addTab(next.panes[1], t)), split: true, focus: 0 }
}

export function useLayout(rid: string | null) {
  const [state, setLayoutState] = useState(() => ({ rid, layout: rid ? load(rid) : DEFAULT }))
  // 자식의 주소 열기 effect 뒤에 배치를 다시 읽어 선택을 덮어쓰지 않는다.
  if (state.rid !== rid) setLayoutState({ rid, layout: rid ? load(rid) : DEFAULT })
  const setLayout = useCallback((f: (l: Layout) => Layout) => {
    setLayoutState((prev) => {
      if (prev.rid !== rid) return prev
      const next = f(prev.layout)
      if (next === prev.layout) return prev
      if (rid) try { localStorage.setItem(storeKey(rid), JSON.stringify(next)) } catch { /* 무시 */ }
      return { rid, layout: next }
    })
  }, [rid])
  return [state.layout, setLayout] as const
}

const paneOf = (l: Layout, key: string) => l.panes.findIndex((p) => p.tabs.some((t) => tabKey(t) === key)) as -1 | 0 | 1
const withPane = (l: Layout, i: number, p: PaneState): Layout => {
  const panes = [...l.panes] as Layout['panes']
  panes[i] = p
  return { ...l, panes }
}
const addTab = (p: PaneState, t: Tab): PaneState =>
  p.tabs.some((x) => tabKey(x) === tabKey(t)) ? { ...p, active: tabKey(t) } : { tabs: [...p.tabs, t], active: tabKey(t) }
const removeTab = (p: PaneState, key: string): PaneState =>
  ({ tabs: p.tabs.filter((x) => tabKey(x) !== key), active: p.active === key ? null : p.active })

/** 탭을 여는 방법: newTab은 ⌘/Ctrl+클릭, keep은 바꾸면 안 되는 탭(저장하지 않은 고침이 있는 탭) */
export interface OpenHow { newTab?: boolean; keep?(key: string): boolean }

/**
 * 칸의 고른 탭 자리에 t를 둔다 (같은 탭에서 이동). 이미 있으면 고르기만 한다.
 * 고른 탭이 없거나 PDF이거나 바꾸면 안 되는 탭이거나 newTab이면 끝에 새 탭으로 더한다.
 */
function placeTab(p: PaneState, t: Tab, how: OpenHow): { pane: PaneState; replaced: Tab | null } {
  const key = tabKey(t)
  if (p.tabs.some((x) => tabKey(x) === key)) return { pane: { ...p, active: key }, replaced: null }
  const at = p.tabs.findIndex((x) => tabKey(x) === p.active)
  const cur = p.tabs[at]
  if (how.newTab || !cur || isPdfTab(cur) || how.keep?.(tabKey(cur))) return { pane: { tabs: [...p.tabs, t], active: key }, replaced: null }
  const tabs = [...p.tabs]
  tabs[at] = t
  return { pane: { tabs, active: key }, replaced: cur }
}

/** 바꿔 낸 노트의 PDF 탭을 닫는다 (연구노트는 노트마다 PDF가 있다. 원고 PDF는 같은 원고의 다른 장이 함께 쓰므로 둔다) */
function dropResultPdf(l: Layout, replaced: Tab | null): Layout {
  const key = replaced?.k === 'block' ? tabKey({ k: 'pdf', bid: replaced.bid }) : replaced?.k === 'part' ? tabKey(manuscriptPdfTab(replaced.file)) : null
  if (!key) return l
  const at = paneOf(l, key)
  return at === -1 ? l : withPane(l, at, removeTab(l.panes[at], key))
}

/** 주소가 가리키는 것을 연다 */
export function openRoute(l: Layout, t: Tab, pdf: Tab | null = null, how: OpenHow = {}): Layout {
  if (hasClosingTabs()) return l
  const key = tabKey(t)
  const at = paneOf(l, key)
  if (isNoteTab(t) && l.split) {
    // 오른쪽 칸에 옮겨 둔 노트의 탭을 직접 누른 것은 그대로 둔다 (칸 바꾸기·끌어 옮기기를 존중)
    if (at === 1 && l.panes[1].active === key) return l.focus === 1 ? l : { ...l, focus: 1 }
    // 노트는 늘 왼쪽 칸에 연다 (Overleaf처럼 노트 왼쪽 · PDF 오른쪽, 10/7 버그)
    let next = at === 1 ? withPane(l, 1, removeTab(l.panes[1], key)) : l
    const placed = placeTab(next.panes[0], t, how)
    next = dropResultPdf({ ...withPane(next, 0, placed.pane), focus: 0 }, placed.replaced)
    // 왼쪽 칸에 남은 PDF 탭은 오른쪽 칸으로 옮긴다 (선택은 바꾸지 않는다)
    const pdfs = next.panes[0].tabs.filter(isPdfTab)
    if (pdfs.length) {
      next = withPane(next, 0, { ...next.panes[0], tabs: next.panes[0].tabs.filter((x) => !isPdfTab(x)) })
      next = withPane(next, 1, { ...next.panes[1], tabs: [...next.panes[1].tabs, ...pdfs.filter((x) => !next.panes[1].tabs.some((y) => tabKey(y) === tabKey(x)))] })
    }
    // 옆 칸의 PDF는 이 노트의 것으로 맞춘다: 존재 확인 전·PDF 없음일 때 이전 결과의 선택만 풀고 탭은 남긴다
    const o = next.panes[1]
    const shown = o.tabs.find((x) => tabKey(x) === o.active)
    if (!shown || isPdfTab(shown)) next = withPane(next, 1, { ...o, active: null })
    return pdf ? pairRoutePdf(next, t, pdf) : next
  }
  // 노트를 쓰는 칸에서 논문·자료·진술을 열면 다른 칸에 연다 (쓰던 화면을 가리지 않게)
  const writing = l.panes[l.focus].active?.startsWith('block:') || l.panes[l.focus].active?.startsWith('part:')
  const here = at !== -1 ? at as 0 | 1 : !l.split ? 0 : (t.k === 'doc' || t.k === 'statement' || t.k === 'concept' || t.k === 'paper') && writing ? (1 - l.focus) as 0 | 1 : l.focus
  const placed = placeTab(l.panes[here], t, how)
  return dropResultPdf({ ...withPane(l, here, placed.pane), focus: here }, placed.replaced)
}

/**
 * 왼쪽 칸 노트의 PDF를 오른쪽 칸 앞에 띄운다. 오른쪽 칸에 다른 노트가 보이고 있으면 그 탭은 왼쪽 칸으로 옮긴다.
 * 늦은 응답이 다른 탭을 고른 뒤 화면이나 초점을 되돌리지 않고, 오른쪽 칸의 논문·자료는 가리지 않는다.
 */
export function pairRoutePdf(l: Layout, t: Tab, pdf: Tab): Layout {
  if (hasClosingTabs()) return l
  if (!l.split || l.focus !== 0 || l.panes[0].active !== tabKey(t)) return l
  const o = l.panes[1]
  const shown = o.tabs.find((x) => tabKey(x) === o.active)
  if (shown && !isPdfTab(shown) && !isNoteTab(shown)) return l
  let next = l
  if (shown && isNoteTab(shown)) {
    next = withPane(next, 1, removeTab(o, tabKey(shown)))
    next = withPane(next, 0, { ...next.panes[0], tabs: [...next.panes[0].tabs, shown] })
  }
  if (paneOf(next, tabKey(pdf)) === 0) next = withPane(next, 0, removeTab(next.panes[0], tabKey(pdf)))
  return withPane(next, 1, addTab(next.panes[1], pdf))
}

/** 처음 불러오는 중인 원고 목록을 첫 원고('')로 오인하지 않고 실제 결과만 돌려준다. */
export async function routePdf(t: Tab, rapi: Pick<ResearchApi, 'pdfState' | 'manuscripts'>): Promise<Tab | null> {
  if (t.k === 'block') return (await rapi.pdfState(t.bid)).hasPdf ? { k: 'pdf', bid: t.bid } : null
  if (t.k === 'part') {
    const ms = (await rapi.manuscripts()).find((m) => m.main === t.file || m.parts.some((p) => p.file === t.file))
    return ms?.hasPdf ? manuscriptPdfTab(ms.key) : null
  }
  return null
}

// Share transient drop targets with the top bar's actual pane count.
export function useWorkspaceDragging() {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const start = (e: DragEvent) => { if (e.dataTransfer?.types.includes('text/x-rw-tab') || e.dataTransfer?.types.includes('text/x-rw-pane')) setDragging(true) }
    const end = () => setDragging(false)
    document.addEventListener('dragstart', start)
    document.addEventListener('dragend', end)
    document.addEventListener('drop', end)
    return () => { document.removeEventListener('dragstart', start); document.removeEventListener('dragend', end); document.removeEventListener('drop', end) }
  }, [])
  return dragging
}

/** 마지막 클릭이 ⌘/Ctrl+클릭이었는지. 주소 열기가 한 번 읽고 지운다 (뒤로 가기 등은 같은 탭에서) */
let newTabIntent = false
const takeNewTabIntent = () => { const v = newTabIntent; newTabIntent = false; return v }

export function Workspace({ rid, route, layout, setLayout, dragging, titleOf, uiTitleOf = titleOf, kindOf, renderTab, home, context, openRequest, onOpened, onCloseFailed }: {
  rid: string
  route: Route
  layout: Layout
  setLayout(f: (l: Layout) => Layout): void
  dragging: boolean
  /** 탭 이름 */
  titleOf(t: Tab): string
  /** Korean tab name for feedback part names (data-ui-item) */
  uiTitleOf?(t: Tab): string
  kindOf(t: Tab): string | null
  renderTab(t: Tab, context: TabRenderContext): ReactNode
  /** 첫 화면: 지금 칸에 고른 탭이 없을 때 보인다 */
  home: ReactNode
  /** 맥락 칸 내용 (지금 칸의 대상에 맞춰 App이 그린다) */
  context: ReactNode
  openRequest?: WorkspaceOpenRequest | null
  onOpened?(): void
  onCloseFailed(message: string): void
}) {
  const groups = useMemo(() => new Map<string, AutosaveGroup>(), [rid])
  const closingTabs = useRef(new Set<string>())
  const current = useRef({ rid, layout })
  current.current = { rid, layout }
  const session = useMemo(() => ({ alive: true }), [rid])
  useEffect(() => { session.alive = true; return () => { session.alive = false } }, [session])
  useEffect(() => registerRouteGuard(() => {
    if (!hasClosingTabs()) return true
    onCloseFailed(t('탭 저장이 끝난 뒤 화면을 바꿔 주세요.', 'Wait for the tab to finish saving before changing screens.'))
    return false
  }), [onCloseFailed])

  // ⌘/Ctrl+클릭으로 연 것만 새 탭으로 (그냥 누르면 지금 탭에서 이동)
  useEffect(() => {
    const note = (e: MouseEvent) => { newTabIntent = e.metaKey || e.ctrlKey }
    document.addEventListener('click', note, true)
    return () => document.removeEventListener('click', note, true)
  }, [])

  // 주소가 바뀌면 그 대상을 탭으로 연다
  const routeHref = href(route)
  useEffect(() => {
    let cancelled = false
    const t = tabOfRoute(route)
    if (t) {
      const how: OpenHow = { newTab: takeNewTabIntent(), keep: (key) => groups.get(key)?.pending ?? false }
      setLayout((l) => openRoute(l, t, null, how))
      void routePdf(t, api.research(rid)).then((pdf) => {
        if (!cancelled && pdf) setLayout((l) => pairRoutePdf(l, t, pdf))
      }).catch(() => undefined)
    }
    // 갈래 화면으로 가면 지금 칸의 탭 선택을 풀어 그 칸에 갈래 화면을 보인다 (탭은 그대로 남는다)
    else if (isSection(route.page)) setLayout((l) => { const f = l.split ? l.focus : 0; return withPane(l, f, { ...l.panes[f], active: null }) })
    return () => { cancelled = true }
  }, [routeHref, rid]) // eslint-disable-line react-hooks/exhaustive-deps

  // 일반 주소 열기 효과 뒤에 실행해야 원문 탭이 PDF의 초점을 다시 가져가지 않는다.
  useEffect(() => {
    if (!openRequest || href(openRequest.route) !== routeHref || isSection(route.page)) return
    setLayout((l) => applyWorkspaceOpenRequest(l, route, openRequest))
    onOpened?.()
  }, [openRequest, routeHref, rid]) // eslint-disable-line react-hooks/exhaustive-deps

  const activate = (i: 0 | 1, t: Tab) => {
    if (hasClosingTabs()) return
    setLayout((l) => ({ ...withPane(l, i, { ...l.panes[i], active: tabKey(t) }), focus: i }))
    const r = routeOfTab(rid, t)
    if (r) go(r)
  }

  const close = async (tab: Tab) => {
    const key = tabKey(tab)
    const attempt = `${rid}/${key}`
    if (closingTabs.current.has(attempt)) return
    if (closingTabs.current.size) {
      onCloseFailed(t('닫는 중인 탭의 저장이 끝난 뒤 다른 탭을 닫아 주세요.', 'Wait for the closing tab to finish saving before closing another tab.'))
      return
    }
    closingTabs.current.add(attempt)
    try {
      const ok = await groups.get(key)?.prepareClose() ?? true
      if (!session.alive || current.current.rid !== rid) return
      if (!ok) {
        onCloseFailed(t(`${titleOf(tab)}: 저장하지 않은 내용이 있어 탭을 닫지 않았습니다. 탭에서 저장 상태와 고친 내용을 확인해 주세요.`, `${titleOf(tab)}: the tab was not closed because it has unsaved changes. Check its save status and your edits.`))
        return
      }
      const next = closeWorkspaceTab(current.current.layout, key, rid, groups)
      setLayout((l) => closeWorkspaceTab(l, key, rid).layout)
      if (next.route) go(next.route)
    } finally { closingTabs.current.delete(attempt) }
  }

  /** 탭을 다른 칸으로 옮긴다 (끌어다 놓기) */
  const move = (key: string, to: 0 | 1) => setLayout((l) => {
    if (hasClosingTabs()) return l
    const from = paneOf(l, key)
    if (from === -1 || from === to) return l
    const t = l.panes[from].tabs.find((x) => tabKey(x) === key)!
    const src = l.panes[from]
    const rest = src.tabs.filter((x) => tabKey(x) !== key)
    let next = withPane(l, from, { tabs: rest, active: src.active === key ? (rest[0] ? tabKey(rest[0]) : null) : src.active })
    next = withPane(next, to, addTab(next.panes[to], t))
    return { ...next, focus: to, split: true }
  })

  /** 두 칸 맞바꾸기 (칸 머리를 다른 칸으로 끌어 놓기) */
  const swapPanes = () => setLayout((l) => hasClosingTabs() ? l : ({ ...l, panes: [l.panes[1], l.panes[0]], focus: (1 - l.focus) as 0 | 1 }))

  const focusPane = (i: 0 | 1) => {
    if (hasClosingTabs()) return
    if (layout.focus === i) return
    setLayout((l) => ({ ...l, focus: i }))
    const p = layout.panes[i]
    const t = p.tabs.find((x) => tabKey(x) === p.active)
    const r = t ? routeOfTab(rid, t) : { page: 'overview', rid } as Route
    if (r) go(r)
  }

  // 경계선 끌기
  const box = useRef<HTMLDivElement>(null)
  const drag = (what: 'split' | 'ctx') => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = box.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const startX = e.clientX
    const startCtx = layout.ctxWidth
    const onMove = (ev: PointerEvent) => {
      if (what === 'ctx') {
        const w = Math.min(560, Math.max(220, startCtx - (ev.clientX - startX)))
        setLayout((l) => ({ ...l, ctxWidth: w }))
      } else {
        const work = rect.width - (layout.ctx ? layout.ctxWidth : 0)
        const frac = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / work))
        setLayout((l) => ({ ...l, frac }))
      }
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); document.body.classList.remove('resizing') }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const focused = layout.split ? layout.focus : 0
  const atHome = isSection(route.page)
  const { shown, visibleTabs } = workspaceVisibility(layout, route.page, dragging)
  const two = shown.length === 2
  const cols = [
    two ? `minmax(0, ${layout.frac}fr) 5px minmax(0, ${1 - layout.frac}fr)` : 'minmax(0, 1fr)',
    layout.ctx ? `5px ${layout.ctxWidth}px` : '',
  ].join(' ')

  return (
    <main className="ws" ref={box} style={{ gridTemplateColumns: cols }} data-ui="작업 화면">
      {([0, 1] as const).map((i) => (
        <Pane key={i} i={i} visible={shown.includes(i)} pane={layout.panes[i]} focused={two && layout.focus === i} isFocus={shown.includes(i) && i === focused} titleOf={titleOf} uiTitleOf={uiTitleOf} kindOf={kindOf} renderTab={renderTab} visibleTabs={visibleTabs} groups={groups}
          home={atHome && i === focused ? home : null} canSwap={layout.split}
          onFocus={() => focusPane(i)} onActivate={(t) => activate(i, t)} onClose={(t) => void close(t)} onDropTab={(key) => move(key, i)} onSwap={swapPanes}
          divider={two && i === 1 ? <div className="ws-divider" onPointerDown={drag('split')} role="separator" aria-label={t('두 패널 경계 — 끌어서 크기 조절', 'Border between panes: drag to resize')} /> : null} />
      ))}
      {layout.ctx && <>
        <div className="ws-divider" onPointerDown={drag('ctx')} role="separator" aria-label={t('오른쪽 사이드바 경계 — 끌어서 크기 조절', 'Right sidebar border: drag to resize')} />
        <aside className="ws-ctx" data-ui="맥락 칸">{context}</aside>
      </>}
    </main>
  )
}

const ICON: Record<Tab['k'], ReactNode> = { overview: Icon.home, info: Icon.info, notes: Icon.block, concepts: Icon.concept, papers: Icon.paper, todo: Icon.task, log: Icon.log, map: Icon.tree, block: Icon.block, statement: Icon.statement, pdf: Icon.pdf, doc: Icon.pdf, part: Icon.block, mspdf: Icon.pdf, concept: Icon.concept, paper: Icon.paper, topic: Icon.card, task: Icon.task }

function Pane({ i, visible, pane, focused, isFocus, titleOf, uiTitleOf, kindOf, renderTab, visibleTabs, groups, home, canSwap, onFocus, onActivate, onClose, onDropTab, onSwap, divider }: {
  i: 0 | 1; visible: boolean; pane: PaneState; focused: boolean; isFocus: boolean; titleOf(t: Tab): string; uiTitleOf(t: Tab): string; kindOf(t: Tab): string | null; renderTab(t: Tab, context: TabRenderContext): ReactNode; visibleTabs: Tab[]; home: ReactNode
  groups: Map<string, AutosaveGroup>
  canSwap: boolean
  onFocus(): void; onActivate(t: Tab): void; onClose(t: Tab): void; onDropTab(key: string): void; onSwap(): void; divider: ReactNode
}) {
  const [over, setOver] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const tabSignature = JSON.stringify(pane.tabs.map((t) => [tabKey(t), titleOf(t), kindOf(t)]))
  useLayoutEffect(() => {
    const tabs = tabsRef.current
    if (!tabs) return
    const measure = () => {
      const left = tabs.scrollLeft > 1
      const right = tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft > 1
      setOverflow((prev) => prev.left === left && prev.right === right ? prev : { left, right })
    }
    const reveal = () => {
      tabs.querySelector('.ws-tab.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      measure()
    }
    reveal()
    tabs.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(reveal)
    observer.observe(tabs)
    for (const tab of tabs.children) observer.observe(tab)
    return () => { tabs.removeEventListener('scroll', measure); observer.disconnect() }
  }, [pane, tabSignature])
  return (
    <>
      {divider}
      <section className={`ws-pane${focused ? ' focused' : ''}`} data-ui={i === 0 ? '왼쪽 칸' : '오른쪽 칸'} style={{ display: visible ? undefined : 'none' }} onMouseDownCapture={onFocus}>
        <div className={`ws-tabs-wrap${overflow.left ? ' overflow-left' : ''}${overflow.right ? ' overflow-right' : ''}`}>
        <div ref={tabsRef} className={`ws-tabs${over ? ' drop' : ''}`} role="tablist" data-ui="탭" draggable={canSwap}
          title={canSwap ? t('탭 바 — 옆 패널로 끌어 두 패널을 맞바꿉니다', 'Tab bar: drag to the other pane to swap the two panes') : undefined}
          onDragStart={(e) => { if (e.target !== e.currentTarget) return; e.dataTransfer.setData('text/x-rw-pane', String(i)); e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-rw-tab') || e.dataTransfer.types.includes('text/x-rw-pane')) { e.preventDefault(); setOver(true) } }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            setOver(false)
            const from = e.dataTransfer.getData('text/x-rw-pane')
            if (from !== '') { if (Number(from) !== i) onSwap(); return }
            const k = e.dataTransfer.getData('text/x-rw-tab'); if (k) onDropTab(k)
          }}>
          {pane.tabs.map((tab) => {
            const key = tabKey(tab)
            const on = pane.active === key
            return (
              <div key={key} role="tab" aria-selected={on} className={`ws-tab${on ? ' on' : ''}`} data-ui="탭 하나" data-ui-item={uiTitleOf(tab)} title={titleOf(tab)} draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/x-rw-tab', key); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => onActivate(tab)} onAuxClick={(e) => { if (e.button === 1) onClose(tab) }}>
                <i aria-hidden>{ICON[tab.k]}</i>{kindOf(tab) && <span className="nk-tag">{kindOf(tab)}</span>}<span>{tab.k === 'mspdf' ? titleOf(tab).replace(/^(원고 PDF|Manuscript PDF) · /, 'PDF · ') : titleOf(tab)}</span>
                <button className="x" aria-label={t(`탭 닫기: ${titleOf(tab)}`, `Close tab: ${titleOf(tab)}`)} onClick={(e) => { e.stopPropagation(); onClose(tab) }}>×</button>
              </div>
            )
          })}
        </div>
        </div>
        <div className="ws-body">
          {home && <div className="ws-slot">{home}</div>}
          {!home && !pane.tabs.some((t) => tabKey(t) === pane.active) && <div className="ws-empty">{t('왼쪽 사이드바에서 노트·자료를 고르면 여기에 열립니다. 옆 패널의 탭을 끌어 놓을 수도 있습니다.', 'Pick a note or material in the left sidebar to open it here. You can also drag a tab from the other pane.')}</div>}
          {/* 열린 탭은 모두 그려 두고 지금 탭만 보인다 — 편집기의 고치던 내용·PDF 스크롤이 탭을 바꿔도 남는다 */}
          {pane.tabs.map((t) => {
            const key = tabKey(t)
            if (!groups.has(key)) groups.set(key, new AutosaveGroup())
            return <AutosaveContext.Provider key={key} value={groups.get(key)!}>
              <div className="ws-slot" style={{ display: !home && pane.active === key ? 'flex' : 'none' }}>{renderTab(t, { active: visible && !home && pane.active === key, visibleTabs, focused: isFocus && !home && pane.active === key })}</div>
            </AutosaveContext.Provider>
          })}
        </div>
      </section>
    </>
  )
}
