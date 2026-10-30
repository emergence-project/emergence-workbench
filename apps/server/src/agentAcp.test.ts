import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acpAgentRunner, callsOf, commandOf, modelsOf, optionFor } from './agentAcp.js'
import { Inbox, type RunEvent, type RunInput, type ToolDecision, type Turn } from './agentChats.js'
import { ACP_AGENTS, acpBin, isAcp } from './agentKinds.js'
import { gateCall } from './agentMcpHttp.js'

describe('ACP 도구 → 앱의 도구 이름', () => {
  it('명령 · 고치기 · 지우기 · 읽기 · 웹 · 앱 MCP', () => {
    expect(commandOf(['bash', '-lc', 'pnpm test'])).toBe('pnpm test')
    expect(commandOf(['/bin/zsh', '-c', 'ls -la'])).toBe('ls -la')
    expect(commandOf(['git', 'status'])).toBe('git status')
    expect(callsOf({ kind: 'execute', rawInput: { command: ['bash', '-lc', 'rm -rf x'] } })).toEqual([{ tool: 'Bash', input: { command: 'rm -rf x' } }])
    // 여러 파일을 고치면 파일마다 판단한다
    expect(callsOf({ kind: 'edit', locations: [{ path: '/r/a.md' }, { path: '/r/b.md' }], rawInput: {} }).map((c) => c.input.file_path)).toEqual(['/r/a.md', '/r/b.md'])
    // Gemini write_file은 Write, replace는 Edit (앞뒤 글이 있음)
    expect(callsOf({ kind: 'edit', rawInput: { file_path: '/r/a.md', content: 'x' } })).toEqual([{ tool: 'Write', input: { file_path: '/r/a.md', content: 'x' } }])
    expect(callsOf({ kind: 'edit', rawInput: { file_path: '/r/a.md', old_string: 'a', new_string: 'b' } })[0]).toEqual({ tool: 'Edit', input: { file_path: '/r/a.md', old_string: 'a', new_string: 'b' } })
    expect(callsOf({ kind: 'delete', locations: [{ path: '/r/a.md' }] })).toEqual([{ tool: 'Bash', input: { command: 'rm "/r/a.md"' } }])
    expect(callsOf({ kind: 'read', locations: [{ path: '/r/a.md' }] })[0]).toEqual({ tool: 'Read', input: { file_path: '/r/a.md' } })
    expect(callsOf({ kind: 'fetch', rawInput: { url: 'https://x' } })[0]!.tool).toBe('WebFetch')
    expect(callsOf({ kind: 'other', title: 'edit_note (workbench MCP Server)', rawInput: { file: 'n.md' } })).toEqual([{ tool: 'mcp__workbench__edit_note', input: { file: 'n.md' }, mcp: true }])
    expect(callsOf({ kind: 'other', title: 'mcp: workbench.read_note', rawInput: { arguments: { file: 'n.md' } } })[0]).toMatchObject({ tool: 'mcp__workbench__read_note', input: { file: 'n.md' } })
    expect(callsOf({ kind: 'think' })[0]!.free).toBe(true)
  })
  it('허락 답은 에이전트가 준 선택지 중에서, 없으면 취소', () => {
    const options = [{ optionId: 'a1', kind: 'allow_once' }, { optionId: 'a2', kind: 'allow_always' }, { optionId: 'r1', kind: 'reject_once' }]
    expect(optionFor(options, true)).toEqual({ outcome: { outcome: 'selected', optionId: 'a1' } })
    expect(optionFor(options, false)).toEqual({ outcome: { outcome: 'selected', optionId: 'r1' } })
    expect(optionFor([], false)).toEqual({ outcome: { outcome: 'cancelled' } })
  })
  it('모델 목록: 기본을 앞에, 지금 모델을 기본의 실제 모델로', () => {
    expect(modelsOf({ models: { currentModelId: 'gpt-5-codex/high', availableModels: [{ modelId: 'gpt-5-codex/high', name: 'GPT-5 Codex (high)' }, { modelId: 'bad id!', name: 'x' }] } }))
      .toEqual([{ value: 'default', name: '기본 모델', desc: '', resolved: 'gpt-5-codex/high' }, { value: 'gpt-5-codex/high', name: 'GPT-5 Codex (high)', desc: '', resolved: 'gpt-5-codex/high' }])
    expect(modelsOf({})).toEqual([])
    expect(isAcp('codex') && isAcp('gemini') && !isAcp('claude-code')).toBe(true)
  })
  it('앱 MCP 입구: 도구 부르기마다 대화의 판단을 거치고, 막히면 도구 오류로 답한다', async () => {
    const seen: string[] = []
    const gate = async (tool: string): Promise<ToolDecision> => { seen.push(tool); return tool.endsWith('edit_note') ? { allow: false, message: 'read-only' } : { allow: true } }
    expect(await gateCall(gate, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'edit_note', arguments: { file: 'a' } } }))
      .toEqual({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'read-only' }], isError: true } })
    expect(await gateCall(gate, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_note', arguments: {} } })).toBeUndefined()
    expect(await gateCall(gate, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).toBeUndefined()
    expect(seen).toEqual(['mcp__workbench__edit_note', 'mcp__workbench__read_note'])
  })
})

