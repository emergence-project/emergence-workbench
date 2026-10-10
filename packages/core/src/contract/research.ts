/**
 * 프로젝트(연구 하나) API의 계약 (서버 routes/researches.ts · project.ts · topics.ts · blocks.ts · manuscript.ts …, 화면 api/research.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'
import { BLOCK_STATUSES, type BlockMeta as BlockMetaType } from '../block-header.js'
import type { JournalEntry as JournalEntryType } from '../journal.js'
import type { PdfBox as PdfBoxType } from '../synctex.js'
import type { BlockTree as BlockTreeType } from '../tree.js'

// ---------- 다른 갈래도 쓰는 것 ----------

/** LaTeX 오류 하나. file은 workbench 기준 상대 경로(밖이면 절대 경로), inBlock: 노트 본문 안의 오류인지 */
export const LatexProblem = z.object({ file: z.string(), line: z.number(), message: z.string(), inBlock: z.boolean() }).strict()
/** 노트·라이브러리 노트 컴파일 결과 */
export const CompileResult = z.object({ ok: z.boolean(), durationMs: z.number(), hasPdf: z.boolean(), problems: z.array(LatexProblem), logTail: z.string() }).strict()

/** 프로젝트 정보의 저장소 칸 (서버 gitsync.ts) */
export const RepoInfo = z.object({
  /** ok: 이 폴더가 저장소 맨 위. none: git 저장소가 아님. inside: 다른 저장소(top) 안의 폴더 */
  state: z.enum(['ok', 'none', 'inside']),
  top: z.string().optional(),
  /** 브랜치 이름. 브랜치가 아닌 커밋을 꺼내 둔 상태면 null */
  branch: z.string().nullable().optional(),
  remote: z.object({ name: z.string(), shown: z.string(), web: z.string().nullable() }).strict().nullable().optional(),
  upstream: z.string().nullable().optional(),
  last: z.object({ sha: z.string(), subject: z.string(), date: z.string() }).strict().nullable().optional(),
  dirty: z.number().optional(),
  untracked: z.number().optional(),
  ahead: z.number().nullable().optional(),
  behind: z.number().nullable().optional(),
  /** 마지막으로 원격을 확인한 시각 (ms). 실패했으면 fetchError(쉬운 말)와 fetchDetail(git 원문) */
  fetchedAt: z.number().nullable().optional(),
  fetchError: z.string().optional(),
  fetchDetail: z.string().optional(),
}).strict()

/** 주제 카드 바탕색: 기본(프로젝트 색) 말고 정해 둔 다섯 색 */
export const TOPIC_COLORS = ['violet', 'blue', 'teal', 'orange', 'gray'] as const
export const TopicPreview = z.object({ text: z.string().optional(), image: z.string().optional(), color: z.enum(TOPIC_COLORS).optional() }).strict()
/** 주제 (workbench/topics.yaml 한 항목) */
export const Topic = z.object({
  id: z.string(),
  title: z.string(),
  /** 원고의 장 id */
  parts: z.array(z.string()),
  /** 예전 기록: 이 주제에 든 보조 노트 id */
  blocks: z.array(z.string()),
  done: z.boolean(),
  star: z.boolean(),
  /** 메인 노트 main .tex (저장소 기준) */
  manuscript: z.string().optional(),
  description: z.string().optional(),
  preview: TopicPreview.optional(),
}).strict()

// ---------- 프로젝트 목록 (routes/researches.ts) ----------

