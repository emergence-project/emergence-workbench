import { describe, expect, it } from 'vitest'
import { blocksOf, commentMessage, effortsOf, notifyWhy, tokensName, fitEffort, fitMenu, menuAt, modelName, nextTrust, stepsSummary, trustOf } from './AgentChats'

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
  it('모델 이름: 기본은 실제 모델을 붙이고, 버전마다 따로, 생각 깊이는 그 모델이 받는 것만', () => {
    const list = [
      { value: 'default', name: 'Default (recommended)', desc: '', resolved: 'claude-opus-5-5', efforts: ['low' as const, 'max' as const] },
      { value: 'opus', name: 'Opus 5.5', desc: '', resolved: 'claude-opus-5-5', efforts: ['low' as const, 'max' as const] },
      { value: 'claude-opus-5', name: 'Opus 5', desc: '', resolved: 'claude-opus-5' },
    ]
    expect(modelName('default', list)).toBe('기본 (Opus 5.5)')
    expect(modelName('claude-opus-5', list)).toBe('Opus 5')
    expect(modelName('claude-old-1', list)).toBe('claude-old-1')
    expect(modelName('default', [])).toBe('기본 모델')
    expect(effortsOf('opus', list)).toEqual(['low', 'max'])
    expect(effortsOf('claude-opus-5', list)).toEqual([])
    expect(effortsOf('claude-old-1', list)).toEqual(['low', 'medium', 'high'])
    // 모델을 바꾸면 받지 않는 생각 깊이는 보통으로
    expect(fitEffort('max', ['low', 'medium', 'high'])).toEqual({ effort: 'medium' })
    expect(fitEffort('high', ['low', 'medium', 'high'])).toEqual({})
    expect(fitEffort('max', [])).toEqual({})
  })
  it('알림은 일하던 대화가 내 차례 · 끝남 · 오류가 될 때만', () => {
    expect(notifyWhy('running', { state: 'waiting', wait: 'plan' })).toBe('계획 승인 기다림')
    expect(notifyWhy('running', { state: 'idle' })).toBe('답을 마쳤습니다')
    expect(notifyWhy('waiting', { state: 'error' })).toBe('오류로 멈췄습니다')
    expect(notifyWhy('waiting', { state: 'running' })).toBeNull()
    expect(notifyWhy('stopped', { state: 'idle' })).toBeNull()
    expect(notifyWhy(undefined, { state: 'idle' })).toBeNull()
  })
  it('토큰 수는 짧게', () => {
    expect(tokensName(950)).toBe('950')
    expect(tokensName(4_250)).toBe('4.3k')
    expect(tokensName(48_200)).toBe('48k')
    expect(tokensName(1_250_000)).toBe('1.3M')
  })
  it('입력란 메뉴는 패널 · 창 끝에서 잘리지 않게 뒤집고 민다', () => {
    const view = { top: 100, bottom: 700, left: 900, right: 1200 }
    // 입력란이 아래에 있으면 위로, 단추 왼쪽에 맞춘다
    expect(fitMenu({ width: 200, height: 250 }, { top: 600, bottom: 626, left: 920, right: 980 }, view)).toEqual({ down: false, x: 0 })
    // 위가 모자라면(새 대화 입력란) 아래로 뒤집고, 오른쪽 끝을 넘으면 왼쪽으로 민다
    expect(fitMenu({ width: 280, height: 250 }, { top: 180, bottom: 206, left: 1050, right: 1110 }, view)).toEqual({ down: true, x: -134 })
    // 위아래 다 모자라면 넓은 쪽에 들어갈 높이까지
    expect(fitMenu({ width: 200, height: 500 }, { top: 300, bottom: 326, left: 920, right: 980 }, view)).toEqual({ down: true, x: 0, max: 370 })
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
