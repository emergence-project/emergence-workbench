/**
 * 라이브러리 분류 API의 계약 (research-library/subjects.yaml, 서버 routes/subjects.ts · 화면 api/subjects.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

const counts = { notes: z.number(), figures: z.number(), papers: z.number() }
const subject = { id: z.string(), name: z.string(), parent: z.string().nullable() }

/** 분류 하나와 거기 든 개념노트·그림·논문 수 */
export const LibrarySubject = z.object({ ...subject, ...counts }).strict()
/** GET /subjects. 분류 나무가 없으면(enabled: false) 빈 목록, 수(unclassified)도 없다 */
export const SubjectTree = z.object({
  enabled: z.boolean(),
  hash: z.string(),
  items: z.array(LibrarySubject),
  unclassified: z.object(counts).strict().optional(),
  /** 고르기 창의 추천 (연결된 노트에서, 없으면 자주 고른 것) */
  suggestions: z.array(z.object({ id: z.string(), reason: z.string() }).strict()),
}).strict()
/** PATCH · POST /subjects: 고친 뒤의 나무 (수와 추천 없이) */
export const SubjectTreeSaved = z.object({ enabled: z.boolean(), hash: z.string(), items: z.array(z.object(subject).strict()) }).strict()
/** 그림·논문의 분류를 고친 뒤 */
export const EntrySubjects = z.object({ subjects: z.array(z.string()), hash: z.string() }).strict()
/** 그림·논문 분류를 고칠 때 보낼 hash (figures.yaml · papers.yaml) */
export const SubjectFileHash = z.object({ hash: z.string() }).strict()

// ---------- 요청 ----------
// 분류 id 모양·깊이, 이름 길이, 있는 분류인지는 서버 subjects.ts가 본다.

const baseHash = z.string().min(1, 'baseHash (the hash received when reading) is required')
export const RenameSubjectBody = z.object({ id: z.string(), name: z.string(), baseHash })
/** parent: 빈 값이면 맨 위. slug가 없으면 이름에서 만든다 */
export const AddSubjectBody = z.object({ parent: z.string().optional(), name: z.string(), slug: z.string().optional(), baseHash })
export const SetSubjectsBody = z.object({ subjects: z.array(z.string()), baseHash })
export const SetFigureSubjectsBody = SetSubjectsBody.extend({ id: z.string() })

export type LibrarySubject = z.infer<typeof LibrarySubject>
export type SubjectTree = z.infer<typeof SubjectTree>
export type SubjectTreeSaved = z.infer<typeof SubjectTreeSaved>
export type EntrySubjects = z.infer<typeof EntrySubjects>
export type SubjectFileHash = z.infer<typeof SubjectFileHash>
export type RenameSubjectBody = z.input<typeof RenameSubjectBody>
export type AddSubjectBody = z.input<typeof AddSubjectBody>
export type SetSubjectsBody = z.input<typeof SetSubjectsBody>
export type SetFigureSubjectsBody = z.input<typeof SetFigureSubjectsBody>
