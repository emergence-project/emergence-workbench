/**
 * 중앙 방 (11/20 사용자 결정 "중앙 = 여럿이 말하는 방", 시안 https://claude.ai/artifact/1e4G2p1cQjgVNSSAZ9RFHr §7 추천대로):
 *
 * - 방 사람: 방장(수정을 가진 사람, 왕관) 하나와 다른 에이전트. 사용자 말고 4명까지. 권한은 읽기만(부르면 접힌 요약) · 발언(부르면 답함) · 수정(방장).
 * - 받는 이: 그냥 말하면 방장만, @이름이면 부른 사람만, @모두면 모두. @모두에서는 다른 사람이 먼저 답하고 방장이 마지막에 정리한다 (§7-4).
 * - 초대: 사용자는 언제나, 방장은 방 규칙이 허락하면 읽기만 · 발언까지 (까닭 한 줄, 사용자가 ×로 뺀다, §7-2). 방장이 한 번에 부르는 수는 규칙의 callMax (§7-3).
 * - 방 사람은 대화 세션을 열지 않는다: 부를 때마다 최근 방 대화와 물음을 한 번 읽고 답한다(읽기만). 방장은 아직 못 본 답을 다음 차례 앞에 받는다.
 * - 1단계: 방장은 Claude(중앙 대화)로 고정이다. 수정을 다른 에이전트에게 넘기기와 그때 하위 대화 마무리(§7-5)는 미룬다(11/20 "판정 · 검증에만 씀").
 * - 2단계(11/20, 시안 https://claude.ai/artifact/R88teWLKuf7DgokaYQA61n): 판정을 물으면 방 사람은 첫 줄을 「판정: 맞음 | 틀림 | 모름 — 근거」로 답하고 앱이 읽어 칩으로 보인다.
 *   방장 정리는 세 줄까지, 여럿을 부른 차례의 판정은 토론 기록(agent-room-log.json)에 남아 사용자가 「뒤집힘」을 표시한다. 서로 비판하는 토론은 따로 연 토론 대화가 맡는다(agentDebate.ts).
 * 방 상태는 설정 폴더 agent-room.json (대화 파일 폴더 agent-chats/ 옆).
 */
import fs from 'node:fs'
import path from 'node:path'
import { CENTRAL_RID, DEBATE_DEFAULT, RoomState as RoomStateSchema, VerdictEntry as VerdictEntrySchema, type AgentKind, type VerdictEntry, type Chat, type ChatItem, type ChatMessageBody, type CentralState, type DebateSeat, type RoomMember, type RoomPerm, type RoomRules, type RoomState } from '@rw/core/contract/agentChats'
import { clip, LIVE, type AgentChatsDeps, type Stored } from './agentChats.js'
import { readOnlyAsk } from './agentReviewers.js'
import { CentralChats } from './agentCentral.js'
import type { CentralMemoDeps } from './agentTidy.js'
import { ROOM_NAME, routeOf, verdictOf } from '@rw/core'
import { z } from 'zod'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 사용자 말고 방에 둘 수 있는 수 (§7-3) */
export const ROOM_MAX = 4
const now = () => new Date().toISOString()
type Member = Extract<ChatItem, { kind: 'member' }>
const SAVED = RoomStateSchema.omit({ asking: true, log: true })
type Saved = Omit<RoomState, 'asking' | 'log'>
const LOG = z.array(VerdictEntrySchema)
/** 판정 기록에 남기는 수 (오래된 것부터 버림) */
const LOG_MAX = 500

export const ROOM_DEFAULT: Saved = {
  host: 'claude-code',
  members: [{ agent: 'claude-code', perm: 'edit', by: 'user', at: '2026-11-20T00:00:00.000Z' }, { agent: 'codex', perm: 'talk', by: 'user', at: '2026-11-20T00:00:00.000Z' }],
  rules: { hostInvite: true, defaultPerm: 'talk', callMax: 2 },
  debate: structuredClone(DEBATE_DEFAULT),
}

export { mentionsOf, routeOf } from '@rw/core'

const nameOf = (a: AgentKind) => ROOM_NAME[a]
const PERM_EN: Record<RoomPerm, string> = { read: 'read-only', talk: 'talk', edit: 'edit (host)' }

