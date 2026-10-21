import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ChatScope } from '@rw/core/contract/agentChats'
import { AgentChats, briefFor, describeStep, inScope, judge, scopeDir, type AgentRunner, type PolicyCtx, type RunEvent, type RunInput } from './agentChats.js'
import { eventsOf } from './agentRunner.js'
import { buildApp } from './app.js'
import { fixture } from './testkit.js'

const repo = '/r/proj'
const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: 'proj', write: 'notes', scope: { kind: 'project' }, repo, readable: ['/r/lib'], claimedBy: () => undefined, ...o })
const topic: ChatScope = { kind: 'topic', target: 'gauge' }
const W = 'mcp__workbench__'

describe('범위', () => {
  it('주제 · 노트 범위는 그 폴더, 프로젝트는 전체', () => {
    expect(scopeDir({ kind: 'project' })).toBe('')
    expect(scopeDir(topic)).toBe('workbench/topics/gauge')
    expect(scopeDir({ kind: 'note', target: 'workbench/topics/gauge/fix/note.md' })).toBe('workbench/topics/gauge/fix')
    expect(inScope(topic, 'workbench/topics/gauge/fix/note.md')).toBe(true)
    expect(inScope(topic, 'workbench/topics/gauge-two/x.md')).toBe(false)
    expect(inScope({ kind: 'project' }, 'anything')).toBe(true)
    const block: ChatScope = { kind: 'note', target: 'workbench/blocks/b1.tex' }
    expect(scopeDir(block)).toBe('workbench/blocks/b1.tex')
    expect(inScope(block, 'workbench/blocks/b1.tex')).toBe(true)
    expect(inScope(block, 'workbench/blocks/b2.tex')).toBe(false)
  })
})

describe('허락 규칙', () => {
  it('저장소 · 읽어도 되는 폴더는 묻지 않고 읽고, 그 밖은 묻는다', () => {
    expect(judge(ctx(), 'Read', { file_path: `${repo}/a.md` }).kind).toBe('allow')
    expect(judge(ctx(), 'Grep', { pattern: 'x' }).kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: '/r/lib/concepts/a.md' }).kind).toBe('allow')
    const v = judge(ctx(), 'Read', { file_path: '/etc/passwd' })
    expect(v).toMatchObject({ kind: 'ask', key: 'Read:/etc/passwd' })
    expect(judge(ctx(), 'Read', { file_path: '/r/proj-other/a.md' }).kind).toBe('ask')
  })
  it('파일을 바로 쓰는 도구는 막는다', () => {
    for (const t of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) expect(judge(ctx(), t, { file_path: `${repo}/a.md` }).kind).toBe('deny')
  })
  it('앱 MCP: 읽기는 두고, 고치기는 단계 · 프로젝트 · 범위 · 잡은 파일을 본다', () => {
    expect(judge(ctx(), `${W}read_note`, { project: 'other' }).kind).toBe('allow')
    expect(judge(ctx({ write: 'read' }), `${W}add_record`, { project: 'proj' }).kind).toBe('deny')
    expect(judge(ctx(), `${W}edit_concept`, {}).kind).toBe('deny')
    expect(judge(ctx(), `${W}add_record`, { project: 'other' }).kind).toBe('deny')
    expect(judge(ctx(), `${W}add_record`, { project: 'proj' }).kind).toBe('allow')
    const file = 'workbench/topics/gauge/fix/note.md'
    expect(judge(ctx({ scope: topic }), `${W}edit_note`, { project: 'proj', file })).toEqual({ kind: 'allow', claim: file })
    expect(judge(ctx({ scope: topic }), `${W}edit_note`, { project: 'proj', file: 'workbench/notes/x/note.md' }).kind).toBe('deny')
    const taken = judge(ctx({ claimedBy: () => '다른 일' }), `${W}edit_note`, { project: 'proj', file })
    expect(taken).toMatchObject({ kind: 'deny' })
    expect(taken.kind === 'deny' && taken.reason).toContain('다른 일')
  })
  it('셸 · 웹 · 모르는 도구는 묻고, 셸은 명령마다 따로 기억한다', () => {
    expect(judge(ctx(), 'Bash', { command: 'python run.py' })).toMatchObject({ kind: 'ask', key: 'Bash:python run.py', summary: 'python run.py' })
    expect(judge(ctx(), 'WebFetch', { url: 'https://x' })).toMatchObject({ kind: 'ask', key: 'WebFetch' })
    expect(judge(ctx(), 'TodoWrite', {}).kind).toBe('allow')
    expect(judge(ctx(), 'Task', { description: 'look' }).kind).toBe('allow')
  })
  it('대화에 보일 한 줄: 범위 밖 읽기를 표시한다', () => {
    expect(describeStep(ctx({ scope: topic }), 'Read', { file_path: `${repo}/workbench/topics/gauge/a.md` })).toEqual({ tool: 'Read', summary: 'workbench/topics/gauge/a.md' })
    expect(describeStep(ctx({ scope: topic }), 'Read', { file_path: `${repo}/README.md` })).toMatchObject({ outside: true })
    expect(describeStep(ctx(), 'Read', { file_path: '/r/lib/a.md' })).toMatchObject({ outside: true })
    expect(describeStep(ctx(), `${W}read_note`, { project: 'other', file: 'n.md' })).toEqual({ tool: 'read_note', summary: 'other · n.md', outside: true })
  })
  it('안내: 범위 · 단계 · 다른 대화가 잡은 파일', () => {
    const b = briefFor({ rid: 'proj', title: 'P', scope: topic, write: 'read', others: [{ title: '다른 일', claims: ['a.md'] }, { title: '빈 일', claims: [] }] })
    expect(b).toContain('topic gauge (folder workbench/topics/gauge)')
    expect(b).toContain('read-only')
    expect(b).toContain('다른 일: a.md')
    expect(b).not.toContain('빈 일')
  })
})

