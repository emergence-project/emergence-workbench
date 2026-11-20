// 계정마다 남은 한도 (11/20 시안 4절 "Claude · Codex 계정마다 5시간 · 이번 주 한도 막대"):
// 그 에이전트가 이 컴퓨터에 남기는 마지막 사용 정보에서 읽는다. 한 번도 안 돌았거나 못 읽으면 없음(화면은 「아직 모름」).
// - Claude: 대화가 도는 동안 Claude Code가 보내는 rate_limit_event(agentRunner.ts)를 계정 폴더마다 적어 둔다(설정 폴더 agent-limits.json).
//   utilization은 0–1 비율(100을 넘는 값은 이미 %), resetsAt은 초.
// - Codex: 계정 폴더(CODEX_HOME)의 sessions/연/월/일/rollout-*.jsonl 마지막 줄들의 rate_limits
//   (primary · secondary = { used_percent, window_minutes, resets_at(초) 또는 resets_in_seconds }).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface LimitWindow { used: number; resetsAt?: string }
export interface Limits { five?: LimitWindow; week?: LimitWindow; at: string }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {})
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const iso = (sec: number | undefined) => (sec === undefined ? undefined : new Date(sec * 1000).toISOString())
const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10))

let file: string | undefined
let saved: Record<string, Limits> | undefined

/** 적어 둘 파일 (앱 서버가 시작할 때). 없으면 앱이 도는 동안만 기억한다 */
export function setLimitsFile(f: string | undefined): void { file = f; saved = undefined }

function load(): Record<string, Limits> {
  if (saved) return saved
  let v: unknown
  try { v = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {} } catch { v = {} }
  saved = {}
  for (const [k, x] of Object.entries(obj(v))) {
    const o = obj(x)
    const win = (w: unknown): LimitWindow | undefined => { const y = obj(w); const used = num(y.used); return used === undefined ? undefined : { used, ...(typeof y.resetsAt === 'string' && { resetsAt: y.resetsAt }) } }
    const five = win(o.five), week = win(o.week)
    if (typeof o.at === 'string') saved[k] = { ...(five && { five }), ...(week && { week }), at: o.at }
  }
  return saved
}

const keyOf = (dir: string | undefined) => path.resolve(dir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'))

/** Claude Code의 rate_limit_event 하나를 그 계정 폴더(dir, 없으면 이 컴퓨터)의 값으로 적는다 */
export function noteClaudeLimit(dir: string | undefined, info: unknown): void {
  const i = obj(info)
  const win = (w: unknown): LimitWindow | undefined => {
    const y = obj(w); const u = num(y.utilization)
    return u === undefined ? undefined : { used: pct(u > 1 ? u : u * 100), ...(num(y.resetsAt) !== undefined && { resetsAt: iso(num(y.resetsAt)) }) }
  }
  const all = obj(i.unifiedWindows)
  let five = win(all.five_hour), week = win(all.seven_day)
  if (!five && !week) {
    const one = win(i)
    if (i.rateLimitType === 'five_hour') five = one
    else if (i.rateLimitType === 'seven_day') week = one
  }
  if (!five && !week) return
  const store = load()
  const k = keyOf(dir)
  store[k] = { ...store[k], ...(five && { five }), ...(week && { week }), at: new Date().toISOString() }
  if (!file) return
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`) } catch { /* 다음에 다시 적는다 */ }
}

export const claudeLimits = (dir: string | undefined): Limits | undefined => fresh(load()[keyOf(dir)])

/** 가장 최근 rollout 파일 몇 개의 끝에서 rate_limits를 찾는다 */
export function codexLimits(dir: string): Limits | undefined {
  const root = path.join(dir, 'sessions')
  const desc = (d: string) => { try { return fs.readdirSync(d).sort().reverse() } catch { return [] } }
  const files: string[] = []
  for (const y of desc(root)) for (const m of desc(path.join(root, y))) for (const d of desc(path.join(root, y, m))) {
    for (const f of desc(path.join(root, y, m, d))) if (f.endsWith('.jsonl')) files.push(path.join(root, y, m, d, f))
    if (files.length >= 5) break
  }
  const recent = files.map((f) => { try { return { f, t: fs.statSync(f).mtimeMs } } catch { return { f, t: 0 } } }).sort((a, b) => b.t - a.t).slice(0, 5)
  for (const { f } of recent) {
    const got = lastRateLimits(tail(f))
    if (got) return fresh(got)
  }
  return undefined
}

function tail(f: string, max = 512 * 1024): string {
  try {
    const fd = fs.openSync(f, 'r')
    try {
      const size = fs.fstatSync(fd).size
      const buf = Buffer.alloc(Math.min(size, max))
      fs.readSync(fd, buf, 0, buf.length, size - buf.length)
      return buf.toString('utf8')
    } finally { fs.closeSync(fd) }
  } catch { return '' }
}

/** rollout 글에서 마지막 rate_limits (시험에서도 쓴다) */
export function lastRateLimits(text: string): Limits | undefined {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]!.includes('"rate_limits"')) continue
    let v: unknown
    try { v = JSON.parse(lines[i]!) } catch { continue }
    const o = obj(v), p = obj(o.payload)
    const rl = obj(p.rate_limits ?? obj(p.info).rate_limits ?? o.rate_limits)
    const at = typeof o.timestamp === 'string' && !Number.isNaN(Date.parse(o.timestamp)) ? o.timestamp : new Date().toISOString()
    const out: Limits = { at }
    for (const [name, w] of [['primary', rl.primary], ['secondary', rl.secondary]] as const) {
      const y = obj(w); const used = num(y.used_percent)
      if (used === undefined) continue
      const minutes = num(y.window_minutes)
      const reset = num(y.resets_at) ?? (num(y.resets_in_seconds) !== undefined ? Date.parse(at) / 1000 + num(y.resets_in_seconds)! : undefined)
      const slot = minutes !== undefined ? (minutes <= 600 ? 'five' : 'week') : name === 'primary' ? 'five' : 'week'
      out[slot] = { used: pct(used), ...(reset !== undefined && { resetsAt: iso(reset) }) }
    }
    if (out.five || out.week) return out
  }
  return undefined
}

/** 다시 찬 창은 0으로 (적은 뒤 시간이 지나 이미 넘어간 창) */
export function fresh(l: Limits | undefined, now = Date.now()): Limits | undefined {
  if (!l) return undefined
  const f = (w: LimitWindow | undefined) => (w?.resetsAt && Date.parse(w.resetsAt) <= now ? { used: 0 } : w)
  const five = f(l.five), week = f(l.week)
  return { ...(five && { five }), ...(week && { week }), at: l.at }
}
