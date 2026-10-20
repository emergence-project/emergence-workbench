import type { SyncKind } from '@rw/core'
import type { Registry } from './registry.js'

/**
 * 지금 쓸 동기화 간격 (ms, 설정 › 동기화 10/19). base = 앱을 켤 때 정한 값(없으면 이 앱은 그 일을 하지 않음).
 * 사용자가 그 칸을 저장했으면 그 값, 수동이면 null(저절로 하지 않음). 타이머는 돌 때마다 이것을 다시 읽어 바로 적용한다.
 */
export function syncDelayMs(registry: Registry, kind: SyncKind, base: number | undefined): number | null {
  if (base === undefined) return null
  const c = registry.sync[kind]
  if (!c) return base
  return c.mode === 'manual' ? null : c.every * 1000
}

/** 수동인 동안 설정이 바뀌었는지 다시 볼 간격 */
export const SYNC_RECHECK_MS = 60_000

/**
 * 설정 › 동기화의 간격으로 run을 되풀이한다(받기 · 업데이트). firstMs 뒤 처음 돌고, 그 뒤 마지막으로 돈 때부터 간격이 지나면 다시 돈다.
 * 간격은 SYNC_RECHECK_MS마다 다시 읽으므로, 하루에서 10분으로 바꿔도 1분 안에 적용된다. 수동이면 돌지 않는다. 멈추는 함수를 돌려준다
 */
export function syncLoop(registry: Registry, kind: SyncKind, base: number | undefined, firstMs: number, run: () => Promise<unknown>): () => void {
  let timer: NodeJS.Timeout | null = null
  let closed = false
  const firstAt = Date.now() + firstMs
  let lastRun: number | null = null
  const step = async () => {
    const ms = syncDelayMs(registry, kind, base)
    if (ms !== null && Date.now() >= (lastRun === null ? firstAt : lastRun + ms)) {
      await run().catch(() => undefined)
      lastRun = Date.now()
    }
    if (closed) return
    const due = ms === null ? Infinity : (lastRun === null ? firstAt : lastRun + ms) - Date.now()
    timer = setTimeout(() => void step(), Math.max(0, Math.min(SYNC_RECHECK_MS, due)))
    timer.unref()
  }
  timer = setTimeout(() => void step(), Math.min(SYNC_RECHECK_MS, firstMs))
  timer.unref()
  return () => { closed = true; if (timer) clearTimeout(timer) }
}