describe('SDK 메시지', () => {
  it('세션 · 글 · 도구 · 결과로 바꾸고 모르는 것은 버린다', () => {
    expect(eventsOf({ type: 'system', subtype: 'init', session_id: 's1' })).toEqual([{ type: 'session', id: 's1' }])
    expect(eventsOf({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'Read', input: { file_path: 'a' } }] } }))
      .toEqual([{ type: 'text', text: 'hi' }, { type: 'tool', tool: 'Read', input: { file_path: 'a' } }])
    expect(eventsOf({ type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'text', text: 'sub' }] } })).toEqual([{ type: 'text', text: 'sub', sub: true }])
    expect(eventsOf({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.1 })).toEqual([{ type: 'result', ok: true, cost: 0.1 }])
    expect(eventsOf({ type: 'result', subtype: 'error_max_turns', errors: ['too long'] })).toEqual([{ type: 'result', ok: false, error: 'too long' }])
    expect(eventsOf({ type: 'stream_event' })).toEqual([])
  })
})

// ---------- API (가짜 실행기) ----------

/** 지시 글로 하는 일을 고르는 가짜 에이전트 */
const seen: RunInput[] = []
let gate: (() => void) | undefined
const fake: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
  seen.push(input)
  yield { type: 'session', id: `s${seen.length}` }
  if (input.prompt.startsWith('bash')) {
    const d = await input.canUseTool('Bash', { command: 'ls' })
    yield { type: 'text', text: d.allow ? 'ran' : 'declined' }
  } else if (input.prompt.startsWith('edit ')) {
    const file = input.prompt.slice(5).split(' ')[0]!
    yield { type: 'tool', tool: 'mcp__workbench__edit_note', input: { project: 'sample-research', file } }
    const d = await input.canUseTool('mcp__workbench__edit_note', { project: 'sample-research', file })
    yield { type: 'text', text: d.allow ? 'edited' : 'blocked' }
    if (input.prompt.includes('hold')) await new Promise<void>((r) => { gate = r })
  } else if (input.prompt === 'wait') {
    await new Promise<void>((r) => { gate = r; input.signal.addEventListener('abort', () => r(), { once: true }) })
  } else {
    yield { type: 'tool', tool: 'Read', input: { file_path: `${input.cwd}/README.md` } }
    yield { type: 'text', text: '읽었습니다' }
  }
  yield { type: 'result', ok: true, cost: 0.01 }
}