// 가짜 ACP 에이전트: 받은 요청을 기록 파일에 적고, 지시 글에 따라 허락을 묻거나 글을 흘려 보낸다
const FAKE = String.raw`#!/usr/bin/env node
const fs = require('fs')
const log = (m) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(m) + '\n')
let seq = 100
const waiting = new Map()
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
const update = (sessionId, u) => send({ method: 'session/update', params: { sessionId, update: u } })
const ask = (params) => new Promise((ok) => { const id = seq++; waiting.set(id, ok); send({ id, method: 'session/request_permission', params }) })
require('readline').createInterface({ input: process.stdin }).on('line', async (line) => {
  const m = JSON.parse(line)
  if (!m.method) { const w = waiting.get(m.id); waiting.delete(m.id); return w && w(m.result) }
  log({ method: m.method, params: m.params })
  const reply = (result) => send({ id: m.id, result })
  if (m.method === 'initialize') return reply({ protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { image: true }, mcpCapabilities: { http: true } } })
  if (m.method === 'session/new') return reply({ sessionId: 's-new', modes: { currentModeId: 'auto', availableModes: [{ id: 'read-only' }, { id: 'auto' }] }, models: { currentModelId: 'm1', availableModels: [{ modelId: 'm1', name: 'M one' }] } })
  if (m.method === 'session/load') { update(m.params.sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OLD' } }); return reply({}) }
  if (m.method === 'session/cancel') return
  if (m.method !== 'session/prompt') return reply({})
  const sid = m.params.sessionId
  const text = m.params.prompt[0].text
  if (text.includes('EDIT')) {
    const r = await ask({ sessionId: sid, toolCall: { toolCallId: 't1', kind: 'edit', title: 'Edit', locations: [{ path: '/r/a.md' }] }, options: [{ optionId: 'yes', kind: 'allow_once' }, { optionId: 'no', kind: 'reject_once' }] })
    update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'picked ' + r.outcome.optionId } })
    return reply({ stopReason: 'end_turn' })
  }
  update(sid, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking' } })
  update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello ' } })
  update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'world' } })
  update(sid, { sessionUpdate: 'tool_call', toolCallId: 't2', kind: 'execute', title: 'ls', rawInput: { command: ['bash', '-lc', 'ls'] } })
  update(sid, { sessionUpdate: 'plan', entries: [{ content: 'read', status: 'completed' }] })
  reply({ stopReason: 'end_turn', usage: { inputTokens: 12, outputTokens: 3 } })
})
`

