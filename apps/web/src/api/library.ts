// ---------- 라이브러리 (개념노트·문헌노트·Study, 서버 libraryNotes.ts) ----------
import type {
  ConceptCreated, LibraryCompiled, LibraryInfo, LibraryKind, LibraryNoteSaved, LibraryNoteText, LibraryPaperCreated, NewConceptBody, ProjectConcepts,
  StudyList, StudyText,
} from '@rw/core/contract/library'
import { ConflictError, enc, json, req, send } from './http'

export type { LibraryKind, LibraryNote, LibraryUse, LibraryInfo, LibraryPreamble, StudyNote } from '@rw/core/contract/library'

export const libraryCalls = {
  library: () => req('/api/library').then((r) => json<LibraryInfo>(r)),
  readLibraryNote: (kind: LibraryKind, id: string) => req(`/api/library/notes/${kind}/${enc(id)}`).then((r) => json<LibraryNoteText>(r)),
  saveLibraryNote: async (kind: LibraryKind, id: string, content: string, baseHash: string): Promise<string> => {
    const r = await req(`/api/library/notes/${kind}/${enc(id)}`, send('PUT', { content, baseHash }))
    if (r.status === 409) throw new ConflictError(((await r.json()) as { currentHash: string }).currentHash)
    return (await json<LibraryNoteSaved>(r)).hash
  },
  createConcept: (input: Omit<NewConceptBody, 'format'>) => req('/api/library/concepts', send('POST', input)).then((r) => json<ConceptCreated>(r)),
  /** 라이브러리 노트를 PDF로 (서버 앱 설정 폴더에서 빌드) */
  /** template: 설정의 LaTeX 서식 id. 비우면 예전처럼 article */
  compileLibraryNote: (kind: LibraryKind, id: string, template = '') => req(`/api/library/notes/${kind}/${enc(id)}/compile`, send('POST', { template })).then((r) => json<LibraryCompiled>(r)),
  libraryPdfUrl: (kind: LibraryKind, id: string, version: number) => `/api/library/notes/${kind}/${enc(id)}/pdf?v=${version}`,
  /** 프로젝트 전체를 개념노트에 잇거나 끊는다 (research.yaml의 concepts:) */
  linkConcept: (rid: string, id: string, on: boolean) => req(`/api/researches/${enc(rid)}/concepts`, send('POST', { id, on })).then((r) => json<ProjectConcepts>(r)),
  createPaper: (rid: string, key: string) => req('/api/library/papers', send('POST', { rid, key })).then((r) => json<LibraryPaperCreated>(r)),
  study: () => req('/api/study').then((r) => json<StudyList>(r)),
  studyNote: (path: string) => req(`/api/study/note?path=${enc(path)}`).then((r) => json<StudyText>(r)),
}
