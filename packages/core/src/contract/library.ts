/**
 * 공유 라이브러리 API의 계약 (research-library, 서버 routes/library.ts · 화면 api/library.ts).
 * 개념노트(Markdown)는 concepts.ts, 논문 · 그림 목록은 papers.ts · figures.ts에 있다.
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'
import { CheckState } from './concepts.js'
import { CompileResult, RepoInfo } from './research.js'

/** 라이브러리 노트를 쓰는 프로젝트 노트 하나 */
export const LibraryUse = z.object({ rid: z.string(), project: z.string(), note: z.string().optional(), noteTitle: z.string().optional() }).strict()

export const LIBRARY_KINDS = ['concept', 'paper'] as const
/** 공유 라이브러리의 개념노트 · 문헌노트 (서버 libraryNotes.ts) */
export const LibraryNote = z.object({
  kind: z.enum(LIBRARY_KINDS),
  id: z.string(),
  title: z.string(),
  status: z.string(),
  /** 구조만 있고 내용이 없는 노트 */
  empty: z.boolean(),
  /** 개념노트를 가져온 Study 노트 (vault 기준 경로) */
  study: z.string().optional(),
  /** 문헌노트: 저자 · 연도 · arXiv */
  authors: z.string().optional(),
  year: z.string().optional(),
  eprint: z.string().optional(),
  mtime: z.number(),
  hash: z.string(),
  /** md: Markdown 개념노트 (없으면 LaTeX). 미완성인 이유 · 확인함 상태 · 고치기 잠금 */
  format: z.literal('md').optional(),
  unfinished: z.array(z.string()).optional(),
  checked: CheckState.optional(),
  locked: z.boolean().optional(),
}).strict()
/** 라이브러리 서식 (preamble/*.tex) */
export const LibraryPreamble = z.object({
  /** 파일 이름에서 .tex를 뺀 것 (예: base) */
  name: z.string(),
  /** 라이브러리 안 경로 (예: preamble/base.tex) */
  file: z.string(),
  title: z.string(),
  description: z.string(),
  place: z.enum(['first', 'last']),
  status: z.string().optional(),
  /** 정의한 명령(\foo)과 환경 */
  commands: z.array(z.string()),
  environments: z.array(z.string()),
}).strict()
/** GET /library. usedBy의 열쇠는 '<kind>:<id>' */
export const LibraryInfo = z.object({
  path: z.string().nullable(),
  preambles: z.array(LibraryPreamble),
  notes: z.array(LibraryNote),
  usedBy: z.record(z.array(LibraryUse)),
  study: z.string().nullable(),
}).strict()
/** GET /library/repo: 라이브러리 폴더의 Git 상태 (폴더가 없으면 null) */
export const LibraryRepo = z.object({ repo: RepoInfo.nullable() }).strict()
/** GET /library/notes/:kind/:id */
export const LibraryNoteText = z.object({ content: z.string(), hash: z.string() }).strict()
/** PUT /library/notes/:kind/:id (바뀌었으면 409와 currentHash) */
export const LibraryNoteSaved = z.object({ hash: z.string() }).strict()
/** POST /library/notes/:kind/:id/compile: 컴파일 결과와 인용 경고 */
export const LibraryCompiled = CompileResult.extend({ warnings: z.array(z.string()) }).strict()
/** POST /library/concepts */
export const ConceptCreated = z.object({ id: z.string() }).strict()
/** POST /library/papers: 이미 있으면 created: false */
export const LibraryPaperCreated = z.object({ id: z.string(), created: z.boolean() }).strict()
/** POST /researches/:rid/concepts: 프로젝트 전체가 기대는 개념노트 (research.yaml의 concepts:) */
export const ProjectConcepts = z.object({ concepts: z.array(z.string()) }).strict()
/** Study vault의 Concept-Space 노트 하나 */
export const StudyNote = z.object({ path: z.string(), title: z.string(), subject: z.string(), size: z.number() }).strict()
/** GET /study */
export const StudyList = z.object({ path: z.string().nullable(), notes: z.array(StudyNote) }).strict()
/** GET /study/note: 머리말을 뗀 본문 */
export const StudyText = z.object({ title: z.string(), text: z.string() }).strict()

// ---------- 요청 ----------
// 종류 · id 모양, 있는 서식 · 키 · Study 노트인지는 서버가 본다.

export const SaveLibraryNoteBody = z.object({ content: z.string(), baseHash: z.string() })
/** template: 설정의 LaTeX 서식 id. 비우면 article */
export const CompileLibraryNoteBody = z.object({ template: z.string().optional() })
/** format: 'tex'면 옛 LaTeX (없으면 Markdown). study를 주면 그 Study 노트 원문을 재료로 붙인다 */
export const NewConceptBody = z.object({ title: z.string().optional(), study: z.string().optional(), format: z.string().optional() })
/** 프로젝트 bib의 항목에서 문헌노트 */
export const NewLibraryPaperBody = z.object({ rid: z.string(), key: z.string() })
export const LinkConceptBody = z.object({ id: z.string(), on: z.boolean() })

export type LibraryUse = z.infer<typeof LibraryUse>
export type LibraryKind = (typeof LIBRARY_KINDS)[number]
export type LibraryNote = z.infer<typeof LibraryNote>
export type LibraryPreamble = z.infer<typeof LibraryPreamble>
export type LibraryInfo = z.infer<typeof LibraryInfo>
export type LibraryRepo = z.infer<typeof LibraryRepo>
export type LibraryNoteText = z.infer<typeof LibraryNoteText>
export type LibraryNoteSaved = z.infer<typeof LibraryNoteSaved>
export type LibraryCompiled = z.infer<typeof LibraryCompiled>
export type ConceptCreated = z.infer<typeof ConceptCreated>
export type LibraryPaperCreated = z.infer<typeof LibraryPaperCreated>
export type ProjectConcepts = z.infer<typeof ProjectConcepts>
export type StudyNote = z.infer<typeof StudyNote>
export type StudyList = z.infer<typeof StudyList>
export type StudyText = z.infer<typeof StudyText>
export type SaveLibraryNoteBody = z.input<typeof SaveLibraryNoteBody>
export type CompileLibraryNoteBody = z.input<typeof CompileLibraryNoteBody>
export type NewConceptBody = z.input<typeof NewConceptBody>
export type NewLibraryPaperBody = z.input<typeof NewLibraryPaperBody>
export type LinkConceptBody = z.input<typeof LinkConceptBody>
