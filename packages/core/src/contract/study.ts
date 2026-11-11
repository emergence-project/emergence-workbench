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

/** 장에 이은 개념노트 (없는 id면 missing = 아직 만들지 않은 노트). done: 이 장에서 정리함 (11/11 체크리스트) */
export const StudyConcept = z.object({ id: z.string(), title: z.string(), checked: CheckState, missing: z.boolean(), done: z.boolean() }).strict()
/** 읽을 것 하나: 문헌(references.bib 키 + 쪽 · 절) 또는 글과 주소. label은 화면에 보일 짧은 이름(저자 연도), 키가 bib에 없으면 missing */
export const StudyRead = z.object({
  key: z.string().optional(),
  at: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  done: z.boolean(),
  label: z.string(),
  title: z.string().optional(),
  missing: z.boolean(),
}).strict()
export const StudyTodo = z.object({ text: z.string(), done: z.boolean() }).strict()
/** 장(회차) 하나: 학습 목표, 체크리스트 셋(읽을 것 · 개념노트 · 할 일). 11/11 사용자 결정 "회차별 계획" */
export const StudyChapter = z.object({ title: z.string(), state: StudyState, goals: z.array(z.string()), read: z.array(StudyRead), concepts: z.array(StudyConcept), do: z.array(StudyTodo) }).strict()
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

const readIn = z.object({ key: z.string().optional(), at: z.string().optional(), text: z.string().optional(), url: z.string().optional(), done: z.boolean().optional() }).strict()
const conceptIn = z.union([z.string(), z.object({ id: z.string(), done: z.boolean().optional() }).strict()])
const todoIn = z.union([z.string(), z.object({ text: z.string(), done: z.boolean().optional() }).strict()])
const chapterIn = z.object({ title: z.string(), state: StudyState, goals: z.array(z.string()).optional(), read: z.array(readIn).optional(), concepts: z.array(conceptIn), do: z.array(todoIn).optional() }).strict()
/** 체크리스트 칸 셋 */
export const STUDY_LISTS = ['read', 'concepts', 'do'] as const
/** POST /study: 새 책 · 강의. 장은 줄마다 하나 */
export const NewStudyBookBody = z.object({ title: z.string(), kind: StudyKind, source: z.string().optional(), chapters: z.array(z.string()) })
/** PUT /study/:id: 통째로 고치기 */
export const SaveStudyBookBody = z.object({ title: z.string(), kind: StudyKind, source: z.string().optional(), chapters: z.array(chapterIn), baseHash: z.string().min(1, 'baseHash (the hash received when reading) is required') })
export const StudyCreated = z.object({ id: z.string() }).strict()
/** POST /study/:id/check: 체크 하나만 바꾼다(파일을 새로 읽어 그 칸만). item은 그 칸의 키 · id · 글로, 그새 줄이 바뀌었으면 409 */
export const StudyCheckBody = z.object({ chapter: z.number().int().min(0), list: z.enum(STUDY_LISTS), index: z.number().int().min(0), item: z.string(), done: z.boolean() }).strict()

export type StudyKind = z.infer<typeof StudyKind>
export type StudyState = z.infer<typeof StudyState>
export type StudyBookRow = z.infer<typeof StudyBookRow>
export type StudyBooks = z.infer<typeof StudyBooks>
export type StudyConcept = z.infer<typeof StudyConcept>
export type StudyChapter = z.infer<typeof StudyChapter>
export type StudyRead = z.infer<typeof StudyRead>
export type StudyTodo = z.infer<typeof StudyTodo>
export type StudyCheckBody = z.infer<typeof StudyCheckBody>
export type StudyBook = z.infer<typeof StudyBook>
export type NewStudyBookBody = z.infer<typeof NewStudyBookBody>
export type SaveStudyBookBody = z.infer<typeof SaveStudyBookBody>
export type StudyCreated = z.infer<typeof StudyCreated>
