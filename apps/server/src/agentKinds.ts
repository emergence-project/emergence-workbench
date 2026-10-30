/**
 * 앱 대화를 맡는 에이전트 (10/30 사용자 결정 "둘 다, 공통 규약(ACP)으로", 시안 https://claude.ai/artifact/3NBbEmtfj3LYnw4J2ypr4u).
 * - claude-code: 지금처럼 Claude Agent SDK (agentRunner.ts).
 * - codex · gemini: 이 맥에 깐 CLI를 Agent Client Protocol(ACP, Zed가 만든 에디터 · 에이전트 공통 규약)로 띄운다 (agentAcp.ts).
 *   Gemini CLI는 `gemini --acp`로 직접, Codex는 공개 어댑터 codex-acp(@zed-industries/codex-acp)로. 둘 다 맥의 로그인을 그대로 쓴다.
 * 실행 파일은 PATH(claudeEnv)와 npm 전역 폴더에서 찾고, RW_CODEX_ACP_BIN · RW_GEMINI_BIN이 먼저다 (시험은 가짜 에이전트를 넣는다).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentKind, ChatAgents } from '@rw/core/contract/agentChats'
import { claudeEnv, claudeExecutable } from './ask.js'

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
   * 대화를 열 때 고를 에이전트 쪽 모드 id (있을 때만 바꾼다). Codex: 연구 대화는 읽기 전용 샌드박스(쓰기 · 네트워크는 허락을 묻는다),
   * 앱 고치기 대화는 작업 폴더 안 쓰기. Gemini는 기본(고치기 · 명령 · 웹을 묻는다) 그대로
   */
  modeFor(o: { app: boolean; write: 'read' | 'notes' }): string | undefined
}

export const ACP_AGENTS: Record<AcpSpec['id'], AcpSpec> = {
  codex: {
    id: 'codex', name: 'Codex', bin: 'codex-acp', envBin: 'RW_CODEX_ACP_BIN', args: [],
    install: 'npm i -g @zed-industries/codex-acp',
    loginFiles: ['.codex/auth.json'], loginEnv: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    modeFor: ({ app, write }) => (app && write !== 'read' ? 'auto' : 'read-only'),
  },
  gemini: {
    id: 'gemini', name: 'Gemini', bin: 'gemini', envBin: 'RW_GEMINI_BIN', args: ['--acp'],
    install: 'npm i -g @google/gemini-cli',
    loginFiles: ['.gemini/oauth_creds.json'], loginEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    modeFor: () => undefined,
  },
}

export const AGENT_NAME: Record<AgentKind, string> = { 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }

export const isAcp = (a: string | undefined): a is AcpSpec['id'] => a === 'codex' || a === 'gemini'

/** 실행 파일을 찾을 폴더: claudeEnv의 PATH와 흔한 npm 전역 폴더 */
function binDirs(home = os.homedir()): string[] {
  const extra = ['.npm-global/bin', '.local/share/pnpm', 'Library/pnpm', '.volta/bin', '.bun/bin'].map((d) => path.join(home, d))
  return [...new Set([...(claudeEnv().PATH ?? '').split(':').filter(Boolean), ...extra])]
}

const executable = (p: string) => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile() } catch { return false } }

/** 그 에이전트의 실행 파일 (없으면 undefined) */
export function acpBin(spec: AcpSpec): string | undefined {
  const own = process.env[spec.envBin]
  if (own) return executable(own) ? own : undefined
  return binDirs().map((d) => path.join(d, spec.bin)).find(executable)
}

/** 에이전트 프로세스의 환경: PATH에 npm 전역 폴더까지 (codex-acp · gemini가 node를 찾게) */
export function acpEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return { ...claudeEnv(), PATH: binDirs().join(':'), ...extra }
}

function versionOf(bin: string): string | undefined {
  const r = spawnSync(bin, ['--version'], { env: acpEnv(), encoding: 'utf8', timeout: 5_000 })
  const line = r.status === 0 ? (r.stdout || '').trim().split('\n')[0] : undefined
  return line ? line.slice(0, 60) : undefined
}

/** 설정 › 에이전트와 모델 메뉴: 이 맥에서 맡길 수 있는 에이전트 (버전은 5초 안에 답할 때만) */
export function agentsHere(home = os.homedir()): ChatAgents['agents'] {
  const claude = claudeExecutable()
  const out: ChatAgents['agents'] = [{ id: 'claude-code', name: AGENT_NAME['claude-code'], installed: true, ...(claude && { version: versionOf(claude) }) }]
  for (const spec of Object.values(ACP_AGENTS)) {
    const bin = acpBin(spec)
    const login = spec.loginFiles.some((f) => fs.existsSync(path.join(home, f))) || spec.loginEnv.some((k) => !!process.env[k])
    const version = bin ? versionOf(bin) : undefined
    out.push({ id: spec.id, name: spec.name, installed: !!bin, ...(version && { version }), login, ...(!bin && { install: spec.install }) })
  }
  return out
}
