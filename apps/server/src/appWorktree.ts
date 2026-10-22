/**
 * 앱 고치기 대화의 작업 폴더와 PR (2단계, 2026-10-21 사용자 결정 "앱 안 대화", 10/22 "권한 넓히기").
 * - 대화마다 앱 저장소의 worktree를 따로 둔다. 실사용 앱이 도는 폴더와 사용자가 고치던 파일은 건드리지 않는다.
 * - 에이전트는 작업 폴더에서 명령(시험 · 형식 검사 · 화면 그림)을 돌린다(10/22 사용자 결정 "권한 넓히기").
 *   올리기 · PR 열기 · CI 결과 받기 · 합치기는 여기의 정해 둔 코드가 한다. 대화마다 자기 브랜치 · PR이라 다른 PR이 열려 있어도 올린다.
 * 대화를 지우면 작업 폴더를 치운다(브랜치와 PR은 남는다).
 */
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { git, GIT_TIMEOUT } from './git.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

const exec = promisify(execFile)

export interface AppPr { number: number; url: string; created: boolean }
export interface AppCheck { name: string; state: string; link?: string }
export interface AppChecks { pr?: number; checks: AppCheck[]; done: boolean; ok: boolean; log?: string }
/** 작업 폴더에서 main 갈래 이후 바뀐 파일 하나 (올린 것 · 올리지 않은 것 · 새 파일 모두). patch = 그 파일의 git diff (줄임) */
export interface FileDiff { file: string; added: number; removed: number; patch: string }
/** 작업 폴더 한 때의 모습 (되돌리기): 그때 파일 전부의 git tree와 HEAD */
export interface Snap { tree: string; head: string }

export interface AppWork {
  /** 대화 하나의 작업 폴더와 브랜치 (이미 있으면 그대로). origin/main에서 새로 연다 */
  prepare(id: string): Promise<{ dir: string; branch: string }>
  /** 작업 폴더를 치운다 */
  dispose(dir: string): Promise<void>
  /** 바뀐 것을 모두 커밋해 브랜치를 올리고, PR이 없으면 연다 */
  submit(dir: string, branch: string, o: { title: string; body: string }): Promise<AppPr>
  /** 그 브랜치 PR의 CI. 실패한 것이 있으면 실패 기록 끝부분 */
  checks(dir: string, branch: string): Promise<AppChecks>
  /** 그 브랜치의 PR을 합친다 (squash, 제목 "<PR 제목> (#n)"). 합친 커밋을 돌려준다 */
  merge(dir: string, branch: string): Promise<{ number: number; sha: string }>
  /** 그 브랜치의 PR이 main과 부딪혀 합칠 수 없는지 (모르면 false) */
  conflicted?(dir: string, branch: string): Promise<boolean>
  /** 그 브랜치의 마지막 CI가 찍은 화면 그림 하나 (산출물 shots의 <name>.png). 없으면 null */
  shot(dir: string, branch: string, name: string): Promise<Buffer | null>
  /** 관리자 개인 규칙 파일 (맥 사본이 있으면 안내에 적는다) */
  rules?: string
  /** 작업 폴더에서 바뀐 파일 (명령으로 고친 것도 대화에 보이려고) */
  diff?(dir: string): Promise<FileDiff[]>
  /** 작업 폴더의 지금 모습을 찍어 둔다 (무시하는 파일은 빼고 새 파일은 넣는다) */
  snapshot?(dir: string): Promise<Snap>
  /** 찍어 둔 모습으로 파일을 되돌린다. 그 뒤에 커밋했으면 하지 않는다. 바뀐 파일 수를 돌려준다 */
  restore?(dir: string, snap: Snap): Promise<number>
}

/** 대화 id에서 브랜치 이름 (claude/app-<뒤 8자>) */
export const appBranch = (id: string) => `claude/app-${id.replace(/[^\w-]/g, '').slice(-8)}`

/** gh를 정해 둔 인자로만 부른다 (셸 없이) */
async function gh(dir: string, args: string[]): Promise<string> {
  const r = await exec('gh', args, { cwd: dir, timeout: GIT_TIMEOUT.remote, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } })
  return r.stdout
}

/** CI 기록에서 보일 끝부분 (에이전트가 읽기에 충분하게, 너무 길지 않게) */
const tail = (s: string, n = 12000) => (s.length > n ? s.slice(-n) : s)

const DONE = new Set(['SUCCESS', 'FAILURE', 'CANCELLED', 'SKIPPED', 'NEUTRAL', 'TIMED_OUT', 'ACTION_REQUIRED', 'STALE', 'ERROR'])
const OK = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL'])

