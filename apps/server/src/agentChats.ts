/**
 * 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21 사용자 결정): 앱이 맥의 에이전트를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다.
 *
 * - 대화마다 범위(프로젝트 · 주제 · 노트)와 고치기 단계(읽기만 · 노트 고치기)가 있다. 범위 밖은 읽을 수 있지만(대화에 「범위 밖」으로 보임)
 *   고치지 못하고, 노트는 앱 MCP(edit_note)로만 고친다(수정 검토가 걸린다). 파일을 바로 쓰는 도구는 막는다.
 * - 고치는 동안 그 파일을 「잡은 파일」로 적어, 다른 대화가 같은 파일을 고치지 못하게 한다. 차례가 끝나면 푼다.
 * - 셸 명령 · 웹 · 모르는 도구는 허락 카드로 묻는다(사용자 차례). 「이 대화에서 늘」은 같은 명령에만.
 * - 동시에 도는 대화는 limit개(맥 메모리, 10/14)까지이고 넘치면 줄을 선다.
 * - 앱 고치기 대화(범위 app, 2단계 10/21, 10/22 사용자 결정 "권한 넓히기"): 앱 저장소의 따로 둔 작업 폴더(appWorktree.ts)에서
 *   파일을 고치고 명령(시험 · 형식 검사 · 화면 그림)도 돌린다. 올리기 · PR · 합치기와 앱 서비스는 앱이 맡는다(app_submit · app_checks).
 *   대화마다 자기 브랜치 · PR이라 다른 PR이 열려 있어도 올린다. 연구 프로젝트는 읽기만 한다.
 * 대화 기록은 앱 설정 폴더 agent-chats/<id>.json. 계약은 @rw/core/contract/agentChats.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { APP_RID, CENTRAL_RID, startModel } from '@rw/core/contract/agentChats'
import type { AppChecks, AppSubmitBody, AppSubmitted, AskAnswer, Attach, Chat, ChatItem, ChatMessageBody, ChatMode, ChatRow, ChatSettings, ImageIn, NewChatBody, WorkState } from '@rw/core/contract/agentChats'
import { newPrRound, notStarted, type AppWork } from './appWorktree.js'
export { appEnv } from './appWorktree.js'
import { autoCustom } from '@rw/core'
import { HERE, t } from './i18n.js'
import { WorkbenchError } from './workbench.js'
import { accountForNew, switchAccount } from './claudeAccounts.js'
export type { AgentRunner, OneShot, RunEvent, RunInput, ToolDecision, Turn } from './agentRun.js'
export { Inbox } from './agentInbox.js'
export * from './agentPolicy.js'
import { clip, withAlso } from './agentPolicy.js'
export * from './agentPrompts.js'
import { promptFor, recordDraftPrompt, sidePrompt } from './agentPrompts.js'
export { editOf, fileEditOf, partsOfPatch, todosOf } from './agentItems.js'
import { packFile } from './agentTidy.js'
export { handedAt, IDLE_MS, INTERRUPT_MS, LIVE, lastTouched, TASKS_MS, rowOf, type AgentChatsDeps, type Stored } from './agentChatsBase.js'
import { CHECK_EVERY_MS, INTERRUPT_MS, LIVE, MAX_TEXT, type Session, type Stored, keyOf, now, rowOf, userItem, wireOf } from './agentChatsBase.js'
import { AgentChatsRun } from './agentChatsRun.js'

export class AgentChats extends AgentChatsRun {
  list(rid?: string): ChatRow[] {
    const at = new Map(this.queue.map((q, i) => [q.id, i + 1])) // 줄 선 차례 (목록의 「대기 n번째」)
    return [...this.chats.values()].filter((c) => !rid || c.rid === rid).sort((a, b) => b.updated.localeCompare(a.updated)).map((c) => ({ ...rowOf(c), ...(c.state === 'queued' && at.has(c.id) && { queue: at.get(c.id) }) }))
  }
  get(id: string): Chat {
    return wireOf(this.must(id))
  }

  work(): WorkState {
    return { chats: [...this.chats.values()].filter((c) => LIVE.has(c.state)).map((c) => ({ id: c.id, rid: c.rid, title: c.title, state: c.state, scope: c.scope, claims: c.claims })) }
  }

  create(b: NewChatBody, link: { feedback?: string; bundle?: string[]; record?: { target: string; id: string }; parent?: string; urgent?: boolean } = {}, prompt?: string): Chat {
    const app = b.rid === APP_RID
    if (app && !this.deps.app) throw new WorkbenchError(404, t(`${HERE.ko}에는 앱 저장소가 없어 앱 고치기 대화를 열 수 없습니다`, `No app repository on ${HERE.en}, so app conversations are not available`))
    const other = app ? b.scope?.app : undefined
    if (other && !this.deps.apps?.[other]) throw new WorkbenchError(404, t(`${HERE.ko}에는 그 앱(${other})의 저장소가 없습니다`, `The ${other} repository is not on ${HERE.en}`))
    const cap = other ? this.deps.apps?.[other]?.profile?.maxChats : undefined
    const open = cap ? [...this.chats.values()].filter((o) => o.scope.app === other && !o.archived && !o.merged && (LIVE.has(o.state) || !!o.pr)) : []
    if (cap && open.length >= cap) throw new WorkbenchError(409, t(`${other} 대화는 한 번에 ${cap}개까지입니다 (CI 러너가 하나): ${open.map((o) => `「${o.title}」`).join(' · ')}가 끝나거나 보관한 뒤 여세요`, `At most ${cap} ${other} conversations at once (one CI runner): wait for ${open.map((o) => `"${o.title}"`).join(', ')} to finish or archive one`))
    if (!app && b.scope?.kind === 'app') throw new WorkbenchError(400, t('앱 범위는 앱 고치기 대화에만 씁니다', 'The app scope is only for app conversations'))
    if (!app) this.deps.project(b.rid) // 등록하지 않은 프로젝트면 404
    const scope = withAlso(app ? { kind: 'app', ...(other && { app: other }) } : b.scope ?? { kind: 'project' }, b.rid, (r) => this.deps.project(r)) // 함께 고칠 프로젝트는 등록한 것만 (없으면 404)
    if ((scope.kind === 'topic' || scope.kind === 'note') && !scope.target) throw new WorkbenchError(400, t('주제 · 노트 범위에는 대상이 필요합니다', 'A topic or note scope needs a target'))
    if (scope.target && (scope.target.includes('..') || path.isAbsolute(scope.target))) throw new WorkbenchError(400, t('범위 대상이 맞지 않음', 'Invalid scope target'))
    const at = now()
    const c: Stored = {
      id: `${at.slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`,
      rid: b.rid,
      title: (b.title || b.text.split('\n')[0]!).trim().slice(0, 60),
      agent: b.agent ?? 'claude-code',
      scope,
      write: b.write ?? 'notes',
      state: 'idle',
      // 계획은 Claude만 (계획 카드 = ExitPlanMode). Codex · Gemini는 수동으로
      mode: b.mode === 'plan' && b.agent && b.agent !== 'claude-code' ? 'ask' : b.mode ?? 'edit',
      model: startModel(b.agent ?? 'claude-code', b.model),
      effort: b.effort ?? 'medium',
      claims: [],
      changed: [],
      todos: [],
      created: at,
      updated: at,
      items: [],
      ...(link.feedback && { feedback: link.feedback }), ...(link.bundle && link.bundle.length > 1 && { bundle: [...link.bundle] }),
      ...(link.record && { record: { ...link.record } }), ...(link.parent && { parent: link.parent }), ...(link.urgent && { urgent: true }),
    }
    const account = accountForNew(this.deps.accounts, { rid: b.rid, agent: c.agent, feedback: link.feedback, account: b.account, app, central: b.rid === CENTRAL_RID }); if (account) c.account = account
    this.chats.set(c.id, c)
    this.start(c, b, prompt)
    return wireOf(c)
  }

  /**
   * 이어서 지시. 에이전트가 열려 있으면 바로 넘긴다: 일하는 중이면 그 차례에 섞어 읽고(Claude Code처럼), 쉬는 중이면 새 차례를 연다.
   * 줄 서 있거나 설정을 바꿔 다시 열어야 하면 다음 차례에 읽는다(줄 선 지시)
   */
  /** prompt = 에이전트에게 넘길 글이 보일 글과 다를 때 (기록 대화: 보이는 것은 기록 글, 넘기는 것은 지침까지) */
  send(id: string, m: ChatMessageBody, prompt?: string): Chat {
    const c = this.must(id), s = this.sessions.get(id)
    const p = { prompt: promptFor(c, m, prompt), ...(m.images?.length && { images: m.images }) }
    if (s && s.key === keyOf(c) && !(c.pending ?? []).length && s.inbox.push(p)) {
      if (s.idle) { clearTimeout(s.idle); s.idle = undefined }
      s.last = Date.now()
      // 쉬던 에이전트에 보낸 지시는 새 차례를 연다: 되돌릴 자리 (일하는 중에 섞여 읽힌 지시는 아니다)
      c.items.push(userItem(m, false, LIVE.has(c.state) ? undefined : this.point(c)))
      if (!LIVE.has(c.state)) c.state = 'running'
      this.touch(c)
      return wireOf(c)
    }
    if (s && !LIVE.has(c.state)) {
      // 쉬는 에이전트를 설정이 바뀌어 닫는다: 닫히면(finish) 이 지시로 다시 연다
      c.pending = [...(c.pending ?? []), p]
      c.items.push(userItem(m, false, this.point(c)))
      c.state = 'running'
      this.touch(c)
      this.close(s)
      return wireOf(c)
    }
    if (LIVE.has(c.state)) {
      c.pending = [...(c.pending ?? []), p]
      this.push(c, userItem(m, true))
      return wireOf(c)
    }
    this.start(c, m, p.prompt)
    return wireOf(c)
  }

  /** 앱이 다시 켜질 때 돌던 대화를 같은 세션으로 이어 간다 (그 사이 사용자가 손댄 대화는 그대로). 이어 간 대화 수 */
  resumeRestarted(): number {
    let n = 0
    for (const id of this.restarted.splice(0)) {
      const c = this.chats.get(id)
      if (!c || c.state !== 'stopped' || c.archived) continue
      c.restarts = (c.restarts ?? 0) + 1
      // 멈춘 차례의 마지막 지시를 함께 넘긴다 (세션을 잃었어도 무엇을 하던 중인지 안다). 줄 선 지시로 남았으면 그것을 읽으니 붙이지 않는다
      const u = (c.pending ?? []).length ? undefined : [...c.items].reverse().find((it) => it.kind === 'user'), q = u?.kind === 'user' && u.text.trim() ? `\n> ${u.text.slice(0, 2000).replace(/\n/g, '\n> ')}` : ''
      const text = t('앱이 다시 켜졌습니다. 멈춘 데서 이어서 해 주세요.', 'The app restarted. Please continue where you stopped.')
      try {
        this.send(id, { text }, q ? text + t(`\n\n멈춘 차례의 마지막 지시:${q}`, `\n\nThe last instruction of the stopped turn:${q}`) : text)
        n++
      } catch { /* 이어 가지 못하면 멈춤 그대로 (사용자가 이어서 지시한다) */ }
    }
    this.drain()
    return n
  }

  /** 오류 · 멈춤 · 앱 재시작 뒤 이어 하기 (같은 세션에 "이어서" 한 마디, 기다리던 지시가 있으면 그것과 함께) */
  resume(id: string): Chat {
    const c = this.must(id)
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('이미 일하는 중입니다', 'It is already working'))
    return this.send(id, { text: t('이어서 해 주세요.', 'Please continue.') })
  }

  /** 읽기만 · 모드 · 모델 · 생각 깊이 (다음 차례부터) */
  settings(id: string, s: ChatSettings): Chat {
    const c = this.must(id)
    if (s.write) c.write = s.write
    if (s.mode) c.mode = s.mode === 'plan' && c.agent !== 'claude-code' ? 'ask' : s.mode
    // 토글: 같이 보내면 그 값, 권한 이름만 바꾸면 그 이름의 기본값으로. 기본값과 같으면 두지 않는다
    if (s.auto) c.auto = s.auto
    else if (s.write || s.mode) delete c.auto
    if (c.auto && !autoCustom(c)) delete c.auto
    if (s.model) c.model = startModel(c.agent, s.model)
    if (s.effort) c.effort = s.effort
    if (s.account) switchAccount(c, s.account, this.deps.accounts)
    this.touch(c)
    return wireOf(c)
  }

  /** 늘 허락한 것 하나 빼기 */
  forget(id: string, label: string): Chat {
    const c = this.must(id)
    c.alwaysKeys = (c.alwaysKeys ?? []).filter((a) => a.label !== label)
    this.touch(c)
    return wireOf(c)
  }

  /** 허락 · 계획 카드에 답하기. 거절에는 할 말(note), 계획 승인에는 이어 갈 맡기는 정도(mode)를 붙일 수 있다 */
  answer(id: string, ask: string, a: AskAnswer, more: { note?: string; mode?: ChatMode } = {}): Chat {
    const c = this.must(id)
    const it = c.items.find((x): x is Extract<ChatItem, { kind: 'ask' }> => x.kind === 'ask' && x.id === ask)
    const resolve = this.asks.get(ask)
    if (!it || it.answer || !resolve) throw new WorkbenchError(409, t('이미 답했거나 없는 허락 요청입니다', 'This request was already answered or does not exist'))
    if (more.mode === 'plan') throw new WorkbenchError(400, t('계획을 승인하면 수동 · 편집 자동 수락 가운데 하나로 이어 갑니다', 'After approving a plan, continue with manual or auto-accept edits'))
    it.answer = a
    if (a === 'deny' && more.note) it.note = clip(more.note, 2000)
    if (a !== 'deny' && it.plan !== undefined && more.mode) it.mode = more.mode
    this.asks.delete(ask)
    resolve({ answer: a, ...(a === 'deny' && more.note && { note: more.note }), ...(a !== 'deny' && more.mode && { mode: more.mode }) })
    return wireOf(c)
  }

  /** 도는 동안 보내 기다리는 지시 하나 빼기 (고쳐 쓰려면 빼고 다시 보낸다) */
  unqueue(id: string, index: number): { chat: Chat; images?: ImageIn[] } {
    const c = this.must(id)
    const pending = c.pending ?? []
    if (index >= pending.length) throw new WorkbenchError(409, t('이미 읽었거나 없는 지시입니다', 'This message was already read or does not exist'))
    const [gone] = pending.splice(index, 1)
    let n = -1
    const at = c.items.findIndex((it) => it.kind === 'user' && it.queued && ++n === index)
    if (at >= 0) c.items.splice(at, 1)
    this.touch(c)
    return { chat: wireOf(c), ...(gone?.images?.length && { images: gone.images }) }
  }

  /**
   * 되돌리기 (Claude Code의 rewind): 내 지시 하나와 그 뒤 대화를 지우고, 다음 지시는 그 앞까지의 맥락으로 이어 간다.
   * 앱 고치기 대화는 작업 폴더의 파일도 그때로 되돌린다(그 뒤에 커밋했으면 하지 않는다). 노트 고침은 수정 검토에 그대로 남는다.
   * 지운 지시의 글을 돌려준다 (입력란에서 고쳐 다시 보내게)
   */
  async rewind(id: string, point: string): Promise<{ chat: Chat; text: string; attach?: Attach[]; files?: number }> {
    const c = this.must(id)
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('일하는 중에는 되돌릴 수 없습니다. 먼저 멈춰 주세요', 'Stop the conversation before rewinding'))
    const at = c.items.findIndex((it) => it.kind === 'user' && it.point === point)
    const pt = c.points?.[point]
    const it = c.items[at]
    if (!pt || !it || it.kind !== 'user') throw new WorkbenchError(409, t('여기로는 되돌릴 수 없습니다', 'Cannot rewind to this message'))
    const app = this.workOf(c)
    let files: number | undefined
    if (app?.restore && c.worktree && pt.snap && fs.existsSync(c.worktree)) files = await app.restore(c.worktree, pt.snap) // 치운 작업 폴더(11/25)면 대화만 되돌린다
    const s = this.sessions.get(id)
    if (s) this.close(s)
    c.items.splice(at)
    const left = new Set(c.items.flatMap((x) => (x.kind === 'user' && x.point ? [x.point] : [])))
    c.points = Object.fromEntries(Object.entries(c.points ?? {}).filter(([k]) => left.has(k)))
    c.pending = []
    c.claims = []
    c.changed = [...new Set(c.items.flatMap((x) => (x.kind === 'edit' ? [x.file] : [])))]
    c.sessionId = pt.session
    c.resumeAt = pt.session ? pt.resumeAt : undefined
    c.lastMark = c.resumeAt
    if (pt.snap) c.snap = pt.snap
    if (files !== undefined && app?.diff && c.worktree) {
      const now = await app.diff(c.worktree).catch(() => undefined)
      if (now) c.diffSeen = Object.fromEntries(now.map((f) => [f.file, `${f.added}/${f.removed}`]))
    }
    if (c.state === 'error' || c.state === 'stopped') c.state = 'idle'
    this.touch(c)
    return { chat: wireOf(c), text: it.text, ...(it.attach?.length && { attach: it.attach.map((a) => ({ ...a })) }), ...(files !== undefined && { files }) }
  }

  /** 제목 바꾸기 (10/28 피드백 21:19). 처음 제목은 첫 말에서 정해진다 */
  rename(id: string, title: string): Chat {
    const c = this.must(id)
    const next = title.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!next) throw new WorkbenchError(400, t('제목이 비었습니다', 'The title is empty'))
    c.title = next
    this.touch(c)
    return wireOf(c)
  }

  /** 보관함에 넣기 · 꺼내기 (지우지 않고 목록에서만 숨긴다) */
  archive(id: string, archived: boolean): Chat {
    const c = this.must(id)
    if (archived && LIVE.has(c.state)) throw new WorkbenchError(409, t('도는 대화는 보관할 수 없습니다. 먼저 멈춰 주세요', 'Stop the conversation before archiving it'))
    c.archived = archived
    const s = this.sessions.get(id)
    if (archived && s) this.close(s)
    this.touch(c)
    return wireOf(c)
  }

  stop(id: string): Chat {
    const c = this.must(id)
    const qi = this.queue.findIndex((q) => q.id === id)
    if (qi >= 0) {
      this.queue.splice(qi, 1)
      delete c.turn
      this.finish(c, 'stopped')
    }
    // 열어 둔 에이전트는 하던 차례만 끊고 맥락은 그대로 둔다 (다음 지시를 처음부터 다시 읽지 않게)
    const s = this.sessions.get(id)
    if (s?.interrupt && LIVE.has(c.state) && !(c.pending ?? []).length) {
      void this.interrupt(c, s)
      return wireOf(c)
    }
    this.aborts.get(id)?.abort()
    return wireOf(c)
  }

  private async interrupt(c: Stored, s: Session): Promise<void> {
    if (s.stopping) return
    s.stopping = true
    for (const it of c.items) if (it.kind === 'ask' && !it.answer) { it.answer = 'deny'; it.expired = true; this.asks.get(it.id)?.({ answer: 'deny' }) }
    const abort = this.aborts.get(c.id)
    const late = setTimeout(() => { if (s.stopping) abort?.abort() }, INTERRUPT_MS)
    late.unref?.()
    // 못 끊었거나 끊어도 넘긴 지시가 남아 이어 돌면 에이전트를 닫는다
    const ok = await s.interrupt!().catch(() => false)
    if (!ok) { clearTimeout(late); abort?.abort() }
  }

  remove(id: string): void {
    const c = this.must(id)
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('도는 대화는 지울 수 없습니다. 먼저 멈춰 주세요', 'Stop the conversation before deleting it'))
    this.aborts.get(id)?.abort()
    this.chats.delete(id)
    for (const f of [this.fileOf(id), packFile(this.deps.dir, id)]) fs.rmSync(f, { force: true })
    const w = this.workOf(c)
    if (c.worktree && w) void w.dispose(c.worktree, c.branch).catch(() => undefined)
  }

  /** 기록에 이어진 대화 (보관한 것도 찾는다: 한 기록에 대화 하나) */
  recordChat(rid: string, target: string, id: string): ChatRow | undefined {
    const c = this.findRecord(rid, target, id)
    return c && rowOf(c)
  }

  /** 기록을 완료하면 그 대화를 보관함으로 (도는 중이면 두고, 다시 열어 이어 쓰면 forRecord가 꺼낸다) */
  archiveRecord(rid: string, target: string, id: string): void {
    const c = this.findRecord(rid, target, id)
    if (!c || c.archived || LIVE.has(c.state)) return
    this.archive(c.id, true)
  }

  private findRecord(rid: string, target: string, id: string): Stored | undefined {
    return [...this.chats.values()].find((c) => c.rid === rid && c.record?.target === target && c.record.id === id)
  }

  /**
   * 기록의 질문 · 지시를 그 기록의 대화에 넘긴다 (10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ). 처음이면 대화를 열고(질문은 읽기만, 지시는 노트 고치기 → 수정 검토),
   * 있으면 사용자가 기록에 이어 쓴 글을 그 대화에 보낸다. count = 지금 기록의 글 수: 이미 넘긴 글이면 아무것도 하지 않는다(null).
   * 차례가 잘 끝나면 마지막 답을 deps.recordAnswer가 기록에 적는다. 멈추면 적지 않고 맥락은 그대로 둔다.
   */
  forRecord(rid: string, record: { target: string; id: string }, o: { kind: '질문' | '지시'; title: string; shown: string; first: string; reply?: { shown: string; prompt: string }; count: number; agent?: NewChatBody['agent'] }): Chat | null {
    const c = this.findRecord(rid, record.target, record.id)
    if (c && c.recordSent === o.count) return null
    if (!c) {
      // 대화에는 기록 글만 보이고, 에이전트는 지침까지 받는다
      const made = this.create({ rid, text: o.shown, title: o.title, write: o.kind === '질문' ? 'read' : 'notes', mode: 'edit', ...(o.agent && { agent: o.agent }) }, { record }, o.first)
      const s = this.must(made.id)
      s.recordSent = o.count
      s.recordTurn = true
      this.write(s)
      return wireOf(s)
    }
    if (c.archived) { c.archived = false }
    c.recordSent = o.count
    c.recordTurn = true
    return o.reply ? this.send(c.id, { text: o.reply.shown }, o.reply.prompt) : this.send(c.id, { text: o.shown }, o.first)
  }

  /** 앱 고치기 대화: 바뀐 것을 커밋해 올리고 PR을 연다 (에이전트의 app_submit. 허락 판정은 judge가 이미 했다) */
  async appSubmit(id: string, b: AppSubmitBody): Promise<AppSubmitted> {
    const { c, w } = this.appOf(id)
    const pr = await w.submit(c.worktree!, c.branch!, { title: b.title, body: b.body })
    c.pr = { number: pr.number, url: pr.url }; c.ci = 'pending'; newPrRound(c)
    this.touch(c)
    return pr
  }

  /**
   * 앱 고치기 대화: 그 PR의 CI (에이전트의 app_checks). wait분(최대 10) 동안 끝날 때까지 기다릴 수 있다:
   * 에이전트가 sleep으로 기다리거나 되풀이해 묻느라 차례를 쓰지 않게 (10/22). 대화를 멈추면 그때까지의 결과를 돌려준다
   */
  async appChecks(id: string, wait = 0, every = CHECK_EVERY_MS): Promise<AppChecks> {
    const { c, w } = this.appOf(id)
    const until = Date.now() + Math.min(Math.max(wait, 0), w.profile?.ciWaitMin ?? 10) * 60_000
    for (;;) {
      const r = await w.checks(c.worktree!, c.branch!)
      if (r.done || Date.now() + every > until || !this.aborts.has(id)) return wait && !r.done ? notStarted(r, w.profile?.selfHosted) : r
      await new Promise((ok) => setTimeout(ok, every))
    }
  }

  private appOf(id: string): { c: Stored; w: AppWork } {
    const c = this.must(id)
    const w = this.workOf(c)
    if (!w) throw new WorkbenchError(400, t('앱 고치기 대화가 아닙니다', 'Not an app conversation'))
    if (!c.worktree || !c.branch) throw new WorkbenchError(409, t('작업 폴더를 아직 만들지 않았습니다', 'The work folder is not ready yet'))
    return { c, w }
  }

  /** 테스트 · 끄기: 도는 차례를 모두 멈춘다 */
  stopAll(): void {
    this.queue.length = 0
    for (const a of this.aborts.values()) a.abort()
  }

  /**
   * 곁 질문 (Claude Code의 /btw): 에이전트를 멈추거나 그 맥락에 넣지 않고, 작은 모델이 이 대화의 짧은 요약만 보고 답한다.
   * 긴 대화에서 "이건 뭐야?" 한 줄에 앞 내용 전체를 다시 읽지 않게 (10/22)
   */
  side(id: string, q: string): Chat {
    const c = this.must(id)
    const ask = this.deps.runner.side
    if (!ask) throw new WorkbenchError(404, t(`${HERE.ko}에서는 곁 질문을 쓸 수 없습니다`, `Side questions are not available on ${HERE.en}`))
    const it: Extract<ChatItem, { kind: 'side' }> = { kind: 'side', at: now(), q: clip(q, 4000) }
    this.push(c, it)
    void ask({ prompt: sidePrompt(c, q), cwd: this.cwdOf(c) })
      .then((a) => { it.answer = clip(a.trim() || t('(답이 비었습니다)', '(empty answer)'), MAX_TEXT) })
      .catch((e: Error) => { it.error = clip(e.message, 500) })
      .finally(() => this.touch(c))
    return wireOf(c)
  }

  /** 「기록으로 남기기」: 작은 모델이 대화를 읽고 기록 초안을 쓴다 (대화의 맥락에는 들지 않는다) */
  async recordDraft(id: string, place: string): Promise<{ text: string }> {
    const c = this.must(id)
    const ask = this.deps.runner.side
    if (!ask) throw new WorkbenchError(404, t(`${HERE.ko}에서는 기록 초안을 쓸 수 없습니다`, `Record drafts are not available on ${HERE.en}`))
    if (!c.items.some((it) => it.kind === 'text' && !it.sub)) throw new WorkbenchError(400, t('아직 에이전트의 답이 없어 남길 것이 없습니다', 'Nothing to keep yet: the agent has not answered'))
    const text = (await ask({ prompt: recordDraftPrompt(c, place), cwd: this.cwdOf(c) })).trim()
    if (!text) throw new WorkbenchError(502, t('초안이 비었습니다. 다시 눌러 주세요', 'The draft came back empty. Try again'))
    return { text: clip(text, 4000) }
  }

}