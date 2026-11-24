import { describe, expect, it } from 'vitest'
import { due, TIDY_DAYS } from './agentTidy.js'

const old = new Date(Date.now() - (TIDY_DAYS + 1) * 86_400_000).toISOString()
const chat = (text: string) => ({ id: 'c', rid: 'p', state: 'idle', updated: old, items: [
  { kind: 'user' as const, at: old, text: '고쳐 줘' },
  { kind: 'text' as const, at: old, text },
] })

describe('저절로 보관 (11/24)', () => {
  it('끝난 대화는 7일 뒤 보관한다', () => expect(due(chat('PR을 합쳤습니다.'))).toBe(true))
  it('에이전트가 묻고 끝낸 대화는 답할 때까지 둔다', () => expect(due(chat('A와 B 중 어느 것으로 할까요?'))).toBe(false))
})
