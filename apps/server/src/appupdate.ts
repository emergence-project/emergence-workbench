import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import YAML from 'yaml'
import { withRepoLock } from './repoLock.js'
import { t } from './i18n.js'

const exec = promisify(execFile)

/**
 * 앱(research-workspace) 자신의 업데이트. 설정 화면에서 "GitHub에 새 버전이 있는지" 보고 바로 반영한다.
 * 맥에서 고치는 것은 피드백(feedback/)뿐이고 코드는 클라우드에서 고친다는 운영 방식에 맞춘다:
 * - feedback/ 밖의 추적 파일이 바뀌어 있거나, feedback/ 밖을 고친 로컬 커밋이 있으면 손대지 않고 멈춘다.
 * - feedback/의 새 코멘트는 먼저 커밋해 GitHub 쪽 새 커밋 위에 얹고(rebase) 함께 올린다.
 */
export interface AppStatus {
  /** 지금 돌고 있는 코드의 커밋 */
  running: string
  /** 저장소의 현재 커밋 (받았지만 아직 다시 시작하지 않았으면 running과 다르다) */
  head: string
  branch: string | null
  upstream: string | null
  /** GitHub에만 있는 커밋 수 */
  behind: number
  /** 업데이트를 막는 이유. 없으면 null */
  blocked: string | null
  fetchError?: string
  /** 최근 GitHub 커밋 제목 (behind만큼, 최대 10개) */
  incoming: string[]
  /** 이번 업데이트로 처리 기록이 새로 생기거나 바뀐 피드백 (지금 도는 버전과 받을 버전의 feedback/status.yaml 비교) */
  resolved: ResolvedFeedback[]
  /** 받은 커밋(head)을 미리 빌드해 두어 다시 시작만 하면 되는지 */
  prepared: boolean
}

export interface ResolvedFeedback {
  /** status.yaml의 키 (날짜 시각 부위) */
  key: string
  state: string
  /** 교정한 원문 (없으면 읽어 낸 요구) */
  text: string
  /** 무엇을 했는지 / 답 */
  note?: string
}

const FEEDBACK = 'feedback'
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
const firstLine = (e: unknown) => String((e as { stderr?: string }).stderr || (e as Error).message || e).split('\n').find((l) => l.trim()) ?? t('알 수 없는 오류', 'Unknown error')

async function git(root: string, ...args: string[]): Promise<string> {
  return (await exec('git', ['-C', root, ...args], { timeout: 60_000, env })).stdout.trim()
}

type StatusMap = Record<string, { state?: unknown; clean?: unknown; understood?: unknown; note?: unknown }>
async function statusAt(root: string, rev: string): Promise<StatusMap> {
  try {
    const doc = YAML.parse(await git(root, 'show', `${rev}:${FEEDBACK}/status.yaml`))
    return doc && typeof doc === 'object' ? doc as StatusMap : {}
  } catch {
    return {}
  }
}

/** from에서 to 사이에 반영·답변·보류로 기록이 생기거나 state·note가 바뀐 피드백 */
async function resolvedBetween(root: string, from: string, to: string): Promise<ResolvedFeedback[]> {
  const [a, b] = await Promise.all([statusAt(root, from), statusAt(root, to)])
  const out: ResolvedFeedback[] = []
  for (const [key, v] of Object.entries(b)) {
    if (!v || typeof v.state !== 'string') continue
    const old = a[key]
    if (old && old.state === v.state && old.note === v.note) continue
    // 승인으로 옮긴 것은 분류만 바뀐 것이라 "업데이트로 바뀐 것"에 넣지 않는다
    if (old && v.state === '승인') continue
    const text = typeof v.clean === 'string' ? v.clean : typeof v.understood === 'string' ? v.understood : key
    out.push({ key, state: v.state, text, ...(typeof v.note === 'string' ? { note: v.note } : {}) })
  }
  return out
}

