/**
 * 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21 사용자 결정): 앱이 맥의 에이전트를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다.
 *
 * - 대화마다 범위(프로젝트 · 주제 · 노트)와 고치기 단계(읽기만 · 노트 고치기)가 있다. 범위 밖은 읽을 수 있지만(대화에 「범위 밖」으로 보임)
 *   고치지 못하고, 노트는 앱 MCP(edit_note)로만 고친다(수정 검토가 걸린다). 파일을 바로 쓰는 도구는 막는다.
 * - 고치는 동안 그 파일을 「잡은 파일」로 적어, 다른 대화가 같은 파일을 고치지 못하게 한다. 차례가 끝나면 푼다.
 * - 셸 명령 · 웹 · 모르는 도구는 허락 카드로 묻는다(사용자 차례). 「이 대화에서 늘」은 같은 명령에만.
 * - 동시에 도는 대화는 limit개(맥 메모리, 10/14)까지이고 넘치면 줄을 선다.
 * 대화 기록은 앱 설정 폴더 agent-chats/<id>.json. 계약은 @rw/core/contract/agentChats.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AskAnswer, Chat, ChatItem, ChatRow, ChatScope, ChatWrite, NewChatBody, WorkState } from '@rw/core/contract/agentChats'
import { isInside } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

// ---------- 에이전트 실행기 (실제는 agentRunner.ts의 Claude Agent SDK, 테스트는 가짜) ----------

export type ToolDecision = { allow: true } | { allow: false; message: string }

export interface RunInput {
  prompt: string
  /** 이어서 지시할 때: 앞 차례의 세션 */
  sessionId?: string
  cwd: string
  /** 읽어도 묻지 않는 폴더 (공용 라이브러리) */
  extraDirs: string[]
  /** 대화를 열 때 주는 짧은 안내 (범위 · 단계 · 다른 대화가 잡은 파일) */
  brief: string
  write: ChatWrite
  canUseTool: (tool: string, input: Record<string, unknown>) => Promise<ToolDecision>
  signal: AbortSignal
}

export type RunEvent =
  | { type: 'session'; id: string }
  | { type: 'text'; text: string; sub?: boolean }
  | { type: 'tool'; tool: string; input: Record<string, unknown>; sub?: boolean }
  | { type: 'result'; ok: boolean; cost?: number; error?: string }

export type AgentRunner = (input: RunInput) => AsyncIterable<RunEvent>

// ---------- 허락 규칙 (순수 함수) ----------

/** 앱 MCP 서버 이름 (도구 이름 mcp__workbench__<도구>) */
export const MCP_NAME = 'workbench'
const MCP = `mcp__${MCP_NAME}__`

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'])
/** 묻지 않고 두는 것: 할 일 목록 · 서브에이전트(그 도구 호출도 같은 규칙을 거친다) · 도구 찾기 · 셸 결과 보기 */
const FREE_TOOLS = new Set(['TodoWrite', 'Task', 'Agent', 'ToolSearch', 'BashOutput', 'KillBash', 'KillShell'])
/** 파일을 바로 쓰는 도구: 1단계에서는 막는다 (노트는 edit_note로) */
export const FILE_WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'] as const
const MCP_WRITES = new Set(['edit_note', 'edit_concept', 'add_record', 'answer_record', 'flow_add', 'flow_update', 'flow_review'])

export interface PolicyCtx {
  rid: string
  write: ChatWrite
  scope: ChatScope
  repo: string
  /** 묻지 않고 읽는 다른 폴더 (공용 라이브러리 · 등록한 다른 프로젝트) */
  readable: string[]
  /** 다른 대화가 잡은 파일이면 그 대화 이름 */
  claimedBy: (file: string) => string | undefined
}

export type Verdict =
  | { kind: 'allow'; claim?: string }
  | { kind: 'ask'; summary: string; key: string }
  /** reason = 사용자에게 보일 말, message = 에이전트에게 돌려줄 말 (영어) */
  | { kind: 'deny'; reason: string; message: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s)
