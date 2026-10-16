import { describe, expect, it } from 'vitest'
import { isUserReply, recordRows } from './recordRows.js'

const long = 'ㄱ'.repeat(500)
const files = [{
  target: 'project', title: '예제', comments: [
    { id: 'a', kind: '지시', state: '대기', where: '전체', body: long, answers: [] },
    { id: 'b', kind: '질문', by: 'claude', state: '답함', where: '전체', body: '이 식이 맞나요?', answers: [{ by: '사용자', at: '2026-10-16 09:00', body: '맞아요' }] },
    { id: 'c', kind: '메모', unsorted: true as const, state: null, where: '전체', body: '작업을 최신화해줘', answers: [] },
    { id: 'd', kind: '질문', by: 'claude', state: '대기', where: '전체', body: '아직 답 없음', answers: [] },
  ],
}]

describe('에이전트가 읽는 기록 목록', () => {
  it('기본은 짧은 줄: 본문 300자, 답은 수와 마지막 하나', () => {
    const rows = recordRows(files)
    expect(rows).toHaveLength(4)
    expect(String(rows[0]!.body)).toHaveLength(301)
    expect(rows[1]).toMatchObject({ answerCount: 1, lastAnswer: { by: '사용자', body: '맞아요' } })
    expect(rows[1]).not.toHaveProperty('answers')
    expect(recordRows(files, { full: true })[0]!.body).toBe(long)
  })
  it('답할 차례 · 사용자가 답한 에이전트 질문 · 분류 전을 따로 거른다', () => {
    expect(recordRows(files, { unanswered: true }).map((r) => r.id)).toEqual(['a'])
    expect(recordRows(files, { replied: true }).map((r) => r.id)).toEqual(['b'])
    expect(recordRows(files, { unsorted: true }).map((r) => r.id)).toEqual(['c'])
    expect(isUserReply(files[0]!.comments[3]!)).toBe(false)
  })
})
