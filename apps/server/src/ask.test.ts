import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { appendAnswer, askPrompt, claudeClassifierRunner, claudeRunner, type AskRunner } from './ask.js'
import { addComment, readComments } from './comments.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: spawnMock,
}))

useSampleApp()

const at = new Date(2026, 9, 3, 14, 30)

describe('Claude 실행 옵션', () => {
  it.each([
    { runner: claudeRunner, args: ['--tools', 'Read,Glob,Grep', '--allowedTools', 'Read,Glob,Grep'] },
    { runner: claudeClassifierRunner, args: ['--model', 'haiku', '--tools', ''] },
  ])('가짜 프로세스로 도구와 모델 옵션을 확인한다: $args', async ({ runner, args }) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end: vi.fn() }, kill: vi.fn(),
    })
    spawnMock.mockClear().mockReturnValueOnce(child)
    const result = runner({ cwd: '/test/research', prompt: '분류할 기록' })
    child.stdout.emit('data', Buffer.from('  분류 결과\n'))
    child.emit('close', 0)
    await expect(result).resolves.toBe('분류 결과')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), ['-p', '--output-format', 'text', '--setting-sources', 'user', '--strict-mcp-config', ...args], expect.objectContaining({ cwd: '/test/research', stdio: ['pipe', 'pipe', 'pipe'] }))
    expect(child.stdin.end).toHaveBeenCalledWith('분류할 기록')
  })
})

describe('PDF 질문에 Claude가 답하기', () => {
  it('답은 그 질문 아래, 다음 코멘트 앞에 끼우고 상태를 답함으로 바꾼다', () => {
    const root = path.join(makeRepo('ask-unit'), 'workbench')
    addComment(root, 'paper-x', { kind: '질문', title: '자료 x.pdf', source: 'x.pdf', page: 4, quote: 'the bound', text: '왜 이 상한인가?' }, at)
    addComment(root, 'paper-x', { kind: '코멘트', title: '자료 x.pdf', page: 5, text: '나중에 볼 것' }, at)
    const f = readComments(root, 'paper-x')
    const q = f.comments[0]!
    const prompt = askPrompt(f, q.id, { repo: '/r', file: 'workbench/materials/x.pdf' })
    expect(prompt).toContain('- 파일: workbench/materials/x.pdf')
    expect(prompt).toContain('- 위치: 4쪽')
    expect(prompt).toContain('- 고른 글: "the bound"')
    expect(prompt).toContain('질문:\n왜 이 상한인가?')

    const after = appendAnswer(root, 'paper-x', q.id, 'claude', '식 (3) 때문입니다.\n## 머리처럼 보이는 줄', at)
    expect(after.comments.map((c) => [c.kind, c.state, c.answers.length])).toEqual([['질문', '답함', 1], ['메모', null, 0]])
    expect(after.comments[0]!.answers[0]).toEqual({ by: 'claude', at: '2026-10-03 14:30', body: '식 (3) 때문입니다.\n\\## 머리처럼 보이는 줄' })
    expect(after.comments[1]!.body).toBe('나중에 볼 것')
  })

  it('앱에서 질문을 넘기면 연구 저장소에서 Claude를 돌려 답을 덧붙인다', async () => {
    const repo = makeRepo('ask-route')
    const calls: { cwd: string; prompt: string }[] = []
    const ask: AskRunner = async (job) => { calls.push(job); return '논문 4쪽의 정리 2에서 나옵니다.' }
    const a = buildApp({ configDir: path.join(tmp, 'config-ask'), ask })
    const reg = await a.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
    const rid = reg.json().id as string
    const R = `/api/researches/${rid}`
    fs.mkdirSync(path.join(repo, 'workbench/materials'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'workbench/materials/x.pdf'), '%PDF-1.4')
    const add = await a.inject({ method: 'POST', url: `${R}/comments/paper-x`, payload: { kind: '질문', title: '자료 x.pdf', source: 'x.pdf', page: 4, text: '왜?' } })
    const id = add.json().entry.id

    const res = await a.inject({ method: 'POST', url: `${R}/comments/paper-x/${id}/answer` })
    expect(res.statusCode).toBe(200)
    expect(res.json().comments[0]).toMatchObject({ state: '답함', answers: [{ by: 'claude', body: '논문 4쪽의 정리 2에서 나옵니다.' }] })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.cwd).toBe(repo)
    expect(calls[0]!.prompt).toContain('- 파일: workbench/materials/x.pdf')
    expect((await a.inject({ method: 'POST', url: `${R}/comments/paper-x/c-nope/answer` })).statusCode).toBe(404)

    // 노트에서 고른 글로 남긴 부탁: 보조 노트 본문 파일을 가리키고, 노트용 지침을 준다
    const bid = fs.readdirSync(path.join(repo, 'workbench/blocks')).find((n) => /\.(md|tex)$/.test(n))!
    const b = await a.inject({ method: 'POST', url: `${R}/comments/block-${bid.replace(/\.\w+$/, '')}`, payload: { kind: '질문', title: '보조 노트', source: bid.replace(/\.\w+$/, ''), quote: 'x = y', text: '검산해 줘' } })
    expect((await a.inject({ method: 'POST', url: `${R}/comments/block-${bid.replace(/\.\w+$/, '')}/${b.json().entry.id}/answer` })).statusCode).toBe(200)
    expect(calls[1]!.prompt).toContain(`- 파일: workbench/blocks/${bid} (이 폴더 기준)`)
    expect(calls[1]!.prompt).toContain('자기 노트를 읽다가 남긴 질문이나 부탁')
    await a.close()
  })
})

