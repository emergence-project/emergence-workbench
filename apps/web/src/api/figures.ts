// ---------- 그림 라이브러리 (서버 routes/figures.ts) ----------
import type { FigureAdded, FigureBrief, FigureList, FigureOk } from '@rw/core/contract/figures'
import { enc, json, req, send } from './http'

export type { FigureKind, FigureUse, FigureRow, FigureBrief, FigureList } from '@rw/core/contract/figures'
/** 공용 그림의 scope (계약 LIBRARY_SCOPE와 같다. 화면 번들에 zod를 넣지 않으려고 값은 여기 둔다) */
export const LIBRARY_SCOPE = 'library'

export const figuresApi = {
  list: () => req('/api/figures').then((r) => json<FigureList>(r)),
  brief: (recent = 8) => req(`/api/figures/brief?recent=${recent}`).then((r) => json<FigureBrief>(r)),
  /** 그림 파일 (tikz는 SVG로 바꾼 것). v: 고친 때 (캐시 깨기) */
  fileUrl: (id: string, v?: number) => `/api/figures/file?id=${enc(id)}${v ? `&v=${Math.round(v)}` : ''}`,
  /** 노트의 ![[이름]]: 그 프로젝트 전용 먼저, 그다음 공용 */
  embedUrl: (name: string, rid?: string) => `/api/figures/embed?name=${enc(name)}${rid ? `&rid=${enc(rid)}` : ''}`,
  upload: (file: File, scope: string) => req(`/api/figures/upload?scope=${enc(scope)}&name=${enc(file.name)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file })
    .then((r) => json<FigureAdded>(r)),
  setMeta: (id: string, patch: { name?: string; description?: string }) => req('/api/figures/meta', send('PATCH', { id, ...patch })).then((r) => json<FigureOk>(r)),
  /** 원본 고치기 (맥 기본 앱) · Finder에서 보기 */
  open: (id: string, reveal = false) => req('/api/figures/open', send('POST', { id, reveal })).then((r) => json<FigureOk>(r)),
}
