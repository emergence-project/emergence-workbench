// 토론 (11/20 「토론 + 정해진 4단계」): 각자 답 → 서로 비판(이름 가림) → 고친 답(새 근거) → 정리, 끝내면 기록 · 중앙 결론 · 보관
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRunner, RunEvent, RunInput } from './agentChats.js'
import { DebateChats, pickLine } from './agentDebate.js'

type Ask = { prompt: string; model?: string; effort?: string }

describe('토론', () => {
  const dirs: string[] = []
  const turns: string[] = []
  const fake: AgentRunner = async function* (input: RunInput): AsyncGenerator<RunEvent> {
    turns.push(input.prompt)
    yield { type: 'session', id: `s${turns.length}` }
    yield { type: 'text', text: '방장 답' }
    yield { type: 'result', ok: true }
  }
  /** codex = review, gemini · 정리 = side. 단계는 물음 머리로 가린다 */
  const make = (codex: (p: string) => string, side: (p: string) => string, wait: () => Promise<void> = async () => {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-debate-'))
    dirs.push(dir)
    const asked: { who: 'codex' | 'side'; o: Ask }[] = []
    const runner = Object.assign(fake, { side: async (o: Ask) => { asked.push({ who: 'side', o }); await wait(); return side(o.prompt) } })
    const review = vi.fn(async (o: Ask) => { asked.push({ who: 'codex', o }); await wait(); return codex(o.prompt) })
    const chats = new DebateChats({ dir: path.join(dir, 'chats'), runner, limit: 4, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {}, review })
    return { chats, dir, asked }
  }
  const stageOf = (p: string) => (p.includes('sum up a debate') ? 'sum' : p.includes('This is the critique step') ? 'critique' : p.includes('This is the revise step') ? 'revise' : 'answer')
  const SUM = '동의: (3)의 꼴\n갈린 곳: 없음\n고른 안: 답 A — 부등호가 맞다'
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); turns.length = 0 })

  const open = async (chats: DebateChats, text: string) => {
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    chats.send(c.id, { text })
    const line = chats.get(c.id).items.find((x) => x.kind === 'debate')
    if (line?.kind !== 'debate') throw new Error('토론 줄이 없다')
    await vi.waitFor(() => expect(chats.get(line.chat).state).toBe('idle'))
    return { central: c.id, id: line.chat }
  }

  it('/토론은 따로 연 대화에서 네 단계를 돈다: 각자 답은 서로 못 보고, 비판은 이름을 가리고, 판정을 바꾸면 입장 바꿈 · 새 근거가 없으면 표시', async () => {
    const { chats, asked } = make(
      (p) => ({ answer: '판정: 틀림 — 부등호가 반대', critique: '→ 답 B: 부등호 방향을 확인하지 않음', revise: '판정: 맞음 — 다시 보니\n새 근거: 쪽 4의 정의' })[stageOf(p) as 'answer'] ?? '',
      (p) => (stageOf(p) === 'sum' ? SUM : stageOf(p) === 'critique' ? '→ 답 A: 정의를 잘못 읽음' : '판정: 맞음 — (3)이 나옴'),
    )
    const { central, id } = await open(chats, '/토론 식 (3)이 맞는지 판정해 줘 @Codex @Gemini')
    expect(turns).toHaveLength(1) // 방장은 토론에 끼지 않는다
    const c = chats.get(id)
    expect(c.rid).toBe('_debate')
    expect(c.debate).toMatchObject({ q: '식 (3)이 맞는지 판정해 줘', seats: [{ agent: 'codex' }, { agent: 'gemini' }], rounds: 1, skip: true, step: 'done' })
    const ms = c.items.flatMap((x) => (x.kind === 'member' ? [x] : []))
    expect(ms.map((x) => `${x.stage}:${x.by}:${x.label ?? ''}`)).toEqual(['answer:codex:A', 'answer:gemini:B', 'critique:codex:A', 'critique:gemini:B', 'revise:codex:A', 'revise:gemini:B', 'sum:claude-code:'])
    const prompts = asked.map((a) => a.o.prompt)
    for (const p of prompts.slice(0, 2)) { expect(p).toContain('cannot see the others'); expect(p).not.toContain('부등호가 반대'); expect(p).not.toContain('(3)이 나옴') }
    const crit = prompts.find((p) => stageOf(p) === 'critique' && p.includes('Your own answer is 답 A'))!
    expect(crit).toContain('답 B:\n판정: 맞음')
    expect(crit).not.toMatch(/Gemini|Codex/)
    expect(ms[4]).toMatchObject({ verdict: 'yes', prev: 'no' })
    expect(ms[4]!.bare).toBeUndefined()
    expect(ms[6]).toMatchObject({ votes: ['yes', 'yes'], changed: 1, text: SUM })
    expect(ms[6]!.verdict).toBeUndefined()
    const sum = prompts.at(-1)!
    expect(sum).toContain('do not vote')
    expect(sum).toContain('답 A (changed position after critique)')
    expect(sum).not.toMatch(/Gemini|Codex/)
    expect(chats.get(central).items.find((x) => x.kind === 'debate')).toMatchObject({ state: 'done', votes: ['yes', 'yes'], changed: 1, line: '답 A — 부등호가 맞다' })
  })

  it('새 근거 없이 판정을 바꾸면 근거 없는 바꿈(bare)', async () => {
    const { chats } = make(
      (p) => (stageOf(p) === 'answer' ? '판정: 틀림 — 반대' : stageOf(p) === 'revise' ? '판정: 맞음 — 다들 맞다니' : '→ 답 B: 없음'),
      (p) => (stageOf(p) === 'sum' ? SUM : stageOf(p) === 'critique' ? '→ 답 A: 틀림' : '판정: 맞음 — 됨'),
    )
    const { id } = await open(chats, '/토론 맞아? @codex @gemini')
    const rev = chats.get(id).items.find((x) => x.kind === 'member' && x.stage === 'revise' && x.by === 'codex')
    expect(rev).toMatchObject({ prev: 'no', bare: true })
  })

  it('모두 같은 판정이면 비판을 건너뛰고 바로 정리, 비판 0번이면 정리만', async () => {
    const { chats } = make(() => '판정: 맞음 — 됨', (p) => (stageOf(p) === 'sum' ? SUM : '판정: 맞음 — 그렇다'))
    const { id } = await open(chats, '/debate 맞아? @codex @gemini')
    expect(chats.get(id).items.flatMap((x) => (x.kind === 'member' ? [x.stage] : []))).toEqual(['answer', 'answer', 'sum'])
  })

  it('설정: 회수 · 참가자 · 정리 모델과 생각은 이 토론에 쓰이고 다음 토론의 기본이 된다', async () => {
    const { chats, asked, dir } = make(() => '판정: 틀림 — 아님', (p) => (stageOf(p) === 'sum' ? SUM : '판정: 맞음 — 그렇다'))
    const { id } = await open(chats, '/토론 맞아? @codex @gemini')
    expect(() => chats.debateSettings(id, { seats: [{ agent: 'codex' }, { agent: 'codex' }] })).toThrow(/두 번/)
    chats.debateSettings(id, { rounds: 0, seats: [{ agent: 'codex', model: 'gpt-x', effort: 'high' }, { agent: 'gemini' }], judge: { agent: 'claude-code', model: 'sonnet', effort: 'low' } })
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'agent-room.json'), 'utf8')).debate).toMatchObject({ rounds: 0, judge: { model: 'sonnet' }, seats: [{ agent: 'codex', model: 'gpt-x' }, { agent: 'gemini' }] })
    asked.length = 0
    chats.send(id, { text: '다시 봐 줘' })
    await vi.waitFor(() => expect(chats.get(id).state).toBe('idle'))
    expect(asked.find((a) => a.who === 'codex')?.o).toMatchObject({ model: 'gpt-x', effort: 'high' })
    expect(asked.at(-1)?.o).toMatchObject({ model: 'sonnet', effort: 'low' })
    expect(asked.find((a) => a.who === 'codex')?.o.prompt).toContain('Summary: 동의')
    expect(asked.filter((a) => stageOf(a.o.prompt) === 'critique')).toHaveLength(0)
    // 다음 토론은 고른 값으로 시작한다
    const { id: next } = await open(chats, '/토론 또 맞아? @codex @gemini')
    expect(chats.get(next).debate).toMatchObject({ rounds: 0, judge: { model: 'sonnet' }, seats: [{ agent: 'codex', model: 'gpt-x', effort: 'high' }, { agent: 'gemini' }] })
  })

  it('토론 끝내기: 기록에 한 줄, 중앙 줄에 결론, 대화는 보관함. 방장은 다음 차례에 결론을 받는다. 더 물으면 꺼내 다시 돈다', async () => {
    const { chats } = make(() => '판정: 맞음 — 됨', (p) => (stageOf(p) === 'sum' ? SUM : '판정: 맞음 — 그렇다'))
    const { central, id } = await open(chats, '/토론 맞아? @codex @gemini')
    const ended = chats.endDebate(id)
    expect(ended.archived).toBe(true)
    expect(chats.roomState().log.recent[0]).toMatchObject({ q: '맞아?', mode: 'debate', chat: id, rounds: 0, line: '답 A — 부등호가 맞다', votes: [{ agent: 'codex', v: 'yes' }, { agent: 'gemini', v: 'yes' }] })
    expect(chats.get(central).items.find((x) => x.kind === 'debate')).toMatchObject({ state: 'ended', line: '답 A — 부등호가 맞다' })
    chats.send(central, { text: '그대로 고쳐 줘' })
    await vi.waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]).toContain('[Debate ended: "맞아?" (Codex, Gemini) — agree — 답 A — 부등호가 맞다')
    chats.send(id, { text: '하나 더' })
    expect(chats.get(id).archived).toBeFalsy()
    expect(() => chats.send(id, { text: '또' })).toThrow(/도는 중/)
    expect(() => chats.endDebate(id)).toThrow(/도는 중/)
    await vi.waitFor(() => expect(chats.get(id).state).toBe('idle'))
  })

  it('참가자가 하나면 열지 않는다 (기본은 방장 말고 방 사람)', async () => {
    const { chats } = make(() => '', () => '')
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(() => chats.send(c.id, { text: '/토론 맞아?' })).toThrow(/둘 이상/)
    expect(() => chats.send(c.id, { text: '/토론 @codex @gemini' })).toThrow(/물음/)
    // 열지 못한 말은 중앙에 남지 않는다 (입력란에 그대로 있어 다시 보내면 두 번 남았다)
    expect(chats.get(c.id).items.filter((x) => x.kind === 'user').map((x) => x.kind === 'user' && x.text)).toEqual(['시작'])
    chats.invite('gemini', 'user', 'talk')
    expect(chats.openDebate('맞아?', 'host').debate?.seats.map((s) => s.agent)).toEqual(['codex', 'gemini'])
  })

  it('멈춘 바로 뒤 더 물어도 앞 차례는 되살아나지 않는다: 정리는 한 번만', async () => {
    const gates: (() => void)[] = []
    let gate = Promise.resolve()
    const hold = () => { gate = new Promise<void>((r) => { gates.push(r) }) }
    const { chats, asked } = make(() => '판정: 맞음 — 됨', (p) => (stageOf(p) === 'sum' ? SUM : '판정: 맞음 — 그렇다'), () => gate)
    const c = chats.talk('시작')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    hold()
    chats.send(c.id, { text: '/토론 맞아? @codex @gemini' })
    const line = chats.get(c.id).items.find((x) => x.kind === 'debate')
    if (line?.kind !== 'debate') throw new Error('토론 줄이 없다')
    chats.stop(line.chat)
    expect(chats.get(line.chat).state).toBe('stopped')
    hold()
    chats.send(line.chat, { text: '다시 맞아?' })
    gates[0]!() // 앞 차례의 답이 이제야 온다
    await new Promise((r) => setTimeout(r, 20))
    expect(asked.filter((a) => stageOf(a.o.prompt) === 'sum')).toHaveLength(0)
    gates[1]!()
    await vi.waitFor(() => expect(chats.get(line.chat).state).toBe('idle'))
    expect(asked.filter((a) => stageOf(a.o.prompt) === 'sum')).toHaveLength(1)
    expect(chats.get(line.chat).items.filter((x) => x.kind === 'member' && x.stage === 'sum')).toHaveLength(1)
  })

  it('정리의 고른 안 줄을 뽑는다', () => {
    expect(pickLine(SUM)).toBe('답 A — 부등호가 맞다')
    expect(pickLine('**고른 안:** B')).toBe('B')
    expect(pickLine('그냥 한 줄')).toBe('그냥 한 줄')
  })
})
