// 시작 준비 (설정 › 계정, 홈의 시작 준비 카드): 공개 저장소에서 앱을 받은 사람이 쓸 준비를 한 화면에서 마친다 (10/20 15:35 피드백)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/setup'
import { parseBody, replies } from '../contract.js'
import { agentRegistered, agentSeen } from '../agentSeen.js'
import { appPath } from '../agentPaths.js'
import { otherMachineLibraries, otherMachineProjects } from '../backup.js'
import { cloneInto, defaultCloneDir, parseGitHubRepo } from '../clone.js'
import { realIO } from '../githubRepos.js'
import { git, gitRun, GIT_TIMEOUT } from '../git.js'
import { remoteOf, sameRepo } from './google.js'
import { githubRepoOf, isPublicOnGitHub, personalRemote } from '../personalRepo.js'
import { WorkbenchError } from '../workbench.js'
import { t } from '../i18n.js'
import type { RouteContext } from './context.js'

/** PATH에서 실행 파일을 찾는다 (컴파일이 같은 PATH로 latexmk를 부른다: latex.ts) */
export function onPath(cmd: string, envPath = process.env.PATH ?? ''): boolean {
  return envPath.split(path.delimiter).filter(Boolean).some((dir) => {
    try { fs.accessSync(path.join(dir, cmd), fs.constants.X_OK); return true } catch { return false }
  })
}

/**
 * scripts/install.sh가 한 일 중 앱이 볼 수 있는 것. 바탕화면은 보지 않는다(서비스가 ~/Desktop을 읽으면 macOS가 권한을 묻는다).
 * Dock은 defaults로 읽는다(맥이 아니면 없음).
 */
