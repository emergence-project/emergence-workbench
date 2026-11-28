/** 에이전트 대화의 바탕: 저장 모양 · 상수 · 상태와 줄 (agentChats.ts 머리 설명 참고) */
import { type AskMeta, sinceOf } from './agentAskRestore.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { APP_RID, startModel } from '@rw/core/contract/agentChats'
import type { AskAnswer, CentralOpenBody, Chat, ChatItem, ChatMessageBody, ChatMode, ChatRow, ImageIn, ModelChoice, Todo } from '@rw/core/contract/agentChats'
import type { AppWork, Snap } from './appWorktree.js'
import { agentAsks, type AgentSettings } from '@rw/core'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'
import { FRESH_MS } from './appMemory.js'
import type { AccountBook } from './claudeAccounts.js'
import type { AgentRunner, OneShot, Turn } from './agentRun.js'
import { Inbox } from './agentInbox.js'
import { clip } from './agentPolicy.js'
import { promptFor } from './agentPrompts.js'
import { unpack } from './agentTidy.js'
import { lastTouched } from './feedbackClaims.js'

export type Stored = Omit<Chat, 'always' | 'added' | 'removed' | 'wait' | 'archived'> & {
  sessionId?: string
  /** 늘 허락한 것: 판정 열쇠와 보일 이름 */
  alwaysKeys?: { key: string; label: string }[]
  /** 일하는 중에 받은 지시 (다음 차례에 함께 읽는다) */
  pending?: { prompt: string; images?: ImageIn[] }[]
  /** 이번 차례의 계획을 승인했는지 */
  planOk?: boolean
  archived?: boolean
  /** 보관하며 압축해 둔 원문 줄 수 (agentTidy.ts): 열면 다시 푼다 */ packed?: number
  /** 마지막으로 지시에 붙인 사용자 화면 한 줄 (promptFor: 바뀔 때만 다시 붙인다) */ view?: string
  /** 앱 고치기 대화의 작업 폴더 */ worktree?: string
  /** 피드백 대화: CI가 빨개 실패 기록을 다시 보낸 횟수와 마지막으로 본 실패 (같은 실패를 두 번 보내지 않게) */
  ciRetries?: number
  ciSeen?: string
  /** 앱 고치기 대화: 마지막으로 본 작업 폴더의 바뀐 줄 수 (파일 → "더한/뺀"). 명령으로 고친 파일을 찾으려고 */
  diffSeen?: Record<string, string>
  /** 되돌릴 자리: 차례를 시작한 내 지시(point)마다 그 앞 대화의 끝과 작업 폴더 */
  points?: Record<string, Point>
  /** 주 에이전트의 마지막 메시지 (다음 지시의 되돌릴 자리) */
  lastMark?: string
  /** 앱 고치기 대화: 지난 차례가 끝났을 때 작업 폴더 */
  snap?: Snap
  /** 되돌린 뒤 다음 실행: sessionId의 이 메시지까지만 잇는다 */
  resumeAt?: string
  /** 기다리는 허락 · 계획 카드마다 다시 켠 뒤 이어 가는 데 필요한 것 (agentAskRestore.ts, 화면에는 보내지 않음) */
  askMeta?: Record<string, AskMeta>
  /** 다시 켠 뒤 남은 카드에 허락한 호출: 글자까지 같은 호출 하나만 묻지 않고 통과한다 (차례가 끝나면 지움) */
  preAllowed?: { match: string }
  /** 앱이 다시 켜져 저절로 이어 간 횟수 (차례가 잘 끝나면 지운다. 같은 대화가 재시작마다 되풀이되지 않게) */
  restarts?: number
  /** 줄 서서 기다리는 차례 (앱이 다시 켜져도 사용자의 지시가 사라지지 않게 파일에 둔다, 11/19) · 중앙이 급히 연 앱 고치기 (줄 · 메모리와 상관없이 연다) */
  turn?: { prompt: string; images?: ImageIn[] }; urgent?: boolean
  /** 기록 대화: 마지막으로 넘긴 기록 글의 수 (같은 글을 두 번 넘기지 않게), 지금 차례가 기록에서 왔는지 (끝나면 답을 기록에 적는다) */
  recordSent?: number
  recordTurn?: boolean; /** 기록 대화: 마지막 답이 고치는 일이라고 표시함 (recordFix.ts) */ needsEdit?: boolean
  /** 중앙 대화: 남은 메모리가 모자라 기다리는 앱 고치기 (appMemory.ts). 메모리가 풀리거나 하나가 끝나면 agentCentral.ts가 차례로 연다 */
  held?: (CentralOpenBody & { at?: string })[]
  ci?: 'pending' | 'failed' | 'passed' // 중앙의 앱 하위 대화: PR 검사 (올리면 pending, tickCentral이 1분마다 고친다)
  /** 앱 고치기 · 피드백 대화: 끝나서 저절로 보관했는지 (한 번만. 사용자가 꺼내면 다시 넣지 않는다) */
  closed?: boolean
  /** 피드백 대화: 같은 항목을 이 대화에 다시 맡긴 시각 (코멘트마다 새 대화를 열지 않고 이어 쓴다. 이 시각 뒤의 글만 다시 맡긴다) */
  handed?: string
}

