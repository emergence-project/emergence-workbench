import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { isUnreachable, unreachableMessage } from './netError.js'

describe('바깥 서버에 닿지 못한 오류', () => {
  it('Node fetch의 "fetch failed"만 고른다', () => {
    expect(isUnreachable(new TypeError('fetch failed'))).toBe(true)
    expect(isUnreachable(new TypeError('x is not a function'))).toBe(false)
    expect(isUnreachable(new Error('fetch failed'))).toBe(false)
  })

  it('어디에 닿지 못했는지 알면 그 이름을 넣는다', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND', hostname: 'export.arxiv.org' } })
    expect(unreachableMessage(err)).toContain('export.arxiv.org에 연결하지 못했습니다')
    expect(unreachableMessage(new TypeError('fetch failed'))).toContain('바깥 서버에 연결하지 못했습니다')
  })

  it('실제 fetch 실패에서도 읽을 수 있는 말이 나온다', async () => {
    const app = Fastify(); await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as { port: number }
    await app.close()
    const err = await fetch(`http://127.0.0.1:${port}/`).catch((e: unknown) => e)
    expect(isUnreachable(err)).toBe(true)
    expect(unreachableMessage(err)).toContain('연결하지 못했습니다')
  })
})
