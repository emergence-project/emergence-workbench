// ---------- 화면 설정 (서버 routes/settings.ts) ----------
import type { SettingsBody, SettingsView } from '@rw/core/contract/settings'
import { json, req, send } from './http'

export const settingsCalls = {
  settings: () => req('/api/settings').then((r) => json<SettingsView>(r)).then((r) => r.ui),
  saveSettings: (ui: SettingsBody['ui']) => req('/api/settings', send('PUT', { ui })).then((r) => json<SettingsView>(r)).then((r) => r.ui),
}
