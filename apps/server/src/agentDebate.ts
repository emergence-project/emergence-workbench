/**
 * 토론 대화 (11/20 사용자 결정 「토론 + 정해진 4단계」, 시안 https://claude.ai/artifact/R88teWLKuf7DgokaYQA61n, 연구 근거는 그 시안의 표):
 *
 * - 중앙과 따로 여는 대화(rid DEBATE_RID). 중앙에서 사용자가 `/토론 물음 @codex @gemini`(또는 /debate)로, 방장은 MCP debate_open으로 연다.
 *   중앙에는 「토론 · 물음 · 결과 · 열기」 한 줄(kind debate)만 남고, 끝내면 그 줄에 결론이 적히며 방장은 다음 차례 앞에 결론을 받는다.
 * - 사회는 앱이 한다(정해진 차례, 에이전트가 진행하지 않는다): ① 각자 답 — 서로 못 보고 동시에 ② 서로 비판 — 이름을 가리고 「답 A · 답 B」로
 *   ③ 고친 답 — 입장을 바꾸려면 「새 근거:」 한 줄 ④ 정리 — 정리 모델(기본 Claude)이 투표하지 않고 이름을 가린 마지막 답으로 세 줄.
 * - 모두 같은 판정이면 비판을 건너뛴다(skip). 비판은 rounds 차례(0 · 1 · 2, 기본 1).
 * - 「토론 끝내기」: 토론 기록에 한 줄, 중앙 줄에 결론, 대화는 보관함(지우지 않음). 더 물으면 1단계부터 다시 돈다(보관함에 있으면 꺼낸다).
 * 참가자 · 정리의 모델 · 생각 수준은 토론마다 고르고, 고른 값은 다음 토론의 기본이 된다(방 상태의 debate).
 */
import crypto from 'node:crypto'
import { CENTRAL_RID, DEBATE_RID, type AgentKind, type Chat, type ChatItem, type ChatMessageBody, type Debate, type DebateSeat, type DebateSettingsBody, type RoomVerdict } from '@rw/core/contract/agentChats'
import { mentionsOf, ROOM_NAME, tallyOf, verdictOf } from '@rw/core'
import { clip, type Stored } from './agentChats.js'
import { RoomChats } from './agentRoom.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

