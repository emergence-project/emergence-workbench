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
/**
 * 얼마나 맡길지 (10/21 "에이전트 창 구조"): ask 묻고 하기(노트 고치기도 하나씩 묻는다) ·
 * plan 계획 먼저(계획을 승인하기 전에는 읽기만, 승인 뒤 범위 안 노트는 묻지 않고) · edit 고치기 바로(범위 안 노트는 묻지 않고).
 * 명령 · 웹 · 범위 밖은 어느 모드든 묻거나 막는다
 */
export const CHAT_MODES = ['ask', 'plan', 'edit'] as const
/** 모델: default = 맥의 Claude Code 기본값 */
export const CHAT_MODELS = ['default', 'opus', 'sonnet', 'haiku'] as const
/** 생각 깊이 */
export const CHAT_EFFORTS = ['low', 'medium', 'high'] as const
/** 지시에 붙이는 것: 노트 · 주제 · 파일 · 고른 글 · 문헌 · 기록 */
export const ATTACH_KINDS = ['note', 'topic', 'file', 'selection', 'paper', 'record'] as const
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export const TODO_STATES = ['pending', 'in_progress', 'completed'] as const

export const ChatScope = z.object({
  kind: z.enum(CHAT_SCOPES),
  /** topic이면 주제 id, note면 노트 파일(저장소 기준 경로) */
  target: z.string().optional(),
}).strict()

/** 지시에 붙인 것 하나. ref = 노트 파일 · 주제 id · 파일 경로 · 문헌 키 · 기록 id, text = 고른 글 */
export const Attach = z.object({
  kind: z.enum(ATTACH_KINDS),
  ref: z.string().max(400),
  label: z.string().max(200),
  text: z.string().max(4000).optional(),
}).strict()

export const Todo = z.object({ text: z.string(), state: z.enum(TODO_STATES) }).strict()

/** 노트 고침 한 번의 바뀐 곳 (보이려고 줄인 앞뒤 글) */
export const EditPart = z.object({ old: z.string(), new: z.string() }).strict()

/** 대화의 한 줄 */
export const ChatItem = z.discriminatedUnion('kind', [
  /** queued = 일하는 중에 보내 다음 차례에 읽을 지시 */
  z.object({ kind: z.literal('user'), at: z.string(), text: z.string(), attach: z.array(Attach).optional(), images: z.number().optional(), queued: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('text'), at: z.string(), text: z.string(), sub: z.boolean().optional() }).strict(),
  /** 에이전트가 쓴 도구 한 번. outside = 범위 밖을 읽음, sub = 서브에이전트가 씀 */
  z.object({ kind: z.literal('step'), at: z.string(), tool: z.string(), summary: z.string(), outside: z.boolean().optional(), sub: z.boolean().optional() }).strict(),
  /**
   * 허락 카드. answer가 없으면 기다리는 중. plan이 있으면 계획 승인 카드(허락 = 이대로 하기).
   * note = 거절하며 에이전트에게 한 말(아니요, 이렇게 바꿔서…), mode = 계획을 승인하며 고른 맡기는 정도
   */
  z.object({ kind: z.literal('ask'), at: z.string(), id: z.string(), tool: z.string(), summary: z.string(), plan: z.string().optional(), answer: z.enum(ASK_ANSWERS).optional(), note: z.string().optional(), mode: z.enum(CHAT_MODES).optional() }).strict(),
  /** 할 일 목록 (한 차례에 하나, 바뀌면 그 자리에서 고친다) */
  z.object({ kind: z.literal('todos'), at: z.string(), todos: z.array(Todo) }).strict(),
  /** 노트 고침 (edit_note를 허락한 때). 되돌리기는 수정 검토에서 */
  z.object({ kind: z.literal('edit'), at: z.string(), file: z.string(), parts: z.array(EditPart), added: z.number(), removed: z.number(), reason: z.string().optional() }).strict(),
  /** 앱이 막은 일 (범위 밖 고치기, 다른 대화가 잡은 파일 등) */
  z.object({ kind: z.literal('blocked'), at: z.string(), tool: z.string(), reason: z.string() }).strict(),
  z.object({ kind: z.literal('result'), at: z.string(), ok: z.boolean(), cost: z.number().optional(), seconds: z.number().optional() }).strict(),
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
  mode: z.enum(CHAT_MODES),
  model: z.enum(CHAT_MODELS),
  effort: z.enum(CHAT_EFFORTS),
  /** 이 대화가 지금 고치는 중인 파일 (저장소 기준 경로). 다른 대화는 쓰지 못한다 */
  claims: z.array(z.string()),
  /** 이 대화가 고친 파일 (수정 검토로 간다) */
  changed: z.array(z.string()),
  /** 노트 고침에서 더하고 뺀 줄 수 (목록 · 머리의 +n −n) */
  added: z.number(),
  removed: z.number(),
  /** 사용자 차례일 때 무엇을 기다리는지: 계획 승인 · 허락 */
  wait: z.enum(['plan', 'ask']).optional(),
  /** 보관함에 넣은 대화 (목록에서 숨김, 지우지 않음) */
  archived: z.boolean(),
  created: z.string(),
  updated: z.string(),
}).strict()

