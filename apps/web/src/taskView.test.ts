import { describe, expect, it } from 'vitest'
import type { Task } from './api/tasks'
import { agentPrompt, briefCounts, cardAsks, cardConclusion, durationText, judgeOrder, shortStamp, splitReport, taskLine, taskTiming, weekItems } from './taskView'

const task = (over: Partial<Task>): Task => ({
  id: '2026-10-05-x', file: 'workbench/tasks/2026-10-05-x.md', title: 'x', agent: 'claude-code', created: '2026-10-05 09:10', state: 'working', task: '일',
  references: [], asks: [], issues: [], next: [], outputs: [], check: {}, answers: [], judged: [], body: '', hash: 'h', mtime: 0, ...over,
})

describe('맡긴 일 화면 말', () => {
  it('작업 시간과 시각을 짧게 쓴다', () => {
    expect(durationText(35 * 60_000)).toBe('35분')
    expect(durationText((27 * 60 + 49) * 60_000)).toBe('27시간 49분')
    expect(durationText(3 * 86_400_000 + 4 * 3_600_000)).toBe('3일 4시간')
    expect(shortStamp('2026-10-05 09:10')).toBe('10/5 09:10')
    expect(taskTiming(task({ state: 'result', resultAt: '2026-10-06 12:59' }))).toEqual({ text: '10/5 09:10 시작 · 27시간 49분', tip: '시작 10/5 09:10 → 결과 10/6 12:59' })
  })

  it('종결 조건 제안은 결론과 확인 요청을 제안으로 채운다', () => {
    const t = task({ state: 'proposed', proposal: { endCondition: ['a', 'b'] } })
    expect(cardConclusion(t)).toBe('종결 조건 2개를 제안했습니다: a, b.')
    expect(cardAsks(t).map((a) => a.q)).toEqual(['이 종결 조건으로 시작할까요?'])
    expect(cardAsks(task({ asks: [{ q: '반영할까요?', options: [] }] })).map((a) => a.q)).toEqual(['반영할까요?'])
  })

  it('목록 줄은 지금 무엇을 기다리는지 쓴다', () => {
    expect(taskLine(task({ endCondition: '1e-8 이내' }))).toBe('종결: 1e-8 이내')
    expect(taskLine(task({ judged: [{ at: '', verdict: 'send-back', note: 'L=48도' }] }))).toBe('수정: L=48도')
    expect(taskLine(task({ state: 'result', endCheck: 'pass' }))).toBe('종결 조건 통과')
    expect(taskLine(task({ state: 'done', judged: [{ at: '', verdict: 'approve', seconds: 240 }] }))).toBe('해결 · 판단 4분')
  })

  it('판단 목록은 오래 기다린 것부터, 판단할 것만', () => {
    const list = judgeOrder([task({ id: 'new', state: 'result', resultAt: '2026-10-07 10:00' }), task({ id: 'w' }), task({ id: 'old', state: 'proposed', mtime: new Date(2026, 9, 6).getTime() })])
    expect(list.map((t) => t.id)).toEqual(['old', 'new'])
  })

  it('보고서 본문을 두 절로 나누고 안내 주석을 뺀다', () => {
    expect(splitReport('<!-- 안내 -->\n## 요약과 결론\n\n쉬운 말\n\n## 근거\n\n- 방법\n\n## 덧붙임\n\n표')).toEqual({ summary: '쉬운 말', evidence: '- 방법\n\n### 덧붙임\n\n표' })
    expect(splitReport('제목 없는 글')).toEqual({ summary: '제목 없는 글', evidence: '' })
    expect(splitReport('## 요약과 결론\n\n## 근거\n')).toEqual({ summary: '', evidence: '' })
  })

  it('에이전트에게 줄 말은 작업 파일과 규칙 문서를 가리킨다', () => {
    expect(agentPrompt('workbench/tasks/2026-10-07-a.md', '~/GitHub/research-workspace/docs/agent-delegated-work.md'))
      .toBe('workbench/tasks/2026-10-07-a.md에 맡긴 일을 해 줘. 먼저 이 파일과 규칙 문서 ~/GitHub/research-workspace/docs/agent-delegated-work.md를 읽고, 결과는 같은 파일에 채워.')
  })

  it('한 주 달력: 맡김 · 결과 · 일지 · 마감을 날짜별로, 브리핑 수', () => {
    const tasks = [task({ state: 'result', resultAt: '2026-10-06 12:59' }), task({ id: 'b', created: '2026-10-07 08:00' })]
    const byDay = weekItems(tasks, [
      { date: '2026-10-06', time: '09:00', kind: 'memo', target: '연구', text: '메모 하나', index: 0 },
      { date: '2026-10-05', time: '09:00', kind: 'todo', target: '연구', text: '10/9까지 — 검토', index: 1 },
    ])
    expect(byDay.get('2026-10-05')!.map((x) => [x.mark, x.text])).toEqual([['given', '맡김 · x']])
    expect(byDay.get('2026-10-06')!.map((x) => x.mark)).toEqual(['memo', 'result'])
    expect(byDay.get('2026-10-09')!.map((x) => [x.mark, x.text])).toEqual([['due', '마감 · 검토']])
    expect(briefCounts(tasks, ['2026-10-07', '2026-10-08', '2026-10-09'], byDay)).toMatchObject({ judge: 1, working: 1, due: 1 })
  })
})
