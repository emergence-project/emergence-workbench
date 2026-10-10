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
    app.get('/x', replies(Reply), async () => body)
    app.get('/free', async () => ({ anything: true }))
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

  it('요청 몸이 틀리면 어느 칸인지 적은 400', () => {
    expect(parseBody(z.object({ a: z.string() }), { a: 'ok' })).toEqual({ a: 'ok' })
    try { parseBody(z.object({ a: z.string() }), { a: 1 }); expect.unreachable() } catch (e) {
      expect(e).toBeInstanceOf(WorkbenchError)
      expect((e as WorkbenchError).status).toBe(400)
      expect((e as Error).message).toContain('a:')
    }
  })
})
