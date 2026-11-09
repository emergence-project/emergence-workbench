/**
 * 앱 피드백 API의 계약 (feedback/날짜.md · status.yaml · reviews.yaml, 서버 routes/feedback.ts · 화면 api/feedback.ts).
 * 연구 저장소 코멘트 올리기(/researches/:rid/records/…)도 같은 라우트 파일에 있어 여기 둔다.
 * 칸 이름과 뜻은 피드백 규약 docs/feedback/README.md(다른 앱도 따른다), 파일 형식은 서버 feedback.ts 머리 주석, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'
import { FEEDBACK_MISSES } from '../feedback-lessons.js'
import { RepoInfo } from './research.js'

export { FEEDBACK_MISSES, type FeedbackMiss } from '../feedback-lessons.js'

/** 피드백 모드는 등록 전에 수정 · 질문 · 제안을 고른다 (10/9). 디자인 · 버그 · 기능은 이전 기록, 미분류는 10/9 전 기록과 소개의 피드백 */
export const FEEDBACK_KINDS = ['디자인', '버그', '기능', '수정', '질문', '제안', '미분류'] as const
/** 처리 기록의 상태 (status.yaml state) */
export const FEEDBACK_STATES = ['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류', '승인'] as const
/** 결과를 알린 답에는 승인 · 진행 · 반려, 결정을 묻는 답에는 진행 · 중단 (10/9). 논의는 두 답 모두 (11/8 안 C) */
export const FEEDBACK_VERDICTS = ['승인', '반려', '진행', '중단', '논의'] as const

const kind = z.enum(FEEDBACK_KINDS)
/** 어디서 남겼는지. 없으면 이 앱의 피드백 모드, '미리보기'는 채팅의 앱 미리보기 댓글, 그 밖은 피드백 파일을 보낸 사람 이름 (11/8, 서버 feedbackBundle.ts) */
const source = z.string()

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
  /** 이 처리가 반려된 까닭과, 다음에 다르게 할 것 한 줄 (다시 처리한 에이전트가 적는다) */
  miss: z.enum(FEEDBACK_MISSES).optional(),
  lesson: z.string().optional(),
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
  /** 에이전트가 맡아 처리 중 (feedback/handoff.yaml, 11/8). until이 지나면 저절로 풀린다 */
  claim: z.object({ machine: z.string(), at: z.string(), until: z.string() }).strict().optional(),
}).strict()
/** DELETE /feedback/claim: 그 항목의 맡음 풀기 */
export const FeedbackClaimBody = z.object({ key: z.string().min(1) })

/** GET /feedback: 오늘 남긴 피드백과 피드백 모드 설정. issues = 공개 저장소의 새 이슈 주소 */
export const FeedbackToday = z.object({
  issues: z.string().nullable(),
  version: z.string().nullable(),
  enabled: z.boolean(),
  publishable: z.boolean(),
  autoPublish: z.boolean(),
  /** 저절로 등록하면 남기고 나서 기다리는 초 (설정 › 동기화). 수동이면 null */
  delay: z.number().nullable().optional(),
  lastAutoPublish: z.object({ at: z.number(), error: z.string().nullable() }).strict().nullable(),
  /** 관리자 중계 서버로 바로 보내는 앱이면 보낼 항목 수와 마지막 보낸 때(ms) · 실패 문장 (11/8, 서버 feedbackRelay.ts). 아니면 null */
  /** 중계 서버로 보내기: from은 보내는 이름, named는 그것이 내 이름이나 GitHub 계정에서 왔는지(아니면 컴퓨터 사용자 이름) */
  relay: z.object({ pending: z.number(), at: z.number().nullable(), error: z.string().nullable(), from: z.string(), named: z.boolean() }).strict().nullable().optional(),
  entries: z.array(FeedbackEntry),
}).strict()
/** GET·PUT /feedback/cloud: 클라우드 정기 작업이 피드백을 처리할지 (피드백 폴더 cloud.yaml, 11/4) */
/**
 * GET /feedback/personal · POST /feedback/personal/sync (11/9, 11/8 20:45 질문 진행): 개인 저장소(피드백 · 공통 규칙) 사본이 GitHub와 같은지와 마지막 받기.
 * 저장소 화면의 「앱」 묶음이 보인다. 개인 저장소가 없는 앱(설치 파일)은 repo가 null
 */
