// 터미널: 이 컴퓨터의 화면에서만 셸을 열고, 폰 · 다른 기기 · 프록시를 거친 요청은 막는다
import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { sameComputer } from './hostGuard.js'
import { folderFor, shellEnv, shellOf, startDir } from './terminal.js'
import { app, repo, useSampleApp } from './testkit.js'

describe('sameComputer', () => {
  const local = { host: '127.0.0.1:5174' }
  it('이 컴퓨터의 주소와 연결만 받는다', () => {
    expect(sameComputer({ headers: local, remoteAddress: '127.0.0.1' })).toBe(true)
    expect(sameComputer({ headers: { host: 'localhost:5173' }, remoteAddress: '::1' })).toBe(true)
    expect(sameComputer({ headers: { host: '[::1]:5174' }, remoteAddress: '::ffff:127.0.0.1' })).toBe(true)
  })
  it('다른 기기의 이름 · 다른 연결 · 프록시 머리는 막는다', () => {
    expect(sameComputer({ headers: { host: 'my-mac.tail1234.ts.net' }, remoteAddress: '127.0.0.1' })).toBe(false)
    expect(sameComputer({ headers: local, remoteAddress: '100.64.0.2' })).toBe(false)
    expect(sameComputer({ headers: { ...local, 'tailscale-user-login': 'me@example.com' }, remoteAddress: '127.0.0.1' })).toBe(false)
    expect(sameComputer({ headers: { ...local, 'x-forwarded-for': '100.64.0.2' }, remoteAddress: '127.0.0.1' })).toBe(false)
    expect(sameComputer({ headers: {}, remoteAddress: '127.0.0.1' })).toBe(false)
  })
})

describe('셸 준비', () => {
  it('앱 서버의 RW_ 환경은 넘기지 않는다', () => {
    const env = shellEnv({ PATH: '/bin', RW_APP_KEY: 'secret' })
    expect(env).toMatchObject({ PATH: '/bin', TERM: 'xterm-256color' })
    expect(env.RW_APP_KEY).toBeUndefined()
  })
  it('맥은 로그인 셸, 윈도는 PowerShell', () => {
    expect(shellOf({}, 'darwin')).toEqual({ file: '/bin/zsh', args: ['-l'] })
    expect(shellOf({ SHELL: '/bin/bash' }, 'linux')).toEqual({ file: '/bin/bash', args: ['-l'] })
    expect(shellOf({}, 'win32').file).toBe('powershell.exe')
  })
  it('없는 폴더면 홈에서 연다', () => {
    expect(startDir('/no/such/folder')).toBe(os.homedir())
    expect(startDir(null)).toBe(os.homedir())
  })
  it('중앙 · 앱 고치기는 앱 저장소, 연구는 그 저장소, 모르면 null(홈)', () => {
    const where = { appRoot: '/app', repoPath: (rid: string) => { if (rid !== 'r1') throw new Error('없음'); return '/repos/r1' } }
    expect(folderFor('_central', where)).toBe('/app')
    expect(folderFor('_app', where)).toBe('/app')
    expect(folderFor('r1', where)).toBe('/repos/r1')
    expect(folderFor('nope', where)).toBeNull()
    expect(folderFor(undefined, where)).toBeNull()
    expect(folderFor('_central', { repoPath: where.repoPath })).toBeNull()
  })
})

describe('터미널 API', () => {
  useSampleApp()
  const host = { host: '127.0.0.1:5174' }

  it('이 컴퓨터의 화면이면 쓸 수 있고, 원격이면 까닭과 함께 끈다', async () => {
    expect((await app.inject({ url: '/api/terminal', headers: host })).json()).toEqual({ available: true })
    const viaTailscale = await app.inject({ url: '/api/terminal', headers: { ...host, 'tailscale-user-login': 'me@example.com' } })
    expect(viaTailscale.json().available).toBe(false)
    const fromPhone = await app.inject({ url: '/api/terminal', headers: host, remoteAddress: '100.64.0.2' })
    expect(fromPhone.json()).toMatchObject({ available: false, reason: expect.any(String) })
  })

  it('원격에서 온 웹소켓은 셸을 열기 전에 403으로 막는다', async () => {
    await expect(app.injectWS('/api/terminal/ws', { headers: { ...host, 'x-forwarded-for': '100.64.0.2' } })).rejects.toThrow(/403/)
  })

  it.skipIf(process.platform === 'win32')('프로젝트 폴더에서 셸을 열고 친 글자를 돌려준다', async () => {
    await app.listen({ host: '127.0.0.1', port: 0 })
    const addr = app.server.address()
    const ws = new WebSocket(`ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/api/terminal/ws?rid=sample-research`)
    const got: { t: string; d?: string; cwd?: string }[] = []
    ws.onmessage = (e) => got.push(JSON.parse(String(e.data)))
    await expect.poll(() => got.find((m) => m.t === 'start')?.cwd, { timeout: 10_000 }).toBe(repo)
    ws.send(JSON.stringify({ t: 'in', d: 'echo rw-term-$((40+2))\r' }))
    await expect.poll(() => got.filter((m) => m.t === 'out').map((m) => m.d).join(''), { timeout: 10_000 }).toContain('rw-term-42')
    ws.close()
  })
})
