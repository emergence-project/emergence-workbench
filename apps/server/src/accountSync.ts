/**
 * 계정으로 맞추기 (11/8 사용자 "로그인하는 계정이 같으면 어디서든지 동일한 상태로 확인해야해").
 * 설치판(내려받은 앱)에서 GitHub로 로그인하면, 이 컴퓨터의 작업을 그 계정의 비공개 저장소들에 올리고 다른 컴퓨터에서 받는다.
 *
 * - 계정 저장소(emergence-workbench-home): 앱 설정과 프로젝트 목록. 개인 저장소로 정해 backup.ts가 맞춘다.
 *   없으면 만들고, 있으면(다른 컴퓨터에서 만듦) 그것을 쓴다.
 * - 프로젝트: GitHub 주소가 없는 프로젝트(「새로 만들기」, 로그인 전에 만든 것)는 그 계정에 같은 이름의 비공개 저장소를 만들어
 *   workbench/를 올린다. 그 계정의 저장소인 프로젝트는 workbench/ 전체를 바뀔 때마다 올린다(pathsync.ts: 세 갈래 합치기,
 *   부딪히면 멈추고 알린다). 받기는 저절로 받기(routes/sync.ts, 10분)가 한다.
 * - 라이브러리 · 논문 PDF 폴더: emergence-workbench-library · emergence-workbench-papers. 폴더 전체를 올린다.
 *   95MB가 넘는 파일은 GitHub가 받지 않아 올리지 않고 알린다.
 * - 새 컴퓨터: 처음 한 번 다른 컴퓨터의 프로젝트를 모두 받는다. 라이브러리 · 논문은 GitHub 것을 받고,
 *   이 컴퓨터에만 있던 파일은 그 위에 얹는다. 같은 이름이 다르면 이 컴퓨터 것을 `이름.this-computer-YYYYMMDD.확장자`로 남긴다(잃지 않게).
 *
 * 맥에서 저장소로 돌리는 앱(관리자)은 쓰지 않는다: 그쪽은 연구 저장소마다 사람이 정한 규칙이 있다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { otherMachineProjects } from './backup.js'
import { cloneInto, parseGitHubRepo } from './clone.js'
import { writeAtomic } from './fsutil.js'
import { git as gitAt, gitBuffer, GIT_TIMEOUT } from './git.js'
import type { GithubAccount } from './githubAccount.js'
import { autoPull } from './gitsync.js'
import { t } from './i18n.js'
import { ensureWorkbenchIgnore, publishPaths } from './pathsync.js'
import type { Registry } from './registry.js'
import { WorkbenchError } from './workbench.js'

export const HOME_REPO = 'emergence-workbench-home'
export const LIBRARY_REPO = 'emergence-workbench-library'
export const PAPERS_REPO = 'emergence-workbench-papers'
const MESSAGE = 'Sync from Emergence Workbench'
/** GitHub가 받는 파일 한도(100MB)보다 조금 작게 */
export const BIG_FILE = 95 * 1024 * 1024
/** 논문 PDF처럼 큰 것을 주고받을 때 */
const FAR = { timeout: GIT_TIMEOUT.clone }

export interface AccountSyncView {
  /** 로그인해서 맞추는 중인지 */
  on: boolean
  running: boolean
  /** 마지막으로 끝난 때 */
  at: string | null
  error: string | null
  /** 지난번에 한 일 (처음 올린 것 · 받은 것). 없으면 null */
  note: string | null
  /** 계정 저장소 주소 */
  home: string | null
  /** 너무 커서 올리지 않은 파일 (논문 폴더 기준 경로) */
  skipped: string[]
}

