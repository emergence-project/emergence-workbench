import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from './contract/feedback.js'
import { agentTurnReasons } from './feedback-buckets.js'

const NOW = new Date('2026-10-07T12:00').getTime()
const entry = (key: string, overrides: Partial<FeedbackItem> = {}): FeedbackItem => ({
  key, date: '2026-10-06', time: '10:29', kind: '수정', target: '피드백 › 머리줄', text: key, n: 1, ...overrides,
})

describe('agentTurnReasons (pnpm agent:feedback)', () => {
  it('에이전트 차례인 항목에만 이유를 붙인다', () => {
    expect(agentTurnReasons(entry('새'), NOW)).toEqual(['새 항목 · 수정'])
    expect(agentTurnReasons(entry('반려', { status: { state: '반영' }, review: { verdict: '반려', at: '2026-10-06T14:00' } }), NOW)).toEqual(['수정 요청 (2026-10-06T14:00) — 다시 처리 (규칙 9)'])
    expect(agentTurnReasons(entry('진행', { status: { state: '동의' }, review: { verdict: '진행', at: '2026-10-06T14:00' } }), NOW)).toEqual(['진행 (2026-10-06T14:00) — 물은 대로 처리 (규칙 9)'])
    expect(agentTurnReasons(entry('고친 반려', { status: { state: '반영', rework: '2026-10-06T14:00', handled_at: '2026-10-06T15:00' }, review: { verdict: '반려', at: '2026-10-06T14:00', edited: '2026-10-06T16:00' } }), NOW))
      .toEqual(['처리 뒤에 고친 반려 글 (2026-10-06T16:00) — 다시 읽고 처리'])
    expect(agentTurnReasons(entry('코멘트', { status: { state: '반영' }, review: { verdict: '승인', at: '2026-10-06T14:00' }, comments: [{ at: '2026-10-06T15:00', note: '왜?' }] }), NOW)).toEqual(['답 없는 코멘트 1개 (규칙 10: 답만 한다)'])
    expect(agentTurnReasons(entry('묻지 않은 보류', { status: { state: '보류' } }), NOW)).toEqual(['보류 (물음 없음)'])
    // 사용자 차례 · 끝난 항목
    expect(agentTurnReasons(entry('물은 보류', { status: { state: '보류', ask: '어떻게?' } }), NOW)).toEqual([])
    expect(agentTurnReasons(entry('승인', { status: { state: '반영' }, review: { verdict: '승인', at: '2026-10-06T14:00' } }), NOW)).toEqual([])
  })
})
