/**
 * 앱 피드백 API의 계약 (feedback/날짜.md · status.yaml · reviews.yaml, 서버 routes/feedback.ts · 화면 api/feedback.ts).
 * 연구 저장소 코멘트 올리기(/researches/:rid/records/…)도 같은 라우트 파일에 있어 여기 둔다.
 * 파일 형식은 서버 feedback.ts 머리 주석, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 피드백 모드는 등록 전에 수정 · 질문 · 제안을 고른다 (10/9). 디자인 · 버그 · 기능은 이전 기록, 미분류는 10/9 전 기록과 소개의 피드백 */
export const FEEDBACK_KINDS = ['디자인', '버그', '기능', '수정', '질문', '제안', '미분류'] as const
/** 처리 기록의 상태 (status.yaml state) */
export const FEEDBACK_STATES = ['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류', '승인'] as const
/** 결과를 알린 답에는 승인 · 반려, 결정을 묻는 답에는 진행 · 중단 (10/9) */
export const FEEDBACK_VERDICTS = ['승인', '반려', '진행', '중단'] as const

const kind = z.enum(FEEDBACK_KINDS)
/** 어디서 남겼는지. 없으면 맥 앱의 피드백 모드, '미리보기'는 채팅의 앱 미리보기 댓글 */
const source = z.literal('미리보기')

// ---------- 응답 ----------

/** 날짜 파일의 피드백 하나 */
export const FeedbackEntry = z.object({
  date: z.string(),
  time: z.string(),
  kind,
  /** 화면 부위 이름 */
  target: z.string(),
  text: z.string(),
  route: z.string().optional(),
  snippet: z.string().optional(),
  /** 열린 노트: "프로젝트 › 노트 이름 (경로)" */
  note: z.string().optional(),
  viewport: z.string().optional(),
  theme: z.string().optional(),
  /** 남길 때 돌고 있던 앱의 커밋 */
  version: z.string().optional(),
  /** 화면 그림 경로 (feedback/ 기준) */
  picture: z.string().optional(),
  source: source.optional(),
}).strict()

/** 다시 처리하기 전의 처리 (status.yaml revised) */
export const FeedbackRevision = z.object({
  /** 이 처리를 되돌려 보낸 반려의 시각 */
  at: z.string(),
  understood: z.string().optional(),
  cause: z.string().optional(),
  note: z.string().optional(),
  commit: z.string().optional(),
  handled_at: z.string().optional(),
  by: z.string().optional(),
}).strict()
/** 코멘트에 단 답 (status.yaml replies). to = 그 코멘트의 at */
export const FeedbackReply = z.object({ at: z.string(), to: z.string(), note: z.string(), by: z.string().optional() }).strict()
/** 처리 기록 (feedback/status.yaml 한 항목) */
export const FeedbackStatus = z.object({
  state: z.enum(FEEDBACK_STATES),
  commit: z.string().optional(),
  note: z.string().optional(),
  theme: z.string().optional(),
  clean: z.string().optional(),
  understood: z.string().optional(),
  cause: z.string().optional(),
  merged_into: z.string().optional(),
  area: z.string().optional(),
  /** 에이전트가 가린 종류. 있으면 날짜 파일의 종류 대신 쓴다 */
  kind: kind.optional(),
  ask: z.string().optional(),
  rework: z.string().optional(),
  revised: z.array(FeedbackRevision).optional(),
  /** 처리한 시각 · 처리한 에이전트 · 고친 코드가 들어간 앱 버전 · 전후 그림 · 코멘트에 단 답 */
  handled_at: z.string().optional(),
  by: z.string().optional(),
  version: z.string().optional(),
  pictures: z.array(z.string()).optional(),
  replies: z.array(FeedbackReply).optional(),
}).strict()

/** 승인·반려 한 번 */
export const FeedbackVerdictEntry = z.object({ verdict: z.enum(FEEDBACK_VERDICTS), at: z.string(), note: z.string().optional(), edited: z.string().optional() }).strict()
/** 최신 승인·반려와 그 전의 것들(history, 오래된 것부터) */
export const FeedbackReview = FeedbackVerdictEntry.extend({ history: z.array(FeedbackVerdictEntry).optional() }).strict()
/** 코멘트 한 번 (reviews.yaml comments): 승인·반려를 바꾸지 않는 말 */
export const FeedbackComment = z.object({ at: z.string(), note: z.string(), edited: z.string().optional() }).strict()
/** 같은 지적이라 대표 항목으로 합친 예전 코멘트 (원문 그대로) */
export const MergedFeedback = z.object({
  date: z.string(), time: z.string(), kind, target: z.string(), text: z.string(), n: z.number(),
  picture: z.string().optional(), source: source.optional(),
}).strict()
/** 피드백 하나와 처리 기록. status가 없으면 처리 대기 */
export const FeedbackItem = FeedbackEntry.extend({
  /** 같은 날 같은 키(분·부위) 중 몇 번째인지 (고치기·지우기에 씀) */
  n: z.number(),
  /** status.yaml · reviews.yaml의 키 */
  key: z.string(),
  status: FeedbackStatus.optional(),
  /** 사용자의 승인·반려 (feedback/reviews.yaml, 맥 앱만 씀) */
  review: FeedbackReview.optional(),
  /** 사용자의 코멘트 (시각순) */
  comments: z.array(FeedbackComment).optional(),
  merged: z.array(MergedFeedback).optional(),
  /** 반영 커밋이 지금 돌고 있는 앱에 들어 있는가 (실사용만, 모르면 없음) */
  inApp: z.boolean().optional(),
}).strict()

