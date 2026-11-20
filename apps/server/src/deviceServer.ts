// 서버 › 기기 2단계 (11/20 사용자 "맥스튜디오를 서버로"): 한 컴퓨터를 서버로 정하면 다른 컴퓨터가 Tailscale 주소로 1분마다 기기 정보를 알리고,
// 서버는 그것으로 기기 목록을 실시간으로 보이며 로그아웃을 걸어 둔다. 서버가 어느 컴퓨터인지는 개인 저장소의 _settings/server.yaml (옮길 수 있게 설정 값)
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { Device, DeviceRecord } from '@rw/core/contract/devices'

export interface ServerConfig { machine: string; label?: string; url: string; secret: string; at: string }
export const SERVER_FILE = '_settings/server.yaml'
/** 서버에 알리는 간격과, 켜진 것으로 보는 시간 */
export const BEAT_MS = 60_000
export const LIVE_MS = 3 * 60_000

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
function readOne(dir: string): ServerConfig | null {
  let v: unknown
  try { v = YAML.parse(fs.readFileSync(path.join(dir, SERVER_FILE), 'utf8')) } catch { return null }
  if (!v || typeof v !== 'object') return null
  const o = Object.fromEntries(Object.entries(v))
  const machine = str(o.machine), url = str(o.url), secret = str(o.secret), at = str(o.at), label = str(o.label)
  if (!machine || !url || !/^https:\/\//.test(url) || !secret || !at) return null
  return { machine, url: url.replace(/\/$/, ''), secret, at, ...(label && { label }) }
}
/** 받아 둔 개인 저장소 사본들 중 가장 늦게 정한 서버 */
export function readServerConfig(dirs: (string | undefined)[]): ServerConfig | null {
  return dirs.flatMap((d) => (d ? [readOne(d)] : [])).filter((c): c is ServerConfig => !!c).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
}
export function writeServerConfig(dir: string, c: Omit<ServerConfig, 'secret' | 'at'>, now = new Date()): ServerConfig {
  const cfg: ServerConfig = { ...c, secret: randomBytes(24).toString('hex'), at: now.toISOString() }
  const file = path.join(dir, SERVER_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `# 서버 컴퓨터 (설정 › 서버). 다른 컴퓨터가 이 주소로 기기 정보를 알린다. 열쇠는 이 비공개 저장소에만\n${YAML.stringify(cfg)}`)
  return cfg
}

/** 서버 쪽: 다른 컴퓨터가 알린 기기와 걸어 둔 로그아웃 */
export class DeviceHub {
  private beats = new Map<string, { rec: DeviceRecord; at: number }>()
  private logouts = new Set<string>()
  beat(rec: DeviceRecord, now = Date.now()): { logout: boolean } {
    this.beats.set(rec.name, { rec: { ...rec, seen: new Date(now).toISOString() }, at: now })
    const logout = this.logouts.delete(rec.name)
    return { logout }
  }
  requestLogout(name: string): void { this.logouts.add(name) }
  pending(name: string): boolean { return this.logouts.has(name) }
  /** 서버가 본 기기들 (켜짐: 3분 안에 알림) */
  live(now = Date.now()): Device[] {
    return [...this.beats.values()].map(({ rec, at }) => ({ ...rec, this: false, online: now - at < LIVE_MS, live: true, ...(this.logouts.has(rec.name) && { logout: true }) }))
  }
}

/**
 * 기기 목록을 합친다: 이 컴퓨터 + (서버가 본 기기 | 개인 저장소의 마지막 값). 서버가 본 것이 앞선다.
 * 이 컴퓨터는 맨 위, 나머지는 켜진 것 · 최근 것부터
 */
export function mergeDevices(me: Device, seen: Device[], repo: Device[], server: string | null, pending: (name: string) => boolean = () => false): Device[] {
  const by = new Map<string, Device>()
  for (const d of repo) by.set(d.name, d)
  for (const d of seen) if (d.name !== me.name) by.set(d.name, { ...d, this: false })
  const rest = [...by.values()].filter((d) => d.name !== me.name)
    .map((d) => ({ ...d, ...(d.name === server && { server: true }), ...(pending(d.name) && { logout: true }) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || Date.parse(b.seen) - Date.parse(a.seen))
  return [{ ...me, ...(me.name === server && { server: true }) }, ...rest]
}
