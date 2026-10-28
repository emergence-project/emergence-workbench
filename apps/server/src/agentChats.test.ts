import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ChatScope } from '@rw/core/contract/agentChats'
import { AgentChats, briefFor, describeStep, editOf, inScope, judge, promptOf, scopeDir, sidePrompt, todosOf, type AgentRunner, type PolicyCtx, type RunEvent, type RunInput } from './agentChats.js'
import { choicesOf, eventsOf } from './agentRunner.js'
import { buildApp } from './app.js'
import { fixture } from './testkit.js'

const repo = '/r/proj'
const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: 'proj', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo, readable: ['/r/lib'], claimedBy: () => undefined, ...o })
const topic: ChatScope = { kind: 'topic', target: 'gauge' }
const W = 'mcp__workbench__'

describe('모드', () => {
  const edit = { project: 'proj', file: 'workbench/notes/a/note.md' }
  it('계획 먼저: 승인 전에는 고치지 않고, 계획은 승인 카드가 되며, 승인 뒤에는 고친다', () => {
    expect(judge(ctx({ mode: 'plan' }), `${W}edit_note`, edit)).toMatchObject({ kind: 'deny' })
    expect(judge(ctx({ mode: 'plan' }), 'ExitPlanMode', { plan: '1. 읽기\n2. 고치기' })).toMatchObject({ kind: 'ask', plan: '1. 읽기\n2. 고치기' })
    expect(judge(ctx({ mode: 'plan', planOk: true }), `${W}edit_note`, edit)).toEqual({ kind: 'allow', claim: edit.file })
    expect(judge(ctx(), 'ExitPlanMode', { plan: 'x' }).kind).toBe('allow')
    // 맥의 스킬은 묻지 않고 읽고, 커넥터 도구는 묻는다 (10/21 22:40)
    expect(judge(ctx(), 'Skill', { skill: 'my-skills:lean-check' }).kind).toBe('allow')
    expect(judge(ctx(), 'mcp__zotero__search', { q: 'x' })).toMatchObject({ kind: 'ask', key: 'mcp__zotero__search' })
  })
  it('묻고 하기: 노트 고치기도 파일마다 묻고, 허락하면 그 파일을 잡는다', () => {
    expect(judge(ctx({ mode: 'ask' }), `${W}edit_note`, edit)).toMatchObject({ kind: 'ask', key: `edit_note:${edit.file}`, claim: edit.file })
    expect(judge(ctx({ mode: 'ask' }), `${W}add_record`, { project: 'proj' }).kind).toBe('ask')
    expect(judge(ctx({ mode: 'ask' }), `${W}read_note`, edit).kind).toBe('allow')
    // 범위 · 잡은 파일은 모드보다 먼저
    expect(judge(ctx({ mode: 'ask', claimedBy: () => '다른 일' }), `${W}edit_note`, edit).kind).toBe('deny')
  })
  it('붙인 것 · 노트 고침 · 할 일을 읽는다', () => {
    expect(promptOf('봐 줘')).toBe('봐 줘')
    // Claude Code 명령은 붙인 것 없이 그대로
    expect(promptOf(' /compact ', [{ kind: 'note', ref: 'a.md', label: 'A' }])).toBe('/compact')
    expect(promptOf('/compactly', [{ kind: 'note', ref: 'a.md', label: 'A' }])).toContain('a.md')
    const p = promptOf('봐 줘', [{ kind: 'note', ref: 'workbench/notes/a/note.md', label: 'A' }, { kind: 'selection', ref: 'workbench/notes/a/note.md', label: '고른 글', text: '첫 줄\n둘째 줄' }])
    expect(p).toContain('note (read_note): workbench/notes/a/note.md (A)')
    expect(p).toContain('  > 둘째 줄')
    expect(editOf({ edits: [{ old: 'a\nb', new: 'c', reason: '고침' }] })).toEqual({ parts: [{ old: 'a\nb', new: 'c' }], added: 1, removed: 2, reason: '고침' })
    expect(todosOf({ todos: [{ content: '읽기', status: 'completed' }, { content: '계산', status: 'in_progress' }, { content: '?', status: 'odd' }] }))
      .toEqual([{ text: '읽기', state: 'completed' }, { text: '계산', state: 'in_progress' }, { text: '?', state: 'pending' }])
  })
})

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
  it('명령은 하는 일로 나눠 토글대로: 읽기 · 편집은 맡기는 정도, 실행은 프로그램마다, 삭제 · 외부는 늘 한 번씩', () => {
    expect(judge(ctx(), 'Bash', { command: 'python run.py' })).toMatchObject({ kind: 'ask', key: 'run:python', does: 'run', summary: 'python run.py' })
    expect(judge(ctx({ always: (k) => k === 'run:python' }), 'Bash', { command: 'python other.py' }).kind).toBe('allow')
    expect(judge(ctx({ auto: () => ({ read: true, run: true, web: false }) }), 'Bash', { command: 'julia x.jl' }).kind).toBe('allow')
    // 편집 자동 허용: 읽기 · 편집은 묻지 않는다
    expect(judge(ctx(), 'Bash', { command: 'ls workbench | head -3 && git log -1' }).kind).toBe('allow')
    expect(judge(ctx(), 'Bash', { command: "sed -i '' 's/a/b/' x.md" }).kind).toBe('allow')
    // 묻고 하기: 읽기도 묻고, 「늘」은 그 토글을 켠다
    expect(judge(ctx({ mode: 'ask' }), 'Bash', { command: 'ls' })).toMatchObject({ kind: 'ask', does: 'read', turnOn: 'read' })
    expect(judge(ctx({ mode: 'ask' }), 'Bash', { command: 'mv a.md b.md' })).toMatchObject({ kind: 'ask', does: 'edit', turnOn: 'edit' })
    expect(judge(ctx({ write: 'read' }), 'Bash', { command: 'mv a.md b.md' }).kind).toBe('deny')
    expect(judge(ctx({ mode: 'plan' }), 'Bash', { command: 'mv a.md b.md' }).kind).toBe('deny')
    // 삭제 · 외부는 토글과 상관없이 한 번씩
    expect(judge(ctx(), 'Bash', { command: 'rm -rf build' })).toMatchObject({ kind: 'ask', does: 'delete', once: true })
    expect(judge(ctx(), 'Bash', { command: 'git push origin main' })).toMatchObject({ kind: 'ask', does: 'outside', once: true })
    expect(judge(ctx(), 'Bash', { command: 'cat /etc/hosts' })).toMatchObject({ does: 'outside' })
    expect(judge(ctx(), 'Bash', { command: 'cat /r/lib/concepts/a.md' }).kind).toBe('allow')
    expect(judge(ctx(), 'WebFetch', { url: 'https://x' })).toMatchObject({ kind: 'ask', key: 'WebFetch', does: 'web', turnOn: 'web' })
    expect(judge(ctx({ auto: () => ({ read: true, run: false, web: true }) }), 'WebSearch', { query: 'x' }).kind).toBe('allow')
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
    // 쓰는 중인 글 조각(주 에이전트만) · 생각 요약
    expect(eventsOf({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '아' } } })).toEqual([{ type: 'delta', text: '아' }])
    expect(eventsOf({ type: 'stream_event', parent_tool_use_id: 'x', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '아' } } })).toEqual([])
    expect(eventsOf({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'thinking', thinking: '17 × 23' }] } })).toEqual([{ type: 'think', text: '17 × 23' }])
    // 앞 내용 요약 · 뒤에서 도는 명령
    expect(eventsOf({ type: 'system', subtype: 'status', status: 'compacting' })).toEqual([{ type: 'status', compacting: true }])
    expect(eventsOf({ type: 'system', subtype: 'status', status: null })).toEqual([{ type: 'status', compacting: false }])
    expect(eventsOf({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 24_704, post_tokens: 1_788 } })).toEqual([{ type: 'compact', auto: false, before: 24_704, after: 1_788 }])
    expect(eventsOf({ type: 'system', subtype: 'background_tasks_changed', tasks: [{}, { ambient: true }] })).toEqual([{ type: 'tasks', count: 1 }])
    // 토큰(캐시 포함)과 마지막 요청의 맥락 크기 · 맥락 창
    expect(eventsOf({ type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }, modelUsage: { 'claude-opus-5-5': { contextWindow: 200_000 } } }, 3_000))
      .toEqual([{ type: 'result', ok: true, tokens: { in: 130, out: 5 }, context: { used: 3_000, window: 200_000 } }])
  })
  it('모델 목록: 이름 · 실제 id · 받는 생각 깊이, 계약에 맞지 않는 id · 깊이는 뺀다', () => {
    expect(choicesOf([
      { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5 · Best', resolvedModel: 'claude-opus-5-5', supportedEffortLevels: ['low', 'max', 'turbo'] },
      { value: 'haiku', displayName: 'Haiku 4.5', description: 'Fastest' },
      { value: 'Bad Model!', displayName: 'x', description: '' },
    ])).toEqual([
      { value: 'default', name: 'Default (recommended)', desc: 'Opus 5.5 · Best', resolved: 'claude-opus-5-5', efforts: ['low', 'max'] },
      { value: 'haiku', name: 'Haiku 4.5', desc: 'Fastest' },
    ])
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
    const d = await input.canUseTool('Bash', { command: 'python run.py' })
    yield { type: 'text', text: d.allow ? 'ran' : 'declined' }
  } else if (input.prompt.startsWith('edit ')) {
    const file = input.prompt.slice(5).split(' ')[0]!
    yield { type: 'tool', tool: 'mcp__workbench__edit_note', input: { project: 'sample-research', file } }
    const d = await input.canUseTool('mcp__workbench__edit_note', { project: 'sample-research', file })
    yield { type: 'text', text: d.allow ? 'edited' : 'blocked' }
    if (input.prompt.includes('hold')) await new Promise<void>((r) => { gate = r })
  } else if (input.prompt.startsWith('plan ')) {
    const file = input.prompt.slice(5)
    yield { type: 'tool', tool: 'TodoWrite', input: { todos: [{ content: '읽기', status: 'in_progress' }] } }
    yield { type: 'tool', tool: 'TodoWrite', input: { todos: [{ content: '읽기', status: 'completed' }, { content: '고치기', status: 'in_progress' }] } }
    const early = await input.canUseTool('mcp__workbench__edit_note', { project: 'sample-research', file, edits: [{ old: 'a', new: 'b', reason: 'r' }] })
    const plan = await input.canUseTool('ExitPlanMode', { plan: '1. 고치기' })
    const d = plan.allow ? await input.canUseTool('mcp__workbench__edit_note', { project: 'sample-research', file, edits: [{ old: 'a', new: 'b', reason: 'r' }] }) : plan
    yield { type: 'text', text: `${early.allow ? 'early' : 'waited'} ${d.allow ? 'edited' : 'no'}` }
  } else if (input.prompt === 'stream') {
    // 쓰는 중인 글 조각 · 생각 요약
    yield { type: 'think', text: '17 × 23' }
    yield { type: 'delta', text: '아니요, ' }
    yield { type: 'delta', text: '소수가 아닙니다' }
    await new Promise<void>((r) => { gate = r })
    yield { type: 'text', text: '아니요, 소수가 아닙니다.' }
  } else if (input.prompt === 'live') {
    // 열어 둔 에이전트: 받은 지시마다 한 차례 (뒤에서 도는 명령 · 앞 내용 요약도 낸다), inbox가 닫히면 끝난다
    yield { type: 'text', text: 'first' }
    yield { type: 'result', ok: true }
    for await (const x of input.inbox!) {
      yield { type: 'tasks', count: 1 }
      yield { type: 'status', compacting: true }
      yield { type: 'compact', auto: true, before: 130_000, after: 9_000 }
      yield { type: 'text', text: `got ${x.prompt}` }
      yield { type: 'result', ok: true }
    }
    return
  } else if (input.prompt === 'esc') {
    // 멈춤 = 하던 차례만 끊기: 끊기면 실패한 result가 오고, 에이전트는 다음 지시를 같은 실행에서 받는다
    let cut!: () => void
    const cutP = new Promise<void>((r) => { cut = r })
    input.control?.({ interrupt: async () => { cut(); return true } })
    yield { type: 'text', text: 'long' }
    await cutP
    yield { type: 'result', ok: false, error: 'error_during_execution' }
    for await (const x of input.inbox!) {
      yield { type: 'text', text: `got ${x.prompt}` }
      yield { type: 'result', ok: true }
    }
    return
  } else if (input.prompt === 'wait') {
    await new Promise<void>((r) => { gate = r; input.signal.addEventListener('abort', () => r(), { once: true }) })
  } else {
    yield { type: 'tool', tool: 'Read', input: { file_path: `${input.cwd}/README.md` } }
    yield { type: 'text', text: '읽었습니다' }
  }
  yield { type: 'mark', uuid: `m${seen.length}` }
  yield { type: 'result', ok: true, cost: 0.01 }
}

const sides: string[] = []
fake.side = async ({ prompt }) => { sides.push(prompt); if (prompt.includes('터져')) throw new Error('boom'); return '17 × 23이라 소수가 아닙니다' }
const drafts: string[] = []

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
    expect(list.limit).toBe(3)
  })

  it('제목을 바꾸면 공백을 줄여 저장하고, 빈 제목은 받지 않는다', async () => {
    const c = await create({ text: '처음 제목' })
    await settle(c.id)
    const res = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/title`, payload: { title: '  새   제목 ' } })
    expect(res.statusCode, res.body).toBe(200)
    expect((await get(c.id)).title).toBe('새 제목')
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/title`, payload: { title: '   ' } })).statusCode).toBe(400)
  })

  it('셸 명령은 허락 카드를 띄우고 사용자가 답할 때까지 기다린다. 「늘」은 같은 명령을 다시 묻지 않는다', async () => {
    const c = await create({ text: 'bash please' })
    await settle(c.id, 'waiting')
    const ask = (await get(c.id)).items.find((i: { kind: string }) => i.kind === 'ask')
    expect(ask).toMatchObject({ tool: 'Bash', summary: 'python run.py', does: 'run' })
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
    const b2 = await create({ text: 'wait' })
    const c = await create({ text: '요약' })
    await settle(c.id, 'queued')
    expect((await app.inject({ method: 'DELETE', url: `/api/agent-chats/${a.id}` })).statusCode).toBe(409)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${a.id}/stop` })
    await settle(a.id, 'stopped')
    await settle(c.id)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${b.id}/stop` })
    await settle(b.id, 'stopped')
    await app.inject({ method: 'POST', url: `/api/agent-chats/${b2.id}/stop` })
    await settle(b2.id, 'stopped')
    expect((await app.inject({ method: 'DELETE', url: `/api/agent-chats/${a.id}` })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/agent-chats/${a.id}` })).statusCode).toBe(404)
  })

  it('줄 선 대화를 멈추면 자리가 비지 않았으니 다음 줄 선 대화는 그대로 기다린다', async () => {
    const running = [await create({ text: 'wait' }), await create({ text: 'wait' }), await create({ text: 'wait' })]
    const c = await create({ text: '요약' })
    const d = await create({ text: '요약' })
    await settle(d.id, 'queued')
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/stop` })
    await settle(c.id, 'stopped')
    expect((await get(d.id)).state).toBe('queued')
    for (const r of running) await app.inject({ method: 'POST', url: `/api/agent-chats/${r.id}/stop` })
    await settle(d.id)
  })

  it('멈춰서 읽지 못한 지시는 남았다가 이어 하기와 함께 읽고, 답하지 못한 카드는 「멈춤」으로 닫힌다', async () => {
    const c = await create({ text: 'wait' })
    await settle(c.id, 'running')
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '이것도 해 줘' } })
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/stop` })
    await settle(c.id, 'stopped')
    // 에이전트가 읽지 못한 지시는 「다음에 보냄」으로 돌아온다
    expect((await get(c.id)).items.some((i: { queued?: boolean }) => i.queued)).toBe(true)
    const r = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/resume` })
    expect(r.statusCode, r.body).toBe(200)
    await settle(c.id)
    expect(seen.at(-1)!.prompt).toContain('이것도 해 줘')
    expect(seen.at(-1)!.prompt).toContain('이어서 해 주세요')
    expect((await get(c.id)).items.some((i: { queued?: boolean }) => i.queued)).toBe(false)
    // 허락 카드를 기다리다 멈추면 거절이 아니라 닫힘
    const b = await create({ text: 'bash once' })
    await settle(b.id, 'waiting')
    await app.inject({ method: 'POST', url: `/api/agent-chats/${b.id}/stop` })
    await settle(b.id, 'stopped')
    expect((await get(b.id)).items.find((i: { kind: string }) => i.kind === 'ask')).toMatchObject({ answer: 'deny', expired: true })
  })

  it('계획 먼저: 할 일은 한 줄로 고쳐지고, 계획을 승인하면 고친 노트가 고침 카드와 바뀐 파일로 남는다', async () => {
    const file = 'workbench/topics/gauge/fix/note.md'
    const c = await create({ text: `plan ${file}`, mode: 'plan' })
    await settle(c.id, 'waiting')
    expect(seen.at(-1)).toMatchObject({ mode: 'plan', model: 'default', effort: 'medium' })
    const chat = await get(c.id)
    expect(chat.items.filter((i: { kind: string }) => i.kind === 'todos')).toHaveLength(1)
    expect(chat.todos).toEqual([{ text: '읽기', state: 'completed' }, { text: '고치기', state: 'in_progress' }])
    expect(chat.items.find((i: { kind: string }) => i.kind === 'blocked').reason).toContain('계획')
    const ask = chat.items.find((i: { kind: string }) => i.kind === 'ask')
    expect(ask.plan).toBe('1. 고치기')
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: ask.id, answer: 'allow' } })
    await settle(c.id)
    const done = await get(c.id)
    expect(done.items.find((i: { kind: string }) => i.kind === 'text').text).toBe('waited edited')
    expect(done.items.find((i: { kind: string }) => i.kind === 'edit')).toMatchObject({ file, added: 1, removed: 1, parts: [{ old: 'a', new: 'b' }] })
    expect(done.changed).toEqual([file])
    expect(done).toMatchObject({ added: 1, removed: 1 })
    expect(done.always).toEqual([])
  })

  it('계획을 승인하며 묻고 하기를 고르면 노트 고치기도 묻고, 거절하며 한 말은 카드에 남는다. 목록 줄에 무엇을 기다리는지 보인다', async () => {
    const file = 'workbench/topics/gauge/fix/note.md'
    const c = await create({ text: `plan ${file}`, mode: 'plan' })
    await settle(c.id, 'waiting')
    const row = () => app.inject({ method: 'GET', url: `/api/agent-chats?rid=${rid}` }).then((r) => r.json().chats.find((x: { id: string }) => x.id === c.id))
    expect(await row()).toMatchObject({ wait: 'plan', added: 0, removed: 0, archived: false })
    const plan = (await get(c.id)).items.find((i: { kind: string }) => i.kind === 'ask')
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: plan.id, answer: 'allow', mode: 'plan' } })).statusCode).toBe(400)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: plan.id, answer: 'allow', mode: 'ask' } })
    await vi.waitFor(async () => expect((await get(c.id)).items.filter((i: { kind: string }) => i.kind === 'ask')).toHaveLength(2))
    const chat = await get(c.id)
    expect(chat.mode).toBe('ask')
    expect(chat.items.find((i: { id?: string }) => i.id === plan.id)).toMatchObject({ answer: 'allow', mode: 'ask' })
    expect(await row()).toMatchObject({ wait: 'ask' })
    const edit = chat.items.filter((i: { kind: string }) => i.kind === 'ask').at(-1)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: edit.id, answer: 'deny', note: '그 줄은 그대로 둬' } })
    await settle(c.id)
    const done = await get(c.id)
    expect(done.items.find((i: { id?: string }) => i.id === edit.id)).toMatchObject({ answer: 'deny', note: '그 줄은 그대로 둬' })
    expect(done.changed).toEqual([])
    expect((await row()).wait).toBeUndefined()
  })

  it('기다리는 지시는 뺄 수 있고, 끝난 대화는 보관함에 넣고 꺼낸다 (도는 대화는 보관하지 않는다)', async () => {
    const c = await create({ text: 'wait' })
    await settle(c.id, 'running')
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/archive`, payload: { archived: true } })).statusCode).toBe(409)
    // 모델을 바꾸면 에이전트를 다시 열어야 하니 다음 차례까지 기다린다(줄 선 지시)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload: { model: 'haiku' } })
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '이것도' } })
    const u = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/unqueue`, payload: { index: 0 } })
    expect(u.statusCode, u.body).toBe(200)
    expect(u.json().chat.items.some((i: { queued?: boolean }) => i.queued)).toBe(false)
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/unqueue`, payload: { index: 0 } })).statusCode).toBe(409)
    const before = seen.length
    gate!()
    await settle(c.id)
    expect(seen.length).toBe(before)
    const a = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/archive`, payload: { archived: true } })
    expect(a.json().chat.archived).toBe(true)
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/archive`, payload: { archived: false } })).json().chat.archived).toBe(false)
  })

  it('차례가 끝나도 에이전트를 열어 두어 다음 지시를 같은 실행에 넘기고, 뒤에서 도는 명령 · 앞 내용 요약이 보이며, 설정을 바꾸면 다시 연다', async () => {
    const c = await create({ text: 'live' })
    await settle(c.id)
    expect(await get(c.id)).toMatchObject({ live: true })
    const runs = seen.length
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '둘째' } })
    await vi.waitFor(async () => expect((await get(c.id)).items.at(-1)).toMatchObject({ kind: 'result' }))
    await settle(c.id)
    const chat = await get(c.id)
    expect(seen.length).toBe(runs)
    expect(chat.items.map((i: { kind: string }) => i.kind)).toEqual(['user', 'text', 'result', 'user', 'compact', 'text', 'result'])
    expect(chat.items[4]).toMatchObject({ auto: true, before: 130_000, after: 9_000 })
    expect(chat.items[5].text).toBe('got 둘째')
    expect(chat).toMatchObject({ live: true, tasks: 1 })
    expect(chat.compacting).toBeUndefined()
    // 모델을 바꾸면 쉬는 에이전트를 닫고 같은 세션을 새 설정으로 다시 연다
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload: { model: 'sonnet' } })
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '셋째' } })
    await vi.waitFor(() => expect(seen.length).toBe(runs + 1))
    await settle(c.id)
    expect(seen.at(-1)).toMatchObject({ prompt: '셋째', model: 'sonnet', sessionId: `s${runs}` })
  })

  it('되돌리기: 내 지시와 그 뒤를 지우고 글을 돌려주며, 다음 지시는 그 앞 메시지까지만 이은 세션으로 간다', async () => {
    const c = await create({ text: '첫째' })
    await settle(c.id)
    const first = seen.length
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '둘째', attach: [{ kind: 'note', ref: 'workbench/notes/a/note.md', label: 'A' }] } })
    await vi.waitFor(() => expect(seen.length).toBe(first + 1))
    await settle(c.id)
    const chat = await get(c.id)
    const users = chat.items.filter((i: { kind: string }) => i.kind === 'user')
    expect(users.map((u: { point?: string }) => typeof u.point)).toEqual(['string', 'string'])
    // 일하는 중에는 되돌리지 않는다 · 모르는 자리는 거절
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/rewind`, payload: { point: 'nope' } })).statusCode).toBe(409)
    const r = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/rewind`, payload: { point: users[1].point } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ text: '둘째', attach: [{ kind: 'note', label: 'A' }] })
    expect(r.json().chat.items.map((i: { kind: string }) => i.kind)).toEqual(['user', 'step', 'text', 'result'])
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '셋째' } })
    await vi.waitFor(() => expect(seen.length).toBe(first + 2))
    expect(seen.at(-1)).toMatchObject({ prompt: '셋째', sessionId: `s${first}`, resumeAt: `m${first}` })
    await settle(c.id)
    // 첫 지시로 되돌리면 처음부터 (세션 없이)
    const again = await get(c.id)
    const r2 = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/rewind`, payload: { point: again.items[0].point } })
    expect(r2.json().chat.items).toEqual([])
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '새로' } })
    await vi.waitFor(() => expect(seen.length).toBe(first + 3))
    expect(seen.at(-1)!.sessionId).toBeUndefined()
    expect(seen.at(-1)!.resumeAt).toBeUndefined()
  })

  it('멈춤은 열어 둔 에이전트의 하던 차례만 끊고, 다음 지시는 같은 실행이 맥락을 이어 받는다', async () => {
    const c = await create({ text: 'esc' })
    await settle(c.id, 'running')
    const runs = seen.length
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/stop`, payload: {} })
    await settle(c.id, 'stopped')
    const stopped = await get(c.id)
    expect(stopped).toMatchObject({ state: 'stopped', live: true })
    expect(stopped.items.some((i: { kind: string }) => i.kind === 'error')).toBe(false)
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '다시' } })
    await vi.waitFor(async () => expect((await get(c.id)).items.at(-2)).toMatchObject({ kind: 'text', text: 'got 다시' }))
    expect(seen.length).toBe(runs)
  })

  it('일하는 중에 보낸 지시는 다음 차례에 읽고, 모드 · 모델은 다음 차례부터 바뀐다. 그림 · 붙인 것은 에이전트에게 간다', async () => {
    const c = await create({ text: 'wait' })
    await settle(c.id, 'running')
    const img = { type: 'image/png', data: 'aGk=' }
    const q = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/messages`, payload: { text: '이것도', attach: [{ kind: 'note', ref: 'workbench/notes/a/note.md', label: 'A' }], images: [img] } })
    expect(q.statusCode, q.body).toBe(200)
    // 열려 있는 에이전트에 바로 넘긴다 (줄 서지 않음). 읽지 않고 끝나는 에이전트면 다음 실행이 읽는다
    expect(q.json().chat.items.at(-1)).toMatchObject({ kind: 'user', images: 1, attach: [{ kind: 'note' }] })
    expect(q.json().chat.items.at(-1).queued).toBeUndefined()
    const s = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload: { mode: 'ask', model: 'sonnet', effort: 'high' } })
    expect(s.json().chat).toMatchObject({ mode: 'ask', model: 'sonnet', effort: 'high' })
    const before = seen.length
    gate!()
    await vi.waitFor(() => expect(seen.length).toBe(before + 1))
    await settle(c.id)
    expect(seen.at(-1)).toMatchObject({ mode: 'ask', model: 'sonnet', effort: 'high', images: [img] })
    expect(seen.at(-1)!.prompt).toContain('note (read_note): workbench/notes/a/note.md')
    expect((await get(c.id)).items.some((i: { queued?: boolean }) => i.queued)).toBe(false)
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload: { mode: 'nope' } })).statusCode).toBe(400)
    // 버전까지 고른 모델 id와 더 깊은 생각도 받는다
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload: { model: 'claude-opus-5', effort: 'max' } })).json().chat).toMatchObject({ model: 'claude-opus-5', effort: 'max' })
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload: { model: 'Opus 5; rm' } })).statusCode).toBe(400)

    // 토글: 하나씩 바꾼 값은 두고, 권한 이름을 바꾸면 그 이름의 기본값으로
    const post = async (payload: object) => (await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/settings`, payload })).json().chat
    expect((await post({ auto: { read: false, run: true, web: false } })).auto).toEqual({ read: false, run: true, web: false })
    expect((await post({ mode: 'edit' })).auto).toBeUndefined()
    expect((await post({ auto: { read: true, run: false, web: false } })).auto).toBeUndefined()
  })

  it('모델 목록은 실행기에게 묻고, 실행기가 모르면 빈 목록', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/agent-chats/models' })).json()).toEqual({ models: [] })
  })

  it('늘 허락한 것은 대화에 보이고 뺄 수 있다', async () => {
    const c = await create({ text: 'bash once' })
    await settle(c.id, 'waiting')
    const ask = (await get(c.id)).items.find((i: { kind: string }) => i.kind === 'ask')
    await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/answer`, payload: { ask: ask.id, answer: 'always' } })
    await settle(c.id)
    const label = (await get(c.id)).always[0]
    expect(label).toBe('실행 · python')
    const f = await app.inject({ method: 'POST', url: `/api/agent-chats/${c.id}/forget`, payload: { label } })
    expect(f.json().chat.always).toEqual([])
  })

  it('없는 프로젝트 · 맞지 않는 범위는 거절한다', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: 'nope', text: 'x' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid, text: 'x', scope: { kind: 'topic' } } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid, text: 'x', scope: { kind: 'note', target: '../x' } } })).statusCode).toBe(400)
  })
})

