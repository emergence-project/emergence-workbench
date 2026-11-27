/**
 * 연구 · 지식 대화의 OS 격리 (2026-11-27, 설계 docs/specs/2026-11-27-agent-sandbox.md). 명령 판정(agentPolicy)은 명령 글을 읽어 묻고,
 * 판정이 놓친 명령도 폴더 밖을 쓰거나 비밀을 읽지 못하게 하는 벽은 OS가 한다: 에이전트 라이브러리의 sandbox 옵션 (맥 Seatbelt · 리눅스 bwrap · 윈도우 다른 사용자).
 * - 쓰기: 대화의 작업 폴더(cwd)와 임시 폴더만 (읽기 전용 대화는 작업 폴더도 막는다). git 의 훅 · 설정과 git 이 따라가는 자리 파일(commondir · gitdir · .git 파일),
 *   함께 읽는 폴더(additionalDirectories로 주면 쓰기가 열린다)는 막는다. 작업 폴더가 git worktree면 커밋이 쓰는 본체의 objects · refs · logs 만 연다
 * - 읽기: 앱 설정 폴더(대화 기록 · 계정 · 열쇠), 열쇠 · 로그인 파일은 막는다. 나머지는 열려 있다 (TeX · 파이썬 · 글꼴이 읽는 곳)
 * - 네트워크: 새 호스트마다 앱에 묻는다(canUseTool 'SandboxNetworkAccess' {host}, 판정이 「웹 보기」와 같이 본다)
 * - 판정은 그대로 명령마다 본다(autoAllowBashIfSandboxed: false). 에이전트가 격리를 끄고 돌리는 길은 닫는다
 * 앱 고치기 대화와 중앙 대화는 아직 넣지 않는다: 화면 그림 서버 · pnpm · gh가 격리 안에서 막히고(11/26 시험), 중앙은 gh 로 PR 을 다루며
 * 작업 폴더가 앱 설정 폴더 안이나 앱 저장소다 (별도 검토)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk'
import type { RunInput } from './agentRun.js'
import { isInside } from './fsutil.js'
import { git } from './git.js'

export const SANDBOX_NET_TOOL = 'SandboxNetworkAccess'

/** 앱이 넣는 격리 설정 (SDK 의 SandboxSettings 꼴, 시험에서 칸을 바로 보려고 고정한 것) */
export type SandboxPlan = SandboxSettings & {
  enabled: true
  filesystem: { allowWrite: string[]; denyWrite: string[]; denyRead: string[] }
}

