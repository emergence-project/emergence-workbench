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
import { APP_RID, CENTRAL_RID, startModel, type Reviewer } from '@rw/core/contract/agentChats'
import type { AppChecks, AppSubmitBody, AppSubmitted, AskAnswer, Attach, CentralOpenBody, Chat, ChatEffort, ChatItem, ChatMessageBody, ChatMode, ChatModel, ChatRow, ChatScope, ChatSettings, ChatWrite, ImageIn, ModelChoice, NewChatBody, Todo, WorkState } from '@rw/core/contract/agentChats'
import { appEnv, notStarted, personalReadable, type AppWork, type Snap } from './appWorktree.js'
export { appEnv } from './appWorktree.js'
import { agentAsks, autoCustom, autoOf, type AgentSettings } from '@rw/core'
import { fillReview, reviewerName, reviewerOf } from './agentReviewers.js'
import { HERE, t } from './i18n.js'
import { WorkbenchError } from './workbench.js'
import { FRESH_MS } from './appMemory.js'
import { accountEnv, accountForNew, switchAccount, type AccountBook } from './claudeAccounts.js'

export type { AgentRunner, OneShot, RunEvent, RunInput, ToolDecision, Turn } from './agentRun.js'
import type { AgentRunner, OneShot, RunInput, ToolDecision, Turn } from './agentRun.js'
export { Inbox } from './agentInbox.js'
import { Inbox } from './agentInbox.js'

export * from './agentPolicy.js'
import { clip, describeStep, FILE_WRITE_TOOLS, judge, MCP, pathOf, PLAN_TOOL, posix, str, withAlso, type PolicyCtx } from './agentPolicy.js'
export * from './agentPrompts.js'
import { appBriefFor, briefFor, promptFor, recordDraftPrompt, reviewPrompt, sidePrompt } from './agentPrompts.js'

export { editOf, fileEditOf, partsOfPatch, todosOf } from './agentItems.js'
import { commandEdits, editOf, fileEditOf, todosOf } from './agentItems.js'
import { packFile, unpack } from './agentTidy.js'; import { splitFixMark } from './recordFix.js'

// ---------- 대화들 ----------

/** 파일에 두는 대화 (계약의 Chat에 세션 · 늘 허락한 것을 더함) */
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
interface Point { session?: string; resumeAt?: string; snap?: Snap }

/** 열어 둔 에이전트 하나 (대화마다 하나) */
interface Session {
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
const DRAFT_MS = 300
/** app_checks가 기다리는 동안 CI를 다시 보는 간격 */
const CHECK_EVERY_MS = 20_000
export const TASKS_MS = 60 * 60_000
const keyOf = (c: Pick<Stored, 'mode' | 'model' | 'effort' | 'write' | 'account'>) => `${c.mode}|${c.model}|${c.effort}|${c.write}|${c.account ?? ''}`

import { lastTouched } from './feedbackClaims.js'
export { lastTouched }

/** 카드에 받은 답 (거절의 할 말, 계획 승인 뒤 맡기는 정도) */
type Answer = { answer: AskAnswer; note?: string; mode?: ChatMode }

const MAX_ITEMS = 400
const MAX_TEXT = 8000
const now = () => new Date().toISOString()
export const LIVE = new Set(['running', 'waiting', 'queued'])
/** 앱이 다시 켜질 때 같은 대화를 저절로 이어 가는 횟수 (차례가 잘 끝나기 전까지) */
const RESTART_RESUMES = 2

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
  feedback?: { dir: string; written?: () => void; claims?: { taken(key: string, since: number): boolean; claim(key: string, since: number, machine?: string): Promise<boolean> }; elsewhere?: () => boolean; helpers?: { free(): string | undefined; assign(name: string, keys: string[]): void } }
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

export class AgentChats {
  protected readonly chats = new Map<string, Stored>()
  private readonly aborts = new Map<string, AbortController>()
  private readonly asks = new Map<string, (a: Answer) => void>()
  /** 줄 선 대화의 지시 (순서대로) */
  protected readonly queue: { id: string; prompt: string; images?: ImageIn[] }[] = []
  /** 열어 둔 에이전트 */
  protected readonly sessions = new Map<string, Session>()
  private readonly draftTimers = new Map<string, NodeJS.Timeout>()
  /** 앱이 다시 켜질 때 돌고 있어 저절로 이어 갈 대화 (resumeRestarted) */
  private readonly restarted: string[] = []

