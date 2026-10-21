import fs from 'node:fs'
import path from 'node:path'
import { git, gitBuffer, GIT_TIMEOUT } from './git.js'
import { isInside } from './fsutil.js'
import { WorkbenchError, assertRealInside } from './workbench.js'
import { t } from './i18n.js'

/**
 * 기록 글 속 저장소 경로(`docs/x.md`)를 연다 (10/19 피드백 09:53, 시안 안 1).
 * 적힌 자리에 있으면 그것, 없으면 git 이력에서 옮긴 곳을 찾고(이름을 바꾼 커밋을 따라 최대 5번),
 * 지운 파일이면 지우기 전 마지막 판을, 이력이 없으면 저장소에서 같은 이름의 파일이 하나뿐일 때 그것을 연다.
 * 저장소 밖과 .git 안은 열지 않는다.
 */

export type RepoFileKind = 'markdown' | 'text' | 'pdf' | 'image' | 'other'
export interface RepoFileFound {
  /** 기록에 적힌 경로 */
  asked: string
  /** 연 파일의 저장소 경로 (지운 파일이면 적힌 경로) */
  path: string
  status: 'here' | 'moved' | 'deleted' | 'missing'
  /** 옮기거나 지운 커밋의 시각 · 짧은 이름 (이름이 같은 파일로 찾았으면 없음) */
  at?: string
  commit?: string
  kind: RepoFileKind
}

const TEXT_EXT = new Set(['.txt', '.tex', '.bib', '.py', '.json', '.yaml', '.yml', '.toml', '.csv', '.sh', '.jl', '.wl', '.m', '.ts', '.js', '.mjs', '.cfg', '.ini', '.log', '.sty', '.cls', '.r', '.c', '.h', '.cpp', '.rs', '.go'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])
export function repoFileKind(file: string): RepoFileKind {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_EXT.has(ext)) return 'image'
  return TEXT_EXT.has(ext) || !ext ? 'text' : 'other'
}

