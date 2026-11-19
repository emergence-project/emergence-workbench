/**
 * 에이전트 대화 API의 계약 (프로젝트 관리 1단계, 2026-10-21 사용자 결정 "프로젝트 관리 먼저").
 * 앱이 맥의 Claude Code(Agent SDK)를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다. 서버 routes/agentChats.ts · 화면 api/agentChats.ts.
 * 대화 기록은 앱 설정 폴더의 agent-chats/<id>.json (연구 저장소에는 넣지 않는다).
 */
import { z } from 'zod'
import { FEEDBACK_MISSES } from '../feedback-lessons.js'

/** 대화가 고칠 수 있는 단계. read = 읽기만(계산은 허락받고 돌림), notes = 노트 · 기록을 앱 MCP로 고침 */
export const CHAT_WRITE = ['read', 'notes'] as const
/**
 * 대화의 범위: 프로젝트 전체 · 주제 하나 · 노트 하나 (범위 밖은 읽기만, 고치기는 막는다).
 * app = 앱 자체 고치기 (2단계, 10/21 "앱 안 대화 + CI가 시험"): 앱 저장소의 따로 둔 작업 폴더에서 파일만 고치고,
 * 커밋 · PR · CI 결과는 앱이 한다(에이전트는 명령을 돌리지 않는다). rid는 APP_RID
 */
// 'all' = 모든 프로젝트를 읽고, 다른 프로젝트 · 개념노트를 고칠 때는 한 번씩 묻는다 (10/31). 이제 중앙 대화와 옛 대화만 쓴다:
// 새 대화는 project에 고른 프로젝트(also)를 더한다 (11/19 사용자 결정 "고른 프로젝트만 고치고 나머지는 읽기만"). topic · note는 옛 대화용
export const CHAT_SCOPES = ['project', 'all', 'topic', 'note', 'app'] as const
/** 앱 고치기 대화의 rid (연구 프로젝트 id와 겹치지 않는다) */
export const APP_RID = '_app'
/**
 * 중앙 대화의 rid (11/16 사용자 결정 "중앙 에이전트", 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG): 맥에 하나.
 * 읽기만 하고, 일은 하위 대화(앱 고치기 · 프로젝트 작성 · 피드백)를 열어 맡긴다 (agentCentral.ts)
 */
export const CENTRAL_RID = '_central'
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
/**
 * 명령이 하는 일 (10/28 사용자 결정 "권한을 명령 대신 하는 일로", 시안 4절): 앱이 명령의 첫 낱말과 경로로 판정하고, 모르면 run.
 * read 읽기(프로젝트와 등록한 폴더 안) · edit 편집 · delete 삭제 · run 실행 · web 웹 보기 · outside 외부(폴더 밖 쓰기 · 올리기 · 설치)
 */
export const CHAT_KINDS = ['read', 'edit', 'delete', 'run', 'web', 'outside'] as const
/** 「자동 허용」 토글이 있는 일. 편집은 모드(edit = 켬)가 정하고, 삭제 · 외부는 늘 묻는다 */
export const ChatAuto = z.object({ read: z.boolean().optional(), run: z.boolean().optional(), web: z.boolean().optional() }).strict()
/** 모델: default = 그 에이전트의 기본값. 별칭(opus · sonnet …) 말고도 맥의 에이전트가 아는 모델 id(claude-opus-5, gpt-5-codex/high 등)를 쓴다 (GET /agent-chats/models) */
export const ChatModel = z.string().regex(/^[a-z][a-z0-9._:/\-[\]]{0,79}$/i)
/**
 * 대화를 맡는 에이전트 (10/30 사용자 결정 "둘 다, 공통 규약(ACP)으로"): claude-code = Agent SDK, codex · gemini = Agent Client Protocol.
 * 대화마다 하나로 정하고 바꾸지 않는다 (세션이 에이전트마다 따로라서)
 */
