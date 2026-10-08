import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { carryUserEdits, diffBlocks, joinBlocks, splitBlocks } from './agentEdits.js'
import { buildApp } from './app.js'
import { bodyHash } from './conceptNotes.js'
import { fixture } from './testkit.js'

describe('문단 나누기와 비교', () => {
  it('조각을 이어 붙이면 원래 글과 같다', () => {
    const text = '# T\n\nOne\nline two\n\n\n- a\n\n- b\n\n```\nx\n\ny\n```\n\n$$\na\n\nb\n$$\n\n\\begin{align}\nx\n\ny\n\\end{align}\n\nlast'
    const b = splitBlocks(text)
    expect(b.join('')).toBe(text)
    expect(b.map((x) => x.trim())).toEqual(['# T', 'One\nline two', '- a\n\n- b', '```\nx\n\ny\n```', '$$\na\n\nb\n$$', '\\begin{align}\nx\n\ny\n\\end{align}', 'last'])
    expect(joinBlocks(b)).toBe(text)
  })
  it('바뀐 곳만 묶는다', () => {
    const base = splitBlocks('A\n\nB\n\nC\n\nD\n')
    const cur = splitBlocks('A\n\nB2\n\nC\n\nD\n\nE\n')
    expect(diffBlocks(base, cur).map((h) => [h.base, h.current])).toEqual([['B', 'B2'], ['', 'E']])
  })
  it('에이전트가 쓴 뒤 사용자가 고친 것은 기준판으로 옮기고, 에이전트 문단을 다시 고친 것은 yours로 남긴다', () => {
    // 에이전트: B → B2, 한 문단 더함(X). 사용자: D → D2, 맨 앞에 Z, B2 → B3
    const p = { base: 'A\n\nB\n\nC\n\nD\n', after: 'A\n\nB2\n\nX\n\nC\n\nD\n' }
    const r = carryUserEdits(p, 'Z\n\nA\n\nB3\n\nX\n\nC\n\nD2\n')!
    expect(r.base).toBe('Z\n\nA\n\nB\n\nC\n\nD2\n')
    expect(r.yours).toEqual(['B3'])
    expect(carryUserEdits(p, p.after)).toBeNull()
    expect(carryUserEdits({ base: p.base }, 'anything')).toBeNull()
  })
})

