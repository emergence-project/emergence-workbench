/**
 * 개념노트 API의 계약 (research-library/concepts/, 서버 routes/concepts.ts · 화면 api/concepts.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 확인 표시: 없음 · 확인한 본문 그대로 · 확인한 뒤 본문이 바뀜 */
export const CHECK_STATES = ['none', 'ok', 'changed'] as const
export const CheckState = z.enum(CHECK_STATES)

// ---------- 노트 하나 (서버 conceptNotes.ts) ----------

export const ConceptMeta = z.object({
  title: z.string(),
  aliases: z.array(z.string()),
  subject: z.string().optional(),
  /** 분류 id (subjects.yaml). 없으면 빈 목록 */
  subjects: z.array(z.string()),
  study: z.string().optional(),
  checked: z.object({ at: z.string(), hash: z.string() }).strict().optional(),
  locked: z.boolean(),
  /** 사람이 "검토 예정"으로 골라 둔 노트 */
  review: z.literal('todo').optional(),
  /** 출처: references.bib 키 */
  sources: z.array(z.string()),
  /** 관련 개념 (제목·별칭) */
  related: z.array(z.string()),
  /** 아직 bib 키로 바꾸지 못한 출처 글 */
  sourcesUnsorted: z.array(z.string()),
}).strict()
/** GET · PUT /concepts/:id, checked · locked · review · subjects */
export const ConceptMd = z.object({
  id: z.string(),
  meta: ConceptMeta,
  body: z.string(),
  /** 파일 전체의 해시 (저장 충돌 확인) */
  hash: z.string(),
  unfinished: z.array(z.string()),
  checked: CheckState,
}).strict()
/** 본문 밖 메모 (concepts/<id>.memo.md) */
export const ConceptMemo = z.object({ id: z.string(), text: z.string(), hash: z.string(), exists: z.boolean() }).strict()
/** 기호 모음 (concepts/macros.tex → KaTeX macros) */
export const ConceptMacros = z.object({ file: z.string(), exists: z.boolean(), macros: z.record(z.string()) }).strict()

// ---------- 색인 (서버 conceptIndex.ts) ----------

export const CONCEPT_ISSUES = ['empty', 'emptySection', 'todo', 'brokenLink', 'noSource', 'unknownCite'] as const
export const CONCEPT_CHECKS = ['unchecked', 'changedAfterCheck', 'draftsToReview'] as const
export const CONCEPT_SORTS = ['title', 'subject', 'sources', 'links', 'issues', 'mtime', 'projects', 'aliases', 'checked'] as const

export const ConceptRow = z.object({
  id: z.string(),
  /** 지식 화면의 주제 key: Study에서 옮긴 노트는 Study 파일 이름, 아니면 제목 */
  key: z.string(),
  title: z.string(),
  subject: z.string(),
  subjects: z.array(z.string()),
  aliases: z.array(z.string()),
  /** 미완성인 이유 (없으면 빈 배열) */
  unfinished: z.array(z.string()),
  checked: CheckState,
  locked: z.boolean(),
}).strict()
export const ConceptTableRow = ConceptRow.extend({
  sources: z.number(),
  links: z.number(),
  issues: z.array(z.enum(CONCEPT_ISSUES)),
  mtime: z.number(),
  projects: z.array(z.string()),
}).strict()
/** GET /concepts/list: 한 쪽 */
export const ConceptList = z.object({ total: z.number(), items: z.array(ConceptTableRow) }).strict()
/** 분류마다 노트 수. 분류 나무(subjects.yaml)가 있으면 name · parent · model: 'ids'도 */
export const SubjectCount = z.object({ subject: z.string(), count: z.number(), name: z.string().optional(), parent: z.string().nullable().optional(), model: z.literal('ids').optional() }).strict()
/** GET /concepts/subjects */
export const ConceptSubjects = z.object({ subjects: z.array(SubjectCount) }).strict()
/** GET /concepts/resolve: [[이름]]이 가리키는 노트 (없으면 null) */
export const ConceptResolved = z.object({ note: ConceptRow.nullable() }).strict()
/** GET /concepts/rows */
export const ConceptRows = z.object({ items: z.array(ConceptRow) }).strict()
/** GET /concepts/:id/links: 나가는 링크 · 들어오는 링크 · 노트가 없는 링크 이름 */
export const ConceptLinks = z.object({ out: z.array(ConceptRow), back: z.array(ConceptRow), missing: z.array(z.string()) }).strict()
/** GET /concepts/search (에이전트 입구 search_library): 낱말이 든 노트와 그 줄 */
export const ConceptSearch = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string(), hits: z.array(z.object({ line: z.number(), heading: z.string(), text: z.string() }).strict()) }).strict()),
}).strict()
/** 규칙 파일 하나 (서버 agentRules.ts) */
export const RuleFile = z.object({ file: z.string(), text: z.string(), truncated: z.literal(true).optional() }).strict()
/** GET /concepts/rules: 라이브러리 README의 개념노트 절. 라이브러리가 없으면 null */
export const ConceptRules = z.object({ rules: RuleFile.nullable() }).strict()

// ---------- 지식 첫 화면 (서버 conceptBrief.ts) ----------

