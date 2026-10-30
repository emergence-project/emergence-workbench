/**
 * 에이전트 대화의 실제 실행기: 맥의 Claude Code를 Claude Agent SDK로 띄운다 (agentChats.ts의 AgentRunner).
 * - 저장소 · 사용자 설정(훅 · 허락 규칙)은 읽지 않는다(settingSources: []). 허락은 모두 앱의 canUseTool이 정한다.
 *   저장소 규칙(AGENTS.md · 공통 규칙)은 앱 MCP의 rules 도구로 읽는다.
 * - 앱 MCP를 같은 프로세스에서 붙인다(mcpFor). 그래서 에이전트는 화면과 같은 API · hash · 수정 검토를 거친다.
 * - 모드 · 모델 · 생각 깊이는 차례마다 대화의 값으로 (화면에서 바꾸면 다음 차례부터). 붙여 넣은 그림은 지시와 함께 보낸다.
 * - 앱 고치기 대화(appChat)는 작업 폴더의 파일 고치기 도구와 명령을 연다(허락은 judge). 앱 MCP에 app_submit · app_checks가 붙는다.
 * - 고를 수 있는 모델은 맥의 Claude Code에게 묻는다(models, GET /agent-chats/models). 기본 모델 = 그 계정의 Claude Code 기본값(사용자 설정은 읽지 않으므로).
 * - SDK는 처음 쓸 때 불러온다(dynamic import): 대화를 쓰지 않으면 앱 시작에 들지 않는다.
 * - Claude Code처럼 차례가 끝나도 닫지 않는다(input.inbox): 다음 지시를 같은 프로세스에 넘기고, 일하는 중에 보낸 말은 SDK가 그 차례에 섞어 읽는다.
 *   그래서 뒤에서 돌린 명령(run_in_background)도 살아 있다가, 끝나면 에이전트가 스스로 이어서 일한다. 앱이 inbox를 닫으면 끝난다.
 * - 글은 쓰는 대로 조각(delta)으로 넘기고(includePartialMessages), 생각은 요약을 받아(summarized) 대화에 접어 보인다.
 * - 곁 질문(side)은 따로 작은 모델(SIDE_MODEL)을 도구 없이 한 번 띄워 답한다. 하던 대화의 세션 · 맥락에 들지 않는다.
 * - 맥락이 AUTO_COMPACT_WINDOW에 가까워지면 Claude Code가 앞 내용을 요약해 이어 간다(자동 맥락 줄이기). /compact · /context 같은 명령도 그대로 넘긴다.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { EXPLORE_AGENT, FILE_WRITE_TOOLS, MCP_NAME, type AgentRunner, type RunEvent, type RunInput, type Turn } from './agentChats.js'
import { CHAT_EFFORTS, type ChatEffort, type ModelChoice } from '@rw/core/contract/agentChats'
import { claudeEnv, claudeExecutable } from './ask.js'
import { skillsPluginDir, userConnectors } from './agentExtras.js'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'

/** 묶은 앱이면 이 컴퓨터의 claude를 쓴다 (ask.ts의 claudeExecutable) */
const executable = (): { pathToClaudeCodeExecutable?: string } => { const p = claudeExecutable(); return p ? { pathToClaudeCodeExecutable: p } : {} }

type Block = { type: string; text?: string; thinking?: string; name?: string; input?: unknown }
type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

/** 넣은 토큰 (캐시에서 읽은 것 · 캐시에 쓴 것 포함) */
const inputOf = (u: Usage) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)

/**
 * 맥락이 이만큼 되면 앞 내용을 요약한다 (토큰, Claude Code의 CLAUDE_CODE_AUTO_COMPACT_WINDOW, 10만부터).
 * 긴 대화 하나가 차례마다 앞 내용 전체(29만 토큰까지)를 다시 읽어 값이 커져서 (10/22) 1M 모델도 이쯤에서 줄인다.
 */
export const AUTO_COMPACT_WINDOW = 120_000

