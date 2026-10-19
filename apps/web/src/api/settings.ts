// ---------- 화면 설정 (서버 routes/settings.ts) ----------
import type { AgentSettings, AgentSettingsBody, CommonRulesSaved, CommonRulesView, SettingsBody, SettingsView, SyncSettingsBody, SyncSettingsView } from '@rw/core/contract/settings'
import { json, req, send } from './http'

export type { CommonRulesView } from '@rw/core/contract/settings'

export const settingsCalls = {
  settings: () => req('/api/settings').then((r) => json<SettingsView>(r)).then((r) => r.ui),
  agentSettings: () => req('/api/settings/agents').then((r) => json<AgentSettings>(r)),
  saveAgentSettings: (patch: AgentSettingsBody) => req('/api/settings/agents', send('PUT', patch)).then((r) => json<AgentSettings>(r)),
  /** 설정 › 동기화 (10/19) */
  syncSettings: () => req('/api/settings/sync').then((r) => json<SyncSettingsView>(r)),
  saveSyncSettings: (patch: SyncSettingsBody) => req('/api/settings/sync', send('PUT', patch)).then((r) => json<SyncSettingsView>(r)),
  /** 설정 › 공통 규칙: 개인 저장소 사본의 rules/research.md */
  commonRules: () => req('/api/settings/common-rules').then((r) => json<CommonRulesView>(r)),
  saveCommonRules: (body: string, baseHash: string) => req('/api/settings/common-rules', send('PUT', { body, baseHash })).then((r) => json<CommonRulesSaved>(r)),
  saveSettings: (ui: SettingsBody['ui']) => req('/api/settings', send('PUT', { ui })).then((r) => json<SettingsView>(r)).then((r) => r.ui),
}
