import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { BRIEF_MAX } from '@rw/core'
import { createMcpServer } from './mcp.js'
import { app, R, useSampleApp } from './testkit.js'

useSampleApp()

/** 실제 서버 대신 테스트 앱에: MCP가 붙인 머리(x-rw-agent)도 그대로 넘긴다 */
const inject = (async (input: string | URL, init?: RequestInit) => {
  const u = new URL(String(input))
  const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).filter(([k]) => k.startsWith('x-rw-')))
  const res = await app.inject({ method: init?.method === 'POST' ? 'POST' : init?.method === 'PATCH' ? 'PATCH' : 'GET', url: u.pathname + u.search, headers, ...(init?.body && { payload: JSON.parse(String(init.body)) }) })
  return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

async function connect(name: string): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createMcpServer({ baseUrl: 'http://127.0.0.1:1', fetch: inject, account: '' }).connect(a)
  const client = new Client({ name, version: '0' })
  await client.connect(b)
  return client
}
type Result = Awaited<ReturnType<Client['callTool']>>
const textOf = (r: Result) => (r.content as { type: string; text: string }[])[0]!.text
const rid = R.split('/').pop()!
const P = `${R}/problems`
const user = async (method: 'POST' | 'PATCH', url: string, payload: object) => { const r = await app.inject({ method, url, payload }); expect(r.statusCode, r.body).toBe(200); return r.json().problem }

