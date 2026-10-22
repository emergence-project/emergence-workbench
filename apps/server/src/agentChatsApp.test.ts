// 앱 고치기 대화 (2단계, 10/21 "앱 안 대화", 10/22 "권한 넓히기"): 작업 폴더에서 고치고 명령도 돌리며, 올리기 · PR · CI는 앱이 한다
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { appBriefFor, fileEditOf, judge, partsOfPatch, type AgentRunner, type PolicyCtx, type RunEvent, type RunInput } from './agentChats.js'
import { buildApp } from './app.js'
import { appBranch, appWorktrees, sampleAppWork, type AppWork } from './appWorktree.js'

const repo = '/w/app-1'
const W = 'mcp__workbench__'
const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: '_app', write: 'notes', mode: 'edit', planOk: false, scope: { kind: 'app' }, repo, readable: [], claimedBy: () => undefined, ...o })

describe('앱 고치기 대화의 허락 규칙', () => {
  it('작업 폴더 안 파일은 고치고 그 파일을 잡는다. 밖 · .git은 막는다', () => {
    expect(judge(ctx(), 'Edit', { file_path: `${repo}/apps/web/src/a.tsx` })).toEqual({ kind: 'allow', claim: 'apps/web/src/a.tsx' })
    expect(judge(ctx(), 'Write', { file_path: 'docs/x.md' })).toEqual({ kind: 'allow', claim: 'docs/x.md' })
    expect(judge(ctx(), 'Edit', { file_path: '/Users/me/GitHub/emergence-workbench/a.ts' }).kind).toBe('deny')
    expect(judge(ctx(), 'Edit', { file_path: `${repo}/../other/a.ts` }).kind).toBe('deny')
    expect(judge(ctx(), 'Write', { file_path: `${repo}/.git/config` }).kind).toBe('deny')
  })
  it('명령은 작업 폴더에서 돌린다: 고치기 바로는 그대로, 묻고 하기는 묻고, 계획 승인 전 · 읽기만은 막는다', () => {
    expect(judge(ctx({ mode: 'edit' }), 'Bash', { command: 'pnpm test' })).toEqual({ kind: 'allow' })
    expect(judge(ctx({ mode: 'ask' }), 'Bash', { command: 'pnpm test' })).toMatchObject({ kind: 'ask', key: 'Bash:pnpm test' })
    expect(judge(ctx({ mode: 'plan' }), 'Bash', { command: 'pnpm test' }).kind).toBe('deny')
    expect(judge(ctx({ mode: 'plan', planOk: true }), 'Bash', { command: 'pnpm test' }).kind).toBe('allow')
    expect(judge(ctx({ write: 'read' }), 'Bash', { command: 'pnpm test' }).kind).toBe('deny')
  })
  it('올리기 · PR · 합치기 · 앱 서비스 명령은 어느 모드든 앱에 맡기라고 막는다', () => {
    for (const command of ['git push origin HEAD', 'gh pr merge 3', 'gh pr create --fill', 'pnpm service:restart', 'launchctl kickstart x', 'git worktree remove ../a']) {
      const v = judge(ctx({ mode: 'edit' }), 'Bash', { command })
      expect(v.kind, command).toBe('deny')
      expect(v.kind === 'deny' && v.message).toContain('app_submit')
    }
    expect(judge(ctx({ mode: 'edit' }), 'Bash', { command: 'git commit -am x && git fetch origin main && git merge origin/main' }).kind).toBe('allow')
  })
  it('묻고 하기는 파일 · PR 올리기를 묻고, 계획 먼저는 승인 전에 막고, 읽기만은 늘 막는다', () => {
    expect(judge(ctx({ mode: 'ask' }), 'Edit', { file_path: 'a.ts' })).toMatchObject({ kind: 'ask', key: 'edit:a.ts', claim: 'a.ts' })
    expect(judge(ctx({ mode: 'ask' }), `${W}app_submit`, { title: '고침' }).kind).toBe('ask')
    expect(judge(ctx({ mode: 'plan' }), 'Edit', { file_path: 'a.ts' }).kind).toBe('deny')
    expect(judge(ctx({ mode: 'plan' }), `${W}app_submit`, { title: '고침' }).kind).toBe('deny')
    expect(judge(ctx({ mode: 'plan', planOk: true }), `${W}app_submit`, { title: '고침' }).kind).toBe('allow')
    expect(judge(ctx({ write: 'read' }), 'Edit', { file_path: 'a.ts' }).kind).toBe('deny')
    expect(judge(ctx({ write: 'read' }), `${W}app_submit`, { title: '고침' }).kind).toBe('deny')
    expect(judge(ctx({ write: 'read' }), `${W}app_checks`, {}).kind).toBe('allow')
  })
  it('연구 프로젝트는 읽기만 한다 (노트 · 기록 · 맡긴 일 · 일지 · 흐름 고치기를 막는다)', () => {
    for (const tool of ['edit_note', 'add_record', 'add_task', 'report_task', 'add_journal', 'flow_add']) expect(judge(ctx(), `${W}${tool}`, { project: 'p' }).kind).toBe('deny')
    expect(judge(ctx(), `${W}read_note`, { project: 'p' }).kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: `${repo}/CLAUDE.md` }).kind).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: '/etc/hosts' }).kind).toBe('ask')
  })
  it('안내와 파일 고침 줄', () => {
    const b = appBriefFor({ branch: 'claude/app-1234abcd', write: 'notes', mode: 'plan', rules: '/cfg/personal/CLAUDE.md' })
    expect(b).toContain('claude/app-1234abcd')
    // 개인 규칙 · 피드백 규칙은 피드백을 맡은 대화만 읽는다
    expect(b).not.toContain('/cfg/personal/CLAUDE.md')
    expect(appBriefFor({ branch: 'b', write: 'notes', rules: '/cfg/personal/CLAUDE.md', feedback: true })).toContain('/cfg/personal/CLAUDE.md')
    expect(b).toContain('run_in_background')
    expect(b).toContain('pnpm type-check')
    expect(b).toContain('git merge origin/main')
    expect(b).toContain('ExitPlanMode')
    expect(fileEditOf('Edit', { old_string: 'a\nb', new_string: 'c' })).toEqual({ parts: [{ old: 'a\nb', new: 'c' }], added: 1, removed: 2 })
    expect(fileEditOf('Write', { content: 'x\ny' })).toMatchObject({ added: 2, removed: 0 })
    expect(fileEditOf('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: '' }] })).toMatchObject({ added: 1, removed: 2 })
    expect(appBranch('2026-10-21-0a1b2c3d')).toBe('claude/app-0a1b2c3d')
  })
})