/** 피드백 대화가 그 항목을 마지막으로 맡은 시각 (이어 맡았으면 그때, 아니면 연 때) */
export const handedAt = (c: Pick<Stored, 'created' | 'handed'>): number => new Date(c.handed ?? c.created).getTime()

/** 내 지시 하나 앞으로 되돌릴 때 쓰는 것. session이 없으면 처음부터 */
export interface Point { session?: string; resumeAt?: string; snap?: Snap }

/** 열어 둔 에이전트 하나 (대화마다 하나) */
export interface Session {
  inbox: Inbox<Turn>
  /** 연 때의 설정 (모드 · 모델 · 생각 깊이 · 고치기 단계). 바뀌면 다음 지시 전에 닫고 다시 연다 */
  key: string
  idle?: NodeJS.Timeout
  /** 마지막으로 무엇이 오간 때 (뒤에서 도는 명령이 있어도 너무 오래 열어 두지 않게) */
  last: number
  /** 하던 차례만 끊기 · 가져갔지만 읽지 않은 지시 (실행기가 주면) */
  interrupt?: () => Promise<boolean>; unread?: () => Turn[]
  /** 멈춤을 눌러 차례를 끊는 중: 다음 result는 오류가 아니라 멈춤이다 */
  stopping?: boolean
}

/** 멈춤 뒤 이만큼 기다려도 차례가 끝나지 않으면 에이전트를 닫는다 */
export const INTERRUPT_MS = 15_000

/** 차례가 끝난 뒤 에이전트를 열어 두는 시간, 뒤에서 명령이 도는 동안 열어 두는 최대 시간 */
export const IDLE_MS = 10 * 60_000
/** 쓰는 중인 글을 화면에 보내는 간격 */
export const DRAFT_MS = 300
/** app_checks가 기다리는 동안 CI를 다시 보는 간격 */
export const CHECK_EVERY_MS = 20_000
export const TASKS_MS = 60 * 60_000
export const keyOf = (c: Pick<Stored, 'mode' | 'model' | 'effort' | 'write' | 'account'>) => `${c.mode}|${c.model}|${c.effort}|${c.write}|${c.account ?? ''}`

export { lastTouched }

/** 카드에 받은 답 (거절의 할 말, 계획 승인 뒤 맡기는 정도) */
export type Answer = { answer: AskAnswer; note?: string; mode?: ChatMode }

export const MAX_ITEMS = 400
export const MAX_TEXT = 8000
export const now = () => new Date().toISOString()
export const LIVE = new Set(['running', 'waiting', 'queued'])
/** 앱이 다시 켜질 때 같은 대화를 저절로 이어 가는 횟수 (차례가 잘 끝나기 전까지) */
export const RESTART_RESUMES = 2

