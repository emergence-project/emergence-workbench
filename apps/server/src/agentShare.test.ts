import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRunner, RunInput } from './agentChats.js'
import { CENTRAL_RID } from '@rw/core/contract/agentChats'
import { ARCHIVE_ASKS, SharedChats, carryText, otherMachineChats, shareItems, SHARE_ROOT } from './agentShare.js'

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

  // 중앙은 컴퓨터에 하나다: 다른 컴퓨터의 옛 중앙 대화를 이어 오면 중앙이 둘이 되고, 방금 이어 온 쪽이 중앙 자리를 차지했다
  it('다른 컴퓨터의 중앙 대화는 이 컴퓨터에 중앙이 있으면 이어 오지 않는다 (없으면 그 대화가 중앙이 된다)', async () => {
    const personal = tmp()
    fs.mkdirSync(path.join(personal, SHARE_ROOT, 'Macmini'), { recursive: true })
    const mini = make(tmp(), ['p', CENTRAL_RID])
    const theirs = mini.create({ rid: CENTRAL_RID, text: '맥미니의 중앙' })
    await vi.waitFor(() => expect(mini.get(theirs.id).state).toBe('idle'))
    fs.writeFileSync(path.join(personal, SHARE_ROOT, 'Macmini', `${theirs.id}.json`), mini.sharedFiles()[theirs.id]!)
    const book = make(tmp(), ['p', CENTRAL_RID])
    book.shareDir = personal
    const mine = book.create({ rid: CENTRAL_RID, text: '이 컴퓨터의 중앙' })
    await vi.waitFor(() => expect(book.get(mine.id).state).toBe('idle'))
    expect(() => book.continueHere(theirs.id)).toThrow('중앙')
    expect(book.list().filter((c) => c.rid === CENTRAL_RID)).toHaveLength(1)
    // 이 컴퓨터의 중앙을 보관했으면 이어 올 수 있다
    book.archive(mine.id, true)
    expect(book.continueHere(theirs.id).rid).toBe(CENTRAL_RID)
    mini.stopAll(); book.stopAll()
  })

  it('앞 대화가 길면 뒤쪽만 넘긴다', () => {
    const at = ''
    const items = Array.from({ length: 40 }, (_, i) => ({ kind: 'text' as const, at, text: `글 ${i} ${'x'.repeat(600)}` }))
    const s = carryText({ machine: 'M', row: { id: 'a', rid: 'p', title: 't', agent: 'claude-code', scope: { kind: 'project' }, write: 'notes', state: 'idle', mode: 'edit', model: 'default', effort: 'medium', claims: [], changed: [], added: 0, removed: 0, archived: true, created: at, updated: at }, items, archived: false })
    expect(s).toContain('글 39')
    expect(s).not.toContain('글 0 ')
    expect(s.length).toBeLessThan(13_000)
  })

  // 11/20 사용자 "대화를 여는 권한도 있으니 닫을 권한도": 중앙의 chat_archive
  it('중앙이 이 컴퓨터의 대화를 보관하고 중앙에 한 줄 남긴다. 일하는 중 · 중앙 자신 · 이미 보관은 거절', async () => {
    const book = make(tmp(), ['p', CENTRAL_RID])
    const central = book.create({ rid: CENTRAL_RID, text: '중앙' })
    const c = book.create({ rid: 'p', text: '오류로 끝난 일' })
    await vi.waitFor(() => expect(book.get(c.id).state).toBe('idle'))
    await vi.waitFor(() => expect(book.get(central.id).state).toBe('idle'))
    expect(() => book.archiveOrAsk(central.id, '왜')).toThrow('중앙 대화')
    expect(book.archiveOrAsk(c.id, '피드백 반영됨')).toEqual({ id: c.id, title: '오류로 끝난 일' })
    expect(book.get(c.id).archived).toBe(true)
    expect(book.get(central.id).items.at(-1)).toMatchObject({ kind: 'text', text: '자동: 보관 · 오류로 끝난 일 · 피드백 반영됨' })
    expect(() => book.archiveOrAsk(c.id, '또')).toThrow('이미')
    const live = book.create({ rid: 'p', text: '도는 중' })
    expect(() => book.archiveOrAsk(live.id, 'x')).toThrow('일하는 중')
    expect(() => book.archiveOrAsk('nope', 'x')).toThrow('그런 대화가 없습니다')
    // 11/20 "종료된 대화를 복구하는 것도": chat_unarchive. 보관함에 없으면 거절
    expect(book.archiveOrAsk(c.id, '다시 이어 할 일', true)).toEqual({ id: c.id, title: '오류로 끝난 일' })
    expect(book.get(c.id).archived).toBe(false)
    expect(book.get(central.id).items.at(-1)).toMatchObject({ kind: 'text', text: '자동: 복구 · 오류로 끝난 일 · 다시 이어 할 일' })
    expect(() => book.archiveOrAsk(c.id, '또', true)).toThrow('보관함에 없습니다')
    book.stopAll()
  })

  it('다른 컴퓨터의 대화는 보관 요청을 올리고, 그 컴퓨터가 맞추기 뒤 보관한다 (그사이 다시 썼으면 두고)', async () => {
    const mini = make(tmp())
    const a = mini.create({ rid: 'p', text: '맥미니 일 하나' })
    const b = mini.create({ rid: 'p', text: '맥미니 일 둘' })
    await vi.waitFor(() => expect([mini.get(a.id).state, mini.get(b.id).state]).toEqual(['idle', 'idle']))
    const personal = tmp()
    const put = (m: string, files: Record<string, string>) => {
      fs.rmSync(path.join(personal, SHARE_ROOT, m), { recursive: true, force: true })
      fs.mkdirSync(path.join(personal, SHARE_ROOT, m), { recursive: true })
      for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(personal, SHARE_ROOT, m, `${k}.json`), v)
    }
    put('Macmini', mini.sharedFiles())
    const bookDir = tmp()
    const book = make(bookDir)
    book.shareDir = personal
    expect(book.archiveOrAsk(a.id, '다른 대화가 고침')).toEqual({ id: a.id, title: '맥미니 일 하나', machine: 'Macmini' })
    expect(book.archiveOrAsk(b.id, '답변됨').machine).toBe('Macmini')
    expect(() => book.archiveOrAsk(a.id, '또')).toThrow('이미')
    // 대화 폴더에 .json으로 두지 않아 다시 켜도 대화로 읽히지 않는다
    expect(make(bookDir).list()).toEqual([])
    const up = book.sharedFiles()
    expect(JSON.parse(up[ARCHIVE_ASKS]!)).toHaveLength(2)
    put('MacBook', up)
    expect(otherMachineChats(personal, 'Macmini')).toEqual([]) // 요청 파일은 대화로 읽지 않는다

    // 맥미니에서 b를 다시 이어 했다 → b는 두고 a만 보관
    await new Promise((r) => setTimeout(r, 5))
    mini.send(b.id, { text: '다시 이어서' })
    await vi.waitFor(() => expect(mini.get(b.id).state).toBe('idle'))
    mini.shareDir = personal
    expect(mini.applyArchiveAsks('Macmini')).toEqual([a.id])
    expect(mini.get(a.id).archived).toBe(true)
    expect(mini.get(a.id).items.at(-1)).toMatchObject({ kind: 'text', text: '자동: MacBook의 중앙이 보관함에 넣었습니다 · 다른 대화가 고침' })
    expect(mini.get(b.id).archived).toBe(false)
    expect(mini.applyArchiveAsks('Macmini')).toEqual([])

    // 맥미니가 다시 올리면 맥북은 끝난 요청(보관됨 · 다시 쓰임)을 버린다
    put('Macmini', mini.sharedFiles())
    expect(book.sharedFiles()[ARCHIVE_ASKS]).toBeUndefined()

    // 보관한 a를 맥북의 중앙이 다시 꺼내 달라고 청하면, 맥미니가 맞추기 뒤 꺼낸다
    await new Promise((r) => setTimeout(r, 5))
    expect(book.archiveOrAsk(a.id, '다시 필요함', true).machine).toBe('Macmini')
    expect(() => book.archiveOrAsk(a.id, '또', true)).toThrow('이미')
    put('MacBook', book.sharedFiles())
    expect(mini.applyArchiveAsks('Macmini')).toEqual([a.id])
    expect(mini.get(a.id).archived).toBe(false)
    expect(mini.get(a.id).items.at(-1)).toMatchObject({ kind: 'text', text: '자동: MacBook의 중앙이 보관함에서 꺼냈습니다 · 다시 필요함' })
    put('Macmini', mini.sharedFiles())
    expect(book.sharedFiles()[ARCHIVE_ASKS]).toBeUndefined()
    mini.stopAll(); book.stopAll()
  })
})
