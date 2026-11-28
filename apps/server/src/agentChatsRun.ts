/** 에이전트 대화: 차례 하나를 돌리는 run (agentChats.ts 머리 설명 참고) */
import crypto from 'node:crypto'
import path from 'node:path'
import { CENTRAL_RID, type Reviewer } from '@rw/core/contract/agentChats'
import type { Chat, ChatItem, ImageIn } from '@rw/core/contract/agentChats'
import { appEnv, personalReadable } from './appWorktree.js'
import { autoOf } from '@rw/core'
import { fillReview, reviewerName, reviewerOf } from './agentReviewers.js'
import { HERE, t } from './i18n.js'
import { WorkbenchError } from './workbench.js'
import { accountEnv } from './claudeAccounts.js'
import type { RunInput, ToolDecision, Turn } from './agentRun.js'
import { Inbox } from './agentInbox.js'
import { askBase, matchOf } from './agentAskRestore.js'
import { describeStep, FILE_WRITE_TOOLS, judge, MCP, pathOf, PLAN_TOOL, posix, str, type PolicyCtx } from './agentPolicy.js'
import { appBriefFor, briefFor, reviewPrompt } from './agentPrompts.js'
import { commandEdits, editOf, fileEditOf, todosOf } from './agentItems.js'
import { splitFixMark } from './recordFix.js'
import { AgentChatsBase, type Answer, LIVE, MAX_TEXT, type Session, type Stored, keyOf, now, wireOf } from './agentChatsBase.js'

/** 차례 하나 돌리기와 끝난 뒤 처리 (agentChats.ts에서 나눔) */
export abstract class AgentChatsRun extends AgentChatsBase {
  /** 다른 에이전트의 검토 (agentReviewers.ts): 고른 검토자마다 따로 읽기만 하며 묻고 카드를 하나씩 붙인다. 읽는 중인 검토자는 건너뛴다 */
  review(id: string, auto = false, by: readonly Reviewer[] = ['codex']): Chat {
    const c = this.must(id)
    const can = by.filter((a) => reviewerOf(a, this.deps))
    if (!can.length) throw new WorkbenchError(404, t(`${HERE.ko}에서는 ${by.map(reviewerName).join(' · ')} 검토를 쓸 수 없습니다`, `${by.map(reviewerName).join(', ')} review is not available on ${HERE.en}`))
    const free = can.filter((a) => !c.items.some((it) => it.kind === 'review' && it.by === a && it.text === undefined && !it.error))
    if (!free.length) throw new WorkbenchError(409, t('이미 검토하는 중입니다', 'A review is already running'))
    const { prompt, edits } = reviewPrompt(c)
    const cwd = this.cwdOf(c)
    for (const a of free) {
      const it: Extract<ChatItem, { kind: 'review' }> = { kind: 'review', at: now(), by: a, edits, ...(auto && { auto }) }
      this.push(c, it); fillReview(reviewerOf(a, this.deps)!, prompt, cwd, it, () => this.touch(c))
    }
    return wireOf(c)
  }

