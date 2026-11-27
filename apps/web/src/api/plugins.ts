// ---------- 설정 › 기능: 내장 플러그인 설치 · 제거 (서버 routes/plugins.ts) ----------
import type { PluginsView } from '@rw/core/contract/plugins'
import { json, req, send } from './http'

export type { PluginRow, PluginsView } from '@rw/core/contract/plugins'

export const pluginsCalls = {
  plugins: () => req('/api/plugins').then((r) => json<PluginsView>(r)),
  setPlugin: (id: string, installed: boolean) => req(`/api/plugins/${encodeURIComponent(id)}`, send('PUT', { installed })).then((r) => json<PluginsView>(r)),
}
