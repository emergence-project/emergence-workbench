import { describe, expect, it, vi } from 'vitest'
import { go, href, isListRoute, parseRoute, registerRouteGuard, subscribeRoute, type Route } from './router'

// 주소는 피드백 기록(route)과 북마크에 남는다. 바꾸면 옛 주소가 엉뚱한 화면을 연다.
const ROUTES: Route[] = [
  { page: 'home' },
  { page: 'about' },
  { page: 'about', part: 'notes' },
  { page: 'settings' },
  { page: 'settings', part: 'latex' },
  { page: 'network' },
  { page: 'network', person: 'Ada Example' },
  { page: 'feedback' },
  { page: 'shelf' },
  { page: 'shelf', filter: 'project:alpha' },
  { page: 'shelf', open: 'exampleDischarging2022' },
  { page: 'shelf', list: true },
  { page: 'figures' },
  { page: 'figures', list: true },
  { page: 'figures', filter: 'project:alpha' },
  { page: 'library' },
  { page: 'library', list: true },
  { page: 'library', list: true, subjectPrefix: '수학 › A_% / B?', issue: 'todo', check: 'unchecked', showEmpty: true },
  { page: 'library', list: true, subjectPrefix: '' },
  { page: 'library', topic: 'modular-flow' },
  { page: 'kmap' },
  { page: 'kmap', topic: 'modular-flow' },
  { page: 'concept', rid: 'alpha', id: 'graph-coloring' },
  { page: 'paper', rid: 'alpha', id: 'ex2023' },
  { page: 'overview', rid: 'alpha' },
  { page: 'overview', rid: 'alpha', anchor: 'sec 2' },
  { page: 'map', rid: 'alpha' },
  { page: 'todo', rid: 'alpha' },
  { page: 'info', rid: 'alpha' },
  { page: 'notes', rid: 'alpha' },
  { page: 'concepts', rid: 'alpha' },
  { page: 'papers', rid: 'alpha' },
  { page: 'statement', rid: 'alpha', sid: 'prop-3.9' },
  { page: 'log', rid: 'alpha' },
  { page: 'block', rid: 'alpha', bid: 'B-001' },
  { page: 'doc', rid: 'alpha', name: 'paper 1.pdf' },
  { page: 'part', rid: 'alpha', file: 'docs/main.tex#sec:intro' },
  { page: 'topic', rid: 'alpha', tid: 't1' },
]

describe('router', () => {
  it.each(ROUTES.map((r) => [href(r), r] as const))('%s 를 다시 읽으면 같은 화면', (h, r) => {
    expect(parseRoute(h)).toEqual(r)
  })

  it('예전 주소는 지금 화면으로 옮긴다', () => {
    expect(parseRoute('#/r/alpha/tree')).toEqual({ page: 'map', rid: 'alpha' })
    expect(parseRoute('#/latex')).toEqual({ page: 'settings', part: 'latex' })
    // 지식 지도는 왼쪽 띠의 페이지로, 공부할 것은 지식 첫 화면으로 (10/6). 옛 꼴 view: 'map'도 같은 주소
    expect(parseRoute('#/library/map/modular-flow')).toEqual({ page: 'kmap', topic: 'modular-flow' })
    expect(href({ page: 'library', view: 'map', topic: 'x' })).toBe(href({ page: 'kmap', topic: 'x' }))
    expect(parseRoute('#/library/learn')).toEqual({ page: 'library' })
  })

  it('라이브러리 첫 화면·노트·지도와 목록을 구별한다', () => {
    for (const hash of ['#/library/list', '#/papers/list', '#/papers/waiting', '#/figures/list']) expect(isListRoute(parseRoute(hash))).toBe(true)
    for (const hash of ['#/library', '#/library/learn', '#/library/t/list', '#/library/map', '#/papers', '#/papers/open/list', '#/figures']) expect(isListRoute(parseRoute(hash))).toBe(false)
    expect(parseRoute('#/library/list?issue=unknown&check=unknown')).toEqual({ page: 'library', list: true })
  })

  it('모르는 주소는 홈, 모르는 프로젝트 하위 주소는 프로젝트 첫 화면', () => {
    expect(parseRoute('')).toEqual({ page: 'home' })
    expect(parseRoute('#/nowhere')).toEqual({ page: 'home' })
    expect(parseRoute('#/r/alpha/nowhere')).toEqual({ page: 'overview', rid: 'alpha' })
    expect(parseRoute('#/r/alpha/b')).toEqual({ page: 'overview', rid: 'alpha' })
  })

  it('경로 조각의 슬래시·한글·공백을 그대로 지킨다', () => {
    const r: Route = { page: 'part', rid: '내 연구', file: 'chapters/01 intro.tex' }
    expect(href(r)).not.toContain(' ')
    expect(parseRoute(href(r))).toEqual(r)
  })
})


