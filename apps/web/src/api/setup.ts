// ---------- 시작 준비 (설정 › 계정, 홈 카드, 서버 routes/setup.ts) ----------
import type { SetupFetchBody, SetupGitBody, SetupLibraryBody, SetupPersonalBody, SetupPersonalCreateBody, SetupView } from '@rw/core/contract/setup'
import { json, req, send } from './http'

export type { SetupView } from '@rw/core/contract/setup'
export const setupApi = {
  get: () => req('/api/setup').then((r) => json<SetupView>(r)),
  setGit: (body: SetupGitBody) => req('/api/setup/git', send('PUT', body)).then((r) => json<SetupView>(r)),
  fetchProject: (body: SetupFetchBody) => req('/api/setup/fetch', send('POST', body)).then((r) => json<SetupView>(r)),
  setLibrary: (body: SetupLibraryBody) => req('/api/setup/library', send('PUT', body)).then((r) => json<SetupView>(r)),
  createPersonal: (body: SetupPersonalCreateBody) => req('/api/setup/personal/create', send('POST', body)).then((r) => json<SetupView>(r)),
  setPersonal: (body: SetupPersonalBody) => req('/api/setup/personal', send('PUT', body)).then((r) => json<SetupView>(r)),
}
