import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { t } from './i18n'

/**
 * 따로 받는 화면 (2026-10-15 종합 검토 묶음 D).
 * 한 곳에서만 쓰고 다른 파일이 내보내기를 함께 쓰지 않는 화면만 여기서 lazy로 둔다.
 * 첫 번들에서 빠지고, 첫 화면이 뜬 뒤 한가할 때 미리 받아 두어 처음 열 때도 기다리지 않는다.
 */
const loaders = {
  MapPage: () => import('./MapPage'),
  TaskReport: () => import('./TaskReport'),
  AgentEditsPage: () => import('./AgentEditsPage'),
}

/**
 * 앱이 새 버전으로 다시 시작하면 옛 화면이 가리키던 조각 파일이 없어져 받기가 실패한다.
 * 그대로 두면 화면 전체가 비므로 한 번 새로 고치고, 그래도 안 되면 안내를 보인다
 */
function Failed() {
  return <p className="muted" style={{ padding: 'var(--sp-5)' }}>{t('화면을 불러오지 못했습니다. 서버가 켜져 있는지 보고 새로 고쳐 주세요.', 'Could not load this screen. Check that the server is running, then reload.')}</p>
}
const RELOADED = 'rw-lazy-reloaded'
const pick = <M, K extends keyof M>(load: () => Promise<M>, key: K) =>
  lazy(() => load().then((m) => { try { sessionStorage.removeItem(RELOADED) } catch { /* 저장소 없음 */ } return { default: m[key] as ComponentType<M[K] extends ComponentType<infer P> ? P : never> } }, () => {
    let again = false
    try { again = !sessionStorage.getItem(RELOADED); if (again) sessionStorage.setItem(RELOADED, '1') } catch { /* 저장소 없음 */ }
    if (again) { location.reload(); return new Promise<never>(() => undefined) }
    return { default: Failed as ComponentType<M[K] extends ComponentType<infer P> ? P : never> }
  }))

export const MapPage = pick(loaders.MapPage, 'MapPage')
export const TaskReport = pick(loaders.TaskReport, 'TaskReport')
export const AgentEditsPage = pick(loaders.AgentEditsPage, 'AgentEditsPage')

/** 받는 동안은 "불러오는 중…": 미리 받아 두므로 대개는 거의 보이지 않지만, 빈 칸이면 화면이 멈춘 것처럼 보인다 */
export function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="muted" style={{ padding: 'var(--sp-5)' }}>{t('불러오는 중…', 'Loading…')}</p>}>{children}</Suspense>
}

let prefetched = false
/** 첫 화면이 뜬 뒤 한 번, 브라우저가 한가할 때 따로 받는 화면을 모두 받아 둔다 */
export function prefetchLazyPages() {
  if (prefetched) return
  prefetched = true
  const run = () => { for (const load of Object.values(loaders)) void load().catch(() => { prefetched = false }) }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5000 })
  else setTimeout(run, 2000)
}
