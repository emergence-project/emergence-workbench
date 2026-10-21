// ---------- 에이전트 대화 (프로젝트 관리 1단계, 10/21): 서버 routes/agentChats.ts. 대화는 앱 설정 폴더에 있다 ----------
import { enc, json, req, send } from './http'

// 타입은 서버와 같은 계약에서 (packages/core/src/contract/agentChats.ts)
import type { AskAnswer, ChatDeleted, ChatList, ChatOne, NewChatBody, WorkState } from '@rw/core/contract/agentChats'
export type { AskAnswer, Chat, ChatItem, ChatRow, ChatScope, ChatState, ChatWrite, NewChatBody, WorkState } from '@rw/core/contract/agentChats'

const base = '/api/agent-chats'
export const agentChatsApi = {
  /** rid가 없으면 모든 프로젝트의 대화 */
  list: (rid?: string) => req(`${base}${rid ? `?rid=${enc(rid)}` : ''}`).then((r) => json<ChatList>(r)),
  get: (id: string) => req(`${base}/${enc(id)}`).then((r) => json<ChatOne>(r)).then((r) => r.chat),
  create: (body: NewChatBody) => req(base, send('POST', body)).then((r) => json<ChatOne>(r)).then((r) => r.chat),
  send: (id: string, text: string) => req(`${base}/${enc(id)}/messages`, send('POST', { text })).then((r) => json<ChatOne>(r)).then((r) => r.chat),
  answer: (id: string, ask: string, answer: AskAnswer) => req(`${base}/${enc(id)}/answer`, send('POST', { ask, answer })).then((r) => json<ChatOne>(r)).then((r) => r.chat),
  stop: (id: string) => req(`${base}/${enc(id)}/stop`, send('POST', {})).then((r) => json<ChatOne>(r)).then((r) => r.chat),
  remove: (id: string) => req(`${base}/${enc(id)}`, { method: 'DELETE' }).then((r) => json<ChatDeleted>(r)),
  work: () => req('/api/agent-work').then((r) => json<WorkState>(r)),
}
