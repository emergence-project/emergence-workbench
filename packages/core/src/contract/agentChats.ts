/**
 * 에이전트 대화 API의 계약 (프로젝트 관리 1단계, 2026-10-21 사용자 결정 "프로젝트 관리 먼저").
 * 앱이 맥의 Claude Code(Agent SDK)를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다. 서버 routes/agentChats.ts · 화면 api/agentChats.ts.
 * 대화 기록은 앱 설정 폴더의 agent-chats/<id>.json (연구 저장소에는 넣지 않는다).
 */
import { z } from 'zod'

/** 대화가 고칠 수 있는 단계. read = 읽기만(계산은 허락받고 돌림), notes = 노트 · 기록을 앱 MCP로 고침 */
export const CHAT_WRITE = ['read', 'notes'] as const
/** 대화의 범위: 프로젝트 전체 · 주제 하나 · 노트 하나 (범위 밖은 읽기만, 고치기는 막는다) */
export const CHAT_SCOPES = ['project', 'topic', 'note'] as const
/**
 * running 도는 중 · waiting 허락을 기다림(사용자 차례) · queued 동시 실행 수가 차서 기다림 ·
 * idle 한 차례 끝남(이어서 지시할 수 있음) · stopped 멈춤 · error 실패
 */
export const CHAT_STATES = ['running', 'waiting', 'queued', 'idle', 'stopped', 'error'] as const
export const ASK_ANSWERS = ['allow', 'always', 'deny'] as const

export const ChatScope = z.object({
  kind: z.enum(CHAT_SCOPES),
  /** topic이면 주제 id, note면 노트 파일(저장소 기준 경로) */
  target: z.string().optional(),
}).strict()

/** 대화의 한 줄 */
export const ChatItem = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), at: z.string(), text: z.string() }).strict(),
  z.object({ kind: z.literal('text'), at: z.string(), text: z.string(), sub: z.boolean().optional() }).strict(),
  /** 에이전트가 쓴 도구 한 번. outside = 범위 밖을 읽음, sub = 서브에이전트가 씀 */
  z.object({ kind: z.literal('step'), at: z.string(), tool: z.string(), summary: z.string(), outside: z.boolean().optional(), sub: z.boolean().optional() }).strict(),
  /** 허락 카드. answer가 없으면 기다리는 중 */
  z.object({ kind: z.literal('ask'), at: z.string(), id: z.string(), tool: z.string(), summary: z.string(), answer: z.enum(ASK_ANSWERS).optional() }).strict(),
  /** 앱이 막은 일 (범위 밖 고치기, 다른 대화가 잡은 파일 등) */
  z.object({ kind: z.literal('blocked'), at: z.string(), tool: z.string(), reason: z.string() }).strict(),
  z.object({ kind: z.literal('result'), at: z.string(), ok: z.boolean(), cost: z.number().optional() }).strict(),
  z.object({ kind: z.literal('error'), at: z.string(), text: z.string() }).strict(),
])

export const ChatRow = z.object({
  id: z.string(),
  rid: z.string(),
  title: z.string(),
  agent: z.string(),
  scope: ChatScope,
  write: z.enum(CHAT_WRITE),
  state: z.enum(CHAT_STATES),
  /** 이 대화가 지금 고치는 중인 파일 (저장소 기준 경로). 다른 대화는 쓰지 못한다 */
  claims: z.array(z.string()),
  created: z.string(),
  updated: z.string(),
}).strict()

export const Chat = ChatRow.extend({ items: z.array(ChatItem) }).strict()

/** GET /agent-chats?rid= */
export const ChatList = z.object({ chats: z.array(ChatRow), limit: z.number() }).strict()
/** GET /agent-chats/:id · POST 들의 응답 */
export const ChatOne = z.object({ chat: Chat }).strict()
/** GET /agent-work: 도는 대화와 잡은 파일 (화면 · MCP · STATUS가 같은 것을 본다) */
/** DELETE /agent-chats/:id */
export const ChatDeleted = z.object({ ok: z.literal(true) }).strict()
export const WorkState = z.object({
  chats: z.array(z.object({ id: z.string(), rid: z.string(), title: z.string(), state: z.enum(CHAT_STATES), scope: ChatScope, claims: z.array(z.string()) }).strict()),
}).strict()

// ---------- 요청 ----------

export const NewChatBody = z.object({
  rid: z.string().min(1),
  text: z.string().trim().min(1).max(20000),
  title: z.string().trim().max(120).optional(),
  scope: ChatScope.optional(),
  write: z.enum(CHAT_WRITE).optional(),
}).strict()
export const ChatMessageBody = z.object({ text: z.string().trim().min(1).max(20000) }).strict()
export const AskAnswerBody = z.object({ ask: z.string().min(1), answer: z.enum(ASK_ANSWERS) }).strict()

export type ChatScope = z.infer<typeof ChatScope>
export type ChatItem = z.infer<typeof ChatItem>
export type ChatRow = z.infer<typeof ChatRow>
export type Chat = z.infer<typeof Chat>
export type ChatList = z.infer<typeof ChatList>
export type ChatOne = z.infer<typeof ChatOne>
export type ChatDeleted = z.infer<typeof ChatDeleted>
export type WorkState = z.infer<typeof WorkState>
export type ChatWrite = (typeof CHAT_WRITE)[number]
export type ChatState = (typeof CHAT_STATES)[number]
export type AskAnswer = (typeof ASK_ANSWERS)[number]
export type NewChatBody = z.input<typeof NewChatBody>
