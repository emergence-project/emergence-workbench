/**
 * 내장 플러그인의 이름표와 설치 상태 (2026-11-27 사용자 결정 "실험 기능을 플러그인으로 설치 · 제거, 컴퓨터마다").
 *
 * 플러그인 코드는 앱에 함께 들어 있고, 「제거」는 등록을 건너뛰는 것이다(파일 · 브랜치를 지우지 않는다).
 * 이름표는 서버와 화면이 함께 읽도록 여기(core)에 두고, 기능마다 `plugins/<id>/`에 모은다.
 * 등록부는 서버 `apps/server/src/plugins/index.ts`와 화면 `apps/web/src/plugins/index.ts` 둘이고, 본체는 그 둘만 부른다.
 * 설치 상태는 이 컴퓨터의 앱 설정(config.yaml)의 `plugins:`에 `{ <id>: { installed, at } }`로 적는다.
 */

export const PLUGIN_STAGES = ['experiment', 'stable'] as const
export type PluginStage = (typeof PLUGIN_STAGES)[number]

export interface PluginText { ko: string; en: string }

export interface PluginManifest {
  /** 설치 상태의 키. 소문자 · 숫자 · - */
  id: string
  name: PluginText
  /** 설정 › 기능의 한 줄 설명 */
  summary: PluginText
  stage: PluginStage
  /** docs/rules/registry.json의 그 줄 id (다시 볼 날과 판단은 거기서 읽는다) */
  rule?: string
  /** 설치 상태를 적은 적이 없을 때 설치돼 있는지 */
  installedByDefault: boolean
  /** 이 플러그인이 쓰는 다른 플러그인 (토론은 단체방) */
  requires?: string[]
  /** 제거해도 남는 파일 (연구 저장소 안의 경로 무늬, 설정 › 기능에 보인다) */
  keeps?: string[]
}

export interface PluginState {
  installed: boolean
  /** 마지막으로 바꾼 때. 나중에 두 맥의 상태를 맞출 때 더 늦게 바꾼 쪽을 따른다 */
  at: string
}
export type PluginStates = Record<string, PluginState>

export const PLUGIN_ID = /^[a-z0-9][a-z0-9-]*$/

/** config.yaml의 `plugins:`를 믿지 않고 읽는다. 모양이 틀린 줄은 버린다(그 플러그인은 기본값을 쓴다) */
export function normalizePluginStates(raw: unknown): PluginStates {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: PluginStates = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!PLUGIN_ID.test(id) || !v || typeof v !== 'object') continue
    const { installed, at } = v as Record<string, unknown>
    if (typeof installed !== 'boolean' || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) continue
    out[id] = { installed, at }
  }
  return out
}

export function pluginInstalled(m: PluginManifest, states: PluginStates): boolean {
  return states[m.id]?.installed ?? m.installedByDefault
}

export type PluginChange =
  | { ok: true; states: PluginStates; changed: string[] }
  | { ok: false; reason: 'unknown'; id: string }
  | { ok: false; reason: 'required'; id: string; by: string[] }

/**
 * 설치 · 제거를 계산한다(저장은 부르는 쪽). 설치하면 필요한 플러그인도 함께 설치하고,
 * 설치된 다른 플러그인이 필요로 하는 것은 제거하지 않는다(설정 › 기능은 그 버튼을 잠그고 이유를 적는다).
 */
export function changePlugin(list: readonly PluginManifest[], states: PluginStates, id: string, installed: boolean, now: string): PluginChange {
  const byId = new Map(list.map((m) => [m.id, m]))
  const target = byId.get(id)
  if (!target) return { ok: false, reason: 'unknown', id }
  if (!installed) {
    const by = requiredBy(list, states, id)
    if (by.length) return { ok: false, reason: 'required', id, by }
    return { ok: true, states: { ...states, [id]: { installed: false, at: now } }, changed: [id] }
  }
  const next = { ...states }
  const changed: string[] = []
  const visit = (m: PluginManifest, seen: Set<string>): void => {
    if (seen.has(m.id)) return
    seen.add(m.id)
    if (!pluginInstalled(m, next) || m.id === id) { next[m.id] = { installed: true, at: now }; changed.push(m.id) }
    for (const r of m.requires ?? []) { const dep = byId.get(r); if (dep) visit(dep, seen) }
  }
  visit(target, new Set())
  return { ok: true, states: next, changed }
}

/** 지금 설치된 플러그인 가운데 id를 필요로 하는 것 */
export function requiredBy(list: readonly PluginManifest[], states: PluginStates, id: string): string[] {
  return list.filter((m) => m.id !== id && (m.requires ?? []).includes(id) && pluginInstalled(m, states)).map((m) => m.id)
}
