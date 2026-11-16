import { describe, expect, it } from 'vitest'
import { answerParts, resultOf } from './feedbackAnswerKind'
import type { FeedbackItem } from './api'

const item = (status?: Record<string, unknown>, review?: Record<string, unknown>) =>
  ({ date: '2026-11-08', time: '20:38', target: '피드백', n: 1, text: '', kind: '제안', ...(status ? { status } : {}), ...(review ? { review } : {}) }) as unknown as FeedbackItem

describe('답의 갈래 (11/16 시안 3절)', () => {
  it('처리 첫 줄에서 결론을 읽는다', () => {
    expect(resultOf('반영', '수정 완료 (#414)\n그림')).toBe('#414')
    expect(resultOf('반영', '', 'abcdef123')).toBe('abcdef1')
    expect(resultOf('답변', '답변: 없음 — 지금은')).toBe('없음')
    expect(resultOf('동의', '의견에 동의 (중간)')).toBe('크기 중간')
    expect(resultOf('거절', '거절')).toBe('')
  })
  it('구현 · 사실 · 계획 셋과 진행 상황(대기 · 끝남)', () => {
    expect(answerParts(item())).toEqual({ kind: '진행 상황', state: '대기', result: '' })
    expect(answerParts(item({ state: '반영', note: '수정 완료 (#417)' }))).toMatchObject({ kind: '구현', state: '반영', result: '#417' })
    expect(answerParts(item({ state: '답변', note: '답변: 일부' }))).toMatchObject({ kind: '사실', result: '일부' })
    expect(answerParts(item({ state: '보류', ask: '할까요?' }))).toMatchObject({ kind: '계획', state: '확인 필요' })
    expect(answerParts(item({ state: '나중에' }))).toMatchObject({ kind: '계획', state: '나중에' })
    expect(answerParts(item({ state: '반영' }, { verdict: '중단', at: '2026-11-09T10:00' }))).toMatchObject({ kind: '진행 상황', state: '끝남', tip: '중단함' })
  })
})
