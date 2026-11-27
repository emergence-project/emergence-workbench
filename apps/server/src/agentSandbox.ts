/**
 * 연구 대화의 OS 격리 (2026-11-27, 설계 docs/specs/2026-11-27-agent-sandbox.md). 명령 판정(agentPolicy)은 명령 글을 읽어 묻고,
 * 판정이 놓친 명령도 폴더 밖을 쓰거나 비밀을 읽지 못하게 하는 벽은 OS가 한다: 에이전트 라이브러리의 sandbox 옵션 (맥 Seatbelt · 리눅스 bwrap · 윈도우 다른 사용자).
 * - 쓰기: 대화의 작업 폴더(cwd)와 임시 폴더만. git 내부의 훅 · 설정, 함께 읽는 폴더(additionalDirectories로 주면 쓰기가 열린다)는 막는다.
 *   작업 폴더가 git worktree면 커밋이 쓰는 저장소 본체의 git 폴더도 연다 (훅 · 설정은 빼고)
 * - 읽기: 앱 설정 폴더(대화 기록 · 계정 · 열쇠), 열쇠 · 로그인 파일은 막는다. 나머지는 열려 있다 (TeX · 파이썬 · 글꼴이 읽는 곳)
 * - 네트워크: 새 호스트마다 앱에 묻는다(canUseTool 'SandboxNetworkAccess' {host}, 판정이 「웹 보기」와 같이 본다)
 * - 판정은 그대로 명령마다 본다(autoAllowBashIfSandboxed: false). 에이전트가 격리를 끄고 돌리는 길은 닫는다
 * 앱 고치기 대화는 아직 넣지 않는다: 화면 그림 서버 · pnpm · gh가 격리 안에서 막힌다 (11/26 시험)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk'
import { isInside } from './fsutil.js'

export const SANDBOX_NET_TOOL = 'SandboxNetworkAccess'

/** 앱이 넣는 격리 설정 (SDK 의 SandboxSettings 꼴, 시험에서 칸을 바로 보려고 고정한 것) */
export type SandboxPlan = SandboxSettings & {
  enabled: true
  filesystem: { allowWrite: string[]; denyWrite: string[]; denyRead: string[] }
}

/** 명령이 볼 수 없게 할 환경 변수 (에이전트 프로세스는 서버의 환경을 물려받는다) */
const SECRET_VARS = ['RW_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'GOOGLE_API_KEY', 'HF_TOKEN']

/**
 * cwd 의 git 폴더들: 보통은 cwd/.git, worktree 면 .git 파일이 가리키는 폴더와 그 본체(commondir). 없으면 빈 값
 */
export function gitDirsOf(cwd: string): { gitDir?: string; commonDir?: string } {
  const dotGit = path.join(cwd, '.git')
  let st: fs.Stats
  try { st = fs.statSync(dotGit) } catch { return {} }
  if (st.isDirectory()) return { gitDir: dotGit, commonDir: dotGit }
  const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'))
  if (!m) return {}
  const gitDir = path.resolve(cwd, m[1]!.trim())
  let commonDir = gitDir
  try { commonDir = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim()) } catch { /* commondir 없음: 그 자체가 본체 */ }
  return { gitDir, commonDir }
}

/** git 설정에 적힌 훅 폴더 (core.hooksPath). 설정 파일을 글로 읽는다: 간단한 꼴만, 못 읽으면 없음 */
function hooksPathOf(commonDir: string, cwd: string): string | undefined {
  let text = ''
  try { text = fs.readFileSync(path.join(commonDir, 'config'), 'utf8') } catch { return undefined }
  let section = ''
  for (const line of text.split('\n')) {
    const head = /^\s*\[([^\]]+)\]/.exec(line)
    if (head) { section = head[1]!.trim().toLowerCase(); continue }
    const kv = /^\s*hookspath\s*=\s*(.+?)\s*$/i.exec(line)
    if (section === 'core' && kv) return path.resolve(cwd, kv[1]!.replace(/^"(.*)"$/, '$1').replace(/^~(?=\/|$)/, os.homedir()))
  }
  return undefined
}

/**
 * 대화 하나의 격리 설정. app(앱 고치기 대화)이거나 RW_AGENT_SANDBOX=0 이면 넣지 않는다(undefined)
 */
export function sandboxFor(o: { cwd: string; readable: string[]; app: boolean; configDir: string; home?: string; env?: NodeJS.ProcessEnv }): SandboxPlan | undefined {
  const env = o.env ?? process.env
  if (o.app || env.RW_AGENT_SANDBOX === '0') return undefined
  const home = o.home ?? os.homedir()
  const { gitDir, commonDir } = gitDirsOf(o.cwd)
  const allowWrite = [...new Set([gitDir, commonDir].filter((d): d is string => !!d && !isUnder(d, o.cwd)))]
  const hooks = commonDir ? [path.join(commonDir, 'hooks'), path.join(commonDir, 'config'), ...(gitDir && gitDir !== commonDir ? [path.join(gitDir, 'config.worktree')] : []), path.join(commonDir, 'config.worktree')] : []
  const custom = commonDir ? hooksPathOf(commonDir, o.cwd) : undefined
  const denyWrite = [...new Set([...hooks, ...(custom ? [custom] : []), ...o.readable.filter((d) => !isUnder(d, o.cwd))])]
  const denyRead = [o.configDir, ...['.ssh', '.gnupg', '.aws', '.config/gh', '.netrc', '.git-credentials', '.docker/config.json', '.kube', '.claude/.credentials.json', '.codex/auth.json', 'Library/Keychains'].map((p) => path.join(home, p))]
    // 작업 폴더가 앱 설정 폴더 안이면(그런 대화는 없어야 하지만) 그 폴더만은 읽게 둔다: 막으면 대화가 아무것도 못 한다
    .filter((d) => !isUnder(o.cwd, d))
  return {
    enabled: true,
    failIfUnavailable: false,
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    filesystem: { allowWrite, denyWrite, denyRead },
    credentials: { envVars: SECRET_VARS.map((name) => ({ name, mode: 'deny' as const })) },
  }
}

/** a 가 b 안(같은 곳 포함)인지 */
const isUnder = (a: string, b: string) => isInside(path.resolve(b), path.resolve(a))