export interface AccountSyncDeps {
  account: GithubAccount
  registry: Registry
  configDir: string
  /** 백업 사본 폴더 (다른 컴퓨터의 프로젝트 목록을 읽는다, backup.ts) */
  backupDir: string
  /** 계정 저장소와 맞추기 (backup.ts: 이 컴퓨터의 프로젝트 목록을 올리고 다른 컴퓨터의 것을 받는다) */
  runBackup: () => Promise<unknown>
  /** 새 컴퓨터에서 프로젝트를 받을 폴더 */
  cloneParent: () => string
  /** 라이브러리 틀 (starter.ts가 복사한 것). 이 컴퓨터의 파일이 틀 그대로면 GitHub 것으로 바꿔도 잃는 것이 없다 */
  libraryTemplate?: string
  remoteOf: (dir: string) => Promise<string | null>
  /** 새로 받아 등록한 프로젝트 (파일 감시 · 화면 알림) */
  registered?: (id: string) => void
  /** 상태가 바뀜 (화면 알림) */
  changed?: () => void
  /** 이 컴퓨터의 이름 (백업 사본에서 다른 컴퓨터의 목록을 가른다. 기본: backup.ts machineName) */
  machine?: string
}

/** git 오류의 첫 줄 (stderr가 있으면 그것, 없으면 메시지) */
function firstLine(e: unknown): string {
  const stderr = e && typeof e === 'object' && 'stderr' in e && typeof e.stderr === 'string' ? e.stderr : ''
  return (stderr || (e instanceof Error ? e.message : String(e))).split('\n').find((l) => l.trim()) ?? 'error'
}
const git = (root: string, args: string[], o: { timeout?: number } = {}) => gitAt(root, args, o)
const ownerOf = (remote: string | null) => (remote ? parseGitHubRepo(remote)?.owner.toLowerCase() ?? null : null)
const stamp = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '')
/** 저장소 이름으로 쓸 수 있는 글자만 (폴더 이름에서) */
export const repoNameOf = (folder: string) => folder.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 90) || 'project'

/** 이 컴퓨터에서 맞춘 기록 (설정 폴더 account-sync.json): 새 컴퓨터의 "모두 받기"는 계정마다 한 번만 */
interface Saved { restored: string[] }
function readSaved(file: string): Saved {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (v && typeof v === 'object' && 'restored' in v && Array.isArray(v.restored)) return { restored: v.restored.filter((x): x is string => typeof x === 'string') }
  } catch { /* 처음 */ }
  return { restored: [] }
}

export class AccountSync {
  private running: Promise<void> | null = null
  private last: { at: string; error: string | null; note: string | null } | null = null
  private skipped: string[] = []
  private pulledAt = 0
  constructor(private readonly d: AccountSyncDeps) {}

  private get savedFile() { return path.join(this.d.configDir, 'account-sync.json') }

  view(): AccountSyncView {
    return {
      on: !!this.d.account.account, running: !!this.running, at: this.last?.at ?? null, error: this.last?.error ?? null, note: this.last?.note ?? null,
      home: this.d.registry.personalRepo ?? null, skipped: this.skipped,
    }
  }

  /** 한 번 맞춘다. 이미 도는 중이면 그것을 기다린다 */
  run(): Promise<void> {
    if (this.running) return this.running
    if (!this.d.account.account) return Promise.resolve()
    this.d.changed?.()
    this.running = this.pass()
      .then(({ notes, errors }) => { this.last = { at: new Date().toISOString(), error: errors.length ? errors.join(' · ') : null, note: notes.length ? notes.join(' · ') : null } })
      .finally(() => { this.running = null; this.d.changed?.() })
    return this.running
  }

