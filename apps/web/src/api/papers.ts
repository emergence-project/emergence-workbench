// ---------- 논문 라이브러리 (서버 routes/papers.ts) ----------
import type { CommentState, HighlightColor } from '@rw/core/contract/comments'
import type { NewPaperNoteBody, PaperAdded, PaperBrief, PaperCommentFile, PaperFolders, PaperList, PaperNoteAdded, PaperProjects } from '@rw/core/contract/papers'
import { enc, json, req, send } from './http'

export type { PdfWhere, PaperRow, PaperProject, PaperList, PaperBrief, PaperFolder, PaperAdded, PaperHighlight, PaperCommentFile } from '@rw/core/contract/papers'
export type PaintColor = HighlightColor
export type NewPaperNote = NewPaperNoteBody

export const papersApi = {
  list: () => req('/api/papers').then((r) => json<PaperList>(r)),
  brief: (recent = 8) => req(`/api/papers/brief?recent=${recent}`).then((r) => json<PaperBrief>(r)),
  setProjects: (key: string, projects: string[]) => req(`/api/papers/${enc(key)}/projects`, send('PUT', { projects })).then((r) => json<PaperProjects>(r)),
  pdfUrl: (key: string) => `/api/papers/${enc(key)}/pdf`,
  add: (id: string) => req('/api/papers', send('POST', { id })).then((r) => json<PaperAdded>(r)),
  upload: (file: File, id?: string) => req(`/api/papers/upload?name=${enc(file.name)}${id ? `&id=${enc(id)}` : ''}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file }).then((r) => json<PaperAdded>(r)),
  comments: (key: string) => req(`/api/papers/${enc(key)}/comments`).then((r) => json<PaperCommentFile>(r)),
  addComment: (key: string, n: NewPaperNote) => req(`/api/papers/${enc(key)}/comments`, send('POST', n)).then((r) => json<PaperNoteAdded>(r)),
  updateComment: (key: string, id: string, change: { state?: CommentState; color?: PaintColor }, baseHash: string) =>
    req(`/api/papers/${enc(key)}/comments/${enc(id)}`, send('PATCH', { ...change, baseHash })).then((r) => json<PaperCommentFile>(r)),
  removeComment: (key: string, id: string, baseHash: string) => req(`/api/papers/${enc(key)}/comments/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<PaperCommentFile>(r)),
  answer: (key: string, id: string) => req(`/api/papers/${enc(key)}/comments/${enc(id)}/answer`, { method: 'POST' }).then((r) => json<PaperCommentFile>(r)),
  folders: () => req('/api/papers/folders').then((r) => json<PaperFolders>(r)),
  setFolders: (folders: string[]) => req('/api/papers/folders', send('PUT', { folders })).then((r) => json<PaperFolders>(r)),
}
