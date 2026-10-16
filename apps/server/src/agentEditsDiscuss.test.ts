// 바뀐 곳에서 묻기 (10/14): 이유 한 줄, 질문은 답만, 수정은 에이전트 고침으로 다시 쓴다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { withReasons } from './agentEdits.js'
import { buildApp } from './app.js'
import { hashOf } from './fsutil.js'
import { fixture } from './testkit.js'

describe('바뀐 곳에서 묻기', () => {
  let tmp: string
  let repo: string
  let app: ReturnType<typeof buildApp>
  const RID = 'sample-research'
  const noteFile = 'workbench/notes/talk/note.md'
  const key = `note:${RID}:${noteFile}`
  const target = { kind: 'note', rid: RID, file: noteFile }
  const noteText = () => fs.readFileSync(path.join(repo, noteFile), 'utf8')
  const records = () => fs.readFileSync(path.join(repo, 'workbench/comments/note-talk.md'), 'utf8')
  let answer = ''
  const ask = vi.fn(async (_req: { prompt: string }) => answer)
  const review = async () => (await app.inject({ method: 'GET', url: `/api/agent-edits/review?key=${encodeURIComponent(key)}` })).json().review
  const discuss = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/agent-edits/discuss', payload })

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-discuss-'))
    repo = path.join(tmp, RID)
    fs.cpSync(fixture, repo, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    fs.mkdirSync(path.join(repo, 'workbench/notes/talk'), { recursive: true })
    fs.writeFileSync(path.join(repo, noteFile), '# Talk\n\nAlpha.\n\nBeta.\n')
    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), 'researches: []\n')
    app = buildApp({ configDir: path.join(tmp, 'config'), ask })
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).statusCode).toBe(200)
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('바꾼 글마다 남긴 이유가 그 바뀐 곳에 붙고, 노트 기록 대상을 알려 준다', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/agent-edits/write', payload: { target, baseHash: hashOf(noteText()), agent: 'claude-code', edits: [{ old: 'Alpha.', new: 'Alpha, sharper.', reason: 'tighter wording' }, { old: 'Beta.', new: 'Beta!' }] } })
    expect(res.statusCode).toBe(200)
    const r = await review()
    expect(r.hunks.map((h: { reason?: { reason: string; by?: string } }) => h.reason && [h.reason.reason, h.reason.by])).toEqual([['tighter wording', 'claude-code'], undefined])
    expect(r.record).toEqual({ target: 'note-talk', title: '노트 talk', source: noteFile })
  })

  it('질문은 그 문단에 붙는 기록으로 남고, 답이 오면 덧붙는다 (노트는 그대로)', async () => {
    answer = 'Because the original was vague.'
    const r = await review()
    const res = await discuss({ key, hash: r.hash, hunk: r.hunks[0].id, ask: '질문', text: 'Why?' })
    expect(res.statusCode).toBe(200)
    expect(res.json().file.comments).toMatchObject([{ kind: '질문', edit: '질문', editBase: 'Alpha.', quote: 'Alpha, sharper.', body: 'Why?' }])
    await vi.waitFor(() => expect(records()).toContain('Because the original was vague.'))
    expect(records()).toContain('"edit":"질문"')
    expect(noteText()).toBe('# Talk\n\nAlpha, sharper.\n\nBeta!\n')
    expect(String(ask.mock.calls.at(-1)?.[0]?.prompt)).toContain('Alpha, sharper.')
  })

  it('수정은 답의 고침을 에이전트 고침으로 다시 쓴다 (기준판은 그대로라 다시 검토받는다)', async () => {
    answer = 'Shorter.\n\n```before\nBeta!\n```\n\n```after\nBeta, done.\n```\n'
    const r = await review()
    const res = await discuss({ key, hash: r.hash, hunk: r.hunks[1].id, ask: '수정', text: 'shorter please' })
    expect(res.statusCode).toBe(200)
    await vi.waitFor(() => expect(noteText()).toBe('# Talk\n\nAlpha, sharper.\n\nBeta, done.\n'))
    const after = await review()
    expect(after.hunks.map((h: { base: string; current: string; reason?: { reason: string } }) => [h.base, h.current, h.reason?.reason])).toEqual([['Alpha.', 'Alpha, sharper.', 'tighter wording'], ['Beta.', 'Beta, done.', 'shorter please']])
    expect(after.agents).toContain('claude')
  })

  it('낡은 hash와 빈 글은 받지 않는다', async () => {
    const r = await review()
    expect((await discuss({ key, hash: 'old', hunk: r.hunks[0].id, ask: '질문', text: 'x' })).statusCode).toBe(409)
    expect((await discuss({ key, hash: r.hash, hunk: r.hunks[0].id, ask: '질문', text: ' ' })).statusCode).toBe(400)
  })

  it('여러 문단을 한 번에 바꾼 글의 이유는 그 문단마다 붙는다', () => {
    const h = (current: string) => ({ id: current, b0: 0, b1: 0, c0: 0, c1: 0, base: '', current })
    const out = withReasons([h('One more.'), h('Two.'), h('')], [{ text: 'One more.\n\nTwo.', reason: 'split', at: 'x' }])
    expect(out.map((x) => x.reason?.reason)).toEqual(['split', 'split', undefined])
  })
})
