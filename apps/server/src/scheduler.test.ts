import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorLog, loop, RECHECK_MS } from './scheduler.js'

describe('loop (저절로 도는 일)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('처음 first 뒤에 돌고, 그 뒤 간격마다 돈다', async () => {
    const run = vi.fn(async () => undefined)
    const stop = loop({ first: 60_000, every: 10 * 60_000, run })
    await vi.advanceTimersByTimeAsync(59_999)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(run).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('오래 걸리는 일은 겹쳐 돌지 않고, 끝난 때부터 간격을 센다', async () => {
    let running = 0
    let most = 0
    const run = vi.fn(async () => { running++; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 5 * 60_000)); running-- })
    const stop = loop({ first: 0, every: 60_000, run })
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 60_000 + 5 * 60_000)
    expect(run).toHaveBeenCalledTimes(2)
    expect(most).toBe(1)
    stop()
  })

  it('오류가 나도 다음 차례에 다시 돈다', async () => {
    const errors: unknown[] = []
    const run = vi.fn(async () => { throw new Error('네트워크') })
    const stop = loop({ first: 0, every: 60_000, run, onError: (e) => errors.push(e) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).toHaveBeenCalledTimes(2)
    expect(errors).toHaveLength(2)
    stop()
  })

  it('간격이 null(수동)이면 돌지 않다가 다시 정해지면 RECHECK_MS 안에 돈다', async () => {
    let every: number | null = null
    const run = vi.fn(async () => undefined)
    const stop = loop({ first: 0, every: () => every, run })
    await vi.advanceTimersByTimeAsync(10 * RECHECK_MS)
    expect(run).not.toHaveBeenCalled()
    every = 5 * 60_000
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(run).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('errorLog (앱 업데이트 오류 줄)', () => {
  it('같은 오류는 처음 한 번만, 다른 오류는 새로, 풀리면 한 줄', () => {
    const lines: string[] = []
    const log = errorLog('app auto update', (l) => lines.push(l))
    log.ok()
    for (let i = 0; i < 5; i++) log.fail(new Error('GitHub를 확인하지 못했습니다'))
    log.fail(new Error('빌드 실패'))
    log.ok()
    log.ok()
    log.fail(new Error('GitHub를 확인하지 못했습니다'))
    expect(lines).toEqual([
      'app auto update: GitHub를 확인하지 못했습니다',
      'app auto update: 빌드 실패',
      'app auto update: 다시 됩니다 (앞의 오류가 풀림)',
      'app auto update: GitHub를 확인하지 못했습니다',
    ])
  })
})
