import fs from 'node:fs'
import { mergeJournalText } from '@rw/core'
import os from 'node:os'
import path from 'node:path'
import { git as gitAt, gitBuffer, gitRun } from './git.js'
import { withRepoLock } from './repoLock.js'
import { t } from './i18n.js'

/**
 * 이 컴퓨터에서 남긴 사용자 기록(앱 피드백, 연구의 코멘트 등)만 GitHub에 올려 클라우드의 Claude가 읽게 한다.
 * 정한 경로 밖은 절대 올리지 않고, 작업 트리·HEAD도 바꾸지 않는다(원고와 다른 에이전트의 작업을 건드리지 않는다).
 *
 * 1. 정한 경로의 변경만 이 컴퓨터에 커밋한다.
 * 2. GitHub가 이 컴퓨터보다 앞서 있거나, 이 컴퓨터에 경로 밖을 바꾼 커밋이 있으면, GitHub 최신 커밋 위에
 *    정한 경로의 파일만 얹은 커밋을 따로 만들어 올린다. 이 컴퓨터의 커밋은 다음 git pull·앱 업데이트 때 합쳐진다
 *    (같은 내용이라 충돌 없이 사라진다).
 * 3. GitHub에서도 그 파일이 이 컴퓨터가 모르는 내용으로 바뀌었으면 아무것도 올리지 않고 멈춘다.
 *
 * 연구 저장소의 기록(코멘트)은 두 가지를 더 켠다 (opts, 10/15):
 * - merge: 3의 경우 파일마다 `git merge-file`로 세 갈래 합치기를 해 본다(공통 조상 · 이 컴퓨터 · GitHub). 모두 깨끗이 합쳐지면
 *   합친 글을 작업 트리에 쓰고 커밋한 뒤 2처럼 GitHub 위에 올린다. 하나라도 부딪히면 아무것도 바꾸지 않고 멈춘다.
 * - adopt: 2로 올린 뒤, 이 컴퓨터에만 있는 커밋이 모두 정한 경로 안이면 `git reset --keep <올린 커밋>`으로 이 컴퓨터의 브랜치를
 *   올린 커밋으로 옮긴다(앞선 커밋 0개). 그래야 저절로 받기(gitsync.ts autoPull)가 막히지 않는다. 내용은 올린 커밋에 그대로 있다.
 *   경로 밖에서 바뀌는 파일이 이 컴퓨터에서 고쳐져 있거나(--keep이 거절) git이 추적하지 않는 파일(무시한 파일 포함)과 이름이 같으면
 *   옮기지 않고 그대로 둔다(다음 받기 때 합친다). 앱 피드백은 켜지 않는다(개인 저장소는 pullPersonal이 따로 받는다).
 */
export interface PathPublishResult {
  /** 이번에 이 컴퓨터에 만든 커밋 (짧은 해시). 바뀐 것이 없었으면 null */
  commit: string | null
  pushed: boolean
  /** GitHub에 올린 파일 */
  files: string[]
  message: string
  /** adopt: 이 컴퓨터의 브랜치를 올린 커밋으로 옮겼는지 */
  adopted?: boolean
  /** merge: GitHub의 글과 합친 파일 */
  merged?: string[]
}

export interface PathPublishOptions {
  message: string
  /** GitHub 위에 따로 올린 뒤 이 컴퓨터의 브랜치를 그 커밋으로 옮긴다 (이 컴퓨터의 커밋이 모두 정한 경로 안일 때만) */
  adopt?: boolean
  /** GitHub에서도 바뀐 파일을 세 갈래로 합쳐 본다 (부딪히면 멈춘다) */
  merge?: boolean
  /** merge: 파일마다 줄 단위(git merge-file) 대신 쓸 합치기 (없으면 줄 단위. 앱 피드백은 항목 단위, feedbackMerge.ts) */
  mergeText?: (file: string) => ((base: string, ours: string, theirs: string) => string | null) | undefined
}

export class PathSyncError extends Error {
  constructor(message: string, readonly commit: string | null = null) { super(message) }
}

const firstLine = (e: unknown) => String((e as { stderr?: string }).stderr || (e as Error).message || e).split('\n').find((l) => l.trim()) ?? t('알 수 없는 오류', 'Unknown error')

const git = (root: string, args: string[], extraEnv: Record<string, string> = {}) => gitAt(root, args, { env: extraEnv })
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
  try { return await gitRun(['-C', root, 'show', `@{upstream}:${file}`]) } catch { return null }
}

export function publishPaths(root: string, paths: string[], opts: PathPublishOptions): Promise<PathPublishResult> {
  return withRepoLock(root, () => publishPathsNow(root, paths, opts))
}

const inPaths = (paths: string[], f: string) => paths.some((p) => f === p || f.startsWith(`${p.replace(/\/$/, '')}/`))

/** 일지 파일(workbench/log/YYYY-MM-DD.md): 줄 단위로 부딪히면 항목 단위로 다시 합쳐 본다 */
const JOURNAL_FILE = /(^|\/)log\/\d{4}-\d{2}-\d{2}\.md$/