/** 프로젝트 성격: 연구 · 업무 (서버 registry.ts) */
export const PROJECT_KINDS = ['research', 'work'] as const
/** 프로젝트 진행 상태: 진행 · 멈춤 · 완료 */
export const PROJECT_STATES = ['active', 'paused', 'done'] as const
/** 프로젝트 색 (레일 버튼 · 홈 카드 · 고치기 창 띠). 없으면 자동. 값은 화면의 format.ts 표 (주황은 "사용자 차례"와 헷갈려 없다) */
export const PROJECT_COLORS = ['indigo', 'violet', 'cyan', 'pink', 'teal', 'purple', 'slate'] as const
/** 등록한 프로젝트(연구 저장소). 성격 · 분야 · 진행 상태 · 순서는 이 컴퓨터의 설정에만 있다 */
export const ResearchListItem = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  kind: z.enum(PROJECT_KINDS),
  /** 분야 (개념노트 분류에서 고른 이름) */
  fields: z.array(z.string()),
  state: z.enum(PROJECT_STATES),
  /** 왼쪽 띠에 늘 보이기. 띠는 진행 중인 프로젝트와 이것을 켠 프로젝트만 보인다 (10/10 12:59) */
  rail: z.boolean(),
  /** 고른 색. 없으면 자동 (10/10 12:56) */
  color: z.enum(PROJECT_COLORS).optional(),
  /** 예전 모양(업무 + 분야). 구글 동기화 · 검색용 */
  tags: z.array(z.string()),
  available: z.boolean(),
  problem: z.string().optional(),
}).strict()
export const Engine = z.enum(['xelatex', 'lualatex', 'pdflatex'])
/** GET /researches */
export const ResearchList = z.object({ engine: Engine, sandbox: z.boolean(), researches: z.array(ResearchListItem) }).strict()
/** PUT /researches/order */
export const ResearchOrder = z.object({ researches: z.array(ResearchListItem) }).strict()
/** 프로젝트마다 확인할 것의 수: counts = notes(확인이 필요한 노트) + tasks(판단할 맡긴 일) + edits(에이전트 고침 검토 · 고치기 요청) */
export const ProjectIssues = z.object({
  counts: z.record(z.string(), z.number()),
  notes: z.record(z.string(), z.number()),
  tasks: z.record(z.string(), z.number()),
  edits: z.record(z.string(), z.number()),
}).strict()

// ---------- 프로젝트 요약 (GET /researches/:rid) ----------

/** 보조 노트 머리말 (@rw/core block-header.ts) */
export const BlockMeta = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  parent: z.string().optional(),
  alternatives: z.array(z.string()),
  next: z.string().optional(),
  blockedReason: z.string().optional(),
  resumeCondition: z.string().optional(),
  stoppedReason: z.string().optional(),
  created: z.string().optional(),
  /** 앱이 모르는 키 (그대로 보존된다) */
  extra: z.record(z.string(), z.string()),
}).strict() satisfies z.ZodType<BlockMetaType>

const statusCounts = z.object(Object.fromEntries(BLOCK_STATUSES.map((s) => [s, z.number()])) as Record<(typeof BLOCK_STATUSES)[number], z.ZodNumber>).strict()
export const TreeIssue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('id-mismatch'), id: z.string(), headerId: z.string() }).strict(),
  z.object({ kind: z.literal('missing-parent'), id: z.string(), parent: z.string() }).strict(),
  z.object({ kind: z.literal('missing-alternative'), id: z.string(), alternative: z.string() }).strict(),
  z.object({ kind: z.literal('cycle'), id: z.string() }).strict(),
  z.object({ kind: z.literal('bad-status'), id: z.string(), status: z.string() }).strict(),
  z.object({ kind: z.literal('blocked-without-reason'), id: z.string() }).strict(),
  z.object({ kind: z.literal('stopped-without-reason'), id: z.string() }).strict(),
])
/** 보조 노트 나무 (@rw/core tree.ts) */
export const BlockTree = z.object({
  roots: z.array(z.string()),
  children: z.record(z.string(), z.array(z.string())),
  parentOf: z.record(z.string(), z.string().nullable()),
  alternatives: z.array(z.tuple([z.string(), z.string()])),
  order: z.array(z.object({ id: z.string(), depth: z.number() }).strict()),
  counts: statusCounts,
  frontier: z.array(z.string()),
  issues: z.array(TreeIssue),
}).strict() satisfies z.ZodType<BlockTreeType>

/** 'md' = Markdown + KaTeX (blocks/<id>.md), 'tex' = 예전 LaTeX */
export const BlockFormat = z.enum(['md', 'tex'])
/** 요약의 보조 노트 한 줄: 머리말 칸을 펼친 것 */
export const BlockRow = BlockMeta.extend({
  id: z.string(),
  format: BlockFormat,
  hash: z.string(),
  mtime: z.number(),
  /** 이 노트가 "% 근거:"로 적은 원고의 장·부록 id (장 파일이면 저장소 기준 경로, 한 파일 원고의 절이면 "file#라벨") */
  grounds: z.array(z.string()),
}).strict()

