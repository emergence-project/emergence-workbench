// ---------- 피드백 (feedback/날짜.md · status.yaml · reviews.yaml, 서버 feedback.ts) ----------
import { enc, json, req, send } from './http'
import type { EditFeedbackBody, FeedbackClaimBody, FeedbackPickableKind, FeedbackAdded, FeedbackAll, FeedbackCloud, FeedbackExported, FeedbackImported, FeedbackRelayed, FeedbackToday, FeedbackCommentBody, FeedbackCommented, FeedbackNoteBody, FeedbackOk, FeedbackPublished, FeedbackReviewBody, FeedbackReviewed, FeedbackVerdict, NewFeedbackBody, PersonalRepo, RecordsPublished, UnpublishedFiles } from '@rw/core/contract/feedback'

/** 피드백 하나와 처리 기록 (feedback/status.yaml). 기록이 없으면 처리 대기 */
export type { FeedbackKind, FeedbackPickableKind, FeedbackState, FeedbackVerdict, FeedbackVerdictEntry, FeedbackComment, FeedbackReply, FeedbackRevision, FeedbackReview, FeedbackItem } from '@rw/core/contract/feedback'

/** 피드백을 남기거나 고치면 알린다. 피드백 화면이 듣고 다시 읽는다 */
export const FEEDBACK_EVENT = 'rw-feedback-changed'
export const feedbackChanged = () => window.dispatchEvent(new Event(FEEDBACK_EVENT))

export const feedbackCalls = {
  /** 피드백 하나 남기기 (피드백 모드 밖에서: 소개 글 고치기 등). 화면 그림 없이 */
  addFeedback: (b: NewFeedbackBody) =>
    req('/api/feedback', send('POST', b)).then((r) => json<FeedbackAdded>(r)).then((r) => { feedbackChanged(); return r }),
  /** 남긴 피드백 고치기 · 지우기(text: null). 바뀌면 피드백 화면이 다시 읽도록 알린다 */
  editFeedback: (at: { date: string; time: string; target: string; n: number }, text: string | null, kind?: FeedbackPickableKind) =>
    req('/api/feedback', send('PATCH', { ...at, text, ...(kind && { kind }) } satisfies EditFeedbackBody)).then((r) => json<FeedbackOk>(r)).then((r) => { feedbackChanged(); return r }),
  /** 처리한 피드백 승인·반려(verdict: null이면 지움) */
  reviewFeedback: (key: string, verdict: FeedbackVerdict | null, note?: string) =>
    req('/api/feedback/review', send('PUT', { key, verdict, ...(note && { note }) } satisfies FeedbackReviewBody)).then((r) => json<FeedbackReviewed>(r)).then((r) => { feedbackChanged(); return r }),
  /** 코멘트 남기기 (처리는 그대로) */
  commentFeedback: (key: string, note: string) =>
    req('/api/feedback/comment', send('POST', { key, note } satisfies FeedbackCommentBody)).then((r) => json<FeedbackCommented>(r)).then((r) => { feedbackChanged(); return r }),
  /** 내가 쓴 글(수정 요청 · 승인 · 코멘트) 고치기 */
  editFeedbackNote: (key: string, at: string, note: string) =>
    req('/api/feedback/review', send('PATCH', { key, at, note } satisfies FeedbackNoteBody)).then((r) => json<FeedbackOk>(r)).then((r) => { feedbackChanged(); return r }),
  /** 오늘 남긴 피드백과 피드백 모드 설정 (올리기 · 저절로 올리기 · 새 이슈 주소) */
  feedbackState: () => req('/api/feedback').then((r) => json<FeedbackToday>(r)),
  /** user: 피드백을 남기는 GitHub 계정 (모르면 null) */
  feedbackAll: () => req('/api/feedback/all').then((r) => json<FeedbackAll>(r)),
  /** 에이전트의 맡음 풀기 (11/9) */
  releaseFeedbackClaim: (key: string) =>
    req('/api/feedback/claim', send('DELETE', { key } satisfies FeedbackClaimBody)).then((r) => json<FeedbackOk>(r)).then((r) => { feedbackChanged(); return r }),
  /** 개인 저장소(피드백 · 공통 규칙)가 GitHub와 같은지와 마지막 받기 (11/9, 저장소 화면 「앱」 묶음) */
  personalRepo: () => req('/api/feedback/personal').then((r) => json<PersonalRepo>(r)),
  syncPersonalRepo: () => req('/api/feedback/personal/sync', { method: 'POST' }).then((r) => json<PersonalRepo>(r)).then((r) => { feedbackChanged(); return r }),
  /** 클라우드 정기 작업이 피드백을 처리할지 (11/4) */
  feedbackCloud: () => req('/api/feedback/cloud').then((r) => json<FeedbackCloud>(r)),
  setFeedbackCloud: (enabled: boolean) => req('/api/feedback/cloud', send('PUT', { enabled })).then((r) => json<FeedbackCloud>(r)),
  /** 남긴 피드백을 파일 하나로 (내려받기 폴더, 11/8) */
  exportFeedback: () => req('/api/feedback/export', { method: 'POST' }).then((r) => json<FeedbackExported>(r)),
  /** 관리자 중계 서버로 바로 보내기 (11/8) */
  relayFeedback: () => req('/api/feedback/relay', { method: 'POST' }).then((r) => json<FeedbackRelayed>(r)),
  /** 받은 피드백 파일 가져오기: 파일 내용(JSON) 그대로 보낸다 */
  importFeedback: (bundle: unknown) => req('/api/feedback/import', send('POST', bundle)).then((r) => json<FeedbackImported>(r)).then((r) => { feedbackChanged(); return r }),
}

// ---------- 기록 올리기 (피드백·코멘트를 GitHub에) ----------

/** 이 맥에서 남긴 기록만 GitHub에 올린다. 작업 트리는 바꾸지 않는다 (서버 pathsync.ts). 피드백 올리기는 files 없이 */
export type RecordsPublishResult = FeedbackPublished | RecordsPublished

export const records = {
  /** 아직 GitHub에 없는 피드백 파일 (원격은 확인하지 않음) */
  feedbackUnpublished: () => req('/api/feedback/unpublished').then((r) => json<UnpublishedFiles>(r)),
  publishFeedback: () => req('/api/feedback/publish', { method: 'POST' }).then((r) => json<FeedbackPublished>(r)),
  /** 연구 저장소의 코멘트(workbench/comments/) */
  unpublished: (rid: string) => req(`/api/researches/${enc(rid)}/records/unpublished`).then((r) => json<UnpublishedFiles>(r)).then((r) => r.files),
  publish: (rid: string) => req(`/api/researches/${enc(rid)}/records/publish`, { method: 'POST' }).then((r) => json<RecordsPublished>(r)),
}
