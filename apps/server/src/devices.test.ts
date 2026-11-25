// 서버 › 기기 (11/20 시안 1단계): 컴퓨터마다 개인 저장소에 올리는 기기 정보와 그 목록
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { machineName } from './backup.js'
import { devicePath, otherDevices, writeDevice, type DeviceRecord } from './devices.js'
import { DeviceHub, LIVE_MS, SERVER_FILE, mergeDevices, readServerConfig, replyFromServer, writeServerConfig } from './deviceServer.js'
import { samplePhone } from './phone.js'

let tmp = ''
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })
const mk = () => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-dev-')))
const rec = (name: string, seen: string, extra: Partial<DeviceRecord> = {}): DeviceRecord => ({ name, seen, version: 'abc1234', os: 'macOS 26.1', accounts: [{ kind: 'github', name: 'researcher' }, { kind: 'claude', plan: 'Max' }], ...extra })

describe('기기 정보', () => {
  it('시각만 바뀌었으면 50분이 지나야 다시 쓰고, 계정이 바뀌면 바로 쓴다', () => {
    const dir = mk()
    const t0 = new Date('2026-11-20T10:00:00Z')
    expect(writeDevice(dir, rec('studio', t0.toISOString()), t0)).toBe(true)
    const t1 = new Date('2026-11-20T10:30:00Z')
    expect(writeDevice(dir, rec('studio', t1.toISOString()), t1)).toBe(false)
    expect(writeDevice(dir, rec('studio', t1.toISOString(), { accounts: [] }), t1)).toBe(true)
    const t2 = new Date('2026-11-20T11:30:00Z')
    expect(writeDevice(dir, rec('studio', t2.toISOString(), { accounts: [] }), t2)).toBe(true)
    expect(fs.readFileSync(path.join(dir, devicePath('studio')), 'utf8')).toContain('2026-11-20T11:30:00')
  })

  it('다른 컴퓨터들의 기기: 나는 빼고, 최근 것부터, 2시간 안이면 켜짐, 깨진 파일은 건너뛴다', () => {
    const dir = mk()
    const now = new Date('2026-11-20T12:00:00Z')
    writeDevice(dir, rec('studio', '2026-11-20T11:50:00Z'))
    writeDevice(dir, rec('laptop', '2026-11-20T11:40:00Z'))
    writeDevice(dir, rec('mini', '2026-11-19T20:00:00Z', { accounts: [{ kind: 'codex', plan: 'Plus' }] }))
    fs.mkdirSync(path.join(dir, '_settings', 'broken'), { recursive: true })
    fs.writeFileSync(path.join(dir, '_settings', 'broken', 'device.yaml'), 'seen: 어제\n')
    const list = otherDevices(dir, 'studio', now)
    expect(list.map((d) => [d.name, d.online])).toEqual([['laptop', true], ['mini', false]])
    expect(list[1]!.accounts).toEqual([{ kind: 'codex', plan: 'Plus' }])
  })

  it('API: 이 컴퓨터가 맨 위, 예제 모드는 지어낸 기기', async () => {
    const dir = mk()
    const real = buildApp({ configDir: path.join(dir, 'config') })
    const r = (await real.inject({ method: 'GET', url: '/api/devices' })).json()
    expect(r.shared).toBe(false)
    expect(r.devices).toHaveLength(1)
    expect(r.devices[0]).toMatchObject({ this: true, online: true })
    await real.close()
    const sb = buildApp({ configDir: path.join(dir, 'config2'), sandbox: true })
    const s = (await sb.inject({ method: 'GET', url: '/api/devices' })).json()
    expect(s.devices.map((d: { this: boolean }) => d.this)).toEqual([true, false, false])
    await sb.close()
  })
})

