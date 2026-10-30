/**
 * Codex · Gemini 대화의 실행기 (10/30 사용자 결정 "둘 다, 공통 규약(ACP)으로"): 맥의 CLI를 Agent Client Protocol로 띄운다.
 * ACP = 표준 입출력의 JSON-RPC 한 줄씩 (https://agentclientprotocol.com). 앱이 클라이언트, CLI가 에이전트다.
 * - 허락: 에이전트가 묻는 session/request_permission을 Claude 도구 이름(Bash · Edit · Read · WebFetch …)으로 바꿔
 *   대화의 canUseTool(agentPolicy.ts judge)에 넘긴다. 그래서 범위 · 잡은 파일 · 맡기는 정도가 Claude 대화와 같다.
 * - 앱 MCP: 대화마다 앱 서버의 HTTP 입구(agentMcpHttp.ts)를 열어 붙인다. 그 입구가 도구 부르기마다 같은 판단을 거치므로
 *   에이전트가 MCP 도구를 묻지 않고 불러도 노트 고치기는 수정 검토 · 범위를 지난다.
 * - 이어 하기: 에이전트가 session/load를 받으면 같은 세션을 다시 연다(앞 기록을 다시 보내는 알림은 버린다).
 * - 멈추기: session/cancel. 끄기(abort)는 프로세스를 닫는다.
 * - Claude만 되는 것: 되돌리기 · 탐색 하위 에이전트 · 계획 모드 · 뒤에서 도는 명령 (대화 줄의 mark를 보내지 않으므로 되돌릴 자리가 생기지 않는다).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import readline from 'node:readline'
import type { ModelChoice } from '@rw/core/contract/agentChats'
import { Inbox, MCP_NAME, type AgentRunner, type RunEvent, type RunInput, type ToolDecision, type Turn } from './agentChats.js'
import { acpBin, acpEnv, type AcpSpec } from './agentKinds.js'
import { t } from './i18n.js'

type Json = Record<string, unknown>
const isRec = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const rec = (v: unknown): Json => (isRec(v) ? v : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// ---------- JSON-RPC 한 줄씩 ----------

export class AcpConnection {
  private seq = 1
  private readonly waiting = new Map<number, { ok(v: unknown): void; fail(e: Error): void }>()
  private err = ''
  private gone?: Error

  constructor(
    private readonly proc: ChildProcess,
    private readonly onNotify: (method: string, params: Json) => void,
    private readonly onRequest: (method: string, params: Json) => Promise<unknown>,
  ) {
    readline.createInterface({ input: proc.stdout! }).on('line', (line) => this.line(line))
    proc.stderr?.on('data', (d: Buffer) => { this.err = (this.err + d.toString()).slice(-2000) })
    proc.on('error', (e) => this.end(e))
    proc.on('exit', (code) => this.end(new Error(this.err.trim().split('\n').slice(-3).join('\n') || t(`에이전트가 끝났습니다 (코드 ${code})`, `The agent exited (code ${code})`))))
  }

  private end(e: Error): void {
    this.gone ??= e
    for (const w of this.waiting.values()) w.fail(this.gone)
    this.waiting.clear()
  }

  private write(m: Json): void {
    if (!this.gone && this.proc.stdin?.writable) this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`)
  }

  private line(line: string): void {
    let m: unknown
    try { m = JSON.parse(line) } catch { return }
    if (!isRec(m)) return
    const id = m.id
    const method = str(m.method)
    if (method && (typeof id === 'number' || typeof id === 'string')) {
      this.onRequest(method, rec(m.params)).then(
        (result) => this.write({ id, result: result ?? null }),
        (e: Error) => this.write({ id, error: { code: -32603, message: e.message } }),
      )
      return
    }
    if (method) { this.onNotify(method, rec(m.params)); return }
    if (typeof id !== 'number') return
    const w = this.waiting.get(id)
    if (!w) return
    this.waiting.delete(id)
    if (m.error !== undefined) w.fail(new Error(str(rec(m.error).message) || 'ACP error'))
    else w.ok(m.result)
  }

  request(method: string, params: Json): Promise<unknown> {
    if (this.gone) return Promise.reject(this.gone)
    const id = this.seq++
    return new Promise((ok, fail) => {
      this.waiting.set(id, { ok, fail })
      this.write({ id, method, params })
    })
  }

  notify(method: string, params: Json): void { this.write({ method, params }) }
}

// ---------- ACP 도구 → 앱의 도구 이름 ----------

/** 앱 MCP 도구 (HTTP 입구가 따로 판단하므로 에이전트가 물어도 그대로 허락한다) */
const WORKBENCH_TOOLS = new Set(['add_journal', 'add_record', 'add_task', 'answer_record', 'app_checks', 'app_submit', 'changes_since', 'checkpoint_task', 'edit_concept', 'edit_note', 'feedback_answer', 'finish_work', 'flow_add', 'flow_read', 'flow_review', 'flow_search', 'flow_update', 'list_edit_reviews', 'list_notes', 'list_projects', 'list_records', 'list_tasks', 'overview', 'project_status', 'read_concept', 'read_note', 'read_records', 'read_task', 'report_task', 'rules', 'search_library'])

