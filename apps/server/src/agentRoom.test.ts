// 중앙 방 (11/20 "중앙 = 여럿이 말하는 방"): 받는 이(그냥 · @이름 · @모두) · 초대 · 권한 · 방장이 묻기
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRunner, RunEvent, RunInput } from './agentChats.js'
import { mentionsOf, ROOM_DEFAULT, RoomChats, routeOf } from './agentRoom.js'
import { tallyOf, verdictOf } from '@rw/core'

const room = { host: 'claude-code' as const, members: ROOM_DEFAULT.members }

describe('받는 이', () => {
  it('@이름 · @모두를 읽는다 (메일 주소 · 글 속 @는 아니다)', () => {
    expect(mentionsOf('@Codex 이거 봐 줘')).toEqual(['codex'])
    expect(mentionsOf('@모두, 의견 주세요')).toEqual(['all'])
    expect(mentionsOf('@all 의견 주세요')).toEqual(['all'])
    expect(mentionsOf('@All, 어때?')).toEqual(['all'])
    expect(mentionsOf('a@codex.io 로 보내')).toEqual([])
    expect(mentionsOf('@claude @gemini?')).toEqual(['claude-code', 'gemini'])
  })
  it('그냥 → 방장, @Codex → Codex만, @모두 → 모두 · 방장 마지막, 방에 없는 이름 → 방장', () => {
    expect(routeOf('고쳐 줘', room)).toEqual({ others: [], host: true, all: false })
    expect(routeOf('@Codex 봐 줘', room)).toEqual({ others: ['codex'], host: false, all: false })
    expect(routeOf('@Codex @Claude 둘 다', room)).toEqual({ others: ['codex'], host: true, all: false })
    expect(routeOf('@모두 어때?', room)).toEqual({ others: ['codex'], host: true, all: true })
    expect(routeOf('@all 어때?', room)).toEqual({ others: ['codex'], host: true, all: true })
    expect(routeOf('@Gemini 어때?', room)).toEqual({ others: [], host: true, all: false })
  })
})