describe('ACP 실행기 (가짜 에이전트)', () => {
  let dir = ''
  let logFile = ''
  const old = { bin: process.env.RW_CODEX_ACP_BIN, log: process.env.FAKE_LOG }
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-'))
    const bin = path.join(dir, 'fake-acp')
    fs.writeFileSync(bin, FAKE, { mode: 0o755 })
    logFile = path.join(dir, 'log.jsonl')
    process.env.RW_CODEX_ACP_BIN = bin
    process.env.FAKE_LOG = logFile
  })
  afterAll(() => {
    if (old.bin === undefined) delete process.env.RW_CODEX_ACP_BIN; else process.env.RW_CODEX_ACP_BIN = old.bin
    if (old.log === undefined) delete process.env.FAKE_LOG; else process.env.FAKE_LOG = old.log
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const logged = () => fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { method: string; params: Record<string, unknown> })
  const input = (o: Partial<RunInput>): RunInput => ({
    prompt: 'hi', mode: 'edit', model: 'default', effort: 'medium', cwd: dir, extraDirs: [], brief: 'BRIEF', write: 'notes',
    canUseTool: async () => ({ allow: true }), signal: new AbortController().signal, ...o,
  })
  const collect = async (it: AsyncIterable<RunEvent>) => { const out: RunEvent[] = []; for await (const e of it) out.push(e); return out }

  it('실행 파일은 환경 변수가 먼저', () => expect(acpBin(ACP_AGENTS.codex)).toBe(process.env.RW_CODEX_ACP_BIN))

  it('새 세션: 안내를 첫 지시 앞에 붙이고, 모드 · 앱 MCP를 넘기고, 글 · 생각 · 명령 · 할 일 · 차례 끝을 사건으로', async () => {
    fs.rmSync(logFile, { force: true })
    let closed = false
    const run = acpAgentRunner(ACP_AGENTS.codex, () => ({ url: 'http://127.0.0.1:1/api/agent-mcp/k', close: () => { closed = true } }))
    const ev = await collect(run(input({ write: 'read' })))
    expect(ev[0]).toEqual({ type: 'session', id: 's-new' })
    expect(ev.filter((e) => e.type === 'delta').map((e) => e.type === 'delta' && e.text).join('')).toBe('hello world')
    expect(ev).toContainEqual({ type: 'think', text: 'thinking' })
    expect(ev).toContainEqual({ type: 'text', text: 'hello world' })
    expect(ev).toContainEqual({ type: 'tool', tool: 'Bash', input: { command: 'ls' } })
    expect(ev).toContainEqual({ type: 'tool', tool: 'TodoWrite', input: { todos: [{ content: 'read', status: 'completed' }] } })
    expect(ev.at(-1)).toMatchObject({ type: 'result', ok: true, tokens: { in: 12, out: 3 } })
    const log = logged()
    expect(log.find((m) => m.method === 'session/new')!.params.mcpServers).toEqual([{ type: 'http', name: 'workbench', url: 'http://127.0.0.1:1/api/agent-mcp/k', headers: [] }])
    // 읽기 전용 연구 대화 → Codex 읽기 전용 샌드박스
    expect(log.find((m) => m.method === 'session/set_mode')!.params).toEqual({ sessionId: 's-new', modeId: 'read-only' })
    expect(JSON.stringify(log.find((m) => m.method === 'session/prompt')!.params.prompt)).toContain('BRIEF')
    expect(closed).toBe(true)
  })

  it('허락 요청은 앱의 판단으로, 거절하면 거절 선택지를 고른다', async () => {
    const asked: [string, Record<string, unknown>][] = []
    const run = acpAgentRunner(ACP_AGENTS.codex, () => undefined)
    const deny = await collect(run(input({ prompt: 'EDIT', canUseTool: async (tool, i) => { asked.push([tool, i]); return { allow: false, message: 'no' } } })))
    expect(asked).toEqual([['Edit', { file_path: '/r/a.md', old_string: '', new_string: '' }]])
    expect(deny).toContainEqual({ type: 'text', text: 'picked no' })
    const allow = await collect(run(input({ prompt: 'EDIT' })))
    expect(allow).toContainEqual({ type: 'text', text: 'picked yes' })
  })

  it('이어 하기: 같은 세션을 다시 열고(앞 기록 알림은 버림) 안내를 다시 붙이지 않으며, inbox의 지시를 이어 받는다', async () => {
    fs.rmSync(logFile, { force: true })
    const inbox = new Inbox<Turn>()
    const run = acpAgentRunner(ACP_AGENTS.codex, () => undefined)
    const seen: RunEvent[] = []
    const done = (async () => { for await (const e of run(input({ sessionId: 's-old', model: 'm1', inbox }))) { seen.push(e); if (e.type === 'result' && seen.filter((x) => x.type === 'result').length === 1) { inbox.push({ prompt: 'again' }); inbox.close() } } })()
    await done
    expect(seen[0]).toEqual({ type: 'session', id: 's-old' })
    expect(seen.some((e) => e.type === 'text' && e.text.includes('OLD'))).toBe(false)
    expect(seen.filter((e) => e.type === 'result')).toHaveLength(2)
    const log = logged()
    expect(log.find((m) => m.method === 'session/set_model')!.params).toEqual({ sessionId: 's-old', modelId: 'm1' })
    const prompts = log.filter((m) => m.method === 'session/prompt').map((m) => JSON.stringify(m.params.prompt))
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).not.toContain('BRIEF')
  })

  it('실행 파일이 없으면 깔 명령을 알린다', async () => {
    const run = acpAgentRunner(ACP_AGENTS.gemini, () => undefined)
    const was = process.env.RW_GEMINI_BIN
    process.env.RW_GEMINI_BIN = path.join(dir, 'none')
    try { await expect(collect(run(input({})))).rejects.toThrow(/npm i -g @google\/gemini-cli/) } finally { if (was === undefined) delete process.env.RW_GEMINI_BIN; else process.env.RW_GEMINI_BIN = was }
  })
})

