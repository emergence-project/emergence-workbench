import { describe, expect, it } from 'vitest'
import type { CentralState } from './api'
import { boardCounts, boardRows, FEEDBACK_MAX } from './centralBoard'

type Kid = CentralState['kids'][number]
const NOW = Date.parse('2026-11-19T12:00:00')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
const kid = (id: string, o: Partial<Kid>): Kid => ({ id, rid: 'app', title: id, state: 'running', archived: false, updated: ago(1), ...o })

describe('중앙의 작업 현황', () => {
  it('단계마다 묶음: 사용자 결정 · 오류 · 차례 끝남은 내 차례, CI 통과는 합칠 준비, 합쳐진 것은 오늘 것만 끝남', () => {
    const { rows } = boardRows({
      kids: [
        kid('run', {}),
        kid('crit', { state: 'waiting', wait: 'ask', ask: { id: 'a', critical: '지우기' } }),
        kid('ask', { state: 'waiting', wait: 'ask', ask: { id: 'b' } }),
        kid('ci', { state: 'idle', pr: { number: 3, url: '' }, ci: 'pending' }),
        kid('ok', { state: 'idle', pr: { number: 4, url: '' }, ci: 'passed' }),
        kid('end', { state: 'idle' }),
        kid('merged', { state: 'idle', merged: 'abc', pr: { number: 5, url: '' } }),
        kid('old', { state: 'idle', archived: true, updated: '2026-11-17T10:00:00Z' }),
      ],
    }, NOW)
    const g = Object.fromEntries(rows.map((r) => [r.key, r.group]))
    expect(g).toEqual({ run: 'doing', crit: 'turn', ask: 'doing', ci: 'doing', ok: 'ready', end: 'turn', merged: 'done' })
    expect(rows.find((r) => r.key === 'ci')!.extras).toContain('PR #3')
  })

  it('오래 그대로인 줄은 정체로 내 차례에 올리고, 사용자 결정은 정체로 치지 않는다', () => {
    const { rows } = boardRows({
      kids: [
        kid('slow', { updated: ago(25) }),
        kid('ci', { state: 'idle', pr: { number: 3, url: '' }, ci: 'pending', updated: ago(25) }),
        kid('crit', { state: 'waiting', ask: { id: 'a', critical: '합치기' }, updated: ago(300) }),
      ],
    }, NOW)
    expect(rows.find((r) => r.key === 'slow')).toMatchObject({ group: 'turn', stalled: 25 })
    expect(rows.find((r) => r.key === 'ci')!.stalled).toBeUndefined()
    expect(rows.find((r) => r.key === 'crit')!.stalled).toBeUndefined()
    expect(boardCounts(rows)).toEqual({ left: 3, turn: 2, stalled: 1 })
  })

  it('피드백은 내 차례에 다섯 개까지, 묶음 안은 오래된 것이 위, 자리 기다림은 진행 중', () => {
    const feedback = Array.from({ length: FEEDBACK_MAX + 2 }, (_, i) => ({ key: `f${i}`, target: 'x', text: `f${i}`, at: ago(100 - i) }))
    const { rows, moreFeedback } = boardRows({ kids: [kid('end', { state: 'idle', updated: ago(200) })], feedback, held: [{ title: '대기', at: ago(3) }] }, NOW)
    expect(moreFeedback).toBe(2)
    expect(rows.map((r) => r.key)).toEqual(['end', 'fb:f0', 'fb:f1', 'fb:f2', 'fb:f3', 'fb:f4', 'held:0'])
    expect(boardCounts(rows, moreFeedback)).toEqual({ left: 9, turn: 8, stalled: 0 })
  })

  it('비정상 종료: 하위 대화는 「비정상 종료」와 횟수, 하위 대화가 아닌 대화도 내 차례에 그 대화로 가는 줄', () => {
    const { rows } = boardRows({
      kids: [kid('k', { state: 'error', crashes: 2 }), kid('e', { state: 'error' })],
      crashed: [{ id: 'p1', rid: 'proj', title: '다른 대화', at: ago(5), text: 'Claude Code process exited with code 1', count: 1 }],
    }, NOW)
    expect(rows.find((r) => r.key === 'k')).toMatchObject({ stage: '비정상 종료', group: 'turn', extras: ['2번째'] })
    expect(rows.find((r) => r.key === 'e')!.stage).toBe('오류')
    expect(rows.find((r) => r.key === 'crash:p1')).toMatchObject({ id: 'p1', stage: '비정상 종료', mark: 'error', group: 'turn', extras: [] })
  })
})