/** 저장소 안의 상대 경로로 고친다. 저장소 밖 · .git 안(대소문자를 가리지 않는 맥 · 하위 저장소의 .git 포함) · 빈 경로는 거절 */
export function repoRelative(root: string, asked: string): string {
  const rel = path.posix.normalize(asked.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
  const abs = path.resolve(root, rel)
  if (!rel || rel === '.' || path.isAbsolute(rel) || !isInside(path.resolve(root), abs) || rel.split('/').some((seg) => seg.toLowerCase() === '.git'))
    throw new WorkbenchError(400, t(`저장소 안의 파일 경로가 아닙니다: ${asked}`, `Not a file path inside the repository: ${asked}`))
  return rel
}

const isFile = (root: string, rel: string) => { try { return fs.statSync(path.join(root, rel)).isFile() } catch { return false } }

/** 적힌 경로가 가리키는 파일을 찾는다 (읽지 않는다) */
export async function findRepoFile(root: string, asked: string): Promise<RepoFileFound> {
  const rel = repoRelative(root, asked)
  const kind = repoFileKind(rel)
  if (isFile(root, rel)) return { asked: rel, path: rel, status: 'here', kind }
  let at: string | undefined, commit: string | undefined
  let cur = rel
  for (let hop = 0; hop < 5; hop++) {
    // 이 경로를 마지막으로 건드린 커밋: 옮겼거나 지운 커밋이다
    const last = await git(root, ['log', '-1', '--format=%H%x09%cI', '--', cur], { timeout: GIT_TIMEOUT.read }).catch(() => '')
    if (!last) break
    const [hash, when] = last.split('\t') as [string, string]
    const changes = await git(root, ['show', '-M', '--name-status', '--format=', hash], { timeout: GIT_TIMEOUT.read }).catch(() => '')
    let next: string | null = null, deleted = false
    for (const line of changes.split('\n')) {
      const [status, from, to] = line.split('\t')
      if (status?.startsWith('R') && from === cur && to) { next = to; break }
      if (status === 'D' && from === cur) deleted = true
    }
    at = when; commit = hash.slice(0, 7)
    if (next) {
      cur = next
      if (isFile(root, cur)) return { asked: rel, path: cur, status: 'moved', at, commit, kind: repoFileKind(cur) }
      continue
    }
    if (deleted) return { asked: rel, path: cur, status: 'deleted', at, commit: hash, kind: repoFileKind(cur) }
    break
  }
  // 이력으로 못 찾으면 같은 이름의 파일이 저장소에 하나뿐일 때만
  const name = path.posix.basename(rel)
  const tracked = await git(root, ['ls-files', '-z'], { timeout: GIT_TIMEOUT.read, maxBuffer: 256 * 1024 * 1024 }).catch(() => '')
  const same = tracked.split('\0').filter((f) => f && path.posix.basename(f) === name && isFile(root, f))
  if (same.length === 1) return { asked: rel, path: same[0]!, status: 'moved', kind: repoFileKind(same[0]!) }
  return { asked: rel, path: rel, status: 'missing', kind }
}

const MAX_TEXT = 1024 * 1024

/** 글 파일의 내용 (지운 파일은 지우기 전 판). 1MB를 넘으면 앞부분만 */
export async function readRepoText(root: string, found: RepoFileFound): Promise<{ text: string; truncated: boolean } | null> {
  if (found.status === 'missing' || (found.kind !== 'markdown' && found.kind !== 'text')) return null
  const buf = found.status === 'deleted'
    ? await gitBuffer(root, ['show', `${found.commit}^:${found.path}`], { timeout: GIT_TIMEOUT.read })
    : fs.readFileSync(assertRealInside(root, path.join(root, found.path), t('저장소에 없는 파일', 'File not in the repository')))
  return { text: buf.subarray(0, MAX_TEXT).toString('utf8'), truncated: buf.length > MAX_TEXT }
}

/**
 * 프로젝트 정보 › 파일 (10/21 사용자 "프로젝트 폴더 전체를 볼 수 있게", 시안 안 B): 저장소의 파일 목록과 바뀐 것.
 * 저장소가 git이면 git이 추적하는 파일과 새 파일(.gitignore가 빼는 것은 없음), 커밋 안 한 변경을 돌려준다.
 * git 저장소가 아니거나 다른 저장소 안의 폴더면 폴더를 훑는다(점으로 시작하는 것과 node_modules는 뺀다).
 * 읽기만 한다. 파일이 아주 많으면 앞의 MAX_TREE개만.
 */
export const MAX_TREE = 5000
export interface RepoTree {
  files: { path: string; size: number }[]
  /** 커밋 안 한 변경이 있는 파일 (새 파일 포함) */
  changed: string[]
  source: 'git' | 'folder'
  truncated: boolean
}

export async function listRepoTree(root: string): Promise<RepoTree> {
  const real = fs.realpathSync(root)
  const top = await git(root, ['rev-parse', '--show-toplevel'], { timeout: GIT_TIMEOUT.read }).catch(() => '')
  // 링크는 따라가지 않는다 (저장소 밖 파일의 크기도 알리지 않게)
  const sizeOf = (rel: string) => { try { const s = fs.lstatSync(path.join(real, rel)); return s.isFile() || s.isSymbolicLink() ? (s.isFile() ? s.size : 0) : -1 } catch { return -1 } }
  if (top && fs.realpathSync(top) === real) {
    const z = (args: string[]) => git(root, args, { timeout: GIT_TIMEOUT.read, maxBuffer: 256 * 1024 * 1024 }).then((s) => s.split('\0').filter(Boolean)).catch(() => [] as string[])
    const [tracked, fresh, status] = await Promise.all([z(['ls-files', '-z']), z(['ls-files', '-o', '--exclude-standard', '-z']), z(['status', '--porcelain', '-z', '--no-renames'])])
    const all = [...new Set([...tracked, ...fresh])].sort()
    const files = all.slice(0, MAX_TREE).map((p) => ({ path: p, size: sizeOf(p) })).filter((f) => f.size >= 0)
    // porcelain -z: "XY 경로". 지운 파일은 목록에 없으니 빼고 남은 것만
    const have = new Set(files.map((f) => f.path))
    const changed = status.map((s) => s.slice(3)).filter((p) => have.has(p))
    return { files, changed, source: 'git', truncated: all.length > MAX_TREE }
  }
  const files: RepoTree['files'] = []
  let truncated = false
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(path.join(real, dir), { withFileTypes: true }) } catch { return }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) { if (depth < 12) walk(rel, depth + 1) }
      else if (e.isFile()) {
        if (files.length >= MAX_TREE) { truncated = true; return }
        files.push({ path: rel, size: sizeOf(rel) })
      }
    }
  }
  walk('', 0)
  return { files, changed: [], source: 'folder', truncated }
}
