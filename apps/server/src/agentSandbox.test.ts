import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gitDirsOf, sandboxFor, sandboxForRun, type SandboxInput } from './agentSandbox.js'
import { judge, type PolicyCtx } from './agentPolicy.js'

// 11/27 연구 대화의 OS 격리: 앱이 에이전트에 넘기는 설정 (실제 격리는 맥에서 시험했다, 설계 문서 4절)
describe.skipIf(process.platform === 'win32')('격리 설정', () => {
  let tmp = ''
  beforeAll(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rw-sbx-'))) })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'ignore' })
  const base = (o: Partial<SandboxInput>): SandboxInput => ({ cwd: tmp, readable: [], app: false, central: false, readOnly: false, configDir: path.join(tmp, 'cfg'), home: '/h', env: {}, ...o })

  it('보통 저장소: git 의 훅 · 설정 · 자리 파일 · 함께 읽는 폴더는 쓰기를, 앱 설정 폴더 · 열쇠는 읽기를 막는다. 비밀 환경 변수는 명령에 주지 않는다', () => {
    const repo = path.join(tmp, 'repo'), lib = path.join(tmp, 'lib'), cfg = path.join(tmp, 'cfg')
    fs.mkdirSync(repo); fs.mkdirSync(lib); git(repo, 'init', '-q')
    const s = sandboxFor(base({ cwd: repo, readable: [lib], configDir: cfg }))!
    expect(s).toMatchObject({ enabled: true, autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false, failIfUnavailable: false })
    expect(s.filesystem.allowWrite).toEqual([])
    const g = path.join(repo, '.git')
    expect(s.filesystem.denyWrite).toEqual(expect.arrayContaining(['hooks', 'config', 'commondir', 'modules'].map((f) => path.join(g, f)).concat(lib)))
    expect(s.filesystem.denyWrite).not.toContain(repo)
    expect(s.filesystem.denyRead).toEqual(expect.arrayContaining([cfg, '/h/.ssh', '/h/.config/gh', '/h/.claude/.credentials.json']))
    expect(s.credentials?.envVars?.map((v) => (v as { name: string }).name)).toEqual(expect.arrayContaining(['RW_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'AWS_SECRET_ACCESS_KEY']))
  })

  it('worktree: 본체의 objects · refs · logs 와 제 git 폴더만 열고, 자리 파일 · .git 파일 · 다른 worktree 는 막는다', () => {
    const main = path.join(tmp, 'main'), wt = path.join(tmp, 'wt'), other = path.join(tmp, 'other')
    fs.mkdirSync(main); git(main, 'init', '-q'); fs.writeFileSync(path.join(main, 'a'), 'a')
    git(main, 'add', '-A'); git(main, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'i')
    git(main, 'worktree', 'add', '-q', '-b', 'w', wt); git(main, 'worktree', 'add', '-q', '-b', 'o', other)
    const g = path.join(main, '.git'), own = path.join(g, 'worktrees/wt')
    expect(gitDirsOf(wt)).toEqual({ gitDir: own, commonDir: g })
    const s = sandboxFor(base({ cwd: wt }))!
    expect(s.filesystem.allowWrite).toEqual([own, path.join(g, 'objects'), path.join(g, 'refs'), path.join(g, 'logs')])
    expect(s.filesystem.denyWrite).toEqual(expect.arrayContaining([path.join(g, 'hooks'), path.join(g, 'config'), path.join(own, 'commondir'), path.join(own, 'gitdir'), path.join(wt, '.git'), path.join(g, 'worktrees/other'), path.join(g, 'HEAD'), path.join(g, 'index')]))
    expect(s.filesystem.denyWrite).not.toContain(own)
  })

  it('훅 폴더는 git 이 푼 값으로 (core.hooksPath · 뒤에 적은 값 · 주석), husky 의 .husky/_ 는 그 위 폴더까지', async () => {
    const repo = path.join(tmp, 'hp')
    fs.mkdirSync(repo); git(repo, 'init', '-q')
    fs.appendFileSync(path.join(repo, '.git/config'), '[core]\n\thooksPath = .husky/_ # husky\n\thooksPath = .other\n')
    const s = (await sandboxForRun({ cwd: repo, extraDirs: [], write: 'notes' }, path.join(tmp, 'cfg')))!
    expect(s.filesystem.denyWrite).toContain(path.join(repo, '.other'))
    const husky = sandboxFor(base({ cwd: repo, hooksDir: path.join(repo, '.husky/_') }))!
    expect(husky.filesystem.denyWrite).toEqual(expect.arrayContaining([path.join(repo, '.husky/_'), path.join(repo, '.husky')]))
  })

  it('읽기 전용 대화는 작업 폴더도 쓰지 못한다', () => {
    const s = sandboxFor(base({ cwd: tmp, readOnly: true }))!
    expect(s.filesystem.denyWrite).toContain(tmp)
    expect(s.filesystem.allowWrite).toEqual([])
  })

  it('앱 고치기 · 중앙 대화와 RW_AGENT_SANDBOX=0 에는 넣지 않는다', async () => {
    expect(sandboxFor(base({ app: true }))).toBeUndefined()
    expect(sandboxFor(base({ central: true }))).toBeUndefined()
    expect(sandboxFor(base({ env: { RW_AGENT_SANDBOX: '0' } }))).toBeUndefined()
    expect(await sandboxForRun({ cwd: tmp, extraDirs: [], write: 'notes', appChat: 'c1' }, '/c')).toBeUndefined()
    expect(await sandboxForRun({ cwd: tmp, extraDirs: [], write: 'read', central: true }, '/c')).toBeUndefined()
  })

  it('작업 폴더가 앱 설정 폴더 안이어도 설정 폴더를 통째로 열지 않는다: 그 폴더를 품은 칸만 빼고 나머지 칸(열쇠 · 계정 · 대화 기록)은 막는다', () => {
    const cfg = path.join(tmp, 'cfg2')
    for (const d of ['central', 'agent-hooks', 'claude-accounts', 'agent-chats']) fs.mkdirSync(path.join(cfg, d), { recursive: true })
    const s = sandboxFor(base({ cwd: path.join(cfg, 'central'), configDir: cfg }))!
    expect(s.filesystem.denyRead).toEqual(expect.arrayContaining(['agent-hooks', 'claude-accounts', 'agent-chats'].map((d) => path.join(cfg, d))))
    expect(s.filesystem.denyRead).not.toContain(cfg)
    expect(s.filesystem.denyRead).not.toContain(path.join(cfg, 'central'))
  })

  it('더한 계정: 명령마다 읽는 셸 스냅숏만 다시 연다', () => {
    const acc = path.join(tmp, 'cfg/claude-accounts/a1')
    const s = sandboxFor(base({ accountDir: acc }))!
    expect(s.filesystem.allowRead).toEqual([path.join(acc, 'shell-snapshots'), path.join(acc, 'session-env')])
  })
})

describe('격리 안의 명령이 인터넷에 나갈 때 (SandboxNetworkAccess)', () => {
  const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo: '/w/p', readable: [], claimedBy: () => undefined, ...o })
  const webOn = { auto: () => ({ read: true, run: false, web: true }) }
  const webOff = { auto: () => ({ read: true, run: true, web: false }) }
  it('「웹 보기」가 켜져 있으면 지나가고, 꺼져 있으면 호스트마다 묻는다 (「늘」은 그 호스트만, 대소문자는 하나로)', () => {
    expect(judge(ctx(webOn), 'SandboxNetworkAccess', { host: 'pypi.org' }).kind).toBe('allow')
    const v = judge(ctx(webOff), 'SandboxNetworkAccess', { host: 'PyPI.org' })
    expect(v).toMatchObject({ kind: 'ask', key: 'net:pypi.org', does: 'web' })
    expect(v.kind === 'ask' && v.turnOn).toBeFalsy()
    const always = { ...webOff, always: (k: string) => k === 'net:pypi.org' }
    expect(judge(ctx(always), 'SandboxNetworkAccess', { host: 'pypi.org' }).kind).toBe('allow')
    expect(judge(ctx(always), 'SandboxNetworkAccess', { host: 'evil.example' }).kind).toBe('ask')
  })
  it('이 컴퓨터 · 내부 네트워크는 「웹 보기」 · 「늘」 · 자동 모드와 상관없이 매번 묻는다', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', '10.0.0.5', '192.168.1.2', '172.20.0.1', '169.254.169.254', 'app.localhost', 'printer.local', 'myserver', '0.0.0.0']) {
      for (const c of [ctx(webOn), ctx({ mode: 'auto', ...webOn }), ctx({ ...webOn, always: () => true })]) {
        expect(judge(c, 'SandboxNetworkAccess', { host }), host).toMatchObject({ kind: 'ask', once: true })
      }
    }
    for (const host of ['pypi.org', '172.32.0.1', '11.0.0.1']) expect(judge(ctx(webOn), 'SandboxNetworkAccess', { host }).kind, host).toBe('allow')
  })
})
