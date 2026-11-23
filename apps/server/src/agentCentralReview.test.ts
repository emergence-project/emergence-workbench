// 중앙의 검토 역할 (11/23 사용자 "충돌/모순이나 잘못된 결정은 없는지 검토하는 역할", "이상이 없으면 … 전달하거나 로그처럼 업데이트를 할필요는 없을 것",
// "중앙 대화가 필요하다고 생각하거나, 사용자 요청을 할 때"): 겹침 줄 · 의도 장부 · 깊은 검토(찾기 → 확인, 없으면 조용히) · 검토 중 보류
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CentralChats, CENTRAL_BRIEF } from './agentCentral.js'
import { addLedger, findingsOf, ledgerText, overlapsOf, readLedger } from './agentCentralReview.js'
import type { AgentRunner, RunEvent, RunInput, Stored } from './agentChats.js'
import { sampleAppWork, type AppWork } from './appWorktree.js'

const GB = 1024 ** 3

describe('겹침 · 장부 · 찾은 것 줄', () => {
  const dirs: string[] = []
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
  const chat = (id: string, o: Partial<Stored>): Stored => ({ id, rid: '_app', title: id.toUpperCase(), state: 'idle', scope: {}, changed: [], ...o }) as unknown as Stored

  it('열린 앱 고치기 대화 둘이 같은 파일을 바꾸면 한 줄. 합친 것 · 보관한 것 · 다른 앱 · 끝나고 PR 없는 것은 빼고', () => {
    const lines = overlapsOf([
      chat('a', { state: 'running', changed: ['x.ts', 'y.ts'] }),
      chat('b', { pr: { number: 7, url: 'u' }, changed: ['x.ts', 'y.ts', 'z.ts'] }),
      chat('c', { state: 'running', merged: 'abc', changed: ['x.ts'] }),
      chat('d', { state: 'running', archived: true, changed: ['x.ts'] }),
      chat('e', { state: 'running', scope: { app: 'other' }, changed: ['x.ts'] } as Partial<Stored>),
      chat('f', { changed: ['z.ts'] }),
    ])
    expect(lines).toEqual(['겹침: 「A」 a · 「B」 b (PR #7) — x.ts, y.ts'])
  })

  it('장부는 더하기만: 바뀐 결정은 옛 항목에 대체됨을 달고, 에이전트에게는 지금 유효한 것만 준다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-ledger-'))
    dirs.push(dir)
    const d = { file: path.join(dir, 'agent', 'central-decisions.json'), where: 'local' as const }
    expect(readLedger(d)).toEqual([])
    addLedger(d, { words: '보관은 해도 돼', source: '2026-11-20-aaaa0001' }, '2026-11-20')
    addLedger(d, { words: '리뷰가 깨끗하면 남기지 마', source: '2026-11-23-bbbb0002' }, '2026-11-23')
    const items = addLedger(d, { words: '보관과 복구는 해도 돼', source: '2026-11-23-bbbb0002', replaces: 1 }, '2026-11-23')
    expect(items.map((x) => x.n)).toEqual([1, 2, 3])
    expect(items[0]).toMatchObject({ words: '보관은 해도 돼', superseded: { date: '2026-11-23', by: 3 } })
    expect(() => addLedger(d, { words: 'x', source: 's', replaces: 1 })).toThrow(/이미 대체|already replaced/)
    expect(() => addLedger(d, { words: 'x', source: 's', replaces: 9 })).toThrow(/9/)
    const text = ledgerText(readLedger(d))
    expect(text).not.toContain('보관은 해도 돼"')
    expect(text).toContain('3. (2026-11-23 · 2026-11-23-bbbb0002) "보관과 복구는 해도 돼"')
  })

  it('모델의 답에서 「버그 · 규칙 · 의도」 줄만 고른다. 「없음」은 빈 목록', () => {
    expect(findingsOf('없음')).toEqual([])
    expect(findingsOf('검토했습니다.\n- 버그 · a.ts:3 · 빈 목록에서 터짐\n의도 · b.ts:1 · 지우기를 연다\n그 밖에 좋음')).toEqual(['버그 · a.ts:3 · 빈 목록에서 터짐', '의도 · b.ts:1 · 지우기를 연다'])
  })

  it('중앙의 지침: 가벼운 검토는 늘, 이상 없으면 말하지 않고, 깊은 검토는 조건이 있을 때만, 보류된 PR은 어떤 길로도 합치지 않는다', () => {
    expect(CENTRAL_BRIEF).toContain('If nothing is wrong, say nothing about it')
    expect(CENTRAL_BRIEF).toContain('start it only when the user asks')
    expect(CENTRAL_BRIEF).toContain('A held pull request is never merged')
    expect(CENTRAL_BRIEF).toContain('decision_add')
  })
})