type Member = Extract<ChatItem, { kind: 'member' }>
type DStored = Stored & { debate: Debate }
type Line = Extract<ChatItem, { kind: 'debate' }>
const now = () => new Date().toISOString()
/** 이름을 가린 이름: 자리 차례대로 A · B · C · D */
const LABELS = ['A', 'B', 'C', 'D']
/** 중앙에서 토론을 여는 명령 */
const OPEN = /^\s*\/(토론|debate)(?=\s|$)/i
/** 판정을 바꿀 때 적는 새 근거 줄 */
const REASON = /^[\s*_>#-]*(새\s*근거|new reason)\s*[:：]/im
const KO = 'Reply in the language of the question (usually Korean).'

/** 판정 물음일 때의 첫 줄 지시 (방의 memberPrompt와 같은 꼴) */
const VERDICT_LINE = 'If the question asks for a judgment or a check (is it right, does it hold, is it safe), start with exactly one line `판정: 맞음 | 틀림 | 모름 — <one-line reason>` (in English: `Verdict: right | wrong | unsure — <reason>`). Say 모름 rather than guess. Otherwise give your answer or proposal directly.'

export function answerPrompt(q: string, context: string, me: AgentKind): string {
  return [
    `You are ${ROOM_NAME[me]}, one of several agents answering the same question in a debate in Emergence Workbench, the user's research workbench app. You answer first and alone: you cannot see the others' answers.`,
    'Read only: do not edit files, write records or run commands that change anything. Answer in text.',
    VERDICT_LINE, 'Then at most six short lines: your answer and the reason. No preamble.', KO,
    ...(context ? ['', 'Earlier in this debate:', context] : []),
    '', 'Question:', q,
  ].join('\n')
}

export function critiquePrompt(q: string, mine: { label: string; text: string }, others: { label: string; text: string }[]): string {
  return [
    `This is the critique step of a debate. Your own answer is 답 ${mine.label}. The other answers are shown with names hidden.`,
    'Point out errors, gaps and weak reasoning in the other answers. Do not praise and do not repeat your own answer.',
    'Write one line per point, each starting with `→ 답 X:` (X = the letter), at most four lines in all. If an answer has no real problem, say so in one line.', KO,
    '', 'Question:', q, '', `Your answer (답 ${mine.label}):`, mine.text,
    ...others.flatMap((o) => ['', `답 ${o.label}:`, o.text]),
  ].join('\n')
}

export function revisePrompt(q: string, mine: { label: string; text: string }, critiques: { label: string; text: string }[]): string {
  return [
    `This is the revise step of a debate. Your answer is 답 ${mine.label}. Below are the critiques the others wrote (names hidden).`,
    'Revise your answer where a critique is right, and keep it where it is not. Do not agree just to agree.',
    VERDICT_LINE,
    'If you change your verdict or position, add one line `새 근거: <the new reason that changed your mind>` (in English `New reason:`). Without a new reason, do not change.',
    'At most six short lines in all.', KO,
    '', 'Question:', q, '', `Your answer (답 ${mine.label}):`, mine.text,
    ...critiques.flatMap((c) => ['', `Critique from 답 ${c.label}:`, c.text]),
  ].join('\n')
}

export function sumPrompt(q: string, finals: { label: string; text: string; changed: boolean }[], critiqued: boolean): string {
  return [
    'You sum up a debate in Emergence Workbench. You do not vote and you do not add your own answer: judge only from the final answers below. Names are hidden.',
    critiqued ? 'The answers were critiqued by the others and then revised.' : 'The answers were given independently (no critique step).',
    'Write exactly three short lines in the language of the question (usually Korean):',
    '`동의: <what the answers agree on>`', '`갈린 곳: <where they still differ, or 없음>`', '`고른 안: <the answer best supported by the reasons, and why in a few words>`',
    '', 'Question:', q,
    ...finals.flatMap((f) => ['', `답 ${f.label}${f.changed ? ' (changed position after critique)' : ''}:`, f.text]),
  ].join('\n')
}

/** 판정이 있으면 모두 같은가 (모두 판정이 있고 모름이 아닐 때만) */
const unanimous = (xs: Member[]): boolean => {
  const vs = xs.map((x) => x.verdict)
  return vs.length > 1 && vs.every((v) => v && v !== 'unsure' && v === vs[0])
}

export class DebateChats extends RoomChats {
  /** 끊은 토론 (다음 단계로 가지 않는다) */
  private readonly halted = new Set<string>()

  constructor(...a: ConstructorParameters<typeof RoomChats>) {
    super(...a)
    // 앱이 다시 켜지면 돌던 토론은 멈춘다(AgentChats가 stopped로): 단계와 중앙 줄도 맞춘다
    for (const c of this.chats.values()) {
      if (c.debate && c.state !== 'running' && c.debate.step !== 'done') { c.debate.step = 'done'; this.write(c) }
      let fixed = false
      for (const it of c.items) if (it.kind === 'debate' && it.state === 'running' && this.chats.get(it.chat)?.state !== 'running') { it.state = 'done'; fixed = true }
      if (fixed) this.write(c)
    }
  }

  private debateOf(id: string): DStored {
    const c = this.must(id)
    if (!c.debate) throw new WorkbenchError(400, t('토론 대화가 아닙니다', 'Not a debate conversation'))
    return c as DStored
  }

  /** 자리: 그 에이전트의 마지막 모델 · 생각 (없으면 기본) */
  private seatOf(agent: AgentKind): DebateSeat {
    return { ...(this.saved.debate.seats.find((s) => s.agent === agent) ?? { agent }) }
  }

  /** 토론 열기: agents가 없으면 방장 말고 방 사람 모두. 둘 이상이어야 서로 비판한다 */
  openDebate(q: string, by: 'user' | 'host', agents?: AgentKind[], attach?: ChatMessageBody['attach']): Chat {
    const who = [...new Set(agents?.length ? agents : this.saved.members.filter((m) => m.agent !== this.saved.host).map((m) => m.agent))]
    if (who.length < 2) throw new WorkbenchError(400, t('토론에는 참가자가 둘 이상 필요합니다. @Codex @Gemini처럼 부르거나 방에 초대하세요', 'A debate needs at least two participants. Call them like @Codex @Gemini or invite them to the room'))
    if (who.length > LABELS.length) throw new WorkbenchError(400, t(`토론에는 ${LABELS.length}명까지 둡니다`, `A debate holds at most ${LABELS.length}`))
    const at = now(), d = this.saved.debate, central = this.central()
    const c: DStored = {
      id: `${at.slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`, rid: DEBATE_RID,
      title: clip(q.split('\n')[0]!.trim(), 60), agent: d.judge.agent, scope: { kind: 'all' }, write: 'read', state: 'running', mode: 'edit',
      model: d.judge.model ?? 'default', effort: d.judge.effort ?? 'medium', claims: [], changed: [], todos: [], created: at, updated: at,
      items: [{ kind: 'user', at, text: q, ...(attach?.length && { attach: attach.map((a) => ({ ...a, ...(a.text && { text: clip(a.text, 600) }) })) }) }],
      debate: { q, seats: who.map((a) => this.seatOf(a)), judge: { ...d.judge }, rounds: d.rounds, skip: d.skip, step: 'answer', round: 0, by, ...(central && { central: central.id }) },
    }
    this.chats.set(c.id, c)
    if (central) { central.items.push({ kind: 'debate', at, chat: c.id, q: clip(q, 300), by, state: 'running' }); this.touch(central) }
    this.touch(c)
    void this.runDebate(c, q).catch(() => undefined)
    return this.get(c.id)
  }

  /** 받는 이: 중앙의 /토론은 토론을 열고, 토론 대화의 말은 1단계부터 다시 돈다 */
  override send(id: string, m: ChatMessageBody, prompt?: string): Chat {
    const c = this.must(id)
    if (c.debate) return this.more(c as DStored, m)
    if (c.rid === CENTRAL_RID && prompt === undefined && OPEN.test(m.text)) {
      const q = m.text.replace(OPEN, '').replace(/(^|\s)@\S+/g, ' ').replace(/[ \t]+/g, ' ').trim()
      if (!q) throw new WorkbenchError(400, t('/토론 뒤에 물음을 적어 주세요', 'Write the question after /토론'))
      const agents = mentionsOf(m.text).filter((a): a is AgentKind => a !== 'all')
      c.items.push({ kind: 'user', at: now(), text: m.text })
      this.openDebate(q, 'user', agents.length ? agents : undefined, m.attach)
      return this.get(id)
    }
    return super.send(id, m, prompt)
  }

  /** 토론에서 더 묻기: 앞 정리를 맥락으로 1단계부터 */
  private more(c: DStored, m: ChatMessageBody): Chat {
    if (c.state === 'running') throw new WorkbenchError(409, t('토론이 도는 중입니다. 정리가 끝난 뒤 더 물어 주세요', 'The debate is running. Ask more after the summary'))
    if (c.archived) c.archived = false
    delete c.debate.ended
    c.items.push({ kind: 'user', at: now(), text: m.text, ...(m.attach?.length && { attach: m.attach.map((a) => ({ ...a, ...(a.text && { text: clip(a.text, 600) }) })) }) })
    c.state = 'running'
    this.line(c, { state: 'running' })
    this.touch(c)
    void this.runDebate(c, m.text).catch(() => undefined)
    return this.get(c.id)
  }

  /** 앞 정리와 앞 물음 (더 묻기의 맥락) */
  private context(c: Stored): string {
    const out: string[] = []
    for (const it of c.items) {
      if (it.kind === 'user') out.push(`Question: ${clip(it.text, 1500)}`)
      if (it.kind === 'member' && it.stage === 'sum' && it.text) out.push(`Summary: ${clip(it.text, 1500)}`)
    }
    return out.slice(0, -1).slice(-6).join('\n')
  }

  /** 한 자리에게 묻고 답을 대화에 남긴다 */
  private async say(c: Stored, seat: DebateSeat, stage: Member['stage'], round: number, label: string | undefined, prompt: string): Promise<Member> {
    const it: Member = { kind: 'member', at: now(), by: seat.agent, stage, ...(round && { round }), ...(label && { label }) }
    c.items.push(it)
    this.asking.set(seat.agent, (this.asking.get(seat.agent) ?? 0) + 1)
    this.touch(c)
    const t0 = Date.now()
    try {
      it.text = clip((await this.oneShot(seat.agent, prompt, seat)).trim() || t('(답이 비었습니다)', '(empty answer)'), 8000)
      const v = stage === 'sum' ? undefined : verdictOf(it.text)
      if (v) it.verdict = v
    } catch (e) {
      it.error = clip(e instanceof Error ? e.message : String(e), 500)
    } finally {
      const n = (this.asking.get(seat.agent) ?? 1) - 1
      if (n > 0) this.asking.set(seat.agent, n)
      else this.asking.delete(seat.agent)
      it.seconds = Math.round((Date.now() - t0) / 1000)
      this.touch(c)
    }
    return it
  }

  /** 네 단계 (사회 = 앱) */
  private async runDebate(c: DStored, q: string): Promise<void> {
    const d = c.debate, seats = d.seats.map((s) => ({ ...s })), labels = seats.map((_, i) => LABELS[i]!)
    this.halted.delete(c.id)
    const live = () => !this.halted.has(c.id) && this.chats.get(c.id) === c
    const ctx = this.context(c)
    const step = (s: typeof d.step, round = d.round) => { d.step = s; d.round = round; this.touch(c) }
    step('answer', 0)
    let now_ = await Promise.all(seats.map((s, i) => this.say(c, s, 'answer', 0, labels[i], answerPrompt(q, ctx, s.agent))))
    const changed = new Set<number>()
    let rounds = 0
    for (let r = 1; r <= d.rounds && live(); r++) {
      if (d.skip && unanimous(now_)) break
      const ok = now_.map((x, i) => ({ i, text: x.text })).filter((x): x is { i: number; text: string } => !!x.text)
      if (ok.length < 2) break
      rounds = r
      step('critique', r)
      const crit = await Promise.all(ok.map((x) => this.say(c, seats[x.i]!, 'critique', r, labels[x.i], critiquePrompt(q, { label: labels[x.i]!, text: x.text }, ok.filter((o) => o.i !== x.i).map((o) => ({ label: labels[o.i]!, text: o.text }))))))
      if (!live()) break
      step('revise', r)
      const got = await Promise.all(ok.map((x, k) => this.say(c, seats[x.i]!, 'revise', r, labels[x.i], revisePrompt(q, { label: labels[x.i]!, text: x.text },
        crit.flatMap((cr, j) => (j !== k && cr.text ? [{ label: labels[ok[j]!.i]!, text: cr.text }] : []))))))
      const next = now_.slice()
      got.forEach((g, k) => {
        const i = ok[k]!.i, before = now_[i]!
        if (!g.text) return
        if (g.verdict && before.verdict && g.verdict !== before.verdict) { g.prev = before.verdict; changed.add(i); if (!REASON.test(g.text)) g.bare = true }
        next[i] = g
      })
      now_ = next
    }
    if (!live()) return
    step('sum', rounds)
    const votes = now_.flatMap((x) => (x.verdict ? [x.verdict] : [])) as RoomVerdict[]
    const finals = now_.flatMap((x, i) => (x.text ? [{ label: labels[i]!, text: x.text, changed: changed.has(i) }] : []))
    const sum = await this.say(c, d.judge, 'sum', rounds, undefined, sumPrompt(q, finals, rounds > 0))
    sum.votes = votes
    if (changed.size) sum.changed = changed.size
    if (!live()) return
    d.step = 'done'
    c.state = 'idle'
    this.line(c, { state: 'done', votes, ...(changed.size && { changed: changed.size }), ...(sum.text && { line: pickLine(sum.text) }) })
    this.touch(c)
  }

  /** 중앙의 토론 줄을 고친다 */
  private line(c: DStored, p: Partial<Line>): void {
    const central = c.debate.central ? this.chats.get(c.debate.central) : undefined
    const it = central?.items.slice().reverse().find((x): x is Line => x.kind === 'debate' && x.chat === c.id)
    if (!central || !it) return
    Object.assign(it, p)
    if (p.state === 'running') { delete it.votes; delete it.changed; delete it.line }
    this.touch(central)
  }

  /** 토론 설정: 고른 값은 다음 토론의 기본이 된다 */
  debateSettings(id: string, b: DebateSettingsBody): Chat {
    const c = this.debateOf(id), d = c.debate, def = this.saved.debate
    if (b.seats) {
      if (c.state === 'running') throw new WorkbenchError(409, t('토론이 도는 중에는 참가자를 바꾸지 않습니다', 'Participants do not change while the debate runs'))
      if (new Set(b.seats.map((s) => s.agent)).size !== b.seats.length) throw new WorkbenchError(400, t('같은 에이전트를 두 번 둘 수 없습니다', 'The same agent cannot sit twice'))
      d.seats = b.seats.map((s) => ({ ...s }))
      for (const s of b.seats) def.seats = [...def.seats.filter((x) => x.agent !== s.agent), { ...s }]
    }
    if (b.judge) { d.judge = { ...b.judge }; def.judge = { ...b.judge }; c.agent = b.judge.agent; c.model = b.judge.model ?? 'default'; c.effort = b.judge.effort ?? 'medium' }
    if (b.rounds !== undefined) { d.rounds = b.rounds; def.rounds = b.rounds }
    if (b.skip !== undefined) { d.skip = b.skip; def.skip = b.skip }
    this.save()
    this.touch(c)
    return this.get(id)
  }

  /** 토론 끝내기: 기록 한 줄 · 중앙에 결론 · 보관함 */
  endDebate(id: string): Chat {
    const c = this.debateOf(id), d = c.debate
    if (c.state === 'running') throw new WorkbenchError(409, t('토론이 도는 중입니다. 멈추거나 정리를 기다려 주세요', 'The debate is running. Stop it or wait for the summary'))
    const sum = c.items.slice().reverse().find((x): x is Member => x.kind === 'member' && x.stage === 'sum')
    const votes = sum?.votes ?? [], finals = new Map<AgentKind, RoomVerdict>()
    for (const it of c.items) if (it.kind === 'member' && it.verdict && (it.stage === 'answer' || it.stage === 'revise')) finals.set(it.by, it.verdict)
    const line = sum?.text ? pickLine(sum.text) : undefined
    d.ended = now()
    d.step = 'done'
    this.addLog({ at: d.ended, q: clip(d.q.replace(/\s+/g, ' ').trim(), 200), mode: 'debate', votes: [...finals].map(([agent, v]) => ({ agent, v })), flipped: false, chat: c.id, rounds: sum?.round ?? 0, ...(sum?.changed && { changed: sum.changed }), ...(line && { line }) })
    this.line(c, { state: 'ended', ...(votes.length && { votes }), ...(line && { line }) })
    const tally = tallyOf(votes)
    this.news.push(`[Debate ended: "${clip(d.q, 200)}" (${d.seats.map((s) => ROOM_NAME[s.agent]).join(', ')})${tally ? ` — ${tally.agree ? 'agree' : 'split'}` : ''}${line ? ` — ${line}` : ''}. The user may ask you to act on it.]`)
    c.archived = true
    this.touch(c)
    return this.get(id)
  }

  override stop(id: string): Chat {
    const c = this.must(id)
    if (!c.debate) return super.stop(id)
    if (c.state === 'running') {
      this.halted.add(id)
      c.state = 'stopped'
      c.debate.step = 'done'
      c.items.push({ kind: 'error', at: now(), text: t('토론을 멈췄습니다. 더 물으면 1단계부터 다시 돕니다', 'Stopped the debate. Ask more to start again from step 1') })
      this.line(c as DStored, { state: 'done' })
      this.touch(c)
    }
    return this.get(id)
  }
}

/** 정리의 「고른 안」 줄 (없으면 첫 줄) */
export function pickLine(text: string): string {
  const lines = text.split('\n').map((l) => l.replace(/\*\*|__|`/g, '').replace(/^[\s*_>#-]+/, '').trim()).filter(Boolean)
  return clip((lines.find((l) => /^(고른 안|chosen)\s*[:：]/i.test(l)) ?? lines[0] ?? '').replace(/^(고른 안|chosen)\s*[:：]\s*/i, ''), 200)
}
