import { enc, json, req, send } from './http'
import type { NewStudyBookBody, SaveStudyBookBody, StudyBook, StudyBooks, StudyCheckBody, StudyCreated } from '@rw/core/contract/study'
export type { StudyBook, StudyBookRow, StudyChapter, StudyConcept, StudyKind, StudyRead, StudyState, StudyTodo } from '@rw/core/contract/study'
export { STUDY_KINDS, STUDY_STATES } from '@rw/core'
/** 공부: 책 · 강의 (라이브러리 study/<id>.yaml, 11/10) */
export const studyApi = {
  list: () => req('/api/library/study').then((r) => json<StudyBooks>(r)),
  get: (id: string) => req(`/api/library/study/${enc(id)}`).then((r) => json<StudyBook>(r)),
  create: (body: NewStudyBookBody) => req('/api/library/study', send('POST', body)).then((r) => json<StudyCreated>(r)),
  save: (id: string, body: SaveStudyBookBody) => req(`/api/library/study/${enc(id)}`, send('PUT', body)).then((r) => json<StudyBook>(r)),
  check: (id: string, body: StudyCheckBody) => req(`/api/library/study/${enc(id)}/check`, send('POST', body)).then((r) => json<StudyBook>(r)),
}
