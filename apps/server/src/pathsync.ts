import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { withRepoLock } from './repoLock.js'
import { t } from './i18n.js'

const exec = promisify(execFile)

/**
 * 이 컴퓨터에서 남긴 사용자 기록(앱 피드백, 연구의 코멘트 등)만 GitHub에 올려 클라우드의 Claude가 읽게 한다.
 * 정한 경로 밖은 절대 올리지 않고, 작업 트리·HEAD도 바꾸지 않는다(원고와 다른 에이전트의 작업을 건드리지 않는다).
 *
 * 1. 정한 경로의 변경만 이 컴퓨터에 커밋한다.
 * 2. GitHub가 이 컴퓨터보다 앞서 있거나, 이 컴퓨터에 경로 밖을 바꾼 커밋이 있으면, GitHub 최신 커밋 위에
 *    정한 경로의 파일만 얹은 커밋을 따로 만들어 올린다. 이 컴퓨터의 커밋은 다음 git pull·앱 업데이트 때 합쳐진다
 *    (같은 내용이라 충돌 없이 사라진다).
 * 3. GitHub에서도 그 파일이 이 컴퓨터가 모르는 내용으로 바뀌었으면 아무것도 올리지 않고 멈춘다.
 */
export interface PathPublishResult {
  /** 이번에 이 컴퓨터에 만든 커밋 (짧은 해시). 바뀐 것이 없었으면 null */
  commit: string | null
  pushed: boolean
  /** GitHub에 올린 파일 */
  files: string[]
  message: string
}

export class PathSyncError extends Error {
  constructor(message: string, readonly commit: string | null = null) { super(message) }
}

const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
const firstLine = (e: unknown) => String((e as { stderr?: string }).stderr || (e as Error).message || e).split('\n').find((l) => l.trim()) ?? t('알 수 없는 오류', 'Unknown error')

async function git(root: string, args: string[], extraEnv: Record<string, string> = {}): Promise<string> {
  return (await exec('git', ['-C', root, ...args], { timeout: 60_000, env: { ...env, ...extraEnv } })).stdout.trim()
}
const lines = (s: string) => s.split('\n').filter(Boolean)
const blobOf = (root: string, rev: string, file: string) => git(root, ['rev-parse', '--verify', '--quiet', `${rev}:${file}`]).catch(() => null)

function checkPaths(paths: string[]): void {
  if (!paths.length) throw new PathSyncError(t('올릴 경로가 없습니다', 'No paths to push'))
  for (const p of paths) {
    if (!p || p === '.' || path.isAbsolute(p) || p.split(/[\\/]/).includes('..')) throw new PathSyncError(t(`저장소 안의 상대 경로만 올립니다: ${p}`, `Only relative paths inside the repository are pushed: ${p}`))
  }
}

/** 폴더가 든 git 저장소의 맨 위와, 그 안에서 폴더의 상대 경로 */
export async function locate(dir: string): Promise<{ top: string; rel: string }> {
  let top: string
  try { top = await git(dir, ['rev-parse', '--show-toplevel']) } catch { throw new PathSyncError(t(`git 저장소 안에 있지 않습니다: ${dir}`, `Not inside a git repository: ${dir}`)) }
  return { top, rel: path.relative(fs.realpathSync.native(top), fs.realpathSync.native(dir)).split(path.sep).join('/') }
}

/** 지금 체크아웃된 브랜치 이름. 분리된 HEAD면 '' */
export async function currentBranch(root: string): Promise<string> {
  return git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')
}

