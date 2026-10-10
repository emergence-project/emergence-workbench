/**
 * 에이전트 고침 검토 API의 계약 (앱 설정 폴더의 agent-edits.json, 서버 routes/agentEdits.ts · 화면 api/agentEdits.ts).
 * 에이전트 쓰기(/agent-edits/write)는 MCP edit_concept · edit_note가 부른다.
 */
import { z } from 'zod'

/** 고친 대상 */
export const EditTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('concept'), id: z.string() }).strict(),
  z.object({ kind: z.literal('note'), rid: z.string(), file: z.string() }).strict(),
])
/** 검토를 기다리는 노트 한 줄 (changes = 바뀐 곳 수) */
export const EditReviewRow = z.object({ key: z.string(), target: EditTarget, title: z.string(), since: z.string(), updated: z.string(), agents: z.array(z.string()), changes: z.number() }).strict()
/** 확인된 노트에 대한 에이전트 쓰기 시도 (사용자 차례) */
export const EditAttempt = z.object({ key: z.string(), target: EditTarget, title: z.string(), at: z.string(), agent: z.string().optional(), summary: z.string().optional() }).strict()
/** 바뀐 곳 하나: 기준판 조각 [b0, b1)과 지금 조각 [c0, c1) */
export const EditHunk = z.object({ id: z.string(), b0: z.number(), b1: z.number(), c0: z.number(), c1: z.number(), base: z.string(), current: z.string() }).strict()
export const EditReview = z.object({
  key: z.string(), target: EditTarget, title: z.string(), hash: z.string(), since: z.string(), updated: z.string(),
  agents: z.array(z.string()),
  /** 에이전트가 고칠 때 남긴 한 줄들 (최근 것이 뒤) */
  notes: z.array(z.string()),
  hunks: z.array(EditHunk),
}).strict()
/** GET /agent-edits */
export const EditList = z.object({ reviews: z.array(EditReviewRow), attempts: z.array(EditAttempt) }).strict()
/** GET · POST /agent-edits/review. 바뀐 곳이 없으면 null */
export const EditReviewOne = z.object({ review: EditReview.nullable() }).strict()
/** POST /agent-edits/write (확인된 노트를 허락 없이 쓰면 428) */
export const AgentWritten = z.object({ ok: z.literal(true), hash: z.string(), changes: z.number(), key: z.string() }).strict()
/** DELETE /agent-edits/attempts */
export const EditOk = z.object({ ok: z.literal(true) }).strict()

// ---------- 요청 ----------
// 바뀐 곳이 아직 있는지, hash가 지금 노트와 같은지는 서버 agentEdits.ts가 본다.

export const EDIT_ACTIONS = ['accept', 'revert', 'edit'] as const
/** hash: 검토를 열 때 받은 노트 hash. text: 직접 고치기(edit)의 글 */
export const DecideBody = z.object({ key: z.string(), hash: z.string(), hunk: z.string(), action: z.enum(EDIT_ACTIONS), text: z.string().optional() })

export type EditTarget = z.infer<typeof EditTarget>
export type EditReviewRow = z.infer<typeof EditReviewRow>
export type EditAttempt = z.infer<typeof EditAttempt>
export type EditHunk = z.infer<typeof EditHunk>
export type EditReview = z.infer<typeof EditReview>
export type EditList = z.infer<typeof EditList>
export type EditReviewOne = z.infer<typeof EditReviewOne>
export type AgentWritten = z.infer<typeof AgentWritten>
export type EditOk = z.infer<typeof EditOk>
export type EditAction = (typeof EDIT_ACTIONS)[number]
export type DecideBody = z.input<typeof DecideBody>
