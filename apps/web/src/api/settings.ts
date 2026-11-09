// ---------- 화면 설정 (서버 routes/settings.ts) ----------
import type { AgentSettings, AgentSettingsBody, AiKeyBody, AiKeyView, CodexStatus, CommonRulesSaved, CommonRulesView, SettingsBody, SettingsView, SyncSettingsBody, SyncSettingsView } from '@rw/core/contract/settings'
import { json, req, send } from './http'

export type { CommonRulesView } from '@rw/core/contract/settings'

export const settingsCalls = {
  settings: () => req('/api/settings').then((r) => json<SettingsView>(r)).then((r) => r.ui),
  /** 설정 › 에이전트 › AI 키 (11/8): 키는 보내기만 하고 받을 때는 끝 네 자만 */
  aiKey: () => req('/api/settings/ai-key').then((r) => json<AiKeyView>(r)).then((r) => r.key),
  saveAiKey: (body: AiKeyBody) => req('/api/settings/ai-key', send('PUT', body)).then((r) => json<AiKeyView>(r)).then((r) => r.key),
  removeAiKey: () => req('/api/settings/ai-key', { method: 'DELETE' }).then((r) => json<AiKeyView>(r)).then((r) => r.key),
  codexStatus: () => req('/api/settings/codex').then((r) => json<CodexStatus>(r)),
  installCodex: () => req('/api/settings/codex/install', { method: 'POST' }).then((r) => json<CodexStatus>(r)),
  loginCodex: () => req('/api/settings/codex/login', { method: 'POST' }).then((r) => json<CodexStatus>(r)),
  /** 「다른 계정으로」: 로그아웃한 뒤 브라우저에서 다시 로그인 (11/9) */
  switchCodex: () => req('/api/settings/codex/switch', { method: 'POST' }).then((r) => json<CodexStatus>(r)),
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