/** 실제: 앱 저장소(root)의 worktree를 base/<대화 id>에, PR은 gh로 */
export function appWorktrees(root: string, base: string, rules?: string): AppWork {
  const prOf = async (dir: string, branch: string): Promise<{ number: number; url: string } | undefined> => {
    const list = JSON.parse(await gh(dir, ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number,url'])) as { number: number; url: string }[]
    return list[0]
  }
  return {
    rules: rules && fs.existsSync(rules) ? rules : undefined,
    async prepare(id) {
      const dir = path.join(base, id)
      const branch = appBranch(id)
      if (fs.existsSync(path.join(dir, '.git'))) return { dir, branch }
      fs.mkdirSync(base, { recursive: true })
      await git(root, ['fetch', 'origin', 'main'])
      await git(root, ['worktree', 'add', '-B', branch, dir, 'origin/main'])
      // 에이전트가 바로 시험을 돌리게 의존성을 깐다 (받아 둔 저장소에서. 실패해도 에이전트가 다시 할 수 있다)
      await exec('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: dir, timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 }).catch(() => undefined)
      return { dir, branch }
    },
    diff: worktreeDiff,
    snapshot: worktreeSnapshot,
    restore: worktreeRestore,
    async dispose(dir) {
      await git(root, ['worktree', 'remove', '--force', dir]).catch(() => undefined)
      fs.rmSync(dir, { recursive: true, force: true })
      await git(root, ['worktree', 'prune']).catch(() => undefined)
    },
    async submit(dir, branch, o) {
      await git(dir, ['add', '-A'])
      const staged = (await git(dir, ['diff', '--cached', '--name-only'])).trim()
      if (staged) await git(dir, ['commit', '-m', `${o.title}\n\n${o.body}`.trim()])
      const ahead = (await git(dir, ['rev-list', '--count', 'origin/main..HEAD'])).trim()
      if (ahead === '0') throw new WorkbenchError(400, t('바뀐 것이 없어 올리지 않았습니다', 'Nothing changed, so nothing was pushed'))
      await git(dir, ['push', '-u', 'origin', `HEAD:refs/heads/${branch}`])
      const had = await prOf(dir, branch)
      if (had) return { ...had, created: false }
      await gh(dir, ['pr', 'create', '--base', 'main', '--head', branch, '--title', o.title, '--body', o.body])
      const made = await prOf(dir, branch)
      if (!made) throw new WorkbenchError(500, t('PR을 열었는지 확인하지 못했습니다', 'Could not confirm the PR was opened'))
      return { ...made, created: true }
    },
    async checks(dir, branch) {
      const pr = await prOf(dir, branch)
      if (!pr) return { checks: [], done: false, ok: false }
      let rows: { name: string; state: string; link?: string }[] = []
      try {
        rows = JSON.parse(await gh(dir, ['pr', 'checks', String(pr.number), '--json', 'name,state,link'])) as typeof rows
      } catch (e) {
        // gh pr checks는 실패한 검사가 있으면 1로 끝나지만 JSON은 낸다
        const out = (e as { stdout?: string }).stdout
        if (!out) throw e
        rows = JSON.parse(out) as typeof rows
      }
      const checks = rows.map((r) => ({ name: r.name, state: r.state.toUpperCase(), ...(r.link && { link: r.link }) }))
      const done = checks.length > 0 && checks.every((c) => DONE.has(c.state))
      const ok = done && checks.every((c) => OK.has(c.state))
      let log: string | undefined
      const failed = checks.find((c) => done && !OK.has(c.state) && c.link)
      const run = failed?.link?.match(/\/actions\/runs\/(\d+)/)?.[1]
      if (run) log = tail(await gh(dir, ['run', 'view', run, '--log-failed']).catch((e: Error) => e.message))
      return { pr: pr.number, checks, done, ok, ...(log && { log }) }
    },
    async merge(dir, branch) {
      const pr = await prOf(dir, branch)
      if (!pr) throw new WorkbenchError(409, t('합칠 PR이 없습니다', 'There is no PR to merge'))
      const v = JSON.parse(await gh(dir, ['pr', 'view', String(pr.number), '--json', 'title,headRefOid'])) as { title: string; headRefOid: string }
      // 확인한 뒤 누가 더 올렸으면 합치지 않는다 (--match-head-commit). 업데이트 이력은 커밋 제목을 읽으므로 한국어 제목 그대로
      await gh(dir, ['pr', 'merge', String(pr.number), '--squash', '--subject', `${v.title} (#${pr.number})`, '--match-head-commit', v.headRefOid])
      await git(dir, ['push', 'origin', '--delete', branch]).catch(() => undefined)
      const m = JSON.parse(await gh(dir, ['pr', 'view', String(pr.number), '--json', 'mergeCommit'])) as { mergeCommit?: { oid?: string } | null }
      return { number: pr.number, sha: m.mergeCommit?.oid ?? '' }
    },
    async conflicted(dir, branch) {
      const pr = await prOf(dir, branch)
      if (!pr) return false
      const v = JSON.parse(await gh(dir, ['pr', 'view', String(pr.number), '--json', 'mergeable'])) as { mergeable?: string }
      return v.mergeable === 'CONFLICTING'
    },
    async shot(dir, branch, name) {
      if (!/^[\w-]+$/.test(name)) return null
      const runs = JSON.parse(await gh(dir, ['run', 'list', '--branch', branch, '--workflow', 'ci.yml', '--limit', '1', '--json', 'databaseId,status'])) as { databaseId: number; status: string }[]
      const run = runs[0]
      if (!run || run.status !== 'completed') return null
      fs.mkdirSync(base, { recursive: true })
      const tmp = fs.mkdtempSync(path.join(base, '.shots-'))
      try {
        await gh(dir, ['run', 'download', String(run.databaseId), '--name', 'shots', '--dir', tmp])
        const file = path.join(tmp, `${name}.png`)
        return fs.existsSync(file) ? fs.readFileSync(file) : null
      } catch { return null } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
    },
  }
}

const MAX_PATCH = 6000

/** 작업 폴더의 바뀐 파일: main과 갈라진 곳부터 지금 파일까지 (커밋 · 올리지 않은 것 · 새 파일) */
export async function worktreeDiff(dir: string): Promise<FileDiff[]> {
  const base = (await git(dir, ['merge-base', 'HEAD', 'origin/main']).catch(() => 'HEAD')).trim() || 'HEAD'
  const out: FileDiff[] = []
  for (const line of (await git(dir, ['diff', '--numstat', base])).split('\n')) {
    const m = line.match(/^(\S+)\t(\S+)\t(.+)$/)
    if (!m) continue
    const file = m[3]!
    const patch = (await git(dir, ['diff', base, '--', file]).catch(() => '')).slice(0, MAX_PATCH)
    out.push({ file, added: Number(m[1]) || 0, removed: Number(m[2]) || 0, patch })
  }
  for (const file of (await git(dir, ['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean)) {
    let text = ''
    try { text = fs.readFileSync(path.join(dir, file), 'utf8').slice(0, MAX_PATCH) } catch { continue }
    if (text.includes('\0')) continue
    const lines = text.split('\n')
    out.push({ file, added: lines.length, removed: 0, patch: `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}` })
  }
  return out
}

/** 따로 둔 색인 파일로 git을 부른다 (작업 폴더의 색인은 건드리지 않는다) */
async function withIndex<T>(dir: string, f: (env: Record<string, string>) => Promise<T>): Promise<T> {
  const idx = path.join(os.tmpdir(), `rw-snap-${crypto.randomBytes(6).toString('hex')}`)
  try { return await f({ GIT_INDEX_FILE: idx }) } finally { fs.rmSync(idx, { force: true }) }
}

export async function worktreeSnapshot(dir: string): Promise<Snap> {
  const head = await git(dir, ['rev-parse', 'HEAD'], { timeout: GIT_TIMEOUT.read })
  const tree = await withIndex(dir, async (env) => {
    await git(dir, ['read-tree', 'HEAD'], { env })
    await git(dir, ['add', '-A'], { env })
    return git(dir, ['write-tree'], { env })
  })
  return { tree, head }
}

export async function worktreeRestore(dir: string, snap: Snap): Promise<number> {
  const head = await git(dir, ['rev-parse', 'HEAD'], { timeout: GIT_TIMEOUT.read })
  if (head !== snap.head) throw new WorkbenchError(409, t('그 뒤에 커밋해서 파일은 되돌릴 수 없습니다', 'Files cannot be restored: commits were made after that point'))
  const now = await worktreeSnapshot(dir)
  if (now.tree === snap.tree) return 0
  const changed = (await git(dir, ['diff-tree', '-r', '--name-only', '--no-renames', snap.tree, now.tree])).split('\n').filter(Boolean)
  // 그 뒤에 생긴 파일은 지우고, 나머지는 그때 내용으로 쓴다
  for (const f of (await git(dir, ['diff-tree', '-r', '--name-only', '--no-renames', '--diff-filter=A', snap.tree, now.tree])).split('\n').filter(Boolean)) fs.rmSync(path.join(dir, f), { force: true })
  await withIndex(dir, async (env) => {
    await git(dir, ['read-tree', snap.tree], { env })
    await git(dir, ['checkout-index', '-a', '-f'], { env })
  })
  await git(dir, ['reset', '-q'])
  return changed.length
}

/** 예제 모드 · 테스트: git · gh 없이 빈 폴더와 정해 둔 PR */
export function sampleAppWork(base: string, sampleShots?: string): AppWork {
  return {
    async prepare(id) {
      const dir = path.join(base, id)
      fs.mkdirSync(dir, { recursive: true })
      return { dir, branch: appBranch(id) }
    },
    async dispose(dir) { fs.rmSync(dir, { recursive: true, force: true }) },
    async submit() { return { number: 234, url: 'https://github.com/emergence-project/emergence-workbench/pull/234', created: true } },
    async checks() { return { pr: 234, checks: [{ name: 'check', state: 'SUCCESS' }], done: true, ok: true } },
    async merge() { return { number: 234, sha: '0000000000000000000000000000000000000234' } },
    // 예제의 "고친 뒤" 그림: 예제 피드백 폴더에 있는 그림을 그대로 쓴다 (없으면 없음)
    async shot(_dir, _branch, name) { const f = sampleShots && path.join(sampleShots, `${name}.png`); return f && fs.existsSync(f) ? fs.readFileSync(f) : null },
  }
}
