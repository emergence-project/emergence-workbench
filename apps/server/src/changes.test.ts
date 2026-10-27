// 변경사항 (10/27): 기준 뒤 커밋 · 커밋 안 된 것을 화면 이름으로 묶고, 보는 이(나 · 에이전트 계정)마다 기준을 둔다
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { classify } from './changes.js'
import { app, R, repo, useSampleApp } from './testkit.js'

useSampleApp()

const gitIn = (args: string[], env: Record<string, string> = {}) => execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' })
const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const commit = (msg: string, author: string, when: string) => {
  gitIn(['add', '-A'])
  gitIn(['commit', '-q', '-m', msg], { GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: 'a@example.com', GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when })
}
const DAY = 86_400_000

beforeAll(() => {
  fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true })
  gitIn(['init', '-q'])
  commit('처음', 'Old', at(30 * DAY))
  // 이틀 전: 노트 하나 고침, 흐름 점 하나 새로
  fs.appendFileSync(path.join(repo, 'workbench/notes/kempe-chains/main.tex'), '\n% 고침\n')
  fs.mkdirSync(path.join(repo, 'workbench/flow'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'workbench/flow/q1.yaml'), 'format: 1\nkind: question\nprogress: open\ntitle: 첫 질문\n')
  commit('노트와 점', 'Kim', at(2 * DAY))
  // 커밋 안 됨: 맡긴 일 하나
  fs.mkdirSync(path.join(repo, 'workbench/tasks'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'workbench/tasks/2026-10-27-check.md'), '---\ntitle: 확인하기\nstate: working\nagent: codex\ncreated: 2026-10-27\n---\n')
})

describe('변경사항', () => {
  it('파일을 화면의 이름으로 가른다', () => {
    expect(classify('workbench/topics/t/n1/note.md', 'workbench')).toEqual({ kind: 'note', id: 'n1' })
    expect(classify('workbench/topics/t/topic.yaml', 'workbench')).toEqual({ kind: 'file', id: 'workbench/topics/t/topic.yaml' })
    expect(classify('workbench/notes/n2/code/a.py', 'workbench')).toEqual({ kind: 'note', id: 'n2' })
    expect(classify('workbench/blocks/b.tex', 'workbench')).toEqual({ kind: 'file', id: 'workbench/blocks/b.tex' })
    expect(classify('workbench/flow/q.yaml', 'workbench')).toEqual({ kind: 'flow', id: 'q' })
    expect(classify('workbench/flow/layout.yaml', 'workbench')).toEqual({ kind: 'file', id: 'workbench/flow/layout.yaml' })
    expect(classify('workbench/tasks/x.md', 'workbench')).toEqual({ kind: 'task', id: 'x' })
    expect(classify('workbench/comments/note-b.md', 'workbench')).toEqual({ kind: 'record', id: 'note-b' })
    expect(classify('src/main.py', 'workbench')).toEqual({ kind: 'file', id: 'src/main.py' })
  })

  it('처음 보면 7일 전부터: 커밋한 것과 커밋 안 된 것을 한 줄씩, 최근 순', async () => {
    const res = await app.inject({ method: 'GET', url: `${R}/changes` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const rows = body.items.map((i: { kind: string; id: string; name: string; action: string; authors: string[]; uncommitted: boolean }) => [i.kind, i.id, i.name, i.action, i.authors.length, i.uncommitted])
    expect(rows).toEqual(expect.arrayContaining([
      ['task', '2026-10-27-check', '확인하기', 'created', 1, true],
      ['flow', 'q1', '첫 질문', 'created', 1, false],
      ['note', 'kempe-chains', 'Kempe 사슬 이용', 'edited', 1, false],
    ]))
    expect(body.items).toHaveLength(3)
    expect(body.items[0].kind).toBe('task')
    expect(body.items.find((i: { kind: string }) => i.kind === 'flow').authors).toEqual(['Kim'])
    expect(body.agents).toEqual({ claude: null, codex: null })
    // 홈 카드의 수
    expect((await app.inject({ method: 'GET', url: `${R}/changes/count` })).json().count).toBe(3)
  })

  it('since를 주면 그때부터', async () => {
    const body = (await app.inject({ method: 'GET', url: `${R}/changes?since=${encodeURIComponent(at(DAY))}` })).json()
    expect(body.items.map((i: { kind: string }) => i.kind)).toEqual(['task'])
    expect((await app.inject({ method: 'GET', url: `${R}/changes?since=어제` })).statusCode).toBe(400)
  })

  it('화면을 열면 내 기준이 그때로 옮겨 홈 카드의 수가 0이 된다', async () => {
    expect((await app.inject({ method: 'POST', url: `${R}/changes/seen`, payload: {} })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `${R}/changes/count` })).json()).toEqual({ count: 0, last: null })
  })

  it('에이전트는 계정마다 기준이 따로이고, 받은 때가 새 기준이 된다', async () => {
    const read = (agent: string, account?: string) => app.inject({ method: 'POST', url: `${R}/changes/read`, payload: {}, headers: { 'x-rw-agent': agent, ...(account && { 'x-rw-account': account }) } })
    expect((await read('claude-code', 'acc-a')).json().items).toHaveLength(3)
    expect((await read('claude-code', 'acc-a')).json().items).toHaveLength(0)
    // 다른 계정은 아직 7일 전부터
    expect((await read('claude-code', 'acc-b')).json().items).toHaveLength(3)
    const body = (await read('codex')).json()
    expect(body.items).toHaveLength(3)
    expect(body.agents.claude).toEqual(expect.any(String))
    expect(body.agents.codex).toEqual(expect.any(String))
    // 화면에서도 에이전트가 본 때가 보인다
    expect((await app.inject({ method: 'GET', url: `${R}/changes` })).json().agents.codex).toBe(body.agents.codex)
    // 에이전트 이름이 없으면 받지 않는다
    expect((await app.inject({ method: 'POST', url: `${R}/changes/read`, payload: {} })).statusCode).toBe(400)
  })
})
