// 끝난 앱 고치기 대화의 작업 폴더 치우기 (11/25): 실제 git으로 치워도 되는 때 · 안 되는 때, 시안 남기기, 대화 돌보기
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentRunner, RunEvent } from './agentChats.js'
import { FeedbackChats } from './agentFeedbackTick.js'
import { buildApp } from './app.js'
import { appWorktrees, sampleAppWork, type AppWork } from './appWorktree.js'
import { keptMockups } from './appWorktreeTidy.js'
import { copyMockups } from './feedbackMockups.js'

const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString().trim()

describe('작업 폴더 치우기 (실제 git)', () => {
  let tmp: string
  let root: string
  let origin: string
  /** gh pr list --state all의 정해 둔 답 (브랜치 → PR들) */
  let prs: Record<string, { number: number; state: string; headRefOid: string }[]> = {}
  let asked = 0
  let w: AppWork
  let n = 0
  /** 새 대화의 작업 폴더 */
  const open = async () => w.prepare(`2026-11-25-${String(++n).padStart(8, '0')}`)
  const commit = (dir: string, text: string) => {
    fs.writeFileSync(path.join(dir, 'README.md'), text)
    g(dir, 'commit', '-am', text.trim())
    return g(dir, 'rev-parse', 'HEAD')
  }
  const branches = () => g(root, 'branch', '--format=%(refname:short)').split('\n')

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-wt-tidy-'))
    origin = path.join(tmp, 'origin.git')
    root = path.join(tmp, 'app')
    g(tmp, 'init', '--bare', '-b', 'main', origin)
    g(tmp, 'clone', origin, root)
    fs.writeFileSync(path.join(root, 'README.md'), 'app\n')
    fs.writeFileSync(path.join(root, '.gitignore'), '/mockups/\nnode_modules/\n')
    g(root, 'add', '.')
    g(root, 'commit', '-m', 'first')
    g(root, 'push', 'origin', 'HEAD:main')
    w = appWorktrees(root, path.join(tmp, 'config', 'agent-worktrees'), undefined, undefined, async (_dir, args) => {
      asked++
      return JSON.stringify(prs[args[args.indexOf('--head') + 1] ?? ''] ?? [])
    })
  })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('고친 것이 없는 작업 폴더는 치우고 브랜치도 지운다. 시안은 남겨 두었다가 다시 만들면 되돌린다', async () => {
    const a = await open()
    fs.mkdirSync(path.join(a.dir, 'mockups', 'parts'), { recursive: true })
    fs.writeFileSync(path.join(a.dir, 'mockups', 'menu.png'), 'PNG')
    fs.writeFileSync(path.join(a.dir, 'mockups', 'parts', 'a.css'), 'x')
    // 밖을 가리키는 링크는 딸려 오지 않는다
    fs.symlinkSync(path.join(root, 'README.md'), path.join(a.dir, 'mockups', 'out.png'))
    fs.mkdirSync(path.join(a.dir, 'node_modules'))
    expect(await w.tidy!(a.dir, a.branch)).toBe(true)
    expect(asked).toBe(0) // 커밋이 없으면 GitHub에 묻지 않는다
    expect(fs.existsSync(a.dir)).toBe(false)
    expect(g(root, 'worktree', 'list')).not.toContain(a.dir)
    expect(branches()).not.toContain(a.branch)
    const kept = keptMockups(a.dir)
    expect(kept).toBe(path.join(tmp, 'config', 'agent-mockups', path.basename(a.dir)))
    expect(fs.readFileSync(path.join(kept, 'menu.png'), 'utf8')).toBe('PNG')
    expect(fs.readdirSync(kept).sort()).toEqual(['menu.png', 'parts'])
    // 이미 치운 폴더는 다시 치우지 않는다
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    // 그 대화를 이어 쓰면: 새 작업 폴더에 시안이 돌아와 있다
    expect(await w.prepare(path.basename(a.dir))).toEqual(a)
    expect(fs.readFileSync(path.join(a.dir, 'mockups', 'menu.png'), 'utf8')).toBe('PNG')
    expect(fs.readFileSync(path.join(a.dir, 'mockups', 'parts', 'a.css'), 'utf8')).toBe('x')
    expect(fs.existsSync(kept)).toBe(false)
    await w.dispose(a.dir, a.branch)
  })

  it('올리지 않은 고침(고친 파일 · 새 파일)이 있으면 두고, mockups/를 무시하지 않는 저장소여도 시안은 고침으로 보지 않는다', async () => {
    const a = await open()
    fs.writeFileSync(path.join(a.dir, 'README.md'), 'editing\n')
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    g(a.dir, 'checkout', '--', 'README.md')
    fs.writeFileSync(path.join(a.dir, 'new.ts'), 'x\n')
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    expect(fs.readFileSync(path.join(a.dir, 'new.ts'), 'utf8')).toBe('x\n')
    fs.rmSync(path.join(a.dir, 'new.ts'))
    // 무시 줄을 뺀 저장소 (다른 앱): 시안만 있으면 치운다
    fs.writeFileSync(path.join(a.dir, '.gitignore'), 'node_modules/\n')
    g(a.dir, 'update-index', '--assume-unchanged', '.gitignore')
    fs.mkdirSync(path.join(a.dir, 'mockups'))
    fs.writeFileSync(path.join(a.dir, 'mockups', 'b.html'), '<p>b</p>')
    expect(g(a.dir, 'status', '--porcelain')).toContain('mockups/')
    expect(await w.tidy!(a.dir, a.branch)).toBe(true)
    expect(fs.readFileSync(path.join(keptMockups(a.dir), 'b.html'), 'utf8')).toBe('<p>b</p>')
  })

  it('커밋이 있으면 끝난 PR에 다 들어 있을 때만 치운다: PR이 없거나 열려 있거나 그 뒤에 더 커밋했으면 둔다', async () => {
    const a = await open()
    const first = commit(a.dir, 'one\n')
    // PR이 없다 (올리지 않은 커밋)
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    // 열린 PR: CI · 합치기가 남았다
    prs = { [a.branch]: [{ number: 7, state: 'OPEN', headRefOid: first }] }
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    // 합쳐졌지만 그 뒤에 더 커밋했다
    prs = { [a.branch]: [{ number: 7, state: 'MERGED', headRefOid: first }] }
    const second = commit(a.dir, 'two\n')
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    // 합친 PR과 같은 브랜치로 다시 연 PR (합쳐짐 표시가 남은 대화): 둔다
    prs = { [a.branch]: [{ number: 7, state: 'MERGED', headRefOid: first }, { number: 9, state: 'OPEN', headRefOid: second }] }
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    expect(fs.existsSync(a.dir)).toBe(true)
    // 그 PR도 합쳐졌다: squash라 main의 조상이 아니어도 PR의 끝 커밋과 같으면 치운다
    prs = { [a.branch]: [{ number: 7, state: 'MERGED', headRefOid: first }, { number: 9, state: 'MERGED', headRefOid: second }] }
    expect(await w.tidy!(a.dir, a.branch)).toBe(true)
    expect(fs.existsSync(a.dir)).toBe(false)
    expect(branches()).not.toContain(a.branch)
  })

  it('닫힌 PR에 들어 있어도 치우고, GitHub에서 main을 받아 PR의 끝이 더 나아갔으면 그 안에 들어 있는지 본다', async () => {
    const a = await open()
    const mine = commit(a.dir, 'closed\n')
    prs = { [a.branch]: [{ number: 11, state: 'CLOSED', headRefOid: mine }] }
    expect(await w.tidy!(a.dir, a.branch)).toBe(true)

    const b = await open()
    const local = commit(b.dir, 'local\n')
    // 원격의 PR 끝: 내 커밋 위에 하나 더 (refs/pull/12/head)
    const other = path.join(tmp, 'other')
    g(tmp, 'clone', origin, other)
    g(b.dir, 'push', 'origin', `HEAD:refs/heads/${b.branch}`)
    g(other, 'fetch', 'origin', b.branch)
    g(other, 'checkout', '-b', 'x', 'FETCH_HEAD')
    const ahead = commit(other, 'updated on the forge\n')
    g(other, 'push', 'origin', 'HEAD:refs/pull/12/head')
    prs = { [b.branch]: [{ number: 12, state: 'MERGED', headRefOid: ahead }] }
    expect(local).not.toBe(ahead)
    expect(await w.tidy!(b.dir, b.branch)).toBe(true)
    // 내 커밋이 들어 있지 않은 PR이면 둔다
    const c = await open()
    commit(c.dir, 'not pushed\n')
    prs = { [c.branch]: [{ number: 12, state: 'MERGED', headRefOid: ahead }] }
    expect(await w.tidy!(c.dir, c.branch)).toBe(false)
    expect(fs.existsSync(c.dir)).toBe(true)
  })

  it('확인하는 사이 대화가 다시 시작했으면 두고, 다른 브랜치로 옮겨 둔 폴더도 둔다', async () => {
    const a = await open()
    expect(await w.tidy!(a.dir, a.branch, () => false)).toBe(false)
    expect(fs.existsSync(a.dir)).toBe(true)
    g(a.dir, 'checkout', '-b', 'elsewhere')
    expect(await w.tidy!(a.dir, a.branch)).toBe(false)
    expect(fs.existsSync(a.dir)).toBe(true)
  })

  it('치우는 중에 그 대화가 시작하면 다 치운 뒤에 새 작업 폴더를 만든다', async () => {
    const a = await open()
    fs.mkdirSync(path.join(a.dir, 'mockups'))
    fs.writeFileSync(path.join(a.dir, 'mockups', 'c.png'), 'C')
    // 지우기로 정한 바로 뒤(같은 차례가 끝난 뒤)에 시작한 대화
    let again: Promise<{ dir: string; branch: string }> | undefined
    expect(await w.tidy!(a.dir, a.branch, () => { queueMicrotask(() => { again = w.prepare(path.basename(a.dir)) }); return true })).toBe(true)
    expect(await again).toEqual(a)
    expect(g(a.dir, 'branch', '--show-current')).toBe(a.branch)
    expect(fs.readFileSync(path.join(a.dir, 'mockups', 'c.png'), 'utf8')).toBe('C')
  })

  it('대화를 지우면 고치던 것이 있어도 치우고 남겨 둔 시안도 지운다. 브랜치는 올리지 않은 커밋이 있으면 남긴다', async () => {
    const a = await open()
    commit(a.dir, 'unpushed\n')
    fs.writeFileSync(path.join(a.dir, 'README.md'), 'dirty\n')
    prs = {}
    await w.dispose(a.dir, a.branch)
    expect(fs.existsSync(a.dir)).toBe(false)
    expect(branches()).toContain(a.branch)

    const b = await open()
    fs.mkdirSync(path.join(b.dir, 'mockups'))
    fs.writeFileSync(path.join(b.dir, 'mockups', 'd.png'), 'D')
    expect(await w.tidy!(b.dir, b.branch)).toBe(true)
    expect(fs.existsSync(keptMockups(b.dir))).toBe(true)
    await w.dispose(b.dir, b.branch)
    expect(fs.existsSync(keptMockups(b.dir))).toBe(false)

    const c = await open()
    await w.dispose(c.dir, c.branch)
    expect(branches()).not.toContain(c.branch)
  })
})

