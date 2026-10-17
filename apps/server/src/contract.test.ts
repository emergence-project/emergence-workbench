// 계약 검사 도우미: 요청 몸(parseBody)과 테스트에서의 응답 검사(checkReplies)
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checkReplies, parseBody, replies } from './contract.js'
import { WorkbenchError } from './workbench.js'

describe('계약 검사', () => {
  const Reply = z.object({ n: z.number() }).strict()
  const appWith = (body: unknown) => {
    const app = Fastify()
    checkReplies(app, true)
    // 앱(app.ts)처럼 오류는 { error } 몸으로 보낸다
    app.setErrorHandler((err, _req, reply) => reply.status(500).send({ error: (err as Error).message }))
    app.get('/x', replies(Reply), async () => body)
    app.get('/free', async () => ({ anything: true }))
    app.get('/conflict', replies(Reply), async (_req, reply) => reply.status(409).send({ error: '바뀜', currentHash: 'h1' }))
    app.get('/bad-error', replies(Reply), async (_req, reply) => reply.status(404).send({ error: '없음', detail: 'x' }))
    app.get('/free-error', async (_req, reply) => reply.status(404).send({ message: 'free' }))
    return app
  }

  it('응답이 계약과 맞으면 그대로, 모르는 칸이 있으면 어느 칸인지 적어 실패', async () => {
    expect((await appWith({ n: 1 }).inject({ url: '/x' })).json()).toEqual({ n: 1 })
    const bad = await appWith({ n: 1, extra: 2 }).inject({ url: '/x' })
    expect(bad.statusCode).toBe(500)
    expect(bad.body).toContain('GET /x')
    expect(bad.body).toContain('extra')
    expect((await appWith({ n: 'one' }).inject({ url: '/x' })).body).toContain('n:')
    // 계약을 붙이지 않은 라우트는 보지 않는다
    expect((await appWith({ n: 1 }).inject({ url: '/free' })).statusCode).toBe(200)
  })

  it('오류 응답(4xx·5xx)은 공통 오류 계약 { error, currentHash?, key? }으로 본다', async () => {
    const app = appWith({ n: 1 })
    const conflict = await app.inject({ url: '/conflict' })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toEqual({ error: '바뀜', currentHash: 'h1' })
    const bad = await app.inject({ url: '/bad-error' })
    expect(bad.statusCode).toBe(500)
    expect(bad.body).toContain('error 404 reply does not match contract (GET /bad-error)')
    expect(bad.body).toContain('detail')
    // 계약을 붙이지 않은 라우트는 오류도 보지 않는다
    expect((await app.inject({ url: '/free-error' })).statusCode).toBe(404)
  })

  it('요청 몸이 틀리면 어느 칸인지 적은 400', () => {
    expect(parseBody(z.object({ a: z.string() }), { a: 'ok' })).toEqual({ a: 'ok' })
    try { parseBody(z.object({ a: z.string() }), { a: 1 }); expect.unreachable() } catch (e) {
      expect(e).toBeInstanceOf(WorkbenchError)
      expect((e as WorkbenchError).status).toBe(400)
      expect((e as Error).message).toContain('a:')
    }
  })
})
