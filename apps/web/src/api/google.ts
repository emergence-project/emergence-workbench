// ---------- 구글 계정 (로그인 · 달력 · 설정 동기화, 서버 google.ts) ----------
import { enc, json, req, send } from './http'

export interface GoogleStatus {
  configured: boolean; connected: boolean; email?: string; mock: boolean; synced: boolean; clientId?: string
  lastPush?: { at: string; error?: string } | null
}
export interface GoogleEvent { id: string; calendar: string; title: string; date: string; endDate: string; time?: string; endTime?: string; location?: string; link?: string }
export interface SyncedResearch { id: string; title: string; tags: string[]; remote: string | null; folder: string }
export interface GoogleSync {
  remote: { savedAt: string; machine: string; researches: SyncedResearch[] } | null
  missing: SyncedResearch[]
  matched: { remote: SyncedResearch; localId: string }[]
  localCount: number
}

export const googleApi = {
  status: () => req('/api/google').then((r) => json<GoogleStatus>(r)),
  setClient: (clientId: string, clientSecret: string) => req('/api/google/client', send('PUT', { clientId, clientSecret })).then((r) => json<GoogleStatus>(r)),
  /** 구글 로그인 화면으로 간다 (서버가 돌려보냄). 끝나면 returnTo로 돌아온다 */
  connectUrl: (returnTo = '/#/settings') => `/api/google/connect?return=${enc(returnTo)}`,
  disconnect: () => req('/api/google/disconnect', { method: 'POST' }).then((r) => json<GoogleStatus>(r)),
  events: (from: string, to: string) => req(`/api/google/events?from=${from}&to=${to}`).then((r) => json<{ connected: boolean; events: GoogleEvent[] }>(r)),
  sync: () => req('/api/google/sync').then((r) => json<GoogleSync>(r)),
  push: () => req('/api/google/sync/push', { method: 'POST' }).then((r) => json<{ ok: true }>(r)),
  restore: () => req('/api/google/sync/restore', { method: 'POST' }).then((r) => json<{ ok: true; restored: number; missing: SyncedResearch[] }>(r)),
}
