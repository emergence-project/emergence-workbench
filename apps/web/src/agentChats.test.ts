import { describe, expect, it } from 'vitest'
import { blocksOf, menuAt, stepsSummary, trustOf } from './AgentChats'

describe('에이전트 입력란', () => {
  it('/ 명령은 맨 앞에서만, @ 붙이기는 낱말 앞 어디서나 연다', () => {
    expect(menuAt('/계', 2)).toEqual({ kind: '/', start: 0, query: '계' })
    expect(menuAt('이것 /계', 5)).toBeNull()
    expect(menuAt('이 노트 @kem', 9)).toEqual({ kind: '@', start: 5, query: 'kem' })
    expect(menuAt('메일 a@b', 6)).toBeNull()
    expect(menuAt('@kem 다음', 9)).toBeNull()
  })
  it('맡기는 정도: 읽기만이면 모드와 상관없이 읽기만', () => {
    expect(trustOf({ write: 'read', mode: 'edit' })).toBe('read')
    expect(trustOf({ write: 'notes', mode: 'plan' })).toBe('plan')
  })
  it('도구 묶음은 도구 수 · 하위 에이전트 · 범위 밖으로 줄인다', () => {
    const at = ''
    const items = [
      { kind: 'step' as const, at, tool: 'Read', summary: 'a' },
      { kind: 'step' as const, at, tool: 'Task', summary: '찾기' },
      { kind: 'step' as const, at, tool: 'Grep', summary: 'b', outside: true, sub: true },
    ]
    const blocks = blocksOf([...items, { kind: 'text', at, text: '끝' }, items[0]!])
    expect(blocks.map((b) => b.kind)).toEqual(['steps', 'one', 'steps'])
    expect(stepsSummary(items)).toBe('도구 2번 · 하위 에이전트 1 · 범위 밖 1')
  })
})