/** 빌드 오류에서 이유 한 줄: vite는 "error during build:" 다음 줄에 이유를 적는다 */
export function buildReason(e: unknown): string {
  const { stderr = '', stdout = '' } = e as { stderr?: string; stdout?: string }
  const lines = `${stderr}\n${stdout}`.split('\n').map((l) => l.trim()).filter(Boolean)
  const at = lines.findIndex((l) => /^error during build:?$/i.test(l))
  return at >= 0 && lines[at + 1] ? lines[at + 1]! : firstLine(e)
}

const outsideFeedback = (paths: string[]) => paths.filter((p) => p && !p.startsWith(`${FEEDBACK}/`))

/**
 * 화면은 몇 분마다, 그리고 설정 화면과 제목줄이 동시에 확인을 부른다. 같은 저장소의 fetch가 겹치면
 * git 잠금 오류가 나므로, 진행 중인 fetch는 함께 기다린다.
 */
const fetching = new Map<string, Promise<string | undefined>>()
function fetchOnce(root: string, remote: string): Promise<string | undefined> {
  const key = `${root}\0${remote}`
  let run = fetching.get(key)
  if (!run) {
    run = git(root, 'fetch', '--quiet', remote).then(() => undefined, (e) => firstLine(e)).finally(() => fetching.delete(key))
    fetching.set(key, run)
  }
  return run
}