/** always = 이 대화에서 늘 허락한 것(보일 이름), todos = 마지막 할 일 목록 */
export const Chat = ChatRow.extend({ items: z.array(ChatItem), always: z.array(z.string()), todos: z.array(Todo) }).strict()

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

/** 붙여 넣은 그림 (base64, 한 장 5MB까지) */
export const ImageIn = z.object({ type: z.enum(IMAGE_TYPES), data: z.string().max(7_000_000) }).strict()
const message = {
  text: z.string().trim().min(1).max(20000),
  attach: z.array(Attach).max(20).optional(),
  images: z.array(ImageIn).max(4).optional(),
}
export const ChatSettings = z.object({ write: z.enum(CHAT_WRITE).optional(), mode: z.enum(CHAT_MODES).optional(), model: z.enum(CHAT_MODELS).optional(), effort: z.enum(CHAT_EFFORTS).optional() }).strict()
export const NewChatBody = z.object({
  rid: z.string().min(1),
  ...message,
  title: z.string().trim().max(120).optional(),
  scope: ChatScope.optional(),
  ...ChatSettings.shape,
}).strict()
/** 이어서 지시. 일하는 중이면 다음 차례에 읽는다 */
export const ChatMessageBody = z.object(message).strict()
export const ForgetBody = z.object({ label: z.string().min(1) }).strict()
/** note = 거절하며 할 말(에이전트에게 그대로 간다), mode = 계획을 승인하며 이어 갈 맡기는 정도(ask · edit) */
export const AskAnswerBody = z.object({ ask: z.string().min(1), answer: z.enum(ASK_ANSWERS), note: z.string().trim().max(4000).optional(), mode: z.enum(CHAT_MODES).optional() }).strict()
/** 도는 동안 보내 기다리는 지시 하나 빼기 (기다리는 것 가운데 몇째) */
export const UnqueueBody = z.object({ index: z.number().int().min(0) }).strict()
export const ArchiveBody = z.object({ archived: z.boolean() }).strict()

export type ChatScope = z.infer<typeof ChatScope>
export type Attach = z.infer<typeof Attach>
export type Todo = z.infer<typeof Todo>
export type ImageIn = z.infer<typeof ImageIn>
export type ChatSettings = z.infer<typeof ChatSettings>
export type ChatMessageBody = z.input<typeof ChatMessageBody>
export type ChatMode = (typeof CHAT_MODES)[number]
export type ChatModel = (typeof CHAT_MODELS)[number]
export type ChatEffort = (typeof CHAT_EFFORTS)[number]
export type AttachKind = (typeof ATTACH_KINDS)[number]
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
export type AskAnswerBody = z.infer<typeof AskAnswerBody>
export type NewChatBody = z.input<typeof NewChatBody>
