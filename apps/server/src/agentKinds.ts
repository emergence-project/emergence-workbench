/**
 * 앱 대화를 맡는 에이전트 (10/30 사용자 결정 "둘 다, 공통 규약(ACP)으로", 시안 https://claude.ai/artifact/3NBbEmtfj3LYnw4J2ypr4u).
 * - claude-code: 지금처럼 Claude Agent SDK (agentRunner.ts).
 * - codex · gemini: 이 맥에 깐 CLI를 Agent Client Protocol(ACP, Zed가 만든 에디터 · 에이전트 공통 규약)로 띄운다 (agentAcp.ts).
 *   Gemini CLI는 `gemini --acp`로 직접, Codex는 공개 연결부 codex-acp(@agentclientprotocol/codex-acp)로. 둘 다 그 컴퓨터의 로그인을 그대로 쓴다.
 * 실행 파일은 PATH(claudeEnv)와 npm 전역 폴더에서 찾고, RW_CODEX_ACP_BIN · RW_GEMINI_BIN이 먼저다 (시험은 가짜 에이전트를 넣는다).
 * Codex는 앱의 연결부(설치 파일로 깐 앱은 앱 안 vendor/codex-acp, 저장소에서 도는 앱은 설정 폴더에 받은 것, codexAcp.ts)를
 * 앱의 node로 띄우고, 앱이 쓰는 codex(설정 › 에이전트의 「ChatGPT로 연결」, codexCli.ts)를 CODEX_PATH로 넘긴다.
 * 그래서 어느 앱이든 「ChatGPT로 연결」 하나로 묻기와 대화가 같은 codex · 같은 로그인을 쓴다 (11/8 "장점만 취하자"). npm은 필요 없다.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentKind, ChatAgents } from '@rw/core/contract/agentChats'
import { claudeEnv, claudeExecutable, claudeInstalled, pathDirs, withPath } from './ask.js'
import { codexAcpJs } from './codexAcp.js'
import { codexBin, codexLoggedIn } from './codexCli.js'

export interface AcpSpec {
  id: Exclude<AgentKind, 'claude-code'>
  name: string
  /** 실행 파일 이름 (PATH에서 찾는다)과 덮어쓰는 환경 변수 */
  bin: string
  envBin: string
  args: string[]
  /** 깔 때 쓸 명령 (설정 › 에이전트에 보인다) */
  install: string
  /** 로그인한 흔적 (홈 기준 파일 · 환경 변수) */
  loginFiles: string[]
  loginEnv: string[]
  /**
   * 대화를 열 때 고를 에이전트 쪽 모드 id 후보 (앞에서부터 있는 것 하나로 바꾼다). Codex: 연구 대화는 읽기 전용 샌드박스(쓰기 · 네트워크는
   * 허락을 묻고, 노트는 앱 MCP 도구로 고친다), 앱 고치기 대화는 작업 폴더 안 쓰기(새 연결부 workspace-write, 옛 연결부 auto).
   * Gemini는 기본(고치기 · 명령 · 웹을 묻는다) 그대로
   */
  modeFor(o: { app: boolean; write: 'read' | 'notes' }): string[]
}

export const ACP_AGENTS: Record<AcpSpec['id'], AcpSpec> = {
  codex: {
    id: 'codex', name: 'Codex', bin: 'codex-acp', envBin: 'RW_CODEX_ACP_BIN', args: [],
    install: 'npm i -g @agentclientprotocol/codex-acp',
    loginFiles: ['.codex/auth.json'], loginEnv: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    modeFor: ({ app, write }) => (app && write !== 'read' ? ['workspace-write', 'auto'] : ['read-only']),
  },
  gemini: {
    id: 'gemini', name: 'Gemini', bin: 'gemini', envBin: 'RW_GEMINI_BIN', args: ['--acp'],
    install: 'npm i -g @google/gemini-cli',
    loginFiles: ['.gemini/oauth_creds.json'], loginEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    modeFor: () => [],
  },
}

export const AGENT_NAME: Record<AgentKind, string> = { 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }

export const isAcp = (a: string | undefined): a is AcpSpec['id'] => a === 'codex' || a === 'gemini'

/** 실행 파일을 찾을 폴더: claudeEnv의 PATH와 흔한 npm 전역 폴더 */
function binDirs(home = os.homedir()): string[] {
  const extra = process.platform === 'win32'
    ? [...(process.env.APPDATA ? [path.join(process.env.APPDATA, 'npm')] : []), ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'pnpm')] : [])]
    : ['.npm-global/bin', '.local/share/pnpm', 'Library/pnpm', '.volta/bin', '.bun/bin'].map((d) => path.join(home, d))
  return [...new Set([...pathDirs(claudeEnv()), ...extra])]
}