describe('에이전트 고침 API', () => {
  let tmp: string
  let lib: string
  let repo: string
  let app: ReturnType<typeof buildApp>
  const RID = 'sample-research'
  const concept = (id: string, fm: Record<string, unknown>, body: string) => fs.writeFileSync(path.join(lib, 'concepts', `${id}.md`), `---\n${YAML.stringify(fm)}---\n${body}`)
  const conceptHash = async (id: string) => (await app.inject({ method: 'GET', url: `/api/concepts/${id}` })).json().hash as string
  const write = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/agent-edits/write', payload })
  const review = async (key: string) => (await app.inject({ method: 'GET', url: `/api/agent-edits/review?key=${encodeURIComponent(key)}` })).json().review
  const decideOn = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/agent-edits/review', payload })
  const noteFile = 'workbench/notes/work/note.md'
  const noteText = () => fs.readFileSync(path.join(repo, noteFile), 'utf8')
  const fileHash = async () => (await app.inject({ method: 'GET', url: `/api/agent-edits/review?key=${encodeURIComponent(`note:${RID}:${noteFile}`)}` })).json().review?.hash as string

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-edits-'))
    lib = path.join(tmp, 'library')
    fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
    concept('draft', { title: 'Draft' }, '# Draft\n\nFirst paragraph.\n\nSecond paragraph.\n')
    const okBody = '# Done\n\nChecked text.\n'
    concept('done', { title: 'Done', checked: { at: '2026-10-01', hash: bodyHash(okBody) } }, okBody)
    concept('locked', { title: 'Locked', locked: true }, '# Locked\n\nText.\n')
    repo = path.join(tmp, RID)
    fs.cpSync(fixture, repo, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    fs.mkdirSync(path.join(repo, 'workbench/notes/work'), { recursive: true })
    fs.writeFileSync(path.join(repo, noteFile), '# Work\n\nAlpha.\n\nBeta.\n\nGamma.\n')
    fs.mkdirSync(path.join(repo, 'workbench/notes/solved'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'workbench/notes/solved/note.md'), '# Solved\n\nKept.\n')
    fs.writeFileSync(path.join(repo, 'workbench/notes/solved/note.yaml'), 'state: done\n')
    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    app = buildApp({ configDir: path.join(tmp, 'config') })
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).statusCode).toBe(200)
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('작업 중인 개념노트는 바로 쓰고 기준판과 바뀐 곳을 보인다', async () => {
    const res = await write({ target: { kind: 'concept', id: 'draft' }, baseHash: await conceptHash('draft'), edits: [{ old: 'Second paragraph.', new: 'Second paragraph, revised.' }], agent: 'claude', summary: 'tighten' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, changes: 1, key: 'concept:draft' })
    expect(fs.readFileSync(path.join(lib, 'concepts/draft.md'), 'utf8')).toContain('Second paragraph, revised.')
    const r = await review('concept:draft')
    expect(r.hunks).toHaveLength(1)
    expect(r.hunks[0]).toMatchObject({ base: 'Second paragraph.', current: 'Second paragraph, revised.' })
    expect(r.notes).toEqual(['tighten'])
    expect(r.agents).toEqual(['claude'])
    const list = (await app.inject({ method: 'GET', url: '/api/agent-edits?scope=library' })).json()
    expect(list.reviews).toMatchObject([{ key: 'concept:draft', changes: 1, title: 'Draft', agents: ['claude'] }])
    // 다른 에이전트가 이어 고치면 고친 에이전트가 모두 남는다
    await write({ target: { kind: 'concept', id: 'draft' }, baseHash: r.hash, edits: [{ old: 'paragraph, revised.', new: 'paragraph, revised again.' }], agent: 'codex' })
    expect((await review('concept:draft')).agents).toEqual(['claude', 'codex'])
    const r2 = await review('concept:draft')
    // 승인하면 기준판이 지금 글이 되고 검토가 닫힌다 (파일은 그대로)
    const ok = await decideOn({ key: 'concept:draft', hash: r2.hash, hunk: r2.hunks[0].id, action: 'accept' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().review).toBeNull()
    expect(fs.readFileSync(path.join(lib, 'concepts/draft.md'), 'utf8')).toContain('Second paragraph, revised again.')
  })

  it('되돌리기는 그 문단만 기준판 글로, 직접 고치기는 사용자 글로 바꾼다', async () => {
    const key = `note:${RID}:${noteFile}`
    const target = { kind: 'note', rid: RID, file: noteFile }
    const first = await write({ target, baseHash: (await app.inject({ method: 'GET', url: `/api/researches/${RID}/notes` })).json() && hashOfFile(), edits: [{ old: 'Alpha.', new: 'Alpha!' }, { old: 'Gamma.', new: 'Gamma?' }] })
    expect(first.statusCode).toBe(200)
    // 다른 쓰기가 끼어도 기준판은 처음 것 그대로. 붙은 바뀐 곳은 하나로 묶인다
    expect((await write({ target, baseHash: hashOfFile(), edits: [{ old: 'Beta.', new: 'Beta.\n\nNew paragraph.' }] })).json().changes).toBe(2)
    let r = await review(key)
    expect(r.hunks.map((h: { base: string; current: string }) => [h.base, h.current])).toEqual([['Alpha.', 'Alpha!'], ['Gamma.', 'New paragraph.\n\nGamma?']])
    // 되돌리기: Alpha만
    r = (await decideOn({ key, hash: r.hash, hunk: r.hunks[0].id, action: 'revert' })).json().review
    expect(noteText()).toBe('# Work\n\nAlpha.\n\nBeta.\n\nNew paragraph.\n\nGamma?\n')
    expect(r.hunks).toHaveLength(1)
    // 낡은 hash는 409
    expect((await decideOn({ key, hash: 'old', hunk: r.hunks[0].id, action: 'accept' })).statusCode).toBe(409)
    // 직접 고치기: 사용자 글로 바꾸고 그 글을 승인한다
    r = (await decideOn({ key, hash: r.hash, hunk: r.hunks[0].id, action: 'edit', text: 'User paragraph.\n\nGamma?' })).json().review
    expect(r).toBeNull()
    expect(noteText()).toBe('# Work\n\nAlpha.\n\nBeta.\n\nUser paragraph.\n\nGamma?\n')
    // 마지막 문단 되돌리기: 파일 끝 모양을 지킨다
    await write({ target, baseHash: hashOfFile(), edits: [{ old: 'Gamma?', new: 'Gamma!' }, { old: 'Beta.', new: 'Beta!' }] })
    r = await review(key)
    r = (await decideOn({ key, hash: r.hash, hunk: r.hunks[1].id, action: 'revert' })).json().review
    expect(noteText()).toBe('# Work\n\nAlpha.\n\nBeta!\n\nUser paragraph.\n\nGamma?\n')
    r = (await decideOn({ key, hash: r.hash, hunk: r.hunks[0].id, action: 'revert' })).json().review
    expect(r).toBeNull()
    expect(noteText()).toBe('# Work\n\nAlpha.\n\nBeta.\n\nUser paragraph.\n\nGamma?\n')
    expect(await fileHash()).toBeUndefined()
  })

  it('에이전트가 쓴 뒤 사용자가 고친 문단은 바뀐 곳에 넣지 않고, 되돌리기가 사용자 글을 지우지 않는다', async () => {
    const file = 'workbench/notes/mine/note.md'
    fs.mkdirSync(path.join(repo, 'workbench/notes/mine'), { recursive: true })
    fs.writeFileSync(path.join(repo, file), '# User\n\nOne.\n\nTwo.\n\nThree.\n')
    const key = `note:${RID}:${file}`
    const target = { kind: 'note', rid: RID, file }
    const text = () => fs.readFileSync(path.join(repo, file), 'utf8')
    const hash = () => hashOfFile(file)
    expect((await write({ target, baseHash: hash(), edits: [{ old: 'One.', new: 'One!' }] })).statusCode).toBe(200)
    // 사용자가 앱 편집기에서 Three를 고친다 (에이전트 쓰기가 아님)
    fs.writeFileSync(path.join(repo, file), text().replace('Three.', 'Three, mine.'))
    let r = await review(key)
    expect(r.hunks.map((h: { base: string; current: string }) => [h.base, h.current])).toEqual([['One.', 'One!']])
    r = (await decideOn({ key, hash: r.hash, hunk: r.hunks[0].id, action: 'revert' })).json().review
    expect(r).toBeNull()
    expect(text()).toBe('# User\n\nOne.\n\nTwo.\n\nThree, mine.\n')
    // 에이전트가 고친 문단을 사용자가 다시 고쳤으면 되돌리지 않는다
    await write({ target, baseHash: hash(), edits: [{ old: 'Two.', new: 'Two!' }] })
    fs.writeFileSync(path.join(repo, file), text().replace('Two!', 'Two, mine.'))
    r = await review(key)
    expect(r.hunks.map((h: { base: string; current: string }) => [h.base, h.current])).toEqual([['Two.', 'Two, mine.']])
    expect((await decideOn({ key, hash: r.hash, hunk: r.hunks[0].id, action: 'revert' })).statusCode).toBe(409)
    expect(text()).toContain('Two, mine.')
    expect((await decideOn({ key, hash: r.hash, hunk: r.hunks[0].id, action: 'accept' })).json().review).toBeNull()
  })

  it('확인된 노트는 첫 시도를 거절하고 사용자 차례로 남긴다. approved면 쓴다', async () => {
    const target = { kind: 'concept', id: 'done' }
    const hash = await conceptHash('done')
    const res = await write({ target, baseHash: hash, edits: [{ old: 'Checked text.', new: 'Changed text.' }], summary: 'fix typo' })
    expect(res.statusCode).toBe(428)
    expect(res.json().error).toContain('approved')
    expect(fs.readFileSync(path.join(lib, 'concepts/done.md'), 'utf8')).toContain('Checked text.')
    expect((await app.inject({ method: 'GET', url: '/api/agent-edits' })).json().attempts).toMatchObject([{ key: 'concept:done', summary: 'fix typo' }])
    const ok = await write({ target, baseHash: hash, edits: [{ old: 'Checked text.', new: 'Changed text.' }], approved: true })
    expect(ok.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/agent-edits' })).json().attempts).toEqual([])
    expect((await review('concept:done')).hunks).toHaveLength(1)
    // 노트 상태 해결도 확인된 노트. 프로젝트 이슈 수에 든다
    const solved = await write({ target: { kind: 'note', rid: RID, file: 'workbench/notes/solved/note.md' }, baseHash: hashOf('# Solved\n\nKept.\n'), edits: [{ old: 'Kept.', new: 'X' }] })
    expect(solved.statusCode).toBe(428)
    expect((await app.inject({ method: 'GET', url: '/api/research-issues' })).json().edits[RID]).toBe(1)
  })

  it('잠긴 노트 · 원고 · 맞지 않는 old는 거절한다', async () => {
    expect((await write({ target: { kind: 'concept', id: 'locked' }, baseHash: 'x', edits: [{ old: 'Text.', new: 'Y' }] })).statusCode).toBe(423)
    expect((await write({ target: { kind: 'note', rid: RID, file: 'src/main.tex' }, baseHash: 'x', edits: [{ old: 'a', new: 'b' }] })).statusCode).toBe(404)
    const h = await conceptHash('draft')
    expect((await write({ target: { kind: 'concept', id: 'draft' }, baseHash: h, edits: [{ old: 'paragraph', new: 'b' }] })).statusCode).toBe(400)
    expect((await write({ target: { kind: 'concept', id: 'draft' }, baseHash: 'stale', edits: [{ old: 'First', new: 'b' }] })).statusCode).toBe(409)
  })

  function hashOfFile(file = noteFile): string { return hashOf(fs.readFileSync(path.join(repo, file), 'utf8')) }
})

import { hashOf } from './fsutil.js'
