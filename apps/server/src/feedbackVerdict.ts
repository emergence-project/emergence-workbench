// 사용자 판정 규칙 (11/20): 피드백 화면과 에이전트 feedback_answer가 함께 쓴다. feedback.ts가 길어 나눴다
import type { FeedbackItem as FeedbackListItem, FeedbackVerdict } from '@rw/core/contract/feedback'
import { feedbackAsks } from './feedback.js'
import { t } from './i18n.js'

/**
 * 그 항목에 이 판정을 적을 수 없으면 그 까닭 (피드백 화면 PUT /api/feedback/review와 에이전트 feedback_answer의 verdict가 같이 쓴다).
 * 결정을 묻는 답에는 진행 · 중단 · 논의로, 결과를 알린 답에는 승인 · 진행 · 반려 · 논의로 답한다 (10/9, 11/8 안 C). 예전 보류에 단 반려는 그대로 받는다
 */
export function feedbackVerdictError(item: Pick<FeedbackListItem, 'status'>, verdict: FeedbackVerdict, note?: string): string | null {
  if (!item.status) return t('아직 처리하지 않은 항목입니다', 'This item has not been handled yet')
  const asks = feedbackAsks(item.status)
  if (verdict === '승인' && (asks || item.status.state === '보류')) return t('묻는 답은 승인하지 않고 진행이나 중단으로 답합니다', 'An answer that asks you is not approved: answer it with Proceed or Stop')
  if (verdict === '중단' && !asks) return t('중단은 에이전트가 물은 답에만 씁니다', 'Stop is only for answers where the agent asks you')
  if (verdict === '논의' && !note?.trim()) return t('논의는 무엇을 이야기할지 글을 적어 보냅니다', 'Write what to discuss before sending Discuss')
  return null
}
