import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { BackupResult } from '@rw/core/contract/backup'
import { writeAtomic } from './fsutil'
import { t } from './i18n.js'

const exec = promisify(execFile)

/**
 * 맥에만 있던 작업대 정보(workbench/)와 앱 설정을 비공개 저장소 research-workspace-backup에 두고, 그것을 정본으로 맞춘다
 * (10/4 첫 결정은 한쪽으로 올리는 백업, 10/4 16:2x 사용자 답 "예"로 GitHub가 정본).
 *
 * - 대상: 연구 저장소 git이 workbench/를 하나도 추적하지 않는 연구. 연구 저장소의 git은 읽기만 한다.
 * - 앱 설정은 설정 폴더의 config.yaml 하나만. 구글 열쇠(google-token.json, google.yaml), 색인(index/), 빌드(library-build/)는 올리지 않는다.
 * - 저장소 안에서는 <연구 id>/workbench/, _settings/config.yaml 에 둔다.
 * - 양쪽 맞추기: 지난번 맞춘 상태(설정 폴더 사본의 refs/rw/synced)와 비교해
 *   맥에서만 바뀐 파일은 올리고, GitHub에서만 바뀐 파일은 맥으로 받는다.
 *   양쪽이 다르게 바뀌었으면 맥 것을 두고 GitHub 것은 옆에 `이름.github-YYYYMMDD.확장자`로 받아 둔다(잃지 않게).
 *   지난번 기록이 없으면(첫 맞추기) 맥에 없는 파일만 받고, 나머지는 맥 것을 올린다.
 * - 컴파일 결과(.build/)는 다시 만들 수 있어서 뺀다.
 */
export interface BackupTarget { id: string; path: string }

export type { BackupResult } from '@rw/core/contract/backup'

const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
const firstLine = (e: unknown) => String((e as { stderr?: string }).stderr || (e as Error).message || e).split('\n').find((l) => l.trim()) ?? t('알 수 없는 오류', 'Unknown error')
async function git(cwd: string, args: string[]): Promise<string> {
  return (await exec('git', ['-C', cwd, ...args], { timeout: 120_000, env, maxBuffer: 64 * 1024 * 1024 })).stdout.trim()
}
async function blob(cwd: string, sha: string): Promise<Buffer> {
  return (await exec('git', ['-C', cwd, 'cat-file', 'blob', sha], { timeout: 120_000, env, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 })).stdout
}

/** 이 연구의 workbench/가 연구 저장소에 올라가 있는지 (하나라도 추적하면 true) */
export async function workbenchTracked(repoPath: string): Promise<boolean> {
  try { return (await git(repoPath, ['ls-files', '--', 'workbench'])).length > 0 } catch { return false }
}

/**
 * 옛 앱 저장소(research-workspace)의 origin 주소에서 같은 계정의 research-workspace-backup 주소를 만든다.
 * 공개 저장소(emergence-workbench)에서는 짐작하지 않는다: 받은 사람마다 개인 저장소가 다르다(personalRepo.ts).
 */
export function backupRemoteFor(appOrigin: string): string | null {
  const m = /^(.*[/:])([^/:]+)\/research-workspace(?:\.git)?\/?$/.exec(appOrigin.trim())
  return m ? `${m[1]}${m[2]}/research-workspace-backup.git` : null
}

const SYNCED = 'refs/rw/synced'
const SETTINGS = '_settings/config.yaml'
const SKIP = new Set(['.build', '.DS_Store'])

/** ref 아래 prefix/의 파일 → blob 해시 */
async function treeMap(dir: string, ref: string | null, prefix: string): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (!ref) return m
  const out = await git(dir, ['ls-tree', '-r', '-z', ref, '--', prefix]).catch(() => '')
  for (const line of out.split('\0')) {
    const t = line.indexOf('\t')
    if (t < 0) continue
    const [, type, sha] = line.slice(0, t).split(' ')
    if (type === 'blob') m.set(line.slice(t + 1), sha!)
  }
  return m
}

function walk(root: string, rel = ''): string[] {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    if (SKIP.has(d.name)) return []
    const r = rel ? `${rel}/${d.name}` : d.name
    return d.isDirectory() ? walk(root, r) : d.isFile() ? [r] : []
  })
}

/** 맥의 파일들(저장소 안 이름 → 실제 경로)의 blob 해시 */
async function localMap(dir: string, files: Map<string, string>): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const keys = [...files.keys()]
  if (!keys.length) return m
  const out = await new Promise<string>((resolve, reject) => {
    const p = execFile('git', ['-C', dir, 'hash-object', '--stdin-paths'], { env, maxBuffer: 64 * 1024 * 1024 }, (e, so) => (e ? reject(e) : resolve(so)))
    p.stdin!.end(keys.map((k) => files.get(k)!).join('\n') + '\n')
  })
  out.trim().split('\n').forEach((sha, i) => m.set(keys[i]!, sha))
  return m
}

