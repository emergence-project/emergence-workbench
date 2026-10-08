// GET /api: 에이전트가 화면 대신 쓸 경로 안내
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
})