describe('끝난 대화의 작업 폴더 치우기 (tidyWorktrees)', () => {
  let tmp: string
  let chats: FeedbackChats
  const asked: string[] = []
  let ok = true
  let restored = 0
  // 차례가 끝나도 에이전트는 열려 있다 (다음 지시를 기다린다)
  const runner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    yield { type: 'session', id: 's1' }
    yield { type: 'text', text: 'ok' }
    yield { type: 'result', ok: true }
    for await (const _ of input.inbox ?? []) {
      yield { type: 'text', text: 'again' }
      yield { type: 'result', ok: true }
    }
  }
  type Kept = { state: string; worktree?: string; merged?: string; snap?: unknown; diffSeen?: unknown; updated: string }
  const stored = (id: string) => (chats as unknown as { chats: Map<string, Kept> }).chats.get(id)!
  const idle = async (id: string) => { for (let i = 0; i < 200 && stored(id).state !== 'idle'; i++) await new Promise((r) => setTimeout(r, 5)) }
  const make = async (text: string) => {
    const id = chats.create({ rid: '_app', text }).id
    await idle(id)
    return id
  }

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-wt-sweep-'))
    const base = sampleAppWork(path.join(tmp, 'agent-worktrees'))
    const work: AppWork = {
      ...base,
      async snapshot() { return { tree: 't', head: 'h' } },
      async restore() { restored++; return 0 },
      async tidy(dir, _branch, still) {
        asked.push(path.basename(dir))
        if (!ok || still?.() === false) return false
        fs.rmSync(dir, { recursive: true, force: true })
        return true
      },
    }
    chats = new FeedbackChats({ dir: path.join(tmp, 'chats'), runner, limit: 4, project: () => ({ repo: tmp, title: 'x' }), readable: () => [], extraDirs: () => [], notify: () => {}, app: work })
  })
  afterAll(async () => {
    chats.stopAll()
    // 열려 있던 에이전트가 닫히며 대화 파일을 한 번 더 쓴다
    await new Promise((r) => setTimeout(r, 50))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('PR을 합쳤거나 보관한 대화만, 에이전트가 닫힌 뒤에 묻는다. 열려 있는 대화는 묻지도 않는다', async () => {
    const open = await make('열려 있는 대화')
    const merged = await make('합친 대화')
    const archived = await make('보관한 대화')
    stored(merged).merged = 'abc1234'
    chats.archive(archived, true)
    // 합친 대화는 쉬는 에이전트가 아직 열려 있다: 그 폴더에서 다음 지시를 받으므로 두고, 보관한 대화는 닫혔다
    await new Promise((r) => setTimeout(r, 20))
    expect(await chats.tidyWorktrees()).toBe(1)
    expect(asked).toEqual([archived])
    expect(fs.existsSync(stored(archived).worktree!)).toBe(false)
    expect(fs.existsSync(stored(merged).worktree!)).toBe(true)
    expect(fs.existsSync(stored(open).worktree!)).toBe(true)
    // 다음 작업 폴더는 그때 모습부터 다시 찍는다. 보관한 대화의 순서(고친 때)는 그대로
    expect(stored(archived).snap).toBeUndefined()
    const before = stored(archived).updated
    // 에이전트를 닫으면(보관 · 쉬는 시간 지남) 합친 대화도 치운다
    chats.archive(merged, true)
    chats.archive(merged, false)
    await new Promise((r) => setTimeout(r, 20))
    asked.length = 0
    expect(await chats.tidyWorktrees()).toBe(1)
    expect(asked).toEqual([merged])
    expect(stored(archived).updated).toBe(before)
    // 치운 폴더는 다시 묻지 않는다
    asked.length = 0
    expect(await chats.tidyWorktrees()).toBe(0)
    expect(asked).toEqual([])
  })

  it('치우지 못한 폴더(고치던 것 · 올리지 않은 커밋)는 그대로 두고 다음에 다시 묻는다. 이어 쓰면 작업 폴더를 새로 만든다', async () => {
    const id = await make('고치던 대화')
    chats.archive(id, true)
    await new Promise((r) => setTimeout(r, 20))
    ok = false
    asked.length = 0
    expect(await chats.tidyWorktrees()).toBe(0)
    expect(asked).toEqual([id])
    expect(fs.existsSync(stored(id).worktree!)).toBe(true)
    expect(stored(id).snap).toBeDefined()
    ok = true
    expect(await chats.tidyWorktrees()).toBe(1)
    const dir = stored(id).worktree!
    expect(fs.existsSync(dir)).toBe(false)
    // 치운 대화를 되돌리면 작업 폴더 없이 대화만 되돌리고, 이어 쓰면 작업 폴더를 새로 만든다
    const first = chats.get(id).items.find((it) => it.kind === 'user')
    const back = await chats.rewind(id, first?.kind === 'user' ? first.point ?? '' : '')
    expect(back.text).toBe('고치던 대화')
    expect(restored).toBe(0)
    chats.archive(id, false)
    chats.send(id, { text: '하나만 더' })
    await idle(id)
    expect(fs.existsSync(dir)).toBe(true)
    expect(stored(id).snap).toEqual({ tree: 't', head: 'h' })
  })
})