  /**
   * 에이전트를 열어 첫 지시를 넘기고, 닫힐 때까지 여러 차례를 받는다. 차례가 끝나면(result) 쉬는 상태로 두고 열어 둔다:
   * 다음 지시는 send가 inbox로 바로 넘기고, 뒤에서 돌던 명령이 끝나 에이전트가 스스로 이어 가면 다시 일하는 중이 된다.
   */
  protected async run(c: Stored, prompt: string, images?: ImageIn[]): Promise<void> {
    this.startedAt.set(c.id, Date.now())
    const abort = new AbortController()
    this.aborts.set(c.id, abort)
    const inbox = new Inbox<Turn>()
    const session: Session = { inbox, key: keyOf(c), last: Date.now() }
    this.sessions.set(c.id, session)
    abort.signal.addEventListener('abort', () => this.close(session), { once: true })
    c.state = 'running'
    c.planOk = false
    c.live = true
    this.touch(c)
    let ended: 'idle' | 'stopped' | 'error' = 'idle'
    // 피드백 대화의 한 차례 한도 (설정 › 에이전트): 넘으면 멈춘다
    const minutes = c.feedback ? this.deps.settings?.().minutes : undefined
    let overtime = false
    let limit: NodeJS.Timeout | undefined
    const turnStart = () => {
      if (limit) clearTimeout(limit)
      limit = minutes ? setTimeout(() => { overtime = true; abort.abort() }, minutes * 60_000) : undefined
    }
    turnStart()
    // 앱 고치기 대화: 이번 차례에 고치기 도구로 바꾼 파일 (명령으로 바꾼 파일과 가르려고)
    let touched = new Set<string>()
    try {
      const app = this.workOf(c)
      let p: { repo: string; title: string }
      if (app) {
        const w = await app.prepare(c.id)
        if (c.worktree !== w.dir || c.branch !== w.branch) { c.worktree = w.dir; c.branch = w.branch; this.touch(c) }
        p = { repo: w.dir, title: app.profile?.name ?? 'Emergence Workbench' }
        // 처음 연 대화: 첫 지시의 되돌릴 자리에 작업 폴더를 찍어 둔다
        if (app.snapshot && !c.snap) {
          c.snap = await app.snapshot(w.dir).catch(() => undefined)
          if (c.snap) for (const v of Object.values(c.points ?? {})) v.snap ??= c.snap
        }
      } else p = this.deps.project(c.rid)
      // 앱 고치기 대화는 작업 폴더만, 피드백을 맡았으면 피드백 폴더(그림)와 안내가 가리키는 개인 규칙(personalReadable)도 묻지 않고 읽는다
      const readable = app ? (c.feedback ? [...(this.deps.feedback ? [this.deps.feedback.dir] : []), ...personalReadable(app.rules)] : []) : this.deps.readable().filter((d) => d !== p.repo)
      const mode = c.mode
      const ctx: PolicyCtx = { rid: c.rid, write: c.write, mode, planOk: false, scope: c.scope, repo: p.repo, readable, claimedBy: (f, r) => this.claimedBy(c.id, f, r ?? c.rid), auto: () => autoOf({ write: c.write, mode: ctx.mode, ...(c.auto && { auto: c.auto }) }), always: (k) => !!c.alwaysKeys?.some((a) => a.key === k) }
      const claim = (file?: string) => {
        if (!file) return
        if (!c.claims.includes(file)) c.claims.push(file)
        if (!c.changed.includes(file)) c.changed.push(file)
      }
      const edited = (tool: string, input: Record<string, unknown>) => {
        if (app && (FILE_WRITE_TOOLS as readonly string[]).includes(tool)) {
          const file = posix(path.relative(p.repo, path.resolve(p.repo, pathOf(input))))
          const e = fileEditOf(tool, input)
          // 앞뒤 글을 모르는 고침(Codex의 패치 등)은 차례 끝의 git diff로 보인다
          if (e.added || e.removed) { touched.add(file); this.push(c, { kind: 'edit', at: now(), file, ...e }) }
          return
        }
        if (tool !== `${MCP}edit_note`) return
        this.push(c, { kind: 'edit', at: now(), file: str(input.file), ...editOf(input) })
      }
      const others = [...this.chats.values()].filter((o) => o.id !== c.id && o.rid === c.rid && LIVE.has(o.state))
      const canUseTool = async (tool: string, input: Record<string, unknown>): Promise<ToolDecision> => {
        const v = judge(ctx, tool, input)
        if (v.kind === 'allow') {
          if (v.claim) { claim(v.claim); edited(tool, input) }
          return { allow: true }
        }
        if (v.kind === 'deny') {
          this.push(c, { kind: 'blocked', at: now(), tool: tool.replace(MCP, ''), reason: v.reason })
          return { allow: false, message: v.message }
        }
        // 허락한 일: 잡기 · 고친 파일. 우회는 돌릴 때마다 대화에 남긴다 (언제 · 어느 대화 · 무슨 명령)
        const ran = (how: 'once' | 'always') => { claim(v.claim); edited(tool, input); if (v.bypass !== undefined) this.push(c, { kind: 'bypass', at: now(), command: v.bypass, how }) }
        if (c.alwaysKeys?.some((a) => a.key === v.key)) {
          ran('always')
          return { allow: true }
        }
        // 앱이 다시 켜지기 전에 물은 카드에 사용자가 허락한 호출: 글자까지 같은 것 하나만 묻지 않고 (11/28). 판정이 막는 일(deny)은 여기 오지 않는다
        const match = matchOf(tool, input)
        if (c.preAllowed?.match === match && v.plan === undefined) {
          delete c.preAllowed
          ran('once'); this.touch(c)
          return { allow: true }
        }
        const id = crypto.randomBytes(6).toString('hex')
        // 다시 켜져도 카드를 남기려고 물을 때의 상태를 적어 둔다 (agentAskRestore.ts)
        const base = await askBase(p.repo, c.ci).catch(() => undefined)
        // 상태를 적는 동안 멈춤 · 한도 · 닫기가 왔으면 카드를 띄우지 않는다 (그 사이 차례가 이미 끝났을 수 있다)
        if (abort.signal.aborted || this.closing) return { allow: false, message: 'The turn was stopped.' }
        c.askMeta = { ...c.askMeta, [id]: { match, key: v.key, label: v.label, ...(v.turnOn && { turnOn: v.turnOn }), ...(v.plan !== undefined && { plan: true as const }), ...(base && { base }) } }
        const answer = new Promise<Answer>((resolve) => {
          this.asks.set(id, resolve)
          abort.signal.addEventListener('abort', () => resolve({ answer: 'deny' }), { once: true })
        })
        c.state = 'waiting'
        this.push(c, { kind: 'ask', at: now(), id, tool: tool.replace(MCP, ''), summary: v.summary, ...(v.plan !== undefined && { plan: v.plan }), ...(v.does && { does: v.does }), ...(v.once && { once: true }) })
        const got = await answer
        this.asks.delete(id)
        // 앱이 닫히는 중: 카드를 거절로 닫지 않고 남긴다. 다시 켜진 뒤 같은 카드를 띄우고, 답하면 같은 세션으로 이어 간다
        if (this.closing) return { allow: false, message: 'The app is restarting. Wait for the user.' }
        if (c.askMeta?.[id]) { const { [id]: _, ...rest } = c.askMeta; c.askMeta = Object.keys(rest).length ? rest : undefined }
        const a = got.answer
        const it = c.items.find((x) => x.kind === 'ask' && x.id === id)
        if (it && it.kind === 'ask' && !it.answer) { it.answer = a; if (abort.signal.aborted) it.expired = true }
        // 계획 카드의 「늘」은 이 차례만 (계획마다 다시 본다)
        // 「늘」: 토글이 있는 일은 그 토글을 켜고(편집은 편집 자동 수락으로), 실행은 프로그램마다 기억한다. 삭제 · 외부는 「늘」이 없다
        if (a === 'always' && v.plan === undefined && !v.once) {
          if (v.turnOn === 'edit') { ctx.mode = 'edit'; c.mode = 'edit' }
          else if (v.turnOn) c.auto = { ...autoOf({ write: c.write, mode: ctx.mode, ...(c.auto && { auto: c.auto }) }), [v.turnOn]: true }
          else c.alwaysKeys = [...(c.alwaysKeys ?? []), { key: v.key, label: v.label }]
        }
        if (c.state === 'waiting') c.state = 'running'
        if (a !== 'deny') {
          if (v.plan !== undefined) {
            ctx.planOk = true
            c.planOk = true
            // 승인하며 고른 맡기는 정도로 이어 간다 (수동 = 노트도 하나씩 묻기, 고치기 바로)
            if (got.mode) { ctx.mode = got.mode; c.mode = got.mode }
          }
          ran(a === 'always' ? 'always' : 'once')
        }
        this.touch(c)
        const said = got.note ? ` The user said: ${got.note}` : ''
        if (a === 'deny' && v.plan !== undefined) return { allow: false, message: `The user did not approve this plan.${said || ' Ask what to change.'} Revise the plan and call ExitPlanMode again. Change nothing yet.` }
        return a === 'deny' ? { allow: false, message: got.note ? `The user declined this and said what to do instead: ${got.note}` : 'The user declined this. Do not try it again in another way; continue without it or ask the user.' } : { allow: true }
      }
      const input: RunInput = {
        prompt,
        ...(images?.length && { images }),
        mode,
        model: c.model,
        effort: c.effort,
        sessionId: c.sessionId,
        cwd: p.repo,
        extraDirs: app ? [] : this.deps.extraDirs(),
        brief: app
          ? appBriefFor({ branch: c.branch ?? '', write: c.write, mode, rules: app.rules, ...(app.profile?.id && { other: app.profile }), feedback: !!c.feedback, agent: c.agent, parent: !!c.parent })
          : briefFor({ rid: c.rid, title: p.title, scope: c.scope, write: c.write, mode, others: others.map((o) => ({ title: o.title, claims: o.claims })), agent: c.agent, parent: !!c.parent }),
        write: c.write,
        ...(app ? { appChat: c.id } : c.rid === CENTRAL_RID && { central: true }), ...(c.rid !== CENTRAL_RID && { chat: c.id }), env: { ...(app && appEnv(c.id)), ...accountEnv(this.deps.accounts, c) },
        canUseTool,
        signal: abort.signal,
        inbox,
        ...(c.sessionId && c.resumeAt && { resumeAt: c.resumeAt }),
        control: (x) => { session.interrupt = x.interrupt; session.unread = x.unread },
      }
      for await (const e of this.runnerFor(c)(input)) {
        session.last = Date.now()
        if (e.type === 'session') { c.sessionId = e.id; delete c.resumeAt; this.write(c); continue }
        if (e.type === 'mark') { c.lastMark = e.uuid; continue }
        if (e.type === 'delta') { this.drafting(c, e.text); continue }
        if (e.type === 'tasks') { if ((c.tasks ?? 0) !== e.count) { c.tasks = e.count || undefined; this.touch(c) } continue }
        if (e.type === 'status') { if (!!c.compacting !== e.compacting) { c.compacting = e.compacting || undefined; this.touch(c) } continue }
        // 쉬던 에이전트가 스스로 이어 감 (뒤에서 돌던 명령이 끝남 등) 또는 쉬는 동안 받은 지시
        if (!LIVE.has(c.state)) {
          c.state = 'running'
          if (session.idle) { clearTimeout(session.idle); session.idle = undefined }
          turnStart()
          this.touch(c)
        }
        if (e.type === 'compact') {
          c.compacting = undefined
          this.push(c, { kind: 'compact', at: now(), auto: e.auto, before: e.before, ...(e.after !== undefined && { after: e.after }) })
          continue
        }
        if (e.type === 'text') {
          if (!e.sub) this.undraft(c)
          if (e.text.trim()) this.push(c, { kind: 'text', at: now(), text: e.text.slice(0, MAX_TEXT), ...(e.sub && { sub: true }) })
          continue
        }
        if (e.type === 'think') { if (e.text.trim()) this.push(c, { kind: 'think', at: now(), text: e.text.trim().slice(0, MAX_TEXT) }); continue }
        if (e.type === 'tool') {
          if (e.tool === 'TodoWrite') { this.setTodos(c, todosOf(e.input)); continue }
          if (e.tool === PLAN_TOOL || e.tool === 'EnterPlanMode') continue
          const s = describeStep(ctx, e.tool, e.input)
          this.push(c, { kind: 'step', at: now(), ...s, tool: s.tool.replace(MCP, ''), ...(e.sub && { sub: true }) })
          continue
        }
        if (e.type === 'result') {
          this.undraft(c)
          delete c.preAllowed // 다시 켠 뒤 허락한 호출은 이어 간 그 차례에서만
          if (limit) clearTimeout(limit)
          limit = undefined
          if (app && c.write !== 'read') await commandEdits(c, app, p.repo, touched)
          // 다음 지시의 되돌릴 자리
          if (app?.snapshot) c.snap = await app.snapshot(p.repo).catch(() => c.snap)
          touched = new Set()
          this.push(c, { kind: 'result', at: now(), ok: e.ok, ...(e.cost !== undefined && { cost: e.cost }), ...(e.seconds !== undefined && { seconds: e.seconds }), ...(e.tokens && { tokens: e.tokens }), ...(e.context && { context: e.context }) })
          // 멈춤으로 끊긴 차례: 오류가 아니다. 에이전트는 열어 두어 다음 지시가 맥락을 이어 간다
          if (session.stopping) { session.stopping = false; this.turnEnd(c, session, 'stopped'); continue }
          if (!e.ok && e.error) this.push(c, { kind: 'error', at: now(), text: e.error.slice(0, MAX_TEXT) })
          // 실패한 차례는 에이전트를 닫는다 (이어 하기 · 다음 지시는 새로 열어 같은 세션을 잇는다)
          if (!e.ok) { ended = 'error'; this.close(session); continue }
          this.turnEnd(c, session)
        }
      }
      if (abort.signal.aborted) ended = 'stopped'
    } catch (e) {
      if (abort.signal.aborted) ended = 'stopped'
      else {
        ended = 'error'
        c.items.push({ kind: 'error', at: now(), text: (e instanceof Error ? e.message : String(e)).slice(0, MAX_TEXT), crash: true }) // 프로세스가 비정상으로 끝남: 중앙이 알린다 (agentCrash.ts)
      }
    } finally {
      if (limit) clearTimeout(limit)
      if (overtime) c.items.push({ kind: 'error', at: now(), text: t(`한 차례 한도 ${minutes}분을 넘어 멈췄습니다. 이어서 지시하면 다시 시작합니다`, `Stopped after the ${minutes}-minute limit. Send a message to continue`) })
      this.aborts.delete(c.id)
      this.close(session)
      if (this.sessions.get(c.id) === session) this.sessions.delete(c.id)
      // 에이전트가 읽지 못하고 닫힌 지시(실행기가 가져갔지만 읽지 않은 것 · inbox에 남은 것)는 다음에 연 에이전트가 먼저 읽는다
      const left = [...(session.unread?.() ?? []), ...inbox.drain()]
      if (left.length) {
        c.pending = [...left, ...(c.pending ?? [])]
        // 화면에는 「다음에 보냄」으로 (마지막에 보낸 것들이다)
        let n = left.length
        for (let i = c.items.length - 1; i >= 0 && n > 0; i--) {
          const it = c.items[i]!
          if (it.kind === 'user' && !it.queued) { it.queued = true; n-- }
        }
      }
      delete c.live
      delete c.tasks
      delete c.compacting
      this.undraft(c)
      // 앱이 닫히는 중이면 답 없는 카드를 남긴다 (다시 켜진 뒤 keepAsks가 띄운다). 아니면 닫고 적어 둔 것도 지운다
      if (!this.closing) {
        for (const it of c.items) if (it.kind === 'ask' && !it.answer) { it.answer = 'deny'; it.expired = true; this.asks.delete(it.id) }
        delete c.askMeta
      }
      delete c.preAllowed // 다시 켠 뒤 허락한 호출은 이어 간 그 차례에서만 (result 없이 끝나도)
      this.finish(c, ended)
    }
  }