describe('navigation while a tab is saving before close', () => {
  it('keeps the current project until the save settles, then permits navigation', () => {
    const location = { hash: '#/r/alpha' }
    vi.stubGlobal('location', location)
    let saving = true
    const unregister = registerRouteGuard(() => !saving)
    try {
      go({ page: 'home' })
      expect(location.hash).toBe('#/r/alpha')
      saving = false
      go({ page: 'home' })
      expect(location.hash).toBe('#/')
    } finally { unregister(); vi.unstubAllGlobals() }
  })

  it('preserves previous and forward visits when history navigation is blocked', () => {
    const entries = [{ hash: '#/r/alpha', state: null as unknown }]
    let index = 0
    const location = { get hash() { return entries[index]!.hash } }
    const listeners = new Set<() => void>()
    const dispatch = () => listeners.forEach((fn) => fn())
    const history = {
      get state() { return entries[index]!.state },
      replaceState(state: unknown, _title: string, hash?: string) {
        entries[index] = { hash: hash ?? entries[index]!.hash, state }
      },
      go(delta: number) { index += delta; dispatch() },
    }
    vi.stubGlobal('location', location)
    vi.stubGlobal('history', history)
    vi.stubGlobal('window', {
      navigation: {
        get currentEntry() { return { key: String(index) } },
        traverseTo(key: string) { history.go(Number(key) - index); return { finished: Promise.resolve() } },
      },
      addEventListener: (_name: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_name: string, fn: () => void) => listeners.delete(fn),
    })
    let saving = false
    const unregister = registerRouteGuard(() => !saving)
    const onRoute = vi.fn()
    const unsubscribe = subscribeRoute(onRoute)
    try {
      entries.push({ hash: '#/r/second', state: null }); index++
      dispatch()
      onRoute.mockClear()
      saving = true
      history.go(-1)
      expect(location.hash).toBe('#/r/second')
      expect(entries.map((entry) => entry.hash)).toEqual(['#/r/alpha', '#/r/second'])
      expect(onRoute).not.toHaveBeenCalled()
      saving = false
      history.go(-1)
      expect(onRoute).toHaveBeenLastCalledWith({ page: 'overview', rid: 'alpha', anchor: undefined })
      history.go(1)
      expect(onRoute).toHaveBeenLastCalledWith({ page: 'overview', rid: 'second', anchor: undefined })
    } finally { unsubscribe(); unregister(); vi.unstubAllGlobals() }
    expect(listeners.size).toBe(0)
  })
})


it('does not freeze navigation when older visits have no routing metadata', () => {
  const entries = [{ hash: '#/r/older', state: null as unknown }, { hash: '#/r/previous', state: null as unknown }, { hash: '#/r/current', state: null as unknown }]
  let index = 2
  const location = { get hash() { return entries[index]!.hash } }
  const listeners = new Set<() => void>()
  const dispatch = () => listeners.forEach((fn) => fn())
  const history = {
    get state() { return entries[index]!.state },
    replaceState(state: unknown, _title: string, hash?: string) { entries[index] = { hash: hash ?? location.hash, state } },
    pushState(state: unknown, _title: string, hash: string) { entries.splice(index + 1); entries.push({ hash, state }); index++ },
    go(delta: number) { const next = index + delta; if (next >= 0 && next < entries.length) { index = next; dispatch() } },
  }
  vi.stubGlobal('location', location)
  vi.stubGlobal('history', history)
  vi.stubGlobal('window', {
    addEventListener: (_name: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_name: string, fn: () => void) => listeners.delete(fn),
  })
  let saving = true
  const unregister = registerRouteGuard(() => !saving)
  const onRoute = vi.fn()
  const unsubscribe = subscribeRoute(onRoute)
  try {
    history.go(-1)
    expect(location.hash).toBe('#/r/current')
    expect(entries[1]!.hash).toBe('#/r/previous')
    expect(onRoute).not.toHaveBeenCalled()
    saving = false
    history.go(-1)
    expect(onRoute).toHaveBeenLastCalledWith({ page: 'overview', rid: 'previous', anchor: undefined })
    history.go(1)
    expect(onRoute).toHaveBeenLastCalledWith({ page: 'overview', rid: 'current', anchor: undefined })
    history.pushState(null, '', '#/r/new'); dispatch()
    expect(onRoute).toHaveBeenLastCalledWith({ page: 'overview', rid: 'new', anchor: undefined })
  } finally { unsubscribe(); unregister(); vi.unstubAllGlobals() }
})


it('releases navigation when restoring the browser entry fails', async () => {
  const location = { hash: '#/r/current' }
  const listeners = new Set<() => void>()
  const dispatch = () => listeners.forEach((fn) => fn())
  vi.stubGlobal('location', location)
  vi.stubGlobal('history', { state: null, pushState: (_state: unknown, _title: string, hash: string) => { location.hash = hash } })
  vi.stubGlobal('window', {
    navigation: {
      currentEntry: { key: 'current' },
      traverseTo: () => ({ finished: Promise.reject(new Error('Entry was removed')) }),
    },
    addEventListener: (_name: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_name: string, fn: () => void) => listeners.delete(fn),
  })
  let saving = true
  const unregister = registerRouteGuard(() => !saving)
  const onRoute = vi.fn()
  const unsubscribe = subscribeRoute(onRoute)
  try {
    location.hash = '#/r/previous'; dispatch()
    await Promise.resolve()
    expect(location.hash).toBe('#/r/current')
    expect(onRoute).not.toHaveBeenCalled()
    saving = false
    location.hash = '#/r/new'; dispatch()
    expect(onRoute).toHaveBeenLastCalledWith({ page: 'overview', rid: 'new', anchor: undefined })
  } finally { unsubscribe(); unregister(); vi.unstubAllGlobals() }
})
