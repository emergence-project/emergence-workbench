import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { GitHubRepoItem as RepoItem } from '@rw/core/contract/register'
import { parseGitHubRepo } from './clone.js'
import { t } from './i18n.js'

/**
 * 등록 창의 "GitHub에서" 목록: 이 컴퓨터가 이미 로그인한 GitHub 계정의 저장소.
 * 1) gh CLI가 깔려 있고 로그인되어 있으면 `gh repo list`
 * 2) 아니면 맥의 git이 쓰는 로그인(`git credential fill`, 키체인)으로 GitHub API
 * 토큰은 이 함수 안에서만 쓰고 저장하거나 돌려주지 않는다.
 */
export type { GitHubRepoItem as RepoItem } from '@rw/core/contract/register'

export type RepoList =
  | { ok: true; source: 'gh' | 'git' | 'sample'; repos: RepoItem[] }
  | { ok: false; reason: string }

/** 밖과 닿는 부분. 테스트는 이것을 바꿔 끼운다 */
export interface RepoIO {
  /** 명령을 돌려 표준 출력을 돌려준다. 실패하면 던진다 */
  run(cmd: string, args: string[], input?: string): Promise<string>
  /** GitHub API GET. 토큰은 머리글에만 쓴다 */
  getJson(url: string, token: string): Promise<unknown>
  exists(p: string): boolean
}

const quiet = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' }

export const realIO: RepoIO = {
  run: (cmd, args, input) => new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout: 20_000, env: quiet, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
    if (input !== undefined) p.stdin?.end(input)
    else p.stdin?.end()
  }),
  getJson: async (url, token) => {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'research-workspace' }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    return res.json()
  },
  exists: (p) => fs.existsSync(p),
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** `gh repo list --json name,owner,isPrivate,description,updatedAt,url` 한 줄 */
export function fromGh(rows: unknown): Omit<RepoItem, 'registeredId' | 'localPath'>[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    const owner = str(r?.owner?.login)
    const name = str(r?.name)
    if (!owner || !name) return []
    return [{ owner, name, url: `https://github.com/${owner}/${name}`, private: !!r.isPrivate, description: str(r.description), updatedAt: str(r.updatedAt) }]
  })
}

/** GitHub API /user/repos 한 줄 */
export function fromApi(rows: unknown): Omit<RepoItem, 'registeredId' | 'localPath'>[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    const owner = str(r?.owner?.login)
    const name = str(r?.name)
    if (!owner || !name) return []
    return [{ owner, name, url: `https://github.com/${owner}/${name}`, private: !!r.private, description: str(r.description), updatedAt: str(r.pushed_at) || str(r.updated_at) }]
  })
}

/** `git credential fill`의 출력에서 password 줄만 */
export function tokenFrom(out: string): string | null {
  const line = out.split('\n').find((l) => l.startsWith('password='))
  const t = line?.slice('password='.length).trim()
  return t ? t : null
}

/** 예제 모드에서 보여 줄 목록 (네트워크 없이 화면을 볼 수 있게) */
export const SAMPLE_REPOS: Omit<RepoItem, 'registeredId' | 'localPath'>[] = [
  { owner: 'example-user', name: 'sample-research', url: 'https://github.com/example-user/sample-research', private: true, description: t('예제 연구 (이미 등록된 것)', 'Sample project (already registered)'), updatedAt: '2026-10-03T09:00:00Z' },
  { owner: 'example-user', name: 'example-notes', url: 'https://github.com/example-user/example-notes', private: true, description: t('계산 노트와 코드', 'Calculation notes and code'), updatedAt: '2026-10-02T12:00:00Z' },
  { owner: 'example-user', name: 'thesis', url: 'https://github.com/example-user/thesis', private: true, description: t('학위 논문 원고', 'Thesis manuscript'), updatedAt: '2026-09-21T08:00:00Z' },
  { owner: 'example-lab', name: 'group-seminar', url: 'https://github.com/example-lab/group-seminar', private: false, description: t('연구실 세미나 자료', 'Lab seminar materials'), updatedAt: '2026-08-30T08:00:00Z' },
  { owner: 'example-user', name: 'old-course-notes', url: 'https://github.com/example-user/old-course-notes', private: false, description: '', updatedAt: '2025-12-01T08:00:00Z' },
]