  /** 차례 하나가 잘 끝남: 쉬는 상태로 두고 에이전트는 열어 둔다. 설정을 바꿔 기다리는 지시가 있으면 닫고 다시 연다(finish) */
  protected turnEnd(c: Stored, s: Session, state: 'idle' | 'stopped' = 'idle'): void {
    c.state = state
    c.claims = []
    if (state === 'idle') delete c.restarts
    if (c.record && c.recordTurn) {
      // 멈춘 차례는 기록에 적지 않는다 (사용자가 이어 쓰거나 대화에서 이어 하면 다시 넘긴다)
      c.recordTurn = false
      if (state === 'idle') this.writeRecordAnswer(c)
    }
    // 저절로 검토 (설정 › 에이전트): Claude가 이번 차례에 파일을 고쳤으면
    if (state === 'idle' && c.agent === 'claude-code' && this.deps.review && this.deps.settings?.().review === 'edits' && c.items.slice(c.items.map((x) => x.kind).lastIndexOf('user')).some((x) => x.kind === 'edit')) try { this.review(c.id, true) } catch { /* 검토 중이면 건너뜀 */ }
    this.touch(c)
    if ((c.pending ?? []).length) { this.close(s); return }
    this.idleLater(c, s)
    this.next()
  }

  /** 기록 대화의 이번 차례(마지막 내 지시 뒤) 답: 주 에이전트의 마지막 글과 고친 곳 */
  protected writeRecordAnswer(c: Stored): void {
    if (!c.record || !this.deps.recordAnswer) return
    let from = c.items.length; while (from > 0 && c.items[from - 1]!.kind !== 'user') from--
    const turn = c.items.slice(from)
    const text = [...turn].reverse().find((it): it is Extract<ChatItem, { kind: 'text' }> => it.kind === 'text' && !it.sub)?.text.trim()
    const edits = turn.filter((it): it is Extract<ChatItem, { kind: 'edit' }> => it.kind === 'edit').map((it) => ({ file: it.file, added: it.added, removed: it.removed }))
    if (!text && !edits.length) return
    const fix = splitFixMark(text ?? ''); c.needsEdit = (fix.needs && c.write === 'read') || undefined
    try { this.deps.recordAnswer(c.rid, c.record, fix.text, edits) } catch (e) {
      c.items.push({ kind: 'error', at: now(), text: t(`답을 기록에 적지 못했습니다: ${(e as Error).message}`, `Could not write the answer to the record: ${(e as Error).message}`).slice(0, MAX_TEXT) })
    }
  }
}
