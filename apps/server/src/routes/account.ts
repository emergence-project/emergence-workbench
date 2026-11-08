// 계정: 앱 안의 GitHub 로그인 (githubAccount.ts, 설정 › 계정)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/account'
import { replies } from '../contract.js'
import type { GithubAccount } from '../githubAccount.js'

export function registerAccount(app: FastifyInstance, account: GithubAccount): void {
  app.get('/api/account', replies(C.AccountView), async (): Promise<C.AccountView> => account.view())
  /** 기기 코드를 받아 보인다. 사용자가 GitHub에서 승인하면 서버가 알아채고 'account' 알림을 보낸다 */
  app.post('/api/account/login', replies(C.AccountView), async (): Promise<C.AccountView> => account.start())
  app.post('/api/account/cancel', replies(C.AccountView), async (): Promise<C.AccountView> => account.cancel())
  app.post('/api/account/logout', replies(C.AccountView), async (): Promise<C.AccountView> => account.logout())
}
