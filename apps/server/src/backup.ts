import { createHash } from 'node:crypto'
import { assertPrivateRemote } from './personalRepo.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import type { BackupResult } from '@rw/core/contract/backup'
import { writeAtomic } from './fsutil'
import { git as gitAt, gitBuffer, gitRun, GIT_TIMEOUT } from './git.js'
import { t } from './i18n.js'

/**
 * 맥에만 있던 작업대 정보(workbench/)와 앱 설정을 사용자의 비공개 개인 저장소(personalRepo.ts)에 두고, 그것을 정본으로 맞춘다
 * (10/4 첫 결정은 한쪽으로 올리는 백업, 10/4 16:2x 사용자 답 "예"로 GitHub가 정본).
 *
 * - 대상: 연구 저장소 git이 workbench/를 하나도 추적하지 않는 연구. 연구 저장소의 git은 읽기만 한다.
 * - 앱 설정은 설정 폴더의 config.yaml 하나만. 구글 열쇠(google-token.json, google.yaml), 색인(index/), 빌드(library-build/)는 올리지 않는다.
 * - 저장소 안에서는 <연구 id>/workbench/, _settings/<컴퓨터>/config.yaml 에 둔다. 앱 설정은 컴퓨터마다 따로다(프로젝트 경로가 컴퓨터마다 다르다):
 *   한 파일을 함께 쓰면 새 컴퓨터의 빈 설정이 첫 맞추기에서 다른 컴퓨터의 설정을 덮고, 그 컴퓨터가 다음 맞추기에서 그것을 받아 프로젝트 목록이 빈다 (10/21).
 *   10/21 전의 _settings/config.yaml은 그대로 두고 읽지도 쓰지도 않는다.
 * - 양쪽 맞추기: 지난번 맞춘 상태(설정 폴더 사본의 refs/rw/synced)와 비교해
 *   맥에서만 바뀐 파일은 올리고, GitHub에서만 바뀐 파일은 맥으로 받는다.
 *   양쪽이 다르게 바뀌었으면 맥 것을 두고 GitHub 것은 옆에 `이름.github-YYYYMMDD.확장자`로 받아 둔다(잃지 않게).
 *   지난번 기록이 없으면(첫 맞추기) 맥에 없는 파일만 받고, 나머지는 맥 것을 올린다.
 * - 컴파일 결과(.build/)는 다시 만들 수 있어서 뺀다.
 */
export interface BackupTarget { id: string; path: string }

export type { BackupResult } from '@rw/core/contract/backup'

const firstLine = (e: unknown) => String((e as { stderr?: string }).stderr || (e as Error).message || e).split('\n').find((l) => l.trim()) ?? t('알 수 없는 오류', 'Unknown error')
const git = (cwd: string, args: string[]) => gitAt(cwd, args, { timeout: GIT_TIMEOUT.backup })
const blob = (cwd: string, sha: string) => gitBuffer(cwd, ['cat-file', 'blob', sha], { timeout: GIT_TIMEOUT.backup, maxBuffer: 256 * 1024 * 1024 })

/** 이 연구의 workbench/가 연구 저장소에 올라가 있는지 (하나라도 추적하면 true) */
export async function workbenchTracked(repoPath: string): Promise<boolean> {
  try { return (await git(repoPath, ['ls-files', '--', 'workbench'])).length > 0 } catch { return false }
}