const posix = (p: string) => p.split(path.sep).join('/')

/** 범위가 차지하는 저장소 안 폴더 (저장소 기준, 끝에 / 없음). 프로젝트면 '' */
export function scopeDir(scope: ChatScope): string {
  if (scope.kind === 'topic' && scope.target) return `workbench/topics/${scope.target}`
  if (scope.kind === 'note' && scope.target) {
    const d = path.posix.dirname(scope.target)
    return d === '.' ? scope.target : d
  }
  return ''
}

/** 저장소 기준 경로가 범위 안인지 */
export function inScope(scope: ChatScope, rel: string): boolean {
  const d = scopeDir(scope)
  if (!d) return true
  if (scope.kind === 'note' && scope.target === rel) return true
  return rel === d || rel.startsWith(`${d}/`)
}

/** 도구 입력의 파일 경로 (읽기 도구) */
const pathOf = (input: Record<string, unknown>) => str(input.file_path) || str(input.notebook_path) || str(input.path)

/** 에이전트가 쓴 도구 한 줄 요약과 범위 밖인지 (대화에 보일 것) */
export function describeStep(ctx: Pick<PolicyCtx, 'rid' | 'scope' | 'repo'>, tool: string, input: Record<string, unknown>): { tool: string; summary: string; outside?: boolean } {
  if (tool.startsWith(MCP)) {
    const name = tool.slice(MCP.length)
    const project = str(input.project)
    const file = str(input.file)
    const outside = (project && project !== ctx.rid) || (file && project === ctx.rid && !inScope(ctx.scope, file)) ? true : undefined
    const what = [project && project !== ctx.rid ? project : '', file || str(input.id) || str(input.target) || str(input.query) || str(input.section)].filter(Boolean).join(' · ')
    return { tool: name, summary: clip(what), ...(outside && { outside }) }
  }
  if (READ_TOOLS.has(tool)) {
    const p = pathOf(input)
    const abs = p ? path.resolve(ctx.repo, p) : ''
    const rel = abs && isInside(ctx.repo, abs) ? posix(path.relative(ctx.repo, abs)) : ''
    const outside = abs ? (!rel && abs !== ctx.repo) || (!!rel && !inScope(ctx.scope, rel)) : false
    const summary = [rel || p, str(input.pattern)].filter(Boolean).join(' · ')
    return { tool, summary: clip(summary), ...(outside && { outside }) }
  }
  if (tool === 'Bash') return { tool, summary: clip(str(input.command)) }
  if (tool === 'WebFetch') return { tool, summary: clip(str(input.url)) }
  if (tool === 'WebSearch') return { tool, summary: clip(str(input.query)) }
  if (tool === 'Task' || tool === 'Agent') return { tool, summary: clip(str(input.description) || str(input.prompt), 120) }
  return { tool, summary: clip(JSON.stringify(input), 160) }
}

