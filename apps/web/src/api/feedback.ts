// ---------- 피드백 (feedback/날짜.md · status.yaml · reviews.yaml, 서버 feedback.ts) ----------
import { enc, json, req, send } from './http'

/** 피드백 하나와 처리 기록 (feedback/status.yaml). 기록이 없으면 처리 대기 */
export type FeedbackState = '반영' | '거절' | '확인 필요' | '답변' | '동의' | '나중에' | '보류' | '승인'
/** 결과를 알린 답에는 승인 · 반려, 결정을 묻는 답에는 진행 · 중단 (10/9) */
export type FeedbackVerdict = '승인' | '반려' | '진행' | '중단'
/** 승인·반려 한 번 */
export interface FeedbackVerdictEntry { verdict: FeedbackVerdict; at: string; note?: string; edited?: string }
/** 코멘트 한 번 (reviews.yaml comments): 승인·반려를 바꾸지 않는 말 */
export interface FeedbackComment { at: string; note: string; edited?: string }
/** 코멘트에 단 답 (status.yaml replies). to = 그 코멘트의 at */
export interface FeedbackReply { at: string; to: string; note: string; by?: string }
/** 다시 처리하기 전의 처리 (status.yaml revised) */
export interface FeedbackRevision { at: string; understood?: string; cause?: string; note?: string; commit?: string; handled_at?: string; by?: string }
/** 최신 승인·반려와 그 전의 것들(history, 오래된 것부터) */
export interface FeedbackReview extends FeedbackVerdictEntry { history?: FeedbackVerdictEntry[] }
export interface FeedbackItem {
  date: string; time: string; kind: string; target: string; text: string; n: number
  route?: string; note?: string; snippet?: string; viewport?: string; version?: string
  /** status.yaml·reviews.yaml의 키 */
  key: string
  status?: { state: FeedbackState; commit?: string; note?: string; theme?: string; clean?: string; understood?: string; cause?: string; merged_into?: string; area?: string; kind?: string; rework?: string; ask?: string; revised?: FeedbackRevision[]
    /** 처리한 시각 · 처리한 에이전트 · 고친 코드가 들어간 앱 버전 · 전후 그림 · 코멘트에 단 답 */
    handled_at?: string; by?: string; version?: string; pictures?: string[]; replies?: FeedbackReply[] }
  /** 사용자의 승인·반려 (feedback/reviews.yaml, 맥 앱만 씀) */
  review?: FeedbackReview
  /** 사용자의 코멘트 (시각순) */
  comments?: FeedbackComment[]
  picture?: string
  /** 어디서 남겼는지. 없으면 맥 앱의 피드백 모드, '미리보기'는 채팅의 앱 미리보기 댓글 (고치기·지우기 없음) */
  source?: '미리보기'
  /** 같은 지적이라 이 항목으로 합친 예전 코멘트 (원문 그대로) */
  merged?: { date: string; time: string; kind: string; target: string; text: string; n: number; picture?: string; source?: '미리보기' }[]
  /** 반영 커밋이 지금 돌고 있는 앱에 들어 있는가 (실사용만, 모르면 없음) */
  inApp?: boolean
}

/** 피드백을 남기거나 고치면 알린다. 피드백 화면이 듣고 다시 읽는다 */
export const FEEDBACK_EVENT = 'rw-feedback-changed'
export const feedbackChanged = () => window.dispatchEvent(new Event(FEEDBACK_EVENT))

export const feedbackCalls = {
  /** 피드백 하나 남기기 (피드백 모드 밖에서: 소개 글 고치기 등). 화면 그림 없이 */
  addFeedback: (b: { kind: '디자인' | '버그' | '기능' | '질문' | '미분류'; target: string; text: string; route?: string; snippet?: string }) =>
    req('/api/feedback', send('POST', b)).then((r) => json<{ entry: unknown }>(r)).then((r) => { feedbackChanged(); return r }),
  /** 남긴 피드백 고치기 · 지우기(text: null). 바뀌면 피드백 화면이 다시 읽도록 알린다 */
  editFeedback: (at: { date: string; time: string; target: string; n: number }, text: string | null) =>
    req('/api/feedback', send('PATCH', { ...at, text })).then((r) => json<{ ok: true }>(r)).then((r) => { feedbackChanged(); return r }),
  /** 처리한 피드백 승인·반려(verdict: null이면 지움) */
  reviewFeedback: (key: string, verdict: FeedbackVerdict | null, note?: string) =>
    req('/api/feedback/review', send('PUT', { key, verdict, ...(note && { note }) })).then((r) => json<{ review: FeedbackReview | null }>(r)).then((r) => { feedbackChanged(); return r }),
  /** 코멘트 남기기 (처리는 그대로) */
  commentFeedback: (key: string, note: string) =>
    req('/api/feedback/comment', send('POST', { key, note })).then((r) => json<{ comment: FeedbackComment }>(r)).then((r) => { feedbackChanged(); return r }),
  /** 내가 쓴 글(수정 요청 · 승인 · 코멘트) 고치기 */
  editFeedbackNote: (key: string, at: string, note: string) =>
    req('/api/feedback/review', send('PATCH', { key, at, note })).then((r) => json<{ ok: true }>(r)).then((r) => { feedbackChanged(); return r }),
  /** user: 피드백을 남기는 GitHub 계정 (모르면 null) */
  feedbackAll: () => req('/api/feedback/all').then((r) => json<{ enabled: boolean; entries: FeedbackItem[]; user: string | null; statusError: string | null }>(r)),
}

// ---------- 기록 올리기 (피드백·코멘트를 GitHub에) ----------

/** 이 맥에서 남긴 기록만 GitHub에 올린다. 작업 트리는 바꾸지 않는다 (서버 pathsync.ts) */
export interface RecordsPublishResult { commit: string | null; pushed: boolean; message: string; files?: string[] }

export const records = {
  /** 아직 GitHub에 없는 피드백 파일 (원격은 확인하지 않음) */
  feedbackUnpublished: () => req('/api/feedback/unpublished').then((r) => json<{ files: string[] }>(r)).then((r) => r.files),
  publishFeedback: () => req('/api/feedback/publish', { method: 'POST' }).then((r) => json<RecordsPublishResult>(r)),
  /** 연구 저장소의 코멘트(workbench/comments/) */
  unpublished: (rid: string) => req(`/api/researches/${enc(rid)}/records/unpublished`).then((r) => json<{ files: string[] }>(r)).then((r) => r.files),
  publish: (rid: string) => req(`/api/researches/${enc(rid)}/records/publish`, { method: 'POST' }).then((r) => json<RecordsPublishResult>(r)),
}
