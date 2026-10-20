import type { SyncKind } from '@rw/core'
import type { Registry } from './registry.js'
import { RECHECK_MS } from './scheduler.js'

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
export const SYNC_RECHECK_MS = RECHECK_MS