/** 도구 한 번을 허락할지: allow · ask(허락 카드) · deny(막고 이유) */
export function judge(ctx: PolicyCtx, tool: string, input: Record<string, unknown>): Verdict {
  if (FREE_TOOLS.has(tool)) return { kind: 'allow' }
  if (READ_TOOLS.has(tool)) {
    const p = pathOf(input)
    const abs = p ? path.resolve(ctx.repo, p) : ctx.repo
    if (isInside(ctx.repo, abs) || abs === ctx.repo || ctx.readable.some((d) => abs === d || isInside(d, abs))) return { kind: 'allow' }
    return { kind: 'ask', summary: t(`등록한 폴더 밖 읽기: ${abs}`, `Read outside registered folders: ${abs}`), key: `${tool}:${abs}` }
  }
  if ((FILE_WRITE_TOOLS as readonly string[]).includes(tool)) {
    return {
      kind: 'deny',
      reason: t('파일을 바로 고치는 것은 막혀 있습니다. 노트는 앱을 거쳐(수정 검토) 고칩니다', 'Editing files directly is blocked; notes are changed through the app (agent edit review)'),
      message: 'Editing files directly is disabled in this conversation. Change notes with the workbench MCP tool edit_note (read_note first, pass its hash as baseHash). For anything else, tell the user what should change and where.',
    }
  }
  if (tool.startsWith(MCP)) {
    const name = tool.slice(MCP.length)
    if (!MCP_WRITES.has(name)) return { kind: 'allow' }
    if (ctx.write === 'read') {
      return { kind: 'deny', reason: t('읽기만 하는 대화라 고치지 않습니다', 'This conversation is read-only'), message: 'This conversation is read-only: do not change notes, records or the flow. Tell the user what you would change instead.' }
    }
    const project = str(input.project)
    if (name === 'edit_concept' || (project && project !== ctx.rid)) {
      return {
        kind: 'deny',
        reason: t('이 대화의 범위 밖이라 고치지 않습니다', 'Outside this conversation\'s scope'),
        message: `That is outside this conversation's scope (project ${ctx.rid}). Do not change it; tell the user what should change and where, so the conversation that owns it can do it.`,
      }
    }
    if (name === 'edit_note') {
      const file = str(input.file)
      if (!inScope(ctx.scope, file)) {
        return {
          kind: 'deny',
          reason: t(`범위 밖 노트라 고치지 않습니다: ${file}`, `Note outside this conversation's scope: ${file}`),
          message: `${file} is outside this conversation's scope (${scopeDir(ctx.scope)}). Do not change it; tell the user what should change there and why.`,
        }
      }
      const other = ctx.claimedBy(file)
      if (other) {
        return {
          kind: 'deny',
          reason: t(`다른 대화(「${other}」)가 고치는 중인 파일입니다: ${file}`, `Another conversation ("${other}") is changing ${file}`),
          message: `Another conversation ("${other}") is changing ${file} right now. Do not change it; finish what you can and tell the user.`,
        }
      }
      return { kind: 'allow', claim: file }
    }
    return { kind: 'allow' }
  }
  const step = describeStep(ctx, tool, input)
  if (tool === 'Bash') return { kind: 'ask', summary: step.summary, key: `Bash:${str(input.command)}` }
  return { kind: 'ask', summary: `${tool} · ${step.summary}`, key: tool }
}

// ---------- 안내 (대화를 열 때 한 번, 짧게) ----------

export function briefFor(o: { rid: string; title: string; scope: ChatScope; write: ChatWrite; others: { title: string; claims: string[] }[] }): string {
  const scope = o.scope.kind === 'project' ? 'the whole project' : `${o.scope.kind} ${o.scope.target} (folder ${scopeDir(o.scope)})`
  const lines = [
    `You are working inside Emergence Workbench on the project "${o.title}" (project id ${o.rid}). The current folder is its repository.`,
    `Scope: ${scope}. Read outside the scope only when the work needs it. You cannot change anything outside the scope: say what should change, where and why, and stop there.`,
    o.write === 'read'
      ? 'This conversation is read-only: do not change notes, records or files. Running a command needs the user\'s approval each time.'
      : 'Change notes only with the workbench MCP tool edit_note (read_note first, pass its hash as baseHash); the user reviews each changed paragraph. Records: add_record / answer_record. Files cannot be edited directly. Running a command needs the user\'s approval.',
    `Start with the workbench MCP tools: rules (project ${o.rid}) and project_status; keep reads short and read more only when needed.`,
  ]
  const busy = o.others.filter((c) => c.claims.length)
  if (busy.length) lines.push(`Other conversations are changing these files now; do not change them: ${busy.map((c) => `${c.title}: ${c.claims.join(', ')}`).join('; ')}.`)
  lines.push('Write to the user in Korean, briefly: result first.')
  return lines.join('\n')
}

// ---------- 대화들 ----------

