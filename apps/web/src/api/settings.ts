// ---------- 화면 설정 (서버 routes/settings.ts) ----------
import type { AgentSettings, AgentSettingsBody, SettingsBody, SettingsView } from '@rw/core/contract/settings'
import { json, req, send } from './http'

export const settingsCalls = {
  settings: () => req('/api/settings').then((r) => json<SettingsView>(r)).then((r) => r.ui),
  agentSettings: () => req('/api/settings/agents').then((r) => json<AgentSettings>(r)),
  saveAgentSettings: (patch: AgentSettingsBody) => req('/api/settings/agents', send('PUT', patch)).then((r) => json<AgentSettings>(r)),
  saveSettings: (ui: SettingsBody['ui']) => req('/api/settings', send('PUT', { ui })).then((r) => json<SettingsView>(r)).then((r) => r.ui),
}
