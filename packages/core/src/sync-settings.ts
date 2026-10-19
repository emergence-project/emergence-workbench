/**
 * 동기화 설정 (설정 › 동기화, 10/19 결정 "동기화 주기"). 앱 설정 파일(config.yaml)의 `sync:`에 저장한다.
 * 칸마다 수동 | 자동, 자동이면 간격(초). 간격은 고르기 셋(SYNC_PRESETS) 또는 직접(SYNC_LIMITS 안).
 *   publish = 기록 · 피드백을 쓰고 이만큼 지나면 GitHub에 올린다 (그 사이 더 쓰면 다시 센다)
 *   pull    = 연구 저장소 · 라이브러리를 이만큼마다 받는다
 *   update  = 앱 새 버전을 이만큼마다 확인한다 (새 버전이 있을 때만 받고 빌드한다)
 * 저장하지 않은 칸은 앱이 켤 때 정한 값(지금까지의 고정값)을 쓴다.
 */
export const SYNC_KINDS = ['publish', 'pull', 'update'] as const
export type SyncKind = (typeof SYNC_KINDS)[number]
export const SYNC_MODES = ['manual', 'auto'] as const
export type SyncMode = (typeof SYNC_MODES)[number]
export interface SyncChoice { mode: SyncMode; every: number }
export type SyncSettings = Record<SyncKind, SyncChoice>

/** 고르기 셋 (초) */
export const SYNC_PRESETS: Record<SyncKind, readonly [number, number, number]> = {
  publish: [30, 300, 1800],
  pull: [300, 600, 1800],
  update: [600, 3600, 86400],
}
/** 직접 적을 때 범위 (초) */
export const SYNC_LIMITS: Record<SyncKind, readonly [number, number]> = {
  publish: [10, 86400],
  pull: [60, 86400],
  update: [60, 86400],
}

/** 저장된 값이나 요청 값을 믿지 않고, 고를 수 있는 값만 남긴다. 없는 칸은 빼고 돌려준다(그 칸은 기본값을 쓴다) */
export function normalizeSyncSettings(raw: unknown, base: Partial<SyncSettings> = {}): Partial<SyncSettings> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Partial<SyncSettings> = { ...base }
  for (const kind of SYNC_KINDS) {
    const v = src[kind]
    if (!v || typeof v !== 'object') continue
    const c = v as Record<string, unknown>
    const prev = base[kind]
    const mode = (SYNC_MODES as readonly unknown[]).includes(c.mode) ? c.mode as SyncMode : prev?.mode
    const [lo, hi] = SYNC_LIMITS[kind]
    const every = typeof c.every === 'number' && Number.isInteger(c.every) && c.every >= lo && c.every <= hi ? c.every : prev?.every
    if (mode && every) out[kind] = { mode, every }
  }
  return out
}

/** 간격을 사람이 읽는 말로 (30초 · 5분 · 1시간 · 하루) */
export function syncEveryLabel(sec: number, ko = true): string {
  if (sec % 86400 === 0) return ko ? (sec === 86400 ? '하루' : `${sec / 86400}일`) : (sec === 86400 ? '1 day' : `${sec / 86400} days`)
  if (sec % 3600 === 0) return ko ? `${sec / 3600}시간` : `${sec / 3600} h`
  if (sec % 60 === 0) return ko ? `${sec / 60}분` : `${sec / 60} min`
  return ko ? `${sec}초` : `${sec} s`
}