export interface AgentChatsDeps {
  dir: string
  /** Claude 대화의 실행기, others = Codex · Gemini (ACP, 없으면 runner가 모두 맡는다: 시험) */
  runner: AgentRunner
  others?: Partial<Record<'codex' | 'gemini', AgentRunner>>
  /** 동시에 도는 대화 수의 상한 (맥이면 컴퓨터 크기로, appMemory.ts의 chatCap) */
  limit: number
  /** 상한 안에서 하나 더 시작해도 되는가 (남은 메모리, chatRoom. live = 일하는 수, fresh = 그 가운데 막 시작한 수). 없으면 상한까지 */
  room?: (live: number, fresh: number) => boolean
  /** 프로젝트의 저장소와 이름 */
  project: (rid: string) => { repo: string; title: string }
  /** 묻지 않고 읽는 폴더 (공용 라이브러리 · 등록한 다른 프로젝트) */
  readable: () => string[]
  /** 에이전트가 처음부터 함께 보는 폴더 (공용 라이브러리) */
  extraDirs: () => string[]
  /** 대화가 바뀌면 (화면 알림) */
  notify: (chat: ChatRow) => void
  /** 쓰는 중인 글을 화면에 (대화 파일은 쓰지 않는다) */
  draft?: (chat: Pick<ChatRow, 'id' | 'rid'>, text: string) => void
  /** 앱 고치기 대화의 작업 폴더와 PR (앱 저장소가 있는 맥에서만) */
  app?: AppWork
  /** 앱 고치기 대화가 고칠 수 있는 다른 앱 (id → 작업 폴더와 PR, 이 앱 저장소 옆에 받아 둔 것만, 11/20) */
  apps?: Record<string, AppWork>
  /**
   * 앱 피드백 폴더 (맡기기 · 처리 기록). written = 처리 기록을 적은 뒤 (저절로 올리기).
   * claims = 저절로 맡기기를 한 컴퓨터만 (feedbackClaims.ts): taken은 다른 컴퓨터가 이번 차례에 맡았는지, claim은 이 컴퓨터(machine을 주면 그 돕는 맥)가 맡기 (since = 그 항목을 마지막으로 손댄 때). elsewhere = 저절로 맡는 것은 서버(다른 컴퓨터)라 이 컴퓨터는 맡지 않음 (serverRelay.ts). helpers = 피드백 돕기 (11/23 안 A, deviceServer.ts의 DeviceHub): 서버의 자리가 찼을 때 넘치는 항목을 맡길 돕는 맥. free = 자리가 남은 맥 이름, assign = 그 맥의 다음 알림 답에 실어 보낸다
   */
  feedback?: { dir: string; written?: () => void; claims?: { taken(key: string, since: number): boolean; claim(key: string, since: number, machine?: string): Promise<boolean> }; elsewhere?: () => boolean; helpers?: { free(): string | undefined; assign(name: string, keys: string[]): void; unstarted?(): string[] } }
  /** 설정 › 에이전트 (피드백을 언제 맡기고 언제 합치나 · 한 차례 한도) */
  settings?: () => AgentSettings
  /** 합친 커밋이 지금 도는 앱에 들어 있는가 (모르면 undefined) */
  inApp?: (sha: string) => Promise<boolean | undefined>
  /** 기록 대화의 차례가 잘 끝나면 마지막 답 글과 이번 차례에 고친 곳을 그 기록에 적는다 (routes/comments.ts) */
  recordAnswer?: (rid: string, record: { target: string; id: string }, text: string, edits: { file: string; added: number; removed: number }[]) => void
  /** 다른 에이전트의 검토 (11/9): 읽기만 하는 Codex에게 묻는다 (codexCli.ts의 codexAsk). 없으면 검토를 쓸 수 없다 */
  review?: (o: OneShot) => Promise<string>
  /** Claude · Codex 계정 여럿 (claudeAccounts.ts): 대화 종류마다 · 대화마다 계정 폴더 */ accounts?: AccountBook
}

/** 대화 상태와 줄 · 차례 돌리기 (agentChats.ts에서 나눔). 차례 하나를 돌리는 run은 AgentChatsRun에 있다. */
export abstract class AgentChatsBase {
  protected readonly chats = new Map<string, Stored>()
  protected readonly aborts = new Map<string, AbortController>()
  protected readonly asks = new Map<string, (a: Answer) => void>()
  /** 줄 선 대화의 지시 (순서대로) */
  protected readonly queue: { id: string; prompt: string; images?: ImageIn[] }[] = []
  /** 열어 둔 에이전트 */
  protected readonly sessions = new Map<string, Session>()
  protected readonly draftTimers = new Map<string, NodeJS.Timeout>()
  /** 앱이 다시 켜질 때 돌고 있어 저절로 이어 갈 대화 (resumeRestarted) */
  protected readonly restarted: string[] = []
  /** 앱이 닫히는 중 (stopAll): 기다리던 카드를 거절로 닫지 않고 남긴다 (다시 켜진 뒤 그대로 띄움, 11/28) */
  protected closing = false

