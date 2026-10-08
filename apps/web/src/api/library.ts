// ---------- 라이브러리 (개념노트·문헌노트·Study, 서버 libraryNotes.ts) ----------
import type { CheckState } from './concepts'
import { ConflictError, enc, json, req, send } from './http'
import type { CompileResult } from './research'

/** 공유 라이브러리의 개념노트·문헌노트 (서버 libraryNotes.ts) */
export type LibraryKind = 'concept' | 'paper'
export interface LibraryNote {
  kind: LibraryKind; id: string; title: string; status: string; empty: boolean
  study?: string; authors?: string; year?: string; eprint?: string; mtime: number; hash: string
  /** md: Markdown 개념노트 (없으면 LaTeX). 미완성인 이유 · 확인함 상태 · 고치기 잠금 */
  format?: 'md'; unfinished?: string[]; checked?: CheckState; locked?: boolean
}
export interface LibraryUse { rid: string; project: string; note?: string; noteTitle?: string }
export interface LibraryInfo { path: string | null; notes: LibraryNote[]; usedBy: Record<string, LibraryUse[]>; study: string | null }
export interface StudyNote { path: string; title: string; subject: string; size: number }

export const libraryCalls = {
  library: () => req('/api/library').then((r) => json<LibraryInfo>(r)),
  readLibraryNote: (kind: LibraryKind, id: string) => req(`/api/library/notes/${kind}/${enc(id)}`).then((r) => json<{ content: string; hash: string }>(r)),
  saveLibraryNote: async (kind: LibraryKind, id: string, content: string, baseHash: string): Promise<string> => {
    const r = await req(`/api/library/notes/${kind}/${enc(id)}`, send('PUT', { content, baseHash }))
    if (r.status === 409) throw new ConflictError(((await r.json()) as { currentHash: string }).currentHash)
    return (await json<{ hash: string }>(r)).hash
  },
  createConcept: (input: { title?: string; study?: string }) => req('/api/library/concepts', send('POST', input)).then((r) => json<{ id: string }>(r)),
  /** 라이브러리 노트를 PDF로 (서버 앱 설정 폴더에서 빌드) */
  /** template: 설정의 LaTeX 서식 id. 비우면 예전처럼 article */
  compileLibraryNote: (kind: LibraryKind, id: string, template = '') => req(`/api/library/notes/${kind}/${enc(id)}/compile`, send('POST', { template })).then((r) => json<CompileResult & { warnings?: string[] }>(r)),
  libraryPdfUrl: (kind: LibraryKind, id: string, version: number) => `/api/library/notes/${kind}/${enc(id)}/pdf?v=${version}`,
  /** 프로젝트 전체를 개념노트에 잇거나 끊는다 (research.yaml의 concepts:) */
  linkConcept: (rid: string, id: string, on: boolean) => req(`/api/researches/${enc(rid)}/concepts`, send('POST', { id, on })).then((r) => json<{ concepts: string[] }>(r)),
  createPaper: (rid: string, key: string) => req('/api/library/papers', send('POST', { rid, key })).then((r) => json<{ id: string; created: boolean }>(r)),
  study: () => req('/api/study').then((r) => json<{ path: string | null; notes: StudyNote[] }>(r)),
  studyNote: (path: string) => req(`/api/study/note?path=${enc(path)}`).then((r) => json<{ title: string; text: string }>(r)),
}
