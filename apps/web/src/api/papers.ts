// ---------- 논문 라이브러리 (서버 routes/papers.ts) ----------
import type { CommentFile, CommentKind, CommentState } from './comments'
import { enc, json, req, send } from './http'

export type PdfWhere = 'local' | 'cloud' | 'none'
export interface PaperRow {
  subjects?: string[]
  subjectsHash?: string
  key: string
  /** bib 항목 종류 (article, book …) */
  type: string
  kind: 'paper' | 'book'
  title: string
  /** 성만 */
  authors: string[]
  year?: string
  venue?: string
  eprint?: string
  doi?: string
  projects: string[]
  /** 프로젝트 bib에서 저절로 이어진 것 (뺄 수 없음) */
  autoProjects: string[]
  pdf: { where: PdfWhere; file?: string }
  comments: number
  waiting: number
  /** 답이 왔고 아직 끝내지 않은 질문 수 (사용자 차례) */
  answered: number
  /** references.bib에서 몇 번째 항목인지 (0부터, 큰 것이 최근에 더한 것) */
  added: number
  opened?: number
  note?: string
}
export interface PaperProject { id: string; title: string }
export interface PaperList { library: string | null; folders: string[]; projects: PaperProject[]; papers: PaperRow[] }
/** 논문 첫 화면 (GET /api/papers/brief) */
export interface PaperBrief {
  library: boolean
  total: number
  recent: PaperRow[]
  projects: PaperProject[]
  check: { noFolder: boolean; answered: number }
  stats: { noPdf: number; arxiv: number; unlinked: number; papers: number; books: number; unclassified?: number }
  folders: { path: string; cloud: 'icloud' | 'drive' | 'local' }[]
}
export interface PaperFolder { path: string; exists: boolean; cloud: PaperBrief['folders'][number]['cloud'] }
export interface PaperAdded { key: string; existed: boolean; pdf?: string; pdfError?: string }

export type PaintColor = 'yellow' | 'green' | 'blue' | 'pink'
export interface PaperHighlight { id: string; page: number; rects: number[][]; pageHeight: number; color: PaintColor; quote?: string }
/** 논문의 코멘트 파일: 연구노트 PDF와 같은 모양 + 하이라이트, 코멘트마다 남긴 프로젝트 */
export interface PaperCommentFile extends CommentFile { highlights: PaperHighlight[]; projects: Record<string, string> }
export interface NewPaperNote { kind: CommentKind | '하이라이트'; text?: string; page?: number; rects?: number[][]; pageHeight?: number; quote?: string; color?: PaintColor; project?: string }

export const papersApi = {
  list: () => req('/api/papers').then((r) => json<PaperList>(r)),
  brief: (recent = 8) => req(`/api/papers/brief?recent=${recent}`).then((r) => json<PaperBrief>(r)),
  setProjects: (key: string, projects: string[]) => req(`/api/papers/${enc(key)}/projects`, send('PUT', { projects })).then((r) => json<{ projects: string[] }>(r)),
  pdfUrl: (key: string) => `/api/papers/${enc(key)}/pdf`,
  add: (id: string) => req('/api/papers', send('POST', { id })).then((r) => json<PaperAdded>(r)),
  upload: (file: File, id?: string) => req(`/api/papers/upload?name=${enc(file.name)}${id ? `&id=${enc(id)}` : ''}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file }).then((r) => json<PaperAdded>(r)),
  comments: (key: string) => req(`/api/papers/${enc(key)}/comments`).then((r) => json<PaperCommentFile>(r)),
  addComment: (key: string, n: NewPaperNote) => req(`/api/papers/${enc(key)}/comments`, send('POST', n)).then((r) => json<{ id: string; file: PaperCommentFile }>(r)),
  updateComment: (key: string, id: string, change: { state?: CommentState; color?: PaintColor }, baseHash: string) =>
    req(`/api/papers/${enc(key)}/comments/${enc(id)}`, send('PATCH', { ...change, baseHash })).then((r) => json<PaperCommentFile>(r)),
  removeComment: (key: string, id: string, baseHash: string) => req(`/api/papers/${enc(key)}/comments/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<PaperCommentFile>(r)),
  answer: (key: string, id: string) => req(`/api/papers/${enc(key)}/comments/${enc(id)}/answer`, { method: 'POST' }).then((r) => json<PaperCommentFile>(r)),
  folders: () => req('/api/papers/folders').then((r) => json<{ folders: PaperFolder[] }>(r)),
  setFolders: (folders: string[]) => req('/api/papers/folders', send('PUT', { folders })).then((r) => json<{ folders: PaperFolder[] }>(r)),
}
