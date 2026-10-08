import { useEffect, useState } from 'react'
import type { ConceptCheck, ConceptIssue } from './api/concepts'

/**
 * 주소 뒤쪽(#)으로 화면을 기억한다. 제목줄의 뒤로/앞으로 버튼은 브라우저 기록을 그대로 쓴다.
 *   #/r/<연구>            프로젝트 정보 (목표·저장소·태그)
 *   #/r/<연구>/todo       할 일
 *   #/r/<연구>/map        지도 (예전 /tree도 여기로)
 *   #/r/<연구>/b/<작업>    작업노트 편집 (파일은 workbench/blocks/)
 *   #/r/<연구>/s/<진술>    진술 노트 (저장소의 statements/)
 *   #/r/<연구>/log        기록
 *   #/r/<연구>/k/<작업>    맡긴 일의 보고서 (workbench/tasks/<작업>.md)
 *   #/r/<연구>/m/<파일>    자료 (materials/의 PDF·그림)
 *   #/r/<연구>/w/<파일>    원고의 장·부록 (research.yaml sources.manuscript)
 *   #/about[/<쪽>]        이 앱 소개 (쪽마다 한 주제: 한눈에, 홈, 프로젝트, 노트 …)
 *   #/settings[/<부분>]    설정 (왼쪽 사이드바로 부분을 고른다. latex = LaTeX 서식, 예전 #/latex도 여기로)
 *   #/network             네트워킹 (저자와 소속, 더한 사람)
 *   #/network/<사람>       사람 한 명의 페이지 (노트 참고 문헌에 있는 그 사람의 논문)
 *   #/feedback            피드백 모아 보기
 *   #/review[?key=]       에이전트 고침 검토 (key = concept:<id> 또는 note:<연구>:<파일>, 그 노트를 연 채)
 *   #/papers              논문 라이브러리 첫 화면 (최근 더한 논문 · 점검 · 통계)
 *   #/papers/list         논문 목록 (표 · 카드)
 *   #/papers/<거르기>       논문 목록을 거른 채 (comments · waiting · none · project:<연구> …)
 *   #/papers/open/<키>     논문 하나 열기 (PDF + 코멘트)
 *   #/figures             그림 라이브러리 첫 화면 (최근 더한 그림 · 점검 · 통계)
 *   #/figures/list        그림 목록 (카드 · 표)
 *   #/figures/<거르기>      그림 목록을 거른 채 (library · unused · project:<연구> …)
 *   #/library             지식 (주제마다 Study·개념노트·Topic Review·문헌노트)
 *   #/library/list         지식 목록 (분류·이상·점검 거르기는 query에)
 *   #/library/t/<주제>     지식 — 그 주제를 고른 채
 *   #/library/map[/<주제>] 지식 지도 (지식 사이드바의 "지도" 줄, 주제가 있으면 그 초점 보기)
 *   #/library/learn        옛 "공부할 것" 주소 → 지식 첫 화면 (10/6: 만들기 메뉴와 점검 "초안 검토"로 합침)
 *   #/r/<연구>/c/<id>      개념노트 (라이브러리)를 이 프로젝트의 작업 화면에서
 *   #/r/<연구>/p/<id>      문헌노트 (라이브러리)를 이 프로젝트의 작업 화면에서
 */