export function installState(home = os.homedir(), dockList?: string): Omit<C.SetupView['install'], 'command'> {
  let dock = dockList
  if (dock === undefined) {
    try { dock = execFileSync('defaults', ['read', 'com.apple.dock', 'persistent-apps'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { dock = '' }
  }
  return {
    app: fs.existsSync(path.join(home, 'Applications', 'Emergence Workbench.app')),
    dock: dock.includes('Emergence%20Workbench.app'),
    service: fs.existsSync(path.join(home, 'Library', 'LaunchAgents', 'com.research-workspace.app.plist')),
  }
}

/** 명령이 PATH(와 서비스가 보지 못하는 Homebrew · ~/.local)에 있는지. 없으면 등록 명령도 쓸 수 없다 (10/21 맥미니: Codex 없음) */
export function agentInstalled(cmd: string, home = os.homedir(), envPath = process.env.PATH ?? ''): boolean {
  return onPath(cmd, [envPath, '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local/bin'), path.join(home, '.npm-global/bin')].join(path.delimiter))
}

const gitGlobal = async (key: string): Promise<string> => {
  try { return (await gitRun(['config', '--global', '--get', key], { timeout: GIT_TIMEOUT.read })).trim() } catch { return '' }
}

export function registerSetup(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts, ensureWatch } = ctx
  // 예제 모드는 이 컴퓨터의 git 설정을 바꾸지 않는다: 이름 · 이메일을 메모리에만 둔다
  let sampleGit = { name: 'Sample Researcher', email: 'sample@example.com' }
  const gitIdentity = async () => (opts.sandbox ? sampleGit : { name: await gitGlobal('user.name'), email: await gitGlobal('user.email') })

  // 예제 모드는 이 컴퓨터의 에이전트 설정을 보지 않는다 (그림이 컴퓨터마다 달라지지 않게)
  const agentRows = (): C.SetupView['agents'] => {
    const registered = opts.sandbox ? [] : agentRegistered()
    const seen = agentSeen(opts.configDir)
    const mcp = appPath('scripts/mcp.mjs')
    return [
      { key: 'claude-code', name: 'Claude Code', command: `claude mcp add --scope user emergence-workbench -- node ${mcp}` },
      { key: 'codex', name: 'Codex', command: `codex mcp add emergence-workbench -- node ${mcp}` },
    ].map((a) => ({ ...a, key: a.key as 'claude-code' | 'codex', installed: opts.sandbox || agentInstalled(a.key === 'codex' ? 'codex' : 'claude'), registered: registered.includes(a.name), at: seen[a.key] ?? null }))
  }

  // 예제 모드: 다른 컴퓨터에 하나 더 있는 것처럼 (시작 준비 · 홈의 "다른 컴퓨터의 프로젝트" 그림)
  const SAMPLE_ELSEWHERE = [{ machine: 'Office-iMac', id: 'topology-notes', title: t('위상 노트', 'Topology notes'), remote: 'https://github.com/example-user/topology-notes.git', folder: 'topology-notes', tags: [], state: 'active' }]
  const elsewhere = async (cloneDir: string): Promise<C.SetupView['elsewhere']> => {
    // 백업 사본(한 시간마다 받음)이 먼저, 아직 없으면 시작할 때 받는 개인 저장소 사본
    const dir = [opts.backup?.dir, opts.personalDir].find((d): d is string => !!d && fs.existsSync(path.join(d, '_settings')))
    const others = opts.sandbox ? SAMPLE_ELSEWHERE : dir ? otherMachineProjects(dir) : []
    if (!others.length) return []
    const local = await Promise.all(registry.list().map(async (r) => ({ remote: await remoteOf(r.path), folder: path.basename(r.path) })))
    return others
      .filter((o) => !local.some((l) => sameRepo(l.remote, o.remote) || (!o.remote && l.folder === o.folder)))
      .map(({ id: _id, ...o }) => ({ ...o, local: !opts.sandbox && fs.existsSync(path.join(cloneDir, o.folder, '.git')) ? path.join(cloneDir, o.folder) : null }))
  }

  /** 정하지 않았으면 다른 컴퓨터가 쓰는 라이브러리와 같은 이름으로 받아 둔 폴더 */
  const librarySuggest = (cloneDir: string): string | null => {
    if (registry.libraryPath || opts.sandbox) return null
    const dir = [opts.backup?.dir, opts.personalDir].find((d): d is string => !!d && fs.existsSync(path.join(d, '_settings')))
    return (dir ? otherMachineLibraries(dir) : []).map((n) => path.join(cloneDir, n)).find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory()) ?? null
  }

  const view = async (): Promise<C.SetupView> => {
    const cloneDir = defaultCloneDir(registry.list().map((r) => r.path))
    const remote = opts.sandbox ? registry.personalRepo ?? null : await personalRemote(opts.configDir)
    let active = false
    if (remote && opts.personalDir) {
      try { active = (await git(opts.personalDir, ['remote', 'get-url', 'origin'], { timeout: GIT_TIMEOUT.read })) === remote } catch { /* 사본이 없으면 아직 받지 않은 것 */ }
    }
    return {
      git: await gitIdentity(),
      projects: registry.list().length,
      personal: { remote, active },
      agents: agentRows(),
      // 예제 모드는 이 컴퓨터를 보지 않는다 (그림이 컴퓨터마다 달라지지 않게): 다 된 것으로
      install: { ...(opts.sandbox ? { app: true, dock: true, service: true } : installState()), command: `zsh ${appPath('scripts/install.sh')}` },
      elsewhere: await elsewhere(cloneDir),
      library: { path: registry.libraryPath ?? null, suggest: librarySuggest(cloneDir) },
      cloneDir,
      tex: onPath('latexmk'),
    }
  }

  app.get('/api/setup', replies(C.SetupView), async (): Promise<C.SetupView> => view())

  /** 다른 컴퓨터의 프로젝트를 받아 등록한다. 받을 곳에 같은 저장소가 이미 있으면 받지 않고 등록만 */
  app.post('/api/setup/fetch', replies(C.SetupView), async (req): Promise<C.SetupView> => {
    const body = parseBody(C.SetupFetchBody, req.body)
    const repo = parseGitHubRepo(body.remote)
    if (!repo) throw new WorkbenchError(400, t('GitHub 저장소 주소가 아닙니다', 'Not a GitHub repository address'))
    if (opts.sandbox) throw new WorkbenchError(400, t('예제 모드에서는 받지 않습니다', 'Sample mode does not download projects'))
    const parent = defaultCloneDir(registry.list().map((r) => r.path))
    const folder = path.basename(body.folder) || repo.name
    const dest = path.join(parent, folder)
    if (fs.existsSync(dest)) {
      if (!sameRepo(await remoteOf(dest), repo.url)) throw new WorkbenchError(409, t(`${dest}에 다른 폴더가 있습니다. 홈의 "＋ 프로젝트 등록"으로 다른 곳에 받으세요.`, `${dest} holds a different folder. Use "＋ Register project" on Home to download it elsewhere.`))
    } else await cloneInto(repo.url, parent, folder)
    ensureWatch(registry.register(dest, { tags: body.tags }).id)
    return view()
  })

  app.put('/api/setup/library', replies(C.SetupView), async (req): Promise<C.SetupView> => {
    registry.setLibrary(parseBody(C.SetupLibraryBody, req.body).path.trim())
    return view()
  })

  app.put('/api/setup/git', replies(C.SetupView), async (req): Promise<C.SetupView> => {
    const body = parseBody(C.SetupGitBody, req.body)
    const name = body.name.replace(/\s+/g, ' ').trim()
    const email = body.email.trim()
    if (!name) throw new WorkbenchError(400, t('이름을 적어 주세요', 'Enter a name'))
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new WorkbenchError(400, t('이메일 주소가 아닙니다', 'Not an email address'))
    if (opts.sandbox) sampleGit = { name, email }
    else {
      await gitRun(['config', '--global', 'user.name', name], { timeout: GIT_TIMEOUT.read })
      await gitRun(['config', '--global', 'user.email', email], { timeout: GIT_TIMEOUT.read })
    }
    return view()
  })

  /**
   * 개인 저장소를 GitHub에 바로 만든다 (10/22 피드백 "저장소들 중에서 고르거나, 없으면 바로 만들 수 있게").
   * 이 컴퓨터의 gh 로그인으로 비공개 저장소를 만들고 그 주소를 개인 저장소로 정한다. 예제 모드는 만들지 않고 정하기만 한다
   */
  app.post('/api/setup/personal/create', replies(C.SetupView), async (req): Promise<C.SetupView> => {
    const name = parseBody(C.SetupPersonalCreateBody, req.body).name.trim()
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..') throw new WorkbenchError(400, t('저장소 이름은 영문 · 숫자 · . _ - 로만 적습니다', 'Use only letters, digits, . _ - in the repository name'))
    let url: string
    if (opts.sandbox) url = `https://github.com/example-user/${name}`
    else {
      const io = opts.repoIO ?? realIO
      try {
        url = (await io.run('gh', ['repo', 'create', name, '--private', '--add-readme', '--description', 'Emergence Workbench personal repository (feedback, settings backup)'])).trim().split('\n').pop()!.trim()
      } catch (e) {
        const msg = String((e as { stderr?: string }).stderr || (e as Error).message).trim().split('\n').pop()
        throw new WorkbenchError(502, t(`GitHub에 만들지 못했습니다: ${msg}`, `Could not create it on GitHub: ${msg}`))
      }
      if (!githubRepoOf(url)) throw new WorkbenchError(502, t(`GitHub가 돌려준 주소를 알아보지 못했습니다: ${url}`, `Could not read the address GitHub returned: ${url}`))
    }
    registry.setPersonalRepo(url)
    return view()
  })

  app.put('/api/setup/personal', replies(C.SetupView), async (req): Promise<C.SetupView> => {
    const remote = parseBody(C.SetupPersonalBody, req.body).remote.trim()
    if (remote) {
      const repo = githubRepoOf(remote)
      if (!repo) throw new WorkbenchError(400, t('GitHub 저장소 주소가 아닙니다 (예: https://github.com/이름/저장소)', 'Not a GitHub repository address (for example https://github.com/name/repo)'))
      // 피드백 · 설정 백업이 공개로 나가지 않게 (personalRepo.ts의 올리기 전 확인과 같은 것)
      if (await isPublicOnGitHub(repo)) throw new WorkbenchError(400, t(`${repo}는 공개 저장소입니다. 비공개 저장소를 적어 주세요.`, `${repo} is a public repository. Enter a private one.`))
    }
    registry.setPersonalRepo(remote)
    return view()
  })
}