describe('답에 든 고침을 노트에 적용하기', () => {
  it('노트 질문의 지침에 before/after 형식을 주고, 누르면 그 글만 바꾼다', async () => {
    const repo = makeRepo('ask-fix')
    const note = path.join(repo, 'workbench/notes/fix/note.md')
    fs.mkdirSync(path.dirname(note), { recursive: true })
    fs.writeFileSync(note, '---\ntitle: 고칠 노트\n---\n## 정의\n\n에너지는 $E = mc^3$ 이다.\n\n다른 줄.\n')
    const ask: AskRunner = async () => '지수가 틀렸습니다.\n\n```before\n## 정의\n\n에너지는 $E = mc^3$ 이다.\n```\n\n```after\n## 정의\n\n에너지는 $E = mc^2$ 이다.\n```'
    const a = buildApp({ configDir: path.join(tmp, 'config-ask-fix'), ask })
    const rid = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).json().id as string
    const R = `/api/researches/${rid}/comments/note-fix`
    const id = (await a.inject({ method: 'POST', url: R, payload: { kind: '질문', title: '고칠 노트', source: 'workbench/notes/fix/note.md', quote: 'E = mc^3', text: '지수를 고쳐 줘' } })).json().entry.id
    const root = path.join(repo, 'workbench')
    expect(askPrompt(readComments(root, 'note-fix'), id, { repo })).toContain('```before')
    const answered = (await a.inject({ method: 'POST', url: `${R}/${id}/answer` })).json()
    expect(answered.comments[0].answers[0].body).toContain('\\## 정의')

    const stale = await a.inject({ method: 'POST', url: `${R}/${id}/apply`, payload: { answer: 0, baseHash: 'old' } })
    expect(stale.statusCode).toBe(409)
    const res = await a.inject({ method: 'POST', url: `${R}/${id}/apply`, payload: { answer: 0, baseHash: answered.hash } })
    expect(res.statusCode).toBe(200)
    expect(fs.readFileSync(note, 'utf8')).toBe('---\ntitle: 고칠 노트\n---\n## 정의\n\n에너지는 $E = mc^2$ 이다.\n\n다른 줄.\n')
    expect(res.json().comments[0].answers.map((x: { by: string }) => x.by)).toEqual(['claude', '앱'])
    expect(res.json().comments[0].state).toBe('끝냄')
    const again = await a.inject({ method: 'POST', url: `${R}/${id}/apply`, payload: { answer: 0, baseHash: res.json().hash } })
    expect(again.statusCode).toBe(409)
  })

  it('노트가 그사이 바뀌어 바꿀 글이 없으면 아무것도 쓰지 않는다', async () => {
    const repo = makeRepo('ask-fix-stale')
    const note = path.join(repo, 'workbench/notes/s/note.md')
    fs.mkdirSync(path.dirname(note), { recursive: true })
    fs.writeFileSync(note, 'a b c\n')
    const ask: AskRunner = async () => '```before\nx\n```\n```after\ny\n```'
    const a = buildApp({ configDir: path.join(tmp, 'config-ask-fix-stale'), ask })
    const rid = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).json().id as string
    const R = `/api/researches/${rid}/comments/note-s`
    const id = (await a.inject({ method: 'POST', url: R, payload: { kind: '질문', title: 's', source: 'workbench/notes/s/note.md', text: '고쳐 줘' } })).json().entry.id
    const answered = (await a.inject({ method: 'POST', url: `${R}/${id}/answer` })).json()
    const res = await a.inject({ method: 'POST', url: `${R}/${id}/apply`, payload: { answer: 0, baseHash: answered.hash } })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('찾지 못했습니다')
    expect(fs.readFileSync(note, 'utf8')).toBe('a b c\n')
    expect(readComments(path.join(repo, 'workbench'), 'note-s').comments[0]!.answers).toHaveLength(1)
  })
})
