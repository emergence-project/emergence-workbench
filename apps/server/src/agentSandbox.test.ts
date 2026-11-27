import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gitDirsOf, sandboxFor } from './agentSandbox.js'
import { judge, type PolicyCtx } from './agentPolicy.js'

// 11/27 연구 대화의 OS 격리: 앱이 에이전트에 넘기는 설정 (실제 격리는 맥에서 시험했다, 설계 문서 3절)
describe('격리 설정', () => {
  let tmp = ''
  beforeAll(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rw-sbx-'))) })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'ignore' })

  it('보통 저장소: 훅 · 설정 · 함께 읽는 폴더는 쓰기를 막고, 앱 설정 폴더 · 열쇠는 읽기를 막는다. 비밀 환경 변수는 명령에 주지 않는다', () => {
    const repo = path.join(tmp, 'repo'), lib = path.join(tmp, 'lib'), cfg = path.join(tmp, 'cfg')
    fs.mkdirSync(repo); git(repo, 'init', '-q')
    const s = sandboxFor({ cwd: repo, readable: [lib], app: false, configDir: cfg, home: '/h', env: {} })!
    expect(s).toMatchObject({ enabled: true, autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false, failIfUnavailable: false })
    expect(s.filesystem.allowWrite).toEqual([])
    expect(s.filesystem.denyWrite).toEqual(expect.arrayContaining([path.join(repo, '.git/hooks'), path.join(repo, '.git/config'), lib]))
    expect(s.filesystem.denyRead).toEqual(expect.arrayContaining([cfg, '/h/.ssh', '/h/.config/gh', '/h/.claude/.credentials.json']))
    expect(s.credentials?.envVars?.map((v) => (v as { name: string }).name)).toEqual(expect.arrayContaining(['RW_KEY', 'GITHUB_TOKEN', 'GH_TOKEN']))
  })

  it('worktree: 커밋이 쓰는 본체의 git 폴더는 열고, 그 훅 · 설정과 core.hooksPath 는 막는다', () => {
    const main = path.join(tmp, 'main'), wt = path.join(tmp, 'wt')
    fs.mkdirSync(main); git(main, 'init', '-q'); fs.writeFileSync(path.join(main, 'a'), 'a')
    git(main, 'add', '-A'); git(main, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'i')
    git(main, 'config', 'core.hooksPath', '.husky')
    git(main, 'worktree', 'add', '-q', '-b', 'w', wt)
    const dirs = gitDirsOf(wt)
    expect(dirs.commonDir).toBe(path.join(main, '.git'))
    expect(dirs.gitDir).toBe(path.join(main, '.git/worktrees/wt'))
    const s = sandboxFor({ cwd: wt, readable: [], app: false, configDir: path.join(tmp, 'cfg'), env: {} })!
    expect(s.filesystem.allowWrite).toEqual(expect.arrayContaining([path.join(main, '.git'), path.join(main, '.git/worktrees/wt')]))
    expect(s.filesystem.denyWrite).toEqual(expect.arrayContaining([path.join(main, '.git/hooks'), path.join(main, '.git/config'), path.join(wt, '.husky')]))
  })

  it('앱 고치기 대화와 RW_AGENT_SANDBOX=0 에는 넣지 않는다. 작업 폴더가 막을 곳 안이면 그곳은 빼고, 함께 읽는 폴더가 작업 폴더 안이면 막지 않는다', () => {
    expect(sandboxFor({ cwd: tmp, readable: [], app: true, configDir: '/c', env: {} })).toBeUndefined()
    expect(sandboxFor({ cwd: tmp, readable: [], app: false, configDir: '/c', env: { RW_AGENT_SANDBOX: '0' } })).toBeUndefined()
    const s = sandboxFor({ cwd: path.join(tmp, 'cfg/work'), readable: [path.join(tmp, 'cfg/work/sub')], app: false, configDir: path.join(tmp, 'cfg'), env: {} })!
    expect(s.filesystem.denyRead).not.toContain(path.join(tmp, 'cfg'))
    expect(s.filesystem.denyWrite).not.toContain(path.join(tmp, 'cfg/work/sub'))
  })
})

describe('격리 안의 명령이 인터넷에 나갈 때 (SandboxNetworkAccess)', () => {
  const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo: '/w/p', readable: [], claimedBy: () => undefined, ...o })
  it('「웹 보기」가 켜져 있으면 지나가고, 꺼져 있으면 호스트마다 묻는다 (「늘」은 그 호스트만)', () => {
    expect(judge(ctx({ auto: () => ({ read: true, run: false, web: true }) }), 'SandboxNetworkAccess', { host: 'pypi.org' }).kind).toBe('allow')
    const v = judge(ctx({ auto: () => ({ read: true, run: true, web: false }) }), 'SandboxNetworkAccess', { host: 'pypi.org' })
    expect(v).toMatchObject({ kind: 'ask', key: 'net:pypi.org', does: 'web' })
    expect(v.kind === 'ask' && v.turnOn).toBeFalsy()
    expect(judge(ctx({ auto: () => ({ read: true, run: true, web: false }), always: (k) => k === 'net:pypi.org' }), 'SandboxNetworkAccess', { host: 'pypi.org' }).kind).toBe('allow')
    expect(judge(ctx({ auto: () => ({ read: true, run: true, web: false }), always: (k) => k === 'net:pypi.org' }), 'SandboxNetworkAccess', { host: 'evil.example' }).kind).toBe('ask')
  })
})
