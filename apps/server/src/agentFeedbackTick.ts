/**
 * 피드백 · 앱 고치기 대화 돌보기 (1분마다, routes/agentChats.ts): CI · 합치기 · 반영됨 · 끝난 대화 보관 · 저절로 맡기기.
 * agentChats.ts가 길어 나눴다. CentralChats(agentCentral.ts)가 이 클래스를 잇는다
 */
import { agentTurns } from '@rw/core'
import { AgentChats, LIVE, lastTouched, type Stored } from './agentChats.js'
import { listAllFeedback } from './feedback.js'
import { readFeedbackCloud } from './feedbackCloud.js'
import { bundlesOf, keysOf } from './feedbackGroups.js'
import { t } from './i18n.js'

const now = () => new Date().toISOString()

export class FeedbackChats extends AgentChats {
  /**
   * 피드백 대화 돌보기 (1분마다, 설정 › 에이전트 "앱 피드백"):
   * 1. 맡은 대화의 PR이 CI 빨강이면 실패 기록을 그 대화에 다시 보내 고치게 한다 (두 번까지).
   * 2. CI 초록이면 설정대로 합친다: green = 바로, approved = 사용자가 그 답을 승인한 뒤, never = 합치지 않음.
   * 3. 합친 커밋이 지금 도는 앱에 들어오면 shipped (상단바 "#n 반영됨").
   *    main과 부딪혀 합치지 못하면 그 대화에 main을 받아 풀라고 한 번 보낸다.
   * 4. 저절로 맡기기(instant)면, 도는 대화가 한도보다 적을 때 가장 오래된 에이전트 차례가 든 묶음 하나를 맡긴다
   *    (같은 화면의 수정끼리, 질문 · 제안끼리, feedbackGroups.ts, 11/19).
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
        c.items.push({ kind: 'text', at: now(), text: t(`PR #${m.number}을 합쳤습니다. 앱이 새 버전을 받아 쓰지 않는 틈에 다시 시작합니다.`, `Merged PR #${m.number}. The app picks up the new version and restarts when idle.`) })
        this.touch(c)
      } catch { /* gh · git 오류는 다음 차례에 다시 본다 */ }
    }
    if (s.feedback !== 'instant' || readFeedbackCloud(fb.dir).enabled || this.running() + this.queue.length >= this.deps.limit) return // 클라우드가 맡는 동안(cloud.yaml)은 쉰다 (11/4)
    const waiting = [...items.values()]
      .filter((e) => agentTurns(e).length && ![...this.chats.values()].some((c) => keysOf(c).includes(e.key) && new Date(c.created).getTime() >= lastTouched(e)))
      .filter((e) => !fb.claims?.taken(e.key, lastTouched(e)))
    const next = bundlesOf(waiting)[0]
    if (!next) return
    // 다른 컴퓨터도 저절로 맡기기를 켰으면 먼저 적어 올린 쪽만 맡는다 (묶음 안에서 맡은 것만)
    const mine: string[] = []
    for (const e of next.items) if (!fb.claims || (await fb.claims.claim(e.key, lastTouched(e)).catch(() => false))) mine.push(e.key)
    if (!mine.length) return
    try { this.handOff(mine) } catch { /* 다른 대화가 막 시작했으면 다음 차례에 */ }
  }

  /** 목표를 이루고 확인을 받은 대화를 보관한다 (한 번만: 사용자가 꺼내면 다시 넣지 않는다) */
  protected closeDone(c: Stored): void {
    if (c.closed || c.archived || LIVE.has(c.state)) return
    c.closed = true
    c.items.push({ kind: 'text', at: now(), text: t('목표를 이루고 확인을 받아 이 대화를 보관했습니다. 보관함에서 다시 꺼낼 수 있습니다.', 'The goal is met and confirmed, so this conversation was archived. You can take it out of the archive again.') })
    this.archive(c.id, true)
  }
}
