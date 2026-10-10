/**
 * 논문 라이브러리 API의 계약 (research-library/references.bib · papers.yaml · comments/<키>/, 서버 routes/papers.ts · 화면 api/papers.ts).
 * 논문 분류(/papers/:key/subjects)는 subjects.ts에 있다.
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'
import { CommentFile, CommentState, HighlightColor } from './comments.js'

export const PDF_WHERE = ['local', 'cloud', 'none'] as const
/** PDF 폴더가 어느 클라우드인지 (맥의 폴더 이름으로) */
export const CLOUD_KINDS = ['icloud', 'drive', 'local'] as const

export const PaperRow = z.object({
  key: z.string(),
  /** 분류 id (분류 나무가 없으면 빈 목록)와 고칠 때 보낼 papers.yaml hash */
  subjects: z.array(z.string()),
  subjectsHash: z.string(),
  /** bib 항목 종류 (article, book …) */
  type: z.string(),
  kind: z.enum(['paper', 'book']),
  title: z.string(),
  /** 성만 */
  authors: z.array(z.string()),
  year: z.string().optional(),
  venue: z.string().optional(),
  eprint: z.string().optional(),
  doi: z.string().optional(),
  projects: z.array(z.string()),
  /** 프로젝트 bib에서 저절로 이어진 것 (뺄 수 없음) */
  autoProjects: z.array(z.string()),
  pdf: z.object({ where: z.enum(PDF_WHERE), file: z.string().optional() }).strict(),
  comments: z.number(),
  waiting: z.number(),
  /** 답이 왔고 아직 끝내지 않은 질문 수 (사용자 차례) */
  answered: z.number(),
  /** references.bib에서 몇 번째 항목인지 (0부터, 큰 것이 최근에 더한 것) */
  added: z.number(),
  /** 이 맥에서 마지막으로 연 때 (ms) */
  opened: z.number().optional(),
  /** 문헌노트가 있으면 그 id */
  note: z.string().optional(),
}).strict()
export const PaperProject = z.object({ id: z.string(), title: z.string() }).strict()
/** GET /papers */
export const PaperList = z.object({ library: z.string().nullable(), folders: z.array(z.string()), projects: z.array(PaperProject), papers: z.array(PaperRow) }).strict()
/** GET /papers/brief (논문 첫 화면). unclassified는 분류 나무가 있을 때만 */
export const PaperBrief = z.object({
  library: z.boolean(),
  total: z.number(),
  recent: z.array(PaperRow),
  projects: z.array(PaperProject),
  check: z.object({ noFolder: z.boolean(), answered: z.number() }).strict(),
  stats: z.object({ noPdf: z.number(), arxiv: z.number(), unlinked: z.number(), papers: z.number(), books: z.number(), unclassified: z.number().optional() }).strict(),
  folders: z.array(z.object({ path: z.string(), cloud: z.enum(CLOUD_KINDS) }).strict()),
}).strict()
export const PaperFolder = z.object({ path: z.string(), exists: z.boolean(), cloud: z.enum(CLOUD_KINDS) }).strict()
/** GET · PUT /papers/folders */
export const PaperFolders = z.object({ folders: z.array(PaperFolder) }).strict()
/** POST /papers · PUT /papers/upload */
export const PaperAdded = z.object({ key: z.string(), existed: z.boolean(), pdf: z.string().optional(), pdfError: z.string().optional() }).strict()
/** PUT /papers/:key/projects */
export const PaperProjects = z.object({ projects: z.array(z.string()) }).strict()

/** 논문 하이라이트. 쪽은 1부터, 사각형은 화면 좌표(왼쪽 위 원점 [x, y, w, h]) */
export const PaperHighlight = z.object({ id: z.string(), page: z.number(), rects: z.array(z.array(z.number())), pageHeight: z.number(), color: HighlightColor, quote: z.string().optional() }).strict()
/** 논문의 코멘트 파일: 연구노트 PDF와 같은 모양 + 하이라이트, 코멘트마다 남긴 프로젝트 */
export const PaperCommentFile = CommentFile.extend({ highlights: z.array(PaperHighlight), projects: z.record(z.string()) }).strict()
/** POST /papers/:key/comments */
export const PaperNoteAdded = z.object({ id: z.string(), file: PaperCommentFile }).strict()

// ---------- 요청 ----------
// 있는 프로젝트인지, 폴더가 있는지, 번호 모양, 종류(메모 · 코멘트 · 질문 · 하이라이트)와 하이라이트의 쪽·자리는 서버가 본다.

export const SetPaperProjectsBody = z.object({ projects: z.array(z.string()) })
/** id: arXiv 번호나 DOI */
export const AddPaperBody = z.object({ id: z.string() })
export const SetPdfFoldersBody = z.object({ folders: z.array(z.string()) })
/** 종류가 없으면 코멘트. 화면은 노트 기록과 같은 종류 이름을 보내므로 종류는 글로 받고 서버가 거른다 */
export const NewPaperNoteBody = z.object({
  kind: z.string().optional(),
  text: z.string().optional(),
  page: z.number().optional(),
  rects: z.array(z.array(z.number())).optional(),
  pageHeight: z.number().optional(),
  quote: z.string().optional(),
  color: HighlightColor.optional(),
  project: z.string().optional(),
})
export const PaperNoteChangeBody = z.object({ state: CommentState.optional(), color: HighlightColor.optional(), baseHash: z.string() })

export type PdfWhere = (typeof PDF_WHERE)[number]
export type CloudKind = (typeof CLOUD_KINDS)[number]
export type PaperRow = z.infer<typeof PaperRow>
export type PaperProject = z.infer<typeof PaperProject>
export type PaperList = z.infer<typeof PaperList>
export type PaperBrief = z.infer<typeof PaperBrief>
export type PaperFolder = z.infer<typeof PaperFolder>
export type PaperFolders = z.infer<typeof PaperFolders>
export type PaperAdded = z.infer<typeof PaperAdded>
export type PaperProjects = z.infer<typeof PaperProjects>
export type PaperHighlight = z.infer<typeof PaperHighlight>
export type PaperCommentFile = z.infer<typeof PaperCommentFile>
export type PaperNoteAdded = z.infer<typeof PaperNoteAdded>
export type SetPaperProjectsBody = z.input<typeof SetPaperProjectsBody>
export type AddPaperBody = z.input<typeof AddPaperBody>
export type SetPdfFoldersBody = z.input<typeof SetPdfFoldersBody>
export type NewPaperNoteBody = z.input<typeof NewPaperNoteBody>
export type PaperNoteChangeBody = z.input<typeof PaperNoteChangeBody>
