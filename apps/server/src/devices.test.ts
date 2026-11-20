// 서버 › 기기 (11/20 시안 1단계): 컴퓨터마다 개인 저장소에 올리는 기기 정보와 그 목록
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { devicePath, otherDevices, writeDevice, type DeviceRecord } from './devices.js'

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