export const AGENT_KINDS = ['claude-code', 'codex', 'gemini'] as const
/** 생각 깊이 (xhigh · max는 그것을 받는 모델만) */
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
/** 지시에 붙이는 것: 노트 · 주제 · 파일 · 고른 글 · 문헌 · 기록 · 커넥터 · 화면 요소 (ref는 화면 주소, text는 부위 이름과 글자) · 터미널 출력 · 지금 화면 (ref는 화면 주소, text는 화면 한 줄) */
export const ATTACH_KINDS = ['note', 'topic', 'file', 'selection', 'paper', 'record', 'connector', 'element', 'terminal', 'screen'] as const
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export const TODO_STATES = ['pending', 'in_progress', 'completed'] as const

export const ChatScope = z.object({
  kind: z.enum(CHAT_SCOPES),
  /** topic이면 주제 id, note면 노트 파일(저장소 기준 경로) */
  target: z.string().optional(),
  /** project일 때 함께 고칠 수 있는 다른 프로젝트 id (새 대화에서 여럿 고름). 그 밖의 프로젝트 · 개념노트는 읽기만 */
  also: z.array(z.string().min(1).max(200)).max(20).optional(),
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
  /** queued = 일하는 중에 보내 다음 차례에 읽을 지시, auto = 사용자가 아니라 앱이 중앙 대화를 깨운 알림 (하위 대화가 끝남 · CI 실패 · PR 합쳐짐, 11/18) */
  z.object({ kind: z.literal('user'), at: z.string(), text: z.string(), attach: z.array(Attach).optional(), images: z.number().optional(), queued: z.boolean().optional(), point: z.string().optional(), auto: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('text'), at: z.string(), text: z.string(), sub: z.boolean().optional() }).strict(),
  /** 에이전트가 쓴 도구 한 번. outside = 범위 밖을 읽음, sub = 서브에이전트가 씀 */
  z.object({ kind: z.literal('step'), at: z.string(), tool: z.string(), summary: z.string(), outside: z.boolean().optional(), sub: z.boolean().optional() }).strict(),
  /**
   * 허락 카드. answer가 없으면 기다리는 중. plan이 있으면 계획 승인 카드(허락 = 이대로 하기).
   * note = 거절하며 에이전트에게 한 말(아니요, 이렇게 바꿔서…), mode = 계획을 승인하며 고른 맡기는 정도,
   * expired = 답하기 전에 멈추거나 앱이 다시 켜져 닫힘(answer는 deny), by = central: 사용자 대신 중앙 대화가 답함 (크리티컬하지 않은 것만, 11/18)
   */
  // does = 명령이 하는 일, once = 「늘」 없이 한 번씩 (삭제 · 외부)
  z.object({ kind: z.literal('ask'), at: z.string(), id: z.string(), tool: z.string(), summary: z.string(), plan: z.string().optional(), answer: z.enum(ASK_ANSWERS).optional(), note: z.string().optional(), mode: z.enum(CHAT_MODES).optional(), expired: z.boolean().optional(), does: z.enum(CHAT_KINDS).optional(), once: z.boolean().optional(), by: z.literal('central').optional() }).strict(),
  /** 할 일 목록 (한 차례에 하나, 바뀌면 그 자리에서 고친다) */
  z.object({ kind: z.literal('todos'), at: z.string(), todos: z.array(Todo) }).strict(),
  /**
   * 노트 고침 (edit_note를 허락한 때). 되돌리기는 수정 검토에서.
   * via = command: 앱 고치기 대화가 고치기 도구 대신 명령(sed · 스크립트 등)으로 바꾼 파일. 차례가 끝날 때 작업 폴더의 git diff에서 찾는다
   */
  z.object({ kind: z.literal('edit'), at: z.string(), file: z.string(), parts: z.array(EditPart), added: z.number(), removed: z.number(), reason: z.string().optional(), via: z.literal('command').optional() }).strict(),
  /** 앱이 막은 일 (범위 밖 고치기, 다른 대화가 잡은 파일 등) */
  z.object({ kind: z.literal('blocked'), at: z.string(), tool: z.string(), reason: z.string() }).strict(),
  /** 중앙 대화가 사용자 허락으로 우회해 돌린 명령 (11/20): how = 한 번 · 이 대화에서 늘 */
  z.object({ kind: z.literal('bypass'), at: z.string(), command: z.string(), how: z.enum(['once', 'always']) }).strict(),
  /**
   * 차례 끝. cost = 쓴 토큰을 API 요금으로 친 값(구독 로그인이면 청구되지 않음), tokens = 이 차례에 넣고(in, 캐시 포함) 낸(out) 토큰,
   * context = 마지막 요청의 맥락 크기와 그 모델의 맥락 창
   */
  z.object({ kind: z.literal('result'), at: z.string(), ok: z.boolean(), cost: z.number().optional(), seconds: z.number().optional(), tokens: z.object({ in: z.number(), out: z.number() }).strict().optional(), context: z.object({ used: z.number(), window: z.number() }).strict().optional() }).strict(),
  z.object({ kind: z.literal('error'), at: z.string(), text: z.string() }).strict(),
  /** 앞 내용을 요약해 이어 감 (Claude Code의 맥락 줄이기). auto = 맥락이 커져 저절로, before · after = 줄이기 전후 맥락 토큰 */
  z.object({ kind: z.literal('compact'), at: z.string(), auto: z.boolean(), before: z.number(), after: z.number().optional() }).strict(),
  /** 에이전트가 생각한 것의 요약 (Claude Code의 생각 보기, 접어서 보인다) */
  z.object({ kind: z.literal('think'), at: z.string(), text: z.string() }).strict(),
  /**
   * 곁 질문 (Claude Code의 /btw): 하던 일을 멈추지 않고 작은 모델이 이 대화의 요약만 보고 답한다. 에이전트의 맥락에는 들어가지 않는다.
   * answer가 없고 error도 없으면 답을 기다리는 중
   */
  z.object({ kind: z.literal('side'), at: z.string(), q: z.string(), answer: z.string().optional(), error: z.string().optional() }).strict(),
  /**
   * 다른 에이전트의 검토 (11/9 "Claude가 쓰고 Codex가 검토"): 읽기만 하는 Codex가 고친 곳 · 요청 · 마지막 답을 읽고 남긴 글.
   * edits = 본 고친 곳 수, text가 없고 error도 없으면 검토하는 중. auto = 저절로 검토. 넘기기 전에는 대화 에이전트의 맥락에 들지 않는다
   */
  z.object({ kind: z.literal('review'), at: z.string(), by: z.enum(AGENT_KINDS), edits: z.number(), text: z.string().optional(), error: z.string().optional(), seconds: z.number().optional(), auto: z.boolean().optional() }).strict(),
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
  model: ChatModel,
  effort: z.enum(CHAT_EFFORTS),
  /** Claude 계정 (설정 › 에이전트의 더한 계정 id). 없으면 이 컴퓨터에 로그인한 기본 계정 (11/16 "계정 둘") */
  account: z.string().optional(),
  /** 권한 토글을 하나씩 바꿨으면 그 값 (없으면 권한 이름의 기본값, 화면은 「직접 정함」) */
  auto: ChatAuto.optional(),
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
  /** 앱 고치기 대화: 작업 폴더의 브랜치와 연 PR */
  branch: z.string().optional(),
  pr: z.object({ number: z.number(), url: z.string() }).strict().optional(),
  /** 앱 고치기 대화가 맡은 피드백 (status.yaml · reviews.yaml의 키). 묶어 맡겼으면 첫 항목이고 bundle에 모두 (11/19) */
  feedback: z.string().optional(),
  bundle: z.array(z.string()).optional(),
  /** 기록의 질문 · 지시가 연 대화 (10/28 시안 QHNCb6oYYUN4FtFLkqh2bJ: 기록에는 결과만, 대화는 에이전트 탭에) */
  record: z.object({ target: z.string(), id: z.string() }).strict().optional(),
  /** 중앙 대화가 연 하위 대화면 중앙 대화 id, 중앙이 닫으며 남긴 결과 요약 (11/16) */
  parent: z.string().optional(),
  summary: z.string().optional(),
  /** 일하는 중이면 이번 차례를 연 내 지시의 시각 (기록의 「Claude가 답을 쓰는 중 · 0:18」) */
  since: z.string().optional(),
  /** 앱이 그 PR을 합친 커밋, 그리고 그 커밋이 지금 도는 앱에 들어왔는지 (상단바 "#n 반영됨") */
  merged: z.string().optional(),
  shipped: z.boolean().optional(),
  /**
   * 차례가 끝나도 에이전트를 잠시 열어 둔다(Claude Code처럼): live = 열려 있음(다음 지시를 바로 받고, 일하는 중에 보낸 말도 그 차례에 섞어 읽는다),
   * tasks = 뒤에서 도는 명령 수(끝나면 에이전트가 저절로 이어서 일한다), compacting = 앞 내용을 요약하는 중
   */
  live: z.boolean().optional(),
  tasks: z.number().optional(),
  compacting: z.boolean().optional(),
  /** 에이전트가 지금 쓰는 중인 글 (다 쓰면 대화 줄이 되고 지워진다. 기록에는 남기지 않는다) */
  draft: z.string().optional(),
  created: z.string(),
  updated: z.string(),
}).strict()