/** 세 갈래 합치기: 합친 글, 부딪히면 null. 한쪽에서 지운 파일은 합치지 않는다 */
async function mergeFile(root: string, tmp: string, file: string, base: string | null, ours: string | null, theirs: string | null, custom?: PathPublishOptions['mergeText']): Promise<string | null> {
  if (!ours || !theirs) return null
  const write = async (name: string, blob: string | null) => {
    const file = path.join(tmp, name)
    fs.writeFileSync(file, blob ? await gitBuffer(root, ['cat-file', 'blob', blob]) : '')
    return file
  }
  const [o, b, th] = [await write('ours', ours), await write('base', base), await write('theirs', theirs)]
  const merger = custom?.(file)
  if (merger) {
    const read = (f: string) => fs.readFileSync(f, 'utf8')
    return merger(read(b), read(o), read(th))
  }
  try {
    return await gitRun(['merge-file', '-p', o, b, th])
  } catch { // 0보다 큰 끝 값 = 부딪힌 곳 수, 음수 = 오류
    if (!JOURNAL_FILE.test(file)) return null
    const read = (f: string) => fs.readFileSync(f, 'utf8')
    return mergeJournalText(read(b), read(o), read(th))
  }
}

/**
 * 이 컴퓨터의 브랜치를 GitHub에 올린 커밋으로 옮긴다. 올린 커밋은 GitHub 최신 + 이 컴퓨터가 바꾼 정한 경로의 파일이라
 * 이 컴퓨터의 내용을 모두 담는다. 이 컴퓨터에만 있는 커밋(병합 커밋 없이)이 모두 정한 경로 안이고,
 * 바뀌는 파일이 이 컴퓨터에서 고쳐져 있지 않고 추적하지 않는 파일과 겹치지 않을 때만. 옮겼으면 true
 */
async function adoptPushed(root: string, paths: string[], onTop: string): Promise<boolean> {
  const base = await git(root, ['merge-base', 'HEAD', onTop])
  if (await git(root, ['rev-list', '--merges', `${base}..HEAD`])) return false
  for (const c of lines(await git(root, ['rev-list', `${base}..HEAD`]))) {
    if (lines(await git(root, ['diff-tree', '-r', '--no-commit-id', '--name-only', c])).some((f) => !inPaths(paths, f))) return false
  }
  // reset --keep은 git이 무시하는 파일을 덮어쓰므로, 새로 생기는 파일과 이름이 같은 파일이 있으면 옮기지 않는다
  for (const f of lines(await git(root, ['diff', '--name-only', '--diff-filter=A', 'HEAD', onTop]))) {
    if (fs.existsSync(path.join(root, f))) return false
  }
  try { await git(root, ['reset', '--quiet', '--keep', onTop]); return true } catch { return false }
}

async function publishPathsNow(root: string, paths: string[], opts: PathPublishOptions): Promise<PathPublishResult> {
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
  const outside = lines(await git(root, ['diff', '--name-only', up, 'HEAD'])).filter((f) => !inPaths(paths, f))
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
  const merged: string[] = []
  if (conflicts.length && opts.merge) {
    // 3-합치기. 작업 트리 글이 HEAD와 같을 때만 (그사이 새로 쓴 것을 덮지 않게)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-pathmerge-'))
    try {
      const out = new Map<string, string>()
      for (const f of conflicts) {
        const ours = await blobOf(root, 'HEAD', f)
        const text = await mergeFile(root, tmp, f, await blobOf(root, base, f), ours, await blobOf(root, up, f), opts.mergeText)
        const disk = path.join(root, f)
        if (text === null || !fs.existsSync(disk) || await git(root, ['hash-object', '--', f]) !== ours) { out.clear(); break }
        out.set(f, text)
      }
      if (out.size === conflicts.length) {
        for (const [f, text] of out) fs.writeFileSync(path.join(root, f), text)
        await git(root, ['add', '--', ...out.keys()])
        await git(root, ['commit', '--only', '-m', `${opts.message} (merged with GitHub)`, '--', ...out.keys()])
        commit = await git(root, ['rev-parse', '--short', 'HEAD'])
        merged.push(...out.keys())
        conflicts.length = 0
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
  if (conflicts.length) {
    throw new PathSyncError(t(`GitHub에서도 같은 파일이 바뀌어 올리지 않았습니다: ${conflicts.join(', ')}. ${commit ? '커밋은 이 컴퓨터에 남아 있습니다. ' : ''}git pull로 합친 뒤 다시 눌러 주세요`, `Not pushed because the same files also changed on GitHub: ${conflicts.join(', ')}. ${commit ? 'The commit stays on this computer. ' : ''}Merge with git pull, then try again`), commit)
  }

  // 2-b. GitHub 최신 커밋 위에 정한 경로의 파일만 얹은 커밋을 따로 만든다 (작업 트리·HEAD는 그대로. adopt면 HEAD를 그 커밋으로 옮긴다)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-pathsync-'))
  let onTop: string
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
    onTop = await git(root, ['commit-tree', tree, '-p', up, '-m', opts.message])
    await push(onTop)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  const adopted = opts.adopt ? await adoptPushed(root, paths, onTop).catch(() => false) : undefined
  return {
    commit, pushed: true, files, message: t(`GitHub 최신 버전 위에 올렸습니다 (${files.length}개 파일)`, `Pushed on top of the latest GitHub version (${files.length} ${files.length === 1 ? 'file' : 'files'})`),
    ...(adopted !== undefined && { adopted }), ...(merged.length && { merged }),
  }
}