describe('중앙 방', () => {
  const dirs: string[] = []
  const turns: string[] = []
  const asked: string[] = []
  const fake: AgentRunner = Object.assign(async function* (input: RunInput): AsyncGenerator<RunEvent> {
    turns.push(input.prompt)
    yield { type: 'session', id: `s${turns.length}` }
    yield { type: 'text', text: '방장 답' }
    yield { type: 'result', ok: true }
  } as (input: RunInput) => AsyncIterable<RunEvent>, { side: async (o: { prompt: string }) => { asked.push(o.prompt); return '곁 답' } })
  const make = (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-room-'))) => {
    if (!dirs.includes(dir)) dirs.push(dir)
    const review = vi.fn(async (o: { prompt: string }) => { asked.push(o.prompt); return 'Codex 답' })
    const chats = new RoomChats({ dir: path.join(dir, 'chats'), runner: fake, limit: 4, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {}, review })
    return { chats, dir, review }
  }
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); turns.length = 0; asked.length = 0 })

  it('기본 방은 방장 Claude(수정)와 Codex(발언). 그냥 말하면 방장만 받고, 방 사람 목록을 처음에 함께 받는다', async () => {
    const { chats, review } = make()
    expect(chats.roomState()).toMatchObject({ host: 'claude-code', members: [{ agent: 'claude-code', perm: 'edit' }, { agent: 'codex', perm: 'talk' }], rules: { callMax: 2 } })
    const c = chats.talk('안녕')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.send(c.id, { text: '다음 일' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]).toContain('[Room members: Claude edit (host), you · Codex talk')
    expect(review).not.toHaveBeenCalled()
    expect(chats.centralState().room?.host).toBe('claude-code')
  })

  it('@Codex는 Codex만 답하고 방장은 받지 않는다. 다음에 방장에게 말하면 그 답을 앞에 붙인다', async () => {
    const { chats, review } = make()
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.send(c.id, { text: '@Codex 이 계획 봐 줘' })
    await vi.waitFor(() => expect(chats.get(c.id).items.some((x) => x.kind === 'member' && x.text === 'Codex 답')).toBe(true))
    expect(review).toHaveBeenCalledOnce()
    expect(asked[0]).toContain('The user asks you:\n@Codex 이 계획 봐 줘')
    expect(asked[0]).toContain('Claude (host): 방장 답')
    expect(turns).toHaveLength(1)
    chats.send(c.id, { text: '그럼 고쳐' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]).toContain('[Codex answered in the room:]\nCodex 답')
    expect(turns[1]).toContain('[The user writes:]\n그럼 고쳐')
  })

  it('앱이 다시 켜진 뒤에는 방장이 아직 못 본 답만 붙인다 (이미 본 답을 처음부터 다시 붙이지 않는다)', async () => {
    const first = make()
    const c = first.chats.talk('시작')
    await vi.waitFor(() => expect(first.chats.get(c.id).state).toBe('idle'))
    first.review.mockResolvedValueOnce('본 답')
    first.chats.send(c.id, { text: '@Codex 하나' })
    await vi.waitFor(() => expect(first.chats.get(c.id).items.some((x) => x.kind === 'member' && x.text === '본 답')).toBe(true))
    first.chats.send(c.id, { text: '고쳐' })
    await vi.waitFor(() => expect(first.chats.get(c.id).state).toBe('idle'))
    first.review.mockResolvedValueOnce('못 본 답')
    first.chats.send(c.id, { text: '@Codex 둘' })
    await vi.waitFor(() => expect(first.chats.get(c.id).items.some((x) => x.kind === 'member' && x.text === '못 본 답')).toBe(true))
    const { chats } = make(first.dir)
    chats.send(c.id, { text: '이어서' })
    await vi.waitFor(() => expect(turns).toHaveLength(3))
    expect(turns[2]).toContain('[Codex answered in the room:]\n못 본 답')
    expect(turns[2]).not.toContain('본 답\n[')
    expect(turns[2]).not.toContain('[Codex answered in the room:]\n본 답')
    expect(turns[2]).toContain('[Room members:')
  })

  it('대화가 길어 앞 줄을 잘라 낸 뒤에도(400줄) 방 사람의 답이 방장에게 간다', async () => {
    const first = make()
    const c = first.chats.talk('시작')
    await vi.waitFor(() => expect(first.chats.get(c.id).state).toBe('idle'))
    // 긴 대화를 만든다: 대화 파일에 하위 에이전트 줄을 채워 다시 읽는다
    const file = path.join(first.dir, 'chats', `${c.id}.json`)
    const saved: { items: unknown[] } = JSON.parse(fs.readFileSync(file, 'utf8'))
    saved.items = [...Array.from({ length: 420 }, () => ({ kind: 'text', at: '2026-11-20T00:00:00.000Z', text: '채움', sub: true })), ...saved.items]
    fs.writeFileSync(file, JSON.stringify(saved))
    const { chats } = make(first.dir)
    chats.send(c.id, { text: '하나' })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(chats.get(c.id).items).toHaveLength(400)
    chats.send(c.id, { text: '@Codex 봐 줘' })
    await vi.waitFor(() => expect(chats.get(c.id).items.some((x) => x.kind === 'member' && x.text === 'Codex 답')).toBe(true))
    chats.send(c.id, { text: '그럼 고쳐' })
    await vi.waitFor(() => expect(turns).toHaveLength(3))
    expect(turns[2]).toContain('[Codex answered in the room:]\nCodex 답')
  })

  it('@모두는 다른 사람이 먼저 답하고 방장이 마지막에 정리한다. 사용자의 말은 한 번, 답들 앞에', async () => {
    const { chats } = make()
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.send(c.id, { text: '@모두 어떻게 생각해?' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(turns[1]).toContain('[Codex answered in the room:]\nCodex 답')
    expect(turns[1]).toContain('sum up in at most three short lines')
    const items = chats.get(c.id).items
    const tail = items.slice(items.findIndex((x) => x.kind === 'user' && x.text === '@모두 어떻게 생각해?'))
    expect(items.filter((x) => x.kind === 'user' && x.text === '@모두 어떻게 생각해?')).toHaveLength(1)
    expect(tail.map((x) => x.kind).filter((k) => k === 'user' || k === 'member' || k === 'text')).toEqual(['user', 'member', 'text'])
  })

  it('@모두에서 방 사람은 가려서 동시에 답한다: 서로의 답은 보지 않고, 방장만 다 나온 뒤 모두의 답을 본다', async () => {
    const { chats } = make()
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.invite('gemini', 'user', 'talk')
    chats.send(c.id, { text: '@all 어떻게 생각해?' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(asked).toHaveLength(2)
    for (const q of asked) { expect(q).toContain('User: @all 어떻게 생각해?'); expect(q).not.toContain('Codex 답'); expect(q).not.toContain('곁 답') }
    expect(turns[1]).toContain('Codex 답')
    expect(turns[1]).toContain('곁 답')
    expect(turns[1]).toContain('without seeing the others')
  })

  it('판정: 첫 줄 「판정: …」을 읽어 칩으로, 여럿을 부른 차례는 판정 기록에 남고 사용자가 뒤집힘을 표시한다', async () => {
    expect(verdictOf('판정: 맞음 — 식이 따라 나옴')).toBe('yes')
    expect(verdictOf('**판정:** 틀림 — 부등호')).toBe('no')
    expect(verdictOf('Verdict: unsure — not enough')).toBe('unsure')
    expect(verdictOf('그냥 의견입니다. 판정: 맞음')).toBeUndefined()
    expect(tallyOf(['yes', 'yes'])).toMatchObject({ agree: true, top: 'yes', count: 2 })
    expect(tallyOf(['yes', 'no'])?.agree).toBe(false)
    const { chats, review } = make()
    review.mockImplementation(async (o: { prompt: string }) => { asked.push(o.prompt); return '판정: 맞음 — (3)이 나옴' })
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.invite('gemini', 'user', 'talk')
    chats.send(c.id, { text: '@모두 식 (3)이 맞는지 판정해 줘' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(asked[0]).toContain('판정: 맞음 | 틀림 | 모름')
    expect(chats.get(c.id).items.filter((x) => x.kind === 'member').map((x) => (x.kind === 'member' ? x.verdict : 0))).toEqual(['yes', undefined])
    const log = chats.roomState().log
    expect(log).toMatchObject({ total: 1, flipped: 0, recent: [{ q: '식 (3)이 맞는지 판정해 줘', mode: 'independent', votes: [{ agent: 'codex', v: 'yes' }], flipped: false }] })
    expect(chats.flip(log.recent[0]!.at, true).log).toMatchObject({ total: 1, flipped: 1 })
    expect(() => chats.flip('없음', true)).toThrow(/없습니다/)
  })

  it('@모두에서 답하지 못한 사람은 방장에게 "답했다"고 하지 않고 못 했다고 알린다', async () => {
    const { chats, review } = make()
    review.mockRejectedValue(new Error('연결 안 됨'))
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.invite('gemini', 'user', 'talk')
    chats.send(c.id, { text: '@모두 식 (3)이 맞는지 봐 줘' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]).toContain('Gemini answered above')
    expect(turns[1]).toContain('Codex could not answer')
    expect(turns[1]).not.toMatch(/Codex[^.]*answered above/)
  })

  it('초대 · 권한 · 내보내기: 사용자는 수정 말고, 방장은 규칙 안에서 까닭과 함께 읽기만 · 발언까지. 방 소식이 남고 파일에 남는다', async () => {
    const { chats, dir } = make()
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(() => chats.invite('gemini', 'host', 'talk')).toThrow(/까닭/)
    expect(() => chats.invite('gemini', 'host', 'edit', '검토')).toThrow(/읽기 · 답변까지/)
    chats.invite('gemini', 'host', 'read', '그림 검토에 강함')
    expect(chats.roomState().members.find((m) => m.agent === 'gemini')).toMatchObject({ perm: 'read', by: 'host', reason: '그림 검토에 강함' })
    expect(chats.get(c.id).items.at(-1)).toMatchObject({ kind: 'room', act: 'invite', agent: 'gemini', by: 'host' })
    expect(() => chats.removeMember('codex', 'host')).toThrow(/사용자만/)
    expect(() => chats.setPerm('codex', 'edit')).toThrow(/다음 단계/)
    expect(() => chats.removeMember('claude-code', 'user')).toThrow(/방장/)
    chats.setPerm('codex', 'read')
    chats.setRules({ hostInvite: false, callMax: 1 })
    expect(() => chats.invite('gemini', 'host', 'read', '다시')).toThrow(/규칙/)
    chats.removeMember('gemini', 'host')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'agent-room.json'), 'utf8'))).toMatchObject({ rules: { hostInvite: false, callMax: 1 }, members: [{ agent: 'claude-code' }, { agent: 'codex', perm: 'read' }] })
    // 다시 켜도 그대로, 대화 파일로 읽지 않는다
    const again = new RoomChats({ dir: path.join(dir, 'chats'), runner: fake, limit: 4, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {} })
    expect(again.roomState().rules.callMax).toBe(1)
  })

  it('방장이 묻기 (room_ask): 답을 돌려주고 방에도 남긴다. 읽기만 사람은 접힌 요약, 한 번에 callMax까지', async () => {
    const { chats } = make()
    await expect(chats.hostAsk('codex', '봐 줘')).rejects.toThrow(/중앙 대화가 없습니다/)
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.setPerm('codex', 'read')
    expect(await chats.hostAsk('codex', '이 PR 위험해?')).toBe('Codex 답')
    expect(asked.at(-1)).toContain('(host) asks you:\n이 PR 위험해?')
    expect(asked.at(-1)).toContain('at most five lines')
    expect(chats.get(c.id).items.at(-1)).toMatchObject({ kind: 'member', by: 'codex', from: 'host', q: '이 PR 위험해?', fold: true, text: 'Codex 답' })
    chats.setRules({ callMax: 1 })
    const first = chats.hostAsk('codex', '하나')
    await expect(chats.hostAsk('codex', '둘')).rejects.toThrow(/한 번에 1명/)
    await first
    // 방장이 직접 받은 답은 다음 차례에 다시 붙이지 않는다
    chats.send(c.id, { text: '계속' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]).not.toContain('answered in the room')
  })
})
