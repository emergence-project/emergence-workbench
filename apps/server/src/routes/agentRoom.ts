// 중앙 방 (11/20 사용자 결정 "중앙 = 여럿이 말하는 방"): 사용자의 방 관리(초대 · 권한 · 내보내기 · 규칙)와 방장의 MCP 도구(room_ask · room_invite · room_remove)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentChats'
import type { RoomChats } from '../agentRoom.js'
import { parseBody, replies } from '../contract.js'

export function registerAgentRoom(app: FastifyInstance, chats: RoomChats): void {
  app.get('/api/agent-room', replies(C.RoomState), async (): Promise<C.RoomState> => chats.roomState())
  app.post('/api/agent-room/invite', replies(C.RoomState), async (req): Promise<C.RoomState> => { const b = parseBody(C.RoomInviteBody, req.body); return chats.invite(b.agent, 'user', b.perm) })
  app.post('/api/agent-room/perm', replies(C.RoomState), async (req): Promise<C.RoomState> => { const b = parseBody(C.RoomPermBody, req.body); return chats.setPerm(b.agent, b.perm) })
  app.post('/api/agent-room/remove', replies(C.RoomState), async (req): Promise<C.RoomState> => chats.removeMember(parseBody(C.RoomAgentBody, req.body).agent, 'user'))
  app.post('/api/agent-room/rules', replies(C.RoomState), async (req): Promise<C.RoomState> => chats.setRules(parseBody(C.RoomRulesBody, req.body)))
  app.post('/api/agent-room/verdict', replies(C.RoomState), async (req): Promise<C.RoomState> => { const b = parseBody(C.VerdictFlipBody, req.body); return chats.flip(b.at, b.flipped) })
  // 방장(중앙 대화의 MCP)만 부른다
  app.post('/api/agent-room/host/invite', replies(C.RoomState), async (req): Promise<C.RoomState> => { const b = parseBody(C.RoomInviteBody, req.body); return chats.invite(b.agent, 'host', b.perm, b.reason) })
  app.post('/api/agent-room/host/remove', replies(C.RoomState), async (req): Promise<C.RoomState> => chats.removeMember(parseBody(C.RoomAgentBody, req.body).agent, 'host'))
  app.post('/api/agent-room/host/ask', replies(C.RoomAnswer), async (req): Promise<C.RoomAnswer> => { const b = parseBody(C.RoomAskBody, req.body); return { answer: await chats.hostAsk(b.agent, b.question) } })
}
