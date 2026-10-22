/**
 * 에이전트 대화의 실제 실행기: 맥의 Claude Code를 Claude Agent SDK로 띄운다 (agentChats.ts의 AgentRunner).
 * - 저장소 · 사용자 설정(훅 · 허락 규칙)은 읽지 않는다(settingSources: []). 허락은 모두 앱의 canUseTool이 정한다.
 *   저장소 규칙(AGENTS.md · 공통 규칙)은 앱 MCP의 rules 도구로 읽는다.
 * - 앱 MCP를 같은 프로세스에서 붙인다(mcpFor). 그래서 에이전트는 화면과 같은 API · hash · 수정 검토를 거친다.
 * - 모드 · 모델 · 생각 깊이는 차례마다 대화의 값으로 (화면에서 바꾸면 다음 차례부터). 붙여 넣은 그림은 지시와 함께 보낸다.
 * - 앱 고치기 대화(appChat)는 작업 폴더의 파일 고치기 도구와 명령을 연다(허락은 judge). 앱 MCP에 app_submit · app_checks가 붙는다.
 * - 고를 수 있는 모델은 맥의 Claude Code에게 묻는다(models, GET /agent-chats/models). 기본 모델 = 그 계정의 Claude Code 기본값(사용자 설정은 읽지 않으므로).
 * - SDK는 처음 쓸 때 불러온다(dynamic import): 대화를 쓰지 않으면 앱 시작에 들지 않는다.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { FILE_WRITE_TOOLS, MCP_NAME, type AgentRunner, type RunEvent, type RunInput } from './agentChats.js'
import { CHAT_EFFORTS, type ChatEffort, type ModelChoice } from '@rw/core/contract/agentChats'
import { claudeEnv } from './ask.js'

type Block = { type: string; text?: string; name?: string; input?: unknown }

/** SDK 메시지 하나를 대화 사건으로 (모르는 것은 버린다) */
export function eventsOf(m: { type: string; subtype?: string; session_id?: string; message?: { content?: unknown }; parent_tool_use_id?: string | null; is_error?: boolean; total_cost_usd?: number; duration_ms?: number; errors?: string[]; result?: string }): RunEvent[] {
  if (m.type === 'system' && m.subtype === 'init' && m.session_id) return [{ type: 'session', id: m.session_id }]
  if (m.type === 'assistant') {
    const sub = m.parent_tool_use_id ? true : undefined
    const blocks = Array.isArray(m.message?.content) ? (m.message!.content as Block[]) : []
    const out: RunEvent[] = []
    for (const b of blocks) {
      if (b.type === 'text' && b.text) out.push({ type: 'text', text: b.text, ...(sub && { sub }) })
      else if (b.type === 'tool_use' && b.name) out.push({ type: 'tool', tool: b.name, input: (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>, ...(sub && { sub }) })
    }
    return out
  }
  if (m.type === 'result') {
    const ok = m.subtype === 'success' && !m.is_error
    const error = ok ? undefined : (m.errors?.join('\n') || (m.is_error ? m.result : undefined) || m.subtype)
    return [{ type: 'result', ok, ...(typeof m.total_cost_usd === 'number' && { cost: m.total_cost_usd }), ...(typeof m.duration_ms === 'number' && { seconds: Math.round(m.duration_ms / 1000) }), ...(error && { error }) }]
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
      const q = query({ prompt: prompt(), options: { settingSources: [], env: claudeEnv() } })
      try { return choicesOf(await q.supportedModels()) } finally { done(); q.close() }
    })()
    got = { at: Date.now(), list }
    // 실패하면 다음에 다시 묻는다
    list.catch(() => { got = undefined })
    return list
  }
}

export function claudeAgentRunner(mcpFor: (appChat?: string) => McpServer): AgentRunner {
  return Object.assign(async function* run(input: RunInput): AsyncIterable<RunEvent> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    let done!: () => void
    const finished = new Promise<void>((r) => { done = r })
    // 지시 하나를 보낸 뒤 차례가 끝날 때까지 입력을 열어 둔다 (앱 MCP를 같은 프로세스에 붙이려면 입력 흐름 방식)
    async function* prompt() {
      const content = input.images?.length
        ? [{ type: 'text' as const, text: input.prompt }, ...input.images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.type, data: i.data } }))]
        : input.prompt
      yield { type: 'user' as const, message: { role: 'user' as const, content }, parent_tool_use_id: null }
      await finished
    }
    const abortController = new AbortController()
    input.signal.addEventListener('abort', () => { abortController.abort(); done() }, { once: true })
    const q = query({
      prompt: prompt(),
      options: {
        cwd: input.cwd,
        additionalDirectories: input.extraDirs,
        ...(input.sessionId && { resume: input.sessionId }),
        settingSources: [],
        strictMcpConfig: true,
        mcpServers: { [MCP_NAME]: { type: 'sdk', name: MCP_NAME, instance: mcpFor(input.appChat) } },
        disallowedTools: input.appChat ? [] : [...FILE_WRITE_TOOLS],
        systemPrompt: { type: 'preset', preset: 'claude_code', append: input.brief },
        // 계획 먼저: SDK의 계획 모드로 시작하고, ExitPlanMode(계획 카드)를 허락하면 SDK가 보통 모드로 돌아온다. 고치기 허락은 늘 앱이 정한다
        permissionMode: input.mode === 'plan' && input.write !== 'read' ? 'plan' : 'default',
        ...(input.model !== 'default' && { model: input.model }),
        effort: input.effort,
        canUseTool: async (tool, toolInput) => {
          const d = await input.canUseTool(tool, toolInput)
          return d.allow ? { behavior: 'allow', updatedInput: toolInput } : { behavior: 'deny', message: d.message }
        },
        abortController,
        env: { ...claudeEnv(), ...input.env },
      },
    })
    try {
      for await (const m of q) {
        for (const e of eventsOf(m as Parameters<typeof eventsOf>[0])) {
          yield e
          if (e.type === 'result') done()
        }
      }
    } finally {
      done()
      q.close()
    }
  }, { models: modelLister() })
}
