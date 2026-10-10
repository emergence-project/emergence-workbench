/**
 * 노트 기록 · PDF 코멘트 API의 계약 (workbench/comments/<대상>.md, 서버 routes/comments.ts · 화면 api/comments.ts).
 * 기록 올리기(records/unpublished · publish)는 서버 routes/feedback.ts에 있다.
 * 파일 형식은 docs/repo-format.md §6, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 코멘트는 예전 입력과 논문 API에서 쓰는 이름. 노트에서는 메모로 읽힌다 */
export const COMMENT_KINDS = ['메모', '할 일', '질문', '하이라이트', '코멘트'] as const
/** 질문은 대기·답함·끝냄, 할 일은 대기·끝냄. 나머지는 상태가 없다(null) */
export const COMMENT_STATES = ['대기', '답함', '끝냄'] as const
/** 하이라이트 색 (노트 기록과 논문 하이라이트) */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export const CommentKind = z.enum(COMMENT_KINDS)
export const CommentState = z.enum(COMMENT_STATES)
export const HighlightColor = z.enum(HIGHLIGHT_COLORS)

export const CommentAnswer = z.object({ by: z.string(), at: z.string(), body: z.string() }).strict()

const entry = {
  id: z.string(),
  kind: CommentKind,
  /** 머리의 위치 그대로 (p.4, L42 …) */
  where: z.string(),
  page: z.number().optional(),
  /** 고른 글의 사각형들 [x, y, w, h] — PDF 포인트, 쪽 왼쪽 위 원점 */
  rects: z.array(z.array(z.number())),
  quote: z.string().optional(),
  color: HighlightColor.optional(),
  line: z.number().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  unsorted: z.literal(true).optional(),
  split: z.literal(true).optional(),
  /** 본문에서 인용을 다시 찾지 못함 */
  lost: z.literal(true).optional(),
  /** 연결한 일지 항목의 날짜와 시각, 같은 분에 두 번 적었을 때의 보조 번호 */
  journal: z.string().optional(),
  journalIndex: z.number().optional(),
  body: z.string(),
  state: CommentState.nullable(),
  answers: z.array(CommentAnswer),
}
export const CommentEntry = z.object(entry).strict()
/** 노트 기록의 하이라이트: 기록 한 항목과 같은 모양에 종류·색이 정해진 것 */
export const NoteHighlight = z.object({ ...entry, kind: z.literal('하이라이트'), color: HighlightColor }).strict()

/** 대상 하나의 기록 파일 */
export const CommentFile = z.object({
  target: z.string(),
  title: z.string(),
  /** 대상의 원래 파일 (자료 PDF 이름, 노트 본문 경로 …) */
  source: z.string().optional(),
  hash: z.string(),
  comments: z.array(CommentEntry),
  highlights: z.array(NoteHighlight),
}).strict()
/** 프로젝트 적기의 기록 묶음 (하이라이트 없이) */
export const RecordFile = CommentFile.omit({ highlights: true }).strict()
/** 에이전트 함: 아직 답이 없는 질문 */
export const PendingQuestion = z.object({
  target: z.string(), title: z.string(), source: z.string().optional(), file: z.string(),
  id: z.string(), where: z.string(), quote: z.string().optional(), body: z.string(),
}).strict()

/** GET /comments */
export const CommentOverview = z.object({
  files: z.array(z.object({ target: z.string(), title: z.string(), source: z.string().optional(), count: z.number() }).strict()),
  pending: z.array(PendingQuestion),
}).strict()
/** GET /records */
export const RecordList = z.object({ files: z.array(RecordFile) }).strict()
/** POST /comments/:target: 덧붙인 항목 (하이라이트일 수도 있다)과 파일 hash */
export const CommentAdded = z.object({ entry: CommentEntry, hash: z.string() }).strict()

// ---------- 요청 ----------
// 길이, 빈 글, 종류에 맞는 상태, 사각형 모양은 서버 comments.ts가 본다 (모양이 틀린 사각형은 버린다).

const baseHash = z.string({ required_error: 'baseHash is required' })
export const NewCommentBody = z.object({
  /** 자동: 분류 전 기록 (메모로 적는다) */
  kind: z.union([CommentKind, z.literal('자동')]),
  /** 파일을 처음 만들 때 머리에 쓸 이름 (예: 논문 sample2007) */
  title: z.string(),
  source: z.string().optional(),
  page: z.number().optional(),
  rects: z.array(z.array(z.number())).optional(),
  quote: z.string().optional(),
  color: HighlightColor.optional(),
  line: z.number().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  text: z.string(),
})
export const ClassifyBody = z.object({ baseHash })
export const CommentChangeBody = z.object({ text: z.string().optional(), state: CommentState.optional(), color: HighlightColor.optional(), baseHash })
/** answer: 답 번호 */
export const ApplyAnswerBody = z.object({ answer: z.number(), baseHash })

export type CommentKind = z.infer<typeof CommentKind>
export type CommentState = z.infer<typeof CommentState>
export type HighlightColor = z.infer<typeof HighlightColor>
export type CommentAnswer = z.infer<typeof CommentAnswer>
export type CommentEntry = z.infer<typeof CommentEntry>
export type NoteHighlight = z.infer<typeof NoteHighlight>
export type CommentFile = z.infer<typeof CommentFile>
export type RecordFile = z.infer<typeof RecordFile>
export type PendingQuestion = z.infer<typeof PendingQuestion>
export type CommentOverview = z.infer<typeof CommentOverview>
export type RecordList = z.infer<typeof RecordList>
export type CommentAdded = z.infer<typeof CommentAdded>
export type NewCommentBody = z.input<typeof NewCommentBody>
export type ClassifyBody = z.input<typeof ClassifyBody>
export type CommentChangeBody = z.input<typeof CommentChangeBody>
export type ApplyAnswerBody = z.input<typeof ApplyAnswerBody>
