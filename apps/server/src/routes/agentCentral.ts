// 중앙 대화 (11/16 "중앙 에이전트"): 화면은 중앙 상태 · 말하기, 중앙 에이전트는 앱 MCP(chat_*)로 하위 대화를 열고 · 보내고 · 닫는다
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentChats'
import type { CentralChats } from '../agentCentral.js'
import { parseBody, replies } from '../contract.js'

export function registerAgentCentral(app: FastifyInstance, chats: CentralChats): void {
  /** 중앙 대화 id와 하위 대화 (화면 · chat_list) */
  app.get('/api/agent-central', replies(C.CentralState), async (): Promise<C.CentralState> => chats.centralState())

  /** 에이전트 차례인 피드백 (feedback_turns) */
  app.get('/api/agent-central/feedback', replies(C.CentralFeedback), async (): Promise<C.CentralFeedback> => chats.feedbackTurns())

  /** 중앙 메모 (설정 › 에이전트, memo_write): 사용자가 정한 오래 갈 사실 */
  app.get('/api/agent-central/memo', replies(C.CentralMemo), async (): Promise<C.CentralMemo> => chats.memo())
  app.post('/api/agent-central/memo', replies(C.CentralMemo), async (req): Promise<C.CentralMemo> => chats.setMemo(parseBody(C.CentralMemoBody, req.body).text))

  /** 사용자가 중앙에게 말하기 (중앙이 없으면 연다) */
  app.post('/api/agent-central/messages', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.talk(parseBody(C.CentralMessageBody, req.body).text) }))

  /** 중앙 에이전트가 하위 대화를 연다 · 이어 보낸다 · 닫는다 (chat_open · chat_send · chat_close) */
  app.post('/api/agent-central/open', replies(C.CentralKidOne), async (req): Promise<C.CentralKidOne> => ({ kid: await chats.openKid(parseBody(C.CentralOpenBody, req.body)) }))
  app.post('/api/agent-central/send', replies(C.CentralKidOne), async (req): Promise<C.CentralKidOne> => {
    const b = parseBody(C.CentralSendBody, req.body)
    return { kid: chats.sendKid(b.id, b.text) }
  })
  app.post('/api/agent-central/close', replies(C.CentralKidOne), async (req): Promise<C.CentralKidOne> => {
    const b = parseBody(C.CentralCloseBody, req.body)
    return { kid: chats.closeKid(b.id, b.summary) }
  })
}