describe('MCP: 흐름 (질문 › 주장 › 시도)', () => {
  it('에이전트는 제안만 하고, 사용자가 연 흐름에서 주장 → 후보 → 시작 → 보고, 판정은 다른 에이전트가 한다', async () => {
    const claude = await connect('claude-code')
    const codex = await connect('codex-mcp-client')
    const tool = (c: Client, name: string, args: object) => c.callTool({ name, arguments: { project: rid, ...args } })

    // 제안: 사용자가 메시지를 쓰고 시작하기 전에는 일하지 못한다
    const proposed = textOf(await tool(claude, 'problem_propose', { question: 'Is the magnon gap closed by the DM term?', source: 'workbench/notes/x/note.md §2' }))
    expect(proposed).toContain('Proposed flow is-the-magnon-gap-closed-by-the-dm-term')
    const id = 'is-the-magnon-gap-closed-by-the-dm-term'
    const early = await tool(claude, 'attempt_add', { problem: id, attempts: [{ method: 'LSWT on 24x24' }] })
    expect(early.isError).toBe(true)
    expect(textOf(await tool(claude, 'problem_prepare', { problem: id, literature: [{ ref: 'tothLinear2015', fact: 'Gives the gap without the DM term.' }], grading: 'gap < 1e-6 at three mesh sizes' }))).toContain('literature, grading')
    const listed = JSON.parse(textOf(await tool(claude, 'problems', {}))).problems.find((x: { id: string }) => x.id === id)
    expect(listed).toMatchObject({ state: 'proposed', by: 'claude-code' })

    // 사용자: 메시지와 독자를 쓰고 시작
    const p0 = (await app.inject({ url: `${P}/${id}` })).json().problem
    const p1 = await user('PATCH', `${P}/${id}`, { baseHash: p0.hash, set: { if_yes: 'The DM term leaves a Goldstone mode.', if_no: 'The DM term gaps the spectrum.', reader: 'LSWT users', limit: 2 } })
    await user('POST', `${P}/${id}/open`, { baseHash: p1.hash })

    // 주장을 먼저 세우고(점 하나), 그 주장을 겨눈 후보를 늘어놓는다. 질문 바로 아래의 주장에는 받치는 쪽이 있어야 한다
    expect((await tool(claude, 'claim_add', { problem: id, statement: 'The lowest band stays at zero at Gamma with the DM term.' })).isError).toBe(true)
    expect(textOf(await tool(claude, 'claim_add', { problem: id, statement: 'The lowest band stays at zero at Gamma with the DM term.', condition: 'D = 0.1, meshes 24 to 48', side: 'for_yes' }))).toMatch(/^Added claim 1\. /)
    expect(textOf(await tool(claude, 'attempt_add', { problem: id, attempts: [{ method: 'LSWT on 24x24', claim: '1' }, { method: 'Symmetry argument', claim: '1' }, { method: 'ED on 12 sites' }] }))).toMatch(/^Added A, B, C\. Attempts 0\/2\. Next: A \(a\) LSWT on 24x24\.$/)
    expect(textOf(await tool(claude, 'attempt_start', { problem: id }))).toContain('Started A: LSWT on 24x24.')
    // 진술 없이 보고하면 겨눈 주장을 그대로 받친다
    expect(textOf(await tool(claude, 'attempt_report', { problem: id, attempt: 'A', did: 'Ran solve_lswt at D = 0.1.', result: 'Lowest band 3e-9 at Gamma on 24, 36, 48.', files: ['code/dm.py'] }))).toContain('Awaiting verdict: A (by claude-code).')
    // 작업한 쪽은 판정하지 못한다
    const self = await tool(claude, 'attempt_verdict', { problem: id, attempt: 'a', result: 'holds', note: 'looks right', check: 'L = 60' })
    expect(self.isError).toBe(true)
    expect(textOf(self)).toContain('403')
    expect(textOf(await tool(codex, 'attempt_verdict', { problem: id, attempt: 'a', result: 'holds', note: 'Reran code/dm.py.', check: 'D = 0.3 and a 60x60 mesh: 4e-9' }))).toContain('Verdict on A: holds.')

    // 한도(2)에서 멈춘다: 방향 보고를 내고 선다
    await tool(codex, 'attempt_start', { problem: id })
    const stopped = await tool(claude, 'attempt_start', { problem: id })
    expect(stopped.isError).toBe(true)
    expect(textOf(stopped)).toContain('direction_report')
    expect(textOf(await tool(claude, 'direction_report', { problem: id, for_yes: 'A holds: the lowest band stays at zero for D up to 0.3.' }))).toContain('waiting for the user')

    const brief = textOf(await tool(codex, 'problem_brief', { problem: id }))
    expect(brief).toContain('예이면: The DM term leaves a Goldstone mode.')
    expect(brief).toContain('멈춤')
    expect(Buffer.byteLength(brief, 'utf8')).toBeLessThanOrEqual(BRIEF_MAX)
    expect(brief).toContain('- 1 [성립 · 예 근거] The lowest band stays at zero at Gamma with the DM term. (조건: D = 0.1, meshes 24 to 48) ← A 성립, B 진행')
    expect(JSON.parse(textOf(await tool(codex, 'problem_read', { problem: id, attempt: 'a' })))).toMatchObject({ state: 'holds', claim: '1', worker: 'claude-code', verdict: { by: 'codex' } })
    // 주장 하나만 읽으면 그 주장과 근거(겨눈 시도, 아래 주장)가 온다
    expect(JSON.parse(textOf(await tool(codex, 'problem_read', { problem: id, claim: '1' })))).toMatchObject({ claim: { id: '1', state: 'holds', side: 'for_yes' }, attempts: [{ id: 'a' }, { id: 'b' }], under: [] })
    expect(textOf(await tool(codex, 'problem_read', { problem: id, claim: '7' }))).toContain('No claim 7')
    // 예외 기록: 앱이 거절한 것(시작 전 흐름에 후보, 자기 시도 판정)은 이미 적혀 있고, 에이전트가 한 줄을 더한다
    expect(textOf(await tool(claude, 'problem_exception', { kind: 'needs-user', what: 'The limit stopped the run before the cheapest check.', instead: 'Filed the direction report.', problem: id }))).toContain('Recorded exception')
    const listed2 = JSON.parse(textOf(await tool(codex, 'problem_exceptions', { problem: id }))).exceptions
    expect(listed2.map((e: { kind: string; rule?: string }) => e.rule ?? e.kind).sort()).toEqual(['needs-user', 'not-open', 'self-verdict'])
    expect(listed2.find((e: { rule?: string }) => e.rule === 'self-verdict')).toMatchObject({ kind: 'refused', by: 'claude-code', attempt: 'a' })
    // 상태 요약에도 실린다
    const status = textOf(await tool(claude, 'project_status', {}))
    expect(status).toContain('## 흐름')
    expect(status).toContain(`\`${id}\``)
  })
})