/** 파일에 두는 대화 (계약의 Chat에 세션 · 늘 허락한 것을 더함) */
type Stored = Chat & { sessionId?: string; always?: string[] }

const MAX_ITEMS = 400
const MAX_TEXT = 8000
const now = () => new Date().toISOString()
const LIVE = new Set(['running', 'waiting', 'queued'])

export interface AgentChatsDeps {
  dir: string
  runner: AgentRunner
  /** 동시에 도는 대화 수 */
  limit: number
  /** 프로젝트의 저장소와 이름 */
  project: (rid: string) => { repo: string; title: string }
  /** 묻지 않고 읽는 폴더 (공용 라이브러리 · 등록한 다른 프로젝트) */
  readable: () => string[]
  /** 에이전트가 처음부터 함께 보는 폴더 (공용 라이브러리) */
  extraDirs: () => string[]
  /** 대화가 바뀌면 (화면 알림) */
  notify: (chat: ChatRow) => void
}

export class AgentChats {
  private readonly chats = new Map<string, Stored>()
  private readonly aborts = new Map<string, AbortController>()
  private readonly asks = new Map<string, (a: AskAnswer) => void>()
  /** 줄 선 대화의 지시 (순서대로) */
  private readonly queue: { id: string; prompt: string }[] = []

  constructor(private readonly deps: AgentChatsDeps) {
    fs.mkdirSync(deps.dir, { recursive: true })
    for (const f of fs.readdirSync(deps.dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const c = JSON.parse(fs.readFileSync(path.join(deps.dir, f), 'utf8')) as Stored
        if (LIVE.has(c.state)) {
          // 앱이 다시 켜지면 돌던 차례는 이어지지 않는다
          c.state = 'stopped'
          c.claims = []
          for (const it of c.items) if (it.kind === 'ask' && !it.answer) it.answer = 'deny'
          c.items.push({ kind: 'error', at: now(), text: t('앱이 다시 켜져 멈췄습니다. 이어서 지시하면 다시 시작합니다', 'Stopped because the app restarted. Send a message to continue') })
          this.write(c)
        }
        this.chats.set(c.id, c)
      } catch { /* 깨진 파일은 건너뛴다 */ }
    }
  }

  get limit(): number { return this.deps.limit }

  list(rid?: string): ChatRow[] {
    return [...this.chats.values()].filter((c) => !rid || c.rid === rid).sort((a, b) => b.updated.localeCompare(a.updated)).map(rowOf)
  }

  get(id: string): Chat {
    return wireOf(this.must(id))
  }

  work(): WorkState {
    return { chats: [...this.chats.values()].filter((c) => LIVE.has(c.state)).map((c) => ({ id: c.id, rid: c.rid, title: c.title, state: c.state, scope: c.scope, claims: c.claims })) }
  }

  create(b: NewChatBody): Chat {
    this.deps.project(b.rid) // 등록하지 않은 프로젝트면 404
    const scope: ChatScope = b.scope ?? { kind: 'project' }
    if (scope.kind !== 'project' && !scope.target) throw new WorkbenchError(400, t('주제 · 노트 범위에는 대상이 필요합니다', 'A topic or note scope needs a target'))
    if (scope.target && (scope.target.includes('..') || path.isAbsolute(scope.target))) throw new WorkbenchError(400, t('범위 대상이 맞지 않음', 'Invalid scope target'))
    const at = now()
    const c: Stored = {
      id: `${at.slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`,
      rid: b.rid,
      title: (b.title || b.text.split('\n')[0]!).trim().slice(0, 60),
      agent: 'claude-code',
      scope,
      write: b.write ?? 'notes',
      state: 'idle',
      claims: [],
      created: at,
      updated: at,
      items: [],
    }
    this.chats.set(c.id, c)
    this.start(c, b.text)
    return wireOf(c)
  }

