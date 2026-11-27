/** 흐름 플러그인의 이름표 (서버 · 화면이 함께 읽는다) */
import type { PluginManifest } from '../manifest.js'

export const FLOW_MANIFEST: PluginManifest = {
  id: 'flow',
  name: { ko: '흐름', en: 'Flow' },
  summary: { ko: '질문 하나 아래에 주장과 그 근거인 시도를 쌓는 연구 흐름', en: 'A research flow: one question, the claims under it, and the attempts that ground them' },
  stage: 'experiment',
  rule: 'flow',
  installedByDefault: true,
  keeps: ['workbench/problems/'],
}
