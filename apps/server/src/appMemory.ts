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

/** 앱 고치기 대화를 하나 더 열어도 되는가. live = 일하는 수, fresh = 그 가운데 막 연 수 */
export function appRoom(live: number, fresh: number, m: Mem): Room {
  if (live < APP_LIVE_MIN) return { ok: true }
  if (live >= APP_LIVE_CAP) return { ok: false, why: 'cap' }
  const left = m.free * m.total - fresh * PER_CHAT_GB * GB
  return left >= Math.max(MEM_FREE_MIN * m.total, MEM_FREE_GB * GB) ? { ok: true } : { ok: false, why: 'memory' }
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