describe('대화 API', () => {
  let tmp: string
  let app: ReturnType<typeof buildApp>
  const rid = 'sample-research'
  const get = async (id: string) => (await app.inject({ method: 'GET', url: `/api/agent-chats/${id}` })).json().chat
  const settle = (id: string, state = 'idle') => vi.waitFor(async () => expect((await get(id)).state).toBe(state))
  const create = async (payload: object) => {
    const res = await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid, ...payload } })
    expect(res.statusCode, res.body).toBe(200)
    return res.json().chat as { id: string }
  }

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-chat-'))
    const dir = path.join(tmp, 'sample-research')
    fs.cpSync(fixture, dir, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(dir, '.git'))
    app = buildApp({ configDir: path.join(tmp, 'config'), agentRunner: fake })
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: dir } })).statusCode).toBe(200)
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('만들면 돌고, 도구 · 글 · 결과가 대화에 남고, 이어서 지시하면 앞 세션을 잇는다', async () => {
    const c = await create({ text: '요약해 줘', scope: { kind: 'topic', target: 'gauge' } })
    await settle(c.id)
    const chat = await get(c.id)
    expect(chat.title).toBe('요약해 줘')
    expect(chat.items.map((i: { kind: string }) => i.kind)).toEqual(['user', 'step', 'text', 'result'])
    expect(chat.items[1]).toMatchObject({ tool: 'Read', summary: 'README.md', outside: true })
    expect(seen.at(-1)!.brief).toContain('topic gauge')
    expect(seen.at(-1)!.sessionId).toBeUndefined()
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '더' } })
    await settle(c.id)
    expect(seen.at(-1)!.sessionId).toBe(`s${seen.length - 1}`)
    const list = (await app.inject({ method: 'GET', url: `/api/agent-chats?rid=${rid}` })).json()
    expect(list.chats.some((x: { id: string }) => x.id === c.id)).toBe(true)
    expect(list.limit).toBe(2)
  })

  it('셸 명령은 허락 카드를 띄우고 사용자가 답할 때까지 기다린다. 「늘」은 같은 명령을 다시 묻지 않는다', async () => {
    const c = await create({ text: 'bash please' })
    await settle(c.id, 'waiting')
    const ask = (await get(c.id)).items.find((i: { kind: string }) => i.kind === 'ask')
    expect(ask).toMatchObject({ tool: 'Bash', summary: 'ls' })
    const res = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: ask.id, answer: 'always' } })
    expect(res.statusCode).toBe(200)
    await settle(c.id)
    expect((await get(c.id)).items.filter((i: { kind: string }) => i.kind === 'text').map((i: { text: string }) => i.text)).toEqual(['ran'])
    // 다시 답하면 409
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: ask.id, answer: 'deny' } })).statusCode).toBe(409)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: 'bash again' } })
    await settle(c.id)
    expect((await get(c.id)).items.filter((i: { kind: string }) => i.kind === 'ask')).toHaveLength(1)
  })

  it('범위 밖 노트는 막고, 고치는 동안 잡은 파일은 다른 대화가 고치지 못한다', async () => {
    const out = await create({ text: 'edit workbench/notes/x/note.md', scope: { kind: 'topic', target: 'gauge' } })
    await settle(out.id)
    const items = (await get(out.id)).items
    expect(items.find((i: { kind: string }) => i.kind === 'blocked')).toMatchObject({ tool: 'edit_note' })
    expect(items.find((i: { kind: string }) => i.kind === 'text').text).toBe('blocked')

    const file = 'workbench/topics/gauge/fix/note.md'
    const a = await create({ text: `edit ${file} hold`, title: '첫 일' })
    await vi.waitFor(async () => expect((await get(a.id)).claims).toEqual([file]))
    expect((await app.inject({ method: 'GET', url: '/api/agent-work' })).json().chats).toEqual([expect.objectContaining({ id: a.id, claims: [file] })])
    const b = await create({ text: `edit ${file}` })
    await settle(b.id)
    expect((await get(b.id)).items.find((i: { kind: string }) => i.kind === 'blocked').reason).toContain('첫 일')
    expect(seen.at(-1)!.brief).toContain(`첫 일: ${file}`)
    gate!()
    await settle(a.id)
    expect((await get(a.id)).claims).toEqual([])
  })

  it('동시에 limit개까지 돌고 넘치면 줄을 서며, 멈추면 다음이 돈다. 도는 대화는 지우지 못한다', async () => {
    const a = await create({ text: 'wait' })
    const b = await create({ text: 'wait' })
    const c = await create({ text: '요약' })
    await settle(c.id, 'queued')
    expect((await app.inject({ method: 'DELETE', url: `/api/agent-chats/${a.id}` })).statusCode).toBe(409)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${a.id}/stop` })
    await settle(a.id, 'stopped')
    await settle(c.id)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${b.id}/stop` })
    await settle(b.id, 'stopped')
    expect((await app.inject({ method: 'DELETE', url: `/api/agent-chats/${a.id}` })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/agent-chats/${a.id}` })).statusCode).toBe(404)
  })

  it('없는 프로젝트 · 맞지 않는 범위는 거절한다', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: 'nope', text: 'x' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid, text: 'x', scope: { kind: 'topic' } } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid, text: 'x', scope: { kind: 'note', target: '../x' } } })).statusCode).toBe(400)
  })
})

describe('앱이 다시 켜지면', () => {
  it('돌던 대화는 멈춤으로, 기다리던 허락은 거절로 읽는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-chat-load-'))
    const at = new Date().toISOString()
    fs.writeFileSync(path.join(dir, 'c1.json'), JSON.stringify({ id: 'c1', rid: 'p', title: 't', agent: 'claude-code', scope: { kind: 'project' }, write: 'notes', state: 'waiting', claims: ['a.md'], created: at, updated: at, items: [{ kind: 'ask', at, id: 'k', tool: 'Bash', summary: 'ls' }] }))
    const chats = new AgentChats({ dir, runner: fake, limit: 2, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {} })
    const c = chats.get('c1')
    expect(c.state).toBe('stopped')
    expect(c.claims).toEqual([])
    expect(c.items[0]).toMatchObject({ kind: 'ask', answer: 'deny' })
    expect(c.items.at(-1)!.kind).toBe('error')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

