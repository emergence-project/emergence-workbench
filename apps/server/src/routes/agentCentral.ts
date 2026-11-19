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

  /** 사용자가 중앙에게 말하기 (중앙이 없으면 연다) */
  app.post('/api/agent-central/messages', replies(C.ChatOne), async (req): Promise<C.ChatOne> => ({ chat: chats.talk(parseBody(C.CentralMessageBody, req.body)) }))

  /** 중앙 에이전트가 하위 대화를 연다 · 이어 보낸다 · 허락에 답한다 · 닫는다 (chat_open · chat_send · chat_answer · chat_close) */
  app.post('/api/agent-central/open', replies(C.CentralOpened), async (req): Promise<C.CentralOpened> => chats.openOrHold(parseBody(C.CentralOpenBody, req.body)))
  app.post('/api/agent-central/send', replies(C.CentralKidOne), async (req): Promise<C.CentralKidOne> => {
    const b = parseBody(C.CentralSendBody, req.body)
    return { kid: chats.sendKid(b.id, b.text) }
  })
  app.post('/api/agent-central/answer', replies(C.CentralKidOne), async (req): Promise<C.CentralKidOne> => ({ kid: chats.answerKid(parseBody(C.CentralAnswerBody, req.body)) }))
  app.post('/api/agent-central/close', replies(C.CentralKidOne), async (req): Promise<C.CentralKidOne> => {
    const b = parseBody(C.CentralCloseBody, req.body)
    return { kid: chats.closeKid(b.id, b.summary) }
  })

  /** 다른 대화가 중앙에게 중재를 청한다 (central_help): 중앙을 깨운다 */
  app.post('/api/agent-central/help', replies(C.CentralHelped), async (req): Promise<C.CentralHelped> => {
    const b = parseBody(C.CentralHelpBody, req.body)
    return { central: chats.help(b.chat, b.text) }
  })
}
