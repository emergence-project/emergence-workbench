// 서버 › 기기 2단계 (11/20 사용자 "맥스튜디오를 서버로"): 한 컴퓨터를 서버로 정하면 다른 컴퓨터가 Tailscale 주소로 1분마다 기기 정보를 알리고,
// 서버는 그것으로 기기 목록을 실시간으로 보이며 로그아웃을 걸어 둔다. 서버가 어느 컴퓨터인지는 개인 저장소의 _settings/server.yaml (옮길 수 있게 설정 값)
import { randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { Device, DeviceBeat } from '@rw/core/contract/devices'

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

/** 피드백 돕기를 켠 맥 하나 (서버가 본 값). queued = 맡겼고 아직 답으로 보내지 않음, sent = 지난 답으로 보냄 (다음 알림의 busy에 아직 없을 수 있다) */
interface Helper { slots: number; busy: number; keys: string[]; queued: string[]; sent: string[]; at: number }

/**
 * 서버 쪽: 다른 컴퓨터가 알린 기기와 걸어 둔 로그아웃, 그리고 피드백 돕기 (11/23 안 A).
 * 맡길지는 서버 한 곳이 정한다: 서버의 자리가 차면 저절로 맡기기가 켜져 있는 돕는 맥(free)에 맡기고(assign), 그 맥이 다음에 알릴 때 답으로 받아 시작한다.
 * 돕는 맥이 LIVE_MS 동안 알리지 않거나 돕기를 끄면 lapsed가 그 맥의 항목을 돌려준다: 서버가 맡음을 풀고 다시 맡기며, 그 맥이 다시 알리면 drop으로 그 대화를 멈춘다
 */
export class DeviceHub {
  private beats = new Map<string, { rec: Device; at: number }>()
  private logouts = new Set<string>()
  private helpers = new Map<string, Helper>()
  /** 서버가 맡음을 푼 항목: 그 맥이 다시 알리면 멈추라고 보낸다 */
  private drops = new Map<string, Set<string>>()
  /** 돕기를 끈 맥에 맡겼지만 보내지 못한 항목 (다음 lapsed가 돌려준다) */
  private orphans = new Map<string, string[]>()
  beat(beat: DeviceBeat, now = Date.now()): { logout: boolean; feedback: string[]; drop: string[] } {
    const { helper, ...rec } = beat
    const was = this.helpers.get(rec.name)
    let feedback: string[] = []
    if (helper) {
      feedback = was?.queued ?? []
      this.helpers.set(rec.name, { slots: helper.slots, busy: helper.busy, keys: [...helper.keys], queued: [], sent: feedback, at: now })
    } else if (was) {
      this.helpers.delete(rec.name)
      if (was.queued.length) this.orphans.set(rec.name, [...(this.orphans.get(rec.name) ?? []), ...was.queued])
    }
    this.beats.set(rec.name, { rec: { ...rec, seen: new Date(now).toISOString(), this: false, online: true, ...(helper && { helper: { slots: helper.slots, busy: helper.busy } }) }, at: now })
    const logout = this.logouts.delete(rec.name)
    const drop = [...(this.drops.get(rec.name) ?? [])]
    this.drops.delete(rec.name)
    return { logout, feedback, drop }
  }
  requestLogout(name: string): void { this.logouts.add(name) }
  pending(name: string): boolean { return this.logouts.has(name) }
  /** 서버가 본 기기들 (켜짐: 3분 안에 알림) */
  live(now = Date.now()): Device[] {
    return [...this.beats.values()].map(({ rec, at }) => ({ ...rec, this: false, online: now - at < LIVE_MS, live: true, ...(this.logouts.has(rec.name) && { logout: true }) }))
  }
  /** 자리가 남은 돕는 맥 (켜져 있고 가장 많이 남은 것). 없으면 undefined */
  free(now = Date.now()): string | undefined {
    const room = (h: Helper) => h.slots - Math.max(h.busy, h.keys.length) - h.sent.length - h.queued.length
    return [...this.helpers.entries()].filter(([, h]) => now - h.at < LIVE_MS && room(h) > 0).sort(([, a], [, b]) => room(b) - room(a))[0]?.[0]
  }
  /** 돕는 맥에 피드백을 맡긴다 (한 대화에 묶을 항목들). 그 맥의 다음 알림 답으로 간다 */
  assign(name: string, keys: string[]): void { this.helpers.get(name)?.queued.push(...keys) }
  /** 늦은(LIVE_MS 동안 알리지 않은) 돕는 맥과 돕기를 끈 맥의 항목: 서버가 그 맥 이름의 맡음을 풀고 다시 맡긴다. 한 번만 돌려준다 */
  lapsed(now = Date.now()): { name: string; keys: string[] }[] {
    const out: { name: string; keys: string[] }[] = []
    for (const [name, h] of this.helpers) {
      if (now - h.at < LIVE_MS) continue
      this.helpers.delete(name)
      const keys = [...new Set([...h.keys, ...h.sent, ...h.queued])]
      if (!keys.length) continue
      out.push({ name, keys })
      this.drops.set(name, new Set([...(this.drops.get(name) ?? []), ...h.keys, ...h.sent]))
    }
    for (const [name, keys] of this.orphans) out.push({ name, keys })
    this.orphans.clear()
    return out
  }
}

/** 기기 관리와 피드백 돕기가 함께 쓰는 하나 */
export const hubOf = (ctx: { deviceHub?: DeviceHub }): DeviceHub => (ctx.deviceHub ??= new DeviceHub())

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

export const DEVICE_KEY_HEADER = 'x-rw-device-key'
/** 다른 컴퓨터가 서버로 정한 이 컴퓨터에 열쇠를 붙여 보냈는가 (이 컴퓨터가 서버일 때만) */
export function deviceKeyOk(headers: Record<string, string | string[] | undefined>, dirs: (string | undefined)[], me: string): boolean {
  const k = headers[DEVICE_KEY_HEADER]
  if (typeof k !== 'string' || !k) return false
  const cfg = readServerConfig(dirs)
  return !!cfg && cfg.machine === me && k.length === cfg.secret.length && timingSafeEqual(Buffer.from(k), Buffer.from(cfg.secret))
}