/** 진술: 정의·공리·보조정리·명제·정리 (서버 statements.ts) */
export const Statement = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string().optional(),
  title: z.string().optional(),
  uses: z.array(z.string()),
  proofs: z.array(z.string()),
  source: z.string().optional(),
  page: z.string().optional(),
  /** 저장소 기준 파일 경로 */
  file: z.string(),
  mtime: z.number(),
  hash: z.string(),
}).strict()

/** 노트 구분: 원고(논문 원문) · 연구노트(workbench/notes/) · 계산 노트(workbench/calc/) */
export const NOTE_KINDS = ['paper', 'note', 'calc'] as const
/** 메인 노트 하나 (research.yaml의 sources.manuscript, 연구노트·계산 노트는 저절로). declared: research.yaml에 적은 것 */
export const ManuscriptSource = z.object({ path: z.string(), name: z.string(), kind: z.enum(NOTE_KINDS), declared: z.literal(true).optional() }).strict()
/** 프로젝트가 이미 가진 정본 (research.yaml의 sources:, 서버 workbench.ts) */
export const ProjectSources = z.object({
  canon: z.array(z.object({ path: z.string(), note: z.string() }).strict()),
  tasks: z.string().optional(),
  bib: z.array(z.string()),
  materials: z.array(z.string()),
  reviews: z.array(z.string()),
  /** 첫째 메인 노트 (= manuscripts[0]) */
  manuscript: ManuscriptSource.optional(),
  manuscripts: z.array(ManuscriptSource),
}).strict()
/** research.yaml (서버 workbench.ts의 ResearchInfo) */
export const ResearchInfo = z.object({
  title: z.string(),
  question: z.string(),
  started: z.string(),
  sources: ProjectSources,
  agentStatus: z.boolean(),
  concepts: z.array(z.string()),
  latexTemplate: z.string().optional(),
  latexMacros: z.string().optional(),
  /** 프로젝트 카드 그림 (figure:<그림 id> 또는 예전 저장소 기준 경로) */
  image: z.string().optional(),
}).strict()
export const ResearchSummary = z.object({
  id: z.string(),
  root: z.string(),
  engine: Engine,
  research: ResearchInfo,
  blocks: z.array(BlockRow),
  tree: BlockTree,
  /** 진술 (저장소의 statements/). 없으면 빈 목록 */
  statements: z.array(Statement),
}).strict()

// ---------- 저장소와 GitHub (routes/sync.ts) ----------

/** 저장소와 GitHub의 차이 (서버 gitsync.ts) */
export const RepoSync = z.object({
  branch: z.string(),
  upstream: z.string(),
  ahead: z.number(),
  behind: z.number(),
  dirty: z.number(),
  fetchedAt: z.number().nullable(),
  fetchError: z.string().optional(),
  /** 앱에서 안전하게 받아올 수 있는지 */
  canUpdate: z.boolean(),
}).strict()
/** GET /sync. 저장소 맨 위가 아니거나 추적 브랜치가 없으면 null */
export const SyncReply = z.object({ sync: RepoSync.nullable() }).strict()
export const SyncUpdated = z.object({ sync: RepoSync }).strict()
export const RepoReply = z.object({ repo: RepoInfo }).strict()

// ---------- 보조 노트 (routes/blocks.ts) ----------

