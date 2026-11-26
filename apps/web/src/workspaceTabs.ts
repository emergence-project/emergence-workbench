import type { Route } from './router'
import type { AutosaveGroup } from './autosave'
import { t } from './i18n'

export type Tab =
  | { k: 'overview' } | { k: 'log' } | { k: 'map' } | { k: 'todo' } | { k: 'records' } | { k: 'info' } | { k: 'agents' } | { k: 'status' } | { k: 'changes' } | { k: 'repo' } | { k: 'files' } | { k: 'notes' } | { k: 'concepts' } | { k: 'papers' } | { k: 'edits' } | { k: 'problems' }
  | { k: 'doc'; name: string } | { k: 'file'; path: string } | { k: 'statement'; sid: string }
  | { k: 'part'; file: string } | { k: 'mspdf'; ms?: string } | { k: 'concept'; id: string } | { k: 'paper'; id: string } | { k: 'topic'; tid: string } | { k: 'task'; task: string }
  /** 에이전트 대화를 노트 옆 칸에 (10/21 "창 분할로 나란히"): 주소는 없고 탭으로만 */
  | { k: 'chat'; chat: string }

export const tabKey = (t: Tab) => ('path' in t ? `file:${t.path}` : 'chat' in t ? `chat:${t.chat}` : 'task' in t ? `task:${t.task}` : 'tid' in t ? `topic:${t.tid}` : 'name' in t ? `doc:${t.name}` : 'sid' in t ? `statement:${t.sid}` : 'file' in t ? `part:${t.file}` : 'id' in t ? `${t.k}:${t.id}` : t.k === 'mspdf' && t.ms ? `mspdf:${t.ms}` : t.k)

/**
 * 갈래 화면(첫 화면 · 프로젝트 정보 · 할 일 · 지도 · 기록)은 탭이 아니다: 사이드바에서 고르면 칸에 고른 탭이 없을 때처럼
 * 그 칸에 보이고, 탭 줄에는 열어 둔 문서(장, 보조 노트, PDF …)만 남는다 (2026-10-03 피드백)
 */
export type SectionPage = 'overview' | 'info' | 'agents' | 'status' | 'changes' | 'repo' | 'files' | 'todo' | 'records' | 'log' | 'map' | 'notes' | 'concepts' | 'papers' | 'edits' | 'problems'
const SECTIONS: readonly string[] = ['overview', 'info', 'agents', 'status', 'changes', 'repo', 'files', 'todo', 'records', 'log', 'map', 'notes', 'concepts', 'papers', 'edits', 'problems'] satisfies SectionPage[]
export const isSection = (page: string): page is SectionPage => SECTIONS.includes(page)

export function tabOfRoute(r: Route): Tab | null {
  if (isSection(r.page)) return null
  switch (r.page) {
    case 'statement': return { k: 'statement', sid: r.sid }
    case 'doc': return { k: 'doc', name: r.name }
    case 'file': return { k: 'file', path: r.path }
    case 'part': return { k: 'part', file: r.file }
    case 'topic': return { k: 'topic', tid: r.tid }
    case 'concept': return { k: 'concept', id: r.id }
    case 'paper': return { k: 'paper', id: r.id }
    case 'task': return { k: 'task', task: r.task }
    default: return null
  }
}

/** 탭을 누르면 갈 주소. 결과 PDF 탭은 주소가 없다 (블록 주소를 바꾸지 않는다) */
export function routeOfTab(rid: string, t: Tab): Route | null {
  switch (t.k) {
    case 'overview': return { page: 'overview', rid }
    case 'log': return { page: 'log', rid }
    case 'map': return { page: 'map', rid }
    case 'todo': return { page: 'todo', rid }
    case 'records': return { page: 'records', rid }
    case 'info': return { page: 'info', rid }
    case 'agents': return { page: 'agents', rid }
    case 'status': return { page: 'status', rid }
    case 'changes': return { page: 'changes', rid }
    case 'repo': return { page: 'repo', rid }
    case 'files': return { page: 'files', rid }
    case 'notes': return { page: 'notes', rid }
    case 'concepts': return { page: 'concepts', rid }
    case 'papers': return { page: 'papers', rid }
    case 'edits': return { page: 'edits', rid }
    case 'problems': return { page: 'problems', rid }
    case 'statement': return { page: 'statement', rid, sid: t.sid }
    case 'doc': return { page: 'doc', rid, name: t.name }
    case 'file': return { page: 'file', rid, path: t.path }
    case 'part': return { page: 'part', rid, file: t.file }
    case 'topic': return { page: 'topic', rid, tid: t.tid }
    case 'mspdf': return null
    case 'concept': return { page: 'concept', rid, id: t.id }
    case 'paper': return { page: 'paper', rid, id: t.id }
    case 'task': return { page: 'task', rid, task: t.task }
    case 'chat': return null
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
  const route = focused ? (nextActive && routeOfTab(rid, nextActive)) || (otherActive && routeOfTab(rid, otherActive)) || (!nextActive && !otherActive ? { page: 'overview' as const, rid } : null) : null
  return { layout: next, route }
}

export interface PaneState { tabs: Tab[]; active: string | null }
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

export const paneOf = (l: Layout, key: string): -1 | 0 | 1 => {
  const i = l.panes.findIndex((p) => p.tabs.some((t) => tabKey(t) === key))
  return i === 0 ? 0 : i === 1 ? 1 : -1
}
export const withPane = (l: Layout, i: number, p: PaneState): Layout => {
  const panes: Layout['panes'] = [l.panes[0], l.panes[1]]
  panes[i] = p
  return { ...l, panes }
}
export const addTab = (p: PaneState, t: Tab): PaneState =>
  p.tabs.some((x) => tabKey(x) === tabKey(t)) ? { ...p, active: tabKey(t) } : { tabs: [...p.tabs, t], active: tabKey(t) }
export const removeTab = (p: PaneState, key: string): PaneState =>
  ({ tabs: p.tabs.filter((x) => tabKey(x) !== key), active: p.active === key ? null : p.active })
