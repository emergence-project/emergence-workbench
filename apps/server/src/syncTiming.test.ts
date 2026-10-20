import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncSettings } from '@rw/core'
import type { Registry } from './registry.js'
import { loop } from './scheduler.js'
import { SYNC_RECHECK_MS, syncDelayMs } from './syncTiming.js'
import type { SyncKind } from '@rw/core'

const syncLoop = (registry: Registry, kind: SyncKind, base: number, first: number, run: () => Promise<unknown>) => loop({ first, every: () => syncDelayMs(registry, kind, base), run })

const DAY = 24 * 60 * 60_000
const fakeRegistry = (sync: Partial<SyncSettings>) => ({ sync }) as unknown as Registry

describe('설정 › 동기화 간격으로 도는 일', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('picks up a shorter interval within a minute instead of waiting out the old one', async () => {
    const sync: Partial<SyncSettings> = { pull: { mode: 'auto', every: DAY / 1000 } }
    const run = vi.fn(async () => undefined)
    const stop = syncLoop(fakeRegistry(sync), 'pull', 10 * 60_000, 60_000, run)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).toHaveBeenCalledTimes(1)
    sync.pull = { mode: 'auto', every: 600 }
    await vi.advanceTimersByTimeAsync(10 * 60_000 + SYNC_RECHECK_MS)
    expect(run).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not run while manual, and runs again once switched back', async () => {
    const sync: Partial<SyncSettings> = { update: { mode: 'manual', every: 600 } }
    const run = vi.fn(async () => undefined)
    const stop = syncLoop(fakeRegistry(sync), 'update', 600_000, 600_000, run)
    await vi.advanceTimersByTimeAsync(3 * 600_000)
    expect(run).not.toHaveBeenCalled()
    sync.update = { mode: 'auto', every: 600 }
    await vi.advanceTimersByTimeAsync(SYNC_RECHECK_MS)
    expect(run).toHaveBeenCalledTimes(1)
    stop()
    await vi.advanceTimersByTimeAsync(DAY)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