/** 수와 id 목록 */
export const IdCount = z.object({ count: z.number(), ids: z.array(z.string()) }).strict()
export const ConceptBrief = z.object({
  total: z.number(),
  /** 최근 고친 개념노트 */
  recent: z.array(z.object({ id: z.string(), title: z.string(), subject: z.string(), mtime: z.number() }).strict()),
  /** 점검(사용자 차례): 연구가 쓰는 노트 중 확인 전 · 확인 뒤 바뀜, 초안이 다 된 공부할 것(ids는 항목 id, concepts는 개념노트 id) */
  check: z.object({
    used: z.number(),
    unchecked: IdCount,
    changedAfterCheck: IdCount,
    draftsToReview: IdCount.extend({ concepts: z.array(z.string()) }).strict(),
  }).strict(),
  /** 통계(이상, 에이전트 차례) */
  stats: z.object({ empty: IdCount, emptySection: IdCount, todo: IdCount, brokenLink: IdCount, noSource: IdCount, unknownCite: IdCount }).strict(),
}).strict()

// ---------- 출처와 쓰는 곳 ----------

/** references.bib 항목 하나 (서버 materials.ts parseBib). source는 어느 .bib에서 왔는지 (라이브러리 bib는 빈 글) */
export const ConceptBibEntry = z.object({
  key: z.string(),
  type: z.string(),
  title: z.string().optional(),
  author: z.string().optional(),
  editor: z.string().optional(),
  year: z.string().optional(),
  eprint: z.string().optional(),
  doi: z.string().optional(),
  journal: z.string().optional(),
  booktitle: z.string().optional(),
  publisher: z.string().optional(),
  file: z.string().optional(),
  source: z.string(),
  /** 화면이 missing으로 가르려고 둔 칸 (서버는 보내지 않는다) */
  missing: z.undefined().optional(),
}).strict()
/** 개념노트 출처 한 건: references.bib 항목, 또는 bib에 없는 키 */
export const ConceptSource = z.union([ConceptBibEntry, z.object({ key: z.string(), missing: z.literal(true) }).strict()])
/** GET /concepts/:id/sources. cited: 본문 [@키], unsorted: 아직 bib 키로 바꾸지 못한 출처 글 */
export const ConceptSources = z.object({ sources: z.array(ConceptSource), cited: z.array(z.string()), unsorted: z.array(z.string()) }).strict()
/** 이 개념을 쓰는 프로젝트 하나: 프로젝트 전체 연결(research.yaml), 기대는 연구노트, 개념노트 출처가 그 bib에 있는지 */
export const ConceptUse = z.object({
  rid: z.string(),
  project: z.string(),
  linked: z.boolean(),
  notes: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
  cites: z.array(z.object({ key: z.string(), projectKey: z.string().optional() }).strict()),
}).strict()
/** GET /concepts/:id/usage */
export const ConceptUsage = z.object({ uses: z.array(ConceptUse) }).strict()
/** GET /concepts/bib: 편집기의 [@ 찾기 */
export const ConceptBib = z.object({ items: z.array(z.object({ key: z.string(), title: z.string().optional(), author: z.string().optional(), year: z.string().optional() }).strict()) }).strict()

// ---------- 요청 ----------
// baseHash가 지금 파일과 맞는지, 잠금은 서버 conceptNotes.ts가 본다.

export const ConceptBodyBody = z.object({ body: z.string(), baseHash: z.string() })
/** "확인함" · 고치기 잠금 켜기·끄기 */
export const ConceptFlagBody = z.object({ on: z.boolean(), baseHash: z.string() })
/** 사용자 확인 고르기: 표시 없음 · 검토 예정 · 확인함 */
export const ConceptReviewBody = z.object({ choice: z.enum(['none', 'todo', 'ok']), baseHash: z.string() })
export const ConceptMemoBody = z.object({ text: z.string(), baseHash: z.string() })

export type CheckState = z.infer<typeof CheckState>
export type ConceptMeta = z.infer<typeof ConceptMeta>
export type ConceptMd = z.infer<typeof ConceptMd>
export type ConceptMemo = z.infer<typeof ConceptMemo>
export type ConceptMacros = z.infer<typeof ConceptMacros>
export type ConceptIssue = (typeof CONCEPT_ISSUES)[number]
export type ConceptCheck = (typeof CONCEPT_CHECKS)[number]
export type ConceptSort = (typeof CONCEPT_SORTS)[number]
export type ConceptRow = z.infer<typeof ConceptRow>
export type ConceptTableRow = z.infer<typeof ConceptTableRow>
export type ConceptList = z.infer<typeof ConceptList>
export type SubjectCount = z.infer<typeof SubjectCount>
export type ConceptSubjects = z.infer<typeof ConceptSubjects>
export type ConceptResolved = z.infer<typeof ConceptResolved>
export type ConceptRows = z.infer<typeof ConceptRows>
export type ConceptLinks = z.infer<typeof ConceptLinks>
export type ConceptSearch = z.infer<typeof ConceptSearch>
export type RuleFile = z.infer<typeof RuleFile>
export type ConceptRules = z.infer<typeof ConceptRules>
export type IdCount = z.infer<typeof IdCount>
export type ConceptBrief = z.infer<typeof ConceptBrief>
export type ConceptBibEntry = z.infer<typeof ConceptBibEntry>
export type ConceptSource = z.infer<typeof ConceptSource>
export type ConceptSources = z.infer<typeof ConceptSources>
export type ConceptUse = z.infer<typeof ConceptUse>
export type ConceptUsage = z.infer<typeof ConceptUsage>
export type ConceptBib = z.infer<typeof ConceptBib>
export type ConceptBodyBody = z.input<typeof ConceptBodyBody>
export type ConceptFlagBody = z.input<typeof ConceptFlagBody>
export type ConceptReviewBody = z.input<typeof ConceptReviewBody>
export type ConceptMemoBody = z.input<typeof ConceptMemoBody>
