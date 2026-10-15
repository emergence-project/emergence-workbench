import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

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

const pick = <M, K extends keyof M>(load: () => Promise<M>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] as ComponentType<M[K] extends ComponentType<infer P> ? P : never> })))

export const MapPage = pick(loaders.MapPage, 'MapPage')
export const TaskReport = pick(loaders.TaskReport, 'TaskReport')
export const AgentEditsPage = pick(loaders.AgentEditsPage, 'AgentEditsPage')

/** 받는 동안은 빈 칸: 미리 받아 두므로 실제로는 거의 보이지 않는다 */
export function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
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
