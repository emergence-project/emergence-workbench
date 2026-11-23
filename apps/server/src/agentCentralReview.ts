/**
 * 중앙의 검토 역할 (11/23 사용자 "매번 대화를 검토하면서 충돌/모순이나 잘못된 결정은 없는지 검토하는 역할", "매번 검토를 새 에이전트로 두면 토큰 소모가 클테니,
 * 중앙 대화가 필요하다고 생각하거나, 사용자 요청을 할 때"). 가벼운 검토는 중앙이 깨어날 때 스스로 한다 (centralBrief.ts). 여기는 앱이 하는 몫:
 *
 * - 겹침 (토큰 없음): 열린 앱 고치기 대화(일하는 중이거나 PR이 있고 아직 합치지 않은 것)가 같은 파일을 바꾸면 중앙의 요약 앞에 한 줄.
 * - 의도 장부: 사용자의 말 그대로 · 날짜 · 출처 대화. 더하기만 하고 지우지 않는다. 바뀐 결정은 옛 항목에 「대체됨」. 중앙 메모처럼 개인 저장소(있으면)에 둔다.
 * - 깊은 검토 (chat_review): 새 에이전트(도구 없는 한 번 묻기 둘)가 PR의 바뀐 코드와 의도 장부만 본다. 하위 대화의 보고 · 중앙의 결론은 넘기지 않는다.
 *   찾기 → 확인 두 단계, 확인된 것만 중앙을 깨운다. 없으면 조용히 끝난다.
 * - 보류: 깊은 검토 중인 PR만. 검토가 끝나거나 중앙이 풀면 풀린다. 앱을 다시 켜면 검토와 함께 사라진다.
 *   보류 중에는 피드백 PR 저절로 합치기(tickFeedback)와 app_merge가 합치지 않는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { localDate } from '@rw/core'
import { z } from 'zod'
import { APP_RID, CentralDecision, type CentralDecisionBody, type CentralDecisions, type CentralHold, type CentralReviewBody, type CentralReviewStarted } from '@rw/core/contract/agentChats'
import { LIVE, type AgentChatsDeps, type Stored } from './agentChats.js'
import { FeedbackChats } from './agentFeedbackTick.js'
import type { CentralMemoDeps } from './agentTidy.js'
import type { FileDiff } from './appWorktree.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 깊은 검토에 넘기는 바뀐 코드 길이 */
const DIFF_MAX = 80_000
/** 깊은 검토의 모델 (11/23: 드물게 돌리니 가장 꼼꼼한 것) */
export const REVIEW_MODEL = 'opus'
/** 찾은 것 한 줄: 「버그 · 파일:줄 · 무엇과 까닭」 (규칙 · 의도도 같은 꼴) */
const FINDING = /^\s*(?:[-*]\s*)?((?:버그|규칙|의도)\s*·.+)$/

/** 의도 장부 파일 (중앙 메모 옆). 없으면 빈 장부 */
export type LedgerDeps = Omit<CentralMemoDeps, 'decisions'>

export function readLedger(d?: LedgerDeps): CentralDecision[] {
  if (!d) return []
  try {
    const v = z.object({ items: z.array(CentralDecision) }).safeParse(JSON.parse(fs.readFileSync(d.file, 'utf8')))
    return v.success ? v.data.items : []
  } catch { return [] }
}

/** 장부에 더한다. replaces = 이 말로 대체되는 옛 항목 번호 (지우지 않고 「대체됨」만 단다) */
export function addLedger(d: LedgerDeps, b: CentralDecisionBody, today = localDate()): CentralDecision[] {
  const items = readLedger(d)
  const n = items.reduce((m, x) => Math.max(m, x.n), 0) + 1
  const old = b.replaces === undefined ? undefined : items.find((x) => x.n === b.replaces)
  if (b.replaces !== undefined && !old) throw new WorkbenchError(404, t(`장부에 ${b.replaces}번 항목이 없습니다`, `No ledger entry ${b.replaces}`))
  if (old?.superseded) throw new WorkbenchError(409, t(`${old.n}번은 이미 대체되었습니다 (${old.superseded.by}번)`, `Entry ${old.n} was already replaced (by ${old.superseded.by})`))
  if (old) old.superseded = { date: today, by: n }
  items.push({ n, words: b.words.trim(), date: b.date ?? today, source: b.source.trim() })
  fs.mkdirSync(path.dirname(d.file), { recursive: true })
  fs.writeFileSync(d.file, `${JSON.stringify({ items }, null, 2)}\n`)
  void d.publish?.().catch(() => undefined)
  return items
}