const executable = (p: string) => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile() } catch { return false } }

/** 그 에이전트의 실행 파일 (없으면 undefined) */
export function acpBin(spec: AcpSpec): string | undefined {
  const own = process.env[spec.envBin]
  if (own) return executable(own) ? own : undefined
  const names = process.platform === 'win32' ? [`${spec.bin}.exe`, `${spec.bin}.cmd`] : [spec.bin]
  return binDirs().flatMap((d) => names.map((n) => path.join(d, n))).find(executable)
}

/** 띄우는 방법: 윈도우의 npm 실행 파일(.cmd)은 셸을 거쳐야 뜬다. 인자는 정해 둔 것(--acp 등)뿐이고 경로는 따옴표로 감싼다 */
export function spawnTarget(bin: string): { file: string; shell: boolean } {
  return /\.cmd$/i.test(bin) ? { file: `"${bin}"`, shell: true } : { file: bin, shell: false }
}

/** 에이전트를 띄우는 명령: 실행 파일 · 인자 · 셸 여부 · 더할 환경 */
export interface AcpCommand { file: string; args: string[]; shell: boolean; env?: Record<string, string>; bundled?: true }

/**
 * 그 에이전트를 띄우는 명령 (없으면 undefined). 차례: 환경 변수(시험) → 앱의 Codex 연결부 + 앱이 쓰는 codex → PATH의 실행 파일.
 * 연결부는 있는데 codex가 아직 없으면 undefined (설정 › 에이전트에서 「ChatGPT로 연결」을 누르면 생긴다)
 */
export function acpCommand(spec: AcpSpec, configDir?: string): AcpCommand | undefined {
  if (!process.env[spec.envBin] && spec.id === 'codex' && configDir) {
    const js = codexAcpJs(configDir)
    const codex = js && codexBin(configDir)
    if (js && codex) return { file: process.execPath, args: [js], shell: false, env: { CODEX_PATH: codex }, bundled: true }
  }
  const bin = acpBin(spec)
  return bin ? { ...spawnTarget(bin), args: spec.args } : undefined
}

/** 에이전트 프로세스의 환경: PATH에 npm 전역 폴더까지 (codex-acp · gemini가 node를 찾게) */
export function acpEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return { ...withPath(claudeEnv(), binDirs()), ...extra }
}

function versionOf(cmd: { file: string; args?: string[]; shell: boolean }): string | undefined {
  const r = spawnSync(cmd.file, [...(cmd.args ?? []), '--version'], { env: acpEnv(), encoding: 'utf8', timeout: 5_000, shell: cmd.shell, windowsHide: true })
  const line = r.status === 0 ? (r.stdout || '').trim().split('\n')[0] : undefined
  return line ? line.slice(0, 60) : undefined
}

/**
 * 설정 › 에이전트와 모델 메뉴: 이 컴퓨터에서 맡길 수 있는 에이전트 (버전은 5초 안에 답할 때만).
 * Claude는 Agent SDK에 든 것(저장소에서 돌 때)이나 이 컴퓨터에 깐 claude가 있을 때만 installed (설치 파일로 깐 앱에는 없을 수 있다).
 * bundled = Codex를 앱이 맡는다(설정 폴더를 알 때): 깔 명령 대신 「ChatGPT로 연결」이 그 자리이고, 로그인은 묻기와 같은 codex로 본다
 */
export function agentsHere(home = os.homedir(), configDir?: string): ChatAgents['agents'] {
  const claude = claudeExecutable()
  const out: ChatAgents['agents'] = [{ id: 'claude-code', name: AGENT_NAME['claude-code'], installed: claudeInstalled(), ...(claude && { version: versionOf(spawnTarget(claude)) }) }]
  for (const spec of Object.values(ACP_AGENTS)) {
    const cmd = acpCommand(spec, configDir)
    const own = spec.id === 'codex' && !process.env[spec.envBin] && !!configDir
    const login = own
      ? codexLoggedIn(configDir ? codexBin(configDir) : undefined)
      : spec.loginFiles.some((f) => fs.existsSync(path.join(home, f))) || spec.loginEnv.some((k) => !!process.env[k])
    const version = cmd ? versionOf(cmd.bundled ? cmd : { ...cmd, args: [] }) : undefined
    // 앱이 맡는 Codex는 codex만 있으면 깔린 것: 연결부는 대화를 열 때 받는다 (codexAcp.ts의 ensureCodexAcp)
    out.push({ id: spec.id, name: spec.name, installed: !!cmd || (own && !!configDir && !!codexBin(configDir)), ...(version && { version }), login, ...(own ? { bundled: true } : !cmd && { install: spec.install }) })
  }
  return out
}