  private async pass(): Promise<{ notes: string[]; errors: string[] }> {
    const { account, registry } = this.d
    const login = account.account?.login.toLowerCase()
    const notes: string[] = []
    const errors: string[] = []
    if (!login) return { notes, errors }
    const step = async (what: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { errors.push(`${what}: ${firstLine(e)}`) } }
    const owned = (remote: string | null) => ownerOf(remote) === login

    // 1. 계정 저장소
    let foundHome = false
    await step(t('계정 저장소', 'Account repository'), async () => {
      if (registry.personalRepo) return
      const found = await account.repoUrl(HOME_REPO)
      foundHome = !!found
      const url = found ?? await account.createPrivateRepo(HOME_REPO, 'Emergence Workbench: settings and project list for this account', true)
      registry.setPersonalRepo(url)
      notes.push(found ? t('다른 컴퓨터의 계정 저장소를 찾았습니다', 'Found the account repository from another computer') : t('계정 저장소를 만들었습니다', 'Created the account repository'))
      await this.d.runBackup()
    })

    // 2. 라이브러리 · 논문 폴더
    const lib = registry.libraryPath
    if (lib) await step(t('라이브러리', 'Library'), () => this.folder(lib, LIBRARY_REPO, owned, notes, this.d.libraryTemplate))
    const papers = registry.pdfFolders[0]
    if (papers) await step(t('논문 PDF', 'Paper PDFs'), () => this.folder(papers, PAPERS_REPO, owned, notes))

    // 3. 프로젝트
    let uploaded = 0
    for (const r of registry.list()) {
      await step(r.title, async () => {
        if (!fs.existsSync(r.path)) return
        const remote = await this.d.remoteOf(r.path)
        if (!remote) {
          if (!fs.existsSync(path.join(r.path, 'workbench'))) return
          const url = await this.createUnique(repoNameOf(path.basename(r.path)), `Emergence Workbench project: ${r.title}`)
          await attach(r.path, url, ['workbench'])
          notes.push(t(`계정에 올림: ${r.title}`, `Put on the account: ${r.title}`))
          uploaded++
        } else if (owned(remote)) {
          await publish(r.path, ['workbench'])
        }
      })
    }

    // 4. 새 컴퓨터: 다른 컴퓨터의 프로젝트를 한 번 모두 받는다
    const saved = readSaved(this.savedFile)
    if (!saved.restored.includes(login)) {
      await step(t('다른 컴퓨터의 프로젝트', 'Projects on other computers'), async () => {
        if (!foundHome && !fs.existsSync(path.join(this.d.backupDir, '_settings'))) await this.d.runBackup()
        const got = await this.restore(owned)
        if (got.length) notes.push(t(`다른 컴퓨터의 프로젝트 ${got.length}개를 받았습니다: ${got.join(', ')}`, `Downloaded ${got.length} project(s) from other computers: ${got.join(', ')}`))
        writeAtomic(this.savedFile, JSON.stringify({ restored: [...saved.restored, login] }, null, 2) + '\n')
      })
    }
    // 새로 올린 프로젝트를 다른 컴퓨터가 곧 보게 프로젝트 목록도 바로 올린다
    if (uploaded) await step(t('프로젝트 목록', 'Project list'), async () => { await this.d.runBackup() })

    // 5. 논문 폴더 받기 (프로젝트 · 라이브러리는 routes/sync.ts의 저절로 받기가 한다)
    if (papers && Date.now() - this.pulledAt > 10 * 60_000) {
      this.pulledAt = Date.now()
      await step(t('논문 PDF 받기', 'Paper PDF download'), async () => { if (owned(await this.d.remoteOf(papers))) await autoPull(papers) })
    }
    return { notes, errors }
  }

  /** 같은 이름이 이미 있으면 -2, -3 … (다른 컴퓨터에서 따로 만든 같은 이름의 프로젝트) */
  private async createUnique(name: string, description: string): Promise<string> {
    for (let i = 1; i <= 9; i++) {
      try { return await this.d.account.createPrivateRepo(i === 1 ? name : `${name}-${i}`, description, false) } catch (e) {
        if (!(e instanceof WorkbenchError && e.status === 409)) throw e
      }
    }
    throw new Error(t(`GitHub에 ${name}과 같은 이름이 너무 많습니다`, `Too many repositories named like ${name} on GitHub`))
  }