export type Route =
  | { page: 'home' }
  | { page: 'about'; part?: string }
  | { page: 'settings'; part?: string }
  | { page: 'network'; person?: string }
  | { page: 'feedback' }
  /** 에이전트 고침 검토 (10/8). scope는 목록을 그 프로젝트(또는 library)만 */
  | { page: 'review'; key?: string; scope?: string }
  /** 거르기(filter)나 list가 있으면 목록, 없으면 첫 화면 (10/6 라이브러리 L2) */
  | { page: 'shelf'; filter?: string; open?: string; list?: true }
  | { page: 'figures'; filter?: string; list?: true }
  /** view: 'map'은 지도 주소를 만드는 옛 꼴 (지도 화면이 그대로 쓴다). 읽으면 kmap이 된다 */
  | { page: 'library'; topic?: string; view?: 'map'; list?: true; subjectPrefix?: string; issue?: ConceptIssue; check?: ConceptCheck; showEmpty?: boolean }
  /** 지식 지도 (10/6: 지식 화면의 보기에서 왼쪽 띠의 페이지로, 주소는 그대로) */
  | { page: 'kmap'; topic?: string }
  | { page: 'concept'; rid: string; id: string }
  | { page: 'paper'; rid: string; id: string }
  | { page: 'overview'; rid: string; anchor?: string }
  | { page: 'map'; rid: string }
  | { page: 'todo'; rid: string }
  | { page: 'info'; rid: string }
  | { page: 'notes'; rid: string }
  | { page: 'concepts'; rid: string }
  | { page: 'papers'; rid: string }
  | { page: 'statement'; rid: string; sid: string }
  | { page: 'log'; rid: string }
  | { page: 'block'; rid: string; bid: string }
  | { page: 'doc'; rid: string; name: string }
  | { page: 'part'; rid: string; file: string }
  | { page: 'topic'; rid: string; tid: string }
  | { page: 'task'; rid: string; task: string }

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const anchor = new URLSearchParams(query).get('at') ?? undefined
  if (parts[0] === 'r' && parts[1]) {
    if (parts[2] === 'tree' || parts[2] === 'map') return { page: 'map', rid: parts[1] }
    if (parts[2] === 'todo') return { page: 'todo', rid: parts[1] }
    if (parts[2] === 'info') return { page: 'info', rid: parts[1] }
    if (parts[2] === 'notes') return { page: 'notes', rid: parts[1] }
    if (parts[2] === 'concepts') return { page: 'concepts', rid: parts[1] }
    if (parts[2] === 'papers') return { page: 'papers', rid: parts[1] }
    if (parts[2] === 's' && parts[3]) return { page: 'statement', rid: parts[1], sid: parts[3] }
    if (parts[2] === 'log') return { page: 'log', rid: parts[1] }
    if (parts[2] === 'b' && parts[3]) return { page: 'block', rid: parts[1], bid: parts[3] }
    if (parts[2] === 'm' && parts[3]) return { page: 'doc', rid: parts[1], name: parts[3] }
    if (parts[2] === 'w' && parts[3]) return { page: 'part', rid: parts[1], file: parts[3] }
    if (parts[2] === 't' && parts[3]) return { page: 'topic', rid: parts[1], tid: parts[3] }
    if (parts[2] === 'k' && parts[3]) return { page: 'task', rid: parts[1], task: parts[3] }
    if (parts[2] === 'c' && parts[3]) return { page: 'concept', rid: parts[1], id: parts[3] }
    if (parts[2] === 'p' && parts[3]) return { page: 'paper', rid: parts[1], id: parts[3] }
    return { page: 'overview', rid: parts[1], anchor }
  }
  if (parts[0] === 'about') return parts[1] ? { page: 'about', part: parts[1] } : { page: 'about' }
  if (parts[0] === 'settings') return parts[1] ? { page: 'settings', part: parts[1] } : { page: 'settings' }
  if (parts[0] === 'latex') return { page: 'settings', part: 'latex' }
  if (parts[0] === 'network') return parts[1] ? { page: 'network', person: parts[1] } : { page: 'network' }
  if (parts[0] === 'feedback') return { page: 'feedback' }
  if (parts[0] === 'review') {
    const params = new URLSearchParams(query)
    return { page: 'review', ...(params.get('key') && { key: params.get('key')! }), ...(params.get('scope') && { scope: params.get('scope')! }) }
  }
  if (parts[0] === 'figures') return parts[1] === 'list' ? { page: 'figures', list: true } : parts[1] ? { page: 'figures', filter: parts[1] } : { page: 'figures' }
  if (parts[0] === 'papers') {
    if (parts[1] === 'open' && parts[2]) return { page: 'shelf', open: parts[2] }
    return parts[1] === 'list' ? { page: 'shelf', list: true } : parts[1] ? { page: 'shelf', filter: parts[1] } : { page: 'shelf' }
  }
  if (parts[0] === 'library') {
    if (parts[1] === 'map') return { page: 'kmap', ...(parts[2] && { topic: parts[2] }) }
    if (parts[1] === 'list') {
      const params = new URLSearchParams(query)
      const issue = params.get('issue') as ConceptIssue | null
      const check = params.get('check') as ConceptCheck | null
      return { page: 'library', list: true,
        ...(params.has('subject') && { subjectPrefix: params.get('subject')! }),
        ...(issue && ['empty', 'emptySection', 'todo', 'brokenLink', 'noSource', 'unknownCite'].includes(issue) && { issue }),
        ...(check && ['unchecked', 'changedAfterCheck', 'draftsToReview'].includes(check) && { check }),
        ...(params.get('empty') === '1' && { showEmpty: true }),
      }
    }
    if (parts[1] === 'learn') return { page: 'library' }
    return parts[1] === 't' && parts[2] ? { page: 'library', topic: parts[2] } : { page: 'library' }
  }
  return { page: 'home' }
}

/** 라이브러리 목록 화면인지 (첫 화면이 아니라) */
export const isListRoute = (r: Route) => (r.page === 'library' && !!r.list && !r.topic && !r.view) || (r.page === 'shelf' && !r.open && (!!r.list || !!r.filter)) || (r.page === 'figures' && (!!r.list || !!r.filter))