const SYNCED = 'refs/rw/synced'
/** 앱 설정을 둘 저장소 안 경로의 컴퓨터 이름: 호스트 이름에서 .local을 떼고 파일 이름에 쓸 수 있는 글자만 */
export function machineName(host = os.hostname()): string {
  return host.replace(/\.local$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'computer'
}
export const settingsPath = (machine = machineName()) => `_settings/${machine}/config.yaml`

/**
 * 컴퓨터마다 올리는 프로젝트 목록 (_settings/<컴퓨터>/projects.yaml). 경로 대신 GitHub 주소와 폴더 이름이라 다른 컴퓨터가 받을 수 있다.
 * 새 컴퓨터의 시작 준비 · 홈이 "다른 컴퓨터의 프로젝트"로 읽는다 (10/21 "목록을 보이고 묻기")
 */
export interface SharedProject { id: string; title: string; remote: string | null; folder: string; tags: string[]; state?: string }

/** 백업 사본(이미 받아 둔 개인 저장소)에서 다른 컴퓨터들이 올린 프로젝트 목록. 같은 저장소는 한 번만 */
export function otherMachineProjects(dir: string, machine = machineName()): (SharedProject & { machine: string })[] {
  const root = path.join(dir, '_settings')
  let names: string[] = []
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== machine).map((d) => d.name).sort() } catch { return [] }
  const out: (SharedProject & { machine: string })[] = []
  const seen = new Set<string>()
  for (const m of names) {
    let list: unknown
    try { list = YAML.parse(fs.readFileSync(path.join(root, m, 'projects.yaml'), 'utf8')) } catch { continue }
    for (const p of Array.isArray(list) ? list : []) {
      const r = p as Partial<SharedProject>
      if (typeof r?.title !== 'string' || typeof r.folder !== 'string') continue
      const key = (r.remote ?? r.folder).toLowerCase().replace(/\.git$/, '')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ machine: m, id: String(r.id ?? r.folder), title: r.title, remote: typeof r.remote === 'string' ? r.remote : null, folder: r.folder, tags: Array.isArray(r.tags) ? r.tags.map(String) : [], ...(typeof r.state === 'string' && { state: r.state }) })
    }
  }
  return out
}
/** 다른 컴퓨터들의 앱 설정(_settings/<컴퓨터>/config.yaml)에 적힌 공용 라이브러리 폴더 이름. 새 컴퓨터가 같은 이름의 받아 둔 폴더를 찾는다 (10/21 맥미니) */
export function otherMachineLibraries(dir: string, machine = machineName()): string[] {
  const root = path.join(dir, '_settings')
  let names: string[] = []
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== machine).map((d) => d.name).sort() } catch { return [] }
  const out = new Set<string>()
  for (const m of names) {
    try {
      const lib = (YAML.parse(fs.readFileSync(path.join(root, m, 'config.yaml'), 'utf8')) as { library?: unknown } | null)?.library
      if (typeof lib === 'string' && lib.trim()) out.add(path.basename(lib.trim()))
    } catch { /* 없으면 건너뜀 */ }
  }
  return [...out]
}
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
  const out = await gitAt(dir, ['hash-object', '--stdin-paths'], { timeout: GIT_TIMEOUT.backup, input: keys.map((k) => files.get(k)!).join('\n') + '\n' })
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
  /** 앱 설정을 둘 컴퓨터 이름 (기본: 이 컴퓨터, machineName) */
  machine?: string
  /** 이 컴퓨터의 프로젝트 목록: 주면 _settings/<컴퓨터>/projects.yaml로 올린다 (다른 컴퓨터가 받는다) */
  projects?: SharedProject[]
  /** 테스트용: GitHub 것을 맥에 쓰기 바로 전에 부른다 (그 사이 다른 쪽이 고친 경우를 흉내 낸다) */
  beforeWrite?: (abs: string) => void
}): Promise<BackupResult> {
  const now = opts.now ?? new Date()
  const SETTINGS = settingsPath(opts.machine)
  const at = now.toISOString()
  const empty = { pulled: [], conflicts: [], settingsPulled: false }
  const fail = (error: string): BackupResult => ({ at, projects: [], commit: null, pushed: false, ...empty, message: t(`맞추지 못했습니다 — ${error}`, `Could not sync: ${error}`), error })
  const candidates: BackupTarget[] = []
  for (const t of opts.targets) {
    if (fs.existsSync(t.path) && !(await workbenchTracked(t.path))) candidates.push(t)
  }
  if (!candidates.length && !opts.settings && !opts.projects) return { at, projects: [], commit: null, pushed: false, ...empty, message: t('맞출 연구가 없습니다 (모두 연구 저장소에 올라가 있음)', 'No projects to sync (all are pushed to their own repositories)') }

  let remoteRef: string | null = null
  let baseRef: string | null = null
  try {
    if (!fs.existsSync(path.join(opts.dir, '.git'))) {
      fs.rmSync(opts.dir, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(opts.dir), { recursive: true })
      await gitRun(['clone', '--quiet', opts.remote, opts.dir], { timeout: GIT_TIMEOUT.backup })
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
    fs.mkdirSync(path.dirname(path.join(opts.dir, SETTINGS)), { recursive: true })
    fs.copyFileSync(opts.settings, path.join(opts.dir, SETTINGS))
    paths.push(path.dirname(SETTINGS))
  }
  if (opts.projects) {
    const file = path.join(opts.dir, path.dirname(SETTINGS), 'projects.yaml')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, YAML.stringify(opts.projects))
    if (!paths.includes(path.dirname(SETTINGS))) paths.push(path.dirname(SETTINGS))
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
      // 앱 설정 · workbench는 개인 저장소에만: 공개 저장소면 올리지 않는다 (보안 검토 L4)
      await assertPrivateRemote(opts.dir)
      await git(opts.dir, ['push', '--quiet', 'origin', 'HEAD:refs/heads/main'])
    } catch (e) {
      return { at, projects, commit, pushed: false, ...extra, message: t(`이 맥에는 커밋했지만 GitHub에 올리지 못했습니다 — ${firstLine(e)}`, `Committed on this Mac but could not push to GitHub: ${firstLine(e)}`), error: firstLine(e) }
    }
    await git(opts.dir, ['update-ref', SYNCED, 'HEAD'])
    return { at, projects, commit, pushed: true, ...extra, message: t(`맞췄습니다: ${[...projects, ...(paths.includes(path.dirname(SETTINGS)) ? ['앱 설정'] : [])].join(', ')}${what ? ` (${what})` : ''}`, `Synced: ${[...projects, ...(paths.includes(path.dirname(SETTINGS)) ? ['app settings'] : [])].join(', ')}${what ? ` (${what})` : ''}`) }
  } catch (e) {
    return fail(firstLine(e))
  }
}
