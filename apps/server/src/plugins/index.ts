/**
 * 서버의 플러그인 등록부 (내장 플러그인, @rw/core plugins/manifest.ts).
 * 본체는 플러그인 폴더를 직접 부르지 않고 이 파일만 부른다. 플러그인은 `plugins/<id>/`에 두고 아래 목록에 평범한 import로 늘어놓는다.
 * 꽂는 자리(API · MCP 도구 · 현황 절 …)는 옮기는 단계마다 ServerPlugin에 칸으로 더한다 (설계: 둘째 기능이 실제로 필요로 할 때만 늘린다).
 */
import { pluginInstalled, type PluginManifest, type PluginStates } from '@rw/core'

export interface ServerPlugin {
  manifest: PluginManifest
}

/** 앱에 함께 들어 있는 플러그인. 아직 옮긴 기능이 없어 비어 있다 (1단계: 뼈대) */
export const SERVER_PLUGINS: readonly ServerPlugin[] = []

/** 이 컴퓨터에서 id가 설치돼 있는지. 모르는 id는 false */
export function isPluginOn(list: readonly ServerPlugin[], states: PluginStates, id: string): boolean {
  const p = list.find((x) => x.manifest.id === id)
  return !!p && pluginInstalled(p.manifest, states)
}