describe('앱 MCP HTTP 입구', () => {
  it('열린 열쇠로만 받고, 판단이 막은 도구는 부르지 않는다', async () => {
    const { default: Fastify } = await import('fastify')
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
    const { registerChatMcp } = await import('./agentMcpHttp.js')
    const app = Fastify()
    const called: string[] = []
    const open = registerChatMcp(app, () => {
      const s = new McpServer({ name: 't', version: '1' })
      for (const name of ['read_note', 'edit_note']) s.registerTool(name, { description: name }, async () => { called.push(name); return { content: [{ type: 'text', text: `${name} ok` }] } })
      return s
    })
    expect(open({ gate: async () => ({ allow: true }) })).toBeUndefined() // 아직 듣지 않음
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const m = open({ gate: async (tool) => (tool.endsWith('edit_note') ? { allow: false, message: 'blocked by the app' } : { allow: true }) })!
      const client = new Client({ name: 'codex', version: '1' })
      await client.connect(new StreamableHTTPClientTransport(new URL(m.url)))
      expect((await client.listTools()).tools.map((x) => x.name).sort()).toEqual(['edit_note', 'read_note'])
      expect(await client.callTool({ name: 'read_note', arguments: {} })).toMatchObject({ content: [{ text: 'read_note ok' }] })
      expect(await client.callTool({ name: 'edit_note', arguments: {} })).toMatchObject({ isError: true, content: [{ text: 'blocked by the app' }] })
      expect(called).toEqual(['read_note'])
      await client.close()
      m.close()
      const res = await fetch(m.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
      expect(res.status).toBe(404)
    } finally { await app.close() }
  })
})

describe('대화의 에이전트', () => {
  it('Codex 대화는 Codex 실행기로, 계획 모드는 묻고 하기로, 안내에서 Claude만의 줄은 뺀다', async () => {
    const { AgentChats } = await import('./agentChats.js')
    const { vi } = await import('vitest')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-chat-agent-'))
    const got: { who: string; input: RunInput }[] = []
    const runner = (who: string) => async function* (input: RunInput): AsyncIterable<RunEvent> { got.push({ who, input }); yield { type: 'session', id: `${who}-s` }; yield { type: 'result', ok: true } }
    const chats = new AgentChats({ dir, runner: runner('claude'), others: { codex: runner('codex') }, limit: 2, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {} })
    const c = chats.create({ rid: 'p', text: '봐 줘', agent: 'codex', mode: 'plan' })
    expect(c).toMatchObject({ agent: 'codex', mode: 'ask' })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(got[0]!.who).toBe('codex')
    expect(got[0]!.input.brief).not.toContain('TodoWrite')
    expect(got[0]!.input.brief).not.toContain('subagent')
    expect(chats.settings(c.id, { mode: 'plan' }).mode).toBe('ask')
    const d = chats.create({ rid: 'p', text: '봐 줘' })
    await vi.waitFor(() => expect(chats.get(d.id).state).toBe('idle'))
    expect(got[1]!.who).toBe('claude')
    expect(got[1]!.input.brief).toContain('TodoWrite')
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
