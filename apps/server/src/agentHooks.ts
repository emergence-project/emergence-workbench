/**
 * 밖에서 도는 에이전트의 상태 (10/30, 오르카에서 가져옴): 터미널의 Claude Code · Codex가 앱 MCP를 부르지 않아도 앱이 안다.
 * - 앱이 설정 폴더에 알림 스크립트(agent-hooks/emergence-workbench-hook.sh)와 서버 주소 파일(endpoint.env)을 쓴다.
 *   스크립트는 부를 때마다 주소 파일을 다시 읽어, 앱이 다른 포트로 다시 켜져도 오래 돈 세션이 계속 닿는다.
 * - 켜면 Claude Code 사용자 설정(~/.claude/settings.json)의 hooks와 Codex 설정(~/.codex/config.toml)의 notify에 그 스크립트를 넣는다.
 *   앱이 넣은 줄은 스크립트 이름(HOOK_MARK)으로 알아보고, 끄면 그 줄만 뺀다. 다른 훅 · 설정은 그대로 둔다.
 *   Codex에 다른 notify가 있으면 그것을 앱 줄 안으로 옮겨 함께 부르고, 끄면 되돌린다.
 * - 앱은 세션마다 마지막 상태만 메모리에 둔다(12시간). 앱 안 대화는 사용자 설정을 읽지 않으므로(agentRunner settingSources: []) 여기에 오지 않는다.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HookSession } from '@rw/core/contract/agentHooks'
import { z } from 'zod'
import { isInside, writeAtomic } from './fsutil.js'

export const HOOK_MARK = 'emergence-workbench-hook'
const KEEP_MS = 12 * 60 * 60_000
/** Claude Code 훅 이벤트: 지시를 받으면 일하는 중, 알림(허락 · 입력 기다림)이면 기다림, 차례가 끝나면 끝남, 세션이 닫히면 뺀다 */
export const CLAUDE_EVENTS = ['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'] as const

export const hookDir = (configDir: string) => path.join(configDir, 'agent-hooks')
export const hookScript = (configDir: string) => path.join(hookDir(configDir), `${HOOK_MARK}.sh`)

const SCRIPT = `#!/bin/sh
# ${HOOK_MARK}: 에이전트 상태를 Emergence Workbench 앱에 알린다. 앱이 쓴 파일이다 (설정 › 에이전트 › 상태 알리기에서 끈다).
# Claude Code는 훅 내용을 표준 입력으로, Codex notify는 마지막 인자로 준다. 앱이 꺼져 있으면 보내지 않는다.
# Codex에 원래 notify가 있었으면 "--" 뒤에 그 명령이 오고, 알린 뒤 같은 인자로 그것을 부른다.
agent="$1"
shift
body=""
for a in "$@"; do body="$a"; done
[ -z "$body" ] && body=$(cat)
env="$(dirname "$0")/endpoint.env"
if [ -f "$env" ] && . "$env"; then
  curl -s -m 2 -o /dev/null -X POST -H 'content-type: application/json' -H "x-rw-hook-agent: $agent" --data-binary "$body" "$RW_URL/api/agent-hooks" >/dev/null 2>&1
fi
if [ "$1" = "--" ]; then
  shift
  exec "$@"
fi
exit 0
`

/** 알림 스크립트와 서버 주소 파일을 쓴다 (서버가 뜰 때마다) */
export function writeHookFiles(configDir: string, url: string): void {
  fs.mkdirSync(hookDir(configDir), { recursive: true })
  const script = hookScript(configDir)
  if (!fs.existsSync(script) || fs.readFileSync(script, 'utf8') !== SCRIPT) fs.writeFileSync(script, SCRIPT, { mode: 0o755 })
  writeAtomic(path.join(hookDir(configDir), 'endpoint.env'), `RW_URL=${url}\n`)
}

// ---------- Claude Code: ~/.claude/settings.json ----------

/** 앱이 읽는 만큼만 본다: 모르는 칸은 그대로 두었다가 다시 쓴다 */
const HookEntry = z.object({ type: z.string().optional(), command: z.string().optional(), timeout: z.number().optional() }).passthrough()
const HookGroup = z.object({ matcher: z.string().optional(), hooks: z.array(HookEntry).optional() }).passthrough()
const Settings = z.object({ hooks: z.record(z.string(), z.array(HookGroup)).optional() }).passthrough()
type HookEntry = z.infer<typeof HookEntry>
type HookGroup = z.infer<typeof HookGroup>
type Settings = z.infer<typeof Settings>

const claudeSettings = (home: string) => path.join(home, '.claude', 'settings.json')
const ours = (e: HookEntry) => typeof e.command === 'string' && e.command.includes(HOOK_MARK)

function readJson(file: string): Settings {
  if (!fs.existsSync(file)) return {}
  const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  const r = Settings.safeParse(v)
  if (!r.success) throw new Error(`${file}: 훅 모양을 읽지 못했습니다`)
  return r.data
}

export function claudeInstalled(home = os.homedir()): boolean {
  try {
    const hooks = readJson(claudeSettings(home)).hooks ?? {}
    return Object.values(hooks).some((groups) => groups.some((g) => (g.hooks ?? []).some(ours)))
  } catch { return false }
}