/** 도구 부르기 하나: 앱 MCP면 mcp, 판단 없이 둘 것(생각 · 모드 바꾸기)이면 free */
export type AcpCall = { tool: string; input: Json; mcp?: boolean; free?: boolean }

/** 셸로 감싼 명령(["bash", "-lc", "…"])은 안의 명령만 */
export function commandOf(v: unknown): string {
  if (typeof v === 'string') return v
  const a = list(v).map(str)
  if (a.length >= 3 && /(^|\/)(ba|z)?sh$/.test(a[0]!) && /^-l?c$/.test(a[1]!)) return a.slice(2).join(' ')
  return a.join(' ')
}

/** 이름에서 앱 MCP 도구 찾기 (Gemini "read_note (workbench MCP Server)", Codex "workbench.read_note" 등) */
function mcpName(tc: Json): string | undefined {
  const raw = rec(tc.rawInput)
  const words = [str(tc.title), str(raw.tool), str(raw.name), str(tc.toolCallId)].join(' ').match(/[a-z][a-z_]+/g) ?? []
  return words.find((w) => WORKBENCH_TOOLS.has(w))
}

/** ACP의 toolCall 하나를 앱의 도구 부르기로 (고치기가 여러 파일이면 파일마다) */
export function callsOf(tc: Json): AcpCall[] {
  const raw = rec(tc.rawInput)
  const kind = str(tc.kind)
  const paths = list(tc.locations).map((l) => str(rec(l).path)).filter(Boolean)
  const p = paths[0] || str(raw.file_path) || str(raw.path) || str(raw.absolute_path)
  const name = mcpName(tc)
  if (name && kind !== 'execute' && kind !== 'edit') return [{ tool: `mcp__${MCP_NAME}__${name}`, input: isRec(raw.arguments) ? raw.arguments : raw, mcp: true }]
  if (kind === 'execute') return [{ tool: 'Bash', input: { command: commandOf(raw.command ?? raw.cmd) || str(tc.title) } }]
  if (kind === 'delete') return (paths.length ? paths : [p]).map((f) => ({ tool: 'Bash', input: { command: `rm ${JSON.stringify(f)}` } }))
  if (kind === 'edit' || kind === 'move') {
    const files = paths.length ? paths : [p]
    if (typeof raw.content === 'string' && !('old_string' in raw)) return files.map((f) => ({ tool: 'Write', input: { file_path: f, content: raw.content } }))
    return files.map((f) => ({ tool: 'Edit', input: { file_path: f, old_string: str(raw.old_string), new_string: str(raw.new_string) } }))
  }
  if (kind === 'read' || kind === 'search') return [{ tool: kind === 'search' ? 'Grep' : 'Read', input: { file_path: p, ...(kind === 'search' && { pattern: str(raw.pattern) || str(tc.title) }) } }]
  if (kind === 'fetch') return [{ tool: str(raw.query) ? 'WebSearch' : 'WebFetch', input: { url: str(raw.url) || str(raw.prompt) || str(tc.title), query: str(raw.query) } }]
  if (kind === 'think' || kind === 'switch_mode') return [{ tool: 'TodoWrite', input: {}, free: true }]
  return [{ tool: str(tc.title).slice(0, 80) || 'tool', input: raw }]
}

/** 허락 카드의 답을 에이전트가 준 선택지 하나로 */
export function optionFor(options: unknown, allow: boolean): Json {
  const opts = list(options).map(rec)
  const want = allow ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
  const o = want.map((k) => opts.find((x) => x.kind === k)).find(Boolean)
  return o ? { outcome: { outcome: 'selected', optionId: o.optionId } } : { outcome: { outcome: 'cancelled' } }
}

