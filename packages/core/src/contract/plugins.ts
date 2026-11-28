/**
 * 설정 › 기능의 계약 (내장 플러그인 설치 · 제거, 서버 routes/plugins.ts · 화면 api/plugins.ts).
 * 이름표는 @rw/core의 plugins/manifest.ts, 설치 상태는 이 컴퓨터의 config.yaml `plugins:`.
 */
import { z } from 'zod'
import { PLUGIN_STAGES } from '../plugins/manifest.js'

const Text = z.object({ ko: z.string(), en: z.string() }).strict()

export const PluginRow = z.object({
  id: z.string(),
  name: Text,
  summary: Text,
  stage: z.enum(PLUGIN_STAGES),
  /** 규칙 목록(소개 › 연구)의 그 줄 id */
  rule: z.string().optional(),
  installed: z.boolean(),
  /** 설치 상태를 마지막으로 바꾼 때. 바꾼 적이 없으면 없다(기본값) */
  at: z.string().optional(),
  requires: z.array(z.string()),
  /** 설치된 다른 플러그인이 이것을 필요로 하면 그 id들 (제거 버튼을 잠근다) */
  requiredBy: z.array(z.string()),
  keeps: z.array(z.string()),
}).strict()

/** GET /plugins, PUT /plugins/:id */
export const PluginsView = z.object({ plugins: z.array(PluginRow) }).strict()

// ---------- 요청 ----------
export const PluginBody = z.object({ installed: z.boolean() }).strict()

export type PluginRow = z.infer<typeof PluginRow>
export type PluginsView = z.infer<typeof PluginsView>
export type PluginBody = z.infer<typeof PluginBody>
