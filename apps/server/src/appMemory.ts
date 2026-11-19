/**
 * 앱 고치기 대화를 더 열지는 개수가 아니라 남은 메모리로 정한다 (11/19 사용자 "작업 올리는 숫자는 고정된 숫자가 아니라 작업 중인 메모리를 기준으로").
 *
 * - 남은 메모리: macOS는 `sysctl kern.memorystatus_level`(memory_pressure의 "free percentage"와 같은 값, 커널이 압박을 판단하는 기준).
 *   os.freemem()은 inactive · purgeable 페이지를 빼고 세서 실제로 쓸 수 있는 양보다 훨씬 적다 (32GB 맥에서 free 2.5GB일 때 이 값은 60%).
 *   리눅스는 /proc/meminfo의 MemAvailable, 그 밖에는 os.freemem().
 * - 기준: 남은 메모리가 전체의 MEM_FREE_MIN 이상이고 MEM_FREE_GB 이상이면 하나 더 연다. 막 연 대화(FRESH_MS 안)는 아직 메모리를 덜 써서
 *   하나마다 PER_CHAT_GB를 미리 빼 둔다 (한꺼번에 여럿을 여는 것 막기). 안전 장치로 최소 APP_LIVE_MIN개는 늘 열고, APP_LIVE_CAP개를 넘지 않는다.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { t } from './i18n.js'

/** 남은 메모리: free = 쓸 수 있는 비율(0–1), total = 전체 바이트 */
export type Mem = { free: number; total: number }

export const APP_LIVE_MIN = 1
export const APP_LIVE_CAP = 6
export const MEM_FREE_MIN = 0.25
export const MEM_FREE_GB = 6
/** 막 연 대화 하나가 곧 쓸 메모리 (Claude 프로세스 + worktree의 테스트 · 빌드 · 그림 찍기) */
export const PER_CHAT_GB = 3
export const FRESH_MS = 3 * 60_000

const GB = 1024 ** 3

/** 지금 쓸 수 있는 메모리 */
export async function readMemory(): Promise<Mem> {
  const total = os.totalmem()
  const fallback = { free: os.freemem() / total, total }
  if (process.platform === 'darwin') {
    const level = await new Promise<number>((res) => {
      execFile('sysctl', ['-n', 'kern.memorystatus_level'], { timeout: 5000 }, (e, out) => res(e ? NaN : Number(out.trim())))
    })
    return Number.isFinite(level) && level > 0 ? { free: Math.min(level, 100) / 100, total } : fallback
  }
  if (process.platform === 'linux') {
    try {
      const m = /^MemAvailable:\s+(\d+)\s+kB/m.exec(fs.readFileSync('/proc/meminfo', 'utf8'))
      if (m) return { free: (Number(m[1]) * 1024) / total, total }
    } catch { /* 아래로 */ }
  }
  return fallback
}

export type Room = { ok: true } | { ok: false; why: 'cap' | 'memory' }

/** 하나 더 열어도 되는가. live = 일하는 수, fresh = 그 가운데 막 연 수. min개까지는 늘 열고 cap개를 넘지 않는다 */
function roomFor(live: number, fresh: number, m: Mem, min: number, cap: number): Room {
  if (live < min) return { ok: true }
  if (live >= cap) return { ok: false, why: 'cap' }
  const left = m.free * m.total - fresh * PER_CHAT_GB * GB
  return left >= Math.max(MEM_FREE_MIN * m.total, MEM_FREE_GB * GB) ? { ok: true } : { ok: false, why: 'memory' }
}

/** 앱 고치기 대화를 하나 더 열어도 되는가 */
export function appRoom(live: number, fresh: number, m: Mem): Room {
  return roomFor(live, fresh, m, APP_LIVE_MIN, APP_LIVE_CAP)
}

/**
 * 모든 대화(프로젝트 · 앱 고치기 · 피드백)가 동시에 도는 수 (11/19 "램에 따른 제한 때문에 느린 것 같다").
 * 전에는 컴퓨터와 상관없이 3개로 고정이라, 32GB 맥미니에서 메모리가 74% 남아도 넷째부터 줄을 섰다.
 * 이제는 이 컴퓨터의 크기로 상한을 정하고(chatCap), 그 안에서 남은 메모리가 있으면 더 연다(chatRoom). 줄 선 대화는 메모리가 풀리면 저절로 시작한다.
 */
export const CHAT_MIN = 3
export const CHAT_MAX = 8
/** 대화 하나에 잡는 몫: 메모리 5GB(Claude 프로세스 + 작업 폴더의 시험 · 빌드), 코어 2개 */
const CHAT_GB = 5
const CHAT_CPUS = 2

/** 이 컴퓨터가 동시에 돌릴 대화 상한 (16GB 맥북 → 3, 32GB · 12코어 맥미니 → 6, 64GB 이상 맥 스튜디오 → 8) */
export function chatCap(total = os.totalmem(), cpus = os.availableParallelism()): number {
  return Math.max(CHAT_MIN, Math.min(CHAT_MAX, Math.floor(total / (CHAT_GB * GB)), Math.floor(cpus / CHAT_CPUS)))
}

/** 대화를 하나 더 시작해도 되는가 (상한 cap 안에서 남은 메모리로. CHAT_MIN개까지는 늘) */
export function chatRoom(live: number, fresh: number, m: Mem, cap: number): Room {
  return roomFor(live, fresh, m, Math.min(CHAT_MIN, cap), cap)
}

/** 남은 메모리를 몇 초마다 재어 두고, 줄을 세울지 정할 때는 그 값을 바로 쓴다 (대화 시작은 재는 것을 기다리지 않는다) */
export class MemoryGauge {
  private last: Mem | undefined
  constructor(private readonly read: () => Promise<Mem> = readMemory) {}
  get current(): Mem | undefined { return this.last }
  async refresh(): Promise<Mem | undefined> {
    this.last = await this.read().catch(() => this.last)
    return this.last
  }
}

/** 짧은 상태: 「앱 고치기 2개 일함 · 남은 메모리 18%(5.8GB)」 */
export function memLine(live: number, m: Mem): string {
  const pct = Math.round(m.free * 100)
  const gb = ((m.free * m.total) / GB).toFixed(1)
  return t(`앱 고치기 ${live}개 일함 · 남은 메모리 ${pct}%(${gb}GB)`, `${live} app conversations working · ${pct}% memory free (${gb} GB)`)
}

/** 열리는 기준 한 줄 */
export function roomRule(): string {
  return t(`남은 메모리가 ${MEM_FREE_MIN * 100}% · ${MEM_FREE_GB}GB 이상이면 엽니다(최소 ${APP_LIVE_MIN}개 · 최대 ${APP_LIVE_CAP}개)`, `opens while at least ${MEM_FREE_MIN * 100}% and ${MEM_FREE_GB} GB stay free (at least ${APP_LIVE_MIN}, at most ${APP_LIVE_CAP})`)
}
