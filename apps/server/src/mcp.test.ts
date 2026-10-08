// 에이전트용 입구(MCP): 도구가 앱 서버 API를 거쳐 읽고, 서버가 꺼져 있으면 쓰지 않고 알린다
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { agentOf, createMcpServer } from './mcp.js'
import { app, R, useSampleApp } from './testkit.js'

useSampleApp()

/** 실제 서버에 보내는 대신 같은 요청을 테스트 앱에 넣는 fetch */
const injectFetch = (async (input: string | URL) => {
  const u = new URL(String(input))
  const res = await app.inject({ method: 'GET', url: u.pathname + u.search })
  return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

async function connect(fetchImpl: typeof fetch = injectFetch): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createMcpServer({ baseUrl: 'http://127.0.0.1:1', fetch: fetchImpl }).connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  return client
}

const textOf = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { type: string; text: string }[])[0]!.text

describe('MCP 입구 (읽기)', () => {
  it('연결한 클라이언트 이름으로 고친 에이전트를 적는다', () => {
    expect(agentOf('claude-code')).toBe('claude-code')
    expect(agentOf('Claude Desktop')).toBe('claude-code')
    expect(agentOf('codex-mcp-client')).toBe('codex')
    expect(agentOf('cursor')).toBe('cursor')
    expect(agentOf(undefined)).toBe('mcp')
  })

  it('쓰기 도구는 edit_note · edit_concept 둘뿐이다', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['edit_concept', 'edit_note', 'list_notes', 'list_projects', 'list_tasks', 'project_status', 'read_concept', 'read_note', 'read_records', 'read_task', 'rules', 'search_library'])
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(!t.name.startsWith('edit_'))
  })

  it('edit_note는 앱 서버의 에이전트 쓰기로 보내고, 확인된 노트 거절을 그대로 전한다', async () => {
    const sent: unknown[] = []
    const fake = (async (input: string | URL, init?: RequestInit) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return sent.length === 1
        ? new Response(JSON.stringify({ ok: true, hash: 'h2', changes: 1 }), { status: 200 })
        : new Response(JSON.stringify({ error: 'Ask the user ... approved: true' }), { status: 428 })
    }) as typeof fetch
    const c = await connect(fake)
    const ok = await c.callTool({ name: 'edit_note', arguments: { project: 'p1', file: 'workbench/notes/a/note.md', baseHash: 'h1', edits: [{ old: 'a', new: 'b' }], summary: 'fix' } })
    expect(textOf(ok)).toContain('New hash: h2')
    expect(sent[0]).toEqual({ url: 'http://127.0.0.1:1/api/agent-edits/write', body: { target: { kind: 'note', rid: 'p1', file: 'workbench/notes/a/note.md' }, baseHash: 'h1', edits: [{ old: 'a', new: 'b' }], summary: 'fix', agent: 'test' } })
    const refused = await c.callTool({ name: 'edit_concept', arguments: { id: 'x', baseHash: 'h', edits: [{ old: 'a', new: 'b' }] } })
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toContain('428')
  })

  it('rules는 안전 규칙과 맡긴 일 규칙 문서를 준다', async () => {
    const t = textOf(await (await connect()).callTool({ name: 'rules', arguments: {} }))
    expect(t).toContain('baseHash')
    expect(t).toContain('# 맡긴 일의 규칙')
  })

  it('rules에 project를 주면 그 연구 저장소의 AGENTS.md · CLAUDE.md와 개념노트 규칙도 모아 준다', async () => {
    const files = [{ file: 'AGENTS.md', text: '# AGENTS.md\n\n- Plan first.' }]
    const fake = (async (input: string | URL) => {
      const u = String(input)
      if (u.endsWith('/api/concepts/rules')) return new Response(JSON.stringify({ rules: { file: 'README.md', text: '## concepts/\n\nOne concept per note.' } }), { status: 200 })
      if (u.endsWith('/api/researches/p1/agent-rules')) return new Response(JSON.stringify({ files }), { status: 200 })
      return new Response(JSON.stringify({ error: 'no' }), { status: 404 })
    }) as typeof fetch
    const t = textOf(await (await connect(fake)).callTool({ name: 'rules', arguments: { project: 'p1' } }))
    expect(t).toContain('# Concept note rules (research-library README.md)\n\n## concepts/\n\nOne concept per note.')
    expect(t).toContain('# Project rules (AGENTS.md)\n\n# AGENTS.md\n\n- Plan first.')
    expect(t).toContain('# 맡긴 일의 규칙')
    // 실제 서버 경로도 있다 (예제 연구에는 AGENTS.md가 없을 수 있다)
    const real = await (await connect()).callTool({ name: 'rules', arguments: { project: 'sample-research' } })
    expect(real.isError).toBeFalsy()
    expect(textOf(real)).toContain('# Project rules')
  })

  it('프로젝트 목록 → 요약 → 노트 → 본문과 hash', async () => {
    const c = await connect()
    const projects = JSON.parse(textOf(await c.callTool({ name: 'list_projects', arguments: {} }))) as { id: string }[]
    expect(projects.map((p) => p.id)).toContain('sample-research')

    const status = textOf(await c.callTool({ name: 'project_status', arguments: { project: 'sample-research' } }))
    expect(status).toContain('#')

    const notes = JSON.parse(textOf(await c.callTool({ name: 'list_notes', arguments: { project: 'sample-research' } }))) as { file: string; status: string }[]
    expect(notes.length).toBeGreaterThan(0)
    const note = notes[0]!
    const read = textOf(await c.callTool({ name: 'read_note', arguments: { project: 'sample-research', file: note.file } }))
    const id = /^workbench\/blocks\/([^/]+)\./.exec(note.file)?.[1]
    const part = (await app.inject({ method: 'GET', url: id ? `${R}/blocks/${id}` : `${R}/manuscript/part?file=${encodeURIComponent(note.file)}` })).json() as { content: string; hash: string }
    expect(part.hash).toBeTruthy()
    expect(read).toBe(`file: ${note.file}\nhash: ${part.hash}\n\n${part.content}`)

    const only = JSON.parse(textOf(await c.callTool({ name: 'list_notes', arguments: { project: 'sample-research', status: note.status } }))) as { status: string }[]
    expect(only.every((n) => n.status === note.status)).toBe(true)
  })

  it('맡긴 일 목록과 하나 읽기', async () => {
    const made = await app.inject({ method: 'POST', url: `${R}/tasks`, payload: { title: '검산', task: '식 3을 확인', endCondition: '식 3이 식 2와 같음' } })
    expect(made.statusCode).toBe(200)
    const id = made.json().task.id as string
    const c = await connect()
    const list = JSON.parse(textOf(await c.callTool({ name: 'list_tasks', arguments: { project: 'sample-research' } }))) as { tasks: { id: string; state: string }[] }
    expect(list.tasks.find((t) => t.id === id)?.state).toBe('working')
    const task = JSON.parse(textOf(await c.callTool({ name: 'read_task', arguments: { project: 'sample-research', id } }))) as { endCondition: string }
    expect(task.endCondition).toBe('식 3이 식 2와 같음')
  })

  it('기록 읽기와 없는 프로젝트는 오류로', async () => {
    const c = await connect()
    const rec = await c.callTool({ name: 'read_records', arguments: { project: 'sample-research', target: 'project' } })
    expect(rec.isError).toBeFalsy()
    const bad = await c.callTool({ name: 'project_status', arguments: { project: 'nope' } })
    expect(bad.isError).toBe(true)
    expect(textOf(bad)).toContain('404')
  })

  it('search_library는 개념노트·논문만, 낱말이 모두 든 것만', async () => {
    const items = [
      { kind: 'concept', id: 'euler-characteristic', title: 'Euler characteristic', also: 'discharging rules' },
      { kind: 'paper', id: 'exampleDischargingRules2022', title: 'Discharging rules for planar graphs of minimum degree five', also: 'Example 2022' },
      { kind: 'note', id: 'x', title: 'discharging rules note' },
    ]
    // 본문 찾기: 이름으로도 찾은 노트에는 맞은 줄을 붙이고, 본문으로만 찾은 노트는 뒤에 더한다
    const body = [
      { id: 'euler-characteristic', title: 'Euler characteristic', hits: [{ line: 12, heading: 'Properties', text: 'discharging rules' }] },
      { id: 'fct', title: 'Four color theorem', hits: [{ line: 3, heading: 'Definition', text: 'related to the discharging rules' }] },
    ]
    const urls: string[] = []
    const fake = (async (input: string | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ items: String(input).includes('/api/concepts/search') ? body : items }), { status: 200 })
    }) as typeof fetch
    const c = await connect(fake)
    const all = JSON.parse(textOf(await c.callTool({ name: 'search_library', arguments: { query: 'discharging rules' } }))) as { id: string; hits?: unknown[] }[]
    expect(all.map((i) => i.id)).toEqual(['euler-characteristic', 'exampleDischargingRules2022', 'fct'])
    expect(all[0]!.hits).toEqual(body[0]!.hits)
    expect(all[2]).toEqual({ kind: 'concept', ...body[1] })
    urls.length = 0
    const papers = JSON.parse(textOf(await c.callTool({ name: 'search_library', arguments: { query: 'discharging 2022', kind: 'paper' } }))) as { id: string }[]
    expect(papers.map((i) => i.id)).toEqual(['exampleDischargingRules2022'])
    // 논문만 찾을 때는 본문 찾기를 부르지 않는다
    expect(urls.some((u) => u.includes('/api/concepts/search'))).toBe(false)
  })

  it('앱 서버가 꺼져 있으면 파일을 직접 고치지 말라고 알린다', async () => {
    const down = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
    const r = await (await connect(down)).callTool({ name: 'list_projects', arguments: {} })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain('Do not edit files directly')
  })
})
