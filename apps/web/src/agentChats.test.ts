import { describe, expect, it } from 'vitest'
import { blocksOf, commentMessage, menuAt, nextTrust, stepsSummary, trustOf } from './AgentChats'

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
  it('⇧⇥는 맡기는 정도를 차례로 돌린다', () => {
    expect(nextTrust('read')).toBe('ask')
    expect(nextTrust('edit')).toBe('read')
  })
  it('바뀐 곳 코멘트는 번호 붙은 지시와 고른 글로 보낸다', () => {
    const m = commentMessage([{ file: 'notes/a/note.md', old: 'x', new: 'y', text: '날짜 대신 커밋' }])
    expect(m.text).toContain('1. notes/a/note.md: 날짜 대신 커밋')
    expect(m.attach?.[0]).toMatchObject({ kind: 'selection', ref: 'notes/a/note.md', text: '- x\n+ y' })
  })
  it('도구 묶음은 걸린 시간 · 읽기 · 도구 · 하위 에이전트 · 범위 밖으로 줄인다', () => {
    const at = '2026-10-21T10:00:00Z'
    const items = [
      { kind: 'step' as const, at, tool: 'Read', summary: 'a' },
      { kind: 'step' as const, at, tool: 'Task', summary: '찾기' },
      { kind: 'step' as const, at, tool: 'Grep', summary: 'b', outside: true, sub: true },
      { kind: 'step' as const, at, tool: 'Bash', summary: 'c' },
    ]
    const later = '2026-10-21T10:00:12Z'
    const blocks = blocksOf([...items, { kind: 'todos', at, todos: [] }, { kind: 'text', at: later, text: '끝' }, items[0]!])
    expect(blocks.map((b) => b.kind)).toEqual(['steps', 'one', 'steps'])
    expect(blocks[0]).toMatchObject({ until: later })
    expect(stepsSummary(items, later)).toBe('12초 동안 일함 · 읽기 2번 · 도구 1번 · 하위 에이전트 1 · 범위 밖 1')
  })
})