describe('서버 (2단계)', () => {
  it('server.yaml: 사본 둘 중 늦게 정한 것, 주소가 https가 아니면 버린다', () => {
    const a = mk(), b = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-dev-b-'))
    try {
      writeServerConfig(a, { machine: 'studio', url: 'https://studio.example.ts.net/' }, new Date('2026-11-20T10:00:00Z'))
      writeServerConfig(b, { machine: 'mini', url: 'https://mini.example.ts.net' }, new Date('2026-11-20T11:00:00Z'))
      expect(readServerConfig([a, b])).toMatchObject({ machine: 'mini', url: 'https://mini.example.ts.net' })
      expect(readServerConfig([a])?.url).toBe('https://studio.example.ts.net')
      fs.writeFileSync(path.join(b, SERVER_FILE), 'machine: x\nurl: http://x\nsecret: s\nat: "2026-11-21"\n')
      expect(readServerConfig([a, b])?.machine).toBe('studio')
    } finally { fs.rmSync(b, { recursive: true, force: true }) }
  })

  it('허브: 3분 안에 알린 기기만 켜짐, 걸어 둔 로그아웃은 다음 알림에 한 번 전한다', () => {
    const hub = new DeviceHub()
    const t0 = Date.parse('2026-11-20T10:00:00Z')
    expect(hub.beat(rec('laptop', ''), t0)).toMatchObject({ logout: false })
    hub.requestLogout('laptop')
    expect(hub.live(t0 + 1000)[0]).toMatchObject({ name: 'laptop', online: true, live: true, logout: true })
    expect(hub.beat(rec('laptop', ''), t0 + 60_000)).toMatchObject({ logout: true })
    expect(hub.beat(rec('laptop', ''), t0 + 120_000)).toMatchObject({ logout: false })
    expect(hub.live(t0 + 120_000 + LIVE_MS)[0]!.online).toBe(false)
  })

  it('피드백 돕기: 자리가 남은 맥에 맡기면 다음 알림 답으로 가고, 늦으면 돌려받아 그 맥에 멈추라고 보낸다', () => {
    const hub = new DeviceHub()
    const t0 = Date.parse('2026-11-23T10:00:00Z')
    const help = (busy: number, keys: string[] = []) => ({ ...rec('laptop', ''), helper: { slots: 2, busy, keys } })
    expect(hub.free(t0)).toBeUndefined()
    hub.beat(help(0), t0)
    expect(hub.live(t0)[0]!.helper).toEqual({ slots: 2, busy: 0 })
    expect(hub.free(t0)).toBe('laptop')
    hub.assign('laptop', ['a'])
    hub.assign('laptop', ['b'])
    // 자리 둘이 맡긴 것으로 찼다
    expect(hub.free(t0)).toBeUndefined()
    expect(hub.beat(help(0), t0 + 60_000)).toMatchObject({ feedback: ['a', 'b'], drop: [] })
    // 보낸 것이 아직 busy에 없어도 자리는 찬 것으로 본다
    expect(hub.free(t0 + 60_000)).toBeUndefined()
    expect(hub.beat(help(1, ['a', 'b']), t0 + 120_000)).toMatchObject({ feedback: [] })
    expect(hub.lapsed(t0 + 120_000)).toEqual([])
    // 3분 동안 알리지 않으면 맡은 항목을 한 번 돌려주고, 다시 알리면 멈추라고 한다
    expect(hub.lapsed(t0 + 120_000 + LIVE_MS)).toEqual([{ name: 'laptop', keys: ['a', 'b'] }])
    expect(hub.lapsed(t0 + 120_000 + LIVE_MS)).toEqual([])
    expect(hub.free(t0 + 120_000 + LIVE_MS)).toBeUndefined()
    expect(hub.beat(help(1, ['a', 'b']), t0 + 130_000 + LIVE_MS)).toMatchObject({ drop: ['a', 'b'] })
  })

  it('피드백 돕기: 맡긴 뒤 보내기 전에 돕기를 끄면 그 항목을 돌려준다', () => {
    const hub = new DeviceHub()
    const t0 = Date.parse('2026-11-23T10:00:00Z')
    hub.beat({ ...rec('mini', ''), helper: { slots: 1, busy: 0, keys: [] } }, t0)
    hub.assign('mini', ['c'])
    expect(hub.beat(rec('mini', ''), t0 + 60_000)).toMatchObject({ feedback: [] })
    expect(hub.free(t0 + 60_000)).toBeUndefined()
    expect(hub.lapsed(t0 + 60_000)).toEqual([{ name: 'mini', keys: ['c'] }])
  })

  it('목록 합치기: 서버가 본 값이 저장소 값보다 앞서고, 서버 표시가 붙는다', () => {
    const me = { ...rec('laptop', '2026-11-20T10:00:00Z'), this: true, online: true }
    const repo = [{ ...rec('studio', '2026-11-20T08:00:00Z'), this: false, online: false }, { ...rec('mini', '2026-11-19T08:00:00Z'), this: false, online: false }]
    const seen = [{ ...rec('studio', '2026-11-20T09:59:00Z'), this: false, online: true, live: true }]
    const list = mergeDevices(me, seen, repo, 'studio')
    expect(list.map((d) => [d.name, d.online, !!d.server])).toEqual([['laptop', true, false], ['studio', true, true], ['mini', false, false]])
  })

  it('API: 이 컴퓨터를 서버로 정하면 열쇠를 가진 알림만 받고, 로그아웃을 걸어 두었다 전한다', async () => {
    const dir = mk()
    const backup = path.join(dir, 'backup')
    fs.mkdirSync(backup)
    const app = buildApp({ configDir: path.join(dir, 'config'), backup: { dir: backup, remote: null }, phone: samplePhone() })
    const set = (await app.inject({ method: 'POST', url: '/api/devices/server' })).json()
    expect(set.server).toMatchObject({ machine: machineName(), this: true })
    expect(set.devices[0]).toMatchObject({ this: true, server: true })
    const secret = readServerConfig([backup])!.secret
    const beat = (key: string) => app.inject({ method: 'POST', url: '/api/devices/beat', headers: { 'x-rw-device-key': key }, payload: rec('laptop', '2026-11-20T10:00:00Z') })
    expect((await beat('틀린 열쇠')).statusCode).toBe(401)
    expect((await beat(secret)).json()).toMatchObject({ logout: false })
    const list = (await app.inject({ method: 'GET', url: '/api/devices' })).json()
    expect(list.devices.find((d: { name: string }) => d.name === 'laptop')).toMatchObject({ online: true, live: true })
    const asked = (await app.inject({ method: 'POST', url: '/api/devices/laptop/logout' })).json()
    expect(asked.devices.find((d: { name: string }) => d.name === 'laptop').logout).toBe(true)
    expect((await beat(secret)).json().logout).toBe(true)
    await app.close()
  })

  // 컴퓨터마다 앱 버전이 다를 수 있다: 새 버전이 더한 칸 때문에 알림이 통째로 거절되면 그 컴퓨터가 꺼진 것으로 보이고 로그아웃 · 피드백 돕기도 전해지지 않는다
  it('API: 새 버전의 컴퓨터가 모르는 칸을 담아 알려도 받는다 (모르는 칸 · 모르는 계정 종류만 버림)', async () => {
    const dir = mk()
    const backup = path.join(dir, 'backup')
    fs.mkdirSync(backup)
    const app = buildApp({ configDir: path.join(dir, 'config'), backup: { dir: backup, remote: null }, phone: samplePhone() })
    await app.inject({ method: 'POST', url: '/api/devices/server' })
    const secret = readServerConfig([backup])!.secret
    const newer = {
      ...rec('laptop', '2026-11-26T10:00:00Z'), uptime: 3600,
      accounts: [{ kind: 'github', name: 'researcher', scopes: ['repo'] }, { kind: 'gemini', name: 'later' }],
      helper: { slots: 2, busy: 0, keys: [], paused: false },
    }
    const got = await app.inject({ method: 'POST', url: '/api/devices/beat', headers: { 'x-rw-device-key': secret }, payload: newer })
    expect(got.statusCode).toBe(200)
    const laptop = (await app.inject({ method: 'GET', url: '/api/devices' })).json().devices.find((d: { name: string }) => d.name === 'laptop')
    expect(laptop).toMatchObject({ online: true, live: true, helper: { slots: 2, busy: 0 }, accounts: [{ kind: 'github', name: 'researcher' }] })
    expect(laptop.uptime).toBeUndefined()
    // 아는 칸의 모양이 틀린 것은 전처럼 거절한다
    const bad = await app.inject({ method: 'POST', url: '/api/devices/beat', headers: { 'x-rw-device-key': secret }, payload: { ...rec('laptop', '2026-11-26T10:00:00Z'), name: '' } })
    expect(bad.statusCode).toBe(400)
    await app.close()
  })

  it('새 버전 서버의 답도 읽는다: 모르는 칸은 버리고, 읽지 못하는 기기 줄은 그 줄만 뺀다', () => {
    const dev = (name: string, more: object = {}) => ({ ...rec(name, '2026-11-26T10:00:00Z'), this: false, online: true, live: true, ...more })
    const got = replyFromServer({
      devices: [
        dev('studio', { server: true, load: 0.4, build: { at: '2026-11-26T09:00:00Z', behind: 0, ahead: 2, tag: 'v2' }, helper: { slots: 1, busy: 0, paused: true } }),
        dev('mini', { accounts: [{ kind: 'github', name: 'researcher', scopes: ['repo'] }, { kind: 'gemini', name: 'later' }] }),
        dev('later', { seen: 20261126 }),
      ],
      logout: true, feedback: ['a/1'], drop: [], notice: '새 버전의 알림',
    })
    expect(got).toEqual({
      devices: [
        dev('studio', { server: true, build: { at: '2026-11-26T09:00:00Z', behind: 0, ahead: 2 }, helper: { slots: 1, busy: 0 } }),
        dev('mini', { accounts: [{ kind: 'github', name: 'researcher' }] }),
      ],
      logout: true, feedback: ['a/1'], drop: [],
    })
    // 꼭 있어야 하는 칸이 없거나 틀리면 전처럼 실패한다 (로그아웃할지를 짐작하지 않는다)
    expect(() => replyFromServer({ devices: [], logout: 'yes' })).toThrow()
    expect(() => replyFromServer(null)).toThrow()
  })

  it('API: Tailscale에서 HTTPS를 아직 허락하지 않았으면 허락 주소를 오류 글에 담아 돌려준다', async () => {
    const dir = mk()
    const backup = path.join(dir, 'backup')
    fs.mkdirSync(backup)
    const st = { installed: true, running: true, on: false, host: 'studio.tail0000.ts.net', login: 'me@example.com', url: null }
    const phone = { status: async () => st, on: async () => ({ ...st, enableUrl: 'https://login.tailscale.com/f/serve?node=abc', error: 'Serve is not enabled on your tailnet.' }), off: async () => st }
    const app = buildApp({ configDir: path.join(dir, 'config'), backup: { dir: backup, remote: null }, phone })
    const r = await app.inject({ method: 'POST', url: '/api/devices/server' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toContain('https://login.tailscale.com/f/serve?node=abc')
    expect(readServerConfig([backup])).toBeNull()
    await app.close()
  })

  it('예제 모드: 맥 스튜디오가 서버이고, 로그아웃을 눌러 볼 수 있다', async () => {
    const sb = buildApp({ configDir: path.join(mk(), 'config'), sandbox: true })
    const s = (await sb.inject({ method: 'GET', url: '/api/devices' })).json()
    expect(s.server).toMatchObject({ machine: 'studio', label: 'Mac Studio', this: true })
    const l = (await sb.inject({ method: 'POST', url: '/api/devices/mini/logout' })).json()
    expect(l.devices.find((d: { name: string }) => d.name === 'mini').logout).toBe(true)
    await sb.close()
  })
})