  constructor(protected readonly deps: AgentChatsDeps) {
    fs.mkdirSync(deps.dir, { recursive: true })
    for (const f of fs.readdirSync(deps.dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const c = JSON.parse(fs.readFileSync(path.join(deps.dir, f), 'utf8')) as Stored
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
          for (const it of c.items) if (it.kind === 'ask' && !it.answer) { it.answer = 'deny'; it.expired = true } // 도는 동안 보낸 지시는 그대로 두었다가 다음 지시와 함께 읽는다
          // 일하던 대화만 저절로 이어 간다 (10/30). 사용자 답을 기다리던 대화는 깨우지 않는다 (11/19). 차례를 저장하기 전에 줄 선 대화는 세션이 없어도 그 지시로
          const again = was !== 'waiting' && (!!c.sessionId || !!u) && !c.archived && (c.restarts ?? 0) < RESTART_RESUMES
          if (again) this.restarted.push(c.id)
          c.items.push({ kind: 'error', at: now(), text: again
            ? t('앱이 다시 켜져 멈췄습니다. 같은 대화로 저절로 이어 갑니다', 'Stopped because the app restarted. Continuing the same conversation by itself')
            : t('앱이 다시 켜져 멈췄습니다. 이어서 지시하면 다시 시작합니다', 'Stopped because the app restarted. Send a message to continue') })
          this.write(c)
        }
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
  private runnerFor(c: Stored): AgentRunner { return (c.agent === 'codex' || c.agent === 'gemini' ? this.deps.others?.[c.agent] : undefined) ?? this.deps.runner }

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

  /** 차례를 여는 지시의 되돌릴 자리를 적어 둔다 (그 앞 대화의 끝과 작업 폴더). 세션은 있는데 앞 메시지를 모르면(옛 대화) 없음 */
  private point(c: Stored): string | undefined {
    if (c.sessionId && !c.lastMark) return undefined
    const id = crypto.randomBytes(4).toString('hex')
    c.points = { ...c.points, [id]: { ...(c.sessionId && { session: c.sessionId, resumeAt: c.lastMark }), ...(c.snap && { snap: c.snap }) } }
    return id
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
    c.pr = { number: pr.number, url: pr.url }; c.ci = 'pending'
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

  /** 열어 둔 에이전트를 닫는다 (하던 차례는 끝까지 한다) */
  private close(s: Session): void {
    if (s.idle) clearTimeout(s.idle)
    s.idle = undefined
    s.inbox.close()
  }

  /** 쉬는 에이전트를 IDLE_MS 뒤에 닫는다. 뒤에서 명령이 돌면 끝날 때까지(최대 TASKS_MS) 열어 둔다 */
  private idleLater(c: Stored, s: Session): void {
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
  private setTodos(c: Stored, todos: Todo[]): void {
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

  private fileOf(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new WorkbenchError(400, t('대화 id가 맞지 않음', 'Invalid conversation id'))
    return path.join(this.deps.dir, `${id}.json`)
  }

  protected write(c: Stored): void {
    if (c.items.length > MAX_ITEMS) c.trimmed = (c.trimmed ?? 0) + c.items.splice(0, c.items.length - MAX_ITEMS).length
    fs.writeFileSync(this.fileOf(c.id), JSON.stringify({ ...c, draft: undefined }, null, 1))
  }

  /** 쓰는 중인 글: 0.3초에 한 번만 화면에 보낸다 */
  private drafting(c: Stored, more: string): void {
    c.draft = (c.draft ?? '') + more
    if (this.draftTimers.has(c.id)) return
    const timer = setTimeout(() => {
      this.draftTimers.delete(c.id)
      if (c.draft) this.deps.draft?.(c, c.draft.slice(-MAX_TEXT))
    }, DRAFT_MS)
    timer.unref?.()
    this.draftTimers.set(c.id, timer)
  }

  private undraft(c: Stored): void {
    if (c.draft === undefined) return
    delete c.draft
    clearTimeout(this.draftTimers.get(c.id))
    this.draftTimers.delete(c.id)
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

  private cwdOf(c: Stored): string {
    return (c.worktree && fs.existsSync(c.worktree) ? c.worktree : undefined) ?? (c.scope.kind === 'app' ? this.deps.dir : (() => { try { return this.deps.project(c.rid).repo } catch { return this.deps.dir } })())
  }

  protected touch(c: Stored): void {
    c.updated = now()
    this.write(c)
    this.deps.notify(rowOf(c))
  }

  private push(c: Stored, it: ChatItem): void {
    c.items.push(it)
    this.touch(c)
  }

  /** 줄 · 동시에 도는 수와 상관없이 도는 대화 (중앙 대화와 그것이 급히 연 앱 고치기, agentCentral.ts) */
  protected unlimited(_c: Stored): boolean { return false }

  protected running(): number {
    return this.counted().length
  }

  private counted(): Stored[] {
    return [...this.chats.values()].filter((c) => (c.state === 'running' || c.state === 'waiting') && !this.unlimited(c))
  }

  /** 차례를 시작한 때 (막 시작한 대화는 메모리를 덜 쓴 것으로 보고 appMemory.ts의 PER_CHAT_GB를 미리 뺀다) */
  private readonly startedAt = new Map<string, number>()

  /** 하나 더 시작해도 되는가: 상한(limit) 안에서 남은 메모리(room) */
  private canStart(): boolean {
    const live = this.counted()
    return live.length < this.deps.limit && (!this.deps.room || this.deps.room(live.length, live.filter((c) => Date.now() - (this.startedAt.get(c.id) ?? 0) < FRESH_MS).length))
  }

  /** 줄 선 대화를 자리가 나는 만큼 시작한다 (메모리가 풀리면 routes/agentChats.ts가 몇 초마다 부른다). 시작한 수 */
  drain(): number {
    let n = 0
    for (; this.queue.length && this.canStart(); n++) this.next()
    return n
  }

  private start(c: Stored, m: ChatMessageBody, prompt?: string): void {
    // 멈추거나 실패해 읽지 못한 지시가 있으면 먼저 읽는다
    const pending = c.pending?.splice(0) ?? []
    for (const it of c.items) if (it.kind === 'user' && it.queued) delete it.queued
    c.items.push(userItem(m, false, pending.length ? undefined : this.point(c)))
    this.begin(c, [...pending.map((p) => p.prompt), promptFor(c, m, prompt)].join('\n\n'), [...pending.flatMap((p) => p.images ?? []), ...(m.images ?? [])].slice(0, 4))
  }

  private begin(c: Stored, prompt: string, images?: ImageIn[]): void {
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

  private finish(c: Stored, state: 'idle' | 'stopped' | 'error'): void {
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
  private next(): void {
    if (!this.canStart()) return
    const next = this.queue.shift()
    if (next) {
      const n = this.chats.get(next.id)
      if (n) { delete n.turn; void this.run(n, next.prompt, next.images) }
    }
  }

  /** 앱 고치기 대화끼리는 일하는 중이거나 PR이 아직 합쳐지지 않은 다른 대화가 고친 파일도 (합칠 때 부딪힘, 11/16 "중앙 에이전트" 2단계). 함께 고칠 프로젝트(scope.also)의 파일은 `프로젝트:파일`로 잡는다 (11/19) */
  private claimedBy(self: string, file: string, rid = this.chats.get(self)?.rid): string | undefined {
    // 다른 앱을 고치는 앱 고치기 대화끼리는 같은 경로라도 다른 저장소다 (11/20)
    const mine = this.chats.get(self)?.scope.app
    for (const o of this.chats.values()) if (o.id !== self && (o.rid !== APP_RID || o.scope.app === mine) && (LIVE.has(o.state) && o.claims.includes(o.rid === rid ? file : `${rid}:${file}`) || o.rid === rid && o.rid === APP_RID && (LIVE.has(o.state) || !!o.pr) && !o.merged && !o.archived && o.changed.includes(file))) return o.title
    return undefined
  }

  /**
   * 에이전트를 열어 첫 지시를 넘기고, 닫힐 때까지 여러 차례를 받는다. 차례가 끝나면(result) 쉬는 상태로 두고 열어 둔다:
   * 다음 지시는 send가 inbox로 바로 넘기고, 뒤에서 돌던 명령이 끝나 에이전트가 스스로 이어 가면 다시 일하는 중이 된다.
   */
  private async run(c: Stored, prompt: string, images?: ImageIn[]): Promise<void> {
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
        const id = crypto.randomBytes(6).toString('hex')
        const answer = new Promise<Answer>((resolve) => {
          this.asks.set(id, resolve)
          abort.signal.addEventListener('abort', () => resolve({ answer: 'deny' }), { once: true })
        })
        c.state = 'waiting'
        this.push(c, { kind: 'ask', at: now(), id, tool: tool.replace(MCP, ''), summary: v.summary, ...(v.plan !== undefined && { plan: v.plan }), ...(v.does && { does: v.does }), ...(v.once && { once: true }) })
        const got = await answer
        const a = got.answer
        this.asks.delete(id)
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
        c.items.push({ kind: 'error', at: now(), text: (e as Error).message.slice(0, MAX_TEXT), crash: true }) // 프로세스가 비정상으로 끝남: 중앙이 알린다 (agentCrash.ts)
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
      for (const it of c.items) if (it.kind === 'ask' && !it.answer) { it.answer = 'deny'; it.expired = true; this.asks.delete(it.id) }
      this.finish(c, ended)
    }
  }

  /** 차례 하나가 잘 끝남: 쉬는 상태로 두고 에이전트는 열어 둔다. 설정을 바꿔 기다리는 지시가 있으면 닫고 다시 연다(finish) */
  private turnEnd(c: Stored, s: Session, state: 'idle' | 'stopped' = 'idle'): void {
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
  private writeRecordAnswer(c: Stored): void {
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

const userItem = (m: ChatMessageBody, queued?: boolean, point?: string): ChatItem => ({
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
    if (it.kind === 'ask' && !it.answer) wait = it.plan !== undefined ? 'plan' : 'ask'
  }
  return {
    id: c.id, rid: c.rid, title: c.title, agent: c.agent, scope: c.scope, write: c.write, state: c.state,
    mode: c.mode, model: c.model, effort: c.effort, ...(c.account && { account: c.account }), ...(c.auto && { auto: { ...c.auto } }), claims: [...c.claims], changed: [...c.changed], added, removed,
    ...(c.state === 'waiting' && wait && { wait }), archived: !!c.archived, ...(c.branch && { branch: c.branch }), ...(c.pr && { pr: { ...c.pr } }), ...(c.feedback && { feedback: c.feedback }), ...(c.handed && { handed: c.handed }), ...(c.bundle && { bundle: [...c.bundle] }), ...(c.record && { record: { ...c.record } }), ...(c.needsEdit && { needsEdit: true }), ...(c.parent && { parent: c.parent }), ...(c.summary && { summary: c.summary }), ...(LIVE.has(c.state) && since && { since }), ...(c.merged && { merged: c.merged }), ...(c.shipped && { shipped: true }), ...(c.live && { live: true }), ...(c.tasks && { tasks: c.tasks }), ...(c.state === 'idle' && !c.tasks && agentAsks(c.items) && { asks: true }), ...(c.compacting && { compacting: true }), ...(c.draft && { draft: c.draft.slice(-MAX_TEXT) }), ...(c.debate && { debate: structuredClone(c.debate) }), created: c.created, updated: c.updated,
  }
}
const wireOf = (c: Stored): Chat => ({ ...rowOf(c), items: c.items.map((i) => ({ ...i })), always: (c.alwaysKeys ?? []).map((a) => a.label), todos: c.todos.map((x) => ({ ...x })), ...(c.trimmed && { trimmed: c.trimmed }) })