async function fetchRepos(io: RepoIO): Promise<{ source: 'gh' | 'git'; repos: Omit<RepoItem, 'registeredId' | 'localPath'>[] } | { reason: string }> {
  try {
    const out = await io.run('gh', ['repo', 'list', '--json', 'name,owner,isPrivate,description,updatedAt,url', '--limit', '200'])
    return { source: 'gh', repos: fromGh(JSON.parse(out)) }
  } catch { /* gh가 없거나 로그인 안 됨: 다음 방법 */ }
  let token: string | null = null
  try {
    token = tokenFrom(await io.run('git', ['credential', 'fill'], 'protocol=https\nhost=github.com\n\n'))
  } catch { /* 로그인 기록 없음 */ }
  if (!token) return { reason: t('이 컴퓨터에서 GitHub 로그인을 찾지 못했습니다.', 'Could not find a GitHub sign-in on this computer.') }
  try {
    const repos: Omit<RepoItem, 'registeredId' | 'localPath'>[] = []
    for (let page = 1; page <= 3; page++) {
      const rows = await io.getJson(`https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`, token)
      const got = fromApi(rows)
      repos.push(...got)
      if (!Array.isArray(rows) || rows.length < 100) break
    }
    return { source: 'git', repos }
  } catch (e) {
    return { reason: t(`GitHub에서 저장소 목록을 받지 못했습니다 (${(e as Error).message.replace(/[A-Za-z0-9_]{30,}/g, '…')}).`, `Could not get the repository list from GitHub (${(e as Error).message.replace(/[A-Za-z0-9_]{30,}/g, '…')}).`) }
  } finally {
    token = null
  }
}

/** 등록한 연구의 GitHub 주소(origin). 없으면 null */
async function originOf(io: RepoIO, dir: string): Promise<string | null> {
  // 저장소 자체의 .git이 없으면 (바깥 저장소 안의 폴더 등) 바깥 저장소의 origin을 읽게 되므로 보지 않는다
  if (!io.exists(path.join(dir, '.git'))) return null
  try {
    const url = (await io.run('git', ['-C', dir, 'remote', 'get-url', 'origin'])).trim()
    const r = parseGitHubRepo(url.replace(/^ssh:\/\/git@github\.com\//, 'git@github.com:'))
    return r ? `${r.owner}/${r.name}`.toLowerCase() : null
  } catch { return null }
}

/**
 * 받은 목록에 "등록됨"·"폴더 있음"을 붙이고 최근 고친 것부터 늘어놓는다.
 * 등록됨: 등록한 연구의 origin이 그 저장소. origin이 GitHub가 아닌 연구는 폴더 이름이 같으면 등록됨으로 본다.
 */
export async function markRepos(io: RepoIO, repos: Omit<RepoItem, 'registeredId' | 'localPath'>[], registered: Array<{ id: string; path: string }>, cloneDir: string): Promise<RepoItem[]> {
  const byOrigin = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const r of registered) {
    const o = await originOf(io, r.path)
    if (o) byOrigin.set(o, r.id)
    else byName.set(path.basename(r.path).toLowerCase(), r.id)
  }
  const out = repos.map((r): RepoItem => {
    const registeredId = byOrigin.get(`${r.owner}/${r.name}`.toLowerCase()) ?? byName.get(r.name.toLowerCase())
    if (registeredId) return { ...r, registeredId }
    const local = path.join(cloneDir, r.name)
    return io.exists(local) ? { ...r, localPath: local } : r
  })
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function listGitHubRepos(io: RepoIO, registered: Array<{ id: string; path: string }>, cloneDir: string, sample = false): Promise<RepoList> {
  const got = sample ? { source: 'sample' as const, repos: SAMPLE_REPOS } : await fetchRepos(io)
  if ('reason' in got) return { ok: false, reason: got.reason }
  return { ok: true, source: got.source, repos: await markRepos(io, got.repos, registered, cloneDir) }
}
