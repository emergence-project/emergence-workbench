/**
 * 피드백 · 앱 고치기 대화 돌보기 (1분마다, routes/agentChats.ts): CI · 합치기 · 반영됨 · 끝난 대화 보관 · 저절로 맡기기.
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
import { bundlesOf, handOffPlan, keysOf } from './feedbackGroups.js'
import { feedbackVerdictError } from './feedbackVerdict.js'
import { HERE, t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

const now = () => new Date().toISOString()

const mark = (e: FeedbackListItem): string => `${lastTouched(e)}|${e.comments?.length ?? 0}|${e.review?.at ?? ''}`

export class FeedbackChats extends SharedChats {
  /**
   * 피드백 대화 돌보기 (1분마다, 설정 › 에이전트 "앱 피드백"):
   * 1. 맡은 대화의 PR이 CI 빨강이면 실패 기록을 그 대화에 다시 보내 고치게 한다 (두 번까지).
   * 2. CI 초록이면 설정대로 합친다: green = 바로, approved = 사용자가 그 답을 승인한 뒤, never = 합치지 않음.
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
        // 앱 고치기 대화는 저절로 합치지 않으므로, 사용자가 합쳤는지 본다
        if (!c.feedback && !c.merged && c.worktree && c.branch && app.prMerged) {
          const m = await app.prMerged(c.worktree, c.branch)
          if (m) { c.merged = m.sha || 'merged'; this.touch(c) }
        }
        if (c.merged) {
          if (!c.shipped && this.deps.inApp && (await this.deps.inApp(c.merged))) { c.shipped = true; this.touch(c) }
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
        if (s.merge === 'never' || (s.merge === 'approved' && !approved)) continue
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
        this.must(c.id).items.push({ kind: 'text', at: now(), text: t(`PR #${m.number}을 합쳤습니다. 앱이 새 버전을 받아 쓰지 않는 틈에 다시 시작합니다.`, `Merged PR #${m.number}. The app picks up the new version and restarts when idle.`) })
        this.touch(c)
      } catch { /* gh · git 오류는 다음 차례에 다시 본다 */ }
    }
    await this.pickFeedback()
  }

  /** 저절로 맡긴 항목 → 그때의 글 표시 (마지막 손댄 분 · 코멘트 수: 같은 분에 단 새 코멘트는 다르게) */
  private picked = new Map<string, string>()

  /**
   * 저절로 맡기기(instant): 도는 대화가 한도보다 적으면 에이전트 차례 하나를 맡긴다: 사용자가 가장 최근에 손댄 항목부터 (방금 남긴 코멘트에 바로 답하게, 11/20).
   * 앞서 맡았던 대화가 있는 항목은 혼자 그 대화에 이어 맡기고, 처음인 항목은 그 항목이 든 묶음으로 맡긴다
   * (같은 화면의 수정끼리, 질문 · 제안끼리, feedbackGroups.ts, 11/19).
   * 1분마다와, 사용자가 피드백 · 코멘트 · 답을 저장한 바로 뒤에 (routes/feedback.ts의 feedbackSaved, 11/20: 1분을 기다리지 않게)
   */

  async pickFeedback(): Promise<void> {
    const fb = this.deps.feedback
    const s = this.deps.settings?.()
    if (!this.deps.app || !fb || !s) return
    // 클라우드에서 처리가 켜져 있어도 쉬지 않는다: 클라우드 루틴이 맡은(handoff.yaml) 항목만 건너뛴다 (11/20 사용자 "클라우드가 잡은 것 외에는 로컬이")
    if (s.feedback !== 'instant' || this.running() + this.queue.length >= this.deps.limit) return
    const chats = [...this.chats.values()]
    const waiting = listAllFeedback(fb.dir)
      // 글 시각은 분 단위라 맡은 분과 같은 분에 남긴 코멘트도 새 것으로 본다 (같은 글로 두 번 맡지 않게 picked)
      .filter((e) => agentTurns(e).length && this.picked.get(e.key) !== mark(e) && !chats.some((c) => keysOf(c).includes(e.key) && (LIVE.has(c.state) || Math.floor(handedAt(c) / 60_000) * 60_000 > lastTouched(e))))
      .filter((e) => !fb.claims?.taken(e.key, lastTouched(e)))
      .sort((a, b) => lastTouched(b) - lastTouched(a))
    const first = waiting[0]
    if (!first) return
    const next = chats.some((c) => keysOf(c).includes(first.key)) ? [first] : bundlesOf(waiting.filter((e) => !chats.some((c) => keysOf(c).includes(e.key)))).find((b) => b.items.some((e) => e.key === first.key))?.items ?? [first]
    // 다른 컴퓨터도 저절로 맡기기를 켰으면 먼저 적어 올린 쪽만 맡는다 (묶음 안에서 맡은 것만)
    const mine: string[] = []
    for (const e of next) if (!fb.claims || (await fb.claims.claim(e.key, lastTouched(e)).catch(() => false))) mine.push(e.key)
    if (!mine.length) return
    for (const e of next) if (mine.includes(e.key)) this.picked.set(e.key, mark(e))
    try { this.handOff(mine) } catch { /* 다른 대화가 막 시작했으면 다음 차례에 */ }
  }

  /**
   * 피드백을 앱 고치기 대화에 맡긴다 (피드백 화면의 「에이전트에게 맡기기」, 저절로 맡기기, 중앙). 여럿이면 한 대화에 묶는다
   * (feedbackGroups.ts, 11/19). 같은 항목은 한 대화만: 그 피드백을 맡은 대화가 도는 중이면 거절하고, 하나만 맡길 때 끝난 대화가 있으면
   * 새로 열지 않고 그 대화에 이어 보낸다 (11/20). 에이전트 차례가 아닌 항목도 거절한다.
   */
  handOff(keys: string | string[], parent?: string): Chat {
    const fb = this.deps.feedback
    if (!this.deps.app || !fb) throw new WorkbenchError(404, t(`${HERE.ko}에서는 피드백을 에이전트에게 맡길 수 없습니다 (앱 저장소 · 피드백 폴더가 필요)`, `Feedback cannot be handed to an agent on ${HERE.en} (needs the app repository and a feedback folder)`))
    if (this.deps.settings?.().feedback === 'off') throw new WorkbenchError(409, t('설정 › 에이전트에서 피드백 맡기기를 껐습니다', 'Handing feedback to the agent is off in Settings › Agents'))
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
    return this.create({ rid: APP_RID, text: p.text, title: p.title, mode: 'edit', ...(p.images.length && { images: p.images }) }, { feedback: p.keys[0], bundle: p.keys, ...(parent && { parent }) })
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

  /** 목표를 이루고 확인을 받은 대화를 보관한다 (한 번만: 사용자가 꺼내면 다시 넣지 않는다) */
  protected closeDone(c: Stored): void {
    if (c.closed || c.archived || LIVE.has(c.state)) return
    c.closed = true
    c.items.push({ kind: 'text', at: now(), text: t('목표를 이루고 확인을 받아 이 대화를 보관했습니다. 보관함에서 다시 꺼낼 수 있습니다.', 'The goal is met and confirmed, so this conversation was archived. You can take it out of the archive again.') })
    this.archive(c.id, true)
  }
}