/** 지시 하나를 ACP 내용 조각으로 */
function blocksOf(text: string, x: Turn, images: boolean): Json[] {
  return [{ type: 'text', text }, ...(images ? (x.images ?? []).map((i) => ({ type: 'image', mimeType: i.type, data: i.data })) : [])]
}

// ---------- 실행기 ----------

/** 대화마다 여는 앱 MCP 입구 (HTTP). 앱 서버가 듣는 중이 아니면(시험) 없음 */
export type ChatMcp = (o: { appChat?: string; gate: RunInput['canUseTool'] }) => { url: string; close(): void } | undefined

function launch(spec: AcpSpec, cwd: string, env?: Record<string, string>): ChildProcess {
  const bin = acpBin(spec)
  if (!bin) throw new Error(t(`이 맥에서 ${spec.name}를 찾지 못했습니다. 깔고 한 번 로그인해 주세요: ${spec.install}`, `${spec.name} was not found on this Mac. Install it and sign in once: ${spec.install}`))
  return spawn(bin, spec.args, { cwd, env: acpEnv(env), stdio: ['pipe', 'pipe', 'pipe'] })
}

const INIT = { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'emergence-workbench', version: '1' } }

/** session/new · load 응답의 모델 목록 (ACP의 models, 아직 시험 단계라 없을 수 있다) */
export function modelsOf(r: unknown): ModelChoice[] {
  const m = rec(rec(r).models)
  const cur = str(m.currentModelId)
  const got = list(m.availableModels).map(rec).map((x) => ({ value: str(x.modelId), name: str(x.name) || str(x.modelId), desc: str(x.description) }))
    .filter((x) => /^[a-z][a-z0-9._:/\-[\]]{0,79}$/i.test(x.value) && x.value !== 'default')
  return got.length ? [{ value: 'default', name: t('기본 모델', 'Default model'), desc: '', ...(cur && { resolved: cur }) }, ...got.map((x) => ({ ...x, ...(x.value === cur && { resolved: cur }) }))] : []
}

/** 고를 수 있는 모델: 에이전트를 띄워 세션 하나를 열어 보고 닫는다 (지시를 보내지 않으니 토큰을 쓰지 않는다). 30분 기억 */
function modelLister(spec: AcpSpec): () => Promise<ModelChoice[]> {
  let got: { at: number; list: Promise<ModelChoice[]> } | undefined
  return () => {
    if (got && Date.now() - got.at < 30 * 60_000) return got.list
    const cwd = os.homedir()
    const p = (async () => {
      const proc = launch(spec, cwd)
      const timer = setTimeout(() => proc.kill(), 20_000)
      try {
        const conn = new AcpConnection(proc, () => undefined, async () => { throw new Error('not supported') })
        await conn.request('initialize', INIT)
        return modelsOf(await conn.request('session/new', { cwd, mcpServers: [] }))
      } finally { clearTimeout(timer); proc.kill() }
    })()
    got = { at: Date.now(), list: p }
    p.catch(() => { got = undefined })
    return p
  }
}