/** 켜기 · 끄기. 앱이 넣은 훅만 더하고 뺀다 (다른 훅과 설정은 그대로, JSON이 깨져 있으면 손대지 않고 오류) */
export function setClaudeHooks(configDir: string, on: boolean, home = os.homedir()): void {
  const file = claudeSettings(home)
  const s = readJson(file)
  const hooks: Record<string, HookGroup[]> = { ...(s.hooks ?? {}) }
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups.map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((e) => !ours(e)) })).filter((g) => g.hooks.length)
    if (kept.length) hooks[event] = kept
    else delete hooks[event]
  }
  if (on) {
    const command = `sh "${hookScript(configDir)}" claude-code`
    for (const event of CLAUDE_EVENTS) hooks[event] = [...(hooks[event] ?? []), { hooks: [{ type: 'command', command, timeout: 5 }] }]
  }
  const next: Settings = { ...s }
  if (Object.keys(hooks).length) next.hooks = hooks
  else delete next.hooks
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`)
}

// ---------- Codex: ~/.codex/config.toml의 notify 한 줄 ----------

const codexConfig = (home: string) => path.join(home, '.codex', 'config.toml')
/** 표 머리([..]) 앞의 맨 위 notify 줄 */
const NOTIFY = /^\s*notify\s*=.*$/m

/** notify 줄의 명령 배열. 한 줄의 큰따옴표 글 배열만 읽고, 그 밖의 모양은 null */
export function notifyArgs(line: string): string[] | null {
  const m = line.match(/^\s*notify\s*=\s*(\[.*\])\s*(#.*)?$/)
  if (!m?.[1]) return null
  try {
    const v: unknown = JSON.parse(m[1])
    return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string') ? v : null
  } catch { return null }
}

/** 앱의 줄이면 true, 없으면 false, 읽지 못하는 다른 notify면 'busy' (원래 것과 함께 넣을 수 없다) */
export function codexInstalled(home = os.homedir()): boolean | 'busy' {
  const file = codexConfig(home)
  if (!fs.existsSync(file)) return false
  const line = fs.readFileSync(file, 'utf8').match(NOTIFY)?.[0]
  if (!line) return false
  if (line.includes(HOOK_MARK)) return true
  return notifyArgs(line) ? false : 'busy'
}

/**
 * 켜기 · 끄기. Codex는 notify를 하나만 받으므로, 다른 notify가 있으면 그 명령을 앱 줄의 "--" 뒤에 옮겨 스크립트가 알린 뒤 부르게 하고,
 * 끄면 원래 줄로 되돌린다. 읽지 못하는 모양(여러 줄 배열 등)이면 바꾸지 않고 'busy'.
 */
export function setCodexNotify(configDir: string, on: boolean, home = os.homedir()): boolean | 'busy' {
  const file = codexConfig(home)
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const line = text.match(NOTIFY)?.[0]
  const mine = !!line?.includes(HOOK_MARK)
  if (line && !mine && !notifyArgs(line)) return 'busy'
  // 원래 notify: 앱 줄이면 "--" 뒤, 아니면 그 줄 그대로
  const args = line ? notifyArgs(line) : null
  const original = mine ? (args && args.indexOf('--') >= 0 ? args.slice(args.indexOf('--') + 1) : []) : (args ?? [])
  const restore = original.length ? `notify = ${JSON.stringify(original).replaceAll('","', '", "')}` : null
  const rest = line ? text.replace(NOTIFY, '\0').split('\n').filter((l) => l !== '\0').join('\n') : text
  if (!on) {
    if (mine) writeAtomic(file, restore ? text.replace(NOTIFY, restore) : rest)
    return false
  }
  // 맨 위 키여야 한다: 첫 표 머리보다 앞, 파일 맨 앞에 둔다
  const ourArgs = ['sh', hookScript(configDir), 'codex', ...(original.length ? ['--', ...original] : [])]
  const ourLine = `notify = ${JSON.stringify(ourArgs).replaceAll('","', '", "')}`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, `${ourLine}\n${rest}`)
  return true
}

// ---------- 받은 알림 ----------

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** 알림 하나를 세션 상태로. 모르는 알림은 null, 세션이 닫힘은 'end' */
export function hookEvent(agent: string, body: Record<string, unknown>): Omit<HookSession, 'at' | 'rid' | 'project'> | 'end' | null {
  if (agent === 'claude-code') {
    const cwd = str(body.cwd)
    const session = str(body.session_id) || cwd
    if (!session) return null
    const event = str(body.hook_event_name)
    if (event === 'SessionEnd') return 'end'
    const state = event === 'UserPromptSubmit' ? 'working' : event === 'Notification' ? 'waiting' : event === 'Stop' ? 'done' : null
    if (!state) return null
    const note = state === 'waiting' ? str(body.message).slice(0, 200) : ''
    return { agent, session, cwd, state, ...(note && { note }) }
  }
  if (agent === 'codex') {
    if (str(body.type) !== 'agent-turn-complete') return null
    const cwd = str(body.cwd)
    const session = str(body['thread-id']) || str(body['session-id']) || cwd || 'codex'
    return { agent, session, cwd, state: 'done' }
  }
  return null
}

/** 세션마다 마지막 상태 (메모리, 12시간) */
export class HookSessions {
  private readonly rows = new Map<string, HookSession>()

  constructor(private readonly projects: () => { id: string; title: string; path: string }[]) {}

  receive(agent: string, body: Record<string, unknown>, now = new Date()): boolean {
    const e = hookEvent(agent, body)
    if (!e) return false
    const key = `${agent}\0${e === 'end' ? str(body.session_id) || str(body.cwd) : e.session}`
    if (e === 'end') return this.rows.delete(key)
    const p = e.cwd ? this.projects().find((r) => r.path === e.cwd || isInside(r.path, e.cwd)) : undefined
    this.rows.set(key, { ...e, ...(p && { rid: p.id, project: p.title }), at: now.toISOString() })
    return true
  }

  list(now = Date.now()): HookSession[] {
    for (const [k, r] of this.rows) if (now - Date.parse(r.at) > KEEP_MS) this.rows.delete(k)
    return [...this.rows.values()].sort((a, b) => b.at.localeCompare(a.at))
  }
}