  constructor(protected readonly deps: AgentChatsDeps) {
    fs.mkdirSync(deps.dir, { recursive: true })
    for (const f of fs.readdirSync(deps.dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const c: Stored = JSON.parse(fs.readFileSync(path.join(deps.dir, f), 'utf8'))
        c.mode ??= 'edit'; c.model ??= 'default'; c.model = startModel(c.agent ?? 'claude-code', c.model); c.effort ??= 'medium'; c.changed ??= []; c.todos ??= []
        delete c.live
        delete c.tasks
        delete c.compacting
        delete c.draft
        for (const it of c.items) if ((it.kind === 'side' && it.answer === undefined || (it.kind === 'review' || it.kind === 'member') && it.text === undefined) && !it.error) it.error = t('앱이 다시 켜져 답하지 못했습니다', 'Not answered because the app restarted')
        // 줄 선 대화는 저장해 둔 차례로 다시 줄을 선다 (예전엔 "이어서"만 받아 사용자의 새 지시를 잃고 "이미 답했다"고 끝났다, 11/19)
        if (c.state === 'queued' && c.turn) this.queue.push({ id: c.id, ...c.turn })
        else if (LIVE.has(c.state)) {
          const was = c.state // 앱이 다시 켜지면 돌던 차례는 이어지지 않는다
          // 차례를 저장하기 전에 줄 선 대화: 마지막 지시를 다음에 함께 읽는다
          const u = was === 'queued' ? [...c.items].reverse().find((it) => it.kind === 'user') : undefined
          if (u?.kind === 'user') (c.pending ??= []).push({ prompt: u.text })
          c.state = 'stopped'; c.claims = []
          // 물을 때 적어 둔 것이 있는 카드는 남기고(다시 켠 뒤 답하면 이어 감, 11/28), 없는 옛 카드만 거절로 닫는다. 도는 동안 보낸 지시는 그대로 두었다가 다음 지시와 함께 읽는다
          const kept = this.keepAsks(c)
          // 일하던 대화만 저절로 이어 간다 (10/30). 사용자 답을 기다리던 대화는 깨우지 않는다 (11/19). 차례를 저장하기 전에 줄 선 대화는 세션이 없어도 그 지시로
          const again = was !== 'waiting' && (!!c.sessionId || !!u) && !c.archived && (c.restarts ?? 0) < RESTART_RESUMES
          if (again) this.restarted.push(c.id)
          c.items.push({ kind: 'error', at: now(), text: again
            ? t('앱이 다시 켜져 멈췄습니다. 같은 대화로 저절로 이어 갑니다', 'Stopped because the app restarted. Continuing the same conversation by itself')
            : kept ? t('앱이 다시 켜져 멈췄습니다. 위 카드에 답하면 같은 대화로 이어 갑니다', 'Stopped because the app restarted. Answer the card above to continue the same conversation')
              : t('앱이 다시 켜져 멈췄습니다. 이어서 지시하면 다시 시작합니다', 'Stopped because the app restarted. Send a message to continue') })
          this.write(c)
        } else if (!c.archived && this.keepAsks(c)) this.write(c) // 닫히며 멈춤으로 적힌 대화(stopAll)의 남은 카드

        this.chats.set(c.id, c)
      } catch { /* 깨진 파일은 건너뛴다 */ }
    }
  }

  get limit(): number { return this.deps.limit }

  /** 고를 수 있는 모델 (실행기가 모르거나 못 물으면 빈 목록). agent = codex · gemini */
  async models(agent?: 'codex' | 'gemini'): Promise<ModelChoice[]> {
    try { return (await (agent ? this.deps.others?.[agent] : this.deps.runner)?.models?.()) ?? [] } catch { return [] }
  }

  /** 그 대화의 실행기 */
  protected runnerFor(c: Stored): AgentRunner { return (c.agent === 'codex' || c.agent === 'gemini' ? this.deps.others?.[c.agent] : undefined) ?? this.deps.runner }

  /** 이 맥에서 앱 고치기 대화를 열 수 있는지 */
  get app(): boolean { return !!this.deps.app }
  /** 고를 수 있는 다른 앱 (새 대화 메뉴) */
  get otherApps(): { id: string; name: string }[] { return Object.entries(this.deps.apps ?? {}).map(([id, w]) => ({ id, name: w.profile?.name ?? id })) }
  /** 그 대화가 고치는 앱의 작업 폴더와 PR (앱 고치기 대화가 아니거나 그 앱이 이 컴퓨터에 없으면 없음) */
  protected workOf(c: Pick<Stored, 'scope'>): AppWork | undefined {
    if (c.scope.kind !== 'app') return undefined
    return c.scope.app ? this.deps.apps?.[c.scope.app] : this.deps.app
  }

