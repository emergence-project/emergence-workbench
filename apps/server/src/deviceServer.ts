// 서버 › 기기 2단계 (11/20 사용자 "맥스튜디오를 서버로"): 한 컴퓨터를 서버로 정하면 다른 컴퓨터가 Tailscale 주소로 1분마다 기기 정보를 알리고,
// 서버는 그것으로 기기 목록을 실시간으로 보이며 로그아웃을 걸어 둔다. 서버가 어느 컴퓨터인지는 개인 저장소의 _settings/server.yaml (옮길 수 있게 설정 값)
import { randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { z } from 'zod'
import * as C from '@rw/core/contract/devices'
import type { Device, DeviceBeat, DeviceBeatReply } from '@rw/core/contract/devices'
import { knownOnly } from './contract.js'
import { writeAtomic } from './fsutil.js'

export interface ServerConfig { machine: string; label?: string; url: string; secret: string; at: string }
export const SERVER_FILE = '_settings/server.yaml'
/** 서버에 알리는 간격과, 켜진 것으로 보는 시간 */
export const BEAT_MS = 60_000
export const LIVE_MS = 3 * 60_000

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
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

/** 걸어 둔 로그아웃 하나. sent = 그 컴퓨터의 알림에 답으로 한 번은 보냈다 */
interface HeldLogout { at: string; sent?: boolean }
/** 걸어 둔 로그아웃을 두는 파일 (이 컴퓨터의 설정 폴더) */
export const LOGOUTS_FILE = 'device-logouts.json'
function readLogouts(file: string | undefined): Map<string, HeldLogout> {
  const out = new Map<string, HeldLogout>()
  if (!file) return out
  let v: unknown
  try { v = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return out }
  if (!isRecord(v)) return out
  for (const [name, h] of Object.entries(v)) if (isRecord(h) && typeof h.at === 'string') out.set(name, { at: h.at, ...(h.sent === true && { sent: true }) })
  return out
}
/** 로그아웃이 빼는 계정(GitHub · 구글 · 더한 Claude · Codex 계정 = 이름이 붙은 것)이 하나도 없는가. 기본 Claude Code · Codex 로그인은 남는다 */
const signedOut = (accounts: DeviceBeat['accounts']): boolean => accounts.every((a) => a.kind !== 'github' && a.kind !== 'google' && !a.name)

/**
 * 서버 쪽: 다른 컴퓨터가 알린 기기와 걸어 둔 로그아웃, 그리고 피드백 돕기 (11/23 안 A).
 * 걸어 둔 로그아웃은 파일에 두고(11/26: 메모리에만 있어 서버를 다시 켜면 사라졌다), 답으로 보낸 뒤에도 그 컴퓨터의 계정이 빠진 것을 볼 때까지 다시 보낸다
 * (전에는 보내는 순간 지워, 답이 가는 길에 사라지면 없던 일이 됐다. 그 컴퓨터가 확인을 따로 보내지 않으므로 앱 버전이 달라도 된다).
 * 맡길지는 서버 한 곳이 정한다: 서버의 자리가 차면 저절로 맡기기가 켜져 있는 돕는 맥(free)에 맡기고(assign), 그 맥이 다음에 알릴 때 답으로 받아 시작한다.
 * 돕는 맥이 LIVE_MS 동안 알리지 않거나 돕기를 끄면 lapsed가 그 맥의 항목을 돌려준다: 서버가 맡음을 풀고 다시 맡기며, 그 맥이 다시 알리면 drop으로 그 대화를 멈춘다
 */
export class DeviceHub {
  private beats = new Map<string, { rec: Device; at: number }>()
  private logouts: Map<string, HeldLogout>
  private helpers = new Map<string, Helper>()
  /** 서버가 맡음을 푼 항목: 그 맥이 다시 알리면 멈추라고 보낸다 */
  private drops = new Map<string, Set<string>>()
  /** 돕기를 끈 맥에 맡겼지만 보내지 못한 항목 (다음 lapsed가 돌려준다) */
  private orphans = new Map<string, string[]>()
  constructor(private readonly file?: string) { this.logouts = readLogouts(file) }
  private saveLogouts(): void {
    if (!this.file) return
    try { writeAtomic(this.file, `${JSON.stringify(Object.fromEntries(this.logouts), null, 2)}\n`) } catch { /* 쓰지 못해도 켜져 있는 동안은 메모리의 것으로 전한다 */ }
  }
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
    const held = this.logouts.get(rec.name)
    // 한 번 보낸 뒤의 알림에 뺄 계정이 없으면 전해진 것이다. 계정이 그대로면 답이 닿지 않은 것이라 다시 보낸다 (로그아웃은 여러 번 받아도 같다)
    const done = !!held?.sent && signedOut(rec.accounts)
    if (held && (done || !held.sent)) {
      if (done) this.logouts.delete(rec.name)
      else held.sent = true
      this.saveLogouts()
    }
    const logout = !!held && !done
    const drop = [...(this.drops.get(rec.name) ?? [])]
    this.drops.delete(rec.name)
    return { logout, feedback, drop }
  }
  requestLogout(name: string, now = Date.now()): void { this.logouts.set(name, { at: new Date(now).toISOString() }); this.saveLogouts() }
  pending(name: string): boolean { return this.logouts.has(name) }
  /** 걸어 둔 로그아웃을 거둔다 (11/26: 서버를 다시 켜도 남게 된 뒤로 잘못 건 것을 거둘 길). 걸려 있었으면 true. 이미 답으로 보냈으면 그 컴퓨터는 로그아웃했을 수 있다 */
  cancelLogout(name: string): boolean {
    const had = this.logouts.delete(name)
    if (had) this.saveLogouts()
    return had
  }
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

/*
 * 컴퓨터끼리 주고받는 알림과 답은 앱 버전이 달라도 읽는다 (11/26): 전에는 모르는 칸 하나로 알림이 통째로 거절돼,
 * 버전이 다른 컴퓨터는 꺼진 것으로 보이고 로그아웃 · 피드백 돕기도 전해지지 않았다.
 * 모르는 칸은 버리고, 읽지 못하는 목록의 줄(모르는 종류의 계정 · 기기)은 그 줄만 뺀다. 그 밖의 틀린 모양은 전처럼 계약 검사가 잡는다
 */
const readable = (item: z.ZodTypeAny, list: unknown): unknown => (Array.isArray(list) ? list.filter((x) => item.safeParse(x).success) : list)
const knownAccounts = (d: unknown): unknown => (isRecord(d) && 'accounts' in d ? { ...d, accounts: readable(C.DeviceAccount, d.accounts) } : d)
/** 다른 컴퓨터가 보낸 알림을 계약 검사 앞에서 다듬는다 */
export const beatFromOther = (body: unknown): unknown => knownAccounts(knownOnly(C.DeviceBeat, body))
/** 서버의 답을 읽는다 */
export function replyFromServer(reply: unknown): DeviceBeatReply {
  const r = knownOnly(C.DeviceBeatReply, reply)
  if (!isRecord(r) || !Array.isArray(r.devices)) return C.DeviceBeatReply.parse(r)
  return C.DeviceBeatReply.parse({ ...r, devices: readable(C.Device, r.devices.map(knownAccounts)) })
}

/** 기기 관리와 피드백 돕기가 함께 쓰는 하나 */
export const hubOf = (ctx: { deviceHub?: DeviceHub; opts: { configDir: string } }): DeviceHub => (ctx.deviceHub ??= new DeviceHub(path.join(ctx.opts.configDir, LOGOUTS_FILE)))

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

/** 서버가 아닌 컴퓨터에서 로그아웃을 걸거나 취소한 뒤: 서버에서 받아 둔 목록에 바로 적는다 (다음 알림까지 1분 동안 화면이 그대로면 눌리지 않은 것으로 보인다) */
export function markLogout(devices: Device[], name: string, on: boolean): Device[] {
  return devices.map((d) => {
    if (d.name !== name) return d
    const { logout: _was, ...rest } = d
    return on ? { ...rest, logout: true } : rest
  })
}

export const DEVICE_KEY_HEADER = 'x-rw-device-key'
/** 다른 컴퓨터가 서버로 정한 이 컴퓨터에 열쇠를 붙여 보냈는가 (이 컴퓨터가 서버일 때만) */
export function deviceKeyOk(headers: Record<string, string | string[] | undefined>, dirs: (string | undefined)[], me: string): boolean {
  const k = headers[DEVICE_KEY_HEADER]
  if (typeof k !== 'string' || !k) return false
  const cfg = readServerConfig(dirs)
  return !!cfg && cfg.machine === me && k.length === cfg.secret.length && timingSafeEqual(Buffer.from(k), Buffer.from(cfg.secret))
}
