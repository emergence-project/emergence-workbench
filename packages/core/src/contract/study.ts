/**
 * 공부(책 · 강의) API의 계약 (라이브러리 study/<id>.yaml, 서버 routes/study.ts · 화면 api/study.ts).
 * 파일 형식은 docs/repo-format.md §10.6, 여기는 앱 서버와 화면 사이의 모양이다. (11/10 사용자 결정 "공부는 지식 라이브러리에", 안 A)
 */
import { z } from 'zod'
import { CheckState } from './concepts.js'
import { STUDY_KINDS, STUDY_STATES } from '../study.js'

export { STUDY_KINDS, STUDY_STATES }
export const StudyKind = z.enum(STUDY_KINDS)
export const StudyState = z.enum(STUDY_STATES)

/** 사이드바 · 목록의 책 하나 */
export const StudyBookRow = z.object({
  id: z.string(),
  title: z.string(),
  kind: StudyKind,
  chapters: z.number(),
  /** 상태가 끝인 장 수 */
  done: z.number(),
}).strict()
export const StudyBooks = z.object({ enabled: z.boolean(), books: z.array(StudyBookRow) }).strict()

/** 장에 이은 개념노트 (없는 id면 missing) */
export const StudyConcept = z.object({ id: z.string(), title: z.string(), checked: CheckState, missing: z.boolean() }).strict()
export const StudyChapter = z.object({ title: z.string(), state: StudyState, concepts: z.array(StudyConcept) }).strict()
/** GET /study/:id */
export const StudyBook = z.object({
  id: z.string(),
  title: z.string(),
  kind: StudyKind,
  source: z.string().optional(),
  chapters: z.array(StudyChapter),
  hash: z.string(),
}).strict()

// ---------- 요청 ----------

const chapterIn = z.object({ title: z.string(), state: StudyState, concepts: z.array(z.string()) }).strict()
/** POST /study: 새 책 · 강의. 장은 줄마다 하나 */
export const NewStudyBookBody = z.object({ title: z.string(), kind: StudyKind, source: z.string().optional(), chapters: z.array(z.string()) })
/** PUT /study/:id: 통째로 고치기 */
export const SaveStudyBookBody = z.object({ title: z.string(), kind: StudyKind, source: z.string().optional(), chapters: z.array(chapterIn), baseHash: z.string().min(1, 'baseHash (the hash received when reading) is required') })
export const StudyCreated = z.object({ id: z.string() }).strict()

export type StudyKind = z.infer<typeof StudyKind>
export type StudyState = z.infer<typeof StudyState>
export type StudyBookRow = z.infer<typeof StudyBookRow>
export type StudyBooks = z.infer<typeof StudyBooks>
export type StudyConcept = z.infer<typeof StudyConcept>
export type StudyChapter = z.infer<typeof StudyChapter>
export type StudyBook = z.infer<typeof StudyBook>
export type NewStudyBookBody = z.infer<typeof NewStudyBookBody>
export type SaveStudyBookBody = z.infer<typeof SaveStudyBookBody>
export type StudyCreated = z.infer<typeof StudyCreated>
