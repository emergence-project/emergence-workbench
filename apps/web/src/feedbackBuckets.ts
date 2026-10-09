import type { FeedbackItem, FeedbackState } from './api'
import { reworked } from './feedbackThread'

/**
 * 반려한 처리는 에이전트가 다시 처리할 때(status.yaml rework = 반려 시각)까지 대기로 본다.
 * 다시 처리한 뒤에 그 수정 요청 글을 고쳤으면(edited가 처리 시각 handled_at보다 뒤) 다시 대기다.
 */
const reopened = (e: FeedbackItem) => e.review?.verdict === '반려'
  && (e.status?.rework !== e.review.at || (!!e.review.edited && (!e.status?.handled_at || e.review.edited > e.status.handled_at)))
/** 답을 기다리는 코멘트: 그 코멘트에 단 답(status.yaml replies의 to)이 없거나, 답한 뒤에 고쳤다 */
export const unansweredComments = (e: Pick<FeedbackItem, 'comments' | 'status'>) =>
  (e.comments ?? []).filter((c) => !(e.status?.replies ?? []).some((r) => r.to === c.at && (!c.edited || r.at >= c.edited)))
/** 사용자가 승인했거나 에이전트가 승인으로 기록한 항목은 확인을 묻지 않는다. */
export const stateOf = (e: FeedbackItem): FeedbackState | '대기' =>
  reopened(e) ? '대기' : e.review?.verdict === '승인' && e.status ? '승인' : e.status?.state ?? '대기'

const CONFIRM_DAYS = 7
const recent = (e: FeedbackItem, now: number) => now - new Date(`${e.date}T00:00`).getTime() < CONFIRM_DAYS * 86_400_000
/** 답할 것: 에이전트가 다시 확인을 물은 수정, 만들지 승인을 기다리는 제안(동의), 물은 보류 항목. */
export const needsAnswer = (e: FeedbackItem) => {
  const st = stateOf(e)
  return st === '확인 필요' || st === '동의' || (st === '보류' && !!e.status?.ask)
}
/** 확인할 것: 최근 반영·거절·답변·나중에 중 미확인 항목, 또는 반려 뒤 다시 처리한 항목. */
const CONFIRMED_BY_USER = ['반영', '거절', '답변', '나중에']
export const needsConfirm = (e: FeedbackItem, now = Date.now()) =>
  CONFIRMED_BY_USER.includes(stateOf(e)) && ((!e.review && recent(e, now)) || reworked(e))

export type FeedbackBucket = '확인 필요' | '대기' | '완료'

/** 다음에 할 사람에 따라 모든 항목을 겹치지 않는 세 상태로 나눈다. */
export function feedbackBucket(e: FeedbackItem, now = Date.now()): FeedbackBucket {
  // 코멘트를 남기면 답할 때까지 에이전트 차례 (승인한 항목도 승인은 그대로)
  if (unansweredComments(e).length) return '대기'
  if (needsAnswer(e) || needsConfirm(e, now)) return '확인 필요'
  const state = stateOf(e)
  if (state === '대기' || (state === '보류' && !e.status?.ask)) return '대기'
  return '완료'
}