describe('쓰는 중인 글 · 생각 · 곁 질문', () => {
  it('쓰는 중인 글은 화면에만 보내고 기록하지 않으며, 생각은 접힌 줄로, 곁 질문은 에이전트를 거치지 않고 답한다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-chat-stream-'))
    const chats = new AgentChats({ dir, runner: fake, limit: 2, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {}, draft: (_c, text) => drafts.push(text) })
    const c = chats.create({ rid: 'p', text: 'stream' })
    await vi.waitFor(() => expect(drafts.at(-1)).toBe('아니요, 소수가 아닙니다'))
    expect(chats.get(c.id).draft).toBe('아니요, 소수가 아닙니다')
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${c.id}.json`), 'utf8')).draft).toBeUndefined()
    const runs = seen.length
    // 곁 질문: 하던 차례 중에도 에이전트에게 보내지 않는다
    chats.side(c.id, '391은 소수야?')
    await vi.waitFor(() => expect(chats.get(c.id).items.find((i) => i.kind === 'side')).toMatchObject({ q: '391은 소수야?', answer: '17 × 23이라 소수가 아닙니다' }))
    expect(seen.length).toBe(runs)
    expect(sides.at(-1)).toContain('User: stream')
    expect(sides.at(-1)).toContain('Side question: 391은 소수야?')
    chats.side(c.id, '터져')
    await vi.waitFor(() => expect(chats.get(c.id).items.filter((i) => i.kind === 'side').at(-1)).toMatchObject({ error: 'boom' }))
    gate!()
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    const done = chats.get(c.id)
    expect(done.draft).toBeUndefined()
    expect(done.items.filter((i) => i.kind === 'think' || i.kind === 'text').map((i) => (i as { text: string }).text)).toEqual(['17 × 23', '아니요, 소수가 아닙니다.'])
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('곁 질문 글: 뒤에서부터 지시 · 에이전트 글을 정한 길이 안으로', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ kind: 'text' as const, at: '', text: `글 ${i} ${'x'.repeat(500)}` }))
    const p = sidePrompt({ title: 'T', scope: { kind: 'project' }, items, todos: [{ text: '시험', state: 'in_progress' }], changed: ['a.ts'] }, '뭐 해?')
    expect(p).toContain('글 49')
    expect(p).not.toContain('글 0 ')
    expect(p).toContain('[in_progress] 시험')
    expect(p).toContain('Changed files: a.ts')
    expect(p.length).toBeLessThan(14_000)
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
    expect(c.items[0]).toMatchObject({ kind: 'ask', answer: 'deny', expired: true })
    expect(c.items.at(-1)!.kind).toBe('error')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

