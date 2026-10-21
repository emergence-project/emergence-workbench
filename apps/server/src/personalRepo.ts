import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { git as gitAt, gitRun, GIT_TIMEOUT } from './git.js'
import { withRepoLock } from './repoLock.js'
import { t } from './i18n.js'

/**
 * 사용자 개인 저장소 (2026-10-08 결정): 앱 저장소는 공개하고, 사용자마다 비공개 개인 저장소에
 * 앱 설정 · 맥에만 있는 workbench/ (backup.ts) · 앱 피드백(feedback/)을 둔다.
 * 피드백은 설정 폴더의 `personal/` 사본에 쌓고, 그 사본에서 feedback/만 올린다(pathsync.ts).
 */

const git = (cwd: string, args: string[]) => gitAt(cwd, args, { timeout: GIT_TIMEOUT.backup })
async function originOf(dir: string): Promise<string | null> {
  try { return (await git(dir, ['remote', 'get-url', 'origin'])) || null } catch { return null }
}

/**
 * 개인 저장소 주소. 차례대로: RW_PERSONAL_REMOTE · RW_BACKUP_REMOTE, 설정(config.yaml)의 personalRepo,
 * 이미 받아 둔 백업 사본(설정 폴더 backup/)의 origin. 앱 저장소 주소에서 짐작하지 않는다: 설정하지 않으면 null(꺼짐).
 */
export async function personalRemote(configDir: string): Promise<string | null> {
  const fromEnv = process.env.RW_PERSONAL_REMOTE || process.env.RW_BACKUP_REMOTE
  if (fromEnv) return fromEnv
  try {
    const doc = YAML.parse(fs.readFileSync(path.join(configDir, 'config.yaml'), 'utf8')) as { personalRepo?: unknown } | null
    if (typeof doc?.personalRepo === 'string' && doc.personalRepo.trim()) return doc.personalRepo.trim()
  } catch { /* 설정 파일이 없거나 읽지 못하면 다음 차례 */ }
  if (fs.existsSync(path.join(configDir, 'backup', '.git'))) {
    const o = await originOf(path.join(configDir, 'backup'))
    if (o) return o
  }
  return null
}

/**
 * 개인 저장소 사본을 준비한다. 이미 있으면 그대로 둔다.
 * 폴더에 파일이 있는데 git이 아니면(받지 못한 사이에 피드백을 남긴 경우) 그 파일을 잃지 않게
 * .git만 받아 붙이고, 이 폴더에 없는 GitHub 파일만 꺼낸다. 남긴 파일은 바뀐 것으로 남아 다음 올리기 때 올라간다.
 */
export async function ensurePersonalClone(dir: string, remote: string): Promise<void> {
  if (fs.existsSync(path.join(dir, '.git'))) return
  const hasFiles = fs.existsSync(dir) && fs.readdirSync(dir).length > 0
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  if (!hasFiles) {
    fs.rmSync(dir, { recursive: true, force: true })
    await gitRun(['clone', '--quiet', remote, dir], { timeout: GIT_TIMEOUT.clone })
    return
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-personal-'))
  try {
    await gitRun(['clone', '--quiet', '--no-checkout', remote, tmp], { timeout: GIT_TIMEOUT.clone })
    fs.renameSync(path.join(tmp, '.git'), path.join(dir, '.git'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  await git(dir, ['reset', '--quiet'])
  const missing = (await git(dir, ['ls-files', '--deleted'])).split('\n').filter(Boolean)
  if (missing.length) await git(dir, ['checkout', '--', ...missing])
}

/**
 * GitHub의 새 내용(에이전트가 적은 처리 기록 feedback/status.yaml 등)을 사본에 받는다.
 * 앞으로 감기만 되면 감고, 아니면 합친다. 합치다 부딪히면 그만두고(사본은 그대로) 오류를 돌려준다.
 */
export function pullPersonal(dir: string): Promise<{ ok: boolean; error?: string }> {
  return withRepoLock(dir, () => pullNow(dir))
}

async function pullNow(dir: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await git(dir, ['fetch', '--quiet', 'origin'])
    const upstream = await git(dir, ['rev-parse', '--verify', '--quiet', '@{upstream}']).catch(() => '')
    if (!upstream) return { ok: true }
    try {
      await git(dir, ['merge', '--ff-only', '--quiet', '@{upstream}'])
    } catch {
      try {
        await git(dir, ['-c', 'user.name=research-workspace', '-c', 'user.email=research-workspace@localhost', 'merge', '--no-edit', '--quiet', '@{upstream}'])
      } catch (e) {
        await git(dir, ['merge', '--abort']).catch(() => undefined)
        throw e
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as { stderr?: string }).stderr || (e as Error).message).split('\n')[0] }
  }
}

/** github.com 주소에서 owner/name (https · ssh 둘 다). GitHub가 아니면 null */
export function githubRepoOf(url: string): string | null {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

type GithubFetch = (url: string) => Promise<Response>
let githubFetch: GithubFetch = (url) => fetch(url, { headers: { 'user-agent': 'Emergence Workbench', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) })
/** 테스트가 바깥 연결 대신 쓴다 */
export function useGithubFetch(f: GithubFetch): void { githubFetch = f; publicCache.clear() }
const publicCache = new Map<string, { at: number; open: boolean }>()

/**
 * 개인 저장소에 올리기 전에 그 저장소가 공개가 아닌지 본다 (보안 검토 L4, 10/19).
 * 로그인 없이 GitHub API로 읽히면 공개 저장소다: 피드백 · 앱 설정 · workbench 백업이 공개로 나가지 않게 올리지 않는다.
 * 404(비공개거나 없음) · 네트워크 실패 · GitHub가 아닌 주소는 막지 않는다(올리기 자체가 알아서 실패한다). 한 시간 기억한다.
 */
export async function assertPrivateRemote(dir: string): Promise<void> {
  const origin = await originOf(dir)
  const repo = origin && githubRepoOf(origin)
  if (repo && await isPublicOnGitHub(repo)) throw new PersonalRepoPublicError(repo)
}

/** owner/name이 로그인 없이 GitHub API로 읽히면(공개) true. 404 · 네트워크 실패는 false. 한 시간 기억한다 */
export async function isPublicOnGitHub(repo: string): Promise<boolean> {
  const cached = publicCache.get(repo)
  if (cached && Date.now() - cached.at < 60 * 60_000) return cached.open
  try {
    const res = await githubFetch(`https://api.github.com/repos/${repo}`)
    const open = res.ok && (await res.json() as { private?: boolean }).private === false
    publicCache.set(repo, { at: Date.now(), open })
    return open
  } catch { return false }
}

export class PersonalRepoPublicError extends Error {
  constructor(readonly repo: string) {
    super(t(`개인 저장소(${repo})가 GitHub에서 공개로 되어 있어 올리지 않았습니다. GitHub 설정에서 비공개로 바꾼 뒤 다시 올려 주세요.`,
      `The personal repository (${repo}) is public on GitHub, so nothing was pushed. Make it private in GitHub settings, then push again.`))
  }
}
