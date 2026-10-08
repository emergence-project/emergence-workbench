// 로컬 서버가 맥 밖의 웹 페이지가 보낸 요청을 거절하는지
import { describe, expect, it } from 'vitest'
import { allowedRequest, extraHosts, fileResponseHeaders } from './hostGuard.js'
import { app, R, useSampleApp } from './testkit.js'

useSampleApp()

describe('요청 출처', () => {
  it('맥 안의 주소만 받고, 다른 사이트에서 온 요청과 DNS로 돌린 주소는 거절한다', () => {
    expect(allowedRequest({ host: '127.0.0.1:8130' })).toBe(true)
    expect(allowedRequest({ host: 'localhost:5173', origin: 'http://localhost:5173' })).toBe(true)
    expect(allowedRequest({ host: '[::1]:8130', origin: 'http://[::1]:8130' })).toBe(true)
    expect(allowedRequest({ host: '127.0.0.1:8130', origin: 'https://evil.example' })).toBe(false)
    expect(allowedRequest({ host: '127.0.0.1:8130', origin: 'null' })).toBe(false)
    expect(allowedRequest({ host: 'evil.example:8130' })).toBe(false)
    expect(allowedRequest({})).toBe(false)
    expect(allowedRequest({ host: 'mac.tail-net.ts.net:8130' }, extraHosts(' Mac.tail-net.ts.net , '))).toBe(true)
    // 다른 사이트의 <img>·no-cors 요청은 Origin이 없어도 막고, 링크로 여는 것은 받는다
    expect(allowedRequest({ host: '127.0.0.1:5174', site: 'cross-site', mode: 'no-cors' })).toBe(false)
    expect(allowedRequest({ host: '127.0.0.1:5174', site: 'cross-site', mode: 'navigate' })).toBe(true)
    expect(allowedRequest({ host: '127.0.0.1:5174', site: 'same-origin', mode: 'cors' })).toBe(true)
    // 같은 컴퓨터의 다른 포트에서 연 페이지는 다른 출처다
    expect(allowedRequest({ host: '127.0.0.1:8130', origin: 'http://127.0.0.1:8888' })).toBe(false)
    expect(allowedRequest({ host: 'localhost:8130', origin: 'http://localhost:3000', site: 'same-site', mode: 'cors' })).toBe(false)
    expect(allowedRequest({ host: '127.0.0.1:8130', site: 'same-site', mode: 'no-cors' })).toBe(false)
    expect(allowedRequest({ host: '127.0.0.1:8130', origin: 'http://localhost:8130' })).toBe(false)
    expect(allowedRequest({ host: 'mac.tail-net.ts.net:8130', origin: 'http://mac.tail-net.ts.net:8130' }, ['mac.tail-net.ts.net'])).toBe(true)
  })

  it('다른 사이트의 POST와 바꾼 Host는 403, 같은 화면의 요청은 그대로', async () => {
    expect((await app.inject({ method: 'GET', url: R })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: R, headers: { origin: 'http://localhost' } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/api/backup', headers: { origin: 'https://evil.example' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: R, headers: { host: 'rebind.evil.example:8130' } })).statusCode).toBe(403)
  })

  it('API 파일 응답: SVG·HTML은 스크립트를 막고, 모두 nosniff', () => {
    expect(fileResponseHeaders('image/svg+xml')).toEqual({ 'x-content-type-options': 'nosniff', 'content-security-policy': "script-src 'none'" })
    expect(fileResponseHeaders('text/html; charset=utf-8')['content-security-policy']).toBe("script-src 'none'")
    expect(fileResponseHeaders('application/pdf')).toEqual({ 'x-content-type-options': 'nosniff' })
    expect(fileResponseHeaders(undefined)).toEqual({ 'x-content-type-options': 'nosniff' })
  })

  it('API 응답에 nosniff가 붙는다', async () => {
    const res = await app.inject({ method: 'GET', url: R })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})

