import type { FeedbackItem, FeedbackState, FeedbackVerdict } from './contract/feedback.js'

/**
 * 피드백 항목이 누구 차례인지 (피드백 화면 · 왼쪽 띠 · pnpm agent:feedback이 같은 규칙을 쓴다).
 * 피드백 규약의 "차례" 모듈이다: 규칙은 docs/feedback/README.md 6절, 다른 앱도 돌리는 시험 사례는 docs/feedback/cases.json.
 * 타입 말고는 아무것도 가져오지 않으므로 새 앱은 이 파일만 옮겨 써도 된다.
 */

/** 다시 처리하게 하는 답: 수정(자료 값 반려)과 진행(10/9) */
export const sendsBack = (v: FeedbackVerdict | string) => v === '반려' || v === '진행'

/** 다시 처리해서 사용자가 새 답을 승인·반려할 차례: 최신이 반려(진행)이고 에이전트가 그것을 다시 처리했다 (status.yaml rework = 그 답의 시각) */
export const reworked = (e: Pick<FeedbackItem, 'status' | 'review'>) =>
  !!e.review && sendsBack(e.review.verdict) && !!e.status?.rework && e.status.rework === e.review.at

/**
 * 반려한 처리는 에이전트가 다시 처리할 때(status.yaml rework = 반려 시각)까지 대기로 본다.
 * 다시 처리한 뒤에 그 수정 요청 글을 고쳤으면(edited가 처리 시각 handled_at보다 뒤) 다시 대기다.
 */
const reopened = (e: Pick<FeedbackItem, 'status' | 'review'>) => !!e.review && sendsBack(e.review.verdict)
  && (e.status?.rework !== e.review.at || (!!e.review.edited && (!e.status?.handled_at || e.review.edited > e.status.handled_at)))
/** 답을 기다리는 코멘트: 그 코멘트에 단 답(status.yaml replies의 to)이 없거나, 답한 뒤에 고쳤다 */
export const unansweredComments = (e: Pick<FeedbackItem, 'comments' | 'status'>) =>
  (e.comments ?? []).filter((c) => !(e.status?.replies ?? []).some((r) => r.to === c.at && (!c.edited || r.at >= c.edited)))
/**
 * 사용자의 결정을 묻는 답 (10/9): 수정의 확인 필요, 제안의 동의, 물음(ask)이 붙은 보류 · 답변.
 * 이 답에는 진행 · 중단으로, 결과를 알린 답(반영 · 답변 · 거절 · 나중에)에는 승인 · 수정으로 답한다.
 */
export const asksUser = (e: Pick<FeedbackItem, 'status'>) => {
  const st = e.status
  return !!st && (st.state === '확인 필요' || st.state === '동의' || ((st.state === '보류' || st.state === '답변') && !!st.ask))
}
/** 사용자가 승인 · 중단했거나 에이전트가 승인으로 기록한 항목은 끝난 것으로 본다(승인). */
export const stateOf = (e: FeedbackItem): FeedbackState | '대기' =>
  reopened(e) ? '대기' : (e.review?.verdict === '승인' || e.review?.verdict === '중단') && e.status ? '승인' : e.status?.state ?? '대기'

const CONFIRM_DAYS = 7
const recent = (e: FeedbackItem, now: number) => now - new Date(`${e.date}T00:00`).getTime() < CONFIRM_DAYS * 86_400_000
/** 답할 것: 에이전트가 결정을 물은 항목 (확인 필요 · 동의 · 물음이 붙은 보류 · 답변) */
export const needsAnswer = (e: FeedbackItem) => {
  const st = stateOf(e)
  return st !== '대기' && st !== '승인' && asksUser(e)
}
/** 확인할 것: 최근 반영·거절·답변·나중에 중 미확인 항목, 또는 반려 뒤 다시 처리한 항목. */
const CONFIRMED_BY_USER = ['반영', '거절', '답변', '나중에']
export const needsConfirm = (e: FeedbackItem, now = Date.now()) =>
  CONFIRMED_BY_USER.includes(stateOf(e)) && !asksUser(e) && ((!e.review && recent(e, now)) || reworked(e))