  /** 라이브러리 · 논문 폴더: 처음이면 올리거나(새 계정) GitHub 것을 받고(새 컴퓨터), 그다음은 바뀔 때마다 올린다 */
  private async folder(dir: string, repo: string, owned: (r: string | null) => boolean, notes: string[], template?: string): Promise<void> {
    if (!fs.existsSync(dir)) return
    const remote = await this.d.remoteOf(dir)
    if (remote) {
      if (!owned(remote)) return
      this.skipped = repo === PAPERS_REPO ? excludeBig(dir) : this.skipped
      await publish(dir, await entries(dir), FAR)
      return
    }
    // 다른 저장소 안에 있는 폴더는 건드리지 않는다 (그 안에 저장소를 또 만들지 않게)
    const top = await git(dir, ['rev-parse', '--show-toplevel']).catch(() => '')
    if (top && fs.realpathSync.native(top) !== fs.realpathSync.native(dir)) return
    const found = await this.d.account.repoUrl(repo)
    // 큰 파일을 빼는 목록(.git/info/exclude)이 git add보다 먼저 있어야 한다
    if (!fs.existsSync(path.join(dir, '.git'))) await git(dir, ['init', '--quiet', '-b', 'main'])
    if (repo === PAPERS_REPO) this.skipped = excludeBig(dir)
    if (found && await adopt(dir, found, template)) {
      notes.push(t(`${repo}을(를) GitHub에서 받았습니다`, `Downloaded ${repo} from GitHub`))
      await publish(dir, await entries(dir), FAR)
      return
    }
    const url = found ?? await this.d.account.createPrivateRepo(repo, 'Emergence Workbench', false)
    await attach(dir, url, null)
    notes.push(t(`${repo}을(를) 계정에 올렸습니다`, `Put ${repo} on the account`))
  }

  /** 다른 컴퓨터들이 올린 목록에서 이 계정의 저장소이고 이 컴퓨터에 없는 프로젝트를 받아 등록한다. 받은 것의 이름 */
  private async restore(owned: (r: string | null) => boolean): Promise<string[]> {
    const { registry } = this.d
    const here = await Promise.all(registry.list().map((r) => this.d.remoteOf(r.path)))
    const same = (a: string | null, b: string | null) => !!a && !!b && parseGitHubRepo(a)?.url.toLowerCase() === parseGitHubRepo(b)?.url.toLowerCase()
    const got: string[] = []
    for (const o of otherMachineProjects(this.d.backupDir, this.d.machine)) {
      if (!o.remote || !owned(o.remote) || here.some((h) => same(h, o.remote))) continue
      const parent = this.d.cloneParent()
      const dest = path.join(parent, path.basename(o.folder) || repoNameOf(o.title))
      if (fs.existsSync(dest)) {
        if (!same(await this.d.remoteOf(dest), o.remote)) continue
      } else {
        fs.mkdirSync(parent, { recursive: true })
        await cloneInto(o.remote, parent, path.basename(dest))
      }
      if (!fs.existsSync(path.join(dest, 'workbench'))) continue
      const id = registry.register(dest, { tags: o.tags }).id
      here.push(o.remote)
      got.push(o.title)
      this.d.registered?.(id)
    }
    return got
  }
}

/** 올릴 경로: 폴더 맨 위의 것과 지난 커밋에 있던 것 (지운 것도 올라가게) */
async function entries(dir: string): Promise<string[]> {
  const disk = fs.readdirSync(dir).filter((n) => n !== '.git')
  const head = (await git(dir, ['ls-tree', '--name-only', 'HEAD']).catch(() => '')).split('\n').filter(Boolean)
  return [...new Set([...disk, ...head])].sort()
}

/** 바뀐 것이 있을 때만 올린다 (GitHub를 2분마다 부르지 않게) */
async function publish(root: string, paths: string[], o: { timeout?: number } = {}): Promise<void> {
  if (!paths.length) return
  if (paths.includes('workbench')) ensureWorkbenchIgnore(root)
  const dirty = !!await git(root, ['status', '--porcelain', '--', ...paths])
  const ahead = Number(await git(root, ['rev-list', '--count', '@{upstream}..HEAD']).catch(() => '0')) > 0
  if (!dirty && !ahead) return
  await publishPaths(root, paths, { message: MESSAGE, adopt: true, merge: true, ...o })
}

