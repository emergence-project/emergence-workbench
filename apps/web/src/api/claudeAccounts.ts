import type { AccountRole, ClaudeAccounts } from '@rw/core/contract/claudeAccounts'
import { enc, json, req, send } from './http'

/** Claude 계정 여럿 (11/16): 설정 › 에이전트. 타입은 서버와 같은 계약에서 (packages/core/src/contract/claudeAccounts.ts) */
export type { AccountRole, ClaudeAccounts, ClaudeAccountRow } from '@rw/core/contract/claudeAccounts'

export const claudeAccountsApi = {
  get: () => req('/api/claude-accounts').then((r) => json<ClaudeAccounts>(r)),
  /** 더하고 로그인을 시작한다 (브라우저가 열린다) */
  add: (name: string) => req('/api/claude-accounts', send('POST', { name })).then((r) => json<ClaudeAccounts>(r)),
  login: (id: string) => req(`/api/claude-accounts/${enc(id)}/login`, { method: 'POST' }).then((r) => json<ClaudeAccounts>(r)),
  code: (id: string, code: string) => req(`/api/claude-accounts/${enc(id)}/code`, send('POST', { code })).then((r) => json<ClaudeAccounts>(r)),
  setRole: (role: AccountRole, id: string) => req('/api/claude-accounts/roles', send('POST', { role, id })).then((r) => json<ClaudeAccounts>(r)),
  remove: (id: string) => req(`/api/claude-accounts/${enc(id)}`, { method: 'DELETE' }).then((r) => json<ClaudeAccounts>(r)),
}
