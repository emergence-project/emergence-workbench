import fs from 'node:fs'
import { git as gitAt } from './git.js'
import { t } from './i18n.js'
import { syncCommands, syncChanges } from './gitSyncState.js'
import type { RepoSync, RepoInfo } from '@rw/core/contract/research'
export type { RepoSync, RepoInfo }

/** 같은 저장소에 원격 확인을 자주 하지 않는다 */
const FETCH_EVERY_MS = 60_000
const lastFetch = new Map<string, { at: number; error?: string }>()

const git = (root: string, ...args: string[]) => gitAt(root, args)

const firstLine = (e: unknown) => String((e as { stderr?: string }).stderr || e).split('\n').find((l) => l.trim())?.trim() ?? t('알 수 없는 오류', 'Unknown error')

/**
 * 원격을 확인한다 (git fetch, 1분에 한 번까지. force면 바로). 작업 트리는 바꾸지 않는다.
 * 같은 저장소의 fetch가 겹치면 git 잠금 오류가 나므로 진행 중인 것을 함께 기다린다.
 */
const fetching = new Map<string, Promise<void>>()
async function fetchRemote(root: string, remote: string, force = false): Promise<void> {
  const prev = lastFetch.get(root)
  if (!force && prev && Date.now() - prev.at <= FETCH_EVERY_MS) return
  let run = fetching.get(root)
  if (!run) {
    run = git(root, 'fetch', '--quiet', remote)
      .then(() => { lastFetch.set(root, { at: Date.now() }) }, (e) => { lastFetch.set(root, { at: Date.now(), error: firstLine(e) }) })
      .finally(() => fetching.delete(root))
    fetching.set(root, run)
  }
  await run
}

/** git 오류 한 줄을 쉬운 말로 (원문은 따로 보여 준다) */
export function fetchProblem(raw: string): string {
  if (/could not resolve host|unable to access|network is unreachable|timed out|connection (refused|reset)|failed to connect/i.test(raw)) return t('인터넷에 연결되지 않았거나 GitHub에 닿지 않습니다', 'No internet connection, or GitHub cannot be reached')
  if (/authentication|permission denied|could not read username|access denied|\b40[13]\b/i.test(raw)) return t('GitHub 로그인이 필요하거나 이 저장소에 들어갈 수 없습니다', 'GitHub sign-in is needed, or this repository cannot be accessed')
  if (/not found|does not appear to be a git repository/i.test(raw)) return t('원격 저장소를 찾지 못했습니다', 'Could not find the remote repository')
  return t('GitHub를 확인하지 못했습니다', 'Could not check GitHub')
}

