// GET /api: 에이전트가 화면 대신 쓸 경로 안내
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { app, useSampleApp } from './testkit.js'

useSampleApp()

describe('GET /api', () => {
  it('모든 경로와, 실제로 있는 대표 경로를 돌려준다', async () => {
    const res = await app.inject({ method: 'GET', url: '/api' })
    expect(res.statusCode).toBe(200)
    const j = res.json() as { routes: { method: string; url: string }[]; start: { method: string; url: string }[]; writes: string }
    expect(j.routes.length).toBeGreaterThan(100)
    expect(j.routes).toContainEqual({ method: 'GET', url: '/api/researches' })
    expect(j.routes).toContainEqual({ method: 'PUT', url: '/api/concepts/:id' })
    expect(j.routes.some((r) => r.method === 'HEAD')).toBe(false)
    const has = new Set(j.routes.map((r) => `${r.method} ${r.url}`))
    for (const s of j.start) expect(has, `${s.method} ${s.url}`).toContain(`${s.method} ${s.url}`)
    expect(j.writes).toContain('baseHash')
  })
  it('API 안내와 MCP 도구는 블록 노트라는 같은 이름을 쓴다', async () => {
    const j = (await app.inject('/api')).json()
    const summary = j.start.find((r: { method: string; url: string }) => r.method === 'GET' && r.url === '/api/researches/:rid')
    expect(summary.does).toContain('블록 노트')
    expect(JSON.stringify(j.start)).not.toContain('보조 노트')
    const source = fs.readFileSync(new URL('./routes/apiIndex.ts', import.meta.url), 'utf8')
    expect(source).toContain('block notes')
    expect(source).not.toContain('보조 노트')
    const mcp = fs.readFileSync(new URL('./mcp.ts', import.meta.url), 'utf8')
    expect(mcp).toContain('block notes')
    expect(mcp).not.toContain('short note')
  })

  it('한·영 MCP 문서의 절·표가 같은 도구를 같은 순서로 안내한다', () => {
    const en = fs.readFileSync(new URL('../../../docs/agent-mcp.md', import.meta.url), 'utf8')
    const ko = fs.readFileSync(new URL('../../../docs/agent-mcp.ko.md', import.meta.url), 'utf8')
    const tools = (s: string) => s.split('\n').filter((l) => l.startsWith('| `')).map((l) => l.split('|')[1])
    expect(tools(ko)).toEqual(tools(en))
    expect(en.match(/^## /gm)).toHaveLength(ko.match(/^## /gm)!.length)
    expect(en).toContain('The MCP tools do not open files directly')
    expect(ko).toContain('MCP 도구는 파일을 직접 열지 않고')
    for (const s of [en, ko]) {
      expect(s).toContain('list_edit_reviews')
      expect(s).toContain('agent:check')
      expect(s).toContain('docs/repo-format.md')
    }
  })

})
