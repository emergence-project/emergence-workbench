// ---------- 에이전트 대화 (10/21): 서버 routes/agentChats.ts. 대화는 앱 설정 폴더에 있다 ----------
import { enc, json, req, send } from './http'

// 타입은 서버와 같은 계약에서 (packages/core/src/contract/agentChats.ts)
import type { AskAnswer, ChatDeleted, ChatList, ChatMessageBody, ChatMode, ChatOne, ChatSettings, NewChatBody, WorkState } from '@rw/core/contract/agentChats'
export type { AskAnswer, Attach, AttachKind, Chat, ChatEffort, ChatItem, ChatMessageBody, ChatMode, ChatModel, ChatRow, ChatScope, ChatSettings, ChatState, ChatWrite, ImageIn, NewChatBody, Todo, WorkState } from '@rw/core/contract/agentChats'

/** 앱 고치기 대화의 rid (계약의 APP_RID와 같은 값. 값을 가져오면 화면 번들에 zod가 들어가서 여기 다시 적는다) */
export const APP_RID = '_app'

const base = '/api/agent-chats'
const one = (r: Response) => json<ChatOne>(r).then((x) => x.chat)
export const agentChatsApi = {
  /** rid가 없으면 모든 프로젝트의 대화 */
  list: (rid?: string) => req(`${base}${rid ? `?rid=${enc(rid)}` : ''}`).then((r) => json<ChatList>(r)),
  get: (id: string) => req(`${base}/${enc(id)}`).then(one),
  create: (body: NewChatBody) => req(base, send('POST', body)).then(one),
  /** 이어서 지시 (일하는 중이면 다음 차례에 읽는다) */
  send: (id: string, body: ChatMessageBody) => req(`${base}/${enc(id)}/messages`, send('POST', body)).then(one),
  settings: (id: string, body: ChatSettings) => req(`${base}/${enc(id)}/settings`, send('POST', body)).then(one),
  forget: (id: string, label: string) => req(`${base}/${enc(id)}/forget`, send('POST', { label })).then(one),
  /** 허락 · 계획 카드에 답하기. 거절에는 할 말(note), 계획 승인에는 이어 갈 맡기는 정도(mode) */
  answer: (id: string, ask: string, answer: AskAnswer, more: { note?: string; mode?: ChatMode } = {}) => req(`${base}/${enc(id)}/answer`, send('POST', { ask, answer, ...more })).then(one),
  /** 도는 동안 보내 기다리는 지시 하나 빼기 */
  unqueue: (id: string, index: number) => req(`${base}/${enc(id)}/unqueue`, send('POST', { index })).then(one),
  archive: (id: string, archived: boolean) => req(`${base}/${enc(id)}/archive`, send('POST', { archived })).then(one),
  stop: (id: string) => req(`${base}/${enc(id)}/stop`, send('POST', {})).then(one),
  remove: (id: string) => req(`${base}/${enc(id)}`, { method: 'DELETE' }).then((r) => json<ChatDeleted>(r)),
  work: () => req('/api/agent-work').then((r) => json<WorkState>(r)),
  /** 피드백 하나를 새 앱 고치기 대화에 맡긴다 (한 번에 하나) */
  handOff: (key: string) => req('/api/feedback/hand-off', send('POST', { key })).then(one),
}
