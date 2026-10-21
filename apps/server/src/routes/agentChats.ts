// 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21): 대화 목록 · 만들기 · 이어서 지시 · 허락 답 · 멈추기 · 지우기, 지금 작업 상태
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentChats'
import { AgentChats, type AgentRunner } from '../agentChats.js'
import { claudeAgentRunner } from '../agentRunner.js'
import { parseBody, replies } from '../contract.js'
import { createMcpServer } from '../mcp.js'
import type { RouteContext } from './context.js'

/** 동시에 도는 대화 수 (맥 메모리가 바닥났던 일, 10/14) */
export const CHAT_LIMIT = 2

/** 앱 MCP가 같은 프로세스에서 앱 API를 부를 때: 네트워크 대신 fastify inject */
function injectFetch(app: FastifyInstance): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url: u.pathname + u.search,
      headers: init?.headers as Record<string, string> | undefined,
      ...(init?.body !== undefined && { payload: init.body as string }),
    })
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': String(res.headers['content-type'] ?? 'application/json') } })
  }) as typeof fetch
}

export function registerAgentChats(app: FastifyInstance, ctx: RouteContext, runner?: AgentRunner): AgentChats {
  const { registry, broadcast, repoPath } = ctx
  const chats = new AgentChats({
    dir: path.join(registry.configDir, 'agent-chats'),
    runner: runner ?? claudeAgentRunner(() => createMcpServer({ baseUrl: 'http://workbench.local', fetch: injectFetch(app) })),
    limit: CHAT_LIMIT,
    project: (rid) => ({ repo: repoPath(rid), title: registry.list().find((r) => r.id === rid)?.title ?? rid }),
    readable: () => [...(registry.libraryPath ? [registry.libraryPath] : []), ...registry.list().map((r) => r.path)],
    extraDirs: () => (registry.libraryPath ? [registry.libraryPath] : []),
    notify: (c) => broadcast({ type: 'agent-chat', research: c.rid, id: c.id }),
  })
  app.addHook('onClose', async () => chats.stopAll())

  app.get<{ Querystring: { rid?: string } }>('/api/agent-chats', replies(C.ChatList), async (req): Promise<C.ChatList> => ({ chats: chats.list(req.query.rid || undefined), limit: chats.limit }))

  app.post('/api/agent-chats', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.create(parseBody(C.NewChatBody, req.body)) }))

  app.get<{ Params: { id: string } }>('/api/agent-chats/:id', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.get(req.params.id) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/messages', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.send(req.params.id, parseBody(C.ChatMessageBody, req.body).text) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/answer', replies(C.ChatOne), async (req): Promise<C.ChatOne> => {
    const b = parseBody(C.AskAnswerBody, req.body)
    return { chat: chats.answer(req.params.id, b.ask, b.answer) }
  })

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/stop', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.stop(req.params.id) }))

  app.delete<{ Params: { id: string } }>('/api/agent-chats/:id', replies(C.ChatDeleted), async (req): Promise<C.ChatDeleted> => {
    chats.remove(req.params.id)
    return { ok: true }
  })

  /** 지금 도는 대화와 잡은 파일: 화면 · 앱 밖 에이전트가 같은 것을 보고 피한다 */
  app.get('/api/agent-work', replies(C.WorkState), async (): Promise<C.WorkState> => chats.work())

  return chats
}
