/**
 * 화면의 플러그인 등록부 (내장 플러그인, @rw/core plugins/manifest.ts).
 * 본체 화면은 플러그인 폴더를 직접 부르지 않고 이 파일만 부른다. 플러그인은 `plugins/<id>/`에 두고 아래 목록에 늘어놓는다.
 * 설치돼 있는지는 서버(GET /api/plugins)가 정한다. 꽂는 자리(페이지 · 사이드바 줄 · 내 차례 …)는 옮기는 단계마다 칸으로 더한다.
 */
import type { PluginManifest } from '@rw/core'

export interface WebPlugin {
  manifest: PluginManifest
}

/** 앱에 함께 들어 있는 플러그인. 아직 옮긴 기능이 없어 비어 있다 (1단계: 뼈대) */
export const WEB_PLUGINS: readonly WebPlugin[] = []
