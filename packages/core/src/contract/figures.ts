/**
 * 그림 라이브러리 API의 계약 (research-library/figures · workbench/figures, 서버 routes/figures.ts · 화면 api/figures.ts).
 * 그림 분류(/figures/subjects)는 subjects.ts에 있다.
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

export const FIGURE_KINDS = ['tikz', 'svg', 'png', 'jpg', 'pdf'] as const
/** 공용 그림의 scope (나머지는 프로젝트 id) */
export const LIBRARY_SCOPE = 'library'

/** 그림을 ![[이름]]으로 쓰는 노트 하나 */
export const FigureUse = z.object({
  /** 노트가 있는 프로젝트 (개념노트는 없음) */
  rid: z.string().optional(),
  type: z.enum(['note', 'calc', 'block', 'concept']),
  id: z.string(),
  /** 저장소 기준 본문 파일 */
  file: z.string(),
  title: z.string(),
}).strict()
export const FigureRow = z.object({
  /** <scope>/<파일 이름> */
  id: z.string(),
  /** 'library'(공용) 또는 프로젝트 id */
  scope: z.string(),
  file: z.string(),
  name: z.string(),
  kind: z.enum(FIGURE_KINDS),
  description: z.string().optional(),
  /** 분류 id (분류 나무가 없으면 빈 목록)와 고칠 때 보낼 figures.yaml hash */
  subjects: z.array(z.string()),
  subjectsHash: z.string(),
  /** 저장소 이름부터 적은 경로 */
  path: z.string(),
  mtime: z.number(),
  uses: z.array(FigureUse),
  /** tikz를 그림으로 바꾸려다 실패함 */
  broken: z.literal(true).optional(),
}).strict()
export const FigureProject = z.object({ id: z.string(), title: z.string() }).strict()
/** GET /figures */
export const FigureList = z.object({ library: z.string().nullable(), projects: z.array(FigureProject), figures: z.array(FigureRow) }).strict()
/** GET /figures/brief (그림 첫 화면). unclassified는 분류 나무가 있을 때만 */
export const FigureBrief = z.object({
  total: z.number(),
  projects: z.array(FigureProject),
  recent: z.array(FigureRow),
  check: z.object({ broken: z.number() }).strict(),
  stats: z.object({ tikz: z.number(), svg: z.number(), photo: z.number(), pdf: z.number(), unused: z.number(), unclassified: z.number().optional() }).strict(),
  store: z.object({ library: z.number(), projects: z.number(), inProjects: z.number() }).strict(),
}).strict()
/** PUT /figures/upload */
export const FigureAdded = z.object({ id: z.string() }).strict()
/** PATCH /figures/meta · POST /figures/open */
export const FigureOk = z.object({ ok: z.literal(true) }).strict()

// ---------- 요청 ----------
// 있는 그림인지, 이름에 쓸 수 없는 글자는 서버 figures.ts가 본다. 빈 글은 그 칸을 지운다.

export const FigureMetaBody = z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional() })
/** reveal: Finder에서 보기 (없으면 맥 기본 앱으로 연다) */
export const FigureOpenBody = z.object({ id: z.string(), reveal: z.boolean().optional() })

export type FigureKind = (typeof FIGURE_KINDS)[number]
export type FigureUse = z.infer<typeof FigureUse>
export type FigureRow = z.infer<typeof FigureRow>
export type FigureProject = z.infer<typeof FigureProject>
export type FigureList = z.infer<typeof FigureList>
export type FigureBrief = z.infer<typeof FigureBrief>
export type FigureAdded = z.infer<typeof FigureAdded>
export type FigureOk = z.infer<typeof FigureOk>
export type FigureMetaBody = z.input<typeof FigureMetaBody>
export type FigureOpenBody = z.input<typeof FigureOpenBody>
