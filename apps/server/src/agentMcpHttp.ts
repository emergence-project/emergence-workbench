/**
 * Codex · Gemini 대화가 쓰는 앱 MCP 입구 (10/30, agentAcp.ts): 대화가 열려 있는 동안만 POST /api/agent-mcp/<열쇠>.
 * - 열쇠는 대화마다 새로 만든 긴 무작위 값이고, 대화(실행기)가 끝나면 지운다. 이 맥의 앱 서버 주소로만 준다.
 * - Claude 대화와 같은 앱 MCP(createMcpServer, 같은 프로세스에서 inject)를 상태 없는 Streamable HTTP로 낸다.
 * - 도구 부르기(tools/call)마다 그 대화의 판단(canUseTool → judge)을 먼저 거친다: 에이전트가 허락을 묻지 않고 불러도
 *   읽기 전용 · 범위 · 잡은 파일 · 수정 검토가 Claude 대화와 같다. 막히면 에이전트에게 그 이유를 도구 오류로 돌려준다.
 */
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { MCP_NAME, type RunInput } from './agentChats.js'
import type { ChatMcp } from './agentAcp.js'

type Open = { appChat?: string; gate: RunInput['canUseTool'] }
type Json = Record<string, unknown>
const isRec = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** tools/call 하나를 판단한다. 막히면 그 요청에 줄 JSON-RPC 답 (도구 오류), 지나가면 undefined */
export async function gateCall(gate: Open['gate'], msg: unknown): Promise<Json | undefined> {
  if (!isRec(msg) || msg.method !== 'tools/call' || !isRec(msg.params)) return undefined
  const name = typeof msg.params.name === 'string' ? msg.params.name : ''
  const d = await gate(`mcp__${MCP_NAME}__${name}`, isRec(msg.params.arguments) ? msg.params.arguments : {})
  if (d.allow) return undefined
  return { jsonrpc: '2.0', id: msg.id ?? null, result: { content: [{ type: 'text', text: d.message }], isError: true } }
}

export function registerChatMcp(app: FastifyInstance, make: (appChat?: string) => McpServer): ChatMcp {
  const open = new Map<string, Open>()

  app.post<{ Params: { key: string } }>('/api/agent-mcp/:key', async (req, reply) => {
    const o = open.get(req.params.key)
    if (!o) return reply.status(404).send({ error: 'Not found' })
    // 한 번에 하나 (묶음은 받지 않는다: 지금 MCP 클라이언트는 하나씩 보낸다)
    if (Array.isArray(req.body)) return reply.status(400).send({ error: 'Batch requests are not supported' })
    const blocked = await gateCall(o.gate, req.body)
    if (blocked) return reply.send(blocked)
    const server = make(o.appChat)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    reply.hijack()
    reply.raw.on('close', () => { void transport.close(); void server.close() })
    await server.connect(transport)
    await transport.handleRequest(req.raw, reply.raw, req.body)
  })
  // 상태 없는 입구라 알림 흐름(GET)과 세션 끝(DELETE)은 없다
  for (const method of ['GET', 'DELETE'] as const) app.route({ method, url: '/api/agent-mcp/:key', handler: async (_req, reply) => reply.status(405).header('allow', 'POST').send({ error: 'Method not allowed' }) })

  return (o) => {
    const a = app.server.address()
    if (!a || typeof a === 'string') return undefined
    const key = crypto.randomBytes(24).toString('hex')
    open.set(key, o)
    const host = a.family === 'IPv6' ? `[${a.address === '::' ? '::1' : a.address}]` : a.address === '0.0.0.0' ? '127.0.0.1' : a.address
    return { url: `http://${host}:${a.port}/api/agent-mcp/${key}`, close: () => { open.delete(key) } }
  }
}
