import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { hasKey, keyCookie, openTarget, readServerInfo, serverTarget, writeServerInfo } from './appKey.js'

const KEY = 'a'.repeat(48)
const PORT = 51234

describe('설치 파일로 깐 앱의 서버 열쇠', () => {
  it('머리나 이 포트의 쿠키에 같은 열쇠가 있어야 한다', () => {
    expect(hasKey({ 'x-rw-key': KEY }, KEY, PORT)).toBe(true)
    expect(hasKey({ cookie: `x=1; ${keyCookie(PORT)}=${KEY}` }, KEY, PORT)).toBe(true)
    expect(hasKey({ cookie: `${keyCookie(PORT + 1)}=${KEY}` }, KEY, PORT)).toBe(false)
    expect(hasKey({ 'x-rw-key': 'b'.repeat(48) }, KEY, PORT)).toBe(false)
    expect(hasKey({}, KEY, PORT)).toBe(false)
  })

  it('/__open은 이 서버 안의 경로로만 넘긴다', () => {
    expect(openTarget('/#/r/x')).toBe('/#/r/x')
    expect(openTarget('//evil.example')).toBe('/')
    expect(openTarget('/\\evil.example')).toBe('/')
    expect(openTarget('https://evil.example')).toBe('/')
    expect(openTarget(undefined)).toBe('/')
  })

  it('열쇠 없는 요청은 401, /__open으로 받은 쿠키로는 열린다', async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-key-'))
    const app = buildApp({ configDir, key: KEY, port: PORT })
    try {
      expect((await app.inject({ method: 'GET', url: '/api' })).statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', url: `/__open?k=${'b'.repeat(48)}` })).statusCode).toBe(401)
      const open = await app.inject({ method: 'GET', url: `/__open?k=${KEY}&to=${encodeURIComponent('/#/settings')}` })
      expect(open.statusCode).toBe(303)
      expect(open.headers.location).toBe('/#/settings')
      const cookie = String(open.headers['set-cookie']).split(';')[0]!
      expect(cookie).toBe(`${keyCookie(PORT)}=${KEY}`)
      expect(String(open.headers['set-cookie'])).toContain('HttpOnly')
      expect((await app.inject({ method: 'GET', url: '/api', headers: { cookie } })).statusCode).toBe(200)
      expect((await app.inject({ method: 'GET', url: '/api', headers: { 'x-rw-key': KEY } })).statusCode).toBe(200)
      // 다른 사이트에서 온 요청은 열쇠가 있어도 hostGuard가 막는다
      expect((await app.inject({ method: 'GET', url: '/api', headers: { cookie, origin: 'https://evil.example' } })).statusCode).toBe(403)
    } finally { await app.close(); fs.rmSync(configDir, { recursive: true, force: true }) }
  })

  it('열쇠가 없으면(맥 서비스 · 예제 모드) 예전대로 받는다', async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-key-'))
    const app = buildApp({ configDir })
    try {
      expect((await app.inject({ method: 'GET', url: '/api' })).statusCode).toBe(200)
    } finally { await app.close(); fs.rmSync(configDir, { recursive: true, force: true }) }
  })

  it('MCP 입구는 환경 변수 → server.json → 5174 차례로 서버를 찾는다', () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-key-'))
    try {
      expect(serverTarget({}, configDir)).toEqual({ url: 'http://127.0.0.1:5174' })
      writeServerInfo(configDir, { url: 'http://127.0.0.1:50999', key: KEY, pid: 1 })
      expect(readServerInfo(configDir)).toEqual({ url: 'http://127.0.0.1:50999', key: KEY, pid: 1 })
      expect(serverTarget({}, configDir)).toEqual({ url: 'http://127.0.0.1:50999', key: KEY })
      expect(serverTarget({ RW_PORT: '8130' }, configDir)).toEqual({ url: 'http://127.0.0.1:8130' })
      expect(serverTarget({ RW_PORT: '50998', RW_KEY: 'k' }, configDir)).toEqual({ url: 'http://127.0.0.1:50998', key: 'k' })
      if (process.platform !== 'win32') expect(fs.statSync(path.join(configDir, 'server.json')).mode & 0o777).toBe(0o600)
    } finally { fs.rmSync(configDir, { recursive: true, force: true }) }
  })
})