/** 지금 맥에 있는 파일의 blob 해시 (git hash-object와 같은 값). 없으면 undefined */
function currentBlob(abs: string): string | undefined {
  let buf: Buffer
  try { buf = fs.readFileSync(abs) } catch { return undefined }
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')
}

function conflictName(abs: string, now: Date): string {
  const ext = path.extname(abs)
  const day = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `${abs.slice(0, abs.length - ext.length)}.github-${day}${ext}`
}

export async function backupWorkbenches(opts: {
  dir: string; remote: string; targets: BackupTarget[]; settings?: string; now?: Date
  /** 테스트용: GitHub 것을 맥에 쓰기 바로 전에 부른다 (그 사이 다른 쪽이 고친 경우를 흉내 낸다) */
  beforeWrite?: (abs: string) => void
}): Promise<BackupResult> {
  const now = opts.now ?? new Date()
  const at = now.toISOString()
  const empty = { pulled: [], conflicts: [], settingsPulled: false }
  const fail = (error: string): BackupResult => ({ at, projects: [], commit: null, pushed: false, ...empty, message: t(`맞추지 못했습니다 — ${error}`, `Could not sync: ${error}`), error })
  const candidates: BackupTarget[] = []
  for (const t of opts.targets) {
    if (fs.existsSync(t.path) && !(await workbenchTracked(t.path))) candidates.push(t)
  }
  if (!candidates.length && !opts.settings) return { at, projects: [], commit: null, pushed: false, ...empty, message: t('맞출 연구가 없습니다 (모두 연구 저장소에 올라가 있음)', 'No projects to sync (all are pushed to their own repositories)') }

  let remoteRef: string | null = null
  let baseRef: string | null = null
  try {
    if (!fs.existsSync(path.join(opts.dir, '.git'))) {
      fs.rmSync(opts.dir, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(opts.dir), { recursive: true })
      await exec('git', ['clone', '--quiet', opts.remote, opts.dir], { timeout: 120_000, env })
    }
    await git(opts.dir, ['fetch', '--quiet', 'origin'])
    remoteRef = await git(opts.dir, ['rev-parse', '--verify', '--quiet', 'origin/main']).catch(() => null)
    baseRef = await git(opts.dir, ['rev-parse', '--verify', '--quiet', SYNCED]).catch(() => null)
    if (remoteRef) await git(opts.dir, ['checkout', '--quiet', '-B', 'main', 'origin/main'])
    else await git(opts.dir, ['checkout', '--quiet', '-B', 'main']).catch(() => undefined)
  } catch (e) {
    return fail(t(`백업 저장소(${opts.remote})를 받지 못했습니다: ${firstLine(e)}`, `Could not pull the backup repository (${opts.remote}): ${firstLine(e)}`))
  }

  const pulled: string[] = []
  const conflicts: string[] = []
  let settingsPulled = false
  /** 저장소 안 이름 → 맥의 실제 경로. prefix 하나(연구 하나 또는 설정)를 세 갈래로 맞춘다 */
  const merge = async (prefix: string, files: Map<string, string>, toAbs: (repoPath: string) => string): Promise<void> => {
    const [B, R, L] = await Promise.all([treeMap(opts.dir, baseRef, prefix), treeMap(opts.dir, remoteRef, prefix), localMap(opts.dir, files)])
    for (const p of new Set([...B.keys(), ...R.keys(), ...L.keys()])) {
      const b = B.get(p), r = R.get(p), l = L.get(p)
      if (l === r) continue
      const abs = files.get(p) ?? toAbs(p)
      const keepAside = async () => {
        if (r) writeAtomic(conflictName(abs, now), await blob(opts.dir, r))
        conflicts.push(p)
      }
      const take = async () => {
        const content = r ? await blob(opts.dir, r) : null
        opts.beforeWrite?.(abs)
        // 비교한 뒤 맥에서(에이전트가) 다시 고쳤으면 덮어쓰거나 지우지 않는다: 맥 것을 두고 GitHub 것은 옆에 받아 둔다
        if (currentBlob(abs) !== l) { await keepAside(); return }
        if (content) writeAtomic(abs, content); else fs.rmSync(abs, { force: true })
        pulled.push(p)
      }
      if (!baseRef) { if (!l && r) await take(); continue } // 첫 맞추기: 맥에 없는 것만 받는다
      if (l === b) { await take(); continue } // GitHub에서만 바뀜
      if (r === b) continue // 맥에서만 바뀜: 아래에서 올린다
      if (r && l) {
        await keepAside()
      } else if (r && !l) { await take() } // 맥에서 지웠는데 GitHub에서 고침: 고친 것을 살린다
      // 맥에서 고쳤는데 GitHub에서 지움: 맥 것을 올린다
    }
  }

  const projects: string[] = []
  for (const t of candidates) {
    const prefix = `${t.id}/workbench`
    const wb = path.join(t.path, 'workbench')
    const hasRemote = (await treeMap(opts.dir, remoteRef, prefix)).size > 0
    if (!fs.existsSync(wb) && !hasRemote) continue
    projects.push(t.id)
    const files = new Map(walk(wb).map((r) => [`${prefix}/${r}`, path.join(wb, r)]))
    try { await merge(prefix, files, (p) => path.join(wb, p.slice(prefix.length + 1))) } catch (e) { return fail(`${t.id}: ${firstLine(e)}`) }
  }
  if (opts.settings) {
    const s = opts.settings
    try {
      const before = pulled.length
      await merge(SETTINGS, new Map(fs.existsSync(s) ? [[SETTINGS, s]] : []), () => s)
      settingsPulled = pulled.length > before
    } catch (e) { return fail(t(`앱 설정: ${firstLine(e)}`, `App settings: ${firstLine(e)}`)) }
  }

  // 맥(맞춘 뒤)의 내용을 사본에 그대로 옮겨 올린다
  for (const id of projects) {
    const to = path.join(opts.dir, id, 'workbench')
    const from = candidates.find((t) => t.id === id)!.path
    fs.rmSync(to, { recursive: true, force: true })
    if (fs.existsSync(path.join(from, 'workbench'))) fs.cpSync(path.join(from, 'workbench'), to, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) })
  }
  const paths = [...projects]
  if (opts.settings && fs.existsSync(opts.settings)) {
    fs.mkdirSync(path.join(opts.dir, '_settings'), { recursive: true })
    fs.copyFileSync(opts.settings, path.join(opts.dir, SETTINGS))
    paths.push('_settings')
  }
  const extra = { pulled, conflicts, settingsPulled }
  const what = [pulled.length && t(`GitHub에서 ${pulled.length}개 받음`, `pulled ${pulled.length} from GitHub`), conflicts.length && t(`양쪽에서 고친 ${conflicts.length}개는 GitHub 것을 옆에 받아 둠`, `${conflicts.length} edited on both sides: the GitHub copy was saved alongside`)].filter(Boolean).join(', ')
  try {
    if (paths.length) await git(opts.dir, ['add', '-A', '--', ...paths])
    const changed = paths.length > 0 && (await git(opts.dir, ['status', '--porcelain', '--', ...paths])).length > 0
    if (!changed) {
      await git(opts.dir, ['update-ref', SYNCED, 'HEAD']).catch(() => undefined)
      return { at, projects, commit: null, pushed: false, ...extra, message: what ? t(`맞췄습니다: ${what}`, `Synced: ${what}`) : t(`바뀐 것이 없습니다 (${[...projects, ...(opts.settings ? ['앱 설정'] : [])].join(', ')})`, `Nothing changed (${[...projects, ...(opts.settings ? ['app settings'] : [])].join(', ')})`) }
    }
    await git(opts.dir, ['-c', 'user.name=research-workspace', '-c', 'user.email=research-workspace@localhost', 'commit', '--quiet', '-m', `Sync workbench: ${paths.join(', ')}`])
    const commit = await git(opts.dir, ['rev-parse', '--short', 'HEAD'])
    try {
      await git(opts.dir, ['push', '--quiet', 'origin', 'HEAD:refs/heads/main'])
    } catch (e) {
      return { at, projects, commit, pushed: false, ...extra, message: t(`이 맥에는 커밋했지만 GitHub에 올리지 못했습니다 — ${firstLine(e)}`, `Committed on this Mac but could not push to GitHub: ${firstLine(e)}`), error: firstLine(e) }
    }
    await git(opts.dir, ['update-ref', SYNCED, 'HEAD'])
    return { at, projects, commit, pushed: true, ...extra, message: t(`맞췄습니다: ${[...projects, ...(paths.includes('_settings') ? ['앱 설정'] : [])].join(', ')}${what ? ` (${what})` : ''}`, `Synced: ${[...projects, ...(paths.includes('_settings') ? ['app settings'] : [])].join(', ')}${what ? ` (${what})` : ''}`) }
  } catch (e) {
    return fail(firstLine(e))
  }
}
