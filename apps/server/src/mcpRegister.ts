/**
 * 바깥 에이전트에 이 앱의 MCP 입구를 버튼 하나로 등록한다 (11/8 사용자 "MCP 연결은 기본 기능").
 * 터미널을 쓰지 않는 사람(설치 파일로 깐 윈도우 앱)도 설정 › 에이전트 › 연결의 「연결」 하나로 끝나게:
 * - Claude 데스크톱 앱: 설정 파일(claude_desktop_config.json)의 mcpServers에 한 칸을 더한다. 다른 칸은 그대로 둔다.
 * - Claude Code · Codex: 그 명령의 `mcp add`를 앱이 대신 부른다 (Codex는 앱이 받은 것도 쓴다: codexCli.ts).
 * 입구는 이 앱의 node와 scripts/mcp.mjs. 설치판은 켤 때마다 포트 · 열쇠가 바뀌어도 입구가 server.json을 읽어 찾는다 (appKey.ts).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { appFile } from './agentPaths.js'
import { writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

export const MCP_NAME = 'emergence-workbench'

/** 등록할 입구: 이 앱을 돌리는 node와 앱 안의 scripts/mcp.mjs (GUI 앱은 PATH에 node가 없을 수 있어 절대 경로) */
export const mcpEntry = (): { command: string; args: string[] } => ({ command: process.execPath, args: [appFile('scripts/mcp.mjs')] })

/**
 * Claude 데스크톱 앱의 설정 파일 후보 중 그 폴더가 있는 것 (앱을 한 번 켜면 생긴다).
 * 맥: ~/Library/Application Support/Claude. 윈도우: %APPDATA%\Claude, 스토어(MSIX)판은 %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude
 */
export function claudeDesktopConfigs(home = os.homedir(), env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const dirs: string[] = []
  if (platform === 'darwin') dirs.push(path.join(home, 'Library', 'Application Support', 'Claude'))
  else if (platform === 'win32') {
    if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'Claude'))
    const pkgs = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Packages') : ''
    try { for (const d of fs.readdirSync(pkgs)) if (/^Claude_/i.test(d)) dirs.push(path.join(pkgs, d, 'LocalCache', 'Roaming', 'Claude')) } catch { /* 스토어판 없음 */ }
  } else dirs.push(path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude'))
  return dirs.filter((d) => fs.existsSync(d)).map((d) => path.join(d, 'claude_desktop_config.json'))
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 그 설정 파일에 이 앱의 입구가 있나 (이름이 같거나 명령에 scripts/mcp.mjs) */
export function desktopRegistered(file: string): boolean {
  try {
    const servers: unknown = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers
    return isRecord(servers) && Object.entries(servers).some(([k, v]) => k === MCP_NAME || /scripts[\\/]+mcp\.mjs/.test(JSON.stringify(v ?? '')))
  } catch { return false }
}

/** 설정 파일에 입구를 적는다. 다른 칸 · 다른 MCP 서버는 그대로. 읽지 못하는 파일은 덮어쓰지 않는다 */
export function registerDesktop(file: string, entry = mcpEntry()): void {
  let config: Record<string, unknown> = {}
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8')
    let parsed: unknown
    try { parsed = raw.trim() ? JSON.parse(raw) : {} } catch { parsed = undefined }
    if (!isRecord(parsed)) throw new WorkbenchError(409, t(`Claude 설정 파일을 읽지 못해 고치지 않았습니다: ${file}`, `Could not read the Claude settings file, so it was left as is: ${file}`))
    config = parsed
  }
  const servers = isRecord(config.mcpServers) ? config.mcpServers : {}
  writeAtomic(file, `${JSON.stringify({ ...config, mcpServers: { ...servers, [MCP_NAME]: entry } }, null, 2)}\n`)
}

const run = promisify(execFile)

/** `<명령> mcp add …`를 부른다 (Claude Code는 사용자 범위). 윈도우의 .cmd는 셸로 */
export async function registerCli(kind: 'claude-code' | 'codex', bin: string, entry = mcpEntry()): Promise<void> {
  const args = kind === 'claude-code' ? ['mcp', 'add', '--scope', 'user', MCP_NAME, '--', entry.command, ...entry.args] : ['mcp', 'add', MCP_NAME, '--', entry.command, ...entry.args]
  const shell = /\.cmd$/i.test(bin)
  const q = (s: string) => (shell ? `"${s}"` : s)
  try {
    await run(q(bin), shell ? args.map(q) : args, { timeout: 30_000, windowsHide: true, shell })
  } catch (e) {
    const why = (e instanceof Error ? ('stderr' in e && typeof e.stderr === 'string' && e.stderr.trim()) || e.message : String(e)).slice(0, 300)
    throw new WorkbenchError(500, t(`등록하지 못했습니다: ${why}`, `Could not register: ${why}`))
  }
}
