import { describe, expect, it } from 'vitest'
import { isReviewCommand, reviewLines } from './AgentReview'
import { readyAgent } from './AgentPick'

describe('Codex 검토 (11/9)', () => {
  it('검토 글을 고칠 것 · 볼 것 · 없음으로 나눈다', () => {
    expect(reviewLines('고칠 것: 부호 (88행)\n- 볼 것：각주\n\n고칠 것 없음\n그 밖')).toEqual([
      { level: 'fix', text: '부호 (88행)' }, { level: 'look', text: '각주' }, { level: 'none', text: '고칠 것 없음' }, { level: 'other', text: '그 밖' },
    ])
  })
  it('/codex만 검토를 부른다 (/검토는 노트 검토)', () => {
    expect(isReviewCommand(' /codex ')).toBe(true)
    expect(isReviewCommand('/codex 봐 줘')).toBe(false)
    expect(isReviewCommand('/검토')).toBe(false)
  })
  it('검토만 하는 에이전트는 새 대화를 맡지 않는다', () => {
    const kinds = [{ id: 'claude-code' as const, installed: true }, { id: 'codex' as const, installed: true, login: true }]
    expect(readyAgent('codex', kinds, (a) => a === 'codex')).toBe('claude-code')
    expect(readyAgent('codex', kinds)).toBeUndefined()
  })
})
