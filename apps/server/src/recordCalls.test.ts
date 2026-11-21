// 메모에서 @로 에이전트 부르기 (11/21 시안 「기록과 에이전트의 경계」 안 A3): 부른 메모만 질문이 되어 넘어가고, 그냥 남긴 메모는 답하지 않는다
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AgentRunner, RunInput } from './agentChats.js'
import { buildApp } from './app.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'
import { calledAgent } from '@rw/core'

useSampleApp()

describe('메모에서 @로 부르기', () => {
  const seen: RunInput[] = []
  const runner: AgentRunner = async function* (input) {
    seen.push(input)
    yield { type: 'text', text: '결론: 답' }
    yield { type: 'result', ok: true }
  }
  let a: ReturnType<typeof buildApp>
  let rid: string
  let R: string
  const chats = async () => (await a.inject({ method: 'GET', url: `/api/agent-chats?rid=${rid}` })).json().chats as { id: string; agent?: string; write: string; record?: { id: string } }[]
  const record = async (id: string) => (await a.inject({ method: 'GET', url: R })).json().comments.find((c: { id: string }) => c.id === id)
  const add = async (text: string, kind = '메모', more: object = {}) => (await a.inject({ method: 'POST', url: R, payload: { kind, title: '프로젝트', text, ...more } })).json().entry as { id: string; kind: string }

  beforeAll(async () => {
    a = buildApp({ configDir: path.join(tmp, 'config-record-calls'), agentRunner: runner })
    rid = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: makeRepo('record-calls') } })).json().id as string
    // 질문 처리는 「직접」: @로 부른 것은 설정과 상관없이 바로 넘어간다
    await a.inject({ method: 'PUT', url: '/api/settings/agents', payload: { instructions: 'manual', questions: 'manual' } })
    R = `/api/researches/${rid}/comments/project`
  })
  afterAll(async () => { await a.close() })

  it('부른 글인지: 이름이 있으면 그 에이전트, 이름 없는 @ · @모두는 기본, 그 밖은 아님', () => {
    expect(calledAgent('@claude: 이게 뭐야?')).toBe('claude-code')
    expect(calledAgent('먼저 읽고 @Gemini 확인해 줘')).toBe('gemini')
    expect(calledAgent('@ 이 줄 뜻?')).toBe('default')
    expect(calledAgent('@: 이 줄 뜻?')).toBe('default')
    expect(calledAgent('@모두 봐 줘')).toBe('default')
    expect(calledAgent('a@b.com 으로 보낼 것')).toBeNull()
    expect(calledAgent('@someone 에게 물어보기')).toBeNull()
  })

  it('@claude를 적은 메모는 질문이 되고 읽기만 하는 대화가 답한다', async () => {
    const e = await add('@claude projED가 뭐야?')
    expect(e.kind).toBe('질문')
    await vi.waitFor(async () => expect((await record(e.id)).answers).toHaveLength(1))
    expect((await chats()).find((c) => c.record?.id === e.id)).toMatchObject({ write: 'read' })
  })

  it('부르지 않은 메모와 에이전트가 쓴 메모는 그대로 남고 대화가 열리지 않는다', async () => {
    const plain = await add('메일 주소는 a@b.com, 나중에 확인')
    const byAgent = await add('@claude 확인 바람', '메모', { by: 'codex' })
    const todo = await add('@claude 에게 물어볼 것 정리', '할 일')
    expect([plain.kind, byAgent.kind, todo.kind]).toEqual(['메모', '메모', '할 일'])
    await new Promise((r) => setTimeout(r, 150))
    const open = (await chats()).map((c) => c.record?.id)
    for (const x of [plain, byAgent, todo]) expect(open).not.toContain(x.id)
  })

  it('그냥 남긴 메모의 「답 요청」은 그 메모를 질문으로 바꿔 넘긴다', async () => {
    const e = await add('Kempe 사슬 대신 목록 색칠로 바꿔 쓸 수 있는지')
    const r = await a.inject({ method: 'POST', url: `${R}/${e.id}/answer` })
    expect(r.statusCode).toBe(200)
    expect((await record(e.id)).kind).toBe('질문')
    await vi.waitFor(async () => expect((await record(e.id)).answers).toHaveLength(1))
  })

  it('@codex로 부르면 그 에이전트의 대화가 열린다', async () => {
    const e = await add('@codex 이 보조정리의 반례가 있는지 봐 줘')
    await vi.waitFor(async () => expect((await chats()).find((c) => c.record?.id === e.id)).toBeTruthy())
    expect((await chats()).find((c) => c.record?.id === e.id)).toMatchObject({ agent: 'codex' })
  })
})