describe('앱 고치기 대화 API', () => {
  let tmp: string
  let app: ReturnType<typeof buildApp>
  const seen: RunInput[] = []
  const submitted: { dir: string; branch: string; title: string }[] = []
  const disposed: string[] = []
  let work: AppWork
  const runner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    seen.push(input)
    yield { type: 'session', id: 's1' }
    const e = { file_path: `${input.cwd}/apps/web/src/a.css`, old_string: 'a', new_string: 'b' }
    const d = await input.canUseTool('Edit', e)
    if (d.allow) yield { type: 'tool', tool: 'Edit', input: e }
    const sh = await input.canUseTool('Bash', { command: 'pnpm test' })
    // 앱 MCP가 하는 대로 앱 API를 부른다
    const r = await app.inject({ method: 'POST', url: `/api/agent-chats/${input.appChat}/app/submit`, payload: { title: '메뉴 고침', body: '## Before' } })
    yield { type: 'text', text: `${d.allow ? 'edited' : 'no'} ${sh.allow ? 'ran' : 'no-shell'} ${r.statusCode}` }
    yield { type: 'result', ok: true }
  }
  const get = async (id: string) => (await app.inject({ method: 'GET', url: `/api/agent-chats/${id}` })).json().chat

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-appchat-'))
    const base = sampleAppWork(path.join(tmp, 'wt'))
    work = {
      ...base,
      async submit(dir, branch, o) { submitted.push({ dir, branch, title: o.title }); return { number: 77, url: 'https://example.test/pull/77', created: true } },
      async dispose(dir) { disposed.push(dir); await base.dispose(dir) },
      // 고치기 도구로 바꾼 a.css와 명령으로 바꾼 x.mjs
      async diff() { return [{ file: 'apps/web/src/a.css', added: 1, removed: 1, patch: '@@ -1 +1 @@\n-a\n+b' }, { file: 'scripts/x.mjs', added: 2, removed: 1, patch: '--- a/scripts/x.mjs\n+++ b/scripts/x.mjs\n@@ -1,2 +1,3 @@\n-old\n+new\n+more\n ctx' }] },
    }
    app = buildApp({ configDir: path.join(tmp, 'config'), agentRunner: runner, agentApp: work })
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('목록이 앱 고치기를 열 수 있다고 알리고, 대화는 작업 폴더에서 돌며 파일 고침 · PR이 남고, 명령을 돌린다', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/agent-chats' })).json().app).toBe(true)
    const res = await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: '_app', text: '메뉴가 잘린다' } })
    expect(res.statusCode, res.body).toBe(200)
    const id = res.json().chat.id as string
    await vi.waitFor(async () => expect((await get(id)).state).toBe('idle'))
    const chat = await get(id)
    const input = seen.at(-1)!
    expect(input.appChat).toBe(id)
    expect(input.cwd).toBe(path.join(tmp, 'wt', id))
    expect(input.extraDirs).toEqual([])
    expect(input.brief).toContain(appBranch(id))
    expect(chat.scope).toEqual({ kind: 'app' })
    expect(chat.branch).toBe(appBranch(id))
    expect(chat.pr).toEqual({ number: 77, url: 'https://example.test/pull/77' })
    expect(chat.changed).toEqual(['apps/web/src/a.css', 'scripts/x.mjs'])
    const edits = chat.items.filter((i: { kind: string }) => i.kind === 'edit')
    expect(edits).toHaveLength(2)
    expect(edits[0]).toMatchObject({ file: 'apps/web/src/a.css', added: 1, removed: 1 })
    expect(edits[0].via).toBeUndefined()
    // 명령으로 바꾼 파일도 차례 끝에 git diff에서 찾아 보인다
    expect(edits[1]).toEqual({ kind: 'edit', at: expect.any(String), file: 'scripts/x.mjs', parts: [{ old: 'old', new: 'new\nmore' }], added: 2, removed: 1, via: 'command' })
    expect(chat.items.find((i: { kind: string }) => i.kind === 'blocked')).toBeUndefined()
    expect(chat.items.find((i: { kind: string }) => i.kind === 'text').text).toBe('edited ran 200')
    expect(input.env?.SHOTS_PORT).toMatch(/^\d+$/)
    expect(submitted).toEqual([{ dir: input.cwd, branch: appBranch(id), title: '메뉴 고침' }])
    const checks = await app.inject({ method: 'GET', url: `/api/agent-chats/${id}/app/checks` })
    expect(checks.statusCode, checks.body).toBe(200)
    expect(checks.json()).toMatchObject({ done: true, ok: true })
    expect((await app.inject({ method: 'DELETE', url: `/api/agent-chats/${id}` })).statusCode).toBe(200)
    await vi.waitFor(() => expect(disposed).toEqual([input.cwd]))
  })

  it('연구 대화에는 앱 범위 · 앱 도구를 쓰지 못한다', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: 'nope', text: 'x', scope: { kind: 'app' } } })
    expect(res.statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent-chats/none/app/submit', payload: { title: 'x', body: '' } })).statusCode).toBe(404)
  })

  it('앱 저장소가 없는 맥에서는 열 수 없다', async () => {
    const other = buildApp({ configDir: path.join(tmp, 'config2'), agentRunner: runner })
    expect((await other.inject({ method: 'GET', url: '/api/agent-chats' })).json().app).toBe(false)
    expect((await other.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: '_app', text: 'x' } })).statusCode).toBe(404)
    await other.close()
  })
})

