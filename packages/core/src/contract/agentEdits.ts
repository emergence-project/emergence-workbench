/**
 * 에이전트 고침 검토 API의 계약 (앱 설정 폴더의 agent-edits.json, 서버 routes/agentEdits.ts · 화면 api/agentEdits.ts).
 * 에이전트 쓰기(/agent-edits/write)는 MCP edit_concept · edit_note가 부른다.
 */
import { z } from 'zod'
import { CommentFile } from './comments.js'

/** 고친 대상 */
export const EditTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('concept'), id: z.string() }).strict(),
  z.object({ kind: z.literal('note'), rid: z.string(), file: z.string() }).strict(),
])
/** 검토를 기다리는 노트 한 줄 (changes = 바뀐 곳 수) */
export const EditReviewRow = z.object({ key: z.string(), target: EditTarget, title: z.string(), since: z.string(), updated: z.string(), agents: z.array(z.string()), changes: z.number() }).strict()
/** 확인된 노트에 대한 에이전트 쓰기 시도 (사용자 차례) */
export const EditAttempt = z.object({ key: z.string(), target: EditTarget, title: z.string(), at: z.string(), agent: z.string().optional(), summary: z.string().optional() }).strict()
/**
 * 바뀐 곳 하나 (문단 하나): 기준판 조각 [b0, b1)과 지금 조각 [c0, c1). section = 든 절 (「Setup › Symbols」, 절 밖이면 없음).
 * prev · next = 앞뒤의 바뀌지 않은 문단 (화면의 펼치기, 다른 바뀐 곳이 붙어 있거나 글 끝이면 없음)
 */
/** 에이전트가 고칠 때 바꾼 글마다 남긴 이유 한 줄 (10/14, MCP edit_note의 edits[].reason) */
export const EditReason = z.object({ reason: z.string(), by: z.string().optional(), at: z.string() }).strict()
export const EditHunk = z.object({ id: z.string(), b0: z.number(), b1: z.number(), c0: z.number(), c1: z.number(), base: z.string(), current: z.string(), section: z.string().optional(), prev: z.string().optional(), next: z.string().optional(), reason: EditReason.optional() }).strict()
export const EditReview = z.object({
  key: z.string(), target: EditTarget, title: z.string(), hash: z.string(), since: z.string(), updated: z.string(),
  agents: z.array(z.string()),
  /** 에이전트가 고칠 때 남긴 한 줄들 (최근 것이 뒤) */
  notes: z.array(z.string()),
  hunks: z.array(EditHunk),
  /** 바뀐 곳에서 묻기(10/14)가 쓰는 노트 기록 대상 (comments/<대상>.md). 개념노트 · 기록을 붙이지 않는 노트는 없음 */
  record: z.object({ target: z.string(), title: z.string(), source: z.string().optional() }).strict().optional(),
}).strict()
/** GET /agent-edits */
export const EditList = z.object({ reviews: z.array(EditReviewRow), attempts: z.array(EditAttempt) }).strict()
/** GET · POST /agent-edits/review. 바뀐 곳이 없으면 null */
export const EditReviewOne = z.object({ review: EditReview.nullable() }).strict()
/** POST /agent-edits/write (확인된 노트를 허락 없이 쓰면 428) */
export const AgentWritten = z.object({ ok: z.literal(true), hash: z.string(), changes: z.number(), key: z.string() }).strict()
/** POST /agent-edits/discuss: 묻기를 남긴 뒤의 검토와 그 노트의 기록 파일 (답은 나중에 덧붙는다) */
export const EditDiscussed = z.object({ review: EditReview, file: CommentFile }).strict()
/** DELETE /agent-edits/attempts */
export const EditOk = z.object({ ok: z.literal(true) }).strict()

// ---------- 요청 ----------
// 바뀐 곳이 아직 있는지, hash가 지금 노트와 같은지는 서버 agentEdits.ts가 본다.

export const EDIT_ACTIONS = ['accept', 'revert', 'edit'] as const
/** hash: 검토를 열 때 받은 노트 hash. text: 직접 고치기(edit)의 글 */
export const DecideBody = z.object({ key: z.string(), hash: z.string(), hunk: z.string(), action: z.enum(EDIT_ACTIONS), text: z.string().optional() })
/** 바뀐 곳에서 묻기 (10/14): 질문은 답만 받고, 수정은 에이전트가 그 문단을 다시 고치게 한다 */
export const EDIT_ASKS = ['질문', '수정'] as const
export const DiscussBody = z.object({ key: z.string(), hash: z.string(), hunk: z.string(), ask: z.enum(EDIT_ASKS), text: z.string() })
/** 에이전트 쓰기 (MCP edit_note · edit_concept). target 모양은 서버가 더 자세한 글로 검사한다 */
export const WriteBody = z.object({
  target: z.unknown(),
  baseHash: z.string(),
  edits: z.array(z.object({ old: z.string(), new: z.string(), reason: z.string().optional() })),
  approved: z.boolean().optional(),
  agent: z.string().optional(),
  summary: z.string().optional(),
})

export type EditTarget = z.infer<typeof EditTarget>
export type EditReviewRow = z.infer<typeof EditReviewRow>
export type EditAttempt = z.infer<typeof EditAttempt>
export type EditHunk = z.infer<typeof EditHunk>
export type EditReason = z.infer<typeof EditReason>
export type EditReview = z.infer<typeof EditReview>
export type EditList = z.infer<typeof EditList>
export type EditReviewOne = z.infer<typeof EditReviewOne>
export type AgentWritten = z.infer<typeof AgentWritten>
export type EditOk = z.infer<typeof EditOk>
export type EditDiscussed = z.infer<typeof EditDiscussed>
export type EditAction = (typeof EDIT_ACTIONS)[number]
export type DecideBody = z.input<typeof DecideBody>
export type EditAsk = (typeof EDIT_ASKS)[number]
export type DiscussBody = z.input<typeof DiscussBody>
