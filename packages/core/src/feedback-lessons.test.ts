import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from './contract/feedback.js'
import { feedbackLessons, feedbackLessonsText } from './feedback-lessons.js'

const NOW = new Date('2026-10-20T12:00').getTime()
type Rev = NonNullable<NonNullable<FeedbackItem['status']>['revised']>
/** 처리 기록과 그 처리들을 돌려보낸 답 (revised의 at = 반려의 at, 진행은 실수가 아니다) */
const item = (key: string, revised: Rev, go: string[] = []): Pick<FeedbackItem, 'key' | 'status' | 'review'> => ({
  key, status: { state: '반영', revised },
  review: { verdict: '승인', at: '2026-10-20T11:00', history: revised.map((r) => ({ verdict: go.includes(r.at) ? '진행' as const : '반려' as const, at: r.at, note: `말 ${r.at}` })) },
})

describe('feedbackLessons (실수에서 배우기, 10/16)', () => {
  const items = [
    item('a', [{ at: '2026-10-17T10:00', miss: '답 불분명', lesson: '답 첫 줄에 고쳤는지 적는다' }, { at: '2026-10-18T10:00', miss: '덜 고침', lesson: '그림으로 확인하고 말한다' }]),
    item('b', [{ at: '2026-10-19T10:00', miss: '답 불분명', lesson: '파일 경로 대신 화면 이름' }, { at: '2026-10-19T11:00', miss: '새 요구', lesson: '실수가 아님' }]),
    item('c', [{ at: '2026-10-19T12:00', miss: '답 불분명' }, { at: '2026-10-19T13:00' }, { at: '2026-10-10T13:00' }, { at: '2026-10-19T14:00' }], ['2026-10-19T14:00']),
    item('old', [{ at: '2026-09-01T10:00', miss: '답 불분명', lesson: '오래됨' }]),
  ]

  it('최근 30일의 까닭을 세고, 실수 까닭의 교훈만 새것부터 보인다', () => {
    const l = feedbackLessons(items, NOW)
    expect(l.reworks).toBe(7)
    expect(l.counts).toEqual([{ miss: '답 불분명', n: 3 }, { miss: '덜 고침', n: 1 }, { miss: '새 요구', n: 1 }])
    expect(l.unlabeled).toBe(1) // 10/16 전의 다시 처리는 까닭 없음으로 세지 않는다
    // 새것부터: 교훈 없는 실수는 사용자 말과 함께, 까닭 없는 반려는 사용자 말만, 새 요구는 빼고, 진행은 세지 않는다
    expect(feedbackLessons(items, NOW, 30, 9).lessons.map((x) => x.lesson ?? `${x.miss ?? '-'}/${x.said}`)).toEqual([
      '-/말 2026-10-19T13:00', '답 불분명/말 2026-10-19T12:00', '파일 경로 대신 화면 이름', '그림으로 확인하고 말한다', '답 첫 줄에 고쳤는지 적는다', '-/말 2026-10-10T13:00',
    ])
    expect(l.lessons).toHaveLength(3)
    expect(l.ruleCandidates).toEqual([{ miss: '답 불분명', n: 3 }])
  })

  it('짧은 절로 보이고, 다시 처리가 없으면 빈 글', () => {
    const t = feedbackLessonsText(feedbackLessons(items, NOW))
    expect(t).toContain('## 최근 30일 돌려받은 까닭 (다시 처리한 반려 7)')
    expect(t).toContain('- 답 불분명 3 · 덜 고침 1 · 새 요구 1 · 까닭 없음 1')
    expect(t).toContain('- 규칙 후보: "답 불분명" 3번')
    expect(t).toContain('- 사용자가 돌려보낸 말: "말 2026-10-19T13:00"')
    expect(t).toContain('- 답 불분명 (교훈 없음): 사용자 "말 2026-10-19T12:00"')
    expect(t).not.toContain('실수가 아님')
    expect(t.length).toBeLessThan(800)
    expect(feedbackLessonsText(feedbackLessons([item('x', [])], NOW))).toBe('')
  })
})