/** 명령이 볼 수 없게 할 환경 변수 (에이전트 프로세스는 서버의 환경을 물려받는다) */
const SECRET_VARS = ['RW_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'GOOGLE_API_KEY', 'HF_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']
/** 홈에서 읽기를 막을 곳 (열쇠 · 로그인) */
const HOME_SECRETS = ['.ssh', '.gnupg', '.aws', '.config/gh', '.netrc', '.git-credentials', '.docker/config.json', '.kube', '.claude/.credentials.json', '.codex/auth.json', 'Library/Keychains']

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

/** 있으면 실제 경로 (맥의 /var → /private/var 같은 링크를 푼다: 격리 규칙이 실제 경로와 맞게) */
const real = (p: string) => { try { return fs.realpathSync.native(p) } catch { return path.resolve(p) } }
const ls = (d: string) => { try { return fs.readdirSync(d) } catch { return [] } }

export interface SandboxInput {
  cwd: string
  readable: string[]
  app: boolean
  central: boolean
  /** 읽기 전용 대화면 작업 폴더도 쓰지 못한다 */
  readOnly: boolean
  configDir: string
  /** git 이 실제로 쓰는 훅 폴더 (git rev-parse --git-path hooks). core.hooksPath · include 를 git 이 푼 값 */
  hooksDir?: string
  /** 더한 계정의 CLAUDE_CONFIG_DIR: 명령마다 읽는 셸 스냅숏만 다시 연다 */
  accountDir?: string
  home?: string
  env?: NodeJS.ProcessEnv
}

/**
 * 대화 하나의 격리 설정. 앱 고치기 · 중앙 대화이거나 RW_AGENT_SANDBOX=0 이면 넣지 않는다(undefined)
 */
export function sandboxFor(o: SandboxInput): SandboxPlan | undefined {
  const env = o.env ?? process.env
  if (o.app || o.central || env.RW_AGENT_SANDBOX === '0') return undefined
  const home = o.home ?? os.homedir()
  const cwd = real(o.cwd), configDir = real(o.configDir)
  const { gitDir, commonDir } = gitDirsOf(cwd)
  const worktree = !!gitDir && !!commonDir && gitDir !== commonDir
  // worktree: 커밋은 제 git 폴더와 본체의 objects · refs · logs 에 쓴다 (본체의 index · HEAD · 다른 worktree 는 열지 않는다)
  const allowWrite = o.readOnly || !worktree ? [] : [gitDir!, ...['objects', 'refs', 'logs'].map((d) => path.join(commonDir!, d))]
  const git = commonDir ? [
    ...['hooks', 'config', 'config.worktree', 'commondir', 'modules', 'info'].map((d) => path.join(commonDir, d)),
    // 다른 worktree 의 자리 파일 (그 worktree 에서 돌 git 을 다른 설정으로 돌릴 수 있다)
    ...ls(path.join(commonDir, 'worktrees')).map((w) => path.join(commonDir, 'worktrees', w)).filter((w) => w !== gitDir),
    // worktree: 라이브러리(CLI)가 본체의 git 폴더를 통째로 열어 두므로(11/27 시험), 본체 작업 폴더의 HEAD · index 도 막는다
    ...(worktree ? ['commondir', 'gitdir', 'config.worktree'].map((f) => path.join(gitDir!, f)).concat(path.join(cwd, '.git'), path.join(commonDir, 'HEAD'), path.join(commonDir, 'index')) : []),
  ] : []
  // husky 는 .husky/_ 의 훅이 .husky/<이름> 을 돌린다: 그 위 폴더까지
  const hooks = o.hooksDir ? [real(o.hooksDir), ...(path.basename(o.hooksDir) === '_' ? [real(path.dirname(o.hooksDir))] : [])] : []
  const denyWrite = [...new Set([...(o.readOnly ? [cwd] : []), ...git, ...hooks, ...o.readable.map(real).filter((d) => !isUnder(d, cwd))])]
  // 작업 폴더가 앱 설정 폴더 안이면(그런 대화는 없어야 하지만) 그 폴더를 품은 칸만 빼고 나머지 칸을 막는다
  const config = isUnder(cwd, configDir) ? ls(configDir).map((n) => path.join(configDir, n)).filter((d) => !isUnder(cwd, d)) : [configDir]
  const denyRead = [...config, ...HOME_SECRETS.map((p) => path.join(home, p))]
  const account = o.accountDir && real(o.accountDir)
  const allowRead = account ? ['shell-snapshots', 'session-env'].map((d) => path.join(account, d)) : []
  return {
    enabled: true,
    failIfUnavailable: false,
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    filesystem: { allowWrite, denyWrite, denyRead, ...(allowRead.length && { allowRead }) },
    credentials: { envVars: SECRET_VARS.map((name) => ({ name, mode: 'deny' as const })) },
  }
}

/** a 가 b 안(같은 곳 포함)인지 */
const isUnder = (a: string, b: string) => isInside(path.resolve(b), path.resolve(a))

/** 실행기가 부르는 것: git 에게 실제 훅 폴더를 묻고(include · 홈 설정의 hooksPath 까지 git 이 푼다), 대화의 계정 폴더 · 읽기 전용을 넘긴다 */
export async function sandboxForRun(input: Pick<RunInput, 'cwd' | 'extraDirs' | 'appChat' | 'central' | 'write' | 'env'>, configDir: string): Promise<SandboxPlan | undefined> {
  if (input.appChat || input.central) return undefined
  const hooksDir = await git(input.cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']).catch(() => '')
  return sandboxFor({ cwd: input.cwd, readable: input.extraDirs, app: false, central: false, readOnly: input.write === 'read', configDir, ...(hooksDir && { hooksDir }), ...(input.env?.CLAUDE_CONFIG_DIR && { accountDir: input.env.CLAUDE_CONFIG_DIR }) })
}
