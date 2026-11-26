import { describe, expect, it } from 'vitest'
import { agentAsks, isQuestion } from './chat-asks'
import type { ChatItem } from './contract/agentChats'

const text = (t: string): ChatItem => ({ kind: 'text', at: '2026-11-24T00:00', text: t })
const user = (t: string): ChatItem => ({ kind: 'user', at: '2026-11-24T00:01', text: t })

describe('isQuestion', () => {
  it('reads the last paragraph', () => {
    expect(isQuestion('고쳤습니다.\n\n두 안 중 어느 쪽으로 갈까요?')).toBe(true)
    expect(isQuestion('진행할지 정해 주세요.')).toBe(true)
    expect(isQuestion('왜 그런지 물으셨죠?\n\n원인은 캐시였고 고쳤습니다.')).toBe(false)
    expect(isQuestion('PR #12를 합쳤습니다.')).toBe(false)
  })
})

describe('agentAsks', () => {
  it('is true until the user answers', () => {
    expect(agentAsks([user('고쳐 줘'), text('A와 B 중 어느 것으로 할까요?')])).toBe(true)
    expect(agentAsks([user('고쳐 줘'), text('A와 B 중 어느 것으로 할까요?'), user('A')])).toBe(false)
    expect(agentAsks([user('고쳐 줘'), text('끝났습니다.')])).toBe(false)
    expect(agentAsks([])).toBe(false)
  })
})