/** GET /blocks/:bid · POST /blocks. ownHeader: 머리(\documentclass)가 있는 LaTeX 노트 */
export const BlockDoc = z.object({ id: z.string(), format: BlockFormat, content: z.string(), hash: z.string(), meta: BlockMeta, ownHeader: z.boolean().optional() }).strict()
/** PATCH /blocks/:bid/meta (id·format 없음) */
export const BlockMetaSaved = z.object({ content: z.string(), hash: z.string(), meta: BlockMeta }).strict()
export const Saved = z.object({ hash: z.string() }).strict()
export const Ok = z.object({ ok: z.literal(true) }).strict()
/** 결과 PDF가 지금 노트의 것인지 (stale = 노트를 PDF 뒤에 고침) */
export const BlockPdfState = z.object({ hasPdf: z.boolean(), pdfAt: z.string().optional(), stale: z.boolean() }).strict()
/** 원고 위치 → PDF 영역 (@rw/core synctex.ts) */
export const PdfBox = z.object({ page: z.number(), h: z.number(), v: z.number(), width: z.number(), height: z.number() }).strict() satisfies z.ZodType<PdfBoxType>
export const PdfBoxes = z.object({ boxes: z.array(PdfBox) }).strict()
/** PDF 위치 → 노트 줄. 노트 밖(틀·서식)이면 inBlock=false */
export const SourceSpot = z.object({ file: z.string(), line: z.number(), inBlock: z.boolean() }).strict()
export const BlockSpot = z.object({ spot: SourceSpot.nullable() }).strict()
/** PDF 위치 → 원고 장 파일과 줄 (원고 밖이면 null) */
export const ManuscriptSpot = z.object({ spot: z.object({ file: z.string(), line: z.number() }).strict().nullable() }).strict()

// ---------- 일지 (routes/journal.ts) ----------

export const JOURNAL_KINDS = ['memo', 'todo', 'status', 'done'] as const
/** 일지 기록 하나 (@rw/core journal.ts) */
export const JournalEntry = z.object({
  date: z.string(),
  time: z.string(),
  kind: z.enum(JOURNAL_KINDS),
  /** 블록 id, 노트 파일 또는 '연구' */
  target: z.string(),
  text: z.string(),
  done: z.boolean().optional(),
  index: z.number(),
  link: z.string().optional(),
}).strict() satisfies z.ZodType<JournalEntryType>
export const JournalList = z.object({ entries: z.array(JournalEntry) }).strict()
export const JournalEntryReply = z.object({ entry: JournalEntry }).strict()
/** PATCH /journal/:date/:index. 고친 뒤 그 자리에 기록이 없으면(글을 비워 지운 것 등) null */
export const JournalEdited = z.object({ entry: JournalEntry.nullable() }).strict()

// ---------- 진술 · 프로젝트 정보 (routes/statements.ts · project.ts) ----------

export const StatementDoc = z.object({ content: z.string(), hash: z.string(), file: z.string() }).strict()
/** 프로젝트 자체 작업 목록 (sources.tasks 파일의 첫 마크다운 표) */
export const TaskTable = z.object({ file: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) }).strict()
/** 검토 상태가 있는 문서 (sources.reviews 폴더, frontmatter의 status) */
export const ReviewDoc = z.object({ file: z.string(), title: z.string(), status: z.string(), updated: z.string().optional() }).strict()
/** GET /project. hash: research.yaml의 해시 (정보 고칠 때 baseHash) */
export const ProjectInfo = z.object({
  hash: z.string(),
  sources: ProjectSources,
  agentStatus: z.boolean(),
  tasks: TaskTable.nullable(),
  reviews: z.array(ReviewDoc),
}).strict()
export const InfoSaved = z.object({ ok: z.literal(true), hash: z.string() }).strict()
/** STATUS.md 미리보기 */
export const AgentStatusPreview = z.object({ markdown: z.string() }).strict()

// ---------- 메인 노트 = 원고 · 연구노트 · 계산 노트 (routes/manuscript.ts) ----------

/** 원고의 장. 장 파일이면 id = file, 한 파일 원고의 절이면 id = "file#라벨"이고 line이 그 \section 줄 */
export const ManuscriptPart = z.object({ id: z.string(), file: z.string(), title: z.string(), appendix: z.boolean(), line: z.number().optional() }).strict()
/** 연구노트 카드 상태: 진행 중 · 일시 정지 · 정지 · 완결 */
export const NOTE_STATES = ['active', 'paused', 'stopped', 'done'] as const
/** 원고 PDF 상태 (서버 manuscriptFreshness.ts) */
export const ManuscriptPdfStatus = z.object({
  hasPdf: z.boolean(),
  pdfState: z.enum(['missing', 'current', 'stale', 'unknown']),
  lastSuccessAt: z.string().optional(),
  lastCompile: z.object({ at: z.string(), ok: z.boolean() }).strict().optional(),
  /** 보이는 PDF를 만든 컴파일 시각, 그 컴파일에 오류가 있었는지 */
  pdfAt: z.string().optional(),
  pdfErrors: z.boolean().optional(),
}).strict()
/**
 * 메인 노트 하나 (GET /manuscripts의 한 항목, PATCH /notes/meta). key: research.yaml에 적은 첫째 원고는 '', 나머지는 경로에서.
 * PDF 상태 칸은 GET /manuscript만 채운다 (여기는 hasPdf뿐)
 */
