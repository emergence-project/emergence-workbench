import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRunner, RunInput } from './agentChats.js'
import { SharedChats, carryText, otherMachineChats, shareItems, SHARE_ROOT } from './agentShare.js'

// 11/20: 맥미니에서 돌린 대화가 맥북 보관함에 보이지 않았다. 대화를 개인 저장소로 올리고, 다른 컴퓨터에서 읽기만 하거나 이어 간다
const tmps: string[] = []
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-share-')); tmps.push(d); return d }

const prompts: string[] = []
const runner: AgentRunner = async function* (i: RunInput) {
  prompts.push(i.prompt)
  yield { type: 'session', id: 's1' }
  yield { type: 'text', text: `답: ${i.prompt.split('\n').at(-1)}` }
  yield { type: 'result', ok: true }
}
const make = (dir: string, projects = ['p']) => new SharedChats({
  dir, runner, limit: 2, readable: () => [], extraDirs: () => [], notify: () => {},
  project: (rid) => { if (!projects.includes(rid)) throw new Error('없음'); return { repo: dir, title: rid } },
})

describe('다른 컴퓨터의 대화', () => {
  it('올릴 줄은 내 지시 · 에이전트 글 · 고친 파일 · 오류만, 고친 내용은 뺀다', () => {
    const at = '2026-11-20T00:00:00.000Z'
    expect(shareItems([
      { kind: 'user', at, text: '봐 줘' }, { kind: 'step', at, tool: 'Read', summary: 'a.md' }, { kind: 'think', at, text: '음' },
      { kind: 'text', at, text: '하위', sub: true }, { kind: 'text', at, text: '봤습니다' },
      { kind: 'edit', at, file: 'a.md', parts: [{ old: 'x', new: 'y' }], added: 1, removed: 1 }, { kind: 'user', at, text: '알림', auto: true },
    ])).toEqual([{ kind: 'user', at, text: '봐 줘' }, { kind: 'text', at, text: '봤습니다' }, { kind: 'edit', at, file: 'a.md', parts: [], added: 1, removed: 1 }])
  })

  it('맥미니가 올린 대화를 맥북은 보관함에 읽기 전용으로 보고, 이어 하면 첫 지시에 앞 대화를 붙인다', async () => {
    // 맥미니: 대화 하나를 끝내고 올릴 파일을 만든다
    const mini = make(tmp())
    const c = mini.create({ rid: 'p', text: '첫 질문' })
    await vi.waitFor(() => expect(mini.get(c.id).state).toBe('idle'))
    const files = mini.sharedFiles()
    expect(Object.keys(files)).toEqual([c.id])

    // 맥북: 개인 저장소 사본에 그 파일이 받아져 있다
    const personal = tmp()
    fs.mkdirSync(path.join(personal, SHARE_ROOT, 'Macmini'), { recursive: true })
    fs.writeFileSync(path.join(personal, SHARE_ROOT, 'Macmini', `${c.id}.json`), files[c.id]!)
    expect(otherMachineChats(personal, 'Macmini')).toEqual([]) // 자기 것은 읽지 않는다
    const book = make(tmp())
    book.shareDir = personal
    const row = book.listAll().find((r) => r.id === c.id)
    expect(row).toMatchObject({ machine: 'Macmini', archived: true, state: 'idle', title: '첫 질문' })
    expect(book.list()).toEqual([]) // 앱 안 도구(중앙 등)가 보는 목록에는 이 컴퓨터 것만
    expect(book.getAny(c.id).items.map((i) => i.kind)).toEqual(['user', 'text'])

    // 이어 하기: 새 대화, 다시 눌러도 같은 대화
    const here = book.continueHere(c.id)
    expect(here.id).not.toBe(c.id)
    expect(here.machine).toBeUndefined()
    expect(book.continueHere(c.id).id).toBe(here.id)
    expect(here.items.at(-1)).toMatchObject({ kind: 'user', auto: true })
    const before = prompts.length
    book.send(here.id, { text: '이어서 물어볼게' })
    await vi.waitFor(() => expect(book.get(here.id).state).toBe('idle'))
    const sent = prompts[before]!
    expect(sent).toContain('another computer (Macmini)')
    expect(sent).toContain('User: 첫 질문')
    expect(sent.endsWith('이어서 물어볼게')).toBe(true)
    // 두 번째 지시에는 붙이지 않는다
    book.send(here.id, { text: '또' })
    await vi.waitFor(() => expect(prompts.length).toBe(before + 2))
    expect(prompts.at(-1)).not.toContain('another computer')
    mini.stopAll(); book.stopAll()
  })

  it('이 컴퓨터에 없는 프로젝트의 대화는 이어 가지 못한다', () => {
    const personal = tmp()
    fs.mkdirSync(path.join(personal, SHARE_ROOT, 'Macmini'), { recursive: true })
    const at = '2026-11-20T00:00:00.000Z'
    const row = { id: '2026-11-20-aaaa1111', rid: 'elsewhere', title: 't', agent: 'claude-code', scope: { kind: 'project' }, write: 'notes', state: 'running', mode: 'edit', model: 'default', effort: 'medium', claims: ['a.md'], changed: [], added: 0, removed: 0, archived: false, live: true, newField: 1, created: at, updated: at }
    fs.writeFileSync(path.join(personal, SHARE_ROOT, 'Macmini', `${row.id}.json`), JSON.stringify({ row, items: [{ kind: 'user', at, text: 'x' }, { kind: 'mystery', at }] }))
    const book = make(tmp())
    book.shareDir = personal
    // 다른 판이 더한 칸은 버리고, 도는 중이었어도 여기서는 끝난 대화로
    expect(book.getAny(row.id)).toMatchObject({ state: 'idle', claims: [], machine: 'Macmini', items: [{ kind: 'user', text: 'x' }] })
    expect(() => book.continueHere(row.id)).toThrow('그 프로젝트가 없습니다')
    expect(() => book.continueHere('nope')).toThrow()
  })

  it('앞 대화가 길면 뒤쪽만 넘긴다', () => {
    const at = ''
    const items = Array.from({ length: 40 }, (_, i) => ({ kind: 'text' as const, at, text: `글 ${i} ${'x'.repeat(600)}` }))
    const s = carryText({ machine: 'M', row: { id: 'a', rid: 'p', title: 't', agent: 'claude-code', scope: { kind: 'project' }, write: 'notes', state: 'idle', mode: 'edit', model: 'default', effort: 'medium', claims: [], changed: [], added: 0, removed: 0, archived: true, created: at, updated: at }, items })
    expect(s).toContain('글 39')
    expect(s).not.toContain('글 0 ')
    expect(s.length).toBeLessThan(13_000)
  })
})
