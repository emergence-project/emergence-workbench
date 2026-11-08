// ---------- 시작 준비 (설정 › 계정, 홈 카드, 서버 routes/setup.ts) ----------
import type { McpAgentKey, SetupFetchBody, SetupGitBody, SetupLibraryBody, SetupPersonalBody, SetupPersonalCreateBody, SetupView } from '@rw/core/contract/setup'
import { json, req, send } from './http'

export type { SetupView } from '@rw/core/contract/setup'
export const setupApi = {
  get: () => req('/api/setup').then((r) => json<SetupView>(r)),
  setGit: (body: SetupGitBody) => req('/api/setup/git', send('PUT', body)).then((r) => json<SetupView>(r)),
  fetchProject: (body: SetupFetchBody) => req('/api/setup/fetch', send('POST', body)).then((r) => json<SetupView>(r)),
  setLibrary: (body: SetupLibraryBody) => req('/api/setup/library', send('PUT', body)).then((r) => json<SetupView>(r)),
  createPersonal: (body: SetupPersonalCreateBody) => req('/api/setup/personal/create', send('POST', body)).then((r) => json<SetupView>(r)),
  setPersonal: (body: SetupPersonalBody) => req('/api/setup/personal', send('PUT', body)).then((r) => json<SetupView>(r)),
  /** 바깥 에이전트(Claude 앱 · Claude Code · Codex)에 이 앱의 MCP 입구를 등록 */
  registerAgent: (key: McpAgentKey) => req(`/api/setup/agents/${key}/register`, send('POST', {})).then((r) => json<SetupView>(r)),
}