/** always = 이 대화에서 늘 허락한 것(보일 이름), todos = 마지막 할 일 목록 */
/** trimmed = 오래되어 지운 앞 줄 수 (대화는 마지막 400줄만 둔다) */
export const Chat = ChatRow.extend({ items: z.array(ChatItem), always: z.array(z.string()), todos: z.array(Todo), trimmed: z.number().optional() }).strict()

/** GET /agent-chats?rid= */
/** app = 이 맥에서 앱 고치기 대화를 열 수 있는지 (앱 저장소가 있을 때) */
/** handOff = 피드백을 맡길 수 있는지 (앱 저장소 · 피드백 폴더가 있고 설정 › 에이전트에서 끄지 않음) */
export const ChatList = z.object({ chats: z.array(ChatRow), limit: z.number(), app: z.boolean(), handOff: z.boolean() }).strict()
/**
 * GET /agent-chats/models: 맥의 Claude Code가 고를 수 있게 하는 모델 (Claude Code를 못 띄우면 빈 목록, 화면은 별칭 넷으로).
 * resolved = 실제 모델 id (default · opus 같은 별칭이 무엇인지), efforts = 받는 생각 깊이 (없으면 생각 깊이를 고르지 않는다)
 */
export const ModelChoice = z.object({ value: ChatModel, name: z.string(), desc: z.string(), resolved: z.string().optional(), efforts: z.array(z.enum(CHAT_EFFORTS)).optional() }).strict()
export const ChatModels = z.object({ models: z.array(ModelChoice) }).strict()
/**
 * GET /agent-chats/agents: 이 맥에서 대화를 맡길 수 있는 에이전트. installed = 실행 파일을 찾음(version), login = 로그인한 흔적이 있음(모르면 없음),
 * install = 깔 때 쓸 명령 (없을 때 화면이 보인다), bundled = 앱에 든 연결부를 쓴다 (설치 파일로 깐 앱의 Codex: 깔 명령 대신 「ChatGPT로 연결」),
 * email · plan = 로그인한 계정과 요금제 (그 에이전트가 적어 둔 로그인 정보에서, 모르면 없음. 11/9)
 */
