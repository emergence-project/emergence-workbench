import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from './api'
import { feedbackBucket, stateOf, type FeedbackBucket } from './feedbackBuckets'

const NOW = new Date('2026-10-07T12:00').getTime()
const REJECTED_AT = '2026-10-06T14:00'
const BUCKETS: FeedbackBucket[] = ['확인 필요', '대기', '완료']
const entry = (key: string, overrides: Partial<FeedbackItem> = {}): FeedbackItem => ({
  key, date: '2026-10-06', time: '10:29', kind: '디자인', target: '피드백 › 머리줄', text: key, n: 1,
  ...overrides,
})

describe('feedbackBucket', () => {
  it('다음에 할 사람에 따라 모든 항목을 겹치거나 빠지는 것 없이 나눈다', () => {
    const entries = [
      entry('새 피드백'),
      entry('반려 후 처리 전', { status: { state: '반영' }, review: { verdict: '반려', at: REJECTED_AT } }),
      entry('답을 기다리는 보류', { status: { state: '보류', ask: '어떤 배치로 할까요?' } }),
      entry('묻지 않은 보류', { status: { state: '보류' } }),
      entry('최근 반영', { status: { state: '반영' } }),
      entry('오래된 반영', { date: '2026-09-20', status: { state: '반영' } }),
      entry('사용자 승인', { status: { state: '반영' }, review: { verdict: '승인', at: '2026-10-07T10:00' } }),
      entry('최근 답변', { status: { state: '답변' } }),
      entry('오래된 답변', { date: '2026-09-20', status: { state: '답변' } }),
      entry('오래된 반려를 다시 처리함', { date: '2026-09-20', status: { state: '반영', rework: REJECTED_AT }, review: { verdict: '반려', at: REJECTED_AT } }),
      entry('처리 기록에서 승인함', { status: { state: '승인' } }),
    ]
    const expected: Record<FeedbackBucket, string[]> = {
      '확인 필요': ['답을 기다리는 보류', '최근 반영', '최근 답변', '오래된 반려를 다시 처리함'],
      '대기': ['새 피드백', '반려 후 처리 전', '묻지 않은 보류'],
      '완료': ['오래된 반영', '사용자 승인', '오래된 답변', '처리 기록에서 승인함'],
    }
    const groups = BUCKETS.map((bucket) => entries.filter((e) => feedbackBucket(e, NOW) === bucket))

    BUCKETS.forEach((bucket, index) => expect(groups[index]!.map((e) => e.key)).toEqual(expected[bucket]))
    for (const e of entries) expect(groups.filter((group) => group.includes(e))).toHaveLength(1)
    expect(groups.flat()).toHaveLength(entries.length)
  })

  it('결정을 묻는 답은 진행이면 다시 처리할 때까지 대기, 중단이면 끝, 물음이 붙은 답변은 답할 것 (10/9)', () => {
    const asked = { state: '확인 필요' as const, ask: '폴더까지 지울까요?' }
    expect(feedbackBucket(entry('질의', { status: asked }), NOW)).toBe('확인 필요')
    expect(feedbackBucket(entry('질의 진행', { status: asked, review: { verdict: '진행', at: REJECTED_AT } }), NOW)).toBe('대기')
    expect(feedbackBucket(entry('진행 뒤 처리', { status: { state: '반영', rework: REJECTED_AT }, review: { verdict: '진행', at: REJECTED_AT } }), NOW)).toBe('확인 필요')
    expect(feedbackBucket(entry('질의 중단', { status: asked, review: { verdict: '중단', at: REJECTED_AT } }), NOW)).toBe('완료')
    expect(feedbackBucket(entry('동의 중단', { status: { state: '동의' }, review: { verdict: '중단', at: REJECTED_AT } }), NOW)).toBe('완료')
    const bug = entry('답하다 버그', { date: '2026-09-20', status: { state: '답변', ask: '수정으로 바꿀까요?' } })
    expect(feedbackBucket(bug, NOW)).toBe('확인 필요')
    expect(stateOf(bug)).toBe('답변')
  })

  it.each(['반영', '답변'] as const)('%s의 확인 기간은 남긴 날짜 0시부터 정확히 7일 미만이다', (state) => {
    const e = entry('확인 기간 경계', { date: '2026-09-30', time: '23:59', status: { state } })
    const expires = new Date(`${e.date}T00:00`).getTime() + 7 * 86_400_000
    expect(feedbackBucket(e, expires - 1)).toBe('확인 필요')
    expect(feedbackBucket(e, expires)).toBe('완료')
    expect(feedbackBucket(e, expires + 1)).toBe('완료')
  })

  it('최신 반려를 처리하지 않았으면 예전 재처리 기록이나 질문이 있어도 대기다', () => {
    const e = entry('다시 반려됨', {
      status: { state: '보류', ask: '이대로 할까요?', rework: '2026-10-05T14:00' },
      review: { verdict: '반려', at: REJECTED_AT },
    })
    expect(feedbackBucket(e, NOW)).toBe('대기')
  })

  it('승인은 보류 질문과 이전 반려의 재처리 기록보다 우선한다', () => {
    const approvedQuestion = entry('질문 승인', {
      status: { state: '보류', ask: '이대로 할까요?' },
      review: { verdict: '승인', at: '2026-10-07T10:00' },
    })
    const approvedRework = entry('재처리 승인', {
      status: { state: '반영', rework: REJECTED_AT },
      review: { verdict: '승인', at: '2026-10-07T10:00', history: [{ verdict: '반려', at: REJECTED_AT }] },
    })
    expect(feedbackBucket(approvedQuestion, NOW)).toBe('완료')
    expect(feedbackBucket(approvedRework, NOW)).toBe('완료')
  })

  it('답을 기다리는 코멘트가 있으면 대기, 답한 뒤에 고치면 다시 대기 (승인은 그대로)', () => {
    const approved = { status: { state: '반영' as const }, review: { verdict: '승인' as const, at: '2026-10-07T10:00' } }
    const asked = entry('코멘트', { ...approved, comments: [{ at: '2026-10-07T11:00', note: '왜?' }] })
    expect(feedbackBucket(asked, NOW)).toBe('대기')
    expect(stateOf(asked)).toBe('승인')
    const replied = entry('답함', { ...approved, comments: [{ at: '2026-10-07T11:00', note: '왜?' }], status: { state: '반영', replies: [{ at: '2026-10-07T11:30', to: '2026-10-07T11:00', note: '그래서' }] } })
    expect(feedbackBucket(replied, NOW)).toBe('완료')
    const editedAfter = entry('답한 뒤 고침', { ...replied, comments: [{ at: '2026-10-07T11:00', note: '왜 그래?', edited: '2026-10-07T11:40' }] })
    expect(feedbackBucket(editedAfter, NOW)).toBe('대기')
  })

  it('다시 처리한 뒤 그 수정 요청 글을 고치면 다시 대기', () => {
    const reworkedOne = { status: { state: '반영' as const, rework: REJECTED_AT, handled_at: '2026-10-06T15:00' }, review: { verdict: '반려' as const, at: REJECTED_AT } }
    expect(feedbackBucket(entry('다시 처리함', reworkedOne), NOW)).toBe('확인 필요')
    expect(feedbackBucket(entry('처리 전에 고침', { ...reworkedOne, review: { ...reworkedOne.review, edited: '2026-10-06T14:30' } }), NOW)).toBe('확인 필요')
    expect(feedbackBucket(entry('처리 뒤에 고침', { ...reworkedOne, review: { ...reworkedOne.review, edited: '2026-10-06T16:00' } }), NOW)).toBe('대기')
  })
})
