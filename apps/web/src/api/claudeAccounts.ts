import type { AccountKind, AccountRole, ClaudeAccounts } from '@rw/core/contract/claudeAccounts'
import { enc, json, req, send } from './http'

/** Claude 계정 여럿 (11/16) · Codex 계정 여럿 (11/20 시안 4절): 계정 페이지. 타입은 서버와 같은 계약에서 (packages/core/src/contract/claudeAccounts.ts) */
export type { AccountKind, AccountRole, ClaudeAccounts, ClaudeAccountRow, LimitWindow } from '@rw/core/contract/claudeAccounts'

const accountsApi = (kind: AccountKind) => {
  const base = kind === 'codex' ? '/api/codex-accounts' : '/api/claude-accounts'
  return {
    get: () => req(base).then((r) => json<ClaudeAccounts>(r)),
    /** 더하고 로그인을 시작한다 (브라우저가 열린다) */
    add: (name: string) => req(base, send('POST', { name })).then((r) => json<ClaudeAccounts>(r)),
    login: (id: string) => req(`${base}/${enc(id)}/login`, { method: 'POST' }).then((r) => json<ClaudeAccounts>(r)),
    code: (id: string, code: string) => req(`${base}/${enc(id)}/code`, send('POST', { code })).then((r) => json<ClaudeAccounts>(r)),
    setRole: (role: AccountRole | 'base', id: string) => req(`${base}/roles`, send('POST', { role, id })).then((r) => json<ClaudeAccounts>(r)),
    remove: (id: string) => req(`${base}/${enc(id)}`, { method: 'DELETE' }).then((r) => json<ClaudeAccounts>(r)),
  }
}
export const claudeAccountsApi = accountsApi('claude')
export const codexAccountsApi = accountsApi('codex')