  /** 피드백을 맡길 수 있는지 (피드백 화면의 「에이전트에게 맡기기」) */
  get handOffOk(): boolean { return !!this.deps.app && !!this.deps.feedback && this.deps.settings?.().feedback !== 'off' }

  /** 차례를 여는 지시의 되돌릴 자리를 적어 둔다 (그 앞 대화의 끝과 작업 폴더). 세션은 있는데 앞 메시지를 모르면(옛 대화) 없음 */
  protected point(c: Stored): string | undefined {
    if (c.sessionId && !c.lastMark) return undefined
    const id = crypto.randomBytes(4).toString('hex')
    c.points = { ...c.points, [id]: { ...(c.sessionId && { session: c.sessionId, resumeAt: c.lastMark }), ...(c.snap && { snap: c.snap }) } }
    return id
  }

  /** 열어 둔 에이전트를 닫는다 (하던 차례는 끝까지 한다) */
  protected close(s: Session): void {
    if (s.idle) clearTimeout(s.idle)
    s.idle = undefined
    s.inbox.close()
  }

  /** 쉬는 에이전트를 IDLE_MS 뒤에 닫는다. 뒤에서 명령이 돌면 끝날 때까지(최대 TASKS_MS) 열어 둔다 */
  protected idleLater(c: Stored, s: Session): void {
    if (s.idle) clearTimeout(s.idle)
    s.idle = setTimeout(() => {
      s.idle = undefined
      if (LIVE.has(c.state)) return
      if ((c.tasks ?? 0) > 0 && Date.now() - s.last < TASKS_MS) return this.idleLater(c, s)
      this.close(s)
    }, IDLE_MS)
    s.idle.unref?.()
  }

  /** 할 일 목록: 이번 차례의 할 일 줄을 그 자리에서 고친다 (없으면 더한다) */
  protected setTodos(c: Stored, todos: Todo[]): void {
    c.todos = todos
    let lastUser = -1
    c.items.forEach((it, i) => { if (it.kind === 'user' && !it.queued) lastUser = i })
    const at = c.items.findIndex((it, i) => i > lastUser && it.kind === 'todos')
    if (at >= 0) c.items[at] = { kind: 'todos', at: c.items[at]!.at, todos }
    else c.items.push({ kind: 'todos', at: now(), todos })
    this.touch(c)
  }

  protected must(id: string): Stored {
    const c = this.chats.get(id)
    if (!c) throw new WorkbenchError(404, t(`대화가 없음: ${id}`, `No such conversation: ${id}`))
    if (c.packed) unpack(this.deps.dir, c)
    return c
  }

  protected fileOf(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new WorkbenchError(400, t('대화 id가 맞지 않음', 'Invalid conversation id'))
    return path.join(this.deps.dir, `${id}.json`)
  }

  protected write(c: Stored): void {
    if (c.items.length > MAX_ITEMS) c.trimmed = (c.trimmed ?? 0) + c.items.splice(0, c.items.length - MAX_ITEMS).length
    fs.writeFileSync(this.fileOf(c.id), JSON.stringify({ ...c, draft: undefined }, null, 1))
  }

  /** 쓰는 중인 글: 0.3초에 한 번만 화면에 보낸다 */
  protected drafting(c: Stored, more: string): void {
    c.draft = (c.draft ?? '') + more
    if (this.draftTimers.has(c.id)) return
    const timer = setTimeout(() => {
      this.draftTimers.delete(c.id)
      if (c.draft) this.deps.draft?.(c, c.draft.slice(-MAX_TEXT))
    }, DRAFT_MS)
    timer.unref?.()
    this.draftTimers.set(c.id, timer)
  }

  protected undraft(c: Stored): void {
    if (c.draft === undefined) return
    delete c.draft
    clearTimeout(this.draftTimers.get(c.id))
    this.draftTimers.delete(c.id)
  }

