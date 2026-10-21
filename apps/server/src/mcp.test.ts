// 에이전트용 입구(MCP): 도구가 앱 서버 API를 거쳐 읽고, 서버가 꺼져 있으면 쓰지 않고 알린다
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { agentOf, createMcpServer, INSTRUCTIONS, recordAuthor } from './mcp.js'
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

  it('쓰기 도구는 edit_note · edit_concept · answer_record · add_record, 흐름의 flow_add · flow_update · flow_review, 맡긴 일 add_task · report_task, 일지 add_journal뿐이다', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['add_journal', 'add_record', 'add_task', 'answer_record', 'edit_concept', 'edit_note', 'flow_add', 'flow_read', 'flow_review', 'flow_search', 'flow_update', 'list_edit_reviews', 'list_notes', 'list_projects', 'list_records', 'list_tasks', 'overview', 'project_status', 'read_concept', 'read_note', 'read_records', 'read_task', 'report_task', 'rules', 'search_library'])
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(!['edit_note', 'edit_concept', 'answer_record', 'add_record', 'flow_add', 'flow_update', 'flow_review', 'add_task', 'report_task', 'add_journal'].includes(t.name))
  })

  it('앱 고치기 대화 안에서만 app_submit · app_checks가 붙고, 그 대화의 앱 API를 부른다', async () => {
    const urls: string[] = []
    const f = (async (input: string | URL, init?: RequestInit) => {
      urls.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`)
      return new Response(JSON.stringify(init?.method === 'POST' ? { number: 5, url: 'u', created: true } : { checks: [], done: false, ok: false }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const [a, b] = InMemoryTransport.createLinkedPair()
    await createMcpServer({ baseUrl: 'http://127.0.0.1:1', fetch: f, appChat: 'c-1' }).connect(a)
    const c = new Client({ name: 'test', version: '0' })
    await c.connect(b)
    const names = (await c.listTools()).tools.map((t) => t.name)
    expect(names).toContain('app_submit')
    expect(names).toContain('app_checks')
    expect(textOf(await c.callTool({ name: 'app_submit', arguments: { title: '고침', body: 'b' } }))).toContain('Opened PR #5')
    await c.callTool({ name: 'app_checks', arguments: {} })
    expect(urls).toEqual(['POST /api/agent-chats/c-1/app/submit', 'GET /api/agent-chats/c-1/app/checks'])
  })

  it('연결 안내의 순서에 적은 도구 이름은 모두 실제 도구다', async () => {
    const c = await connect()
    const names = new Set((await c.listTools()).tools.map((t) => t.name))
    expect(c.getInstructions()).toBe(INSTRUCTIONS)
    const used = [...INSTRUCTIONS.matchAll(/\b[a-z]+(?:_[a-z]+)+\b|\b(?:rules|overview)\b/g)].map((m) => m[0]).filter((w) => w !== 'unanswered')
    expect(used.length).toBeGreaterThan(8)
    for (const w of used) expect(names, w).toContain(w)
  })

  it('overview는 진행 중인 프로젝트를 한 표로 돌려준다 (사용자 차례 = 홈의 확인 필요)', async () => {
    const issues = JSON.parse((await app.inject({ method: 'GET', url: '/api/research-issues' })).body) as { counts: Record<string, number> }
    const out = textOf(await (await connect()).callTool({ name: 'overview', arguments: {} }))
    expect(out).toContain('# 프로젝트 한눈에')
    expect(out).toContain('| 프로젝트 | 폴더 | 사용자 차례 | 에이전트 차례 | 저장소 | 최근 기록 |')
    const rid = R.split('/').pop()!
    expect(issues.counts[rid]).toBeGreaterThanOrEqual(0)
  })

  it('list_records는 프로젝트의 모든 기록을 종류 · 상태 · 대상으로 거른다', async () => {
    await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: '답을 기다리는 질문', part: '흐름 화면 › 흐름 차트', partText: '점 A' } })
    await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '메모', title: '프로젝트', text: '그냥 메모' } })
    await app.inject({ method: 'POST', url: `${R}/comments/topic-kempe`, payload: { kind: '메모', title: '주제 Kempe', text: '주제 메모' } })
    const c = await connect()
    const rid = R.split('/').pop()!
    const all = JSON.parse(textOf(await c.callTool({ name: 'list_records', arguments: { project: rid } }))).records as { target: string; kind: string; body: string }[]
    expect(all.map((r) => r.body)).toEqual(expect.arrayContaining(['답을 기다리는 질문', '그냥 메모', '주제 메모']))
    const waiting = JSON.parse(textOf(await c.callTool({ name: 'list_records', arguments: { project: rid, unanswered: true } }))).records
    expect(waiting).toEqual([expect.objectContaining({ target: 'project', kind: '질문', state: '대기', part: '흐름 화면 › 흐름 차트', partText: '점 A', body: '답을 기다리는 질문' })])
    const topics = JSON.parse(textOf(await c.callTool({ name: 'list_records', arguments: { project: rid, target: 'topic-' } }))).records
    expect(topics.map((r: { body: string }) => r.body)).toEqual(['주제 메모'])
  })

  it('answer_record는 연결한 에이전트 이름으로 답을 보낸다', async () => {
    const sent: unknown[] = []
    const fake = (async (input: string | URL, init?: RequestInit) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ hash: 'h3' }), { status: 200 })
    }) as typeof fetch
    const r = await (await connect(fake)).callTool({ name: 'answer_record', arguments: { project: 'p1', target: 'flow-a b', id: 'c-1', answer: '식 (3) 때문입니다.' } })
    expect(textOf(r)).toContain('h3')
    expect(sent).toEqual([{ url: 'http://127.0.0.1:1/api/researches/p1/comments/flow-a%20b/c-1/answers', body: { by: 'test', body: '식 (3) 때문입니다.' } }])
  })

  it('기록의 쓴 이(by)는 영어 소문자 · 숫자 · - 20자까지로 줄인다', () => {
    expect(recordAuthor('claude-code')).toBe('claude-code')
    expect(recordAuthor('codex-mcp-client')).toBe('codex')
    expect(recordAuthor('My Agent 2!')).toBe('my-agent-2')
    expect(recordAuthor('123')).toBe('agent')
    expect(recordAuthor('a'.repeat(40))).toHaveLength(20)
  })

  it('add_record는 노트 파일의 기록 대상에 에이전트 이름으로 질문을 남기고, 그 질문은 사용자 차례다', async () => {
    const full = (async (input: string | URL, init?: RequestInit) => {
      const u = new URL(String(input))
      const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST', url: u.pathname + u.search, ...(init?.body && { payload: JSON.parse(String(init.body)) }) })
      return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const c = await connect(full)
    const rid = R.split('/').pop()!
    const notes = (await app.inject({ method: 'GET', url: `${R}/notes` })).json().notes as { id: string; file: string; type: string }[]
    const note = notes.find((n) => n.type === 'block')!
    const body = (await app.inject({ method: 'GET', url: `${R}/blocks/${note.id}` })).json().content as string
    const quote = body.split('\n').find((l) => l.trim().length > 12 && !l.startsWith('%') && !l.startsWith('\\'))!.trim().slice(0, 12)
    const r = await c.callTool({ name: 'add_record', arguments: { project: rid, file: note.file, kind: '질문', text: '이 식이 맞는지 봐 주세요', quote } })
    expect(r.isError).toBeFalsy()
    expect(textOf(r)).toContain('user\'s turn')
    const records = JSON.parse(textOf(await c.callTool({ name: 'list_records', arguments: { project: rid, kind: '질문' } }))).records as { by?: string; body: string; quote?: string }[]
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ by: 'test', body: '이 식이 맞는지 봐 주세요', quote })]))
    const waiting = JSON.parse(textOf(await c.callTool({ name: 'list_records', arguments: { project: rid, unanswered: true } }))).records as { body: string }[]
    expect(waiting.map((x) => x.body)).not.toContain('이 식이 맞는지 봐 주세요')
    const issues = (await app.inject({ method: 'GET', url: '/api/research-issues' })).json()
    expect(issues.records[rid]).toBeGreaterThanOrEqual(1)
    expect((await c.callTool({ name: 'add_record', arguments: { project: rid, target: 'note-x', kind: '메모', text: 'x' } })).isError).toBe(true)
    expect((await c.callTool({ name: 'add_record', arguments: { project: rid, kind: '메모', text: 'x' } })).isError).toBe(true)
  })

  it('흐름 도구: 일을 시작할 때 점을 만들고, 끝낼 때 문턱이 빈 칸을 알리며, 질문 문장은 바꾸지 못한다', async () => {
    const full = (async (input: string | URL, init?: RequestInit) => {
      const u = new URL(String(input))
      const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH', url: u.pathname + u.search, ...(init?.body && { payload: JSON.parse(String(init.body)) }) })
      return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const c = await connect(full)
    const rid = R.split('/').pop()!
    const q = JSON.parse(textOf(await c.callTool({ name: 'flow_add', arguments: { project: rid, kind: 'question', short: 'MCP question', fields: { question: '되나?', motivation: '궁금' } } })))
    expect(q).toMatchObject({ id: 'mcp-question', progress: 'active', gaps: ['판정 기준이 없다 (무엇이 나오면 해결 · 반증인가)'] })
    const changed = await c.callTool({ name: 'flow_update', arguments: { project: rid, id: q.id, baseHash: q.hash, fields: { question: '어떻게?' } } })
    expect(changed.isError).toBe(true)
    expect(textOf(changed)).toContain('decided by the user')
    const early = await c.callTool({ name: 'flow_update', arguments: { project: rid, id: q.id, baseHash: q.hash, progress: 'done' } })
    expect(early.isError).toBe(true)
    expect(textOf(early)).toContain('판정 기준')
    const done = JSON.parse(textOf(await c.callTool({ name: 'flow_update', arguments: { project: rid, id: q.id, baseHash: q.hash, progress: 'done', fields: { criterion: '예 / 아니오' }, next: '증명' } })))
    expect(done).toMatchObject({ progress: 'done', result: 'solved' })
    const rows = JSON.parse(textOf(await c.callTool({ name: 'flow_search', arguments: { project: rid, q: 'MCP question' } }))).rows as { id: string }[]
    expect(rows[0]!.id).toBe('mcp-question')
    expect(JSON.parse(textOf(await c.callTool({ name: 'flow_read', arguments: { project: rid, id: q.id } }))).fields).toEqual({ question: '되나?', motivation: '궁금', criterion: '예 / 아니오' })
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
    const ok = await c.callTool({ name: 'edit_note', arguments: { project: 'p1', file: 'workbench/notes/a/note.md', baseHash: 'h1', edits: [{ old: 'a', new: 'b', reason: '오타' }], summary: 'fix' } })
    expect(textOf(ok)).toContain('New hash: h2')
    expect(sent[0]).toEqual({ url: 'http://127.0.0.1:1/api/agent-edits/write', body: { target: { kind: 'note', rid: 'p1', file: 'workbench/notes/a/note.md' }, baseHash: 'h1', edits: [{ old: 'a', new: 'b', reason: '오타' }], summary: 'fix', agent: 'test' } })
    const refused = await c.callTool({ name: 'edit_concept', arguments: { id: 'x', baseHash: 'h', edits: [{ old: 'a', new: 'b', reason: '오타' }] } })
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toContain('428')
  })

  it('바꾼 곳마다 reason이 없으면 보내지 않는다', async () => {
    const sent: unknown[] = []
    const c = await connect((async () => { sent.push(1); return new Response('{}') }) as typeof fetch)
    for (const edit of [{ old: 'a', new: 'b' }, { old: 'a', new: 'b', reason: '  ' }]) {
      const r = await c.callTool({ name: 'edit_note', arguments: { project: 'p', file: 'workbench/notes/a/note.md', baseHash: 'h', edits: [edit] } })
      expect(r.isError).toBe(true)
      expect(textOf(r)).toContain('reason')
    }
    expect(sent).toEqual([])
  })

  it('rules는 안전 규칙을 주고, 맡긴 일 · 개념노트 규칙은 이름과 크기만 적었다가 part로 준다', async () => {
    const c = await connect()
    const t = textOf(await c.callTool({ name: 'rules', arguments: {} }))
    expect(t).not.toContain('# 맡긴 일의 규칙')
    expect(t).toMatch(/- part: "tasks" · .* · \d+\.\dKB/)
    expect(t).toMatch(/- part: "concepts" · .* · \d+\.\dKB/)
    expect(textOf(await c.callTool({ name: 'rules', arguments: { part: 'tasks' } }))).toContain('# 맡긴 일의 규칙')
    expect(t).toContain('baseHash')
    expect(t).toContain('project_status instead of workbench/STATUS.md')
    expect(t).toContain('add_task / report_task')
    expect(t).toContain('docs/repo-format.md')
    expect(t).toContain('agent:check')
    expect(t).toContain('only when the user asks')
    expect(t).not.toContain('# Common research rules')
  })

  it('rules에 project를 주면 그 연구 저장소의 AGENTS.md · CLAUDE.md와 개념노트 규칙도 모아 준다', async () => {
    const files = [{ file: 'AGENTS.md', text: '# AGENTS.md\n\n- Plan first.' }]
    const fake = (async (input: string | URL) => {
      const u = String(input)
      if (u.endsWith('/api/concepts/rules')) return new Response(JSON.stringify({ rules: { file: 'README.md', text: '## concepts/\n\nOne concept per note.' } }), { status: 200 })
      if (u.endsWith('/api/researches/p1/agent-rules')) return new Response(JSON.stringify({ files }), { status: 200 })
      if (u.endsWith('/api/rules/common')) return new Response(JSON.stringify({ rules: { file: '~/rules/research.md', text: '# 연구 공통 규칙\n\n1. 지어내지 않는다.' } }), { status: 200 })
      return new Response(JSON.stringify({ error: 'no' }), { status: 404 })
    }) as typeof fetch
    const fc = await connect(fake)
    const t = textOf(await fc.callTool({ name: 'rules', arguments: { project: 'p1' } }))
    expect(t).toContain('# Project rules (AGENTS.md)\n\n# AGENTS.md\n\n- Plan first.')
    expect(t).toContain('# Common research rules (~/rules/research.md)\n\n# 연구 공통 규칙\n\n1. 지어내지 않는다.')
    expect(t.indexOf('# Common research rules')).toBeLessThan(t.indexOf('# Project rules'))
    expect(t).not.toContain('One concept per note.')
    expect(textOf(await fc.callTool({ name: 'rules', arguments: { part: 'concepts' } }))).toBe('# Concept note rules (shared library README.md)\n\n## concepts/\n\nOne concept per note.')
    // 실제 서버 경로도 있다 (예제 연구에는 AGENTS.md가 없을 수 있다)
    const real = await (await connect()).callTool({ name: 'rules', arguments: { project: 'sample-research' } })
    expect(real.isError).toBeFalsy()
    expect(textOf(real)).toContain('# Project rules')
  })

  it('프로젝트 목록 → 요약 → 노트 → 본문과 hash', async () => {
    const c = await connect()
    const projects = JSON.parse(textOf(await c.callTool({ name: 'list_projects', arguments: {} }))) as { id: string }[]
    expect(projects.map((p) => p.id)).toContain('sample-research')

    // 기본은 짧은 요약, section은 그 절만, full은 전부 (10/15)
    const status = textOf(await c.callTool({ name: 'project_status', arguments: { project: 'sample-research' } }))
    const full = textOf(await c.callTool({ name: 'project_status', arguments: { project: 'sample-research', full: true } }))
    expect(status).toContain('## 다른 절 (필요할 때만 읽는다)')
    expect(status.length).toBeLessThan(full.length)
    const notesPart = textOf(await c.callTool({ name: 'project_status', arguments: { project: 'sample-research', section: '블록 노트' } }))
    expect(notesPart).toMatch(/^## 블록 노트 \d+/)
    expect(full).toContain(notesPart)
    const missing = await c.callTool({ name: 'project_status', arguments: { project: 'sample-research', section: '없는 절' } })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('블록 노트')

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

  it('list_notes의 target은 STATUS와 같은 slug이고 main.tex에는 없다', async () => {
    const rows = [
      { id: '한..글', type: 'note', file: 'workbench/notes/한..글/note.md', status: 'solved' },
      { id: 'calc name', type: 'calc', file: 'workbench/calc/calc name/note.md', status: 'in-progress' },
      { id: 'block-id', type: 'block', file: 'workbench/blocks/block-id.tex', status: 'in-progress' },
      { id: 'old', type: 'note', file: 'workbench/notes/old/main.tex', status: 'in-progress' },
    ]
    const fake = (async () => new Response(JSON.stringify({ notes: rows }), { status: 200 })) as typeof fetch
    const c = await connect(fake)
    const list = JSON.parse(textOf(await c.callTool({ name: 'list_notes', arguments: { project: 'p' } })))
    expect(list.map((n: { target?: string }) => n.target)).toEqual(['note-___', 'calc-calc_name', 'block-block-id', undefined])
  })

  it('list_edit_reviews는 선택한 프로젝트 또는 전체 대기 목록을 읽는다', async () => {
    const urls: string[] = []
    const body = { reviews: [{ key: 'note:p:f', changes: 1, agents: ['codex'] }], attempts: [{ key: 'note:p:g', agent: 'claude-code' }] }
    const fake = (async (input: string | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const c = await connect(fake)
    for (const args of [{}, { project: 'p / q' }]) expect(JSON.parse(textOf(await c.callTool({ name: 'list_edit_reviews', arguments: args })))).toEqual(body)
    expect(urls).toEqual(['http://127.0.0.1:1/api/agent-edits', 'http://127.0.0.1:1/api/agent-edits?scope=p%20%2F%20q'])
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

  it('맡긴 일: add_task로 만들고, report_task로 제안 → 결과를 쓰며 done은 쓰지 못한다 (10/21)', async () => {
    const full = (async (input: string | URL, init?: RequestInit) => {
      const u = new URL(String(input))
      const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST', url: u.pathname + u.search, ...(init?.body && { payload: JSON.parse(String(init.body)) }) })
      return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const c = await connect(full)
    const rid = 'sample-research'
    expect(textOf(await c.callTool({ name: 'add_task', arguments: { project: rid, title: 'MCP 검산', task: '식 3을 확인' } }))).toMatch(/Added task \S+ \(workbench\/tasks\/.+\.md, working\)/)
    const id = (JSON.parse(textOf(await c.callTool({ name: 'list_tasks', arguments: { project: rid } }))) as { tasks: { id: string; title: string }[] }).tasks.find((t) => t.title === 'MCP 검산')!.id
    const read = async () => JSON.parse(textOf(await c.callTool({ name: 'read_task', arguments: { project: rid, id } }))) as { hash: string; state: string; proposal?: unknown; conclusion?: string; asks: unknown[]; issues: unknown[]; body: string }
    const missing = await c.callTool({ name: 'report_task', arguments: { project: rid, id, baseHash: (await read()).hash, kind: 'result', conclusion: '같다' } })
    expect(missing.isError).toBe(true)
    expect(textOf(await c.callTool({ name: 'report_task', arguments: { project: rid, id, baseHash: (await read()).hash, kind: 'proposal', endCondition: ['식 3이 식 2와 같음, 부호까지'], reason: '비어 있어서' } }))).toContain('proposed')
    expect((await read()).proposal).toEqual({ endCondition: ['식 3이 식 2와 같음, 부호까지'], reason: '비어 있어서' })
    const notWorking = await c.callTool({ name: 'report_task', arguments: { project: rid, id, baseHash: (await read()).hash, kind: 'proposal', endCondition: ['다시'] } })
    expect(textOf(notWorking)).toContain('409')
    const t0 = await read()
    expect((await app.inject({ method: 'POST', url: `${R}/tasks/${id}/judge`, payload: { verdict: 'approve', baseHash: t0.hash } })).statusCode).toBe(200)
    expect(textOf(await c.callTool({ name: 'report_task', arguments: {
      project: rid, id, baseHash: (await read()).hash, kind: 'result', conclusion: '식 3은 식 2와 같다: 부호, 계수 모두.', endCheck: 'pass',
      summary: '두 식이 같다.', evidence: '전개해 비교했다.', ask: ['노트에 반영할까요?', { q: '어디에?', options: ['결론 절', '부록'] }],
      issues: [{ text: 'L=48: 아직', impact: '결론과 따로' }], outputs: ['data/a.csv'], checkMachine: 'pytest 3 passed',
    } }))).toContain('result')
    const t1 = await read()
    expect(t1).toMatchObject({ state: 'result', conclusion: '식 3은 식 2와 같다: 부호, 계수 모두.', asks: [{ q: '노트에 반영할까요?', options: [] }, { q: '어디에?', options: ['결론 절', '부록'] }], issues: [{ text: 'L=48: 아직', impact: '결론과 따로' }] })
    expect(t1.body).toMatch(/## 요약과 결론\n\n두 식이 같다\.\n\n## 근거\n\n전개해 비교했다\.\n/)
    expect((await app.inject({ method: 'GET', url: `${R}/tasks` })).json().diagnostics).toEqual([])
  })

  it('add_journal은 오늘 일지에 메모 한 줄을 더한다', async () => {
    const full = (async (input: string | URL, init?: RequestInit) => {
      const u = new URL(String(input))
      const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'POST', url: u.pathname + u.search, ...(init?.body && { payload: JSON.parse(String(init.body)) }) })
      return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    expect(textOf(await (await connect(full)).callTool({ name: 'add_journal', arguments: { project: 'sample-research', text: 'MCP로 남긴 일지' } }))).toContain('Added to the journal')
    const entries = (await app.inject({ method: 'GET', url: `${R}/journal?days=1` })).json().entries as { kind: string; text: string }[]
    expect(entries.some((e) => e.kind === 'memo' && e.text === 'MCP로 남긴 일지')).toBe(true)
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

  it('앱 서버가 꺼지면 GET·POST 모두 직접 수정의 형식·검사·허락을 알린다', async () => {
    const down = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
    const r = await (await connect(down)).callTool({ name: 'list_projects', arguments: {} })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain('Tell the user')
    expect(textOf(r)).toContain('docs/repo-format.md')
    expect(textOf(r)).toContain('agent:check')
    expect(textOf(r)).toContain('still need permission')
    const post = await (await connect(down)).callTool({ name: 'edit_note', arguments: { project: 'p', file: 'workbench/notes/a/note.md', baseHash: 'h', edits: [{ old: 'a', new: 'b', reason: '오타' }] } })
    expect(post.isError).toBe(true)
    expect(textOf(post)).toBe(textOf(r))
  })
})
