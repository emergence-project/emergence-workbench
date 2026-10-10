// ---------- 구글 계정 (로그인 · 달력 · 설정 동기화, 서버 google.ts) ----------
import type { GoogleEvents, GooglePushed, GoogleRestored, GoogleStatus, GoogleSync } from '@rw/core/contract/google'
import { enc, json, req, send } from './http'

export type { GoogleEvent, GoogleStatus, GoogleSync, SyncedResearch } from '@rw/core/contract/google'

export const googleApi = {
  status: () => req('/api/google').then((r) => json<GoogleStatus>(r)),
  setClient: (clientId: string, clientSecret: string) => req('/api/google/client', send('PUT', { clientId, clientSecret })).then((r) => json<GoogleStatus>(r)),
  /** 구글 로그인 화면으로 간다 (서버가 돌려보냄). 끝나면 returnTo로 돌아온다 */
  connectUrl: (returnTo = '/#/settings') => `/api/google/connect?return=${enc(returnTo)}`,
  disconnect: () => req('/api/google/disconnect', { method: 'POST' }).then((r) => json<GoogleStatus>(r)),
  events: (from: string, to: string) => req(`/api/google/events?from=${from}&to=${to}`).then((r) => json<GoogleEvents>(r)),
  sync: () => req('/api/google/sync').then((r) => json<GoogleSync>(r)),
  push: () => req('/api/google/sync/push', { method: 'POST' }).then((r) => json<GooglePushed>(r)),
  restore: () => req('/api/google/sync/restore', { method: 'POST' }).then((r) => json<GoogleRestored>(r)),
}