export type FeedbackBucket = '확인 필요' | '대기' | '완료'

/** 다음에 할 사람에 따라 모든 항목을 겹치지 않는 세 상태로 나눈다. 확인 필요 = 사용자 차례, 대기 = 에이전트 차례 */
export function feedbackBucket(e: FeedbackItem, now = Date.now()): FeedbackBucket {
  // 코멘트를 남기면 답할 때까지 에이전트 차례 (승인한 항목도 승인은 그대로)
  if (unansweredComments(e).length) return '대기'
  if (needsAnswer(e) || needsConfirm(e, now)) return '확인 필요'
  const state = stateOf(e)
  if (state === '대기' || (state === '보류' && !e.status?.ask)) return '대기'
  return '완료'
}

/**
 * 왼쪽 띠의 수: 피드백 화면 "확인 필요"에 드는 항목을 답할 것과 확인할 것으로 나눈다.
 * 답을 기다리는 코멘트가 있는 항목은 에이전트 차례라 세지 않는다 (10/10 14:33: 띠 5, 확인 필요 0).
 */
export function railCount(entries: FeedbackItem[], now = Date.now()) {
  const mine = entries.filter((e) => feedbackBucket(e, now) === '확인 필요')
  return { ask: mine.filter(needsAnswer).length, confirm: mine.length - mine.filter(needsAnswer).length }
}

/**
 * 에이전트 차례의 까닭 (규약 6절 · 에이전트 규칙 docs/feedback/agent.md). 앱마다 같은 이름을 쓴다.
 * comment 답 없는 코멘트 · rework 수정 요청 · proceed 진행 · edited 처리 뒤 고친 수정 요청 · new 새 항목 · hold 물음 없는 보류
 */
export type AgentTurn = 'comment' | 'rework' | 'proceed' | 'edited' | 'new' | 'hold'

/** 에이전트 차례(대기)인 항목의 까닭. 차례가 아니면 빈 목록 */
export function agentTurns(e: FeedbackItem, now = Date.now()): AgentTurn[] {
  if (feedbackBucket(e, now) !== '대기') return []
  const out: AgentTurn[] = []
  if (unansweredComments(e).length) out.push('comment')
  if (reopened(e)) out.push(e.status?.rework === e.review!.at ? 'edited' : e.review!.verdict === '진행' ? 'proceed' : 'rework')
  else if (!e.status) out.push('new')
  else if (e.status.state === '보류' && !e.status.ask) out.push('hold')
  return out
}

/** 사용자 차례(확인 필요)인 항목이 답할 것(answer: 결정을 물음)인지 확인할 것(confirm: 결과를 알림)인지. 차례가 아니면 null */
export function userTurn(e: FeedbackItem, now = Date.now()): 'answer' | 'confirm' | null {
  if (feedbackBucket(e, now) !== '확인 필요') return null
  return needsAnswer(e) ? 'answer' : 'confirm'
}

/** pnpm agent:feedback이 보이는 까닭 글. 할 일은 docs/feedback/agent.md 절 번호로 가리킨다 */
export function agentTurnReasons(e: FeedbackItem, now = Date.now()): string[] {
  return agentTurns(e, now).map((c) => {
    switch (c) {
      case 'comment': return `답 없는 코멘트 ${unansweredComments(e).length}개 (에이전트 규칙 5: 답만 한다)`
      case 'edited': return `처리 뒤에 고친 ${e.review!.verdict} 글 (${e.review!.edited}) — 다시 읽고 처리`
      case 'proceed': return `진행 (${e.review!.at}) — 물은 대로 처리 (에이전트 규칙 4)`
      case 'rework': return `수정 요청 (${e.review!.at}) — 다시 처리 (에이전트 규칙 4) · revised에 miss와 lesson`
      case 'new': return `새 항목${e.kind ? ` · ${e.kind}` : ''}`
      case 'hold': return '보류 (물음 없음)'
    }
  })
}
