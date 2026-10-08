// ---------- 화면 설정 (서버 routes/settings.ts) ----------
import type { UiSettings } from '@rw/core'
import { json, req, send } from './http'

export const settingsCalls = {
  settings: () => req('/api/settings').then((r) => json<{ ui: UiSettings }>(r)).then((r) => r.ui),
  saveSettings: (ui: Partial<UiSettings>) => req('/api/settings', send('PUT', { ui })).then((r) => json<{ ui: UiSettings }>(r)).then((r) => r.ui),
}
