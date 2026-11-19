/**
 * 중앙 대화 (11/16 사용자 결정 "중앙 에이전트", 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG §1–§5).
 *
 * - 맥에 하나인 Opus 대화(rid CENTRAL_RID). 읽기만 하고, 짧은 질문은 직접 답한다. 고치거나 돌리는 일은 하위 대화를 열어 맡긴다
 *   (앱 고치기 · 프로젝트 작성 · 피드백 처리). 고치기 · 명령 · 기록 쓰기는 agentPolicy.ts의 judgeCentral이 막는다.
 * - 하위 대화는 보통 대화와 같다(같은 권한 · 작업 폴더 · 잡기). 다른 점은 parent(중앙 대화 id)뿐이고, 하위 대화는 다시 대화를 열지 못한다.
 * - 중앙은 하위 대화의 원문을 읽지 않는다: 사용자가 중앙에게 말할 때마다 하위 대화의 상태와 마지막 글 한 줄(digest)을 앞에 붙인다 (토큰 아끼기).
 * - 앱 고치기 대화를 더 열지는 남은 메모리로 정한다 (appMemory.ts, 11/19. 처음에는 동시에 2개, 시안 §9 ③). 피드백은 열기 전에 맡기(handoff.yaml)를 적어 올려
 *   클라우드 루틴 · 다른 맥과 같은 항목을 함께 처리하지 않는다 (11/8에 있었던 일).
 * - 저절로 깨우기 (11/18): 하위 대화가 차례를 끝내거나 · 계획 승인 · 허락을 기다리거나 · CI가 실패하거나 · PR이 합쳐지면 앱이 중앙을 깨운다.
 *   10초 모아 한 차례로, 중앙이 일하는 중이면 그 차례가 끝난 뒤에, 그 사이 사용자가 말하면 그 말 앞에 붙인다.
 *   중앙은 일상 일(CI 고치기 · 닫기 · 크리티컬하지 않은 허락)은 스스로 하고, CRITICAL만 사용자에게 「지금 확인할 것」으로 남긴다.
 *   앱이 다시 켜지면 아직 보내지 않은 깨우기는 사라진다 (CI · 합쳐짐은 1분마다 tickCentral이 다시 찾는다).
 */
import { agentTurnReasons, agentTurns, userTurn } from '@rw/core'
import { APP_RID, CENTRAL_RID, type AppMerged, type CentralAnswerBody, type CentralFeedback, type CentralKid, type CentralOpenBody, type CentralOpened, type CentralState, type Chat, type ChatItem, type ChatMessageBody, type ChatMode } from '@rw/core/contract/agentChats'
import { APP_CHECKS, APP_SUBMIT, LIVE, lastTouched, promptOf, type Stored } from './agentChats.js'
import { listAllFeedback } from './feedback.js'
import { bundlesOf, keysOf } from './feedbackGroups.js'
import { FeedbackChats } from './agentFeedbackTick.js'
import { appRoom, APP_LIVE_CAP, APP_LIVE_MIN, FRESH_MS, memLine, readMemory, roomRule, type Mem, type Room } from './appMemory.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'
import { AUTO_SEND_MAX, CENTRAL_BRIEF, CRITICAL, type Critical } from './centralBrief.js'
export { AUTO_SEND_MAX, CENTRAL_BRIEF, CRITICAL, type Critical } from './centralBrief.js'
import { cut, digestOf, kidReport, kidSig, lastReport, oneLine, stateWord, tail } from './agentCentralDigest.js'
import { crashesOf, crashLines, lastCrash } from './agentCrash.js'

/** 중앙을 저절로 깨울 때 넘기는 마지막 글 · CI 기록 길이 (11/18) */
const REPORT_FULL = 4000
const LOG_TAIL = 3000


type Ask = Extract<ChatItem, { kind: 'ask' }>

/** 아직 답하지 않은 허락 · 계획 카드 (마지막 것) */
function openAsk(c: Stored): Ask | undefined {
  let a: Ask | undefined
  for (const it of c.items) if (it.kind === 'ask' && !it.answer) a = it
  return a
}

/** 그 허락이 크리티컬하면 그 까닭 (CRITICAL 가운데 하나). 연구 프로젝트에서 고치기는 노트 변경이라 크리티컬 */
export function criticalOf(a: Ask, kid: Pick<Stored, 'rid'>): Critical | undefined {
  const of = (key: Critical['key']) => CRITICAL.find((x) => x.key === key)
  if (a.does === 'delete') return of('delete')
  if (a.does === 'outside') return of('outside')
  if (kid.rid !== APP_RID && a.does === 'edit') return of('notes')
  const s = `${a.tool} ${a.summary}`
  return CRITICAL.find((x) => x.re.test(s))
}

