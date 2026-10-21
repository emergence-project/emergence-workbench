import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 에이전트(MCP 입구, mcp.ts)가 앱을 마지막으로 부른 때 (설정 › 계정 › 시작 준비의 "에이전트 연결").
 * MCP 도구는 요청에 x-rw-agent 머리(에이전트 이름)를 붙인다. 설정 폴더의 agent-seen.json에 1분에 한 번만 쓴다.
 */
const FILE = 'agent-seen.json'
const lastWrite = new Map<string, number>()

export function noteAgentCall(configDir: string, name: string, now = Date.now()): void {
  if (now - (lastWrite.get(configDir) ?? 0) < 60_000) return
  lastWrite.set(configDir, now)
  try { fs.writeFileSync(path.join(configDir, FILE), `${JSON.stringify({ at: new Date(now).toISOString(), name: name.slice(0, 40) })}\n`) } catch { /* 설정 폴더에 못 쓰면 보이지 않을 뿐 */ }
}

export function agentSeen(configDir: string): { at: string; name: string } | null {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(configDir, FILE), 'utf8')) as { at?: unknown; name?: unknown }
    return typeof v.at === 'string' && typeof v.name === 'string' ? { at: v.at, name: v.name } : null
  } catch { return null }
}

/** 우리 MCP 입구로 보이는 등록: 이름이 emergence-workbench이거나 명령에 scripts/mcp.mjs가 있는 것 */
const ours = (name: string, entry: unknown): boolean =>
  name === 'emergence-workbench' || /scripts[\\/]mcp\.mjs/.test(JSON.stringify(entry ?? ''))

/**
 * 이 앱의 MCP 입구를 등록한 에이전트 (10/21 사용자: "앱은 연결된 적 없다는데 터미널은 이미 있다고 한다").
 * 등록과 부름은 다르다: 등록만 하고 아직 부르지 않았거나, 등록 전에 열린 세션이면 부른 때가 없다.
 * Claude Code는 ~/.claude.json의 mcpServers(사용자 범위)와 projects.*.mcpServers, Codex는 ~/.codex/config.toml의 [mcp_servers.*].
 */
export function agentRegistered(home = os.homedir()): string[] {
  const out: string[] = []
  try {
    const j = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')) as { mcpServers?: Record<string, unknown>; projects?: Record<string, { mcpServers?: Record<string, unknown> }> }
    const groups = [j.mcpServers, ...Object.values(j.projects ?? {}).map((p) => p?.mcpServers)]
    if (groups.some((g) => g && Object.entries(g).some(([k, v]) => ours(k, v)))) out.push('Claude Code')
  } catch { /* 없거나 읽지 못하면 등록 안 된 것으로 */ }
  try {
    const toml = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8')
    if (/^\s*\[mcp_servers\.("?)emergence-workbench\1\]/m.test(toml) || /scripts[\\/]mcp\.mjs/.test(toml)) out.push('Codex')
  } catch { /* 위와 같음 */ }
  return out
}