export const PersonalRepo = z.object({ repo: RepoInfo.nullable(), lastPull: z.object({ at: z.number(), error: z.string().nullable() }).strict().nullable() }).strict()
export const FeedbackCloud = z.object({ enabled: z.boolean(), at: z.string().nullable() }).strict()
export const FeedbackCloudBody = z.object({ enabled: z.boolean() })
/** POST /feedback/export: 피드백을 묶은 파일(내려받기 폴더)과 담은 항목 수 */
export const FeedbackExported = z.object({ file: z.string(), count: z.number() }).strict()
/** POST /feedback/relay: 보낸 항목 수와 알림 문장 */
export const FeedbackRelayed = z.object({ count: z.number(), message: z.string() }).strict()
/** POST /feedback/import 몸: 보내기로 만든 파일 그대로 (날짜 → 날짜 파일 글, 그림 이름 → base64) */
export const FeedbackBundleBody = z.object({ format: z.string(), version: z.number().optional(), from: z.string().max(200), id: z.string().max(40).optional(), exportedAt: z.string().optional(), days: z.record(z.string(), z.string()), pictures: z.record(z.string(), z.string()).optional() })
/** POST /feedback/import: 보낸 사람(폴더 이름)과 가져온 항목 · 날짜 파일 · 그림 수 */
export const FeedbackImported = z.object({ from: z.string(), count: z.number(), days: z.number(), pictures: z.number() }).strict()
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
/** POST /researches/:rid/records/publish: 올린 파일도 (서버 pathsync.ts). adopted: 이 컴퓨터의 브랜치를 올린 커밋으로 옮겼는지, merged: GitHub의 글과 합친 파일 */
export const RecordsPublished = FeedbackPublished.extend({ files: z.array(z.string()), adopted: z.boolean().optional(), merged: z.array(z.string()).optional() }).strict()
/** GET /researches/:rid/records/publish: 기록 저절로 올리기가 켜졌는지와 마지막 결과(at: ms, error: 실패 문장) */
export const RecordsPublishState = z.object({
  autoPublish: z.boolean(),
  /** 자동으로 올리면 쓰고 나서 기다리는 초 (설정 › 동기화, 10/19). 수동이면 null */
  delay: z.number().nullable().optional(),
  last: z.object({ at: z.number(), error: z.string().nullable() }).strict().nullable(),
}).strict()

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
/** 사용자가 등록할 때 고르는 유형 (10/9). 고치기에서 kind를 보내면 머리줄의 유형이 바뀐다 (10/11) */
export const FEEDBACK_PICKABLE_KINDS = ['수정', '질문', '제안'] as const
export const EditFeedbackBody = z.object({ date: z.string(), time: z.string(), target: z.string(), n: z.number().optional(), text: z.string().nullable(), kind: z.enum(FEEDBACK_PICKABLE_KINDS).optional() })
/** 승인·반려·진행·중단·논의 (verdict: null이면 마지막 것을 취소) */
export const FeedbackReviewBody = z.object({ key: z.string(), verdict: z.enum(FEEDBACK_VERDICTS).nullable(), note: z.string().optional() })
export const FeedbackCommentBody = z.object({ key: z.string(), note: z.string() })
/** 내가 쓴 글(수정 요청 · 승인 · 코멘트) 고치기: at으로 찾는다 */
export const FeedbackNoteBody = z.object({ key: z.string(), at: z.string(), note: z.string() })

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]
export type FeedbackPickableKind = (typeof FEEDBACK_PICKABLE_KINDS)[number]
export type FeedbackState = (typeof FEEDBACK_STATES)[number]
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]
export type FeedbackEntry = z.infer<typeof FeedbackEntry>
export type PersonalRepo = z.infer<typeof PersonalRepo>
export type FeedbackCloud = z.infer<typeof FeedbackCloud>
export type FeedbackCloudBody = z.infer<typeof FeedbackCloudBody>
export type FeedbackExported = z.infer<typeof FeedbackExported>
export type FeedbackBundleBody = z.infer<typeof FeedbackBundleBody>
export type FeedbackImported = z.infer<typeof FeedbackImported>
export type FeedbackRelayed = z.infer<typeof FeedbackRelayed>
export type FeedbackRevision = z.infer<typeof FeedbackRevision>
export type FeedbackReply = z.infer<typeof FeedbackReply>
export type FeedbackStatus = z.infer<typeof FeedbackStatus>
export type FeedbackVerdictEntry = z.infer<typeof FeedbackVerdictEntry>
export type FeedbackReview = z.infer<typeof FeedbackReview>
export type FeedbackComment = z.infer<typeof FeedbackComment>
export type MergedFeedback = z.infer<typeof MergedFeedback>
export type FeedbackItem = z.infer<typeof FeedbackItem>
export type FeedbackClaimBody = z.infer<typeof FeedbackClaimBody>
export type FeedbackToday = z.infer<typeof FeedbackToday>
export type FeedbackAll = z.infer<typeof FeedbackAll>
export type FeedbackAdded = z.infer<typeof FeedbackAdded>
export type FeedbackReviewed = z.infer<typeof FeedbackReviewed>
export type FeedbackCommented = z.infer<typeof FeedbackCommented>
export type FeedbackOk = z.infer<typeof FeedbackOk>
export type UnpublishedFiles = z.infer<typeof UnpublishedFiles>
export type FeedbackPublished = z.infer<typeof FeedbackPublished>
export type RecordsPublished = z.infer<typeof RecordsPublished>
export type RecordsPublishState = z.infer<typeof RecordsPublishState>
export type NewFeedbackBody = z.input<typeof NewFeedbackBody>
export type EditFeedbackBody = z.input<typeof EditFeedbackBody>
export type FeedbackReviewBody = z.input<typeof FeedbackReviewBody>
export type FeedbackCommentBody = z.input<typeof FeedbackCommentBody>
export type FeedbackNoteBody = z.input<typeof FeedbackNoteBody>
