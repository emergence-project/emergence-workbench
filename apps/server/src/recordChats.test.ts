// 기록마다 에이전트 대화 (10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ): 기록의 질문 · 지시가 그 기록의 대화를 열고, 기록에는 마지막 답과 고친 곳만 적는다
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AgentRunner, RunEvent, RunInput } from './agentChats.js'
import { buildApp } from './app.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('기록의 질문 · 지시와 에이전트 대화', () => {
  const seen: RunInput[] = []
  let cut: (() => void) | undefined
  /** 차례마다: 지시면 노트를 고치고, "길게"면 멈출 때까지 붙잡고, 아니면 설명 한 줄과 결론 한 줄 */
  async function* turn(input: RunInput, prompt: string): AsyncGenerator<RunEvent> {
    if (prompt.includes('길게')) {
      const p = new Promise<void>((r) => { cut = r })
      yield { type: 'text', text: '찾는 중' }
      await p
      yield { type: 'result', ok: false, error: 'error_during_execution' }
      return
    }
    if (input.write === 'notes') {
      const e = { project: rid, file: 'workbench/notes/a/note.md', old: 'x', new: 'y' }
      const d = await input.canUseTool('mcp__workbench__edit_note', e)
      if (d.allow) yield { type: 'tool', tool: 'mcp__workbench__edit_note', input: e }
    }
    yield { type: 'text', text: '노트 2절을 읽었습니다.' }
    yield { type: 'text', text: `결론: ${prompt.includes('이어 썼습니다') ? '이어 답함' : '첫 답'}` }
    yield { type: 'result', ok: true }
  }
  const runner: AgentRunner = async function* (input) {
    seen.push(input)
    input.control?.({ interrupt: async () => { cut?.(); return true } })
    yield* turn(input, input.prompt)
    for await (const x of input.inbox!) yield* turn(input, x.prompt)
  }
  let a: ReturnType<typeof buildApp>
  let rid: string
  let R: string
  const chats = async () => (await a.inject({ method: 'GET', url: `/api/agent-chats?rid=${rid}` })).json().chats as { id: string; state: string; write: string; record?: { target: string; id: string }; since?: string }[]
  const record = async (id: string) => (await a.inject({ method: 'GET', url: R })).json().comments.find((c: { id: string }) => c.id === id)
  const add = async (text: string, kind: string) => (await a.inject({ method: 'POST', url: R, payload: { kind, title: '프로젝트', text } })).json().entry.id as string

  beforeAll(async () => {
    a = buildApp({ configDir: path.join(tmp, 'config-record-chats'), agentRunner: runner })
    rid = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: makeRepo('record-chats') } })).json().id as string
    await a.inject({ method: 'PUT', url: '/api/settings/agents', payload: { instructions: 'instant' } })
    R = `/api/researches/${rid}/comments/project`
  })
  afterAll(async () => { await a.close() })

  it('질문은 읽기만 하는 대화를 열고, 마지막 글을 기록의 답으로 적는다. 이어 쓰면 같은 대화가 이어 답한다', async () => {
    const id = await add('projED가 뭐야?', '질문')
    await vi.waitFor(async () => expect((await record(id)).answers).toHaveLength(1))
    const [c] = (await chats()).filter((x) => x.record?.id === id)
    expect(c).toMatchObject({ write: 'read', record: { target: 'project', id } })
    expect(seen.at(-1)!.prompt).toContain('projED가 뭐야?')
    expect(seen.at(-1)!.prompt).toContain('answer_record')
    // 대화에는 기록 글만 보인다 (지침은 에이전트에게만)
    expect((await a.inject({ method: 'GET', url: `/api/agent-chats/${c!.id}` })).json().chat.items[0]).toMatchObject({ kind: 'user', text: 'projED가 뭐야?' })
    const r = await record(id)
    expect(r.answers[0]).toMatchObject({ by: 'claude', body: '결론: 첫 답' })
    expect(r.state).toBe('답함')
    await vi.waitFor(async () => expect((await chats()).find((x) => x.id === c!.id)!.state).toBe('idle'))
    const runs = seen.length
    await a.inject({ method: 'POST', url: `${R}/${id}/reply`, payload: { text: '논문에서 찾아 줘' } })
    await vi.waitFor(async () => expect((await record(id)).answers).toHaveLength(3))
    expect((await record(id)).answers[2]).toMatchObject({ by: 'claude', body: '결론: 이어 답함' })
    // 기록을 완료하면 그 대화는 보관함으로
    const hash = (await a.inject({ method: 'GET', url: R })).json().hash
    expect((await a.inject({ method: 'PATCH', url: `${R}/${id}`, payload: { state: '끝냄', baseHash: hash } })).statusCode).toBe(200)
    expect((await a.inject({ method: 'GET', url: `/api/agent-chats/${c!.id}` })).json().chat.archived).toBe(true)
    // 같은 대화(열어 둔 에이전트)에 보냈다: 새로 열지 않았고 대화도 하나
    expect(seen.length).toBe(runs)
    expect((await chats()).filter((x) => x.record?.id === id)).toHaveLength(1)
  })

  it('지시는 노트를 고칠 수 있는 대화를 열고, 고친 곳을 답 아래에 적는다', async () => {
    const id = await add('1절을 고쳐 줘', '지시')
    await vi.waitFor(async () => expect((await record(id)).answers).toHaveLength(1))
    expect((await chats()).find((x) => x.record?.id === id)!.write).toBe('notes')
    const body = (await record(id)).answers[0].body as string
    expect(body).toContain('결론: 첫 답')
    expect(body).toContain('고친 곳 (수정 검토에서 승인):')
    expect(body).toMatch(/- workbench\/notes\/a\/note\.md \+\d+ −\d+/)
  })

  it('멈추면 그 차례만 끊고 기록에는 적지 않으며, 같은 글을 다시 넘기지 않는다', async () => {
    const id = await add('길게 찾아 줘', '질문')
    await vi.waitFor(async () => expect((await chats()).find((x) => x.record?.id === id)?.state).toBe('running'))
    const c = (await chats()).find((x) => x.record?.id === id)!
    expect(c.since).toEqual(expect.any(String))
    await a.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/stop` })
    await vi.waitFor(async () => expect((await chats()).find((x) => x.id === c.id)!.state).toBe('stopped'))
    const r = await record(id)
    expect(r.answers).toHaveLength(0)
    expect(r.state).toBe('대기')
    // 같은 파일의 다른 기록이 들어와 대기 중인 것을 다시 모아도 멈춘 질문은 다시 넘기지 않는다
    const runs = seen.length
    await add('다른 질문', '질문')
    await vi.waitFor(async () => expect(seen.length).toBe(runs + 1))
    expect((await chats()).find((x) => x.id === c.id)!.state).toBe('stopped')
  })
})

describe('기록으로 남기기', () => {
  it('작은 모델이 대화를 읽고 붙일 곳을 받아 초안을 쓴다. 에이전트 답이 없으면 거절한다', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const { AgentChats } = await import('./agentChats.js')
    const prompts: string[] = []
    const runner: AgentRunner = Object.assign(async function* (): AsyncIterable<RunEvent> {
      yield { type: 'text', text: '차수 5까지 모든 경우가 다섯 색으로 칠해집니다.' }
      yield { type: 'result', ok: true }
    }, { side: async (o: { prompt: string }) => { prompts.push(o.prompt); return '  차수 5까지 돌려 줘\n모두 다섯 색으로 칠해짐.  ' } })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-record-draft-'))
    const chats = new AgentChats({ dir, runner, limit: 2, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {} })
    const c = chats.create({ rid: 'p', text: '차수 5까지 돌려 줘' })
    await expect(chats.recordDraft(c.id, '켐페 노트')).rejects.toThrow()
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(await chats.recordDraft(c.id, '켐페 노트')).toEqual({ text: '차수 5까지 돌려 줘\n모두 다섯 색으로 칠해짐.' })
    expect(prompts[0]).toContain('켐페 노트')
    expect(prompts[0]).toContain('Agent: 차수 5까지 모든 경우가 다섯 색으로 칠해집니다.')
    expect(prompts[0]).toContain('고친 곳:')
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