describe('치운 작업 폴더의 시안', () => {
  let tmp: string
  let app: ReturnType<typeof buildApp>
  const get = (url: string) => app.inject({ method: 'GET', url })
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-kept-mockups-'))
    const configDir = path.join(tmp, 'config')
    // 치운 대화: 남겨 둔 시안만
    const gone = path.join(configDir, 'agent-mockups', '2026-11-25-gone')
    fs.mkdirSync(gone, { recursive: true })
    fs.writeFileSync(path.join(gone, 'a.png'), 'KEPT')
    fs.writeFileSync(path.join(gone, 'a.html'), '<p>kept</p>')
    fs.writeFileSync(path.join(tmp, 'secret.png'), 'SECRET')
    fs.symlinkSync(path.join(tmp, 'secret.png'), path.join(gone, 'out.png'))
    // 다시 만든 대화: 작업 폴더의 새 시안과 (되돌리지 못해) 남아 있는 옛 시안
    const live = path.join(configDir, 'agent-worktrees', '2026-11-25-live', 'mockups')
    const old = path.join(configDir, 'agent-mockups', '2026-11-25-live')
    for (const d of [live, old]) fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(live, 'b.png'), 'NEW')
    fs.writeFileSync(path.join(old, 'b.png'), 'OLD')
    fs.writeFileSync(path.join(old, 'c.png'), 'C')
    app = buildApp({ configDir })
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('작업 폴더가 없어도 같은 주소로 보이고, 밖을 가리키는 링크는 막는다', async () => {
    expect((await get('/api/agent-mockups/2026-11-25-gone')).json()).toEqual({ files: ['a.html', 'a.png'] })
    const png = await get('/api/agent-mockups/2026-11-25-gone/a.png')
    expect(png.statusCode).toBe(200)
    expect(png.body).toBe('KEPT')
    expect((await get('/api/agent-mockups/2026-11-25-gone/a.html')).headers['content-security-policy']).toContain('sandbox')
    expect((await get('/api/agent-mockups/2026-11-25-gone/out.png')).statusCode).toBe(403)
    expect((await get('/api/agent-mockups/2026-11-25-gone/missing.png')).statusCode).toBe(404)
  })

  it('둘 다 있으면 작업 폴더의 것이 먼저고, 남겨 둔 것도 함께 보인다', async () => {
    expect((await get('/api/agent-mockups/2026-11-25-live')).json()).toEqual({ files: ['b.png', 'c.png'] })
    expect((await get('/api/agent-mockups/2026-11-25-live/b.png')).body).toBe('NEW')
    expect((await get('/api/agent-mockups/2026-11-25-live/c.png')).body).toBe('C')
  })

  it('피드백 답에 붙일 시안도 남겨 둔 곳에서 찾는다', () => {
    const fb = path.join(tmp, 'feedback')
    const worktree = path.join(tmp, 'config', 'agent-worktrees', '2026-11-25-gone')
    const out = copyMockups(worktree, fb, ['a'], new Date(2026, 10, 25, 9, 5))
    expect([...out].sort()).toEqual(['pictures/2026-11-25-0905-mockup-a.html', 'pictures/2026-11-25-0905-mockup-a.png'])
    expect(fs.readFileSync(path.join(fb, 'pictures/2026-11-25-0905-mockup-a.png'), 'utf8')).toBe('KEPT')
    const live = path.join(tmp, 'config', 'agent-worktrees', '2026-11-25-live')
    expect(fs.readFileSync(path.join(fb, copyMockups(live, fb, ['b'], new Date(2026, 10, 25, 9, 6))[0]!), 'utf8')).toBe('NEW')
    expect(() => copyMockups(live, fb, ['none'])).toThrow(/b, c/)
  })
})
