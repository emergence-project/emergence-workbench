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
import { git, gitRun, GIT_TIMEOUT } from '../git.js'
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

const gitGlobal = async (key: string): Promise<string> => {
  try { return (await gitRun(['config', '--global', '--get', key], { timeout: GIT_TIMEOUT.read })).trim() } catch { return '' }
}

export function registerSetup(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
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
    ].map((a) => ({ ...a, key: a.key as 'claude-code' | 'codex', registered: registered.includes(a.name), at: seen[a.key] ?? null }))
  }

  const view = async (): Promise<C.SetupView> => {
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
      tex: onPath('latexmk'),
    }
  }

  app.get('/api/setup', replies(C.SetupView), async (): Promise<C.SetupView> => view())

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
