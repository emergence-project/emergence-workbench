import fs from 'node:fs'
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