describe('작업 폴더 (실제 git)', () => {
  it('origin/main에서 대화의 브랜치로 worktree를 만들고, 다시 부르면 그대로, 치우면 사라진다', async () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-wt-'))
    const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString()
    const origin = path.join(tmp, 'origin.git')
    const root = path.join(tmp, 'app')
    g(tmp, 'init', '--bare', '-b', 'main', origin)
    g(tmp, 'clone', origin, root)
    fs.writeFileSync(path.join(root, 'README.md'), 'app\n')
    g(root, 'add', '.')
    g(root, 'commit', '-m', 'first')
    g(root, 'push', 'origin', 'HEAD:main')
    // 실사용 폴더에 고치던 것이 있어도 건드리지 않는다
    fs.writeFileSync(path.join(root, 'README.md'), 'my edit\n')
    const w = appWorktrees(root, path.join(tmp, 'wt'))
    const a = await w.prepare('2026-10-21-0a1b2c3d')
    expect(a.branch).toBe('claude/app-0a1b2c3d')
    expect(fs.readFileSync(path.join(a.dir, 'README.md'), 'utf8')).toBe('app\n')
    expect(g(a.dir, 'branch', '--show-current').trim()).toBe(a.branch)
    expect(await w.prepare('2026-10-21-0a1b2c3d')).toEqual(a)
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('my edit\n')
    // 바뀐 파일: 커밋한 것 · 올리지 않은 것 · 새 파일 모두 main 갈래 이후로
    expect(await w.diff!(a.dir)).toEqual([])
    fs.writeFileSync(path.join(a.dir, 'README.md'), 'app\nmore\n')
    fs.mkdirSync(path.join(a.dir, 'src'))
    fs.writeFileSync(path.join(a.dir, 'src', 'new.ts'), 'x\n')
    g(a.dir, 'add', 'README.md')
    g(a.dir, 'commit', '-m', 'more')
    fs.writeFileSync(path.join(a.dir, 'README.md'), 'app2\nmore\n')
    const d = await w.diff!(a.dir)
    expect(d.map((x) => [x.file, x.added, x.removed])).toEqual([['README.md', 2, 1], ['src/new.ts', 2, 0]])
    expect(partsOfPatch(d[0]!.patch)).toEqual([{ old: 'app', new: 'app2\nmore' }])
    // 되돌리기: 찍어 둔 모습으로 (고친 것 · 새 파일 · 지운 파일), 색인은 건드리지 않는다. 그 뒤에 커밋했으면 하지 않는다
    const snap = await w.snapshot!(a.dir)
    expect(await w.restore!(a.dir, snap)).toBe(0)
    fs.writeFileSync(path.join(a.dir, 'README.md'), 'changed\n')
    fs.writeFileSync(path.join(a.dir, 'src', 'later.ts'), 'y\n')
    fs.rmSync(path.join(a.dir, 'src', 'new.ts'))
    g(a.dir, 'add', 'src/later.ts')
    expect(await w.restore!(a.dir, snap)).toBe(3)
    expect(fs.readFileSync(path.join(a.dir, 'README.md'), 'utf8')).toBe('app2\nmore\n')
    expect(fs.readFileSync(path.join(a.dir, 'src', 'new.ts'), 'utf8')).toBe('x\n')
    expect(fs.existsSync(path.join(a.dir, 'src', 'later.ts'))).toBe(false)
    expect(g(a.dir, 'diff', '--cached', '--name-only').trim()).toBe('')
    expect(g(a.dir, 'ls-files', '--others', '--exclude-standard').trim()).toBe('src/new.ts')
    g(a.dir, 'commit', '-am', 'later')
    await expect(w.restore!(a.dir, snap)).rejects.toMatchObject({ status: 409 })
    await w.dispose(a.dir)
    expect(fs.existsSync(a.dir)).toBe(false)
    expect(g(root, 'worktree', 'list')).not.toContain(a.dir)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