export const ManuscriptInfo = ManuscriptPdfStatus.partial().extend({
  key: z.string(),
  main: z.string(),
  name: z.string(),
  kind: z.enum(NOTE_KINDS),
  parts: z.array(ManuscriptPart),
  hasPdf: z.boolean(),
  /** summary·summaryAuto·done·state·resume는 연구노트·계산 노트만 (note.yaml, 없으면 본문 첫 문단에서 뽑은 설명) */
  summary: z.string().optional(),
  summaryAuto: z.boolean().optional(),
  done: z.boolean().optional(),
  state: z.enum(['paused', 'stopped', 'done']).optional(),
  resume: z.string().optional(),
  /** 연구노트·계산 노트인데 머리나 제목·저자 줄이 남아 있음 */
  needsBodyOnly: z.boolean().optional(),
  /** 컴파일·내보내기 때 앱이 저자 줄을 붙이는 원고 (본문만 있고 \author가 없는 원고) */
  addsAuthors: z.boolean().optional(),
  /** 머리(\documentclass)가 있어 내보내기가 파일을 그대로 묶는 노트 */
  ownHeader: z.boolean().optional(),
  /** 'md' = Markdown + KaTeX 노트 (note.md), 없으면 LaTeX */
  format: z.literal('md').optional(),
}).strict()
/** GET /manuscript: 메인 노트 하나와 PDF 상태 */
export const ManuscriptView = ManuscriptInfo.extend(ManuscriptPdfStatus.shape).strict()
export const ManuscriptList = z.array(ManuscriptInfo)
/** POST /manuscript/compile */
export const ManuscriptCompileResult = CompileResult.extend(ManuscriptPdfStatus.shape).strict()
export const PartDoc = z.object({ content: z.string(), hash: z.string() }).strict()
/** 메인 노트로 고를 수 있는 .tex와 지금 research.yaml의 해시 */
export const MainNoteCandidate = z.object({ path: z.string(), title: z.string() }).strict()
export const MainNoteCandidates = z.object({ candidates: z.array(MainNoteCandidate), hash: z.string() }).strict()
/** POST /notes */
export const CreatedNote = z.object({ path: z.string(), name: z.string(), kind: z.enum(['note', 'calc']), copied: z.number(), skipped: z.array(z.string()) }).strict()
/** POST /manuscript/body-only. template: research.yaml에 새로 적은 서식 */
export const BodyOnlyResult = z.object({ path: z.string(), removedHead: z.boolean(), removedFront: z.number(), macros: z.number(), template: z.string().optional() }).strict()
export const AllBodyOnlyResult = z.object({ notes: z.number(), template: z.string().optional() }).strict()

// ---------- 지운 노트 (routes/noteTrash.ts) ----------

/** 15일 보관하는 지운 연구노트·계산 노트. from: 원래 있던 곳 (저장소 기준), at·until: 지운 때와 정말 지워지는 때 (ISO) */
export const TrashedNote = z.object({ id: z.string(), name: z.string(), from: z.string(), at: z.string(), until: z.string() }).strict()
export const TrashList = z.array(TrashedNote)
export const RestoredNote = z.object({ path: z.string() }).strict()

// ---------- 자료 (routes/materials.ts) ----------

/** refs.bib 논문 하나 (서버 materials.ts). file: 받아 둔 PDF, source: 어느 .bib에서 왔는지 */
export const BibEntry = z.object({
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
}).strict()
/** workbench/materials/의 파일은 이름만, sources.materials 폴더의 파일은 저장소 기준 경로 */
export const MaterialFile = z.object({ name: z.string(), size: z.number(), mtime: z.number(), kind: z.enum(['pdf', 'slides', 'image', 'other']), bibKey: z.string().optional() }).strict()
export const MaterialList = z.object({ bib: z.array(BibEntry), files: z.array(MaterialFile) }).strict()
export const MaterialUploaded = z.object({ name: z.string() }).strict()