/** 에이전트에게 주는 장부 (대체되지 않은 것만). 비었으면 빈 글 */
export function ledgerText(items: CentralDecision[]): string {
  const live = items.filter((x) => !x.superseded)
  return live.length ? ['[Intent ledger: the user\'s own words, oldest first. Check reports and changes against these]', ...live.map((x) => `${x.n}. (${x.date} · ${x.source}) "${x.words}"`)].join('\n') : ''
}

/** 같은 파일을 바꾸는 열린 앱 고치기 대화 (같은 앱끼리). 「겹침: 「A」 id · 「B」 id — 파일들」 줄들 */
export function overlapsOf(chats: Iterable<Stored>): string[] {
  const by = new Map<string, Map<string, Stored[]>>()
  for (const c of chats) {
    if (c.rid !== APP_RID || c.archived || c.merged || !(LIVE.has(c.state) || c.pr)) continue
    const app = by.get(c.scope.app ?? '') ?? new Map<string, Stored[]>()
    by.set(c.scope.app ?? '', app)
    for (const f of new Set(c.changed)) app.set(f, [...(app.get(f) ?? []), c])
  }
  const lines = new Map<string, string[]>()
  for (const files of by.values()) {
    for (const [f, cs] of files) {
      if (cs.length < 2) continue
      const who = cs.map((c) => `「${c.title}」 ${c.id}${c.pr ? ` (PR #${c.pr.number})` : ''}`).join(' · ')
      lines.set(who, [...(lines.get(who) ?? []), f])
    }
  }
  return [...lines].map(([who, fs]) => `겹침: ${who} — ${fs.join(', ')}`)
}

/** 깊은 검토 1단계: 찾기 */
export function findPrompt(diff: string, ledger: string, focus?: string): string {
  return [
    'You review one pull request of the Emergence Workbench app. You see only its changed code and the user\'s intent ledger (the user\'s own words). You are not told why the author made the changes; judge the code itself.',
    'Find: bugs (wrong behavior, crashes, lost data, broken permissions), rule violations (tests missing or weakened for changed behavior, changes outside what the change is about, a ledger rule broken), and drift from the user\'s intent in the ledger.',
    'Write one line per finding, in Korean: "버그 · file:line · what is wrong and why" (or 규칙 · …, 의도 · …). Only findings you can point to in this code. No style, no guesses. If there is nothing, write only "없음".',
    ...(focus ? [`Look especially at: ${focus}`] : []),
    ledger || '[Intent ledger: empty]',
    '[Changed code]', diff,
  ].join('\n\n')
}

/** 깊은 검토 2단계: 확인 (찾은 것을 코드에 다시 대어 본다) */
export function confirmPrompt(diff: string, ledger: string, found: string[]): string {
  return [
    'Another reviewer listed the candidate findings below for one pull request of the Emergence Workbench app. Check each against the changed code and the user\'s intent ledger yourself.',
    'Keep a line only if the code clearly shows it. Drop anything that is a guess, a matter of style, already handled elsewhere in the shown code, or not visible in this change. Write the kept lines unchanged, one per line, or only "없음".',
    '[Candidates]', found.join('\n'),
    ledger || '[Intent ledger: empty]',
    '[Changed code]', diff,
  ].join('\n\n')
}

/** 모델의 답에서 찾은 것 줄만 */
export function findingsOf(answer: string): string[] {
  return answer.split('\n').map((l) => FINDING.exec(l)?.[1]?.trim()).filter((x): x is string => !!x).slice(0, 20)
}

function diffText(files: FileDiff[]): string {
  const s = files.map((f) => `--- ${f.file} (+${f.added} -${f.removed})\n${f.patch}`).join('\n\n')
  return s.length > DIFF_MAX ? `${s.slice(0, DIFF_MAX)}\n… (cut)` : s
}

/** 검토 하나: hold = 보류 까닭(보류 중이면), blocked = 보류 때문에 합치기를 거절했음 */
type Review = { hold?: string; blocked?: boolean }

export class ReviewChats extends FeedbackChats {
  private reviews = new Map<string, Review>()
  constructor(deps: AgentChatsDeps, private readonly ledgerDeps?: LedgerDeps) { super(deps) }

  decisions(): CentralDecisions { return { items: readLedger(this.ledgerDeps), where: this.ledgerDeps?.where ?? 'local' } }
  addDecision(b: CentralDecisionBody): CentralDecisions {
    if (!this.ledgerDeps) throw new WorkbenchError(404, t('이 컴퓨터에는 의도 장부가 없습니다', 'There is no intent ledger on this computer'))
    return { items: addLedger(this.ledgerDeps, b), where: this.ledgerDeps.where }
  }

  /** 중앙에게 줄 장부 (대체되지 않은 것) */
  protected ledger(): string { return ledgerText(readLedger(this.ledgerDeps)) }

  /** 중앙의 요약 앞에 붙는 줄: 겹침 · 돌고 있는 깊은 검토. 없으면 빈 글 */
  protected reviewLine(): string {
    const over = overlapsOf(this.chats.values())
    const runs = [...this.reviews].map(([id, r]) => { const c = this.chats.get(id); return c ? `「${c.title}」 ${id}${r.hold ? ' (보류)' : ''}` : id })
    return [
      ...(over.length ? ['\n[Open app conversations change the same files: check they do not undo or contradict each other before merging]', ...over] : []),
      ...(runs.length ? [`\n[Deep review running: ${runs.join(' · ')}]`] : []),
    ].join('\n')
  }

  /** 보류 중이면 그 까닭: 피드백 PR 저절로 합치기(tickFeedback)가 건너뛴다 */
  protected override held(id: string): string | undefined { return this.reviews.get(id)?.hold }

  /** app_merge 앞에서: 보류 중이면 409. 거절한 것을 적어 두고, 검토가 깨끗이 끝나면 중앙에게 알린다 (다시 합치게) */
  protected refuseHeld(id: string): void {
    const r = this.reviews.get(id)
    if (!r?.hold) return
    r.blocked = true
    throw new WorkbenchError(409, t(`중앙이 이 PR을 깊은 검토 동안 보류했습니다 (${r.hold}). 합치지 말고 차례를 끝내세요: 검토가 끝나면 중앙이 알려 줍니다`, `The central conversation holds this pull request during a deep review (${r.hold}). Do not merge; end your turn: the central conversation tells you when the review ends`))
  }

  /** 보류를 걸거나 푼다 (pr_hold): 깊은 검토 중인 대화에만 */
  hold(id: string, on: boolean, reason?: string): CentralHold {
    const c = this.must(id)
    const r = this.reviews.get(c.id)
    if (!r) throw new WorkbenchError(409, t('깊은 검토 중인 대화만 보류할 수 있습니다. 먼저 chat_review를 부르세요', 'Only a conversation under deep review can be held. Call chat_review first'))
    r.hold = on ? (reason?.trim() || t('깊은 검토 중', 'under deep review')) : undefined
    return { id: c.id, held: !!r.hold }
  }

  /** 깊은 검토를 시작한다 (chat_review). 바로 돌아오고, 확인된 것이 있을 때만 reviewed가 중앙을 깨운다 */
  async startReview(b: CentralReviewBody): Promise<CentralReviewStarted> {
    const c = this.must(b.id)
    const w = this.workOf(c)
    if (!w || c.rid !== APP_RID) throw new WorkbenchError(400, t('앱 고치기 대화가 아닙니다', 'Not an app conversation'))
    if (!c.worktree) throw new WorkbenchError(409, t('작업 폴더를 아직 만들지 않았습니다', 'The work folder is not ready yet'))
    if (c.merged) throw new WorkbenchError(409, t('이미 합친 PR입니다', 'This pull request is already merged'))
    if (this.reviews.has(c.id)) throw new WorkbenchError(409, t('이 대화는 이미 깊은 검토 중입니다', 'A deep review of this conversation is already running'))
    const ask = this.deps.runner.side
    if (!ask || !w.diff) throw new WorkbenchError(404, t('이 컴퓨터에서는 깊은 검토를 쓸 수 없습니다', 'Deep review is not available on this computer'))
    const files = await w.diff(c.worktree)
    if (!files.length) throw new WorkbenchError(409, t('바뀐 코드가 없습니다', 'No changed code'))
    const r: Review = { ...(b.hold && { hold: t('깊은 검토 중', 'under deep review') }) }
    this.reviews.set(c.id, r)
    const diff = diffText(files), ledger = this.ledger(), cwd = c.worktree
    const one = (prompt: string) => ask({ prompt, cwd, model: REVIEW_MODEL, effort: 'high' })
    void (async () => {
      const found = findingsOf(await one(findPrompt(diff, ledger, b.focus)))
      return found.length ? findingsOf(await one(confirmPrompt(diff, ledger, found))) : []
    })()
      .then((found) => { this.reviews.delete(c.id); if (found.length || r.blocked) this.reviewed(c, found) })
      .catch((e: Error) => { this.reviews.delete(c.id); this.reviewed(c, [], e.message) })
    return { id: c.id, files: files.length, held: !!r.hold }
  }

  /** 깊은 검토가 끝났다: 확인된 것이 있거나, 보류 때문에 합치기를 거절했거나, 검토가 실패했을 때만 (중앙이 깨운다) */
  protected reviewed(_c: Stored, _found: string[], _error?: string): void { /* 중앙 대화가 덮어쓴다 */ }
}