async function inspect(root: string, running: string, fetch: boolean): Promise<AppStatus> {
  const head = await git(root, 'rev-parse', 'HEAD')
  let branch: string | null = null
  let upstream: string | null = null
  try {
    branch = await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')
    upstream = await git(root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')
  } catch {
    return { running, head, branch, upstream: null, behind: 0, blocked: t('이 브랜치가 GitHub 브랜치를 추적하지 않습니다', 'This branch does not track a GitHub branch'), incoming: [], resolved: [], prepared: false }
  }
  let fetchError: string | undefined
  if (fetch) fetchError = await fetchOnce(root, upstream.split('/')[0]!)
  const behind = Number(await git(root, 'rev-list', '--count', 'HEAD..@{upstream}'))
  // 합치기 커밋(Merge pull request …)은 내용이 없어 뺀다
  // 받기 전이면 GitHub에만 있는 것, 받아 두었으면(다시 시작 전) 지금 도는 버전 뒤의 것
  const range = behind ? 'HEAD..@{upstream}' : head !== running ? `${running}..${head}` : null
  const incoming = range ? (await git(root, 'log', '--no-merges', '--format=%s', '-n', '10', range).catch(() => '')).split('\n').filter(Boolean) : []
  // 지금 도는 버전에서 받을(또는 받아 두고 아직 다시 시작하지 않은) 버전까지 처리된 피드백
  const target = behind ? '@{upstream}' : head
  const resolved = target === running ? [] : await resolvedBetween(root, running, target)

  const changed = outsideFeedback((await git(root, 'diff', '--name-only', 'HEAD')).split('\n'))
  const localCommits = outsideFeedback((await git(root, 'diff', '--name-only', '@{upstream}...HEAD')).split('\n'))
  const blocked = changed.length
    ? t(`이 맥에서 고친 파일이 있어 자동으로 받지 않습니다: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ` 외 ${changed.length - 3}개` : ''}`, `Not pulling automatically because files were edited on this Mac: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ` and ${changed.length - 3} more` : ''}`)
    : localCommits.length
      ? t(`이 맥에만 있는 커밋이 코드를 바꿔 자동으로 받지 않습니다 (${localCommits.slice(0, 3).join(', ')}). 터미널에서 git pull로 합쳐 주세요`, `Not pulling automatically because commits only on this Mac change the code (${localCommits.slice(0, 3).join(', ')}). Merge them with git pull in a terminal`)
      : null
  const prepared = head !== running && behind === 0 && nextBuildOf(root) === head
  return { running, head, branch, upstream, behind, blocked, fetchError, incoming, resolved, prepared }
}

export function appStatus(root: string, running: string, opts: { fetch?: boolean } = {}): Promise<AppStatus> {
  return inspect(root, running, !!opts.fetch)
}

export interface UpdateSteps {
  /** 의존성 설치 (package.json·잠금 파일이 바뀌었을 때만) */
  install(root: string): Promise<void>
  /** 화면 빌드: 지금 내보내는 apps/web/dist는 그대로 두고 apps/web/dist-next에 만든다 (다시 시작할 때 바꿔 단다) */
  build(root: string): Promise<void>
  /** 서비스 다시 시작. 서비스로 돌고 있지 않으면 false */
  restart(): boolean
  /** 스스로 다시 시작할 수 있는지 (launchd 서비스로 돌 때만). 자동 업데이트는 이때만 돈다 */
  canRestart(): boolean
}

/**
 * 미리 빌드한 화면 (10/9 자동 업데이트): 받은 새 커밋의 화면을 dist-next에 빌드하고 그 커밋을 .commit에 적는다.
 * 지금 도는 서버는 계속 dist를 내보내므로, 창을 새로 읽어도 옛 서버와 새 화면이 섞이지 않는다.
 * 서버가 그 커밋으로 다시 켜질 때 promoteNextBuild가 dist-next를 dist로 바꿔 단다.
 */
const NEXT_DIR = 'apps/web/dist-next'
const nextMarker = (root: string) => path.join(root, NEXT_DIR, '.commit')
export function nextBuildOf(root: string): string | null {
  try { return fs.readFileSync(nextMarker(root), 'utf8').trim() || null } catch { return null }
}

/** 서버가 켜질 때: 지금 커밋으로 미리 빌드해 둔 화면이 있으면 dist로 바꿔 단다. 바꿔 달았으면 true */
export function promoteNextBuild(root: string, running: string): boolean {
  if (nextBuildOf(root) !== running) return false
  const next = path.join(root, NEXT_DIR)
  const dist = path.join(root, 'apps/web/dist')
  fs.rmSync(nextMarker(root), { force: true })
  fs.rmSync(dist, { recursive: true, force: true })
  fs.renameSync(next, dist)
  return true
}

export class UpdateError extends Error {}

export interface UpdateResult { status: AppStatus; restarting: boolean; message: string }

/**
 * GitHub의 새 커밋을 받아 의존성·화면을 갖추고 다시 시작한다. 받을 것이 없어도 아직 반영 안 된 커밋이 있으면 다시 시작한다.
 * restart: false면 받고 빌드까지만 한다 (자동 업데이트: 다시 시작은 쉴 때나 상단바 버튼으로)
 */
export function updateApp(root: string, running: string, steps: UpdateSteps, opts: { restart?: boolean } = {}): Promise<UpdateResult> {
  return withRepoLock(root, () => updateAppNow(root, running, steps, opts.restart ?? true))
}

async function updateAppNow(root: string, running: string, steps: UpdateSteps, restart: boolean): Promise<UpdateResult> {
  const before = await inspect(root, running, true)
  if (before.fetchError) throw new UpdateError(t(`GitHub를 확인하지 못했습니다: ${before.fetchError}`, `Could not check GitHub: ${before.fetchError}`))
  if (before.blocked) throw new UpdateError(before.blocked)

  if (before.behind > 0) {
    // 새 피드백은 먼저 커밋해 두어야 작업 트리가 깨끗해진다 (feedback/ 밖은 inspect가 이미 확인했다)
    if (await git(root, 'status', '--porcelain', '--', FEEDBACK)) {
      await git(root, 'add', '--', FEEDBACK)
      await git(root, 'commit', '--only', '-m', 'Add app feedback', '--', FEEDBACK)
    }
    const ahead = Number(await git(root, 'rev-list', '--count', '@{upstream}..HEAD'))
    try {
      if (ahead > 0) await git(root, 'rebase', '--quiet', '@{upstream}')
      else await git(root, 'merge', '--ff-only', '--quiet', '@{upstream}')
    } catch (e) {
      if (ahead > 0) await git(root, 'rebase', '--abort').catch(() => undefined)
      throw new UpdateError(t(`받아오지 못했습니다. 아무것도 바꾸지 않았습니다: ${firstLine(e)}`, `Could not pull. Nothing was changed: ${firstLine(e)}`))
    }
    if (ahead > 0) await git(root, 'push', '--quiet').catch(() => undefined) // 피드백은 다음에 다시 올려도 된다
  }

  const head = await git(root, 'rev-parse', 'HEAD')
  if (head === running) return { status: await inspect(root, running, false), restarting: false, message: t('이미 최신입니다', 'Already up to date') }
  if (nextBuildOf(root) !== head) {
    const deps = (await git(root, 'diff', '--name-only', running, head, '--', 'package.json', 'pnpm-lock.yaml', '*/package.json', '*/*/package.json')).trim()
    try {
      if (deps) await steps.install(root)
      fs.rmSync(nextMarker(root), { force: true })
      await steps.build(root)
      fs.mkdirSync(path.dirname(nextMarker(root)), { recursive: true })
      fs.writeFileSync(nextMarker(root), `${head}\n`)
    } catch (e) {
      throw new UpdateError(t(`코드는 받았지만 ${deps ? '설치·' : ''}빌드에 실패했습니다. 지금 앱은 이전 버전으로 계속 돕니다: ${buildReason(e)}`, `The code was pulled, but the ${deps ? 'install or ' : ''}build failed. The app keeps running the previous version: ${buildReason(e)}`))
    }
  }
  if (!restart) return { status: await inspect(root, running, false), restarting: false, message: t('새 버전을 받아 두었습니다. 다시 시작하면 반영됩니다', 'The new version is ready. Restart to apply it') }
  const restarting = steps.restart()
  return {
    status: await inspect(root, running, false), restarting,
    message: restarting ? t('업데이트했습니다. 앱이 다시 시작됩니다', 'Updated. The app is restarting') : t('업데이트했습니다. 터미널에서 앱(pnpm start)을 다시 시작하면 반영됩니다', 'Updated. Restart the app (pnpm start) in a terminal to apply it'),
  }
}

/** 실제 맥에서 쓰는 단계: pnpm으로 설치·빌드하고, 백그라운드 서비스면 launchd에 다시 시작을 맡긴다 */
export const macSteps = (serviceLabel = 'com.research-workspace.app'): UpdateSteps => ({
  async install(root) { await exec('pnpm', ['install', '--frozen-lockfile'], { cwd: root, timeout: 600_000, env }) },
  async build(root) { await exec('pnpm', ['--filter', '@rw/web', 'exec', 'vite', 'build', '--outDir', 'dist-next', '--emptyOutDir'], { cwd: root, timeout: 600_000, env }) },
  // launchd가 띄운 서비스일 때만 (터미널의 pnpm start는 사용자가 다시 켠다)
  canRestart: () => process.env.XPC_SERVICE_NAME === serviceLabel && typeof process.getuid === 'function',
  restart() {
    if (!this.canRestart()) return false
    // 응답을 보낸 뒤에 스스로를 다시 시작한다. 서비스는 KeepAlive라 꺼져도 다시 켜진다
    spawn('/bin/zsh', ['-c', `sleep 1; launchctl kickstart -k gui/${process.getuid!()}/${serviceLabel}`], { detached: true, stdio: 'ignore' }).unref()
    return true
  },
})

export interface AppInfo {
  /** 지금 도는 버전: 번호(1.11 꼴), 커밋과 그 날짜 */
  version: { number: string; commit: string; date: string }
  /** 앱 코드가 있는 폴더 */
  root: string
  branch: string | null
  /** 받는 곳 (GitHub 주소) */
  remote: string | null
  /** 업데이트 이력: 지금 버전까지 합쳐진 최근 변경, 최근 것부터 (피드백 올리기 커밋은 뺀다) */
  history: { commit: string; version: string; time: string; title: string; pr?: number }[]
}

/**
 * 버전 번호 (10/8 "앱 버젼관리에 넘버링을 두자. 1.11 이런식으로"): main에 합쳐진 변경 하나마다
 * 뒤 번호가 하나 오른다. 앞 번호는 아래 표의 커밋부터 바뀐다. 그 커밋이 그 앞 번호의 .0이다.
 * 앞 번호를 올리려면 표에 한 줄을 더한다. 표의 첫 커밋보다 앞선 변경은 0.n이다.
 */
export const MAJOR_VERSIONS: { major: number; from: string }[] = [
  { major: 1, from: 'aff30a5f22c0f53dedb61f4674285e9b6eeff602' }, // #314 (2026-10-07)
]

const isFeedbackUpload = (subject: string) => /^Add app feedback\b/.test(subject)

/** 첫 부모를 따라 오래된 것부터 놓인 커밋들에 번호를 매긴다 */
export function numberVersions(commits: string[], majors = MAJOR_VERSIONS): string[] {
  let major = 0
  let minor = 0
  return commits.map((c, i) => {
    const m = majors.find((x) => x.from.startsWith(c) || c.startsWith(x.from))
    if (m) { major = m.major; minor = 0 } else if (i > 0) minor++
    return `${major}.${minor}`
  })
}

/** 커밋 제목에서 PR 번호와 내용: 합치기(squash)는 "제목 (#n)", 합치기 커밋은 "Merge pull request #n …" 다음 줄이 제목 */
export function parseSubject(subject: string, body = ''): { title: string; pr?: number } {
  const squash = /^(.*?)\s*\(#(\d+)\)\s*$/.exec(subject)
  if (squash) return { title: squash[1]!, pr: Number(squash[2]) }
  const merge = /^Merge pull request #(\d+)\b/.exec(subject)
  if (merge) return { title: body.split('\n').find((l) => l.trim())?.trim() || subject, pr: Number(merge[1]) }
  return { title: subject }
}

/** git 원격 주소 → 웹 주소 (git@github.com:a/b.git → https://github.com/a/b) */
export function webRemote(url: string): string {
  return url.trim().replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')
}

/**
 * 앱 저장소의 새 이슈 주소 (피드백 모드 "GitHub에 보내기", 2026-10-08 결정 docs/maintaining.md).
 * github.com 저장소일 때만. 다른 곳이면 null
 */
export async function appIssuesUrl(root: string): Promise<string | null> {
  const url = await git(root, 'remote', 'get-url', 'origin').catch(() => '')
  const web = url ? webRemote(url) : ''
  return /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(web) ? `${web}/issues/new` : null
}

/** 설정 › 앱 기본정보 (10/4 18:17 "앱 기본정보로 바꾸고, 앱에 대한 버젼관리와 함께 기본정보를 기술해줘") */
export async function appInfo(root: string, running: string, limit = 20): Promise<AppInfo> {
  const date = await git(root, 'show', '-s', '--format=%cs', running).catch(() => '')
  const branch = await git(root, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => null)
  const url = await git(root, 'remote', 'get-url', 'origin').catch(() => '')
  const remote = url ? webRemote(url) : null
  // 번호를 매기려면 처음부터 다 읽는다 (제목만. 몸말은 합치기 커밋의 PR 제목이 필요할 때만 따로 읽는다)
  const log = await git(root, 'log', '--first-parent', '--date=format-local:%Y-%m-%d %H:%M', '--format=%H%x09%cd%x09%s', running).catch(() => '')
  const commits = log.split('\n').filter(Boolean)
    .map((l) => { const [commit, time, ...rest] = l.split('\t'); return { commit: commit!, time: time!, subject: rest.join('\t') } })
    .filter((c) => !isFeedbackUpload(c.subject))
    .reverse()
  const numbers = numberVersions(commits.map((c) => c.commit))
  const recent = commits.map((c, i) => ({ ...c, version: numbers[i]! })).reverse()
  const now = recent.find((c) => c.commit.startsWith(running) || running.startsWith(c.commit))?.version ?? recent[0]?.version ?? ''
  const history = await Promise.all(recent.slice(0, limit).map(async (c) => {
    const body = /^Merge pull request #/.test(c.subject) ? await git(root, 'show', '-s', '--format=%b', c.commit).catch(() => '') : ''
    return { commit: c.commit.slice(0, 7), version: c.version, time: c.time, ...parseSubject(c.subject, body) }
  }))
  return { version: { number: now, commit: running.slice(0, 7), date }, root, branch, remote, history }
}