export const ChatAgents = z.object({
  agents: z.array(z.object({ id: z.enum(AGENT_KINDS), name: z.string(), installed: z.boolean(), version: z.string().optional(), login: z.boolean().optional(), install: z.string().optional(), bundled: z.boolean().optional(), email: z.string().optional(), plan: z.string().optional() }).strict()),
}).strict()
/**
 * GET /agent-chats/extras: 맥의 Claude Code에 있는 스킬(~/.claude/skills)과 커넥터(~/.claude.json의 MCP 서버). / 메뉴 · @ 메뉴에 보인다.
 * 커넥터는 이름과 방식만 (명령 · 주소 · 키는 보내지 않는다)
 */
export const ChatExtras = z.object({
  skills: z.array(z.object({ name: z.string(), description: z.string() }).strict()),
  connectors: z.array(z.object({ name: z.string(), type: z.enum(['stdio', 'http', 'sse']) }).strict()),
}).strict()
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
  /** 보낸 기기의 지금 화면 한 줄 (앱 화면 · 프로젝트 · 노트나 파일 · 주소). 서버는 대화마다 마지막 것과 다를 때만 지시에 붙인다 */
  view: z.string().trim().max(400).optional(),
}
/** auto: 토글 값(권한 이름을 바꾸면 빠지고 그 이름의 기본값으로, 같이 보내면 그대로 둔다) */
export const ChatSettings = z.object({ write: z.enum(CHAT_WRITE).optional(), mode: z.enum(CHAT_MODES).optional(), model: ChatModel.optional(), effort: z.enum(CHAT_EFFORTS).optional(), auto: ChatAuto.optional(), account: z.string().min(1).max(40).optional() }).strict()
export const NewChatBody = z.object({
  rid: z.string().min(1),
  agent: z.enum(AGENT_KINDS).optional(),
  ...message,
  title: z.string().trim().max(120).optional(),
  scope: ChatScope.optional(),
  ...ChatSettings.shape,
}).strict()
/** 이어서 지시. 일하는 중이면 다음 차례에 읽는다 */
export const ChatMessageBody = z.object(message).strict()
/** POST /agent-chats/:id/side: 곁 질문 */
export const SideBody = z.object({ text: z.string().trim().min(1).max(4000) }).strict()
export const ForgetBody = z.object({ label: z.string().min(1) }).strict()
/** note = 거절하며 할 말(에이전트에게 그대로 간다), mode = 계획을 승인하며 이어 갈 맡기는 정도(ask · edit) */
export const AskAnswerBody = z.object({ ask: z.string().min(1), answer: z.enum(ASK_ANSWERS), note: z.string().trim().max(4000).optional(), mode: z.enum(CHAT_MODES).optional() }).strict()
/** 도는 동안 보내 기다리는 지시 하나 빼기 (기다리는 것 가운데 몇째) */
export const UnqueueBody = z.object({ index: z.number().int().min(0) }).strict()
/** POST /agent-chats/:id/unqueue: 뺀 지시의 그림도 돌려준다 (입력란에서 고쳐 다시 보내게) */
export const Unqueued = z.object({ chat: Chat, images: z.array(ImageIn).optional() }).strict()
export const ArchiveBody = z.object({ archived: z.boolean() }).strict()
export const TitleBody = z.object({ title: z.string().min(1).max(200) }).strict()
/** 「기록으로 남기기」(10/28): 붙일 곳의 이름을 주면 작은 모델이 대화에서 기록 초안을 쓴다 */
export const RecordDraftBody = z.object({ place: z.string().min(1).max(300) }).strict()
export const RecordDraft = z.object({ text: z.string() }).strict()
export type RecordDraftBody = z.infer<typeof RecordDraftBody>
export type RecordDraft = z.infer<typeof RecordDraft>
/** 되돌리기: 차례를 연 내 지시(user 항목의 point) 앞으로. 지운 지시의 글 · 붙인 것과, 앱 고치기 대화면 되돌린 파일 수 */
export const RewindBody = z.object({ point: z.string().min(1) }).strict()
export const Rewound = z.object({ chat: Chat, text: z.string(), attach: z.array(Attach).optional(), files: z.number().optional() }).strict()

