import type { FastifyInstance } from 'fastify'

/** 간격이 바뀌었는지(설정 › 동기화 등) 다시 볼 간격 */
export const RECHECK_MS = 60_000

export interface RepeatOptions {
  /** 처음 돌 때까지 (ms) */
  first: number
  /** 간격 (ms). 함수면 RECHECK_MS마다 다시 읽어 바로 적용하고, null이면(수동) 돌지 않고 기다린다 */
  every: number | (() => number | null)
  run: () => Promise<unknown>
  /** run이 던진 오류 (없으면 버린다: 저절로 도는 일은 다음 차례에 다시 한다) */
  onError?(e: unknown): void
}

/**
 * 저절로 도는 일 하나 (10/20 검토: 라우트마다 따로 만든 타이머를 한 곳으로). first 뒤 처음 돌고, 그 뒤 마지막으로 끝난 때부터 간격이 지나면 다시 돈다.
 * run이 끝나야 다음을 걸므로 겹쳐 돌지 않는다. 타이머는 앱이 끝나는 것을 막지 않는다(unref). 멈추는 함수를 돌려준다
 */
export function loop(o: RepeatOptions): () => void {
  let timer: NodeJS.Timeout | null = null
  let closed = false
  const every = typeof o.every === 'function' ? o.every : () => o.every as number
  const live = typeof o.every === 'function'
  const firstAt = Date.now() + o.first
  let lastRun: number | null = null
  const arm = (ms: number) => {
    if (closed) return
    timer = setTimeout(() => void step(), Math.max(0, ms))
    timer.unref()
  }
  const step = async () => {
    const ms = every()
    const dueAt = (m: number) => (lastRun === null ? firstAt : lastRun + m)
    if (ms !== null && Date.now() >= dueAt(ms)) {
      try { await o.run() } catch (e) { o.onError?.(e) }
      lastRun = Date.now()
    }
    const next = every()
    const due = next === null ? Infinity : dueAt(next) - Date.now()
    arm(live ? Math.min(RECHECK_MS, due) : due)
  }
  arm(live ? Math.min(RECHECK_MS, o.first) : o.first)
  return () => { closed = true; if (timer) clearTimeout(timer) }
}

/** loop를 앱에 걸어 둔다: 앱을 닫으면 멈춘다 */
export function repeat(app: FastifyInstance, o: RepeatOptions): () => void {
  const stop = loop(o)
  app.addHook('onClose', async () => stop())
  return stop
}

/**
 * 저절로 도는 일의 오류 줄: 같은 오류는 처음 한 번만 적고, 풀리면 한 줄 적는다 (10/20 점검: 오프라인에서 로그에 같은 줄 915개)
 */
export function errorLog(label: string, log: (line: string) => void = console.error): { ok(): void; fail(e: unknown): void } {
  let last: string | null = null
  return {
    ok() {
      if (last) log(`${label}: 다시 됩니다 (앞의 오류가 풀림)`)
      last = null
    },
    fail(e) {
      const message = (e as Error).message
      if (message !== last) log(`${label}: ${message}`)
      last = message
    },
  }
}
