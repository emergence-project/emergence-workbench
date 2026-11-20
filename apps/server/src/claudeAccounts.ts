/**
 * Claude 계정 여럿 (11/16 사용자 "pro 계정을 주로 답변용으로" · "로그인 정보를 담아두고 쉽게 로그인 · 계정 전환").
 *
 * - 「이 컴퓨터」 = 이 컴퓨터의 Claude Code에 로그인한 계정 (터미널의 claude와 같다). 건드리지 않는다.
 * - 기본 계정(base, 11/16 사용자 "기본으로 설정하는 계정은 별도 설정"): 고르지 않은 대화 종류와 그 밖의 Claude 일(claudeEnv)이 쓴다. 처음엔 이 컴퓨터.
 * - 더한 계정은 설정 폴더의 claude-accounts/<id>/를 CLAUDE_CONFIG_DIR로 쓴다. Claude Code가 그 폴더(맥은 키체인, 폴더마다 따로)에
 *   로그인 정보를 두고 스스로 갱신하므로, 계정마다 한 번만 로그인한다. 앱은 비밀번호 · 토큰을 읽거나 저장하지 않는다.
 * - 로그인: `claude auth login`을 그 폴더로 띄운다. 브라우저가 열리고, 맥에서 저절로 끝나지 않으면 브라우저가 준 코드를 화면에 붙여 넣는다(그대로 넘긴다).
 * - 대화 종류(중앙 · 피드백 · 앱 고치기 · 프로젝트)마다 계정을 고른다(claude-accounts.json). 대화마다 바꿀 수도 있다(agentChats settings).
 *   바꾸면 그 대화의 세션 파일을 새 계정 폴더로 옮겨 적어 앞 내용을 이어 간다(moveSession).
 * - 한도가 차도 다른 계정으로 저절로 넘어가지 않는다: 그 차례가 오류로 멈추고 이유가 보인다.
 * - Codex도 같은 방식 (11/20 시안 4절): codex-accounts/<id>/를 CODEX_HOME으로, 로그인은 `codex login`(브라우저에서 끝남, 코드 없음).
 *   대화를 다른 계정으로 옮기면 그 세션의 rollout 파일을 새 폴더로 복사한다. 처음 더할 때 이 컴퓨터의 config.toml(모델 등 설정)을 복사해 둔다.
 * - 계정 줄마다 5시간 · 이번 주 한도 (agentLimits.ts): 그 에이전트가 남긴 마지막 사용 정보. 못 읽으면 없음.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ACCOUNT_ROLES, DEFAULT_ACCOUNT, type AccountRole, type ClaudeAccountRow, type ClaudeAccounts as State } from '@rw/core/contract/claudeAccounts'
import { claudeAccount, codexAccount, type Account } from './agentAccounts.js'
import { claudeLimits, codexLimits, type Limits } from './agentLimits.js'
import { claudeEnv, claudeExecutable, setClaudeBaseDir } from './ask.js'
import { codexBin } from './codexCli.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

interface Saved { accounts: { id: string; name: string }[]; roles: Partial<Record<AccountRole, string>>; base?: string }

/** 로그인 명령에 쓸 claude: 이 컴퓨터에 깐 것, 없으면 Agent SDK에 든 것 */
export function claudeCli(resolve: (id: string) => string = createRequire(import.meta.url).resolve): string | undefined {
  const own = claudeExecutable(resolve)
  if (own) return own
  try {
    const pkg = resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)
    const bin = path.join(path.dirname(pkg), process.platform === 'win32' ? 'claude.exe' : 'claude')
    return fs.existsSync(bin) ? bin : undefined
  } catch { return undefined }
}

/** 기본 계정의 설정 폴더 (세션 파일이 있는 곳) */
export const defaultClaudeDir = (home = os.homedir()) => process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')