export function acpAgentRunner(spec: AcpSpec, mcp: ChatMcp): AgentRunner {
  return Object.assign(async function* run(input: RunInput): AsyncIterable<RunEvent> {
    const out = new Inbox<RunEvent>()
    const proc = launch(spec, input.cwd, input.env)
    const kill = () => { if (proc.exitCode === null) proc.kill() }
    input.signal.addEventListener('abort', kill, { once: true })
    const server = mcp({ ...(input.appChat && { appChat: input.appChat }), gate: input.canUseTool })
    let text = ''
    let thought = ''
    let loading = false
    let context: { used: number; window: number } | undefined
    const flush = () => {
      if (thought.trim()) out.push({ type: 'think', text: thought })
      if (text.trim()) out.push({ type: 'text', text })
      thought = ''
      text = ''
    }
    const onNotify = (method: string, params: Json) => {
      if (method !== 'session/update' || loading) return
      const u = rec(params.update)
      const kind = str(u.sessionUpdate)
      const chunk = str(rec(u.content).text)
      if (kind === 'agent_message_chunk' && chunk) {
        if (thought) { out.push({ type: 'think', text: thought }); thought = '' }
        text += chunk
        out.push({ type: 'delta', text: chunk })
      } else if (kind === 'agent_thought_chunk' && chunk) thought += chunk
      else if (kind === 'tool_call') {
        flush()
        const c = callsOf(u)[0]!
        if (!c.free) out.push({ type: 'tool', tool: c.tool, input: c.input })
      } else if (kind === 'plan') {
        out.push({ type: 'tool', tool: 'TodoWrite', input: { todos: list(u.entries).map(rec).map((e) => ({ content: str(e.content), status: str(e.status) })) } })
      } else if (kind === 'usage_update' && typeof u.used === 'number' && typeof u.size === 'number') context = { used: u.used, window: u.size }
    }
    const permission = async (params: Json): Promise<Json> => {
      const calls = callsOf(rec(params.toolCall))
      let ok: ToolDecision = { allow: true }
      for (const c of calls) {
        if (c.mcp || c.free) continue
        ok = await input.canUseTool(c.tool, c.input)
        if (!ok.allow) break
      }
      return optionFor(params.options, ok.allow)
    }
    const onRequest = async (method: string, params: Json): Promise<unknown> => {
      if (method === 'session/request_permission') return permission(params)
      throw new Error(`Method not supported: ${method}`)
    }
    const conn = new AcpConnection(proc, onNotify, onRequest)
    let failure: Error | undefined
    const work = (async () => {
      const init = rec(await conn.request('initialize', INIT))
      const caps = rec(init.agentCapabilities)
      const images = rec(caps.promptCapabilities).image === true
      const mcpServers = server && rec(caps.mcpCapabilities).http === true ? [{ type: 'http', name: MCP_NAME, url: server.url, headers: [] }] : []
      let sessionId = ''
      let opened: unknown
      if (input.sessionId && caps.loadSession === true) {
        loading = true
        try { opened = await conn.request('session/load', { sessionId: input.sessionId, cwd: input.cwd, mcpServers }); sessionId = input.sessionId } catch { /* 새 세션으로 */ } finally { loading = false }
      }
      const fresh = !sessionId
      if (fresh) {
        opened = await conn.request('session/new', { cwd: input.cwd, mcpServers })
        sessionId = str(rec(opened).sessionId)
        if (!sessionId) throw new Error(t('에이전트가 세션을 열지 못했습니다', 'The agent did not open a session'))
      }
      out.push({ type: 'session', id: sessionId })
      const want = spec.modeFor({ app: !!input.appChat, write: input.write })
      const modes = list(rec(rec(opened).modes).availableModes).map((m) => str(rec(m).id))
      if (want && modes.includes(want)) await conn.request('session/set_mode', { sessionId, modeId: want }).catch(() => undefined)
      if (input.model !== 'default') await conn.request('session/set_model', { sessionId, modelId: input.model }).catch(() => undefined)
      let stopping = false
      input.control?.({ interrupt: async () => { stopping = true; conn.notify('session/cancel', { sessionId }); return true } })
      // 새 세션이면 첫 지시 앞에 안내를 붙인다 (Claude는 시스템 프롬프트에 붙이는 것)
      const turn = async (x: Turn, first: boolean) => {
        const started = Date.now()
        stopping = false
        context = undefined
        const prompt = first && fresh ? `${input.brief}\n\n---\n\n${x.prompt}` : x.prompt
        const r = rec(await conn.request('session/prompt', { sessionId, prompt: blocksOf(prompt, x, images) }))
        flush()
        const reason = str(r.stopReason)
        const usage = rec(r.usage)
        const tokens = typeof usage.inputTokens === 'number' ? { in: usage.inputTokens, out: typeof usage.outputTokens === 'number' ? usage.outputTokens : 0 } : undefined
        const ok = reason === 'end_turn' || reason === 'max_tokens' || reason === 'max_turn_requests'
        const error = ok ? undefined : stopping || reason === 'cancelled' ? 'cancelled' : reason === 'refusal' ? t('에이전트가 이 지시를 거절했습니다', 'The agent refused this request') : reason || 'failed'
        out.push({ type: 'result', ok, seconds: Math.round((Date.now() - started) / 1000), ...(tokens && { tokens }), ...(context ? { context } : {}), ...(error !== undefined && { error }) })
      }
      await turn(input, true)
      if (input.inbox) for await (const x of input.inbox) await turn(x, false)
    })().catch((e: Error) => { if (!input.signal.aborted) failure = e }).finally(() => out.close())
    try {
      for await (const e of out) yield e
      await work
      if (failure) throw failure
    } finally {
      server?.close()
      kill()
    }
  }, { models: modelLister(spec) })
}
