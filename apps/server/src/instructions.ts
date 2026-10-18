import { localDate } from '@rw/core'

/**
 * 기록의 지시를 맥의 Claude에게 넘기는 차례 (10/16 사용자 결정 "설정에서 조절할 수 있게 하자", 설정 › 에이전트).
 * 한 번에 하나씩만 돌린다: Claude 세션 여럿이 함께 떠 맥의 메모리를 다 쓰지 않게 (10/14 느려짐의 원인).
 */
export class ClaudeQueue {
  private jobs: Array<{ key: string; run: () => Promise<unknown> }> = []
  private keys = new Set<string>()
  private running: Promise<void> | null = null

  /** 이미 기다리거나 도는 일이면 더하지 않는다 */
  has(key: string): boolean { return this.keys.has(key) }

  add(key: string, run: () => Promise<unknown>): boolean {
    if (this.keys.has(key)) return false
    this.keys.add(key)
    this.jobs.push({ key, run })
    if (!this.running) this.running = this.drain()
    return true
  }

  /** 기다리는 일이 모두 끝날 때까지 (테스트) */
  async idle(): Promise<void> { while (this.running) await this.running }

  private async drain(): Promise<void> {
    for (let job = this.jobs.shift(); job; job = this.jobs.shift()) {
      try { await job.run() } catch (e) {
        // 서비스 로그(pnpm service:logs)에 남는다. 지시는 대기로 남아 다음 차례에 다시 집힌다
        console.error(`instruction ${job.key} failed: ${(e as Error).message}`)
      } finally { this.keys.delete(job.key) }
    }
    this.running = null
  }
}

/** 하루 한 번 할 때: 지금이 고른 시각(정시)의 그 시간 안이고 오늘 아직 하지 않았는지 */
export function dailyDue(at: string, now: Date, lastDay: string | null): string | null {
  const day = localDate(now)
  if (lastDay === day) return null
  return Number(at.slice(0, 2)) === now.getHours() ? day : null
}