// ---------- 주제 (routes/topics.ts) ----------

/** GET·PUT /topics. hash: research.yaml의 해시 (고칠 때 baseHash) */
export const TopicList = z.object({ topics: z.array(Topic), hash: z.string() }).strict()

// ---------- 요청 ----------
// 값의 뜻(길이·있는 id·해시)은 서버가 본다.

/** 성격 · 분야 · 진행 상태 · 띠에 보이기 · 색 중 보낸 것만. tags: 예전 모양 (구글에서 되살리기) */
export const ProfileBody = z.object({
  kind: z.enum(PROJECT_KINDS).optional(),
  fields: z.array(z.string()).optional(),
  state: z.enum(PROJECT_STATES).optional(),
  rail: z.boolean().optional(),
  /** null이면 자동으로 */
  color: z.enum(PROJECT_COLORS).nullable().optional(),
  tags: z.array(z.string()).optional(),
})
export const OrderBody = z.object({ ids: z.array(z.string()) })
export const BlockCreateBody = z.object({ title: z.string(), id: z.string().optional(), parent: z.string().optional(), alternativeOf: z.string().optional() })
export const ContentBody = z.object({ content: z.string(), baseHash: z.string() })
export const BaseHashBody = z.object({ baseHash: z.string().min(1) })
/** 머리말 고치기: 키는 파일에 쓰는 이름(blocked-reason …), null이면 그 줄을 지운다. 고칠 수 있는 키는 서버가 본다 */
export const MetaPatchBody = z.object({
  patch: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()]).optional()),
  baseHash: z.string().optional(),
})
/** 사람이 직접 남기는 일지 기록 (메모 · 할 일). target이 없으면 연구 전체 */
export const JournalAddBody = z.object({ kind: z.enum(['memo', 'todo']), text: z.string(), target: z.string().optional() })
/** 할 일 끝냄(done) 또는 글 고치기(text). was·link: 읽을 때의 글과 연결 (그새 바뀌었으면 409) */
export const JournalPatchBody = z.object({ was: z.string(), done: z.boolean().optional(), text: z.string().optional(), link: z.string().optional() })
export const InfoBody = z.object({ title: z.string().optional(), question: z.string().optional(), started: z.string().optional(), image: z.string().optional(), baseHash: z.string().optional() })
export const PartSaveBody = z.object({ file: z.string(), content: z.string(), baseHash: z.string() })
export const MainNoteBody = z.object({ path: z.string(), name: z.string().optional(), baseHash: z.string().optional() })
/** 연구노트·계산 노트의 note.yaml 정보. baseHash: 노트 목록 줄의 hash */
export const NoteMetaBody = z.object({ summary: z.string().optional(), done: z.boolean().optional(), state: z.enum(NOTE_STATES).optional(), resume: z.string().optional(), baseHash: z.string().optional() })
/** from: 복사할 원고 key (없으면 빈 노트) */
export const CreateNoteBody = z.object({ kind: z.enum(['note', 'calc']), name: z.string(), from: z.string().optional() })

