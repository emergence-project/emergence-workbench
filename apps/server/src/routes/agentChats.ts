// 에이전트 대화 (프로젝트 관리 1단계, 2026-10-21): 대화 목록 · 만들기 · 이어서 지시 · 허락 답 · 모드 바꾸기 · 멈추기 · 지우기, 지금 작업 상태
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentChats'
import { AgentChats, type AgentRunner } from '../agentChats.js'
import type { AppWork } from '../appWorktree.js'
import { claudeAgentRunner } from '../agentRunner.js'
import { parseBody, replies } from '../contract.js'
import { createMcpServer } from '../mcp.js'
import { commitChecker } from '../commitsInApp.js'
import { repeat } from '../scheduler.js'
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

export function registerAgentChats(app: FastifyInstance, ctx: RouteContext, runner?: AgentRunner, appWork?: AppWork): AgentChats {
  const { registry, broadcast, repoPath } = ctx
  const chats = new AgentChats({
    dir: path.join(registry.configDir, 'agent-chats'),
    runner: runner ?? claudeAgentRunner((appChat) => createMcpServer({ baseUrl: 'http://workbench.local', fetch: injectFetch(app), appChat })),
    limit: CHAT_LIMIT,
    project: (rid) => ({ repo: repoPath(rid), title: registry.list().find((r) => r.id === rid)?.title ?? rid }),
    readable: () => [...(registry.libraryPath ? [registry.libraryPath] : []), ...registry.list().map((r) => r.path)],
    extraDirs: () => (registry.libraryPath ? [registry.libraryPath] : []),
    notify: (c) => broadcast({ type: 'agent-chat', research: c.rid, id: c.id }),
    ...(appWork && { app: appWork }),
    ...(ctx.opts.feedbackDir && { feedback: { dir: ctx.opts.feedbackDir, written: () => ctx.feedbackWritten?.() } }),
    settings: () => registry.agents,
    ...(ctx.opts.appRepo && { inApp: commitChecker(ctx.opts.appRepo.root, ctx.opts.appRepo.running) }),
  })
  // 피드백 대화 돌보기 (CI 빨강 다시 보내기 · 합치기 · 반영됨 · 저절로 맡기기): 1분마다
  if (appWork && ctx.opts.feedbackDir) repeat(app, { first: 60_000, every: 60_000, run: () => chats.tickFeedback() })
  app.addHook('onClose', async () => chats.stopAll())

  app.get<{ Querystring: { rid?: string } }>('/api/agent-chats', replies(C.ChatList), async (req): Promise<C.ChatList> => ({ chats: chats.list(req.query.rid || undefined), limit: chats.limit, app: chats.app, handOff: chats.handOffOk }))

  app.post('/api/agent-chats', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.create(parseBody(C.NewChatBody, req.body)) }))

  app.get<{ Params: { id: string } }>('/api/agent-chats/:id', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.get(req.params.id) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/messages', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.send(req.params.id, parseBody(C.ChatMessageBody, req.body)) }))

  /** 모드 · 모델 · 생각 깊이 (다음 차례부터) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/settings', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.settings(req.params.id, parseBody(C.ChatSettings, req.body)) }))

  /** 늘 허락한 것 하나 빼기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/forget', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.forget(req.params.id, parseBody(C.ForgetBody, req.body).label) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/answer', replies(C.ChatOne), async (req): Promise<C.ChatOne> => {
    const b = parseBody(C.AskAnswerBody, req.body)
    return { chat: chats.answer(req.params.id, b.ask, b.answer, { note: b.note, mode: b.mode }) }
  })

  /** 도는 동안 보내 기다리는 지시 하나 빼기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/unqueue', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.unqueue(req.params.id, parseBody(C.UnqueueBody, req.body).index) }))

  /** 보관함에 넣기 · 꺼내기 */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/archive', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.archive(req.params.id, parseBody(C.ArchiveBody, req.body).archived) }))

  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/stop', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.stop(req.params.id) }))

  app.delete<{ Params: { id: string } }>('/api/agent-chats/:id', replies(C.ChatDeleted), async (req): Promise<C.ChatDeleted> => {
    chats.remove(req.params.id)
    return { ok: true }
  })

  /** 앱 고치기 대화: 커밋해 PR 열기 · CI 결과 (에이전트가 앱 MCP app_submit · app_checks로 부른다) */
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/app/submit', replies(C.AppSubmitted), async (req): Promise<C.AppSubmitted> => chats.appSubmit(req.params.id, parseBody(C.AppSubmitBody, req.body)))
  app.get<{ Params: { id: string } }>('/api/agent-chats/:id/app/checks', replies(C.AppChecks), async (req): Promise<C.AppChecks> => chats.appChecks(req.params.id))
  // 피드백 맡기기 (2단계 나): 피드백 화면의 「에이전트에게 맡기기」와, 맡은 대화가 처리 기록을 앱을 거쳐 적는 feedback_answer
  app.post('/api/feedback/hand-off', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.handOff(parseBody(C.HandOffBody, req.body).key) }))
  app.post<{ Params: { id: string } }>('/api/agent-chats/:id/feedback/answer', replies(C.FeedbackAnswered), async (req): Promise<C.FeedbackAnswered> => chats.feedbackAnswer(req.params.id, parseBody(C.FeedbackAnswerBody, req.body)))

  /** 지금 도는 대화와 잡은 파일: 화면 · 앱 밖 에이전트가 같은 것을 보고 피한다 */
  app.get('/api/agent-work', replies(C.WorkState), async (): Promise<C.WorkState> => chats.work())

  return chats
}