export function href(r: Route): string {
  const e = encodeURIComponent
  switch (r.page) {
    case 'home': return '#/'
    case 'about': return `#/about${r.part ? `/${e(r.part)}` : ''}`
    case 'settings': return `#/settings${r.part ? `/${e(r.part)}` : ''}`
    case 'network': return `#/network${r.person ? `/${e(r.person)}` : ''}`
    case 'feedback': return '#/feedback'
    case 'review': {
      const p = new URLSearchParams()
      if (r.scope) p.set('scope', r.scope)
      if (r.key) p.set('key', r.key)
      return `#/review${p.size ? `?${p}` : ''}`
    }
    case 'figures': return `#/figures${r.filter ? `/${e(r.filter)}` : r.list ? '/list' : ''}`
    case 'shelf': return r.open ? `#/papers/open/${e(r.open)}` : `#/papers${r.filter ? `/${e(r.filter)}` : r.list ? '/list' : ''}`
    case 'library': {
      if (r.list && !r.topic && !r.view) {
        const p = new URLSearchParams()
        if (r.subjectPrefix !== undefined) p.set('subject', r.subjectPrefix)
        if (r.issue) p.set('issue', r.issue)
        if (r.check) p.set('check', r.check)
        if (r.showEmpty) p.set('empty', '1')
        return `#/library/list${p.size ? `?${p}` : ''}`
      }
      return r.view === 'map' ? href({ page: 'kmap', ...(r.topic && { topic: r.topic }) }) : `#/library${r.topic ? `/t/${e(r.topic)}` : ''}`
    }
    case 'kmap': return `#/library/map${r.topic ? `/${e(r.topic)}` : ''}`
    case 'concept': return `#/r/${e(r.rid)}/c/${e(r.id)}`
    case 'paper': return `#/r/${e(r.rid)}/p/${e(r.id)}`
    case 'overview': return `#/r/${e(r.rid)}${r.anchor ? `?at=${e(r.anchor)}` : ''}`
    case 'map': return `#/r/${e(r.rid)}/map`
    case 'todo': return `#/r/${e(r.rid)}/todo`
    case 'info': return `#/r/${e(r.rid)}/info`
    case 'notes': return `#/r/${e(r.rid)}/notes`
    case 'concepts': return `#/r/${e(r.rid)}/concepts`
    case 'papers': return `#/r/${e(r.rid)}/papers`
    case 'statement': return `#/r/${e(r.rid)}/s/${e(r.sid)}`
    case 'log': return `#/r/${e(r.rid)}/log`
    case 'block': return `#/r/${e(r.rid)}/b/${e(r.bid)}`
    case 'doc': return `#/r/${e(r.rid)}/m/${e(r.name)}`
    case 'part': return `#/r/${e(r.rid)}/w/${e(r.file)}`
    case 'topic': return `#/r/${e(r.rid)}/t/${e(r.tid)}`
    case 'task': return `#/r/${e(r.rid)}/k/${e(r.task)}`
  }
}

const routeGuards = new Set<(route: Route) => boolean>()
/** A temporary guard keeps an editor mounted until its close-time save settles. */
export function registerRouteGuard(guard: (route: Route) => boolean): () => void {
  routeGuards.add(guard)
  return () => { routeGuards.delete(guard) }
}
const canNavigate = (r: Route) => [...routeGuards].every((guard) => guard(r))

export function go(r: Route): void {
  if (!canNavigate(r)) return
  const h = href(r)
  if (location.hash !== h) location.hash = h
}

/** Native history and direct hash links follow the same guard as app navigation. */
export function subscribeRoute(onRoute: (route: Route) => void): () => void {
  // Browser entry keys also cover visits made before this version was loaded.
  const navigation = (window as Window & { navigation?: {
    currentEntry: { key: string } | null
    traverseTo(key: string): { finished: Promise<unknown> }
  } }).navigation
  let acceptedHash = location.hash
  let acceptedKey = navigation?.currentEntry?.key
  let acceptedState: unknown = history.state
  let restoring = false
  const restoreFallback = () => {
    // Older browsers cannot identify the entry. Keep the prior URL intact and
    // restore this screen with a new entry rather than overwrite a past visit.
    if (location.hash !== acceptedHash) history.pushState(acceptedState, '', acceptedHash)
    acceptedKey = navigation?.currentEntry?.key
    restoring = false
  }
  const on = () => {
    if (location.hash === acceptedHash && navigation?.currentEntry?.key === acceptedKey) { restoring = false; return }
    if (restoring) return
    const next = parseRoute(location.hash)
    if (!canNavigate(next)) {
      if (navigation && acceptedKey) {
        restoring = true
        try { void navigation.traverseTo(acceptedKey).finished.then(() => { restoring = false }, restoreFallback) }
        catch { restoreFallback() }
      } else restoreFallback()
      return
    }
    acceptedHash = location.hash
    acceptedKey = navigation?.currentEntry?.key
    acceptedState = history.state
    onRoute(next)
  }
  window.addEventListener('popstate', on)
  window.addEventListener('hashchange', on)
  return () => { window.removeEventListener('popstate', on); window.removeEventListener('hashchange', on) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => subscribeRoute(setRoute), [])
  return route
}