describe('깊은 검토와 보류', () => {
  const dirs: string[] = []
  const seen: RunInput[] = []
  const asked: string[] = []
  // 찾기 · 확인 단계의 답 (시험마다 넣는다)
  let answers: string[] = []
  let gate: Promise<void> = Promise.resolve()
  const fake: AgentRunner = Object.assign(async function* (input: RunInput): AsyncIterable<RunEvent> {
    seen.push(input)
    yield { type: 'session', id: `s${seen.length}` }
    yield { type: 'text', text: '고쳤습니다' }
    yield { type: 'result', ok: true }
  } as (input: RunInput) => AsyncIterable<RunEvent>, { side: async (o: { prompt: string }) => { asked.push(o.prompt); await gate; return answers.shift() ?? '없음' } })
  const make = async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-review-'))
    dirs.push(dir)
    const base = sampleAppWork(path.join(dir, 'wt'))
    const app: AppWork = { ...base, async diff() { return [{ file: 'apps/server/src/a.ts', added: 1, removed: 0, patch: '+const x = 1' }] } }
    const chats = new CentralChats({ dir: path.join(dir, 'chats'), runner: fake, limit: 5, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {}, app },
      { file: path.join(dir, 'memo.md'), where: 'local', decisions: { file: path.join(dir, 'decisions.json'), where: 'local' } })
    chats.wakeMs = 5
    chats.memory = async () => ({ free: 0.9, total: 32 * GB })
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    const kid = await chats.openKid({ role: 'app', title: '고침', task: '고쳐' })
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    return { chats, c, kid }
  }
  const centralPrompts = () => seen.filter((s) => s.central).map((s) => s.prompt)
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); seen.length = 0; asked.length = 0; answers = []; gate = Promise.resolve() })

  it('검토자는 바뀐 코드와 장부만 받는다. 찾은 것이 없으면 확인 단계도, 중앙을 깨우는 일도 없다', async () => {
    const { chats, kid } = await make()
    chats.addDecision({ words: '지우기는 사용자만', source: 'src-1' })
    const n = centralPrompts().length
    expect(await chats.startReview({ id: kid.id })).toEqual({ id: kid.id, files: 1, held: false })
    await expect(chats.startReview({ id: kid.id })).rejects.toThrow(/이미 깊은 검토|already running/)
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0]).toContain('+const x = 1')
    expect(asked[0]).toContain('"지우기는 사용자만"')
    expect(asked[0]).not.toContain('고쳤습니다')
    await new Promise((r) => setTimeout(r, 50))
    expect(asked).toHaveLength(1)
    expect(centralPrompts()).toHaveLength(n)
    chats.stopAll()
  })

  it('확인된 것만 중앙을 깨운다 (확인에서 떨어진 것은 빠진다)', async () => {
    const { chats, c, kid } = await make()
    answers = ['버그 · a.ts:1 · 진짜 문제\n규칙 · a.ts:1 · 추측', '버그 · a.ts:1 · 진짜 문제']
    await chats.startReview({ id: kid.id, focus: '권한' })
    await vi.waitFor(() => expect(centralPrompts().at(-1)).toContain('진짜 문제'))
    expect(asked[0]).toContain('Look especially at: 권한')
    expect(asked[1]).toContain('규칙 · a.ts:1 · 추측')
    expect(centralPrompts().at(-1)).not.toContain('추측')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.stopAll()
  })

  it('보류 중에는 app_merge가 거절되고, 검토가 깨끗이 끝나면 중앙에게 다시 합치라고 알린다. 보류는 검토 중에만', async () => {
    const { chats, kid } = await make()
    await chats.appSubmit(kid.id, { title: '고침', body: '' })
    expect(() => chats.hold(kid.id, true)).toThrow(/chat_review/)
    let open!: () => void
    gate = new Promise<void>((r) => { open = r })
    expect((await chats.startReview({ id: kid.id, hold: true })).held).toBe(true)
    await expect(chats.appMerge(kid.id)).rejects.toThrow(/보류|holds/)
    expect(chats.hold(kid.id, false)).toEqual({ id: kid.id, held: false })
    expect(chats.hold(kid.id, true, '권한 확인')).toEqual({ id: kid.id, held: true })
    open()
    await vi.waitFor(() => expect(centralPrompts().at(-1)).toContain('app_merge again'))
    expect((await chats.appMerge(kid.id)).number).toBe(234)
    chats.stopAll()
  })
})