type Sdk = {
  type: string; uuid?: string; subtype?: string; session_id?: string; message?: { content?: unknown }; parent_tool_use_id?: string | null; is_error?: boolean
  total_cost_usd?: number; duration_ms?: number; errors?: string[]; result?: string; usage?: Usage; modelUsage?: Record<string, { contextWindow?: number }>
  event?: { type?: string; delta?: { type?: string; text?: string } }
  status?: string | null; compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number }; tasks?: { ambient?: boolean }[]
}

/** SDK 메시지 하나를 대화 사건으로 (모르는 것은 버린다) */
/** context = 이 차례 마지막 요청의 맥락 크기 (주 에이전트의 마지막 응답에서, 실행기가 세어 넘긴다) */
export function eventsOf(m: Sdk, context?: number): RunEvent[] {
  if (m.type === 'system' && m.subtype === 'init' && m.session_id) return [{ type: 'session', id: m.session_id }]
  if (m.type === 'system' && m.subtype === 'status') return [{ type: 'status', compacting: m.status === 'compacting' }]
  if (m.type === 'system' && m.subtype === 'compact_boundary' && m.compact_metadata) {
    const x = m.compact_metadata
    return [{ type: 'compact', auto: x.trigger === 'auto', before: x.pre_tokens ?? 0, ...(typeof x.post_tokens === 'number' && { after: x.post_tokens }) }]
  }
  // 뒤에서 도는 명령 · 하위 에이전트 (ambient = 사용자가 볼 일이 아닌 것은 세지 않는다)
  if (m.type === 'system' && m.subtype === 'background_tasks_changed' && Array.isArray(m.tasks)) return [{ type: 'tasks', count: m.tasks.filter((x) => !x.ambient).length }]
  if (m.type === 'assistant') {
    const sub = m.parent_tool_use_id ? true : undefined
    const blocks = Array.isArray(m.message?.content) ? (m.message!.content as Block[]) : []
    const out: RunEvent[] = []
    for (const b of blocks) {
      if (b.type === 'text' && b.text) out.push({ type: 'text', text: b.text, ...(sub && { sub }) })
      else if (b.type === 'thinking' && b.thinking?.trim() && !sub) out.push({ type: 'think', text: b.thinking })
      else if (b.type === 'tool_use' && b.name) out.push({ type: 'tool', tool: b.name, input: (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>, ...(sub && { sub }) })
    }
    return out
  }
  // 쓰는 중인 글 (주 에이전트만)
  if (m.type === 'stream_event' && !m.parent_tool_use_id && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta' && m.event.delta.text) return [{ type: 'delta', text: m.event.delta.text }]
  if (m.type === 'result') {
    const ok = m.subtype === 'success' && !m.is_error
    const error = ok ? undefined : (m.errors?.join('\n') || (m.is_error ? m.result : undefined) || m.subtype)
    const window = Math.max(0, ...Object.values(m.modelUsage ?? {}).map((x) => x.contextWindow ?? 0))
    return [{
      type: 'result', ok,
      ...(typeof m.total_cost_usd === 'number' && { cost: m.total_cost_usd }),
      ...(typeof m.duration_ms === 'number' && { seconds: Math.round(m.duration_ms / 1000) }),
      ...(m.usage && { tokens: { in: inputOf(m.usage), out: m.usage.output_tokens ?? 0 } }),
      ...(context && window && { context: { used: context, window } }),
      ...(error && { error }),
    }]
  }
  return []
}

const EFFORTS = new Set<string>(CHAT_EFFORTS)
const MODEL_ID = /^[a-z][a-z0-9.\-[\]]{0,79}$/

/** SDK의 모델 목록을 화면에 보낼 모양으로 (계약에 맞지 않는 id · 생각 깊이는 뺀다) */
export function choicesOf(list: { value: string; displayName: string; description: string; resolvedModel?: string; supportedEffortLevels?: string[] }[]): ModelChoice[] {
  return list.filter((m) => MODEL_ID.test(m.value)).map((m) => {
    const efforts = (m.supportedEffortLevels ?? []).filter((e): e is ChatEffort => EFFORTS.has(e))
    return { value: m.value, name: m.displayName, desc: m.description, ...(m.resolvedModel && { resolved: m.resolvedModel }), ...(efforts.length && { efforts }) }
  })
}

/** 고를 수 있는 모델: 지시 없이 Claude Code를 띄워 묻고 닫는다(토큰을 쓰지 않음). 30분 동안 기억한다 */
function modelLister(): () => Promise<ModelChoice[]> {
  let got: { at: number; list: Promise<ModelChoice[]> } | undefined
  return () => {
    if (got && Date.now() - got.at < 30 * 60_000) return got.list
    const list = (async () => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')
      let done!: () => void
      const finished = new Promise<void>((r) => { done = r })
      async function* prompt() { await finished }
      const q = query({ prompt: prompt(), options: { settingSources: [], env: claudeEnv(), ...executable() } })
      try { return choicesOf(await q.supportedModels()) } finally { done(); q.close() }
    })()
    got = { at: Date.now(), list }
    // 실패하면 다음에 다시 묻는다
    list.catch(() => { got = undefined })
    return list
  }
}

/** 곁 질문에 쓰는 작은 모델 */
export const SIDE_MODEL = 'haiku'

/** 곁 질문: 도구 · 저장소 설정 없이 한 번 묻고 답을 받는다 (세션을 남기지 않는다) */
async function sideAnswer(o: { prompt: string; cwd: string }): Promise<string> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const q = query({ prompt: o.prompt, options: { cwd: o.cwd, settingSources: [], strictMcpConfig: true, tools: [], maxTurns: 1, model: SIDE_MODEL, persistSession: false, env: claudeEnv(), ...executable() } })
  let answer = ''
  try {
    for await (const m of q) {
      const r = m as { type: string; subtype?: string; result?: string; is_error?: boolean; errors?: string[] }
      if (r.type !== 'result') continue
      if (r.subtype !== 'success' || r.is_error) throw new Error(r.errors?.join('\n') || r.result || r.subtype || 'failed')
      answer = r.result ?? ''
    }
  } finally { q.close() }
  return answer
}