// ---------- 앱 고치기 대화: 앱이 대신 하는 일 (에이전트는 앱 MCP app_submit · app_checks로 부른다) ----------

/** 바뀐 것을 커밋해 올리고 PR을 연다 (이미 있으면 그 PR에 더한다). title = 한국어 한 줄 */
export const AppSubmitBody = z.object({ title: z.string().trim().min(1).max(120), body: z.string().max(20000) }).strict()
export const AppSubmitted = z.object({ number: z.number(), url: z.string(), created: z.boolean() }).strict()
/** 그 PR의 CI: done = 모두 끝남, ok = 모두 통과, log = 실패한 기록 끝부분 */
export const AppChecks = z.object({
  pr: z.number().optional(),
  checks: z.array(z.object({ name: z.string(), state: z.string(), link: z.string().optional() }).strict()),
  done: z.boolean(),
  ok: z.boolean(),
  log: z.string().optional(),
}).strict()
/** 자기 PR을 squash로 합친 결과 (app_merge): sha = main에 생긴 커밋 */
export const AppMerged = z.object({ number: z.number(), sha: z.string() }).strict()

// ---------- 피드백 맡기기: 피드백 하나를 앱 고치기 대화에 넘기고, 그 대화가 처리 기록을 앱을 거쳐 적는다 ----------

