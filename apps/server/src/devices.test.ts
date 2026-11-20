// 서버 › 기기 (11/20 시안 1단계): 컴퓨터마다 개인 저장소에 올리는 기기 정보와 그 목록
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { machineName } from './backup.js'
import { devicePath, otherDevices, writeDevice, type DeviceRecord } from './devices.js'
import { DeviceHub, LIVE_MS, SERVER_FILE, mergeDevices, readServerConfig, writeServerConfig } from './deviceServer.js'
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
    expect(hub.beat(rec('laptop', ''), t0)).toEqual({ logout: false })
    hub.requestLogout('laptop')
    expect(hub.live(t0 + 1000)[0]).toMatchObject({ name: 'laptop', online: true, live: true, logout: true })
    expect(hub.beat(rec('laptop', ''), t0 + 60_000)).toEqual({ logout: true })
    expect(hub.beat(rec('laptop', ''), t0 + 120_000)).toEqual({ logout: false })
    expect(hub.live(t0 + 120_000 + LIVE_MS)[0]!.online).toBe(false)
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
