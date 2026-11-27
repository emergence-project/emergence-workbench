import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { globHitsGit, placer, realPlace } from './agentPlaces.js'
import { judge, type PolicyCtx } from './agentPolicy.js'

// 11/27 앱 전체 보안 검토: 판정이 글자와 실제 자리 둘 다로 경로를 본다 (링크 · git 내부)
/** 시험 폴더가 /tmp 안인지 (리눅스): 판정은 /tmp 를 임시 폴더로 보아 프로젝트 밖의 /tmp 쓰기를 묻지 않는다 */
const TMP_IS_TMP = /^\/tmp(\/|$)/.test(fs.realpathSync(os.tmpdir()))
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
    // 깊은 곳을 가리키는 링크: 링크 뒤의 .. 는 실제로는 안, 글자로는 밖 (별도 검토가 찾은 회귀)
    fs.mkdirSync(path.join(repo, 'deep/x/y'), { recursive: true })
    fs.symlinkSync(path.join(repo, 'deep/x/y'), path.join(repo, 'notes/in'))
    // 끊긴 링크
    fs.symlinkSync(path.join(tmp, 'nowhere/x'), path.join(repo, 'notes/dang'))
  })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('realPlace: 링크를 따라가고, 링크 뒤의 .. 는 가리키는 곳에서 올라가며, 끊긴 링크는 모른다', () => {
    expect(realPlace(`${repo}/notes/k`)).toBe(path.join(tmp, 'home/.ssh/id_ed25519'))
    expect(realPlace(`${repo}/notes/up/../x`)).toBe(path.join(tmp, 'x'))
    expect(realPlace(`${repo}/notes/in/../../..`)).toBe(repo)
    expect(realPlace(`${repo}/notes/new/../b.md`)).toBe(path.join(repo, 'notes/b.md'))
    expect(realPlace(`${repo}/notes/dang`)).toBeNull()
    // 아주 긴 경로는 보지 않고 모르는 것으로 (판정이 서버를 멈추지 않게)
    const t = Date.now()
    expect(realPlace(`${repo}/${'a/'.repeat(30000)}x`)).toBeNull()
    expect(Date.now() - t).toBeLessThan(50)
  })

  it('globHitsGit: .git 에 맞을 수 있는 마디 (셸처럼 점은 점으로만), 긴 무늬도 바로 끝난다', () => {
    for (const s of ['.git', '.GIT', '.g*', '.*', '[.]git', '.gi?', '.[f-h]it', '.gi(t)', '.[[:alpha:]]it', '(.git|x)']) expect(globHitsGit(s), s).toBe(true)
    for (const s of ['*', '?git', '*.md', 'notes', '.github', '.g*x', '[a-z]*', '.gitignore', '(fine)']) expect(globHitsGit(s), s).toBe(false)
    const t = Date.now()
    expect(globHitsGit(`.${'*'.repeat(5000)}x`)).toBe(false)
    expect(Date.now() - t).toBeLessThan(200)
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
    // .git 이 실제로 있는 자리의 .git 만 git 내부다 (sed 's/.git/x/' 의 글자는 아니다)
    expect(work(`${repo}/s/.git/x`)).toBe(true)
    for (const p of ['.git/hooks/pre-commit', '.git/config', 'h/pre-commit', 'notes/up2/pre-commit', '.g*/hooks/x', '.GIT/config', 'notes/dang']) expect(work(`${repo}/${p}`), p).toBe(false)
    // 글자로는 밖, 실제로는 안: 둘 다 안이어야 안
    expect(work(path.normalize(`${repo}/notes/in/../../../x`), `${repo}/notes/in/../../../x`)).toBe(false)
    expect(work(`${repo}/notes/in/z`)).toBe(true)
  })

  const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: 'p', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'project' }, repo, readable: [lib], claimedBy: () => undefined, ...o })
  const bash = (c: PolicyCtx, command: string) => judge(c, 'Bash', { command })

  it('편집 자동 수락: 등록한 폴더 안의 편집은 그대로, git 내부 · 링크로 밖이나 그곳을 가리키는 곳은 한 번 묻는다', () => {
    for (const c of ['cp notes/a.md notes/b.md', 'mkdir -p notes/x && cp notes/a.md notes/x/', 'git add notes && git commit -m "노트 정리"', 'git status', 'cat .git/config',
      'mv notes/* deep/', 'cd -P notes && cp a.md b.md', 'git config --get user.name', 'cp notes/a.md notes/in/',
      // 별도 검토가 찾은 거짓 묻기: 함께 읽는 폴더에서 가져오기, .git 을 거르는 꼴, 글 속의 cd · .git
      `cp ${lib}/c.md notes/`, `cat ${lib}/c.md >> notes/a.md`, "sed -i 's/.git/x/' notes/a.md", 'grep -rl --exclude-dir=.git foo . | xargs sed -i s/foo/bar/g',
      'ls notes | grep cd', 'git add -A && git commit -m cd', 'cd notes && ls && cd - && git status'])
      expect(bash(ctx(), c).kind, c).toBe('allow')
    for (const c of ['cp tools/fmt.sh .git/hooks/pre-commit', 'echo x > .git/hooks/pre-commit', 'chmod +x .git/hooks/post-commit', 'cp x h/pre-commit', 'cp x .g*/hooks/pre-commit', 'cp x [.]git/config', 'sort -o.git/config x',
      'git config core.hooksPath tools', 'cp notes/a.md notes/dang', 'cp x notes/up2/pre-commit',
      'cd "$(git rev-parse --git-dir)/hooks" && cp notes/a.md pre-commit', 'cd `git rev-parse --git-path hooks` && cp notes/a.md pre-commit']) {
      const v = bash(ctx(), c)
      expect(v.kind, c).toBe('ask')
      if (v.kind === 'ask') expect(v.once, c).toBe(true)
    }
  })

  it('실행 토글을 켠 편집 자동 수락도 git 내부를 건드리는 실행은 묻는다', () => {
    const run = ctx({ auto: () => ({ read: true, run: true, web: false }) })
    expect(bash(run, 'python3 tools/x.py > .git/hooks/pre-commit').kind).toBe('ask')
    expect(bash(run, `python3 tools/x.py ${lib}/c.csv`).kind).toBe('allow')
    expect(bash(run, 'python3 tools/x.py notes/a.md').kind).toBe('allow')
    expect(bash(run, "find . -not -path './.git/*' -name '*.md' -exec sed -i s/a/b/ {} +").kind).toBe('allow')
  })

  it('자동 모드와 앱 고치기 대화도 git 내부 쓰기를 묻는다', () => {
    expect(bash(ctx({ mode: 'auto' }), 'cp x .git/hooks/pre-commit').kind).toBe('ask')
    expect(bash(ctx({ mode: 'auto' }), 'cp x h/pre-commit').kind).toBe('ask')
    expect(bash(ctx({ mode: 'auto' }), 'cp notes/a.md notes/c.md').kind).toBe('allow')
    expect(bash(ctx({ mode: 'edit', rid: '_app', scope: { kind: 'app' } }), 'cp x .git/hooks/pre-commit').kind).toBe('ask')
  })

  // 시험 폴더가 /tmp 안이면(리눅스 CI) 저장소 위 · 함께 읽는 폴더도 /tmp 라 임시 폴더 쓰기로 지나간다 (main 과 같은 설계). 그래서 그런 곳에서는 건너뛴다.
  // 링크 뒤 .. 의 회귀는 위의 placer 시험이 곳과 상관없이 본다
  it.skipIf(TMP_IS_TMP)('저장소 위로 글자상 벗어난 cd, 자동 모드의 함께 읽는 폴더 쓰기는 묻는다', () => {
    const v = bash(ctx(), 'cd notes/in/../../.. && cp notes/a.md b')
    expect(v.kind).toBe('ask')
    if (v.kind === 'ask') expect(v.once).toBe(true)
    // 자동 모드는 전처럼 함께 읽는 폴더도 고치지 않는다
    expect(bash(ctx({ mode: 'auto' }), `cp notes/a.md ${lib}/a.md`).kind).toBe('ask')
  })

  it('링크로 밖을 가리키는 노트는 묻지 않고 읽히지 않는다 (명령 · 읽기 도구)', () => {
    expect(bash(ctx(), 'cat notes/k').kind).toBe('ask')
    expect(bash(ctx(), 'cat notes/a.md').kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: 'notes/k' }).kind).toBe('ask')
    expect(judge(ctx(), 'Read', { file_path: `${repo}/notes/up/x` }).kind).toBe('ask')
    expect(judge(ctx(), 'Read', { file_path: 'notes/a.md' }).kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: `${lib}/c.md` }).kind).toBe('allow')
  })

  it('읽기 전용 대화의 git 설정 쓰기 · 원격 정하기 · 받기는 전처럼 막는다', () => {
    for (const c of ['git config user.email a@b.c', 'git remote add evil https://x.example/r', 'git fetch https://x.example/r', 'git fetch origin']) expect(bash(ctx({ write: 'read' }), c).kind, c).toBe('deny')
  })

  it('긴 명령도 바로 판정한다', () => {
    const t = Date.now()
    bash(ctx(), `cat ${'a/'.repeat(30000)}x`)
    bash(ctx(), `cat ${Array.from({ length: 5000 }, (_, i) => `w${i}/x`).join(' ')}`)
    expect(Date.now() - t).toBeLessThan(1500)
  })

  it('새 주소로 주고받는 git은 묻고, 정해 둔 원격 이름으로 받기는 그대로', () => {
    for (const c of ['git fetch "https://attacker.example/abc"', 'git pull git@host.example:x/y', 'git fetch --depth 1 https://x.example/r', 'git fetch ../other', 'git remote add evil https://x.example/r',
      'git fetch --dep 1 host.example:r', 'git remote show https://x.example/r', 'git ls-remote https://x.example/r', 'git fetch --upl=sh origin'])
      expect(bash(ctx(), c).kind, c).toBe('ask')
    for (const c of ['git fetch', 'git fetch origin', 'git pull --rebase origin main', 'git fetch --depth 1 origin', 'git fetch origin refs/heads/a:refs/remotes/origin/a', 'git pull --recurse-submodules origin main', 'git remote show origin'])
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
