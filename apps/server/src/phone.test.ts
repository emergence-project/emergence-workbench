// 폰에서 보기: Tailscale이 전해 준 요청만 받는지, serve 상태 읽기
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { enableUrlOf, phoneRequestOk, samplePhone, servesApp } from './phone.js'

describe('폰에서 보기', () => {
  it('ts.net 이름은 이 맥의 계정이 보낸 것만 받는다', () => {
    const me = { host: 'mac.tail1.ts.net', login: 'me@example.com' }
    expect(phoneRequestOk('127.0.0.1:5174', undefined, me)).toBe(null)
    expect(phoneRequestOk('mac.tail1.ts.net', 'me@example.com', me)).toBe(true)
    expect(phoneRequestOk('MAC.tail1.ts.net:443', 'Me@Example.com', me)).toBe(true)
    expect(phoneRequestOk('mac.tail1.ts.net', undefined, me)).toBe(false)
    expect(phoneRequestOk('mac.tail1.ts.net', 'other@example.com', me)).toBe(false)
    expect(phoneRequestOk('mac.tail1.ts.net', 'me@example.com', { host: null, login: null })).toBe(null)
  })

  it('serve 상태에서 이 앱으로 가는지와 허락 주소를 읽는다', () => {
    const serve = { Web: { 'mac.tail1.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:5174' } } } } }
    expect(servesApp(serve, 'mac.tail1.ts.net', 5174)).toBe(true)
    expect(servesApp(serve, 'mac.tail1.ts.net', 8130)).toBe(false)
    expect(servesApp({}, 'mac.tail1.ts.net', 5174)).toBe(false)
    expect(enableUrlOf('Serve is not enabled on your tailnet.\nTo enable, visit:\n\n  https://login.tailscale.com/f/serve?node=abc\n')).toBe('https://login.tailscale.com/f/serve?node=abc')
    expect(enableUrlOf('other error')).toBe(null)
  })

  describe('서버', () => {
    let tmp: string
    let app: ReturnType<typeof buildApp>
    beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-phone-')); app = buildApp({ configDir: path.join(tmp, 'config'), phone: samplePhone() }) })
    afterAll(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })
    const host = 'example-mac.tail0000.ts.net'

    it('켜기 전에는 ts.net 이름을 받지 않고, 켜면 이 맥의 계정에서 온 것만 받는다', async () => {
      const viaTs = (login?: string) => app.inject({ method: 'GET', url: '/api/researches', headers: { host, origin: `https://${host}`, ...(login && { 'tailscale-user-login': login }) } })
      expect((await viaTs('me@example.com')).statusCode).toBe(403)
      const on = await app.inject({ method: 'POST', url: '/api/phone/on' })
      expect(on.statusCode).toBe(200)
      expect(on.json()).toMatchObject({ on: true, url: `https://${host}` })
      expect((await viaTs('me@example.com')).statusCode).toBe(200)
      expect((await viaTs()).statusCode).toBe(403)
      expect((await viaTs('someone@example.com')).statusCode).toBe(403)
      expect((await app.inject({ method: 'POST', url: '/api/phone/off' })).json()).toMatchObject({ on: false, url: null })
      expect((await viaTs('me@example.com')).statusCode).toBe(403)
    })
  })
})
