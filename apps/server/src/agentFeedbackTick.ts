/**
 * 피드백 · 앱 고치기 대화 돌보기 (1분마다, routes/agentChats.ts): CI · 합치기 · 반영됨 · 끝난 대화 보관 · 저절로 맡기기.
 * 끝난 대화의 작업 폴더 치우기(tidyWorktrees, 10분마다)도 여기에.
 * 피드백 맡기기(handOff)와 처리 기록(feedbackAnswer)도 여기에. agentChats.ts가 길어 나눴다. CentralChats(agentCentral.ts)가 이 클래스를 잇는다
 */
import fs from 'node:fs'
import path from 'node:path'
import { agentTurnReasons, agentTurns, localDate, localTime } from '@rw/core'
import { APP_RID, type Chat, type FeedbackAnswerBody, type FeedbackAnswered } from '@rw/core/contract/agentChats'
import { LIVE, handedAt, lastTouched, type Stored } from './agentChats.js'
import { SharedChats } from './agentShare.js'
import { feedbackAgainPrompt } from './agentPrompts.js'
import { answerMockups, listAllFeedback, setFeedbackReview, writeFeedbackAnswer, type FeedbackListItem } from './feedback.js'
import { dropMockups } from './feedbackMockups.js'
import { bundlesOf, handOffPlan, keysOf } from './feedbackGroups.js'
import { feedbackVerdictError } from './feedbackVerdict.js'
import { HERE, t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

const now = () => new Date().toISOString()

const mark = (e: FeedbackListItem): string => `${lastTouched(e)}|${e.comments?.length ?? 0}|${e.review?.at ?? ''}`

export class FeedbackChats extends SharedChats {
  /** 중앙이 깊은 검토 동안 보류한 PR이면 그 까닭 (agentCentralReview.ts): 저절로 합치지 않는다 */
  protected held(_id: string): string | undefined { return undefined }

  /**
   * 피드백 대화 돌보기 (1분마다, 설정 › 에이전트 "앱 피드백"):
   * 1. 맡은 대화의 PR이 CI 빨강이면 실패 기록을 그 대화에 다시 보내 고치게 한다 (두 번까지).
   * 2. CI 초록이면 설정대로 합친다: green = 바로, approved = 사용자가 그 답을 승인한 뒤, never = 합치지 않음.
   *    사용자가 손으로 합친 PR도 합친 것으로 본다 (prMerged).
   * 3. 합친 커밋이 지금 도는 앱에 들어오면 shipped (상단바 "#n 반영됨").
   *    main과 부딪혀 합치지 못하면 그 대화에 main을 받아 풀라고 한 번 보낸다.
   * 4. 저절로 맡기기(instant)면 pickFeedback.
   * 5. 끝난 대화는 저절로 보관한다 (closeDone): 합친 커밋이 앱에 들어왔고(shipped) 사용자가 확인했을 때.
   *    앱 고치기 대화는 사용자가 PR을 합친 것이, 피드백 대화는 그 답을 승인한 것이 확인이다 (PR 없이 끝난 답은 승인만으로)
   */
  async tickFeedback(): Promise<void> {
    const app = this.deps.app
    const fb = this.deps.feedback
    const s = this.deps.settings?.()
    if (!app || !fb || !s) return
    const items = new Map(listAllFeedback(fb.dir).map((e) => [e.key, e]))
    const watched = (x: Stored) => !LIVE.has(x.state) && (!!x.feedback || x.scope.kind === 'app' && !!x.pr && !x.archived && !x.closed)
    for (const c of [...this.chats.values()].filter(watched)) {
      try {
        // 묶어 맡긴 대화(11/19)는 모든 항목을 승인해야 승인으로 본다
        const es = keysOf(c).map((k) => items.get(k))
        const approved = es.length > 0 && es.every((e) => !!e?.review && e.review.verdict === '승인' && (!e.status?.handled_at || e.review.at > e.status.handled_at))
        // 앱 고치기 대화는 저절로 합치지 않으므로, 사용자가 합쳤는지 본다.
        // 피드백 대화의 PR도 사용자가 손으로 합칠 수 있다(설정이 「합치지 않음」 · 「승인 뒤」일 때, 11/26): 전에는 보지 않아 그 대화가 끝내 합쳐지지 않은 것으로 남았다
        // (고친 파일을 계속 잡고, 반영됨 · 보관 · 작업 폴더 치우기가 오지 않음). PR을 올린 뒤에만 그 번호로 묻는다: 다시 맡은 대화가 앞 PR로 합친 것이 되지 않게
        const w = this.workOf(c) ?? app
        // 보관한 대화는 바뀐 때를 그대로 둔다: 같은 항목의 새 대화보다 앞서면 다음 맡기기가 옛 대화로 이어진다 (handOff는 가장 최근에 바뀐 대화를 고른다)
        const save = () => (c.archived ? this.write(c) : this.touch(c))
        if ((!c.feedback || c.pr) && !c.merged && c.worktree && c.branch && w.prMerged) {
          const m = await w.prMerged(c.worktree, c.branch, c.pr?.number)
          if (m) { c.merged = m.sha || 'merged'; save() }
        }
        if (c.merged) {
          // 다른 앱(11/20)은 이 앱이 다시 켜지는 것과 상관없다: 합치면 끝
          if (!c.shipped && c.scope.app) { c.shipped = true; save() }
          if (!c.shipped && this.deps.inApp && (await this.deps.inApp(c.merged))) { c.shipped = true; save() }
          if (c.shipped && (!c.feedback || approved || s.merge === 'approved')) this.closeDone(c)
          continue
        }
        if (c.feedback && !c.pr && approved && es.every((e) => e?.status?.state !== '반영')) { this.closeDone(c); continue }
        if (!c.feedback || !c.pr || !c.worktree || !c.branch) continue
        const ck = await app.checks(c.worktree, c.branch)
        if (!ck.done) continue
        if (!ck.ok) {
          const sig = ck.checks.map((x) => `${x.name}:${x.state}:${x.link ?? ''}`).join('|')
          if (sig === c.ciSeen || (c.ciRetries ?? 0) >= 2) continue
          c.ciSeen = sig
          c.ciRetries = (c.ciRetries ?? 0) + 1
          this.send(c.id, { text: t(`CI가 실패했습니다 (${c.ciRetries}/2). 아래 기록을 읽고 고친 뒤 다시 올려 주세요.\n\n${ck.log ?? ''}`.trim(), `CI failed (${c.ciRetries}/2). Read the log below, fix it and submit again.\n\n${ck.log ?? ''}`.trim()) })
          continue
        }
        if (s.merge === 'never' || (s.merge === 'approved' && !approved) || this.held(c.id)) continue
        if (app.conflicted && (await app.conflicted(c.worktree, c.branch))) {
          const sig = `conflict:${ck.checks.map((x) => x.link ?? x.name).join('|')}`
          if (sig !== c.ciSeen) {
            c.ciSeen = sig
            this.send(c.id, { text: t('PR이 main과 부딪혀 합치지 못했습니다. `git fetch origin main && git merge origin/main`으로 받아 풀고, 확인한 뒤 다시 올려 주세요.', 'The PR conflicts with main, so it was not merged. Run `git fetch origin main && git merge origin/main`, resolve, check and submit again.') })
          }
          continue
        }
        const m = await app.merge(c.worktree, c.branch)
        c.merged = m.sha || 'merged'
        // 보관하며 압축한 대화면 먼저 푼다 (must): 빈 줄 목록에 적으면 다음에 풀 때 이 줄이 덮여 사라진다
        this.must(c.id).items.push({ kind: 'text', at: now(), text: t(`PR을 합쳤습니다(#${m.number}). 앱이 새 버전을 받아 쓰지 않는 틈에 다시 시작합니다.`, `Merged PR #${m.number}. The app picks up the new version and restarts when idle.`) })
        this.touch(c)
      } catch { /* gh · git 오류는 다음 차례에 다시 본다 */ }
    }
    await this.pickFeedback()
  }

  /** 저절로 맡긴 항목 → 그때의 글 표시 (마지막 손댄 분 · 코멘트 수: 같은 분에 단 새 코멘트는 다르게) */
  private picked = new Map<string, string>()

  /**
   * 저절로 맡기기(instant): 도는 대화가 한도보다 적으면 에이전트 차례를 맡긴다: 사용자가 가장 최근에 손댄 항목부터 (방금 남긴 코멘트에 바로 답하게, 11/20).
   * 앞서 맡았던 대화가 있는 항목은 혼자 그 대화에 이어 맡기고, 처음인 항목은 그 항목이 든 묶음으로 맡긴다
   * (같은 화면의 수정끼리, 질문 · 제안끼리, feedbackGroups.ts, 11/19).
   * 1분마다와, 사용자가 피드백 · 코멘트 · 답을 저장한 바로 뒤에 (routes/feedback.ts의 feedbackSaved, 11/20: 1분을 기다리지 않게),
   * 「자동 처리」를 켠 바로 뒤에 (routes/settings.ts). 한 번에 자리(한도)가 남는 만큼 맡는다: 쌓인 대기가 1분에 하나씩 나가지 않게 (11/20 22:37 제안).
   * 자리가 차면 피드백 돕기를 켠 맥에 맡긴다 (11/23 안 A, 그 맥의 다음 1분 알림 답으로 간다).
   * 겹쳐 부르면 앞 차례가 끝난 뒤 한 번 더 돈다 (같은 항목을 두 번 맡지 않게)
   */
  async pickFeedback(): Promise<void> {
    if (this.picking) { this.pickAgain = true; return this.picking }
    this.picking = (async () => {
      try {
        do {
          this.pickAgain = false
          // 돕는 맥(11/23)의 자리까지: 넉넉히 잡고, 자리가 없으면 pickOne이 false로 멈춘다
          for (let n = 0; n < this.deps.limit + 20 && await this.pickOne(); n++) { /* 자리가 남는 동안 */ }
        } while (this.pickAgain)
      } finally { this.picking = null }
    })()
    return this.picking
  }

  private picking: Promise<void> | null = null
  private pickAgain = false

  /** 에이전트 차례 하나(또는 그 묶음)를 맡긴다. 맡겼으면 true */
  private async pickOne(): Promise<boolean> {
    const fb = this.deps.feedback
    const s = this.deps.settings?.()
    if (!this.deps.app || !fb || !s) return false
    // 클라우드에서 처리가 켜져 있어도 쉬지 않는다: 클라우드 루틴이 맡은(handoff.yaml) 항목만 건너뛴다 (11/20 사용자 "클라우드가 잡은 것 외에는 로컬이")
    // 서버로 정한 컴퓨터가 따로 있으면 저절로 맡기는 것은 그 서버만 (11/20: 여러 맥이 저마다 맡지 않게)
    if (this.deps.feedback?.elsewhere?.()) return false
    if (s.feedback !== 'instant') return false
    // 돕는 맥에 보냈지만 돌고 있지 않은 항목은 맡긴 것으로 기억한 표시를 지운다 (11/26): 전에는 그 맥이 시작하지 못해 맡음을 풀어도 다시 맡기지 않았다
    this.unpick(fb.helpers?.unstarted?.() ?? [])
    // 이 서버의 자리가 차면 피드백 돕기를 켠 맥에 맡긴다 (11/23 안 A): 맡음은 그 맥 이름으로 적어, 그 맥에서도 다른 맥이 맡은 것으로 보지 않는다
    const helper = this.running() + this.queue.length >= this.deps.limit ? fb.helpers?.free() : undefined
    if (this.running() + this.queue.length >= this.deps.limit && !helper) return false
    const chats = [...this.chats.values()]
    const waiting = listAllFeedback(fb.dir)
      // 글 시각은 분 단위라 맡은 분과 같은 분에 남긴 코멘트도 새 것으로 본다 (같은 글로 두 번 맡지 않게 picked)
      .filter((e) => agentTurns(e).length && this.picked.get(e.key) !== mark(e) && !chats.some((c) => keysOf(c).includes(e.key) && (LIVE.has(c.state) || Math.floor(handedAt(c) / 60_000) * 60_000 > lastTouched(e))))
      .filter((e) => !fb.claims?.taken(e.key, lastTouched(e)))
      .sort((a, b) => lastTouched(b) - lastTouched(a))
    const first = waiting[0]
    if (!first) return false
    const next = chats.some((c) => keysOf(c).includes(first.key)) ? [first] : bundlesOf(waiting.filter((e) => !chats.some((c) => keysOf(c).includes(e.key)))).find((b) => b.items.some((e) => e.key === first.key))?.items ?? [first]
    // 다른 컴퓨터도 저절로 맡기기를 켰으면 먼저 적어 올린 쪽만 맡는다 (묶음 안에서 맡은 것만)
    const mine: string[] = []
    for (const e of next) if (!fb.claims || (await fb.claims.claim(e.key, lastTouched(e), helper).catch(() => false))) mine.push(e.key)
    if (!mine.length) return false
    for (const e of next) if (mine.includes(e.key)) this.picked.set(e.key, mark(e))
    if (helper) { fb.helpers?.assign(helper, mine); return true }
    try { this.handOff(mine) } catch { /* 다른 대화가 막 시작했으면 다음 차례에 */ }
    return true
  }

  /** 돕는 맥이 꺼져 맡음을 푼 항목을 다시 맡길 수 있게 (11/23 안 A) */
  unpick(keys: string[]): void { for (const k of keys) this.picked.delete(k) }

  /** 이 맥에서 도는 피드백 대화와 그 대화들이 맡은 항목 (피드백 돕기: 서버에 알린다) */
  liveFeedback(): { count: number; keys: string[] } {
    const live = [...this.chats.values()].filter((c) => !!c.feedback && LIVE.has(c.state))
    return { count: live.length, keys: live.flatMap((c) => keysOf(c)) }
  }

  /** 서버가 맡음을 푼 항목(이 맥이 늦게 알렸다)을 맡은 대화를 멈춘다: 서버가 다른 곳에 다시 맡기므로 둘이 함께 고치지 않게 */
  dropFeedback(keys: string[]): void {
    for (const c of [...this.chats.values()]) if (LIVE.has(c.state) && keysOf(c).some((k) => keys.includes(k))) { try { this.stop(c.id) } catch { /* 이미 멈췄다 */ } }
  }

  /**
   * 피드백을 앱 고치기 대화에 맡긴다 (피드백 화면의 「에이전트에게 맡기기」, 저절로 맡기기, 중앙). 여럿이면 한 대화에 묶는다
   * (feedbackGroups.ts, 11/19). 같은 항목은 한 대화만: 그 피드백을 맡은 대화가 도는 중이면 거절하고, 하나만 맡길 때 끝난 대화가 있으면
   * 새로 열지 않고 그 대화에 이어 보낸다 (11/20). 에이전트 차례가 아닌 항목도 거절한다.
   */
  handOff(keys: string | string[], parent?: string, assigned = false): Chat {
    const fb = this.deps.feedback
    if (!this.deps.app || !fb) throw new WorkbenchError(404, t(`${HERE.ko}에서는 피드백을 에이전트에게 맡길 수 없습니다 (앱 저장소 · 피드백 폴더가 필요)`, `Feedback cannot be handed to an agent on ${HERE.en} (needs the app repository and a feedback folder)`))
    // assigned = 서버가 피드백 돕기로 이 맥에 맡긴 것: 이 맥의 맡기기 설정(서버로 보냄)과 상관없다
    if (!assigned && this.deps.settings?.().feedback === 'off') throw new WorkbenchError(409, t('설정 › 에이전트에서 피드백 맡기기를 껐습니다', 'Handing feedback to the agent is off in Settings › Agents'))
    const list = typeof keys === 'string' ? [keys] : keys
    const busyOf = (key: string) => [...this.chats.values()].find((c) => keysOf(c).includes(key) && LIVE.has(c.state))?.title
    // 앞서 이 항목을 맡은 대화가 있으면 그 대화에 이어 맡긴다: 맥락을 그대로 두고, 대화 목록에 항목마다 한 줄 (11/20)
    const earlier = list.length === 1 ? [...this.chats.values()].filter((c) => keysOf(c).includes(list[0]!)).sort((a, b) => b.updated.localeCompare(a.updated))[0] : undefined
    if (earlier) {
      const busy = busyOf(list[0]!)
      if (busy) throw new WorkbenchError(409, t(`이 피드백을 맡은 대화(「${busy}」)가 일하는 중입니다`, `A conversation ("${busy}") is already working on this feedback`))
      const e = listAllFeedback(fb.dir).find((x) => x.key === list[0])
      if (!e) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
      const reasons = agentTurnReasons(e)
      if (!reasons.length) throw new WorkbenchError(400, t('에이전트 차례가 아닌 피드백입니다', 'This feedback is not the agent\'s turn'))
      const merged = earlier.merged ? { ...(earlier.pr && { pr: earlier.pr.number }), ...(earlier.branch && { branch: earlier.branch }) } : undefined
      // 합친 PR은 끝난 일: 새 PR · CI를 처음부터 본다
      if (merged) { delete earlier.merged; delete earlier.shipped; delete earlier.pr; delete earlier.ciSeen; delete earlier.ciRetries }
      earlier.archived = false
      delete earlier.closed
      earlier.handed = now()
      if (parent) earlier.parent = parent
      return this.send(earlier.id, { text: feedbackAgainPrompt(e, reasons, merged) })
    }
    const p = handOffPlan(listAllFeedback(fb.dir), fb.dir, list, busyOf)
    // 모델은 Opus로 정한다: 계정 기본값은 계정마다 달라 크레딧이 드는 모델로 풀린 적이 있다 (11/20, 중앙과 같게)
    return this.create({ rid: APP_RID, text: p.text, title: p.title, mode: 'auto', model: 'opus', ...(p.images.length && { images: p.images }) }, { feedback: p.keys[0], bundle: p.keys, ...(parent && { parent }) })
  }

  /**
   * 맡은 피드백의 처리 기록을 적는다 (에이전트의 feedback_answer). after가 있으면 그 PR의 CI 그림을 받아
   * 그림 폴더에 두고 pictures: [전(남길 때 그림), 후]. 반영이고 PR이 있으면 commit: "#n".
   * verdict = 사용자가 이 대화에서 말한 판정: 피드백 화면과 같은 규칙으로 먼저 적는다 (그다음 새 처리가 그 판정에 답한다)
   */
  async feedbackAnswer(id: string, b: FeedbackAnswerBody): Promise<FeedbackAnswered> {
    const c = this.must(id)
    const fb = this.deps.feedback
    if (!c.feedback || !fb) throw new WorkbenchError(400, t('피드백을 맡은 대화가 아닙니다', 'This conversation has no feedback item'))
    const key = b.key ?? c.feedback
    if (!keysOf(c).includes(key)) throw new WorkbenchError(400, t(`이 대화가 맡은 피드백이 아닙니다 (맡은 것: ${keysOf(c).join(', ')})`, `Not a feedback item of this conversation (its items: ${keysOf(c).join(', ')})`))
    if (!b.key && keysOf(c).length > 1) throw new WorkbenchError(400, t('묶어 맡긴 대화는 key로 어느 항목인지 적어 주세요', 'This conversation has several items: pass key'))
    const e = listAllFeedback(fb.dir).find((x) => x.key === key)
    if (!e) throw new WorkbenchError(404, t('맡은 피드백을 찾지 못했습니다', 'The feedback item was not found'))
    const bad = b.verdict && feedbackVerdictError(e, b.verdict, b.verdictNote)
    if (bad) throw new WorkbenchError(400, bad)
    let pictures: string[] | undefined
    if (b.after) {
      if (!this.deps.app || !c.worktree || !c.branch || !c.pr) throw new WorkbenchError(409, t('PR을 연 뒤에 고친 뒤 그림을 받을 수 있습니다', 'Open the PR before asking for the after picture'))
      const png = await this.deps.app.shot(c.worktree, c.branch, b.after)
      if (!png) throw new WorkbenchError(409, t(`CI 그림 ${b.after}을 받지 못했습니다. CI가 끝났는지, 그 화면 이름이 맞는지 확인하세요`, `Could not get the CI picture ${b.after}. Check that CI finished and the screen name is right`))
      const d = new Date()
      const name = `pictures/${localDate(d)}-${localTime(d).replace(':', '')}-${b.after}-after.png`
      fs.mkdirSync(path.join(fb.dir, 'pictures'), { recursive: true })
      fs.writeFileSync(path.join(fb.dir, name), png)
      pictures = e.picture && fs.existsSync(path.join(fb.dir, e.picture)) ? [e.picture, name] : undefined
    }
    if (b.verdict) setFeedbackReview(fb.dir, key, b.verdict, b.verdictNote || undefined)
    if (b.dropMockups?.length) dropMockups(fb.dir, key, b.dropMockups)
    const r = writeFeedbackAnswer(fb.dir, key, {
      ...(b.state && { state: b.state }),
      ...(b.note && { note: b.note }),
      ...(b.understood && { understood: b.understood }),
      ...(b.cause && { cause: b.cause }),
      ...(b.clean && { clean: b.clean }),
      ...(b.ask && { ask: b.ask }),
      ...(b.miss && { miss: b.miss }),
      ...(b.lesson && { lesson: b.lesson }),
      ...(b.state === '반영' && c.pr && { commit: `#${c.pr.number}` }),
      ...(pictures && { pictures }),
      ...answerMockups(b, c.worktree, fb.dir),
    })
    fb.written?.()
    this.touch(c)
    return { key, ...(r.state && { state: r.state }), ...(b.verdict && { verdict: b.verdict }), ...(pictures && { pictures }), replies: r.replies }
  }

  /**
   * 끝난 대화의 작업 폴더 치우기 (10분마다, 11/25 사용자 결정 "작업 폴더 치우기"): PR을 합쳤거나 보관한 앱 고치기 대화 가운데
   * 일하지 않고 에이전트도 닫힌 것. 치워도 되는지(올리지 않은 고침 · 커밋이 없는지)는 작업 폴더의 git에서 보고(AppWork.tidy),
   * 안 되면 그대로 둔다. 시안은 남아 대화 화면에 계속 보이고, 그 대화를 이어 쓰면 작업 폴더를 새로 만든다. 치운 수를 돌려준다
   */
  async tidyWorktrees(): Promise<number> {
    let n = 0
    for (const c of [...this.chats.values()]) {
      const w = this.workOf(c)
      const idle = () => this.chats.get(c.id) === c && !LIVE.has(c.state) && !this.sessions.has(c.id)
      if (!w?.tidy || !c.worktree || !c.branch || !(c.merged || c.archived) || !idle() || !fs.existsSync(c.worktree)) continue
      try {
        if (!(await w.tidy(c.worktree, c.branch, idle))) continue
        n++
        // 새로 만들 작업 폴더는 그때의 모습부터 다시 찍는다 (되돌릴 자리 · 명령으로 고친 파일 찾기)
        delete c.snap
        delete c.diffSeen
        if (this.chats.get(c.id) === c) this.write(c)
      } catch { /* git · gh 오류는 다음 차례에 다시 본다 (그동안 폴더는 그대로) */ }
    }
    return n
  }

  /** 목표를 이루고 확인을 받은 대화를 보관한다 (한 번만: 사용자가 꺼내면 다시 넣지 않는다) */
  protected closeDone(c: Stored): void {
    // 마지막 차례가 오류로 끝난 대화는 목표를 이룬 것이 아니다 (11/20: 크레딧 오류로 멈춘 대화가 보관된 적이 있다)
    if (c.closed || c.archived || LIVE.has(c.state) || c.state === 'error') return
    c.closed = true
    c.items.push({ kind: 'text', at: now(), text: t('목표를 이루고 확인을 받아 이 대화를 보관했습니다. 보관함에서 다시 꺼낼 수 있습니다.', 'The goal is met and confirmed, so this conversation was archived. You can take it out of the archive again.') })
    this.archive(c.id, true)
  }
}