/** 원격 주소를 보여 줄 글과 브라우저로 열 주소로. 주소에 든 로그인 정보(토큰)는 지운다. 웹 주소로 바꿀 수 없으면 web은 null */
export function remoteWeb(url: string): { shown: string; web: string | null } {
  const u = url.trim()
  let m = /^(https?):\/\/(?:[^@/]*@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(u)
  if (m) return { shown: `${m[2]}/${m[3]}`, web: `${m[1]}://${m[2]}/${m[3]}` }
  m = /^(?:ssh:\/\/)?[^@/\s]+@([^:/\s]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/.exec(u)
  if (m) return { shown: `${m[1]}/${m[2]}`, web: `https://${m[1]}/${m[2]}` }
  return { shown: u.replace(/\/\/[^@/]*@/, '//'), web: null }
}

/** 저장소 정보. fetch=true이면 원격을 바로 확인한다(사용자가 "확인"을 눌렀을 때). 받아오기·올리기는 하지 않는다 */
export async function repoInfo(root: string, opts: { fetch?: boolean } = {}): Promise<RepoInfo> {
  let top: string
  try { top = await git(root, 'rev-parse', '--show-toplevel') } catch { return { state: 'none' } }
  if (fs.realpathSync.native(top) !== fs.realpathSync.native(root)) return { state: 'inside', top }
  const opt = (p: Promise<string>) => p.catch(() => null)
  const [head, upstream, remoteList, status] = await Promise.all([
    opt(git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD')),
    opt(git(root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')),
    opt(git(root, 'remote')),
    git(root, 'status', '--porcelain'),
  ])
  const remotes = remoteList?.split('\n').filter(Boolean) ?? []
  const upRemote = upstream?.split('/')[0]
  const remoteName = upRemote && remotes.includes(upRemote) ? upRemote : remotes.includes('origin') ? 'origin' : remotes[0]
  const url = remoteName ? await opt(git(root, 'remote', 'get-url', remoteName)) : null
  const remote = remoteName && url ? { name: remoteName, ...remoteWeb(url) } : null
  if (opts.fetch && remoteName) await fetchRemote(root, remoteName, true)
  const log = await opt(git(root, 'log', '-1', '--format=%h%x09%cI%x09%s'))
  let ahead: number | null = null
  let behind: number | null = null
  if (upstream && log) {
    const ab = await opt(git(root, 'rev-list', '--left-right', '--count', 'HEAD...@{upstream}'))
    if (ab) [ahead, behind] = ab.split(/\s+/).map(Number) as [number, number]
  }
  const lines = status ? status.split('\n') : []
  const [sha = '', date = '', ...subject] = log ? log.split('\t') : []
  const f = lastFetch.get(root)
  return {
    state: 'ok', branch: head, remote, upstream,
    last: log ? { sha, date, subject: subject.join('\t') } : null,
    dirty: lines.filter((l) => !l.startsWith('??')).length,
    untracked: lines.filter((l) => l.startsWith('??')).length,
    ahead, behind,
    fetchedAt: f && !f.error ? f.at : null,
    ...(f?.error && { fetchError: fetchProblem(f.error), fetchDetail: f.error }),
  }
}

/**
 * 저장소 상태. fetch=true이면 원격을 확인한다(1분에 한 번까지). 저장소 맨 위 폴더가 아니거나 추적 브랜치가 없으면 null.
 * 작업 트리는 바꾸지 않는다.
 */
export async function repoSync(root: string, opts: { fetch?: boolean; force?: boolean } = {}): Promise<RepoSync | null> {
  let branch: string
  let upstream: string
  try {
    // 저장소 안의 하위 폴더면(예: 다른 저장소 안의 예제 연구) 바깥 저장소 상태를 보여 주지 않는다
    if (fs.realpathSync.native(await git(root, ...syncCommands.top)) !== fs.realpathSync.native(root)) return null
    if (await unborn(root)) return await emptyCloneSync(root, opts)
    branch = await git(root, ...syncCommands.branch)
    upstream = await git(root, ...syncCommands.upstream)
  } catch { return null }

  if (opts.fetch) await fetchRemote(root, upstream.split('/')[0]!, opts.force)
  const [aheadBehind, status] = await Promise.all([
    git(root, ...syncCommands.counts),
    git(root, ...syncCommands.status),
  ])
  const [ahead, behind] = aheadBehind.split(/\s+/).map(Number) as [number, number]
  const incoming = behind > 0 ? await Promise.all([
    git(root, ...syncCommands.incoming), git(root, ...syncCommands.added), git(root, ...syncCommands.untracked),
  ]) : []
  const changes = syncChanges(status, ...incoming)
  const f = lastFetch.get(root)
  const remote = upstream.split('/')[0]!
  const main = await defaultBranchOf(root, remote)
  const off = main !== null && upstream !== `${remote}/${main}`
  return {
    branch, upstream, ahead, behind, ...changes,
    fetchedAt: f && !f.error ? f.at : null, fetchError: f?.error,
    ...(off && { defaultBranch: main }),
    canUpdate: behind > 0 && ahead === 0 && changes.conflictCount === 0,
  }
}

/**
 * 원격의 기본 브랜치 이름 (origin/HEAD, 없으면 main · master 중 원격에 있는 것). 모르면 null.
 * 연구 폴더가 다른 브랜치(에이전트의 claude/… 등)에 있으면 저절로 받기 · 기록 올리기가 그 브랜치로 가서
 * 다른 컴퓨터에서 보이지 않는다 (10/22 맥미니 NBCP). 그때는 저절로 하지 않고 홈 카드에 알린다
 */
export async function defaultBranchOf(root: string, remote: string): Promise<string | null> {
  const head = await git(root, 'symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`).catch(() => '')
  if (head.startsWith(`${remote}/`)) return head.slice(remote.length + 1)
  for (const b of ['main', 'master']) {
    if (await git(root, 'rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${b}`).then(() => true, () => false)) return b
  }
  return null
}

/** 그 폴더가 원격의 기본 브랜치를 추적하지 않으면 그 이유 문장 (기록 올리기가 먼저 본다). 추적하거나 알 수 없으면 null */
export async function offDefaultBranch(root: string): Promise<string | null> {
  try {
    const branch = await git(root, ...syncCommands.branch)
    const upstream = await git(root, ...syncCommands.upstream)
    const remote = upstream.split('/')[0]!
    const main = await defaultBranchOf(root, remote)
    return main !== null && upstream !== `${remote}/${main}` ? offDefaultProblem({ branch, defaultBranch: main }) : null
  } catch { return null }
}

/** 연구 폴더가 원격의 기본 브랜치를 추적하지 않으면 그 사실을 알리는 문장 (저절로 받기 · 기록 올리기가 멈춘 이유). 추적하면 null */
export function offDefaultProblem(s: Pick<RepoSync, 'branch' | 'defaultBranch'>): string | null {
  return s.defaultBranch ? t(`이 폴더가 ${s.defaultBranch}가 아닌 ${s.branch} 브랜치에 있어 저절로 받기와 기록 올리기를 멈췄습니다. 터미널에서 git switch ${s.defaultBranch} 뒤 다시 해 주세요`, `This folder is on the ${s.branch} branch, not ${s.defaultBranch}, so automatic pulls and record pushes are paused. Run git switch ${s.defaultBranch} in a terminal, then try again`) : null
}

/** 커밋이 하나도 없는 사본인지 (빈 GitHub 저장소를 받아 둔 직후) */
async function unborn(root: string): Promise<boolean> {
  try { await git(root, 'rev-parse', '--verify', '--quiet', 'HEAD'); return false } catch { return true }
}

/**
 * 빈 저장소를 받아 둔 사본: GitHub에 첫 커밋이 올라오면 받을 수 있다.
 * 사본에 올려 둔(add) 파일이 있으면 받지 않고, 새 커밋에 든 파일과 이름이 같은 파일이 있으면 겹침으로 알린다.
 */
async function emptyCloneSync(root: string, opts: { fetch?: boolean; force?: boolean }): Promise<RepoSync | null> {
  const branch = await git(root, 'symbolic-ref', '--short', 'HEAD')
  // GitHub 쪽도 비어 있으면 @{upstream}이 풀리지 않으니 설정에서 읽는다
  const remote = await git(root, 'config', `branch.${branch}.remote`)
  const upstream = `${remote}/${(await git(root, 'config', `branch.${branch}.merge`)).replace(/^refs\/heads\//, '')}`
  if (opts.fetch) await fetchRemote(root, remote, opts.force)
  const f = lastFetch.get(root)
  const fetched = { fetchedAt: f && !f.error ? f.at : null, fetchError: f?.error }
  const staged = (await git(root, 'ls-files', '-z')).split('\0').filter(Boolean)
  let behind = 0
  try { behind = Number(await git(root, 'rev-list', '--count', `refs/remotes/${upstream}`)) } catch { /* GitHub도 아직 비어 있음 */ }
  const incoming = behind ? new Set((await git(root, 'ls-tree', '-r', '--name-only', '-z', `refs/remotes/${upstream}`)).split('\0').filter(Boolean)) : new Set<string>()
  const untracked = (await git(root, ...syncCommands.untracked)).split('\0').filter(Boolean)
  const conflicts = [...new Set([...staged, ...untracked].filter((p) => incoming.has(p)))].sort()
  return {
    branch, upstream, ahead: 0, behind, dirty: staged.length, conflicts: conflicts.slice(0, 20), conflictCount: conflicts.length,
    ...fetched, canUpdate: behind > 0 && staged.length === 0 && conflicts.length === 0,
  }
}

export class SyncError extends Error {}

/**
 * 원격의 새 커밋을 받아온다. 빨리 감기(fast-forward)만 한다:
 * 이 컴퓨터에만 있는 커밋이나 겹치는 파일이 있으면 멈춘다. 병합·리베이스·덮어쓰기는 하지 않는다.
 */
export async function fastForward(root: string): Promise<RepoSync> {
  const s = await repoSync(root, { fetch: true, force: true })
  if (!s) throw new SyncError(t('GitHub 브랜치를 추적하는 git 저장소가 아닙니다', 'Not a git repository that tracks a GitHub branch'))
  if (s.fetchError) throw new SyncError(t(`GitHub를 확인하지 못했습니다: ${s.fetchError}`, `Could not check GitHub: ${s.fetchError}`))
  if (s.ahead > 0) throw new SyncError(t(`이 컴퓨터에만 있는 커밋 ${s.ahead}개가 있어 자동으로 받지 않습니다. 터미널에서 git pull로 합쳐 주세요`, `Not pulled automatically: ${s.ahead} commit${s.ahead === 1 ? ' is' : 's are'} only on this computer. Merge with git pull in a terminal`))
  if (s.behind === 0) return s
  if (s.dirty > 0 && await unborn(root)) throw new SyncError(t('첫 커밋 전에 올려 둔(add) 파일이 있어 받지 않습니다. 터미널에서 git pull로 합쳐 주세요', 'Not pulled: files were added before the first commit. Merge with git pull in a terminal'))
  if (s.conflictCount > 0) {
    const files = s.conflicts.slice(0, 5).join(', ')
    const more = s.conflictCount - Math.min(5, s.conflicts.length)
    throw new SyncError(t(`커밋하지 않은 변경과 GitHub의 새 커밋이 같은 파일을 고쳐 받지 않습니다: ${files}${more ? ` 외 ${more}개` : ''}. 먼저 커밋하거나 합쳐 주세요`, `Not pulled because uncommitted changes and new GitHub commits change the same files: ${files}${more ? ` and ${more} more` : ''}. Commit or merge first`))
  }
  try { await git(root, 'merge', '--ff-only', '--no-autostash', '--no-overwrite-ignore', '--quiet', '@{upstream}') } catch (e) {
    throw new SyncError(t(`받아오지 못했습니다: ${firstLine(e)}`, `Could not pull: ${firstLine(e)}`))
  }
  return (await repoSync(root))!
}

/**
 * 저절로 받기 (10/14 사용자 결정): 원격을 확인하고, 앱의 받기 버튼과 같은 조건(맥에만 있는 커밋 없음 · 겹치는 파일 없음)일 때만 빨리 감기로 받는다.
 * 받았으면 true. 받을 수 없거나 받을 것이 없으면 false (오류는 홈 카드가 그대로 보여 준다)
 */
export async function autoPull(root: string): Promise<boolean> {
  const s = await repoSync(root, { fetch: true })
  if (!s?.canUpdate || s.fetchError || s.defaultBranch) return false
  try { await fastForward(root); return true } catch { return false }
}