/** POST /feedback/hand-off: 에이전트 차례인 피드백 하나를 새 앱 고치기 대화에 맡긴다 (한 번에 하나) */
export const HandOffBody = z.object({
  key: z.string().min(1).optional(),
  /** 묶어 맡기기 (11/19): 같은 화면의 수정끼리, 질문 · 제안끼리 한 대화에 */
  keys: z.array(z.string().min(1)).min(1).max(5).optional(),
}).strict().refine((b) => !!b.key || !!b.keys?.length, { message: 'key or keys' })
/** 처리 기록에 적을 state (status.yaml과 같은 값) */
const ANSWER_STATES = ['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류'] as const
/**
 * 대화가 맡은 피드백의 처리 기록 (에이전트의 MCP feedback_answer). 앱이 status.yaml에 YAML로 적는다.
 * 수정 요청 · 진행을 다시 처리하면 앱이 그 전 처리를 revised로 옮기고 rework를 적는다(miss · lesson은 그 revised에).
 * after = 고친 뒤 화면: 그 PR의 CI가 찍은 그림 이름(shots의 파일 이름, .png 없이). 앱이 받아 그림 폴더에 두고 pictures: [전, 후].
 * replies = 답 없는 코멘트에 단 답 (to = 그 코멘트의 at). state 없이 replies만 보내면 처리는 그대로 두고 답만 더한다.
 * mockups = 이 대화 작업 폴더 mockups/의 시안 이름 (확장자 없이도). 앱이 그림과 같은 이름의 .html을 피드백 그림 폴더에 옮겨 적는다:
 * state가 있으면 새 처리에, 없으면 지금 처리에 붙는다. replies[].mockups는 그 답에.
 */
const MockupNames = z.array(z.string().regex(/^[\w.-]+$/).max(120)).max(12)
export const FeedbackAnswerBody = z.object({
  /** 묶어 맡긴 대화에서 어느 항목의 기록인지 (하나만 맡았으면 없어도 됨) */
  key: z.string().optional(),
  state: z.enum(ANSWER_STATES).optional(),
  note: z.string().trim().min(1).max(4000).optional(),
  understood: z.string().trim().max(2000).optional(),
  cause: z.string().trim().max(2000).optional(),
  clean: z.string().trim().max(2000).optional(),
  ask: z.string().trim().max(1000).optional(),
  miss: z.enum(FEEDBACK_MISSES).optional(),
  lesson: z.string().trim().max(500).optional(),
  after: z.string().regex(/^[\w-]+$/).max(80).optional(),
  mockups: MockupNames.optional(),
  replies: z.array(z.object({ to: z.string().min(1), note: z.string().trim().min(1).max(4000), mockups: MockupNames.optional() }).strict()).max(20).optional(),
}).strict().refine((b) => b.state ? !!b.note : !!b.replies?.length || !!b.mockups?.length, { message: 'state needs note; without state send replies or mockups' })
export const FeedbackAnswered = z.object({ key: z.string(), state: z.string().optional(), pictures: z.array(z.string()).optional(), replies: z.number() }).strict()

