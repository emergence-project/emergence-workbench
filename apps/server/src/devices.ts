// 서버 › 기기 (11/20 사용자 "클로드 기기관리처럼", 시안 1단계): 컴퓨터마다 개인 저장소에 올리는 기기 정보 (_settings/<컴퓨터>/device.yaml)
// 맞추기(backup.ts)가 올리고, 다른 컴퓨터의 맞추기가 받아 온 것을 서버 › 기기 화면이 읽는다. 이름 · 시각 · 앱 버전 · 계정 이름만 (열쇠 · 이메일은 올리지 않는다)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import type { Device, DeviceAccount } from '@rw/core/contract/devices'

export type { DeviceRecord } from '@rw/core/contract/devices'
import type { DeviceRecord } from '@rw/core/contract/devices'

/** 로그인한 계정을 알려 주는 곳 (계정 · Claude 계정 · 구글 라우트가 자기 것을 등록한다) */
const sources = new Map<string, () => DeviceAccount[]>()
export function setDeviceAccounts(key: string, fn: () => DeviceAccount[]): void { sources.set(key, fn) }
/** 기기 로그아웃 (서버 › 기기 2단계): 계정마다 이 컴퓨터에서 로그아웃하는 일. 서버가 걸어 둔 로그아웃을 받으면 모두 부른다 */
const logouts = new Map<string, () => Promise<unknown> | unknown>()
export function setDeviceLogout(key: string, fn: () => Promise<unknown> | unknown): void { logouts.set(key, fn) }
export async function logoutDevice(): Promise<string[]> {
  const done: string[] = []
  for (const [k, fn] of logouts) { try { await fn(); done.push(k) } catch { /* 하나가 실패해도 나머지는 */ } }
  return done
}
const ORDER: DeviceAccount['kind'][] = ['github', 'claude', 'codex', 'google']
export function deviceAccounts(): DeviceAccount[] {
  const out: DeviceAccount[] = []
  for (const fn of sources.values()) { try { out.push(...fn()) } catch { /* 읽지 못한 계정은 빼고 */ } }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

let osName: string | undefined
let label: string | null | undefined
/** macOS 26.1 처럼. 맥이 아니면 플랫폼과 커널 판 */
function osOf(): string {
  if (osName) return osName
  if (process.platform === 'darwin') {
    try { osName = `macOS ${execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 3000 }).trim()}` } catch { /* 아래로 */ }
  }
  return (osName ??= process.platform === 'win32' ? `Windows ${os.release()}` : `${os.type()} ${os.release()}`)
}
/** 맥의 컴퓨터 이름 (시스템 설정 › 일반 › 정보의 이름). 없으면 undefined */
function labelOf(): string | undefined {
  if (label === undefined) {
    label = null
    if (process.platform === 'darwin') { try { label = execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8', timeout: 3000 }).trim() || null } catch { /* 없으면 이름 */ } }
  }
  return label ?? undefined
}

/** 지금 이 컴퓨터의 기기 정보 */
export function thisDevice(name: string, version: string | undefined, now = new Date()): DeviceRecord {
  const l = labelOf()
  return { name, ...(l && { label: l }), seen: now.toISOString(), ...(version && { version }), os: osOf(), accounts: deviceAccounts() }
}

export const devicePath = (machine: string) => `_settings/${machine}/device.yaml`
/** 시각만 바뀌었으면 이만큼 지나야 다시 쓴다 (맞추기마다 커밋이 생기지 않게. 맞추기는 1시간마다) */
const REFRESH_MS = 50 * 60_000
/** 백업 사본에 기기 정보를 쓴다. 바뀐 것이 있거나 마지막 시각이 오래됐을 때만 쓰고 true */
export function writeDevice(dir: string, rec: DeviceRecord, now = new Date()): boolean {
  const file = path.join(dir, devicePath(rec.name))
  const old = parseDevice(file)
  if (old) {
    const { seen: a, ...restOld } = old
    const { seen: _b, ...restNew } = rec
    if (JSON.stringify(restOld) === JSON.stringify(restNew) && now.getTime() - Date.parse(a) < REFRESH_MS) return false
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, YAML.stringify(rec))
  return true
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
function parseDevice(file: string, name?: string): DeviceRecord | null {
  let v: unknown
  try { v = YAML.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
  if (!v || typeof v !== 'object') return null
  const o = Object.fromEntries(Object.entries(v))
  const seen = str(o.seen)
  const nm = name ?? str(o.name)
  if (!seen || !nm || Number.isNaN(Date.parse(seen))) return null
  const accounts = (Array.isArray(o.accounts) ? o.accounts : []).flatMap((a: unknown): DeviceAccount[] => {
    const x = a && typeof a === 'object' ? Object.fromEntries(Object.entries(a)) : {}
    const kind = ORDER.find((k) => k === x.kind)
    if (!kind) return []
    const n = str(x.name), p = str(x.plan)
    return [{ kind, ...(n && { name: n }), ...(p && { plan: p }) }]
  })
  const l = str(o.label), ver = str(o.version), s = str(o.os)
  return { name: nm, ...(l && { label: l }), seen, ...(ver && { version: ver }), ...(s && { os: s }), accounts }
}

/** 최근에 맞춘 것으로 보는 시간: 맞추기 간격(1시간)에 여유를 둔다 */
export const ONLINE_MS = 2 * 60 * 60_000
/** 백업 사본에서 다른 컴퓨터들의 기기 정보 */
export function otherDevices(dir: string, me: string, now = new Date()): Device[] {
  const root = path.join(dir, '_settings')
  let names: string[] = []
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== me).map((d) => d.name) } catch { return [] }
  return names.flatMap((m) => {
    const r = parseDevice(path.join(root, m, 'device.yaml'), m)
    return r ? [{ ...r, this: false, online: now.getTime() - Date.parse(r.seen) < ONLINE_MS }] : []
  }).sort((a, b) => Date.parse(b.seen) - Date.parse(a.seen))
}