export type LatexProblem = z.infer<typeof LatexProblem>
export type CompileResult = z.infer<typeof CompileResult>
export type RepoInfo = z.infer<typeof RepoInfo>
export type TopicColor = (typeof TOPIC_COLORS)[number]
export type TopicPreview = z.infer<typeof TopicPreview>
export type Topic = z.infer<typeof Topic>
export type ProjectKind = (typeof PROJECT_KINDS)[number]
export type ProjectState = (typeof PROJECT_STATES)[number]
export type ProjectColor = (typeof PROJECT_COLORS)[number]
export type ResearchListItem = z.infer<typeof ResearchListItem>
export type ResearchList = z.infer<typeof ResearchList>
export type ResearchOrder = z.infer<typeof ResearchOrder>
export type ProjectIssues = z.infer<typeof ProjectIssues>
export type BlockMeta = z.infer<typeof BlockMeta>
export type TreeIssue = z.infer<typeof TreeIssue>
export type BlockTree = z.infer<typeof BlockTree>
export type BlockRow = z.infer<typeof BlockRow>
export type Statement = z.infer<typeof Statement>
export type NoteKind = (typeof NOTE_KINDS)[number]
export type ManuscriptSource = z.infer<typeof ManuscriptSource>
export type ProjectSources = z.infer<typeof ProjectSources>
export type ResearchInfo = z.infer<typeof ResearchInfo>
export type ResearchSummary = z.infer<typeof ResearchSummary>
export type RepoSync = z.infer<typeof RepoSync>
export type SyncReply = z.infer<typeof SyncReply>
export type SyncUpdated = z.infer<typeof SyncUpdated>
export type RepoReply = z.infer<typeof RepoReply>
export type BlockDoc = z.infer<typeof BlockDoc>
export type BlockMetaSaved = z.infer<typeof BlockMetaSaved>
export type Saved = z.infer<typeof Saved>
export type Ok = z.infer<typeof Ok>
export type BlockPdfState = z.infer<typeof BlockPdfState>
export type PdfBox = z.infer<typeof PdfBox>
export type PdfBoxes = z.infer<typeof PdfBoxes>
export type SourceSpot = z.infer<typeof SourceSpot>
export type BlockSpot = z.infer<typeof BlockSpot>
export type ManuscriptSpot = z.infer<typeof ManuscriptSpot>
export type JournalEntry = z.infer<typeof JournalEntry>
export type JournalList = z.infer<typeof JournalList>
export type JournalEntryReply = z.infer<typeof JournalEntryReply>
export type JournalEdited = z.infer<typeof JournalEdited>
export type StatementDoc = z.infer<typeof StatementDoc>
export type TaskTable = z.infer<typeof TaskTable>
export type ReviewDoc = z.infer<typeof ReviewDoc>
export type ProjectInfo = z.infer<typeof ProjectInfo>
export type InfoSaved = z.infer<typeof InfoSaved>
export type AgentStatusPreview = z.infer<typeof AgentStatusPreview>
export type ManuscriptPart = z.infer<typeof ManuscriptPart>
export type NoteState = (typeof NOTE_STATES)[number]
export type ManuscriptPdfStatus = z.infer<typeof ManuscriptPdfStatus>
export type ManuscriptInfo = z.infer<typeof ManuscriptInfo>
export type ManuscriptView = z.infer<typeof ManuscriptView>
export type ManuscriptList = z.infer<typeof ManuscriptList>
export type ManuscriptCompileResult = z.infer<typeof ManuscriptCompileResult>
export type PartDoc = z.infer<typeof PartDoc>
export type MainNoteCandidate = z.infer<typeof MainNoteCandidate>
export type MainNoteCandidates = z.infer<typeof MainNoteCandidates>
export type CreatedNote = z.infer<typeof CreatedNote>
export type BodyOnlyResult = z.infer<typeof BodyOnlyResult>
export type AllBodyOnlyResult = z.infer<typeof AllBodyOnlyResult>
export type TrashedNote = z.infer<typeof TrashedNote>
export type TrashList = z.infer<typeof TrashList>
export type RestoredNote = z.infer<typeof RestoredNote>
export type BibEntry = z.infer<typeof BibEntry>
export type MaterialFile = z.infer<typeof MaterialFile>
export type MaterialList = z.infer<typeof MaterialList>
export type MaterialUploaded = z.infer<typeof MaterialUploaded>
export type TopicList = z.infer<typeof TopicList>
export type ProfileBody = z.input<typeof ProfileBody>
export type OrderBody = z.input<typeof OrderBody>
export type BlockCreateBody = z.input<typeof BlockCreateBody>
export type ContentBody = z.input<typeof ContentBody>
export type BaseHashBody = z.input<typeof BaseHashBody>
export type MetaPatchBody = z.input<typeof MetaPatchBody>
export type JournalAddBody = z.input<typeof JournalAddBody>
export type JournalPatchBody = z.input<typeof JournalPatchBody>
export type InfoBody = z.input<typeof InfoBody>
export type PartSaveBody = z.input<typeof PartSaveBody>
export type MainNoteBody = z.input<typeof MainNoteBody>
export type NoteMetaBody = z.input<typeof NoteMetaBody>
export type CreateNoteBody = z.input<typeof CreateNoteBody>