  /**
   * 앱이 다시 켜졌을 때 답 없는 카드: 물을 때 적어 둔 것(askMeta)이 있으면 남기고(restored) 그 사이 바뀐 것을 뒤에서 센다.
   * 없는 옛 카드는 예전처럼 거절로 닫는다. 남긴 카드가 하나라도 있으면 true
   */
  protected keepAsks(c: Stored): boolean {
    let kept = false
    for (const it of c.items) {
      if (it.kind !== 'ask' || it.answer) continue
      const meta = c.askMeta?.[it.id]
      if (!meta) { it.answer = 'deny'; it.expired = true; continue }
      kept = true
      if (it.restored) continue
      it.restored = { at: now() }
      // 앱 고치기 작업 폴더가 정리돼 없으면 다른 폴더와 견주지 않는다
      const cwd = c.worktree && !fs.existsSync(c.worktree) ? c.worktree : this.cwdOf(c)
      void sinceOf(cwd, meta.base, c.ci).then((s) => { if (!it.answer && this.chats.get(c.id) === c) { it.since = s; this.touch(c) } }, () => undefined)
    }
    return kept
  }

  protected cwdOf(c: Stored): string {
    return (c.worktree && fs.existsSync(c.worktree) ? c.worktree : undefined) ?? (c.scope.kind === 'app' ? this.deps.dir : (() => { try { return this.deps.project(c.rid).repo } catch { return this.deps.dir } })())
  }

  protected touch(c: Stored): void {
    c.updated = now()
    this.write(c)
    this.deps.notify(rowOf(c))
  }

  protected push(c: Stored, it: ChatItem): void {
    c.items.push(it)
    this.touch(c)
  }

  /** 줄 · 동시에 도는 수와 상관없이 도는 대화 (중앙 대화와 그것이 급히 연 앱 고치기, agentCentral.ts) */
  protected unlimited(_c: Stored): boolean { return false }

  protected running(): number {
    return this.counted().length
  }

  protected counted(): Stored[] {
    return [...this.chats.values()].filter((c) => (c.state === 'running' || c.state === 'waiting') && !this.unlimited(c))
  }

  /** 차례를 시작한 때 (막 시작한 대화는 메모리를 덜 쓴 것으로 보고 appMemory.ts의 PER_CHAT_GB를 미리 뺀다) */
  protected readonly startedAt = new Map<string, number>()

  /** 하나 더 시작해도 되는가: 상한(limit) 안에서 남은 메모리(room) */
  protected canStart(): boolean {
    const live = this.counted()
    return live.length < this.deps.limit && (!this.deps.room || this.deps.room(live.length, live.filter((c) => Date.now() - (this.startedAt.get(c.id) ?? 0) < FRESH_MS).length))
  }

  /** 줄 선 대화를 자리가 나는 만큼 시작한다 (메모리가 풀리면 routes/agentChats.ts가 몇 초마다 부른다). 시작한 수 */
  drain(): number {
    let n = 0
    for (; this.queue.length && this.canStart(); n++) this.next()
    return n
  }

  protected start(c: Stored, m: ChatMessageBody, prompt?: string): void {
    // 멈추거나 실패해 읽지 못한 지시가 있으면 먼저 읽는다
    const pending = c.pending?.splice(0) ?? []
    for (const it of c.items) if (it.kind === 'user' && it.queued) delete it.queued
    c.items.push(userItem(m, false, pending.length ? undefined : this.point(c)))
    this.begin(c, [...pending.map((p) => p.prompt), promptFor(c, m, prompt)].join('\n\n'), [...pending.flatMap((p) => p.images ?? []), ...(m.images ?? [])].slice(0, 4))
  }

  protected begin(c: Stored, prompt: string, images?: ImageIn[]): void {
    if (!this.unlimited(c) && (this.queue.length || !this.canStart())) {
      c.state = 'queued'
      c.turn = { prompt, ...(images?.length && { images }) }
      this.queue.push({ id: c.id, ...c.turn })
      this.touch(c)
      this.drain()
      return
    }
    void this.run(c, prompt, images)
  }

  protected finish(c: Stored, state: 'idle' | 'stopped' | 'error'): void {
    c.state = state
    c.claims = []
    const pending = c.pending ?? []
    // 일하는 중에 받은 지시: 차례가 잘 끝났으면 이어서 읽는다. 멈추거나 실패하면 "다음에 보냄"에 남아 다음 지시 · 이어 하기와 함께 읽는다
    if (state === 'idle' && pending.length) {
      c.pending = []
      for (const it of c.items) if (it.kind === 'user' && it.queued) delete it.queued
      this.touch(c)
      this.begin(c, pending.map((p) => p.prompt).join('\n\n'), pending.flatMap((p) => p.images ?? []).slice(0, 4))
      return
    }
    this.touch(c)
    this.next()
  }