/** 하위 대화 한 줄 */
export function kidOf(c: Stored): CentralKid {
  const a = openAsk(c)
  const wait = a && (a.plan !== undefined ? 'plan' : 'ask')
  const crit = a && criticalOf(a, c)
  const own = kidReport(c.items)
  const report = own ?? lastReport(c.items)
  const crashes = c.state === 'error' && lastCrash(c.items) ? crashesOf(c.items).length : 0
  return {
    id: c.id, rid: c.rid, title: c.title, state: c.state, ...(c.state === 'waiting' && wait && { wait }),
    ...(c.state === 'waiting' && a && { ask: { id: a.id, ...(crit && { critical: crit.ko }) } }),
    ...(c.pr && { pr: { ...c.pr } }), ...(c.merged && { merged: c.merged }), ...(c.feedback && { feedback: c.feedback }), ...(c.bundle && { bundle: [...c.bundle] }),
    archived: !!c.archived, ...(c.summary && { summary: c.summary }), ...(report && { report }), ...(own && { reported: true }), updated: c.updated,
    ...(c.pr && c.ci && !c.merged && { ci: c.ci }), ...(c.todos.length && { todos: { done: c.todos.filter((x) => x.state === 'completed').length, total: c.todos.length } }), ...(crashes && { crashes }),
  }
}


/** 깨울 까닭 하나 */
type Wake = { kind: 'end' | 'ask' | 'ci' | 'merged' | 'help' | 'crash'; log?: string; text?: string }
/** digested: 중앙 대화 id별로 마지막으로 넘긴 하위 대화마다의 kidSig */ type WakeState = { prev: Map<string, Stored['state']>; events: Map<string, Wake[]>; seen: Set<string>; timer?: ReturnType<typeof setTimeout>; auto: boolean; sends: Map<string, number>; digested: Map<string, Map<string, string>> }

export class CentralChats extends FeedbackChats {
  /** 하위 대화가 바뀐 뒤 중앙을 깨우기까지 모으는 시간 (시험은 줄인다) */
  wakeMs = 10_000
  /** 남은 메모리 읽기 (시험은 값을 넣는다) */
  memory: () => Promise<Mem> = readMemory
  private opening?: Promise<void>
  // 부모 생성자가 touch를 부를 수 있어 필드 초기값 대신 처음 쓸 때 만든다
  private wakeState?: WakeState

  private w(): WakeState {
    return (this.wakeState ??= { prev: new Map(), events: new Map(), seen: new Set(), auto: false, sends: new Map(), digested: new Map() })
  }

  /** 중앙 대화 (보관하지 않은 것 가운데 가장 최근) */
  private central(): Stored | undefined {
    return [...this.chats.values()].filter((c) => c.rid === CENTRAL_RID && !c.archived).sort((a, b) => b.updated.localeCompare(a.updated))[0]
  }

  centralState(): CentralState {
    const c = this.central()
    if (!c) return { kids: [], app: this.app }
    const kids = this.kidsOf(c.id), held = (c.held ?? []).map((b) => ({ title: b.title, ...(b.at && { at: b.at }) }))
    // 사용자가 답할 피드백. 하위 대화가 맡은 것은 그 줄이 대신한다
    const owned = new Set(kids.filter((k) => !k.archived).flatMap((k) => [...(k.feedback ? [k.feedback] : []), ...(k.bundle ?? [])]))
    const feedback = this.userFeedback().filter((f) => !owned.has(f.key))
    const crashed = this.crashedOthers(c.id)
    return { id: c.id, kids, app: this.app, ...(held.length && { held }), ...(feedback.length && { feedback }), ...(crashed.length && { crashed }) }
  }

  /** 중앙의 하위 대화가 아닌 대화 가운데 비정상 종료로 멈춘 것 (작업 현황의 「내 차례」, 11/20) */
  private crashedOthers(central: string): NonNullable<CentralState['crashed']> {
    return [...this.chats.values()].filter((k) => k.id !== central && k.parent !== central && !k.archived && k.state === 'error').flatMap((k) => {
      const x = lastCrash(k.items)
      return x ? [{ id: k.id, rid: k.rid, title: k.title, at: x.at, text: oneLine(x.text, 160), count: crashesOf(k.items).length }] : []
    })
  }

  private fbCache?: { at: number; items: NonNullable<CentralState['feedback']> }
  /** 사용자가 답할 피드백 (확인 필요 가운데 물음이 남은 것). 대화가 바뀔 때마다 불리므로 10초 모아 읽는다 */
  private userFeedback(): NonNullable<CentralState['feedback']> {
    const fb = this.deps.feedback
    if (!fb || (this.fbCache && Date.now() - this.fbCache.at < 10_000)) return this.fbCache?.items ?? []
    let items: NonNullable<CentralState['feedback']> = []
    try {
      items = listAllFeedback(fb.dir).filter((e) => userTurn(e) === 'answer')
        .map((e) => ({ key: e.key, target: e.target, text: oneLine(e.text, 120), at: new Date(lastTouched(e)).toISOString() }))
        .sort((a, b) => a.at.localeCompare(b.at))
    } catch { /* 피드백 폴더를 못 읽으면 줄 없이 */ }
    this.fbCache = { at: Date.now(), items }
    return items
  }

