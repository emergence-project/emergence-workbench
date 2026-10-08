// ---------- 그림 라이브러리 (서버 routes/figures.ts) ----------
import { enc, json, req, send } from './http'

export type FigureKind = 'tikz' | 'svg' | 'png' | 'jpg' | 'pdf'
export interface FigureUse { rid?: string; type: 'note' | 'calc' | 'block' | 'concept'; id: string; file: string; title: string }
export interface FigureRow {
  subjects?: string[]
  subjectsHash?: string
  /** <scope>/<파일 이름> */
  id: string
  /** 'library'(공용) 또는 프로젝트 id */
  scope: string
  file: string
  name: string
  kind: FigureKind
  description?: string
  /** 저장소 이름부터 적은 경로 */
  path: string
  mtime: number
  uses: FigureUse[]
  /** tikz를 그림으로 바꾸려다 실패함 */
  broken?: true
}
/** 그림 첫 화면 (GET /api/figures/brief) */
export interface FigureBrief {
  total: number
  projects: { id: string; title: string }[]
  recent: FigureRow[]
  check: { broken: number }
  stats: { tikz: number; svg: number; photo: number; pdf: number; unused: number; unclassified?: number }
  store: { library: number; projects: number; inProjects: number }
}
export interface FigureList { library: string | null; projects: { id: string; title: string }[]; figures: FigureRow[] }
export const LIBRARY_SCOPE = 'library'

export const figuresApi = {
  list: () => req('/api/figures').then((r) => json<FigureList>(r)),
  brief: (recent = 8) => req(`/api/figures/brief?recent=${recent}`).then((r) => json<FigureBrief>(r)),
  /** 그림 파일 (tikz는 SVG로 바꾼 것). v: 고친 때 (캐시 깨기) */
  fileUrl: (id: string, v?: number) => `/api/figures/file?id=${enc(id)}${v ? `&v=${Math.round(v)}` : ''}`,
  /** 노트의 ![[이름]]: 그 프로젝트 전용 먼저, 그다음 공용 */
  embedUrl: (name: string, rid?: string) => `/api/figures/embed?name=${enc(name)}${rid ? `&rid=${enc(rid)}` : ''}`,
  upload: (file: File, scope: string) => req(`/api/figures/upload?scope=${enc(scope)}&name=${enc(file.name)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file })
    .then((r) => json<{ id: string }>(r)),
  setMeta: (id: string, patch: { name?: string; description?: string }) => req('/api/figures/meta', send('PATCH', { id, ...patch })).then((r) => json<{ ok: true }>(r)),
  /** 원본 고치기 (맥 기본 앱) · Finder에서 보기 */
  open: (id: string, reveal = false) => req('/api/figures/open', send('POST', { id, reveal })).then((r) => json<{ ok: true }>(r)),
}
