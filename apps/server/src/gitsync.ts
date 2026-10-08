import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { t } from './i18n.js'

const exec = promisify(execFile)

/** 연구 저장소가 GitHub(추적 중인 원격 브랜치)와 얼마나 다른지 */
export interface RepoSync {
  branch: string
  upstream: string
  /** 이 컴퓨터에만 있는 커밋 수 (푸시 안 함) */
  ahead: number
  /** 원격에만 있는 커밋 수 (받아오지 않음) */
  behind: number
  /** 커밋하지 않은 추적 파일 변경 수 */
  dirty: number
  /** 마지막으로 원격을 확인한 시각 (ms). 확인에 실패했으면 fetchError */
  fetchedAt: number | null
  fetchError?: string
  /** 앱에서 안전하게 받아올 수 있는지: 원격에만 커밋이 있고, 이 컴퓨터에 커밋·변경이 없을 때 */
  canUpdate: boolean
}

/** 같은 저장소에 원격 확인을 자주 하지 않는다 */
const FETCH_EVERY_MS = 60_000
const lastFetch = new Map<string, { at: number; error?: string }>()

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', root, ...args], { timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  return stdout.trim()
}

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

/** 프로젝트 정보의 저장소 칸: 브랜치, 원격, 마지막 커밋, 커밋 안 한 변경, GitHub와의 차이 (10/4 19:25 피드백) */
export interface RepoInfo {
  /** ok: 이 폴더가 저장소 맨 위. none: git 저장소가 아님. inside: 다른 저장소(top) 안의 폴더 */
  state: 'ok' | 'none' | 'inside'
  top?: string
  /** 브랜치 이름. 브랜치가 아닌 커밋을 꺼내 둔 상태면 null */
  branch?: string | null
  /** 원격 (추적 브랜치의 원격, 없으면 origin). 주소의 로그인 정보는 지운 것 */
  remote?: { name: string; shown: string; web: string | null } | null
  upstream?: string | null
  /** 마지막 커밋 (커밋이 하나도 없으면 null). date는 ISO */
  last?: { sha: string; subject: string; date: string } | null
  /** 커밋하지 않은 추적 파일 변경 수, git이 아직 모르는 새 파일 수 */
  dirty?: number
  untracked?: number
  /** 추적 브랜치와의 차이 (추적 브랜치가 없으면 null). 마지막 확인 때의 원격 기준 */
  ahead?: number | null
  behind?: number | null
  /** 마지막으로 원격을 확인한 시각 (ms). 확인에 실패했으면 fetchError(쉬운 말)와 fetchDetail(git 원문) */
  fetchedAt?: number | null
  fetchError?: string
  fetchDetail?: string
}

/** 저장소 정보. fetch=true이면 원격을 바로 확인한다(사용자가 "확인"을 눌렀을 때). 받아오기·올리기는 하지 않는다 */
export async function repoInfo(root: string, opts: { fetch?: boolean } = {}): Promise<RepoInfo> {
  let top: string
  try { top = await git(root, 'rev-parse', '--show-toplevel') } catch { return { state: 'none' } }
  if (fs.realpathSync(top) !== fs.realpathSync(root)) return { state: 'inside', top }
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
    if (fs.realpathSync(await git(root, 'rev-parse', '--show-toplevel')) !== fs.realpathSync(root)) return null
    branch = await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')
    upstream = await git(root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')
  } catch { return null }

  if (opts.fetch) await fetchRemote(root, upstream.split('/')[0]!, opts.force)
  const [aheadBehind, status] = await Promise.all([
    git(root, 'rev-list', '--left-right', '--count', 'HEAD...@{upstream}'),
    git(root, 'status', '--porcelain', '--untracked-files=no'),
  ])
  const [ahead, behind] = aheadBehind.split(/\s+/).map(Number) as [number, number]
  const dirty = status ? status.split('\n').length : 0
  const f = lastFetch.get(root)
  return {
    branch, upstream, ahead, behind, dirty,
    fetchedAt: f && !f.error ? f.at : null, fetchError: f?.error,
    canUpdate: behind > 0 && ahead === 0 && dirty === 0,
  }
}

export class SyncError extends Error {}

/**
 * 원격의 새 커밋을 받아온다. 빨리 감기(fast-forward)만 한다:
 * 이 컴퓨터에 커밋이나 커밋 안 한 변경이 있으면 아무것도 하지 않고 멈춘다. 병합·리베이스·덮어쓰기는 하지 않는다.
 */
export async function fastForward(root: string): Promise<RepoSync> {
  const s = await repoSync(root, { fetch: true, force: true })
  if (!s) throw new SyncError(t('GitHub 브랜치를 추적하는 git 저장소가 아닙니다', 'Not a git repository that tracks a GitHub branch'))
  if (s.fetchError) throw new SyncError(t(`GitHub를 확인하지 못했습니다: ${s.fetchError}`, `Could not check GitHub: ${s.fetchError}`))
  if (s.behind === 0) return s
  if (s.ahead > 0) throw new SyncError(t(`이 컴퓨터에만 있는 커밋 ${s.ahead}개가 있어 자동으로 받지 않습니다. 터미널에서 git pull로 합쳐 주세요`, `Not pulled automatically: ${s.ahead} commit${s.ahead === 1 ? ' is' : 's are'} only on this computer. Merge with git pull in a terminal`))
  if (s.dirty > 0) throw new SyncError(t(`커밋하지 않은 변경 ${s.dirty}개가 있어 받지 않습니다. 먼저 커밋해 주세요`, `Not pulled: ${s.dirty} uncommitted change${s.dirty === 1 ? '' : 's'}. Commit first`))
  try { await git(root, 'merge', '--ff-only', '--quiet', '@{upstream}') } catch (e) {
    throw new SyncError(t(`받아오지 못했습니다: ${String((e as { stderr?: string }).stderr ?? e).split('\n').find((l) => l.trim())}`, `Could not pull: ${String((e as { stderr?: string }).stderr ?? e).split('\n').find((l) => l.trim())}`))
  }
  return (await repoSync(root))!
}