/** 아직 GitHub 주소가 없는 폴더를 빈 저장소(url)에 처음 올린다. paths가 null이면 폴더 전체 */
async function attach(root: string, url: string, paths: string[] | null): Promise<void> {
  if (!fs.existsSync(path.join(root, '.git'))) await git(root, ['init', '--quiet', '-b', 'main'])
  const born = await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(() => true, () => false)
  if (!born) await git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  if (paths?.includes('workbench')) ensureWorkbenchIgnore(root)
  await git(root, ['add', '--', ...(paths ?? ['.'])])
  const staged = !!await git(root, ['diff', '--cached', '--name-only'])
  if (staged || !born) await git(root, ['commit', '--quiet', ...(staged ? [] : ['--allow-empty']), '-m', 'Start from Emergence Workbench'])
  await git(root, ['remote', 'add', 'origin', url])
  await git(root, ['push', '--quiet', '-u', 'origin', 'HEAD:refs/heads/main'], FAR)
}

/**
 * 새 컴퓨터: GitHub에 이미 있는 저장소(url)를 이 폴더 그 자리에서 받는다 (폴더를 옮기지 않는다: 윈도우에서 감시 중인 폴더는 옮기지 못한다).
 * GitHub의 파일을 쓰기 전에, 이 컴퓨터에서 고친 같은 이름의 파일은 옆에 남긴다. 이 컴퓨터에만 있는 파일은 그대로 두어 다음 올리기에 올라간다.
 * GitHub 저장소가 비어 있으면 아무것도 하지 않고 false (처음 올리기로)
 */
export async function adopt(dir: string, url: string, template?: string, now = new Date()): Promise<boolean> {
  if (!fs.existsSync(path.join(dir, '.git'))) await git(dir, ['init', '--quiet', '-b', 'main'])
  const hasOrigin = await git(dir, ['remote', 'get-url', 'origin']).then(() => true, () => false)
  if (!hasOrigin) await git(dir, ['remote', 'add', 'origin', url])
  await git(dir, ['fetch', '--quiet', 'origin'], FAR)
  const up = await git(dir, ['rev-parse', '--verify', '--quiet', 'origin/main']).catch(() => '')
  if (!up) { await git(dir, ['remote', 'remove', 'origin']); return false }
  const files = (await git(dir, ['ls-tree', '-r', '-z', '--name-only', up], { timeout: GIT_TIMEOUT.backup })).split('\0').filter(Boolean)
  for (const f of files) {
    const local = path.join(dir, f)
    if (!fs.existsSync(local) || !fs.statSync(local).isFile()) continue
    const mine = fs.readFileSync(local)
    const theirs = await gitBuffer(dir, ['cat-file', 'blob', `${up}:${f}`], { maxBuffer: 256 * 1024 * 1024 })
    if (mine.equals(theirs)) continue
    const fromTemplate = template && fs.existsSync(path.join(template, f)) && fs.readFileSync(path.join(template, f)).equals(mine)
    if (fromTemplate) continue
    const ext = path.extname(f)
    fs.writeFileSync(path.join(dir, `${f.slice(0, f.length - ext.length)}.this-computer-${stamp(now)}${ext}`), mine)
  }
  // HEAD · 색인을 GitHub 것으로 두고(작업 트리는 그대로), GitHub의 파일을 모두 쓴다
  await git(dir, ['reset', '--quiet', '--mixed', up])
  await git(dir, ['checkout-index', '-a', '-f'])
  await git(dir, ['branch', '--quiet', '--set-upstream-to', 'origin/main'])
  return true
}

/** 95MB가 넘는 파일을 .git/info/exclude에 적어 올리지 않는다. 그런 파일 (폴더 기준 경로) */
export function excludeBig(dir: string): string[] {
  const big: string[] = []
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name === '.git') continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(r)
      else if (e.isFile() && fs.statSync(path.join(dir, r)).size > BIG_FILE) big.push(r)
    }
  }
  walk('')
  const file = path.join(dir, '.git', 'info', 'exclude')
  if (fs.existsSync(path.join(dir, '.git'))) {
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    const lines = have.split('\n')
    const add = big.map((b) => `/${b}`).filter((l) => !lines.includes(l))
    if (add.length) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${have}${have && !have.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`) }
  }
  return big
}
