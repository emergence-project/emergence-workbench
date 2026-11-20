// Claude 계정 여럿 (11/16 사용자 "pro 계정을 주로 답변용으로" · "로그인 정보를 담아두고 쉽게 전환"): 설정 › 에이전트의 계정 목록 · 로그인 · 대화 종류마다 계정
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/claudeAccounts'
import type { ClaudeAccounts } from '../claudeAccounts.js'
import { parseBody, replies } from '../contract.js'
import { setDeviceAccounts } from '../devices.js'

/** sample: 예제 모드 · 시험이면 이 컴퓨터의 실제 계정을 보이지 않는다 (그림 · CI 산출물에 남지 않게) */
/** Codex 계정 (11/20 시안 4절)은 같은 모양으로 /api/codex-accounts에 */
export function registerClaudeAccounts(app: FastifyInstance, accounts: ClaudeAccounts, sample: boolean): void {
  // 예제 한도: 첫 계정은 반쯤, 둘째는 80%를 넘겨 주황, 셋째부터 아직 모름 (그림에 막대가 보이게)
  const LIMITS: (C.ClaudeAccountRow['limits'])[] = [
    { five: { used: 34, resetsAt: '2026-10-21T14:00:00.000Z' }, week: { used: 62, resetsAt: '2026-10-24T00:00:00.000Z' }, at: '2026-10-21T10:00:00.000Z' },
    { five: { used: 86, resetsAt: '2026-10-21T13:00:00.000Z' }, week: { used: 41, resetsAt: '2026-10-25T00:00:00.000Z' }, at: '2026-10-21T10:00:00.000Z' },
  ]
  const shown = (s: C.ClaudeAccounts): C.ClaudeAccounts => sample
    ? { ...s, accounts: s.accounts.map(({ email: _e, plan: _p, limits: _l, ...a }, i) => ({ ...a, login: true, email: i ? `name${i + 1}@example.com` : 'name@example.com', plan: s.kind === 'codex' ? 'Plus' : i ? 'Pro' : 'Max', ...(LIMITS[i] && { limits: LIMITS[i] }) })) }
    : s
  // 서버 › 기기에 올릴 로그인한 계정 (이름 · 요금제만, devices.ts)
  if (!sample) setDeviceAccounts(accounts.kind, () => accounts.state().accounts.filter((a) => a.login).map((a) => ({ kind: accounts.kind, ...(a.id !== C.DEFAULT_ACCOUNT && { name: a.name }), ...(a.plan && { plan: a.plan }) })))
  const base = accounts.kind === 'codex' ? '/api/codex-accounts' : '/api/claude-accounts'
  app.get(base, replies(C.ClaudeAccounts), async (): Promise<C.ClaudeAccounts> => shown(accounts.state()))
  /** 계정을 더하고 로그인을 시작한다 (브라우저가 열린다) */
  app.post(base, replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.add(parseBody(C.AddAccountBody, req.body).name)))
  app.post<{ Params: { id: string } }>(`${base}/:id/login`, replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.login(req.params.id)))
  /** 브라우저가 코드를 보여 주면 그 코드를 넘긴다 */
  app.post<{ Params: { id: string } }>(`${base}/:id/code`, replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.code(req.params.id, parseBody(C.AccountCodeBody, req.body).code)))
  app.post(`${base}/roles`, replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => {
    const b = parseBody(C.AccountRolesBody, req.body)
    return shown(accounts.setRole(b.role, b.id))
  })
  app.delete<{ Params: { id: string } }>(`${base}/:id`, replies(C.ClaudeAccounts), async (req): Promise<C.ClaudeAccounts> => shown(accounts.remove(req.params.id)))
  app.addHook('onClose', async () => accounts.stopAll())
}