  send(id: string, text: string): Chat {
    const c = this.must(id)
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('이 대화는 아직 도는 중입니다. 끝나거나 멈춘 뒤 보내 주세요', 'This conversation is still running; send after it finishes or stops'))
    this.start(c, text)
    return wireOf(c)
  }

  answer(id: string, ask: string, a: AskAnswer): Chat {
    const c = this.must(id)
    const it = c.items.find((x): x is Extract<ChatItem, { kind: 'ask' }> => x.kind === 'ask' && x.id === ask)
    const resolve = this.asks.get(ask)
    if (!it || it.answer || !resolve) throw new WorkbenchError(409, t('이미 답했거나 없는 허락 요청입니다', 'This request was already answered or does not exist'))
    it.answer = a
    this.asks.delete(ask)
    resolve(a)
    return wireOf(c)
  }

  stop(id: string): Chat {
    const c = this.must(id)
    const qi = this.queue.findIndex((q) => q.id === id)
    if (qi >= 0) {
      this.queue.splice(qi, 1)
      this.finish(c, 'stopped')
    }
    this.aborts.get(id)?.abort()
    return wireOf(c)
  }

  remove(id: string): void {
    const c = this.must(id)
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('도는 대화는 지울 수 없습니다. 먼저 멈춰 주세요', 'Stop the conversation before deleting it'))
    this.chats.delete(id)
    fs.rmSync(this.fileOf(id), { force: true })
  }

  /** 테스트 · 끄기: 도는 차례를 모두 멈춘다 */
  stopAll(): void {
    this.queue.length = 0
    for (const a of this.aborts.values()) a.abort()
  }

  private must(id: string): Stored {
    const c = this.chats.get(id)
    if (!c) throw new WorkbenchError(404, t(`대화가 없음: ${id}`, `No such conversation: ${id}`))
    return c
  }

  private fileOf(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new WorkbenchError(400, t('대화 id가 맞지 않음', 'Invalid conversation id'))
    return path.join(this.deps.dir, `${id}.json`)
  }

  private write(c: Stored): void {
    if (c.items.length > MAX_ITEMS) c.items.splice(0, c.items.length - MAX_ITEMS)
    fs.writeFileSync(this.fileOf(c.id), JSON.stringify(c, null, 1))
  }

  private touch(c: Stored): void {
    c.updated = now()
    this.write(c)
    this.deps.notify(rowOf(c))
  }

  private push(c: Stored, it: ChatItem): void {
    c.items.push(it)
    this.touch(c)
  }

  private running(): number {
    return [...this.chats.values()].filter((c) => c.state === 'running' || c.state === 'waiting').length
  }

  private start(c: Stored, prompt: string): void {
    c.items.push({ kind: 'user', at: now(), text: prompt })
    if (this.running() >= this.deps.limit) {
      c.state = 'queued'
      this.queue.push({ id: c.id, prompt })
      this.touch(c)
      return
    }
    void this.run(c, prompt)
  }

  private finish(c: Stored, state: 'idle' | 'stopped' | 'error'): void {
    c.state = state
    c.claims = []
    this.touch(c)
    const next = this.queue.shift()
    if (next) {
      const n = this.chats.get(next.id)
      if (n) void this.run(n, next.prompt)
    }
  }

  private claimedBy(self: string, file: string): string | undefined {
    for (const o of this.chats.values()) if (o.id !== self && LIVE.has(o.state) && o.rid === this.chats.get(self)?.rid && o.claims.includes(file)) return o.title
    return undefined
  }

  private async run(c: Stored, prompt: string): Promise<void> {
    const abort = new AbortController()
    this.aborts.set(c.id, abort)
    c.state = 'running'
    this.touch(c)
    let ended: 'idle' | 'stopped' | 'error' = 'idle'
    try {
      const p = this.deps.project(c.rid)
      const readable = this.deps.readable().filter((d) => d !== p.repo)
      const ctx: PolicyCtx = { rid: c.rid, write: c.write, scope: c.scope, repo: p.repo, readable, claimedBy: (f) => this.claimedBy(c.id, f) }
      const others = [...this.chats.values()].filter((o) => o.id !== c.id && o.rid === c.rid && LIVE.has(o.state))
      const canUseTool = async (tool: string, input: Record<string, unknown>): Promise<ToolDecision> => {
        const v = judge(ctx, tool, input)
        if (v.kind === 'allow') {
          if (v.claim && !c.claims.includes(v.claim)) { c.claims.push(v.claim); this.touch(c) }
          return { allow: true }
        }
        if (v.kind === 'deny') {
          this.push(c, { kind: 'blocked', at: now(), tool: tool.replace(MCP, ''), reason: v.reason })
          return { allow: false, message: v.message }
        }
        if (c.always?.includes(v.key)) return { allow: true }
        const id = crypto.randomBytes(6).toString('hex')
        const answer = new Promise<AskAnswer>((resolve) => {
          this.asks.set(id, resolve)
          abort.signal.addEventListener('abort', () => resolve('deny'), { once: true })
        })
        c.state = 'waiting'
        this.push(c, { kind: 'ask', at: now(), id, tool: tool.replace(MCP, ''), summary: v.summary })
        const a = await answer
        this.asks.delete(id)
        const it = c.items.find((x) => x.kind === 'ask' && x.id === id)
        if (it && it.kind === 'ask' && !it.answer) it.answer = a
        if (a === 'always') c.always = [...(c.always ?? []), v.key]
        if (c.state === 'waiting') c.state = 'running'
        this.touch(c)
        return a === 'deny' ? { allow: false, message: 'The user declined this. Do not try it again in another way; continue without it or ask the user.' } : { allow: true }
      }
      const input: RunInput = {
        prompt,
        sessionId: c.sessionId,
        cwd: p.repo,
        extraDirs: this.deps.extraDirs(),
        brief: briefFor({ rid: c.rid, title: p.title, scope: c.scope, write: c.write, others: others.map((o) => ({ title: o.title, claims: o.claims })) }),
        write: c.write,
        canUseTool,
        signal: abort.signal,
      }
      for await (const e of this.deps.runner(input)) {
        if (e.type === 'session') { c.sessionId = e.id; this.write(c); continue }
        if (e.type === 'text') { if (e.text.trim()) this.push(c, { kind: 'text', at: now(), text: e.text.slice(0, MAX_TEXT), ...(e.sub && { sub: true }) }); continue }
        if (e.type === 'tool') {
          const s = describeStep(ctx, e.tool, e.input)
          this.push(c, { kind: 'step', at: now(), ...s, tool: s.tool.replace(MCP, ''), ...(e.sub && { sub: true }) })
          continue
        }
        if (e.type === 'result') {
          this.push(c, { kind: 'result', at: now(), ok: e.ok, ...(e.cost !== undefined && { cost: e.cost }) })
          if (!e.ok && e.error) this.push(c, { kind: 'error', at: now(), text: e.error.slice(0, MAX_TEXT) })
          if (!e.ok) ended = 'error'
        }
      }
      if (abort.signal.aborted) ended = 'stopped'
    } catch (e) {
      if (abort.signal.aborted) ended = 'stopped'
      else {
        ended = 'error'
        c.items.push({ kind: 'error', at: now(), text: (e as Error).message.slice(0, MAX_TEXT) })
      }
    } finally {
      this.aborts.delete(c.id)
      for (const it of c.items) if (it.kind === 'ask' && !it.answer) { it.answer = 'deny'; this.asks.delete(it.id) }
      this.finish(c, ended)
    }
  }
}

const rowOf = (c: Stored): ChatRow => ({ id: c.id, rid: c.rid, title: c.title, agent: c.agent, scope: c.scope, write: c.write, state: c.state, claims: [...c.claims], created: c.created, updated: c.updated })
const wireOf = (c: Stored): Chat => ({ ...rowOf(c), items: c.items.map((i) => ({ ...i })) })