/** 세션 파일(projects/<폴더>/<세션>.jsonl과 같은 이름의 폴더)을 다른 계정 폴더로 복사한다. 못 찾으면 false (새 세션으로 시작) */
export function moveSession(fromDir: string, toDir: string, sessionId: string): boolean {
  if (!/^[\w-]+$/.test(sessionId) || path.resolve(fromDir) === path.resolve(toDir)) return path.resolve(fromDir) === path.resolve(toDir)
  const root = path.join(fromDir, 'projects')
  let subs: string[] = []
  try { subs = fs.readdirSync(root) } catch { return false }
  for (const sub of subs) {
    const file = path.join(root, sub, `${sessionId}.jsonl`)
    if (!fs.existsSync(file)) continue
    const to = path.join(toDir, 'projects', sub)
    fs.mkdirSync(to, { recursive: true })
    fs.copyFileSync(file, path.join(to, `${sessionId}.jsonl`))
    const side = path.join(root, sub, sessionId)
    if (fs.existsSync(side)) fs.cpSync(side, path.join(to, sessionId), { recursive: true })
    return true
  }
  return false
}

/** Codex 세션(sessions/연/월/일/rollout-…-<세션>.jsonl)을 다른 계정 폴더의 같은 자리로 복사한다. 못 찾으면 false */
export function moveCodexSession(fromDir: string, toDir: string, sessionId: string): boolean {
  if (path.resolve(fromDir) === path.resolve(toDir)) return true
  if (!/^[\w-]+$/.test(sessionId)) return false
  const root = path.join(fromDir, 'sessions')
  const walk = (rel: string): string | undefined => {
    let names: fs.Dirent[] = []
    try { names = fs.readdirSync(path.join(root, rel), { withFileTypes: true }) } catch { return undefined }
    for (const n of names) {
      const r = path.join(rel, n.name)
      if (n.isDirectory()) { const got = walk(r); if (got) return got }
      else if (n.name.endsWith(`${sessionId}.jsonl`)) return r
    }
    return undefined
  }
  const rel = walk('')
  if (!rel) return false
  fs.mkdirSync(path.dirname(path.join(toDir, 'sessions', rel)), { recursive: true })
  fs.copyFileSync(path.join(root, rel), path.join(toDir, 'sessions', rel))
  return true
}

/** 에이전트마다 다른 것: 저장 파일 · 계정 폴더 · 환경 변수 · 계정 읽기 · 로그인 명령 · 세션 옮기기 · 한도 */
export type AccountKind = 'claude' | 'codex'
interface KindSpec {
  name: string; file: string; folder: string; envVar: 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME'
  defaultDir(home?: string): string
  read(home: string, dir: string | undefined): Account
  login: string[]; logout: string[]
  move(from: string, to: string, sessionId: string): boolean
  limits(dir: string): Limits | undefined
}
const codexDefaultDir = (home = os.homedir()) => process.env.CODEX_HOME || path.join(home, '.codex')
const KINDS: Record<AccountKind, KindSpec> = {
  claude: { name: 'Claude Code', file: 'claude-accounts.json', folder: 'claude-accounts', envVar: 'CLAUDE_CONFIG_DIR', defaultDir: (h) => defaultClaudeDir(h), read: (h, d) => claudeAccount(h, d), login: ['auth', 'login', '--claudeai'], logout: ['auth', 'logout'], move: moveSession, limits: claudeLimits },
  codex: { name: 'Codex', file: 'codex-accounts.json', folder: 'codex-accounts', envVar: 'CODEX_HOME', defaultDir: codexDefaultDir, read: (h, d) => codexAccount(h, d ?? codexDefaultDir(h)), login: ['login'], logout: ['logout'], move: moveCodexSession, limits: codexLimits },
}

/** 로그인 출력에서 브라우저 주소 */
export const loginUrl = (out: string) => out.match(/https:\/\/\S+oauth\S*/)?.[0]

export class ClaudeAccounts {
  private signing = new Map<string, { proc: ChildProcess; url?: string; error?: string }>()
  readonly kind: AccountKind
  private spec: KindSpec
  constructor(private configDir: string, private opts: { cli?: () => string | undefined; home?: string; global?: boolean; kind?: AccountKind } = {}) {
    this.kind = opts.kind ?? 'claude'
    this.spec = KINDS[this.kind]
    // 그 밖의 Claude 일(제목 짓기 · 묻기 등)도 기본 계정으로 (claudeEnv)
    if (opts.global && this.kind === 'claude') setClaudeBaseDir(() => this.dirOf(this.read().base))
  }