/** GET /feedback: 오늘 남긴 피드백과 피드백 모드 설정. issues = 공개 저장소의 새 이슈 주소 */
export const FeedbackToday = z.object({
  issues: z.string().nullable(),
  version: z.string().nullable(),
  enabled: z.boolean(),
  publishable: z.boolean(),
  autoPublish: z.boolean(),
  lastAutoPublish: z.object({ at: z.number(), error: z.string().nullable() }).strict().nullable(),
  entries: z.array(FeedbackEntry),
}).strict()
/** GET /feedback/all. user: 피드백을 남기는 GitHub 계정 (모르면 null), statusError: status.yaml을 읽지 못한 이유 */
export const FeedbackAll = z.object({ enabled: z.boolean(), entries: z.array(FeedbackItem), user: z.string().nullable(), statusError: z.string().nullable() }).strict()
/** POST /feedback */
export const FeedbackAdded = z.object({ entry: FeedbackEntry.extend({ n: z.number() }).strict() }).strict()
/** PUT /feedback/review (verdict: null이고 남은 것이 없으면 null) */
export const FeedbackReviewed = z.object({ review: FeedbackReview.nullable() }).strict()
/** POST /feedback/comment */
export const FeedbackCommented = z.object({ comment: FeedbackComment }).strict()
/** PATCH /feedback · /feedback/review */
export const FeedbackOk = z.object({ ok: z.literal(true) }).strict()
/** GET /feedback/unpublished · /researches/:rid/records/unpublished: 아직 GitHub에 없는 파일. count: 그 안의 피드백 항목 수 (피드백만) */
export const UnpublishedFiles = z.object({ files: z.array(z.string()), count: z.number().int().nonnegative().optional() }).strict()
/** POST /feedback/publish. commit: 이번에 새로 만든 커밋 (없으면 null) */
export const FeedbackPublished = z.object({ commit: z.string().nullable(), pushed: z.boolean(), message: z.string() }).strict()
/** POST /researches/:rid/records/publish: 올린 파일도 (서버 pathsync.ts) */
export const RecordsPublished = FeedbackPublished.extend({ files: z.array(z.string()) }).strict()

// ---------- 요청 ----------
// 빈 글, 길이, 있는 항목인지, 승인·진행을 쓸 수 있는 답인지는 서버 feedback.ts가 본다.

/** 피드백 하나 남기기. image = 화면 그림 (data:image/jpeg|png;base64,…) */
export const NewFeedbackBody = z.object({
  kind,
  target: z.string(),
  text: z.string(),
  route: z.string().optional(),
  snippet: z.string().optional(),
  note: z.string().optional(),
  viewport: z.string().optional(),
  theme: z.string().optional(),
  image: z.string().optional(),
})
/** 남긴 피드백 고치기(text) · 지우기(text: null) */
export const EditFeedbackBody = z.object({ date: z.string(), time: z.string(), target: z.string(), n: z.number().optional(), text: z.string().nullable() })
/** 승인·반려·진행·중단 (verdict: null이면 마지막 것을 취소) */
export const FeedbackReviewBody = z.object({ key: z.string(), verdict: z.enum(FEEDBACK_VERDICTS).nullable(), note: z.string().optional() })
export const FeedbackCommentBody = z.object({ key: z.string(), note: z.string() })
/** 내가 쓴 글(수정 요청 · 승인 · 코멘트) 고치기: at으로 찾는다 */
export const FeedbackNoteBody = z.object({ key: z.string(), at: z.string(), note: z.string() })

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]
export type FeedbackState = (typeof FEEDBACK_STATES)[number]
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]
export type FeedbackEntry = z.infer<typeof FeedbackEntry>
export type FeedbackRevision = z.infer<typeof FeedbackRevision>
export type FeedbackReply = z.infer<typeof FeedbackReply>
export type FeedbackStatus = z.infer<typeof FeedbackStatus>
export type FeedbackVerdictEntry = z.infer<typeof FeedbackVerdictEntry>
export type FeedbackReview = z.infer<typeof FeedbackReview>
export type FeedbackComment = z.infer<typeof FeedbackComment>
export type MergedFeedback = z.infer<typeof MergedFeedback>
export type FeedbackItem = z.infer<typeof FeedbackItem>
export type FeedbackToday = z.infer<typeof FeedbackToday>
export type FeedbackAll = z.infer<typeof FeedbackAll>
export type FeedbackAdded = z.infer<typeof FeedbackAdded>
export type FeedbackReviewed = z.infer<typeof FeedbackReviewed>
export type FeedbackCommented = z.infer<typeof FeedbackCommented>
export type FeedbackOk = z.infer<typeof FeedbackOk>
export type UnpublishedFiles = z.infer<typeof UnpublishedFiles>
export type FeedbackPublished = z.infer<typeof FeedbackPublished>
export type RecordsPublished = z.infer<typeof RecordsPublished>
export type NewFeedbackBody = z.input<typeof NewFeedbackBody>
export type EditFeedbackBody = z.input<typeof EditFeedbackBody>
export type FeedbackReviewBody = z.input<typeof FeedbackReviewBody>
export type FeedbackCommentBody = z.input<typeof FeedbackCommentBody>
export type FeedbackNoteBody = z.input<typeof FeedbackNoteBody>