export type ChatScope = z.infer<typeof ChatScope>
export type ChatAuto = z.infer<typeof ChatAuto>
export type ChatKind = (typeof CHAT_KINDS)[number]
export type Attach = z.infer<typeof Attach>
export type Todo = z.infer<typeof Todo>
export type ImageIn = z.infer<typeof ImageIn>
export type ChatSettings = z.infer<typeof ChatSettings>
export type ChatMessageBody = z.input<typeof ChatMessageBody>
export type SideBody = z.infer<typeof SideBody>
export type ChatMode = (typeof CHAT_MODES)[number]
export type ChatModel = z.infer<typeof ChatModel>
export type ModelChoice = z.infer<typeof ModelChoice>
export type ChatModels = z.infer<typeof ChatModels>
export type ChatAgents = z.infer<typeof ChatAgents>
export type AgentKind = (typeof AGENT_KINDS)[number]
export type ChatExtras = z.infer<typeof ChatExtras>
export type Unqueued = z.infer<typeof Unqueued>
export type Rewound = z.infer<typeof Rewound>
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
export type AppSubmitBody = z.infer<typeof AppSubmitBody>
export type AppSubmitted = z.infer<typeof AppSubmitted>
export type AppChecks = z.infer<typeof AppChecks>
export type AppMerged = z.infer<typeof AppMerged>
export type HandOffBody = z.infer<typeof HandOffBody>
export type FeedbackAnswerBody = z.infer<typeof FeedbackAnswerBody>
export type FeedbackAnswered = z.infer<typeof FeedbackAnswered>

// ---------- 중앙 대화 (11/16 "중앙 에이전트") ----------

/** 중앙이 여는 하위 대화의 역할: 앱 고치기 · 프로젝트 작성 · 피드백 처리 */
export const CENTRAL_ROLES = ['app', 'project', 'feedback'] as const
/**
 * 중앙 대화 아래의 하위 대화 한 줄: report = 마지막 에이전트 글 (줄임).
 * ask = 기다리는 허락 · 계획 카드 (중앙이 chat_answer로 답한다). critical = 사용자에게 남길 까닭 (있으면 중앙은 답하지 못한다)
 */