  private kidsOf(parent: string): CentralKid[] {
    return [...this.chats.values()].filter((k) => k.parent === parent).sort((a, b) => b.updated.localeCompare(a.updated)).map(kidOf)
  }

  /** 중앙에게 보낼 하위 대화 요약. 지난번에 넘긴 것과 같은 대화는 한 줄로. 세션이 새로 열리면(앱을 다시 켬 등) 모두 자세히 */
  private digest(c: Stored): string {
    const kids = this.kidsOf(c.id), all = this.w().digested, seen = c.sessionId ? all.get(c.id) : undefined
    all.set(c.id, new Map(kids.filter((k) => !k.archived).map((k) => [k.id, kidSig(k)])))
    return `${digestOf(kids, c.held?.length, seen)}${this.feedbackLine()}`
  }

  /** 사용자가 중앙에게 말한다: 중앙이 없으면 연다 (Opus, 읽기만). 붙인 것 · 지금 화면 한 줄도 함께 */
  talk(body: string | ChatMessageBody): Chat {
    const m = typeof body === 'string' ? { text: body } : body
    const c = this.central()
    if (c) return this.send(c.id, m)
    const digest = `${digestOf([])}${this.feedbackLine()}`
    return this.create({ rid: CENTRAL_RID, ...m, title: t('중앙', 'Central'), scope: { kind: 'all' }, write: 'read', mode: 'edit', model: 'opus', effort: 'medium' }, {}, `${CENTRAL_BRIEF}\n\n${digest}\n\n${promptOf(m.text, m.attach)}`)
  }

  /**
   * 중앙 대화에 보내는 말에는 하위 대화 요약을 앞에 붙인다 (화면의 입력란에서 보내도).
   * 사용자의 말이면 아직 보내지 않은 깨우기를 그 앞에 붙여 함께 보내고, 저절로 보낸 횟수를 처음부터 센다
   */
  override send(id: string, m: ChatMessageBody, prompt?: string): Chat {
    const c = this.must(id)
    if (c.rid === CENTRAL_RID && prompt === undefined) {
      const w = this.w()
      const woke = this.wakeText()
      if (!w.events.size && w.timer) { clearTimeout(w.timer); w.timer = undefined }
      w.auto = false
      w.sends.clear()
      // 앱이 다시 켜져 세션이 없으면 안내도 다시
      const brief = c.sessionId ? '' : `${CENTRAL_BRIEF}\n\n`
      return super.send(id, m, `${brief}${this.digest(c)}\n\n${woke ? `${woke.en}\n\n[The user writes:]\n` : ''}${promptOf(m.text, m.attach)}`)
    }
    return super.send(id, m, prompt)
  }

  /** 상태가 바뀔 때마다: 중앙의 하위 대화가 끝나거나 기다리면 깨우기를 적고, 앱 고치기 자리가 나면 기다리던 일을 연다 */
  protected override touch(c: Stored): void {
    super.touch(c)
    const w = this.w()
    const was = w.prev.get(c.id)
    w.prev.set(c.id, c.state)
    if (was === undefined || was === c.state) return
    const central = this.central()
    if (!central) return
    const ended = LIVE.has(was) && !LIVE.has(c.state)
    if (c.id === central.id) {
      if (ended && w.events.size) this.wakeLater()
      return
    }
    if (c.rid === APP_RID && ended && central.held?.length) queueMicrotask(() => void this.openHeld())
    // 비정상 종료 (11/20): 하위 대화가 아니어도 알린다. 사용자가 멈춘 것은 stopped라 오지 않는다
    const crash = ended && c.state === 'error' && !c.archived ? lastCrash(c.items) : undefined
    if (crash) this.note(c.id, { kind: 'crash' }, `crash:${c.id}:${crash.at}`)
    if (c.parent !== central.id || c.archived) return
    const a = c.state === 'waiting' ? openAsk(c) : undefined
    if (a) this.note(c.id, { kind: 'ask' }, `ask:${a.id}`)
    else if (ended) this.note(c.id, { kind: 'end' }, `end:${c.id}:${c.items.length}`)
  }

  /** 깨울 까닭 하나를 적는다 (같은 것은 한 번만. 중재 요청은 쌓는다) */
  private note(id: string, e: Wake, sig: string): void {
    const w = this.w()
    if (w.seen.has(sig)) return
    w.seen.add(sig)
    w.events.set(id, [...(w.events.get(id) ?? []).filter((x) => x.kind === 'help' || x.kind !== e.kind), e])
    this.wakeLater()
  }

  /**
   * 대화가 중앙에게 중재를 청한다 (central_help, 11/19): 고칠 수 없는 다른 프로젝트 · 개념노트의 일이나 앱 버그.
   * 그 대화가 일하는 중이어도 바로 알린다. 중앙 대화가 없으면 409 (에이전트는 사용자에게 말한다)
   */
  help(id: string, text: string): string {
    const k = this.must(id)
    const c = this.central()
    if (!c) throw new WorkbenchError(409, t('중앙 대화가 아직 없습니다. 사용자에게 직접 말하세요', 'There is no central conversation yet. Tell the user instead'))
    if (k.id === c.id) throw new WorkbenchError(400, t('중앙 대화 자신은 중재를 청하지 않습니다', 'The central conversation does not ask itself'))
    const w = this.w()
    this.note(id, { kind: 'help', text }, `help:${id}:${w.seen.size}:${text}`)
    return c.id
  }