/** 방 사람에게 줄 글: 방 안내 · 최근 방 대화 · 물음 */
export function memberPrompt(c: Pick<Stored, 'items'>, me: RoomMember, host: AgentKind, q: string, from: 'user' | 'host'): string {
  const lines: string[] = []
  for (const it of c.items.slice(-40)) {
    if (it.kind === 'user') lines.push(`User: ${clip(it.text, 800)}`)
    else if (it.kind === 'text' && !it.sub) lines.push(`${nameOf(host)} (host): ${clip(it.text, 800)}`)
    else if (it.kind === 'member' && it.text) lines.push(`${nameOf(it.by)}: ${clip(it.text, 800)}`)
  }
  const recent = lines.slice(-14)
  return [
    `You are ${nameOf(me.agent)}, a member of a group conversation in Emergence Workbench, the user's research workbench app. ${nameOf(host)} is the host: it holds the edit permission and does the work (sub-conversations, files, pull requests).`,
    `Your permission is ${PERM_EN[me.perm]}: read only. Do not edit files, write records or run commands that change anything; answer in the room.`,
    me.perm === 'read' ? 'Answer as a short summary of at most five lines.' : 'Answer briefly and to the point: a second view, a check, or what you would do differently.',
    'Reply in the language the user writes (usually Korean).',
    'If you are asked for a judgment or a check (is it right, does it hold, is it safe to merge), start with exactly one line `판정: 맞음 | 틀림 | 모름 — <one-line reason>` (in English: `Verdict: right | wrong | unsure — <reason>`), then at most two short lines. Say 모름 rather than guess. Otherwise answer normally without that line.',
    ...(recent.length ? ['', 'Recent conversation in the room:', ...recent] : []),
    '', from === 'host' ? `${nameOf(host)} (host) asks you:` : 'The user asks you:', q,
  ].join('\n')
}

export class RoomChats extends CentralChats {
  protected saved: Saved
  protected readonly asking = new Map<AgentKind, number>()
  /** 중앙 대화마다 방장에게 넘긴 마지막 항목 수 (그 뒤의 방 사람 답 · 방 소식을 다음 차례 앞에 붙인다). 오래된 줄을 잘라 낸 수(trimmed)까지 센 값이다 */
  private readonly fed = new Map<string, number>()
  /** 이번 차례에 방장에게 덧붙일 말 (@모두: 마지막에 정리) */
  private hostLine = ''
  /** 방장이 아직 못 본 토론 결과 (다음 차례 앞에 붙인다) */
  protected readonly news: string[] = []

  constructor(deps: AgentChatsDeps, memoDeps?: CentralMemoDeps) {
    super(deps, memoDeps)
    this.saved = this.load()
  }

