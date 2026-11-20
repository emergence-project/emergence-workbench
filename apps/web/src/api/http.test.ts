import { describe, expect, it } from 'vitest'
import { ConflictError, json } from './http'

const reply = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } })

describe('json', () => {
  it('returns the parsed body of a successful answer', async () => {
    expect(await json<{ a: number }>(reply('{"a":1}'))).toEqual({ a: 1 })
    expect(await json<null>(reply('null'))).toBe(null)
  })
  it('throws instead of returning an empty object when a successful answer cannot be read', async () => {
    await expect(json(reply('{"repo":{"sta'))).rejects.toThrow(/did not arrive|받지 못했습니다/)
    await expect(json(reply(''))).rejects.toThrow()
  })
  it('throws the server reason on a failed answer, with or without a body', async () => {
    await expect(json(reply('{"error":"nope"}', 400))).rejects.toThrow('nope')
    await expect(json(reply('', 502))).rejects.toThrow(/502/)
  })
  it('throws a conflict with the current hash on 409', async () => {
    await expect(json(reply('{"currentHash":"h1"}', 409))).rejects.toBeInstanceOf(ConflictError)
  })
})