async function upstreamOf(root: string): Promise<{ remote: string; ref: string }> {
  const branch = await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')
  const [remote, ref] = branch ? (await git(root, ['for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${branch}`])).split('\0') : []
  if (!remote || !ref) throw new PathSyncError(t('이 브랜치가 GitHub 브랜치를 추적하지 않습니다. 터미널에서 git push -u로 한 번 연결해 주세요', 'This branch does not track a GitHub branch. Link it once with git push -u in a terminal'))
  return { remote, ref }
}

/** 이 컴퓨터에서 바꿨지만 아직 GitHub(마지막으로 확인한 상태)에 없는 파일. 원격은 확인하지 않는다 */
export async function pendingPaths(root: string, paths: string[]): Promise<string[]> {
  checkPaths(paths)
  let base: string
  try { base = await git(root, ['merge-base', 'HEAD', '@{upstream}']) } catch { return [] }
  const touched = new Set([
    ...lines(await git(root, ['diff', '--name-only', base, '--', ...paths])),
    ...lines(await git(root, ['ls-files', '--others', '--exclude-standard', '--', ...paths])),
  ])
  const out: string[] = []
  for (const f of touched) {
    const up = await blobOf(root, '@{upstream}', f)
    const local = fs.existsSync(path.join(root, f)) ? await git(root, ['hash-object', '--', f]) : null
    if (up !== local) out.push(f)
  }
  return out.sort()
}

/** 추적 중인 원격 브랜치에 있는 그 파일의 글 (없으면 null) */
export async function upstreamText(root: string, file: string): Promise<string | null> {
  try { return (await exec('git', ['-C', root, 'show', `@{upstream}:${file}`], { timeout: 60_000, env, maxBuffer: 64 * 1024 * 1024 })).stdout } catch { return null }
}

export function publishPaths(root: string, paths: string[], opts: { message: string }): Promise<PathPublishResult> {
  return withRepoLock(root, () => publishPathsNow(root, paths, opts))
}

async function publishPathsNow(root: string, paths: string[], opts: { message: string }): Promise<PathPublishResult> {
  checkPaths(paths)
  const { remote, ref } = await upstreamOf(root)

  // 1. 정한 경로만 커밋 (스테이징된 다른 변경은 그대로 둔다)
  let commit: string | null = null
  if (await git(root, ['status', '--porcelain', '--', ...paths])) {
    await git(root, ['add', '--', ...paths])
    await git(root, ['commit', '--only', '-m', opts.message, '--', ...paths])
    commit = await git(root, ['rev-parse', '--short', 'HEAD'])
  }

  try { await git(root, ['fetch', '--quiet', remote]) } catch (e) {
    throw new PathSyncError(t(`GitHub를 확인하지 못했습니다. ${commit ? '커밋은 이 컴퓨터에 남아 있습니다' : ''}: ${firstLine(e)}`, `Could not check GitHub. ${commit ? 'The commit stays on this computer' : ''}: ${firstLine(e)}`), commit)
  }
  const up = await git(root, ['rev-parse', '@{upstream}'])
  const base = await git(root, ['merge-base', 'HEAD', up])
  const files: string[] = []
  for (const f of lines(await git(root, ['diff', '--name-only', base, 'HEAD', '--', ...paths]))) {
    if (await blobOf(root, 'HEAD', f) !== await blobOf(root, up, f)) files.push(f)
  }
  if (!files.length) return { commit, pushed: false, files, message: t('올릴 것이 없습니다. 이미 GitHub에 있습니다', 'Nothing to push. It is already on GitHub') }

  const push = async (rev: string) => {
    try { await git(root, ['push', '--quiet', remote, `${rev}:refs/heads/${ref.replace(/^refs\/heads\//, '')}`]) } catch (e) {
      throw new PathSyncError(t(`GitHub에 올리지 못했습니다. ${commit ? '커밋은 이 컴퓨터에 남아 있습니다. ' : ''}잠시 뒤 다시 눌러 주세요: ${firstLine(e)}`, `Could not push to GitHub. ${commit ? 'The commit stays on this computer. ' : ''}Try again in a moment: ${firstLine(e)}`), commit)
    }
    await git(root, ['fetch', '--quiet', remote]).catch(() => undefined)
  }

  // 2-a. GitHub가 앞서 있지 않고 이 컴퓨터의 커밋이 모두 정한 경로 안이면 그대로 올린다
  const outside = lines(await git(root, ['diff', '--name-only', up, 'HEAD'])).filter((f) => !paths.some((p) => f === p || f.startsWith(`${p.replace(/\/$/, '')}/`)))
  if (base === up && !outside.length) {
    await push('HEAD')
    return { commit, pushed: true, files, message: t(`GitHub에 올렸습니다 (${files.length}개 파일)`, `Pushed to GitHub (${files.length} ${files.length === 1 ? 'file' : 'files'})`) }
  }

  // 3. GitHub에서 이 컴퓨터가 모르는 내용으로 바뀐 파일이 있으면 멈춘다
  const conflicts: string[] = []
  for (const f of files) {
    const known = new Set([await blobOf(root, base, f)])
    for (const c of lines(await git(root, ['rev-list', `${base}..HEAD`, '--', f]))) known.add(await blobOf(root, c, f))
    if (!known.has(await blobOf(root, up, f))) conflicts.push(f)
  }
  if (conflicts.length) {
    throw new PathSyncError(t(`GitHub에서도 같은 파일이 바뀌어 올리지 않았습니다: ${conflicts.join(', ')}. ${commit ? '커밋은 이 컴퓨터에 남아 있습니다. ' : ''}git pull로 합친 뒤 다시 눌러 주세요`, `Not pushed because the same files also changed on GitHub: ${conflicts.join(', ')}. ${commit ? 'The commit stays on this computer. ' : ''}Merge with git pull, then try again`), commit)
  }

  // 2-b. GitHub 최신 커밋 위에 정한 경로의 파일만 얹은 커밋을 따로 만든다 (작업 트리·HEAD는 그대로)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-pathsync-'))
  try {
    const idx = { GIT_INDEX_FILE: path.join(tmp, 'index') }
    await git(root, ['read-tree', up], idx)
    for (const f of files) {
      const entry = await git(root, ['ls-tree', 'HEAD', '--', f])
      if (entry) {
        const [mode, , blob] = entry.split(/\s+/)
        await git(root, ['update-index', '--add', '--cacheinfo', `${mode},${blob},${f}`], idx)
      } else {
        await git(root, ['update-index', '--force-remove', '--', f], idx)
      }
    }
    const tree = await git(root, ['write-tree'], idx)
    const onTop = await git(root, ['commit-tree', tree, '-p', up, '-m', opts.message])
    await push(onTop)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return { commit, pushed: true, files, message: t(`GitHub 최신 버전 위에 올렸습니다 (${files.length}개 파일)`, `Pushed on top of the latest GitHub version (${files.length} ${files.length === 1 ? 'file' : 'files'})`) }
}