  private file(): string { return path.join(path.dirname(this.deps.dir), 'agent-room.json') }
  private load(): Saved {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.file(), 'utf8'))
      // 11/20 「독립 | 토론」 고르기는 토론 대화로 옮겼다: 옛 파일의 rules.mode는 버린다
      if (raw && typeof raw === 'object' && 'rules' in raw && raw.rules && typeof raw.rules === 'object') Reflect.deleteProperty(raw.rules, 'mode')
      const s = SAVED.safeParse(raw)
      if (s.success) return s.data
    } catch { /* 처음이거나 못 읽으면 기본 방 */ }
    return structuredClone(ROOM_DEFAULT)
  }
  protected save(): void { fs.writeFileSync(this.file(), `${JSON.stringify(this.saved, null, 2)}\n`) }

  roomState(): RoomState {
    const log = this.readLog()
    return { ...structuredClone(this.saved), asking: [...this.asking.keys()], log: { total: log.length, flipped: log.filter((x) => x.flipped).length, recent: log.slice(0, 20) } }
  }

  override centralState(): CentralState { return { ...super.centralState(), room: this.roomState() } }

  /** 방 소식을 중앙 대화에 남기고(있으면) 저장한다 */
  private changed(it: Omit<Extract<ChatItem, { kind: 'room' }>, 'kind' | 'at'>): RoomState {
    this.save()
    const c = this.central()
    if (c) { c.items.push({ kind: 'room', at: now(), ...it }); this.touch(c) }
    return this.roomState()
  }

  protected member(agent: AgentKind): RoomMember {
    const m = this.saved.members.find((x) => x.agent === agent)
    if (!m) throw new WorkbenchError(404, t(`${nameOf(agent)}는 방에 없습니다`, `${nameOf(agent)} is not in the room`))
    return m
  }

  /** 초대 (사용자: 아무 권한이나 수정 말고, 방장: 규칙이 허락하면 읽기만 · 발언까지와 까닭) */
  invite(agent: AgentKind, by: 'user' | 'host', perm?: RoomPerm, reason?: string): RoomState {
    const r = this.saved
    if (by === 'host' && !r.rules.hostInvite) throw new WorkbenchError(409, t('방 규칙상 방장은 초대할 수 없습니다. 사용자에게 부탁하세요', 'Room rules do not let the host invite. Ask the user'))
    if (r.members.some((x) => x.agent === agent)) throw new WorkbenchError(409, t(`${nameOf(agent)}는 이미 방에 있습니다`, `${nameOf(agent)} is already in the room`))
    if (r.members.length >= ROOM_MAX) throw new WorkbenchError(409, t(`방에는 ${ROOM_MAX}명까지 둡니다`, `The room holds at most ${ROOM_MAX}`))
    const p = perm ?? r.rules.defaultPerm
    if (p === 'edit') throw new WorkbenchError(409, by === 'host' ? t('방장은 읽기 · 답변까지만 줄 수 있습니다', 'The host can give only read or answer') : t('수정 넘기기는 다음 단계입니다. 지금은 방장(Claude)만 수정합니다', 'Handing over edit comes next. For now only the host (Claude) edits'))
    if (by === 'host' && !reason?.trim()) throw new WorkbenchError(400, t('방장이 초대할 때는 까닭 한 줄을 적습니다', 'The host gives a one-line reason when inviting'))
    r.members.push({ agent, perm: p, by, ...(reason?.trim() && { reason: clip(reason.trim(), 200) }), at: now() })
    return this.changed({ act: 'invite', agent, perm: p, by, ...(reason?.trim() && { reason: clip(reason.trim(), 200) }) })
  }

  /** 권한 바꾸기 (사용자만). 1단계는 방장의 수정을 넘기지 않는다 */
  setPerm(agent: AgentKind, perm: RoomPerm): RoomState {
    const m = this.member(agent)
    if (agent === this.saved.host || perm === 'edit') throw new WorkbenchError(409, t('수정 넘기기는 다음 단계입니다. 지금은 방장(Claude)만 수정합니다', 'Handing over edit comes next. For now only the host (Claude) edits'))
    if (m.perm === perm) return this.roomState()
    const prev = m.perm
    m.perm = perm
    return this.changed({ act: 'perm', agent, perm, prev, by: 'user' })
  }

  /** 내보내기 (사용자: 방장 말고 누구나, 방장: 자기가 초대한 사람만) */
  removeMember(agent: AgentKind, by: 'user' | 'host'): RoomState {
    const m = this.member(agent)
    if (agent === this.saved.host) throw new WorkbenchError(409, t('방장은 내보낼 수 없습니다', 'The host cannot be removed'))
    if (by === 'host' && m.by !== 'host') throw new WorkbenchError(409, t('사용자가 초대한 사람은 사용자만 내보냅니다', 'Only the user removes members the user invited'))
    this.saved.members = this.saved.members.filter((x) => x.agent !== agent)
    return this.changed({ act: 'remove', agent, by })
  }

  setRules(r: Partial<RoomRules>): RoomState {
    this.saved.rules = { ...this.saved.rules, ...r }
    return this.changed({ act: 'rules', by: 'user' })
  }

  /** 방장이 방 사람에게 묻는다 (room_ask): 한 번에 callMax까지 */
  async hostAsk(agent: AgentKind, question: string): Promise<string> {
    const c = this.central()
    if (!c) throw new WorkbenchError(409, t('중앙 대화가 없습니다', 'There is no central conversation'))
    const m = this.member(agent)
    if (agent === this.saved.host) throw new WorkbenchError(400, t('방장 자신에게는 묻지 않습니다', 'The host does not ask itself'))
    const busy = [...this.asking.values()].reduce((a, b) => a + b, 0)
    if (busy >= this.saved.rules.callMax) throw new WorkbenchError(409, t(`방 규칙상 한 번에 ${this.saved.rules.callMax}명까지 부릅니다. 앞 답을 기다리세요`, `Room rules allow ${this.saved.rules.callMax} at once. Wait for the earlier answer`))
    const it = await this.ask(c, m, question, 'host')
    return it.text ?? t(`(답하지 못함: ${it.error ?? ''})`, `(no answer: ${it.error ?? ''})`)
  }

  /** 방 사람 하나에게 묻고 답을 방에 남긴다 */
  protected async ask(c: Stored, m: RoomMember, q: string, from: 'user' | 'host', seen: Pick<Stored, 'items'> = c): Promise<Member> {
    const it: Member = { kind: 'member', at: now(), by: m.agent, ...(from === 'host' && { q: clip(q, 2000), from: 'host' }), ...(m.perm === 'read' && { fold: true }) }
    c.items.push(it)
    this.asking.set(m.agent, (this.asking.get(m.agent) ?? 0) + 1)
    this.touch(c)
    const t0 = Date.now()
    try {
      it.text = clip((await this.oneShot(m.agent, memberPrompt(seen, m, this.saved.host, q, from))).trim() || t('(답이 비었습니다)', '(empty answer)'), 8000)
      const v = verdictOf(it.text)
      if (v) it.verdict = v
    } catch (e) {
      it.error = clip(e instanceof Error ? e.message : String(e), 500)
    } finally {
      const n = (this.asking.get(m.agent) ?? 1) - 1
      if (n > 0) this.asking.set(m.agent, n)
      else this.asking.delete(m.agent)
      it.seconds = Math.round((Date.now() - t0) / 1000)
      this.touch(c)
    }
    return it
  }

  /** 한 번 묻고 답 글을 받는다: Codex는 읽기만 하는 codex exec(검토와 같은 것), Gemini는 그 실행기를 읽기만으로. 예제 · 시험은 곁 질문 실행기 */
  protected async oneShot(agent: AgentKind, prompt: string, seat?: Omit<DebateSeat, 'agent'>): Promise<string> {
    const cwd = this.deps.project(CENTRAL_RID).repo, pick = { ...(seat?.model && seat.model !== 'default' && { model: seat.model }), ...(seat?.effort && { effort: seat.effort }) }
    if (agent === 'codex' && this.deps.review) return this.deps.review({ prompt, cwd, ...pick })
    const run = agent !== 'claude-code' ? this.deps.others?.[agent] : undefined
    if (run) return readOnlyAsk(run, prompt, cwd, { ...(seat?.model && { model: seat.model }), ...(seat?.effort && { effort: seat.effort }) })
    const side = this.deps.runner.side
    if (!side) throw new WorkbenchError(404, t(`여기서는 ${nameOf(agent)}에게 물을 수 없습니다`, `${nameOf(agent)} cannot be asked here`))
    return side({ prompt, cwd, ...pick })
  }

  /** 방장이 아직 못 본 방 사람의 답 · 방 소식 (agentCentral.ts의 send가 다음 차례 앞에 붙인다) */
  protected override roomNote(c: Stored): string {
    // 줄 번호는 잘라 낸 줄까지 센다: 대화가 길어 앞을 잘라 내면(400줄) 그냥 센 자리는 늘 끝이라 방 사람의 답이 방장에게 가지 않았다
    const cut = c.trimmed ?? 0, first = !this.fed.has(c.id)
    // 앱이 다시 켜진 뒤 처음: 방장의 마지막 글 뒤의 것만 (그 앞의 답은 방장이 이미 봤다. 처음부터 다시 붙이면 토큰만 쓴다)
    const from = Math.max(0, first ? c.items.map((it) => it.kind === 'text' && !it.sub).lastIndexOf(true) + 1 : this.fed.get(c.id)! - cut)
    this.fed.set(c.id, cut + c.items.length)
    const lines: string[] = []
    for (const it of c.items.slice(from)) {
      if (it.kind === 'member' && it.text && it.from !== 'host') lines.push(`[${nameOf(it.by)} answered in the room:]\n${clip(it.text, 3000)}`)
      if (it.kind === 'room') lines.push(`[Room: ${it.by === 'host' ? 'you' : 'the user'} ${it.act === 'rules' ? 'changed the room rules' : `${it.act === 'invite' ? 'invited' : it.act === 'remove' ? 'removed' : 'changed the permission of'} ${it.agent ? nameOf(it.agent) : ''}${it.perm ? ` (${PERM_EN[it.perm]})` : ''}`}]`)
    }
    const r = this.saved
    const roster = `[Room members: ${r.members.map((m) => `${nameOf(m.agent)} ${PERM_EN[m.perm]}${m.agent === r.host ? ', you' : ''}`).join(' · ')}. Rules: you ${r.rules.hostInvite ? 'may invite (read-only or talk, with a reason)' : 'may not invite'}, ask at most ${r.rules.callMax} at once. When the user calls several, they answer independently, without seeing each other.]`
    const head = first || lines.some((l) => l.startsWith('[Room:')) ? [roster] : []
    const line = this.hostLine, news = this.news.splice(0)
    this.hostLine = ''
    return [...head, ...lines, ...news, ...(line ? [line] : [])].join('\n')
  }

  /** 받는 이 (그냥 → 방장, @이름 → 그 사람, @모두 → 모두, 방장은 마지막) */
  override send(id: string, m: ChatMessageBody, prompt?: string): Chat {
    const c = this.must(id)
    if (c.rid !== CENTRAL_RID || prompt !== undefined) return super.send(id, m, prompt)
    const r = routeOf(m.text, this.saved)
    if (!r.others.length) return super.send(id, m)
    // 사용자의 말을 먼저 남기고, 부른 사람이 차례로 답한 뒤 방장에게 (방장의 차례가 그 말을 다시 남기면 이 자리로 옮긴다)
    const mine: ChatItem = { kind: 'user', at: now(), text: m.text, ...(m.attach?.length && { attach: m.attach.map((a) => ({ ...a, ...(a.text && { text: clip(a.text, 600) }) })) }) }
    c.items.push(mine)
    this.touch(c)
    const members = r.others.map((a) => this.member(a))
    // 독립(11/20 "독립적인 답"): 모두 이 말까지의 같은 대화만 보고 서로의 답을 가린 채 동시에, 방장만 다 나온 뒤 모두의 답을 본다.
    // 서로 비판하는 일은 토론 대화가 맡는다 (/토론, agentDebate.ts)
    const seen = { items: c.items.slice() }
    void (async () => {
      const got = await Promise.all(members.map((x) => this.ask(c, x, m.text, 'user', seen)))
      this.record(mine.at, m.text, got)
      if (!r.host || this.chats.get(id) !== c) return
      // 답하지 못한 사람(연결 안 됨 등)을 "answered above"에 넣으면 방장이 없는 답을 있는 것처럼 정리한다
      const ok = got.filter((x) => x.text).map((x) => nameOf(x.by)), failed = got.filter((x) => !x.text).map((x) => nameOf(x.by))
      const who = `${ok.length ? `${ok.join(', ')} answered above, each on its own without seeing the others.` : 'Nobody else could answer.'}${failed.length ? ` ${failed.join(', ')} could not answer (error): say so, and do not guess what they would have said.` : ''}`
      if (r.all) this.hostLine = `[The user called everyone (@모두). ${who} Answer last and sum up in at most three short lines: who said what and where they differ; your own judgment; what to do. If it is a costly judgment and they disagree, suggest a debate (/토론).]`
      super.send(id, m)
      const at = c.items.lastIndexOf(mine), last = c.items.map((x) => x.kind).lastIndexOf('user')
      if (at >= 0 && last > at) { const [u] = c.items.splice(last, 1); c.items[at] = u!; this.touch(c) }
    })().catch(() => undefined)
    return this.get(id)
  }

  private logFile(): string { return path.join(path.dirname(this.deps.dir), 'agent-room-log.json') }
  protected readLog(): VerdictEntry[] {
    try { const s = LOG.safeParse(JSON.parse(fs.readFileSync(this.logFile(), 'utf8'))); if (s.success) return s.data } catch { /* 처음 */ }
    return []
  }
  /** 기록에 한 줄을 더한다 (최근 것이 앞) */
  protected addLog(e: VerdictEntry): void {
    fs.writeFileSync(this.logFile(), `${JSON.stringify([e, ...this.readLog()].slice(0, LOG_MAX), null, 2)}\n`)
    const c = this.central()
    if (c) this.touch(c)
  }
  /** @모두 · 여럿을 부른 차례에 판정이 하나라도 있으면 기록에 남긴다 */
  private record(at: string, text: string, got: Member[]): void {
    const votes = got.flatMap((x) => (x.verdict ? [{ agent: x.by, v: x.verdict }] : []))
    if (got.length < 2 || !votes.length) return
    this.addLog({ at, q: clip(text.replace(/(^|\s)@\S+/g, ' ').replace(/\s+/g, ' ').trim(), 200), mode: 'independent', votes, flipped: false })
  }
  /** 사용자가 판정 기록 한 줄에 「뒤집힘」을 표시하거나 지운다 */
  flip(at: string, flipped: boolean): RoomState {
    const log = this.readLog(), e = log.find((x) => x.at === at)
    if (!e) throw new WorkbenchError(404, t('그 토론 기록이 없습니다', 'No such debate record'))
    e.flipped = flipped
    fs.writeFileSync(this.logFile(), `${JSON.stringify(log, null, 2)}\n`)
    return this.roomState()
  }

  /** 지금 답하는 방 사람이 있는가 (시험) */
  get busy(): boolean { return this.asking.size > 0 || [...this.chats.values()].some((x) => x.rid === CENTRAL_RID && LIVE.has(x.state)) }
}