  private wakeLater(): void {
    const w = this.w()
    if (w.timer) clearTimeout(w.timer)
    w.timer = setTimeout(() => { w.timer = undefined; this.flushWakes() }, this.wakeMs)
    w.timer.unref?.()
  }

  /** 모아 둔 깨우기를 중앙에게 보낸다. 중앙이 일하는 중이면 그 차례가 끝난 뒤에 (touch가 다시 부른다). 보냈으면 true */
  flushWakes(): boolean {
    const c = this.central()
    if (!c || LIVE.has(c.state)) return false
    const woke = this.wakeText()
    if (!woke) return false
    const brief = c.sessionId ? '' : `${CENTRAL_BRIEF}\n\n`
    super.send(c.id, { text: woke.ko }, `${brief}${this.digest(c)}\n\n${woke.en}`)
    for (let i = c.items.length - 1; i >= 0; i--) {
      const it = c.items[i]!
      if (it.kind === 'user' && it.text === woke.ko) { it.auto = true; break }
    }
    this.touch(c)
    this.w().auto = true
    return true
  }

  /** 모아 둔 깨우기의 화면 글(한국어 한 줄)과 중앙에게 줄 글. 다시 일하는 하위 대화는 끝날 때 다시 알리려고 남긴다 */
  private wakeText(): { ko: string; en: string } | undefined {
    const w = this.w()
    const ko: string[] = []
    const en: string[] = []
    for (const [id, evs] of w.events) {
      const k = this.chats.get(id)
      // 다시 일하는 대화는 끝날 때 다시 알린다. 중재 요청은 일하는 중에 보낸 것이라 바로
      const busy = !!k && (k.state === 'running' || k.state === 'queued')
      if (busy && !evs.some((e) => e.kind === 'help')) continue
      const later = busy ? evs.filter((e) => e.kind !== 'help') : []
      if (later.length) w.events.set(id, later)
      else w.events.delete(id)
      if (!k || k.archived) continue
      const head = `- ${k.id} · ${k.rid === APP_RID ? 'app' : k.rid} · "${k.title}"${k.pr ? ` · PR #${k.pr.number}` : ''}`
      // 보고 절이 있으면 그것을 줄바꿈 그대로, 없으면 마지막 글 (보고를 빠뜨린 대화)
      const own = kidReport(k.items)
      const report = own ? undefined : lastReport(k.items, REPORT_FULL)
      const lines: string[] = []
      const crashed = evs.some((e) => e.kind === 'crash')
      for (const e of evs) {
        if (busy && e.kind !== 'help') continue
        if (e.kind === 'crash') {
          const x = lastCrash(k.items)
          if (!x) continue
          const n = crashesOf(k.items).length
          ko.push(`「${k.title}」 비정상 종료${n > 1 ? ` (${n}번째)` : ''}`)
          lines.push(...crashLines(k.id, k.items, x))
          if (k.parent !== this.central()?.id) lines.push('not your sub-conversation, so chat_send cannot reach it: tell the user, or open an app sub-conversation for an app bug.')
          continue
        }
        if (e.kind === 'help') {
          ko.push(`「${k.title}」 중재 요청`)
          lines.push(`asks you to mediate (outside the projects it may change, or an app bug)${k.parent === this.central()?.id ? '' : ' — not your sub-conversation, so chat_send cannot reach it'}: ${cut(e.text ?? '', REPORT_FULL)}`)
          lines.push('Open a sub-conversation for it (role app for an app bug, role project for another project; check chat_list first), or tell the user when the user must decide.')
        } else if (e.kind === 'end') {
          if (k.state === 'waiting' || crashed) continue
          ko.push(`「${k.title}」 ${k.state === 'error' ? '실패' : k.state === 'stopped' ? '멈춤' : '차례 끝남'}`)
          lines.push(`ended its turn (${stateWord[k.state] ?? k.state})`)
        } else if (e.kind === 'ask') {
          const a = openAsk(k)
          if (!a) continue
          const crit = criticalOf(a, k)
          const plan = a.plan !== undefined
          ko.push(`「${k.title}」 ${plan ? '계획 승인' : '허락'} 기다림${crit ? ` (크리티컬: ${crit.ko})` : ''}`)
          lines.push(`waits for ${plan ? 'plan approval' : 'permission'}: ask ${a.id} · ${a.tool} · ${a.summary}`)
          if (plan) lines.push(`plan:\n${cut(a.plan ?? '', REPORT_FULL)}`)
          lines.push(crit ? `critical (${crit.en}): leave it to the user, do not answer it` : 'not critical: answer it yourself with chat_answer, from what the user asked')
        } else if (e.kind === 'ci') {
          ko.push(`「${k.title}」 CI 실패`)
          lines.push(`pull request check failed. Log tail:\n${tail(e.log ?? '', LOG_TAIL)}`)
        } else {
          ko.push(`「${k.title}」 ${k.pr ? `PR #${k.pr.number} ` : ''}합쳐짐`)
          lines.push('its pull request was merged: close it with chat_close and a three-line summary')
        }
      }
      if (!lines.length) continue
      en.push(head, ...lines.map((l) => `  ${l}`), ...(own ? ['  report:', ...own.split('\n').map((l) => `    ${l}`)] : report ? [`  last text (no report section): ${report}`] : []))
    }
    if (!ko.length) return undefined
    return {
      ko: `${t('자동 알림', 'Automatic')} · ${ko.join(' · ')}`,
      en: ['[Automatic wake-up from the app, not written by the user. Sub-conversations changed:]', ...en,
        '[Do the routine work yourself as the brief says (check failed: chat_send a fix; merged: chat_close; non-critical wait: chat_answer). The user sees the stages on the task checklist, so reply as short as possible: "지금 확인할 것: …" lines only if the user must act, one line per merged one on what changed, else one short line on what you did]'].join('\n'),
    }
  }

  /** 1분마다: 하위 대화 PR의 합침 · CI를 본다(바뀌면 작업 현황 줄이 바로 바뀌고, 실패 · 합침은 깨운다). 메모리가 풀렸으면 기다리던 앱 고치기를 연다 */
  async tickCentral(): Promise<void> {
    const app = this.deps.app
    const c = this.central()
    if (!app || !c) return
    await this.openHeld()
    for (const k of [...this.chats.values()].filter((x) => x.parent === c.id && !x.archived)) {
      try {
        const live = LIVE.has(k.state)
        if (!live && !k.merged && k.pr && k.worktree && k.branch && app.prMerged) {
          const m = await app.prMerged(k.worktree, k.branch)
          if (m) { k.merged = m.sha || 'merged'; this.touch(k) }
        }
        if (k.merged) { if (!live) this.note(k.id, { kind: 'merged' }, `merged:${k.id}`); continue }
        if (!k.pr || !k.worktree || !k.branch) continue
        const ck = await app.checks(k.worktree, k.branch)
        const ci = !ck.done ? 'pending' : ck.ok ? 'passed' : 'failed'
        if (ci !== k.ci) { k.ci = ci; this.touch(k) }
        // 피드백 대화의 CI는 tickFeedback이 그 대화에 바로 다시 보낸다. 일하는 중이면 끝난 뒤에 본다
        if (k.feedback || live || ci !== 'failed') continue
        const sig = ck.checks.map((x) => `${x.name}:${x.state}:${x.link ?? ''}`).join('|')
        if (sig === k.ciSeen) continue
        k.ciSeen = sig
        this.touch(k)
        this.note(k.id, { kind: 'ci', ...(ck.log && { log: ck.log }) }, `ci:${k.id}:${sig}`)
      } catch { /* gh · git 오류는 다음 차례에 다시 본다 */ }
    }
  }

  /** 중앙 대화와 그것이 급히 연 앱 고치기는 줄을 서지 않고 동시에 도는 수에도 들지 않는다 (11/19 "중앙대화는 메모리 부족과 관계없이 작업을 할 수 있어야") */
  protected override unlimited(c: Stored): boolean {
    return c.rid === CENTRAL_RID || !!c.urgent
  }

  /** 메모리로 세는 앱 고치기 (급한 것은 따로 하나) */
  private appLive(): Stored[] {
    return [...this.chats.values()].filter((k) => k.rid === APP_RID && LIVE.has(k.state) && !k.urgent)
  }

  /** 앱 고치기를 하나 더 열 수 있는지 (남은 메모리, appMemory.ts). 메모리를 못 읽으면 최소 개수만 */
  private async room(): Promise<{ ok: boolean; why?: 'cap' | 'memory'; live: Stored[]; mem?: Mem }> {
    const live = this.appLive()
    const fresh = live.filter((k) => Date.now() - new Date(k.created).getTime() < FRESH_MS).length
    const mem = await this.memory().catch(() => undefined)
    const r: Room = mem ? appRoom(live.length, fresh, mem) : live.length < APP_LIVE_MIN ? { ok: true } : { ok: false, why: 'memory' }
    return { ...r, live, ...(mem && { mem }) }
  }

  /** 기다리게 둔 까닭 한 줄 (몇 개가 일하는지 · 남은 메모리) */
  private roomWhy(r: { why?: 'cap' | 'memory'; live: Stored[]; mem?: Mem }): string {
    const now = r.mem ? memLine(r.live.length, r.mem) : t(`앱 고치기 ${r.live.length}개 일함 · 메모리를 읽지 못함`, `${r.live.length} app conversations working · memory unknown`)
    return r.why === 'cap' ? `${now} · ${t(`상한 ${APP_LIVE_CAP}개`, `cap ${APP_LIVE_CAP}`)}` : now
  }

  /** 메모리가 풀리거나 앱 고치기가 끝나면 기다리던 일을 차례로 열고, 연 것을 중앙 대화에 적는다 (겹쳐 부르면 앞의 것을 기다린다) */
  private openHeld(): Promise<void> {
    return (this.opening ??= this.openHeldNow().finally(() => { this.opening = undefined }))
  }

  private async openHeldNow(): Promise<void> {
    const c = this.central()
    while (c?.held?.length) {
      const r = await this.room()
      if (!r.ok) break
      const b = c.held.shift()!
      try {
        const kid = this.create({ rid: APP_RID, text: b.task, title: b.title, mode: 'edit' }, { parent: c.id })
        c.items.push({ kind: 'text', at: new Date().toISOString(), text: t(`자동: 기다리던 「${b.title}」을 열었습니다 (${kid.id}, ${this.roomWhy(r)})`, `Automatic: opened the held "${b.title}" (${kid.id}, ${this.roomWhy(r)})`) })
      } catch { /* 열지 못하면 버리지 않고 다음 차례에 */ c.held.unshift(b); break }
      this.touch(c)
    }
  }

  /** 중앙이 하위 대화를 연다 (chat_open). 남은 메모리가 모자라면 기다리게 두고(held) 그 순서를 돌려준다 */
  async openOrHold(b: CentralOpenBody): Promise<CentralOpened> {
    const c = this.central()
    if (c && b.role === 'app' && !b.urgent) {
      const r = await this.room()
      if (!r.ok) {
        c.held = [...(c.held ?? []), { ...b, at: new Date().toISOString() }]
        const why = this.roomWhy(r)
        c.items.push({ kind: 'text', at: new Date().toISOString(), text: t(`자동: 「${b.title}」을 기다리게 두었습니다 (${c.held.length}번째, ${why}). ${roomRule()}`, `Automatic: "${b.title}" is held (#${c.held.length}, ${why}). It ${roomRule()}`) })
        this.touch(c)
        return { held: c.held.length }
      }
    }
    return { kid: await this.openKid(b) }
  }

  /** 하위 대화를 바로 연다. 앱 고치기에 남은 메모리가 모자라면 409 (기다리게 두기는 openOrHold) */
  async openKid(b: CentralOpenBody): Promise<CentralKid> {
    const c = this.central()
    if (!c) throw new WorkbenchError(409, t('중앙 대화가 없습니다', 'There is no central conversation'))
    if (b.role === 'app' && b.urgent) {
      // 앱 버그 · 앱이 멈춘 때만: 메모리 · 줄과 상관없이 바로 연다. 한 번에 하나
      const busy = [...this.chats.values()].find((k) => k.urgent && LIVE.has(k.state))
      if (busy) throw new WorkbenchError(409, t(`급한 앱 고치기는 한 번에 하나입니다 (「${busy.title}」 ${busy.id}). 그 대화에 이어 보내세요`, `Only one urgent app conversation at a time ("${busy.title}" ${busy.id}). Send to it with chat_send`))
      return kidOf(this.must(this.create({ rid: APP_RID, text: b.task, title: b.title, mode: 'edit' }, { parent: c.id, urgent: true }).id))
    }
    if (b.role === 'app') {
      const r = await this.room()
      if (!r.ok) {
        const names = r.live.map((k) => `「${k.title}」 ${k.id}`).join(', ')
        throw new WorkbenchError(409, t(
          `지금은 앱 고치기를 더 열지 않습니다 (${this.roomWhy(r)}: ${names}). 끝나기를 기다리거나 그 대화에 이어 보내세요`,
          `No room for another app conversation (${this.roomWhy(r)}: ${names}). Wait for one to finish or send to it with chat_send`,
        ))
      }
      return kidOf(this.must(this.create({ rid: APP_RID, text: b.task, title: b.title, mode: 'edit' }, { parent: c.id }).id))
    }
    if (b.role === 'project') {
      if (!b.project) throw new WorkbenchError(400, t('프로젝트 작성에는 project(프로젝트 id)가 필요합니다', 'role project needs project (a project id from list_projects)'))
      if (b.project === APP_RID || b.project === CENTRAL_RID) throw new WorkbenchError(400, t('연구 프로젝트 id가 아닙니다', 'Not a research project id'))
      return kidOf(this.must(this.create({ rid: b.project, text: b.task, title: b.title, scope: { kind: 'project' }, write: 'notes', mode: 'edit' }, { parent: c.id }).id))
    }
    // 피드백: 다른 컴퓨터 · 클라우드 루틴이 이번 차례에 맡았으면 열지 않고, 맡기를 적어 올린 뒤에 연다. 여러 키면 한 대화에 묶는다 (11/19 "둘 다 묶기")
    const keys = b.feedbacks?.length ? b.feedbacks : b.feedback ? [b.feedback] : []
    if (!keys.length) throw new WorkbenchError(400, t('피드백 처리에는 feedback(피드백 키) 또는 feedbacks가 필요합니다', 'role feedback needs feedback (the feedback key) or feedbacks'))
    const fb = this.deps.feedback, claims = fb?.claims
    for (const e of fb && claims ? listAllFeedback(fb.dir).filter((x) => keys.includes(x.key)) : []) {
      const since = lastTouched(e)
      if (claims?.taken(e.key, since) || !(await claims?.claim(e.key, since).catch(() => false))) throw new WorkbenchError(409, t(`다른 컴퓨터나 클라우드 루틴이 이 피드백(${e.key})을 맡았습니다`, `Another computer or the cloud routine has claimed this feedback (${e.key})`))
    }
    const kid = this.handOff(keys, c.id)
    if (b.task.trim()) this.send(kid.id, { text: b.task }) // 사용자의 말이 더 있으면 이어 보낸다 (피드백 안내는 handOff가 만든다)
    return kidOf(this.must(kid.id))
  }

  /** 상태 줄에 붙이는 피드백 수 (11/16 사용자 "피드백 처리는 항상 하위 대화가, 중앙은 쌓이면 사용자 요청에 따라 연다"). 맡을 것이 없으면 빈 글 */
  private feedbackLine(): string {
    let n = 0
    try { n = this.feedbackTurns().items.filter((i) => !i.taken && !i.chat).length } catch { /* 피드백 폴더를 못 읽으면 줄 없이 */ }
    return n ? `\n[Feedback waiting for the agent: ${n}. Open feedback sub-conversations only if the user asks]` : ''
  }

  /** 에이전트 차례인 피드백 (feedback_turns): 중앙이 「새 피드백 처리해 줘」에 어느 항목을 맡길지 고른다 */
  feedbackTurns(): CentralFeedback {
    const fb = this.deps.feedback
    if (!fb) return { items: [] }
    const rows = listAllFeedback(fb.dir).filter((e) => agentTurns(e).length).map((e) => {
      const since = lastTouched(e)
      const chat = [...this.chats.values()].find((c) => keysOf(c).includes(e.key) && new Date(c.created).getTime() >= since)
      return { e, row: { key: e.key, ...(e.kind && { kind: e.kind }), target: e.target, text: e.text.replace(/\s+/g, ' ').trim().slice(0, 300), reasons: agentTurnReasons(e), taken: !!fb.claims?.taken(e.key, since), ...(chat && { chat: chat.id }) } }
    })
    // 맡을 수 있는 것을 묶는다 (feedbackGroups.ts): 같은 group끼리 한 대화에
    const group = new Map(bundlesOf(rows.filter((r) => !r.row.taken && !r.row.chat).map((r) => r.e)).flatMap((b, i) => b.items.map((e) => [e.key, i + 1] as const)))
    return { items: rows.map((r) => ({ ...r.row, ...(group.has(r.e.key) && { group: group.get(r.e.key) }) })) }
  }

  /** 중앙이 하위 대화에 이어 보낸다 (chat_send). 저절로 깨어난 차례에는 사용자가 다시 말할 때까지 AUTO_SEND_MAX번까지 */
  sendKid(id: string, text: string): CentralKid {
    this.kidOfCentral(id)
    const w = this.w()
    if (w.auto) {
      const n = (w.sends.get(id) ?? 0) + 1
      if (n > AUTO_SEND_MAX) throw new WorkbenchError(409, t(`사용자 없이 이 하위 대화에 이미 ${AUTO_SEND_MAX}번 보냈습니다. 더 보내지 말고 「지금 확인할 것」으로 사용자에게 물어보세요`, `Already sent ${AUTO_SEND_MAX} automatic messages to this sub-conversation. Do not send more; ask the user with "지금 확인할 것"`))
      w.sends.set(id, n)
    }
    this.send(id, { text })
    return kidOf(this.must(id))
  }

  /**
   * 중앙이 하위 대화의 허락 · 계획 카드에 답한다 (chat_answer, 11/18 사용자 "허락이 크리티컬한 것이 아니면 자동이면 좋을 것 같아").
   * 크리티컬한 것(CRITICAL)은 409로 사용자에게 남긴다. 답한 카드에는 by = central이 붙어 화면에 「중앙이 자동으로」가 보인다
   */
  answerKid(b: CentralAnswerBody): CentralKid {
    const k = this.kidOfCentral(b.id)
    const a = k.items.find((x): x is Ask => x.kind === 'ask' && x.id === b.ask)
    if (!a || a.answer) throw new WorkbenchError(409, t('이미 답했거나 없는 허락 요청입니다', 'This request was already answered or does not exist'))
    const crit = criticalOf(a, k)
    if (crit) throw new WorkbenchError(409, t(`크리티컬한 허락(${crit.ko})이라 사용자에게 남깁니다. 「지금 확인할 것」으로 알리세요`, `Critical (${crit.en}): leave it to the user and tell them with "지금 확인할 것"`))
    const mode: ChatMode = 'edit'
    this.answer(k.id, a.id, b.answer, { ...(b.answer === 'deny' && b.note && { note: b.note }), ...(b.answer === 'allow' && a.plan !== undefined && { mode }) })
    a.by = 'central'
    this.touch(k)
    // 중앙 대화에도 무엇에 어떻게 답했는지 기록으로 남긴다
    const c = this.must(k.parent!)
    const what = a.plan !== undefined ? t('계획', 'plan') : a.summary.slice(0, 120)
    const yes = b.answer === 'allow'
    c.items.push({ kind: 'text', at: new Date().toISOString(), text: t(`자동: 「${k.title}」의 ${what} → ${yes ? '허락' : '거절'}`, `Automatic: ${yes ? 'allowed' : 'declined'} ${what} in "${k.title}"`) })
    this.touch(c)
    return kidOf(this.must(k.id))
  }

  /** 중앙이 하위 대화를 닫는다 (chat_close): 결과 요약을 남기고 보관한다. 일하는 중이면 닫지 않는다 */
  closeKid(id: string, summary: string): CentralKid {
    const k = this.kidOfCentral(id)
    if (LIVE.has(k.state)) throw new WorkbenchError(409, t('아직 일하는 중이라 닫지 않습니다. 끝나기를 기다리세요', 'Still working; wait until it finishes before closing'))
    k.summary = summary.trim().slice(0, 2000)
    this.touch(k)
    this.archive(id, true)
    this.w().events.delete(id)
    return kidOf(this.must(id))
  }

  /**
   * 앱 고치기 대화: 자기 PR을 squash로 합친다 (에이전트의 app_merge, 11/19 "중앙은 깃 편집 권한").
   * 마지막 커밋의 CI가 모두 통과했고 main과 부딪히지 않을 때만. 피드백 대화의 PR은 합치기 설정(tickFeedback)을 따른다.
   * 하위 대화든 사용자가 연 대화든 같다. 허락 판정은 judge가 이미 했다
   */
  async appMerge(id: string): Promise<AppMerged> {
    const c = this.must(id)
    const w = this.deps.app
    if (c.scope.kind !== 'app' || !w) throw new WorkbenchError(400, t('앱 고치기 대화가 아닙니다', 'Not an app conversation'))
    if (!c.worktree || !c.branch) throw new WorkbenchError(409, t('작업 폴더를 아직 만들지 않았습니다', 'The work folder is not ready yet'))
    if (c.feedback) throw new WorkbenchError(409, t('피드백 대화의 PR은 합치기 설정대로 앱이 합칩니다', 'Feedback pull requests are merged by the app per the merge setting'))
    if (c.merged) throw new WorkbenchError(409, t('이 대화의 PR은 이미 합쳤습니다', 'This conversation\'s pull request is already merged'))
    if (!c.pr) throw new WorkbenchError(409, t(`PR이 아직 없습니다. 먼저 ${APP_SUBMIT}로 올려 주세요`, `No pull request yet. Call ${APP_SUBMIT} first`))
    const ck = await w.checks(c.worktree, c.branch)
    if (!ck.done) throw new WorkbenchError(409, t(`CI가 아직 끝나지 않았습니다. ${APP_CHECKS}(wait)로 기다린 뒤 다시 부르세요`, `CI has not finished. Wait with ${APP_CHECKS} (wait) and call again`))
    if (!ck.ok) throw new WorkbenchError(409, t(`CI가 실패해 합치지 않습니다. ${APP_CHECKS}로 기록을 읽고 고쳐 다시 올려 주세요`, `CI failed, so it was not merged. Read the log with ${APP_CHECKS}, fix and submit again`))
    if (w.conflicted && (await w.conflicted(c.worktree, c.branch))) {
      throw new WorkbenchError(409, t('PR이 main과 부딪혀 합치지 못했습니다. `git fetch origin main && git merge origin/main`으로 받아 풀고, 확인한 뒤 다시 올려 주세요.', 'The PR conflicts with main, so it was not merged. Run `git fetch origin main && git merge origin/main`, resolve, check and submit again.'))
    }
    const m = await w.merge(c.worktree, c.branch)
    c.merged = m.sha || 'merged'
    c.items.push({ kind: 'text', at: new Date().toISOString(), text: t(`PR #${m.number}을 합쳤습니다. 앱이 새 버전을 받아 쓰지 않는 틈에 다시 시작합니다.`, `Merged PR #${m.number}. The app picks up the new version and restarts when idle.`) })
    this.touch(c)
    return m
  }

  private kidOfCentral(id: string): Stored {
    const k = this.must(id)
    const c = this.central()
    if (!c || k.parent !== c.id) throw new WorkbenchError(400, t('중앙이 연 하위 대화가 아닙니다', 'Not a sub-conversation of the central conversation'))
    return k
  }

  override stopAll(): void {
    super.stopAll()
    const w = this.w()
    if (w.timer) clearTimeout(w.timer)
    w.timer = undefined
  }
}