  private get file() { return path.join(this.configDir, this.spec.file) }
  private read(): Saved {
    let v: unknown
    try { v = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { return { accounts: [], roles: {} } }
    const o = v && typeof v === 'object' ? Object.fromEntries(Object.entries(v)) : {}
    const accounts = (Array.isArray(o.accounts) ? o.accounts : []).flatMap((a: unknown) => {
      const x = a && typeof a === 'object' ? Object.fromEntries(Object.entries(a)) : {}
      return typeof x.id === 'string' && /^a[0-9a-f]{6}$/.test(x.id) && typeof x.name === 'string' ? [{ id: x.id, name: x.name }] : []
    })
    const r = o.roles && typeof o.roles === 'object' ? Object.fromEntries(Object.entries(o.roles)) : {}
    const roles: Saved['roles'] = {}
    for (const k of ACCOUNT_ROLES) if (typeof r[k] === 'string') roles[k] = r[k]
    return { accounts, roles, ...(typeof o.base === 'string' && { base: o.base }) }
  }
  private save(v: Saved) {
    fs.mkdirSync(this.configDir, { recursive: true })
    fs.writeFileSync(this.file, `${JSON.stringify(v, null, 2)}\n`)
  }
  private cli() { return this.opts.cli ? this.opts.cli() : this.kind === 'codex' ? codexBin(this.configDir) : claudeCli() }
  private get home() { return this.opts.home ?? os.homedir() }

  /** 더한 계정의 폴더 (기본 계정 · 모르는 id면 undefined) */
  dirOf(id: string | undefined): string | undefined {
    if (!id || id === DEFAULT_ACCOUNT || !this.read().accounts.some((a) => a.id === id)) return undefined
    return path.join(this.configDir, this.spec.folder, id)
  }

  /** 에이전트 프로세스에 더할 환경. 이 컴퓨터 계정이면 기본 계정이 다른 계정이어도 이 컴퓨터 폴더로 못 박는다 */
  env(id: string | undefined): Record<string, string> {
    const dir = this.dirOf(id)
    if (dir) return { [this.spec.envVar]: dir }
    return this.base() ? { [this.spec.envVar]: this.spec.defaultDir(this.opts.home) } : {}
  }

  /** 기본 계정 (이 컴퓨터면 undefined). 고른 계정이 지워졌으면 이 컴퓨터 */
  base(): string | undefined {
    const id = this.read().base
    return this.dirOf(id) ? id : undefined
  }

  /** 그 대화 종류가 쓸 계정 id (이 컴퓨터면 undefined). 고르지 않았으면 기본 계정, 고른 계정이 지워졌으면 이 컴퓨터 */
  forRole(role: AccountRole): string | undefined {
    const v = this.read()
    const id = v.roles[role] ?? v.base
    return this.dirOf(id) ? id : undefined
  }

  /** 대화의 계정을 바꿀 때: 세션 파일을 새 계정 폴더로 복사한다. false면 앞 세션을 잇지 못함 */
  carry(from: string | undefined, to: string | undefined, sessionId: string): boolean {
    const dir = (id: string | undefined) => this.dirOf(id) ?? this.spec.defaultDir(this.opts.home)
    return this.spec.move(dir(from), dir(to), sessionId)
  }

  state(): State {
    const v = this.read()
    const row = (id: string, name: string, dir: string | undefined): ClaudeAccountRow => {
      const a = this.spec.read(this.home, dir)
      const s = this.signing.get(id)
      const limits = a.email ? this.spec.limits(dir ?? this.spec.defaultDir(this.opts.home)) : undefined
      return { id, name, ...a, login: !!a.email, ...(limits && { limits }), ...(s && { signing: { ...(s.url && { url: s.url }), ...(s.error && { error: s.error }) } }) }
    }
    return {
      kind: this.kind,
      accounts: [row(DEFAULT_ACCOUNT, t('이 컴퓨터', 'This computer'), undefined), ...v.accounts.map((a) => row(a.id, a.name, this.dirOf(a.id)))],
      base: this.base() ?? DEFAULT_ACCOUNT,
      roles: Object.fromEntries(ACCOUNT_ROLES.map((r) => [r, this.forRole(r) ?? DEFAULT_ACCOUNT])),
      cli: !!this.cli(),
    }
  }

  /** 계정을 더하고 로그인을 시작한다. 처음 더한 계정은 중앙 · 피드백 답변에 쓴다 (11/16 사용자 선택) */
  add(name: string): State {
    if (!this.cli()) throw new WorkbenchError(409, t(`이 컴퓨터에 ${this.spec.name}가 없어 계정을 더하지 못합니다`, `${this.spec.name} is not on this computer, so an account cannot be added`))
    const v = this.read()
    const id = `a${crypto.randomBytes(3).toString('hex')}`
    v.accounts.push({ id, name: name.trim() })
    if (v.accounts.length === 1) { v.roles.central ??= id; v.roles.feedback ??= id }
    this.save(v)
    // Codex: 이 컴퓨터의 설정(모델 · 생각 깊이 등)을 새 계정 폴더에도 (로그인 정보 auth.json은 복사하지 않는다)
    const toml = path.join(this.spec.defaultDir(this.opts.home), 'config.toml')
    if (this.kind === 'codex' && fs.existsSync(toml)) { fs.mkdirSync(this.dirOf(id)!, { recursive: true }); fs.copyFileSync(toml, path.join(this.dirOf(id)!, 'config.toml')) }
    return this.login(id)
  }

  /** 그 계정 폴더로 `claude auth login`을 띄운다 (브라우저가 열린다). 기본 계정은 터미널에서 */
  login(id: string): State {
    const dir = this.dirOf(id)
    if (!dir) throw new WorkbenchError(400, this.kind === 'codex' ? t('기본 계정은 「이 컴퓨터」 줄의 「다른 계정으로」에서 바꿉니다', 'Switch the default account with "Switch account" in the "This computer" row') : t('기본 계정은 터미널에서 claude → /login으로 바꿉니다', 'Switch the default account with claude → /login in the terminal'))
    const cli = this.cli()
    if (!cli) throw new WorkbenchError(409, t(`이 컴퓨터에 ${this.spec.name}가 없습니다`, `${this.spec.name} is not on this computer`))
    this.signing.get(id)?.proc.kill()
    fs.mkdirSync(dir, { recursive: true })
    const proc = spawn(cli, this.spec.login, { env: { ...claudeEnv(), [this.spec.envVar]: dir }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const s: { proc: ChildProcess; url?: string; error?: string } = { proc }
    this.signing.set(id, s)
    let out = ''
    const take = (b: Buffer) => { out += b.toString(); s.url ??= loginUrl(out) }
    proc.stdout?.on('data', take)
    proc.stderr?.on('data', take)
    proc.on('error', (e) => { s.error = e.message })
    proc.on('close', (code) => {
      if (this.signing.get(id) !== s) return
      if (code === 0 || this.spec.read(this.home, dir).email) this.signing.delete(id)
      else s.error = out.trim().split('\n').at(-1)?.slice(0, 300) || t('로그인하지 못했습니다', 'Sign-in failed')
    })
    // 10분 안에 끝나지 않으면 닫는다
    setTimeout(() => { if (this.signing.get(id) === s && proc.exitCode === null) { proc.kill(); s.error = t('10분 안에 로그인하지 않아 닫았습니다', 'Closed after 10 minutes without sign-in') } }, 10 * 60_000).unref()
    return this.state()
  }

  /** 브라우저가 준 코드를 로그인 중인 claude에 넘긴다 */
  code(id: string, code: string): State {
    const s = this.signing.get(id)
    if (!s || s.proc.exitCode !== null || !s.proc.stdin) throw new WorkbenchError(409, t('로그인 중이 아닙니다. 「로그인」을 다시 누르세요', 'Not signing in. Press Sign in again'))
    s.proc.stdin.write(`${code.trim()}\n`)
    return this.state()
  }

  /** 대화 종류의 계정 · 기본 계정(base)을 고른다. 대화 종류는 고른 값을 그대로 적는다(이 컴퓨터도: 기본 계정을 따르지 않게) */
  setRole(role: AccountRole | 'base', id: string): State {
    const v = this.read()
    if (id !== DEFAULT_ACCOUNT && !v.accounts.some((a) => a.id === id)) throw new WorkbenchError(404, t('없는 계정입니다', 'No such account'))
    if (role === 'base') {
      if (id === DEFAULT_ACCOUNT) delete v.base
      else v.base = id
    } else v.roles[role] = id
    this.save(v)
    return this.state()
  }

  /** 계정을 뺀다: 로그아웃하고 그 폴더를 지운다. 그 계정을 쓰던 대화 종류는 기본 계정으로, 기본 계정이었으면 이 컴퓨터로 */
  remove(id: string): State {
    const dir = this.dirOf(id)
    if (!dir) throw new WorkbenchError(400, t('기본 계정은 빼지 않습니다', 'The default account cannot be removed'))
    this.signing.get(id)?.proc.kill()
    this.signing.delete(id)
    const cli = this.cli()
    if (cli) spawnSync(cli, this.spec.logout, { env: { ...claudeEnv(), [this.spec.envVar]: dir }, timeout: 15_000, windowsHide: true })
    fs.rmSync(dir, { recursive: true, force: true })
    const v = this.read()
    v.accounts = v.accounts.filter((a) => a.id !== id)
    for (const r of ACCOUNT_ROLES) if (v.roles[r] === id) delete v.roles[r]
    if (v.base === id) delete v.base
    this.save(v)
    return this.state()
  }

  stopAll(): void { for (const s of this.signing.values()) s.proc.kill() }
}

/** 에이전트마다 계정 목록 (Claude · Codex). 대화의 에이전트로 고른다 */
export interface AccountBook { claude?: ClaudeAccounts; codex?: ClaudeAccounts }
const bookFor = (book: AccountBook | undefined, agent: string) => (agent === 'claude-code' ? book?.claude : agent === 'codex' ? book?.codex : undefined)

/** 대화의 에이전트 프로세스에 더할 환경 (계정 폴더) */
export const accountEnv = (book: AccountBook | undefined, c: { agent: string; account?: string }): Record<string, string> => bookFor(book, c.agent)?.env(c.account) ?? {}

/** 새 대화의 계정: 고른 것, 아니면 대화 종류의 계정 (Claude · Codex 대화만, 기본이면 undefined) */
export function accountForNew(book: AccountBook | undefined, o: { rid: string; agent: string; feedback?: string; account?: string; app: boolean; central: boolean }): string | undefined {
  const accounts = bookFor(book, o.agent)
  if (!accounts) return undefined
  if (o.account) return accounts.dirOf(o.account) ? o.account : undefined
  return accounts.forRole(o.feedback ? 'feedback' : o.app ? 'app' : o.central ? 'central' : 'project')
}

/** 대화의 계정을 바꾼다: 일하는 중이면 막고, 세션을 새 계정 폴더로 옮긴다(못 옮기면 새 세션). 다음 차례에 새 계정으로 다시 연다(keyOf) */
export function switchAccount(c: { account?: string; sessionId?: string; agent: string; state: string }, id: string, book: AccountBook | undefined): void {
  const accounts = bookFor(book, c.agent)
  const to = !accounts || id === DEFAULT_ACCOUNT ? undefined : accounts.dirOf(id) ? id : undefined
  if (id !== DEFAULT_ACCOUNT && !to) throw new WorkbenchError(404, t('없는 계정입니다', 'No such account'))
  if (to === c.account) return
  if (c.agent !== 'claude-code' && c.agent !== 'codex') throw new WorkbenchError(400, t('Claude · Codex 대화만 계정을 고릅니다', 'Only Claude and Codex conversations pick an account'))
  if (c.state === 'running' || c.state === 'queued') throw new WorkbenchError(409, t('일하는 중에는 계정을 바꾸지 않습니다. 이 차례가 끝난 뒤 바꾸세요', 'Not while working; switch after this turn ends'))
  if (c.sessionId && !accounts?.carry(c.account, to, c.sessionId)) delete c.sessionId
  if (to) c.account = to
  else delete c.account
}
