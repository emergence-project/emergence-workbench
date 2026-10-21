import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import type { AskRunner } from './ask.js'
import { ClaudeQueue, dailyDue } from './instructions.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

/** 지시 처리 설정을 고른 앱과 그 연구의 기록 경로 */
async function setup(name: string, mode: 'manual' | 'instant' | 'daily', ask: AskRunner) {
  const a = buildApp({ configDir: path.join(tmp, `config-instr-${name}`), ask })
  const rid = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: makeRepo(`instr-${name}`) } })).json().id as string
  expect((await a.inject({ method: 'PUT', url: '/api/settings/agents', payload: { instructions: mode } })).json().instructions).toBe(mode)
  const R = `/api/researches/${rid}/comments/project`
  const queue = (a as unknown as { instructionQueue: ClaudeQueue }).instructionQueue
  const add = async (text: string, kind = '지시') => (await a.inject({ method: 'POST', url: R, payload: { kind, title: '프로젝트', text } })).json().entry.id as string
  const record = async (id: string) => (await a.inject({ method: 'GET', url: R })).json().comments.find((c: { id: string }) => c.id === id)
  return { a, R, queue, add, record }
}

describe('설정 › 에이전트: 지시 처리', () => {
  it('처음은 직접 부탁이고, 고를 수 없는 값은 무시하며, 설정 파일에 남는다', async () => {
    const dir = path.join(tmp, 'config-instr-settings')
    const a = buildApp({ configDir: dir })
    expect((await a.inject({ method: 'GET', url: '/api/settings/agents' })).json()).toEqual({ instructions: 'manual', at: '09:00', feedback: 'manual', merge: 'green', minutes: 30 })
    expect((await a.inject({ method: 'PUT', url: '/api/settings/agents', payload: { instructions: 'daily', at: '21:00' } })).json()).toEqual({ instructions: 'daily', at: '21:00', feedback: 'manual', merge: 'green', minutes: 30 })
    expect((await a.inject({ method: 'PUT', url: '/api/settings/agents', payload: { instructions: 'always', at: '21:30' } })).json()).toEqual({ instructions: 'daily', at: '21:00', feedback: 'manual', merge: 'green', minutes: 30 })
    await a.close()
    const b = buildApp({ configDir: dir })
    expect((await b.inject({ method: 'GET', url: '/api/settings/agents' })).json()).toEqual({ instructions: 'daily', at: '21:00', feedback: 'manual', merge: 'green', minutes: 30 })
    await b.close()
  })

  it('직접 부탁이면 맥의 Claude를 부르지 않는다', async () => {
    const ask = vi.fn<AskRunner>().mockResolvedValue('했습니다.')
    const { a, queue, add, record } = await setup('manual', 'manual', ask)
    const id = await add('그림을 다시 그려 줘')
    await queue.idle()
    expect(ask).not.toHaveBeenCalled()
    expect((await record(id)).state).toBe('대기')
    await a.close()
  })

  it('바로면 지시마다 한 번씩, 하나씩 차례로 하고 답함으로 둔다', async () => {
    let running = 0
    let most = 0
    // 첫 답을 지시 둘을 다 남길 때까지 붙잡는다: 차례가 없으면 그 사이 둘째가 함께 돌아 most가 2가 된다
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const ask = vi.fn<AskRunner>(async () => {
      most = Math.max(most, ++running)
      await gate
      running--
      return '고쳤습니다.'
    })
    const { a, queue, add, record } = await setup('instant', 'instant', ask)
    const one = await add('첫 지시')
    const two = await add('둘째 지시')
    await add('질문은 화면이 따로 묻는다', '질문')
    release()
    await queue.idle()
    expect(ask).toHaveBeenCalledTimes(2)
    expect(most).toBe(1)
    expect(ask.mock.calls[0]![0].prompt).toContain('지시 (연구자가 해 달라고 남긴 일):\n첫 지시')
    for (const id of [one, two]) {
      const r = await record(id)
      expect(r.state).toBe('답함')
      expect(r.answers.at(-1)).toMatchObject({ by: 'claude', body: '고쳤습니다.' })
    }
    await a.close()
  })

  it('바로일 때 사용자가 이어 쓰면 다시 한다', async () => {
    const ask = vi.fn<AskRunner>().mockResolvedValue('했습니다.')
    const { a, R, queue, add, record } = await setup('reply', 'instant', ask)
    const id = await add('표를 정리해 줘')
    await queue.idle()
    expect((await a.inject({ method: 'POST', url: `${R}/${id}/reply`, payload: { text: '열 하나 더' } })).statusCode).toBe(200)
    await queue.idle()
    expect(ask).toHaveBeenCalledTimes(2)
    expect((await record(id)).state).toBe('답함')
    await a.close()
  })

  it('하루 한 번은 고른 시각의 그 시간에 하루 한 번만', () => {
    const at = (h: number, d = 16) => new Date(2026, 9, d, h, 30)
    expect(dailyDue('09:00', at(8), null)).toBeNull()
    expect(dailyDue('09:00', at(9), null)).toBe('2026-10-16')
    expect(dailyDue('09:00', at(9), '2026-10-16')).toBeNull()
    expect(dailyDue('09:00', at(9, 17), '2026-10-16')).toBe('2026-10-17')
  })
})

describe('에이전트가 물은 질문에 사용자가 답하면 에이전트 차례, 반영해 답하면 끝냄', () => {
  it('agentAnswer와 STATUS 절', async () => {
    const { agentAnswer, replyToRecord } = await import('./ask.js')
    const { addComment, readComments, userReplies } = await import('./comments.js')
    const root = path.join(makeRepo('instr-replied'), 'workbench')
    const { entry } = addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '이 정의로 갈까요?', by: 'claude' } as never)
    expect(agentAnswer(root, 'project', entry.id, 'claude', '덧붙임').comments[0]!.state).toBe('대기')
    replyToRecord(root, 'project', entry.id, '네, 그렇게 해 주세요')
    expect(userReplies(root).map((q) => q.body)).toEqual(['네, 그렇게 해 주세요'])
    expect(agentAnswer(root, 'project', entry.id, 'claude', '반영했습니다.').comments[0]!.state).toBe('끝냄')
    expect(userReplies(root)).toHaveLength(0)
    expect(readComments(root, 'project').comments[0]!.answers.at(-1)!.by).toBe('claude')
  })
})