  /** 자리가 비었으면 줄 선 대화 하나를 시작한다 (줄 선 대화를 멈춘 때처럼 자리가 비지 않았으면 시작하지 않는다) */
  protected next(): void {
    if (!this.canStart()) return
    const next = this.queue.shift()
    if (next) {
      const n = this.chats.get(next.id)
      if (n) { delete n.turn; void this.run(n, next.prompt, next.images) }
    }
  }

  /** 앱 고치기 대화끼리는 일하는 중이거나 PR이 아직 합쳐지지 않은 다른 대화가 고친 파일도 (합칠 때 부딪힘, 11/16 "중앙 에이전트" 2단계). 함께 고칠 프로젝트(scope.also)의 파일은 `프로젝트:파일`로 잡는다 (11/19) */
  protected claimedBy(self: string, file: string, rid = this.chats.get(self)?.rid): string | undefined {
    // 다른 앱을 고치는 앱 고치기 대화끼리는 같은 경로라도 다른 저장소다 (11/20)
    const mine = this.chats.get(self)?.scope.app
    for (const o of this.chats.values()) if (o.id !== self && (o.rid !== APP_RID || o.scope.app === mine) && (LIVE.has(o.state) && o.claims.includes(o.rid === rid ? file : `${rid}:${file}`) || o.rid === rid && o.rid === APP_RID && (LIVE.has(o.state) || !!o.pr) && !o.merged && !o.archived && o.changed.includes(file))) return o.title
    return undefined
  }

  protected abstract run(c: Stored, prompt: string, images?: ImageIn[]): Promise<void>
}

export const userItem = (m: ChatMessageBody, queued?: boolean, point?: string): ChatItem => ({
  kind: 'user', at: now(), text: m.text, ...(point && { point }),
  ...(m.attach?.length && { attach: m.attach.map((a) => ({ ...a, ...(a.text && { text: clip(a.text, 600) }) })) }),
  ...(m.images?.length && { images: m.images.length, ...(m.images.some((i) => i.name) && { imageNames: m.images.map((i) => i.name ?? '') }) }),
  ...(queued && { queued: true }),
})
export const rowOf = (c: Stored): ChatRow => {
  let added = 0
  let removed = 0
  let wait: ChatRow['wait']
  let since: string | undefined
  for (const it of c.items) {
    if (it.kind === 'user' && !it.queued) since = it.at
    if (it.kind === 'edit') { added += it.added; removed += it.removed }
    if (it.kind === 'ask' && !it.answer) wait = it.plan !== undefined ? 'plan' : 'ask' // 멈춘 대화에서는 다시 켠 뒤 남은 카드 (11/28)
  }
  return {
    id: c.id, rid: c.rid, title: c.title, agent: c.agent, scope: c.scope, write: c.write, state: c.state,
    mode: c.mode, model: c.model, effort: c.effort, ...(c.account && { account: c.account }), ...(c.auto && { auto: { ...c.auto } }), claims: [...c.claims], changed: [...c.changed], added, removed,
    ...((c.state === 'waiting' || (c.state === 'stopped' && !c.archived)) && wait && { wait }), archived: !!c.archived, ...(c.branch && { branch: c.branch }), ...(c.pr && { pr: { ...c.pr } }), ...(c.feedback && { feedback: c.feedback }), ...(c.handed && { handed: c.handed }), ...(c.bundle && { bundle: [...c.bundle] }), ...(c.record && { record: { ...c.record } }), ...(c.needsEdit && { needsEdit: true }), ...(c.parent && { parent: c.parent }), ...(c.summary && { summary: c.summary }), ...(LIVE.has(c.state) && since && { since }), ...(c.merged && { merged: c.merged }), ...(c.shipped && { shipped: true }), ...(c.live && { live: true }), ...(c.tasks && { tasks: c.tasks }), ...(c.state === 'idle' && !c.tasks && agentAsks(c.items) && { asks: true }), ...(c.compacting && { compacting: true }), ...(c.draft && { draft: c.draft.slice(-MAX_TEXT) }), ...(c.debate && { debate: structuredClone(c.debate) }), created: c.created, updated: c.updated,
  }
}
export const wireOf = (c: Stored): Chat => ({ ...rowOf(c), items: c.items.map((i) => ({ ...i })), always: (c.alwaysKeys ?? []).map((a) => a.label), todos: c.todos.map((x) => ({ ...x })), ...(c.trimmed && { trimmed: c.trimmed }) })

