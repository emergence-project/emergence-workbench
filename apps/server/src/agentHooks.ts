/**
 * 밖에서 도는 에이전트의 상태 (10/30, 오르카에서 가져옴): 터미널의 Claude Code · Codex가 앱 MCP를 부르지 않아도 앱이 안다.
 * - 앱이 설정 폴더에 알림 스크립트(agent-hooks/emergence-workbench-hook.sh)와 서버 주소 파일(endpoint.env)을 쓴다.
 *   스크립트는 부를 때마다 주소 파일을 다시 읽어, 앱이 다른 포트로 다시 켜져도 오래 돈 세션이 계속 닿는다.
 * - 켜면 Claude Code 사용자 설정(~/.claude/settings.json)의 hooks와 Codex 설정(~/.codex/config.toml)의 notify에 그 스크립트를 넣는다.
 *   앱이 넣은 줄은 스크립트 이름(HOOK_MARK)으로 알아보고, 끄면 그 줄만 뺀다. 다른 훅 · 설정은 그대로 둔다.
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
# Claude Code는 훅 내용을 표준 입력으로, Codex notify는 마지막 인자로 준다. 앱이 꺼져 있으면 아무것도 하지 않는다.
agent="$1"
body="$2"
[ -z "$body" ] && body=$(cat)
. "$(dirname "$0")/endpoint.env" 2>/dev/null || exit 0
curl -s -m 2 -o /dev/null -X POST -H 'content-type: application/json' -H "x-rw-hook-agent: $agent" --data-binary "$body" "$RW_URL/api/agent-hooks" >/dev/null 2>&1
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

export function codexInstalled(home = os.homedir()): boolean | 'busy' {
  const file = codexConfig(home)
  if (!fs.existsSync(file)) return false
  const text = fs.readFileSync(file, 'utf8')
  const line = text.match(NOTIFY)?.[0]
  return !line ? false : line.includes(HOOK_MARK) ? true : 'busy'
}

/** 켜기 · 끄기. 다른 notify가 이미 있으면 바꾸지 않고 'busy' (Codex는 notify를 하나만 받는다) */
export function setCodexNotify(configDir: string, on: boolean, home = os.homedir()): boolean | 'busy' {
  const file = codexConfig(home)
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const now = codexInstalled(home)
  if (now === 'busy') return 'busy'
  const without = text.split('\n').filter((l) => !(NOTIFY.test(l) && l.includes(HOOK_MARK))).join('\n')
  if (!on) {
    if (now) writeAtomic(file, without)
    return false
  }
  // 맨 위 키여야 한다: 첫 표 머리보다 앞, 파일 맨 앞에 둔다
  const line = `notify = ["sh", ${JSON.stringify(hookScript(configDir))}, "codex"]`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, `${line}\n${without}`)
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