/** 탐색을 맡는 하위 에이전트의 모델 (작고 빠른 것) */
export const EXPLORE_MODEL = 'haiku'
/** 읽기만 하는 앱 MCP 도구 (하위 에이전트도 같은 허락 규칙을 거친다) */
const READ_MCP = ['rules', 'list_projects', 'overview', 'project_status', 'list_notes', 'list_edit_reviews', 'read_note', 'read_records', 'list_records', 'flow_search', 'flow_read', 'list_tasks', 'read_task', 'search_library', 'read_concept']
const exploreAgent = {
  description: 'Fast read-only explorer on a small model. Use it to search across many files or read several large files; it returns only the findings (paths, line numbers, short quotes), so the main conversation stays short.',
  tools: ['Read', 'Glob', 'Grep', ...READ_MCP.map((t) => `mcp__${MCP_NAME}__${t}`)],
  model: EXPLORE_MODEL,
  prompt: 'You search and read for another agent. Do not change anything. Answer with only what was asked: the relevant file paths with line numbers, short quotes, and a few lines of conclusion. Do not paste whole files.',
}

export function claudeAgentRunner(mcpFor: (appChat?: string) => McpServer): AgentRunner {
  return Object.assign(async function* run(input: RunInput): AsyncIterable<RunEvent> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    let done!: () => void
    const finished = new Promise<void>((r) => { done = r })
    const userMsg = (x: Turn) => {
      const content = x.images?.length
        ? [{ type: 'text' as const, text: x.prompt }, ...x.images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.type, data: i.data } }))]
        : x.prompt
      return { type: 'user' as const, message: { role: 'user' as const, content }, parent_tool_use_id: null }
    }
    // 입력 흐름 방식 (앱 MCP를 같은 프로세스에 붙이려면): 첫 지시 뒤 inbox의 지시를 넘기고, inbox가 닫히면 입력을 끝낸다.
    // inbox가 없으면 지시 하나의 차례가 끝날 때까지만 연다
    async function* prompt() {
      yield userMsg(input)
      if (!input.inbox) { await finished; return }
      for await (const x of input.inbox) yield userMsg(x)
    }
    const abortController = new AbortController()
    input.signal.addEventListener('abort', () => { abortController.abort(); done() }, { once: true })
    const q = query({
      prompt: prompt(),
      options: {
        cwd: input.cwd,
        additionalDirectories: input.extraDirs,
        ...(input.sessionId && { resume: input.sessionId }),
        // 되돌린 뒤: 그 메시지까지만 이어 새 세션으로 가른다 (원래 세션은 그대로)
        ...(input.sessionId && input.resumeAt && { resumeSessionAt: input.resumeAt, forkSession: true }),
        agents: { [EXPLORE_AGENT]: exploreAgent },
        settingSources: [],
        strictMcpConfig: true,
        // 맥의 Claude Code 커넥터(사용자 범위 MCP 서버)와 스킬 (10/21 22:40). 사용자 설정 파일은 여전히 읽지 않는다
        mcpServers: { ...userConnectors(MCP_NAME) as Record<string, McpServerConfig>, [MCP_NAME]: { type: 'sdk', name: MCP_NAME, instance: mcpFor(input.appChat) } },
        ...(() => { const dir = skillsPluginDir(); return dir ? { plugins: [{ type: 'local' as const, path: dir }], skills: 'all' as const } : {} })(),
        disallowedTools: input.appChat ? [] : [...FILE_WRITE_TOOLS],
        systemPrompt: { type: 'preset', preset: 'claude_code', append: input.brief },
        // 계획 먼저: SDK의 계획 모드로 시작하고, ExitPlanMode(계획 카드)를 허락하면 SDK가 보통 모드로 돌아온다. 고치기 허락은 늘 앱이 정한다
        permissionMode: input.mode === 'plan' && input.write !== 'read' ? 'plan' : 'default',
        ...(input.model !== 'default' && { model: input.model }),
        effort: input.effort,
        includePartialMessages: true,
        canUseTool: async (tool, toolInput) => {
          const d = await input.canUseTool(tool, toolInput)
          return d.allow ? { behavior: 'allow', updatedInput: toolInput } : { behavior: 'deny', message: d.message }
        },
        abortController,
        env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(AUTO_COMPACT_WINDOW), ...claudeEnv(), ...input.env },
        ...executable(),
      },
    })
    // 생각은 요약으로 받는다 (모델마다 기본이 '보이지 않음'일 수 있다). 못 바꾸면 그대로 둔다
    void q.setMaxThinkingTokens(null, 'summarized').catch(() => undefined)
    // 멈춤: 하던 차례만 끊는다. 이미 넘긴 지시가 남아 이어 돌면(still_queued) false라 앱이 에이전트를 닫는다
    input.control?.({ interrupt: async () => { const r = await q.interrupt(); return !(r && 'still_queued' in r && Array.isArray(r.still_queued) && r.still_queued.length) } })
    let context = 0
    try {
      for await (const m of q) {
        const msg = m as Parameters<typeof eventsOf>[0] & { message?: { usage?: Usage } }
        if (msg.type === 'assistant' && !msg.parent_tool_use_id && msg.message?.usage) context = inputOf(msg.message.usage) + (msg.message.usage.output_tokens ?? 0)
        for (const e of eventsOf(msg, context)) {
          yield e
          if (e.type === 'result' && !input.inbox) done()
        }
        if (msg.type === 'assistant' && !msg.parent_tool_use_id && msg.uuid) yield { type: 'mark', uuid: msg.uuid }
      }
    } finally {
      done()
      q.close()
    }
  }, { models: modelLister(), side: sideAnswer })
}
