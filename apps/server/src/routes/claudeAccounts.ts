// Claude 계정 여럿 (11/16 사용자 "pro 계정을 주로 답변용으로" · "로그인 정보를 담아두고 쉽게 전환"): 설정 › 에이전트의 계정 목록 · 로그인 · 대화 종류마다 계정
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/claudeAccounts'
import type { ClaudeAccounts } from '../claudeAccounts.js'
import { parseBody, replies } from '../contract.js'

/** sample: 예제 모드 · 시험이면 이 컴퓨터의 실제 계정을 보이지 않는다 (그림 · CI 산출물에 남지 않게) */
export function registerClaudeAccounts(app: FastifyInstance, accounts: ClaudeAccounts, sample: boolean): void {
  const shown = (s: C.ClaudeAccounts): C.ClaudeAccounts => sample
    ? { ...s, accounts: s.accounts.map(({ email: _e, plan: _p, ...a }, i) => ({ ...a, login: true, email: i ? `name${i + 1}@example.com` : 'name@example.com', plan: i ? 'Pro' : 'Max' })) }
    : s
  app.get('/api/claude-accounts', replies(C.ClaudeAccounts), async (): Promise<C.ClaudeAccounts> => shown(accounts.state()))
  /** 계정을 더하고 로그인을 시작한다 (브라우저가 열린다) */
  app.post('/api/claude-accounts', replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.add(parseBody(C.AddAccountBody, req.body).name)))
  app.post<{ Params: { id: string } }>('/api/claude-accounts/:id/login', replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.login(req.params.id)))
  /** 브라우저가 코드를 보여 주면 그 코드를 넘긴다 */
  app.post<{ Params: { id: string } }>('/api/claude-accounts/:id/code', replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.code(req.params.id, parseBody(C.AccountCodeBody, req.body).code)))
  app.post('/api/claude-accounts/roles', replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => {
    const b = parseBody(C.AccountRolesBody, req.body)
    return shown(accounts.setRole(b.role, b.id))
  })
  app.delete<{ Params: { id: string } }>('/api/claude-accounts/:id', replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.remove(req.params.id)))
  app.addHook('onClose', async () => accounts.stopAll())
}
