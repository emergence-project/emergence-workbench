// ---------- 파일 이력 (노트 툴바 시계, 서버 routes/history.ts) ----------
import { json, req } from './http'
import type { FileHistory, FileVersions } from '@rw/core/contract/history'

export type { FileCommit, FileHistory, FileVersions } from '@rw/core/contract/history'

const enc = encodeURIComponent
export const fileHistory = (rid: string, path: string) => req(`/api/researches/${enc(rid)}/history?path=${enc(path)}`).then((r) => json<FileHistory>(r))
export const fileVersions = (rid: string, path: string, to: string, from?: string) =>
  req(`/api/researches/${enc(rid)}/history/versions?path=${enc(path)}&to=${enc(to)}${from ? `&from=${enc(from)}` : ''}`).then((r) => json<FileVersions>(r))