export const CentralKid = z.object({
  id: z.string(), rid: z.string(), title: z.string(), state: z.enum(CHAT_STATES), wait: z.enum(['plan', 'ask']).optional(),
  ask: z.object({ id: z.string(), critical: z.string().optional() }).strict().optional(),
  pr: z.object({ number: z.number(), url: z.string() }).strict().optional(), merged: z.string().optional(),
  feedback: z.string().optional(), bundle: z.array(z.string()).optional(), archived: z.boolean(), summary: z.string().optional(), report: z.string().optional(), reported: z.boolean().optional(), updated: z.string(),
}).strict()
/** GET /agent-central: 중앙 대화 id (아직 없으면 없음)와 하위 대화 */
export const CentralState = z.object({ id: z.string().optional(), kids: z.array(CentralKid), app: z.boolean() }).strict()
/** POST /agent-central/messages: 중앙에게 말하기 (중앙이 없으면 연다) */
export const CentralMessageBody = z.object({ text: message.text, attach: message.attach, view: message.view }).strict()
/** POST /agent-central/open: 중앙이 하위 대화를 연다. project = 프로젝트 작성, feedback = 피드백 키, task = 맡길 일 (사용자 원문을 그대로 붙인다) */
export const CentralOpenBody = z.object({
  role: z.enum(CENTRAL_ROLES), title: z.string().trim().min(1).max(60), task: z.string().trim().min(1).max(20000),
  project: z.string().optional(), feedback: z.string().optional(),
  /** 피드백 처리: 여러 키를 한 대화에 묶어 맡긴다 (feedback 대신, 11/19) */
  feedbacks: z.array(z.string()).max(5).optional(),
  /** 앱 고치기만: 앱 버그 · 앱이 멈춘 때 메모리 · 줄과 상관없이 바로 연다 (한 번에 하나, 11/19) */
  urgent: z.boolean().optional(),
}).strict()
export const CentralSendBody = z.object({ id: z.string(), text: z.string().trim().min(1).max(20000) }).strict()
export const CentralCloseBody = z.object({ id: z.string(), summary: z.string().trim().min(1).max(2000) }).strict()
/** POST /agent-central/answer: 중앙이 하위 대화의 허락 · 계획 카드에 답한다 (크리티컬한 것은 409, 사용자에게 남긴다) */
export const CentralAnswerBody = z.object({ id: z.string(), ask: z.string(), answer: z.enum(['allow', 'deny']), note: z.string().trim().max(2000).optional() }).strict()
export const CentralKidOne = z.object({ kid: CentralKid }).strict()
/**
 * POST /agent-central/help: 대화가 중앙에게 중재를 청한다 (central_help, 11/19 사용자 "대화중에 다른 영역 · 앱 버그가 발생하면 중앙에 중재를 요청").
 * 고칠 수 없는 다른 프로젝트 · 개념노트의 일이나 앱 버그. 중앙 대화가 없으면 409
 */
export const CentralHelpBody = z.object({ chat: z.string(), text: z.string().trim().min(1).max(4000) }).strict()
export const CentralHelped = z.object({ central: z.string() }).strict()
/** POST /agent-central/open: 연 하위 대화, 또는 앱 고치기 자리가 차서 기다리게 둔 순서 (held, 1부터. 자리가 나면 앱이 연다) */
export const CentralOpened = z.object({ kid: CentralKid.optional(), held: z.number().optional() }).strict()
/** GET /agent-central/feedback: 에이전트 차례인 피드백 (pnpm agent:feedback --peek와 같은 계산). taken = 다른 컴퓨터 · 클라우드 루틴이 맡음, chat = 이미 맡은 이 앱의 대화, group = 한 대화에 묶어 맡길 묶음 번호 (맡을 수 있는 것만, 11/19) */
export const CentralFeedback = z.object({
  items: z.array(z.object({ key: z.string(), kind: z.string().optional(), target: z.string(), text: z.string(), reasons: z.array(z.string()), taken: z.boolean(), chat: z.string().optional(), group: z.number().optional() }).strict()),
}).strict()
export type CentralFeedback = z.infer<typeof CentralFeedback>
export type CentralKid = z.infer<typeof CentralKid>
export type CentralState = z.infer<typeof CentralState>
export type CentralOpenBody = z.infer<typeof CentralOpenBody>
export type CentralKidOne = z.infer<typeof CentralKidOne>
export type CentralHelped = z.infer<typeof CentralHelped>
export type CentralOpened = z.infer<typeof CentralOpened>
export type CentralAnswerBody = z.infer<typeof CentralAnswerBody>

// ---------- 시안 (11/19 "시안을 화면에서 바로") ----------

/** GET /agent-mockups/:dir: 앱 고치기 대화 작업 폴더의 mockups/ 안 파일 이름 (그림 · html · css) */
export const MockupFiles = z.object({ files: z.array(z.string()) }).strict()
export type MockupFiles = z.infer<typeof MockupFiles>
