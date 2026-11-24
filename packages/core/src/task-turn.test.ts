import { describe, expect, it } from 'vitest'
import { taskTurn } from './task-turn'

describe('맡긴 일의 사용자 차례: 결정 필요 · 확인만 (11/23)', () => {
  it('종결 조건을 통과하고 답할 물음이 없는 결과만 확인만', () => {
    expect(taskTurn({ state: 'result', endCheck: 'pass' })).toBe('confirm')
    expect(taskTurn({ state: 'result', endCheck: 'pass', asks: [{}], answers: [{ n: 1 }] })).toBe('confirm')
  })
  it('제안 · 미달 · 모름 · 남은 물음은 결정 필요, 진행 중은 차례가 아니다', () => {
    expect(taskTurn({ state: 'proposed' })).toBe('decide')
    expect(taskTurn({ state: 'result', endCheck: 'fail' })).toBe('decide')
    expect(taskTurn({ state: 'result', endCheck: 'unknown' })).toBe('decide')
    expect(taskTurn({ state: 'result' })).toBe('decide')
    expect(taskTurn({ state: 'result', endCheck: 'pass', asks: [{}, {}], answers: [{ n: 1 }] })).toBe('decide')
    expect(taskTurn({ state: 'working' })).toBeNull()
  })
})
