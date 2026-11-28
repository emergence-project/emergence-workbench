/**
 * 앱 MCP 도구의 성격 표 (2026-11-28 사용자 결정 "허락 판정이 등록 표시를 읽게").
 * 도구는 등록할 때 annotations.readOnlyHint로 읽기만 하는지 고치는지 밝힌다 (mcp.ts와 mcp*.ts, 플러그인의 mcp.register).
 * 허락 판정(agentPolicy.ts)은 손으로 적은 이름 목록 대신 이 표를 읽는다: 도구를 만들 때 성격을 한 번만 적으면 된다.
 * 표에 없는 이름과 표시가 없는 도구는 연구를 고치는 도구로 본다 (모르면 막는 쪽으로 틀린다).
 */
import { createMcpServer } from './mcp.js'
import { SERVER_PLUGINS } from './plugins/index.js'

/**
 * 고치는 표시가 붙었지만 연구 파일을 고치지 않는 도구. 여기에 없는 고치는 도구는 모두 연구 쓰기다.
 * 빠뜨리면 그 도구가 읽기 전용 대화에서 막힐 뿐이다 (묻지 않고 고치는 쪽으로는 틀리지 않는다).
 * - changes_since: 변경사항의 기준 시각만 옮긴다
 * - app_submit · app_merge · feedback_answer: 앱 고치기 대화의 도구 (judgeApp이 따로 판정한다)
 * - 나머지: 중앙 대화가 대화를 열고 맡기고 정리하는 도구 (judgeCentral), central_help는 중앙에 묻기
 */
export const NOT_RESEARCH_WRITES: ReadonlySet<string> = new Set([
  'changes_since', 'app_submit', 'app_merge', 'feedback_answer',
  'chat_open', 'chat_send', 'memo_write', 'chat_answer', 'chat_close', 'chat_archive', 'chat_unarchive', 'chat_priority', 'chat_review',
  'room_ask', 'room_invite', 'room_remove', 'debate_open', 'pr_hold', 'decision_add', 'central_help',
])

export type ToolKind = 'read' | 'write' | 'unmarked'

/** 대화 종류마다 나오는 도구가 달라, 모든 종류의 입구를 한 번씩 만들어 모은다 (도구를 부르지는 않는다) */
const VARIANTS = [{}, { appChat: 'kinds' }, { central: true }, { chat: 'kinds' }] as const

let table: ReadonlyMap<string, ToolKind> | undefined

/** 등록된 모든 앱 MCP 도구(모든 플러그인 포함)의 이름 → 성격 */
export function mcpToolKinds(): ReadonlyMap<string, ToolKind> {
  if (table) return table
  const kinds = new Map<string, ToolKind>()
  for (const v of VARIANTS) {
    const server = createMcpServer({ baseUrl: 'http://127.0.0.1:9', account: '', plugins: SERVER_PLUGINS, ...v })
    // SDK가 등록한 도구를 이름으로 쥐는 칸: 공개 목록 API(tools/list)는 연결한 뒤에만 쓸 수 있다
    const registered: unknown = Reflect.get(server, '_registeredTools')
    if (!registered || typeof registered !== 'object') throw new Error('MCP SDK: registered tools are not readable')
    for (const [name, tool] of Object.entries(registered)) {
      const hint: unknown = tool && typeof tool === 'object' ? Reflect.get(Reflect.get(tool, 'annotations') ?? {}, 'readOnlyHint') : undefined
      const kind: ToolKind = hint === true ? 'read' : hint === false ? 'write' : 'unmarked'
      // 같은 이름이 입구마다 다른 성격이면 고치는 쪽으로
      if (kinds.get(name) !== 'write' && kinds.get(name) !== 'unmarked') kinds.set(name, kind)
    }
  }
  if (kinds.size === 0) throw new Error('MCP SDK: no registered tools found')
  table = kinds
  return kinds
}

/** 연구(노트 · 기록 · 맡긴 일 · 흐름 · 개념노트)를 고치는 앱 MCP 도구인가. 모르는 이름은 그렇다고 본다 */
export function isResearchWrite(name: string): boolean {
  const kind = mcpToolKinds().get(name)
  if (kind === 'read') return false
  return !NOT_RESEARCH_WRITES.has(name)
}
