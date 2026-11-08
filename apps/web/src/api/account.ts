// ---------- 계정: 앱 안의 GitHub 로그인 (서버 routes/account.ts · githubAccount.ts) ----------
import type { AccountView } from '@rw/core/contract/account'
import { json, req } from './http'

export type { AccountSyncView, AccountView } from '@rw/core/contract/account'
export const accountApi = {
  get: () => req('/api/account').then((r) => json<AccountView>(r)),
  /** 기기 코드를 받는다. 사용자가 GitHub에서 승인하면 'account' 알림이 온다 */
  login: () => req('/api/account/login', { method: 'POST' }).then((r) => json<AccountView>(r)),
  cancel: () => req('/api/account/cancel', { method: 'POST' }).then((r) => json<AccountView>(r)),
  logout: () => req('/api/account/logout', { method: 'POST' }).then((r) => json<AccountView>(r)),
  /** 설치판: 계정의 비공개 저장소와 지금 동기화한다 (끝날 때까지 기다린다) */
  sync: () => req('/api/account/sync', { method: 'POST' }).then((r) => json<AccountView>(r)),
}
