/**
 * 에이전트 대화 API의 계약 (프로젝트 관리 1단계, 2026-10-21 사용자 결정 "프로젝트 관리 먼저").
 * 앱이 맥의 Claude Code(Agent SDK)를 띄워 프로젝트 하나 · 일 하나의 대화를 돌린다. 서버 routes/agentChats.ts · 화면 api/agentChats.ts.
 * 대화 기록은 앱 설정 폴더의 agent-chats/<id>.json (연구 저장소에는 넣지 않는다).
 */
import { z } from 'zod'
import { FEEDBACK_MISSES } from '../feedback-lessons.js'
import { FEEDBACK_VERDICTS } from './feedback.js'
export * from './agentChatsItems.js'
import { CHAT_WRITE, CHAT_STATES, ASK_ANSWERS, CHAT_MODES, CHAT_KINDS, ChatAuto, ChatModel, AGENT_KINDS, CHAT_EFFORTS, ATTACH_KINDS, IMAGE_TYPES, ChatScope, Attach, Todo, ROOM_VERDICTS, ChatItem, DebateSeat, Debate, ChatRow, Chat, OtherApp, ChatList, ModelChoice, ChatModels, ChatAgents, ChatExtras, ChatOne, ChatDeleted, WorkState } from './agentChatsItems.js'
// ---------- 요청 ----------

/** 붙여 넣은 그림 (base64, 한 장 5MB까지). name은 파일 이름으로 보낸 지시의 칩에 보인다 */
export const ImageIn = z.object({ type: z.enum(IMAGE_TYPES), data: z.string().max(7_000_000), name: z.string().max(200).optional() }).strict()
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
  /** 서버가 있어도 이 컴퓨터에서 돌린다 (새 대화의 「이 맥」, 11/20) */
  here: z.boolean().optional(),
  ...ChatSettings.shape,
}).strict()
/** 이어서 지시. 일하는 중이면 다음 차례에 읽는다 */
export const ChatMessageBody = z.object(message).strict()
/** POST /agent-chats/:id/side: 곁 질문 */
export const SideBody = z.object({ text: z.string().trim().min(1).max(4000) }).strict()
/** 검토할 에이전트 (11/23 "여러 에이전트에게 동시 검토, 각각 독립 검토"): 고른 에이전트마다 따로 읽고 카드를 하나씩 붙인다. 없으면 Codex */
export const REVIEWERS = ['codex', 'gemini'] as const
export type Reviewer = (typeof REVIEWERS)[number]
export const ReviewBody = z.object({ by: z.array(z.enum(REVIEWERS)).min(1).max(REVIEWERS.length).optional() }).strict()
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
/** notes = 올리기 전 검사가 막지 않고 알린 것 (예: 소개 검사가 짚은 소개 절, 11/27) */
export const AppSubmitted = z.object({ number: z.number(), url: z.string(), created: z.boolean(), notes: z.array(z.string()).optional() }).strict()
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
 * 수정 요청 · 진행 · 논의로 다시 처리하면 앱이 그 전 처리(전후 그림까지)를 revised로 옮기고 rework를 적는다(miss · lesson은 그 revised에).
 * after = 고친 뒤 화면: 그 PR의 CI가 찍은 그림 이름(shots의 파일 이름, .png 없이). 앱이 받아 그림 폴더에 두고 pictures: [전, 후].
 * replies = 답 없는 코멘트에 단 답 (to = 그 코멘트의 at). state 없이 replies만 보내면 처리는 그대로 두고 답만 더한다.
 * verdict = 사용자가 이 대화에서 말한 판정 (verdictNote = 그 말). 피드백 화면에서 고른 것처럼 reviews.yaml에 적고, state가 함께 오면 판정을 먼저 적는다 (11/20).
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
  /** 쓰지 않게 된 시안을 이 항목의 피드백 답(지금 · revised · replies)에서 뗀다 (11/24). 그림 · 원문 · 판정 · 코멘트는 그대로 */
  dropMockups: MockupNames.optional(),
  verdict: z.enum(FEEDBACK_VERDICTS).optional(),
  verdictNote: z.string().trim().max(4000).optional(),
}).strict().refine((b) => b.state ? !!b.note : !!b.replies?.length || !!b.mockups?.length || !!b.dropMockups?.length || !!b.verdict, { message: 'state needs note; without state send replies, mockups, dropMockups or verdict' })
export const FeedbackAnswered = z.object({ key: z.string(), state: z.string().optional(), verdict: z.string().optional(), pictures: z.array(z.string()).optional(), replies: z.number() }).strict()

export type ChatKind = (typeof CHAT_KINDS)[number]
export type ImageIn = z.infer<typeof ImageIn>
export type ChatSettings = z.infer<typeof ChatSettings>
export type ChatMessageBody = z.input<typeof ChatMessageBody>
export type SideBody = z.infer<typeof SideBody>
export type ReviewBody = z.infer<typeof ReviewBody>
export type ChatMode = (typeof CHAT_MODES)[number]
export type AgentKind = (typeof AGENT_KINDS)[number]
export type Unqueued = z.infer<typeof Unqueued>
export type Rewound = z.infer<typeof Rewound>
export type ChatEffort = (typeof CHAT_EFFORTS)[number]
export type AttachKind = (typeof ATTACH_KINDS)[number]
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
 * ask = 기다리는 허락 · 계획 카드 (중앙이 chat_answer로 답한다). critical = 사용자에게 남길 까닭 (있으면 중앙은 답하지 못한다).
 * ci = PR 검사 (1분마다 tickCentral이 본다), todos = 할 일 목록의 끝낸 수 / 모두 (작업 현황 줄, 11/19)
 */
export const CentralKid = z.object({
  id: z.string(), rid: z.string(), title: z.string(), state: z.enum(CHAT_STATES), wait: z.enum(['plan', 'ask']).optional(),
  ask: z.object({ id: z.string(), critical: z.string().optional() }).strict().optional(),
  pr: z.object({ number: z.number(), url: z.string() }).strict().optional(), merged: z.string().optional(),
  feedback: z.string().optional(), bundle: z.array(z.string()).optional(), archived: z.boolean(), summary: z.string().optional(), report: z.string().optional(), reported: z.boolean().optional(), updated: z.string(),
  ci: z.enum(['pending', 'failed', 'passed']).optional(), todos: z.object({ done: z.number(), total: z.number() }).strict().optional(),
  /** 지금 오류가 비정상 종료면 이 대화가 비정상 종료된 횟수 (11/20) */
  crashes: z.number().optional(),
  /** 다른 앱을 고치는 앱 고치기 (scope.app, 11/20) */
  app: z.string().optional(),
}).strict()
// ---------- 중앙 방 (11/20 사용자 결정, 시안 https://claude.ai/artifact/1e4G2p1cQjgVNSSAZ9RFHr) ----------

/** 방의 권한: read 읽기만(부르면 접힌 요약) · talk 발언(부르면 답함) · edit 수정(하위 대화 · 파일 · PR, 한 명 = 방장) */
export const ROOM_PERMS = ['read', 'talk', 'edit'] as const
export const RoomMember = z.object({ agent: z.enum(AGENT_KINDS), perm: z.enum(ROOM_PERMS), by: z.enum(['user', 'host']), reason: z.string().optional(), at: z.string() }).strict()
/** 방 규칙: hostInvite = 방장이 초대해도 됨(읽기만 · 발언까지), defaultPerm = 새로 들어올 때 권한, callMax = 방장이 한 번에 부르는 수.
 *  @모두는 늘 서로의 답을 가린 채 동시에 답한다(독립). 서로 비판하는 일은 토론 대화가 맡는다 (11/20 「토론 + 정해진 4단계」가 「독립 | 토론」 고르기를 바꿈) */
export const RoomRules = z.object({ hostInvite: z.boolean(), defaultPerm: z.enum(['read', 'talk']), callMax: z.number().int().min(1).max(3) }).strict()
/** 토론 대화의 기록에 남는 방식: independent = 중앙의 @모두(비판 없음), debate = 토론 대화 */
export const ROOM_MODES = ['independent', 'debate'] as const
/**
 * 토론 기록 한 줄 (11/20): @모두 · 여럿을 부른 차례와 끝낸 토론마다. flipped = 나중에 틀린 것으로 드러남 (사용자가 표시).
 * 토론이면 chat = 토론 대화 id, rounds = 비판 차례 수(건너뛰었으면 0), changed = 입장을 바꾼 수, line = 정리의 고른 안
 */
export const VerdictEntry = z.object({ at: z.string(), q: z.string(), mode: z.enum(ROOM_MODES), votes: z.array(z.object({ agent: z.enum(AGENT_KINDS), v: z.enum(ROOM_VERDICTS) }).strict()), flipped: z.boolean(),
  chat: z.string().optional(), rounds: z.number().int().optional(), changed: z.number().int().optional(), line: z.string().optional() }).strict()
/** 토론을 열 때의 기본값: 에이전트마다 마지막에 고른 모델 · 생각, 정리 모델, 비판 차례, 건너뛰기 (토론에서 바꾸면 여기도 바뀐다) */
export const DebateDefaults = z.object({ seats: z.array(DebateSeat), judge: DebateSeat, rounds: z.number().int().min(0).max(2), skip: z.boolean() }).strict()
export const DEBATE_DEFAULT: DebateDefaults = { seats: [], judge: { agent: 'claude-code', model: 'opus', effort: 'medium' }, rounds: 1, skip: true }
/** 방: host = 방장(수정을 가진 사람), members = 방장 포함 (사용자 말고 4명까지), asking = 지금 답하는 사람, log = 토론 기록(최근 것부터, total · flipped는 전체 수), debate = 토론 기본값 */
export const RoomState = z.object({ host: z.enum(AGENT_KINDS), members: z.array(RoomMember), rules: RoomRules, asking: z.array(z.enum(AGENT_KINDS)),
  log: z.object({ total: z.number(), flipped: z.number(), recent: z.array(VerdictEntry) }).strict(), debate: DebateDefaults.default(DEBATE_DEFAULT) }).strict()
export const VerdictFlipBody = z.object({ at: z.string(), flipped: z.boolean() }).strict()
/** 토론 대화의 rid (중앙 대화와 따로, 11/20 「중앙에 붙이지 않고 따로 연다」) */
export const DEBATE_RID = '_debate'
/** POST /agent-debate (사용자) · /agent-debate/host (방장 debate_open): 토론 열기. agents가 없으면 방장 말고 방 사람 모두 */
export const DebateOpenBody = z.object({ q: z.string().trim().min(1).max(8000), agents: z.array(z.enum(AGENT_KINDS)).max(4).optional() }).strict()
export const DebateOpened = z.object({ id: z.string() }).strict()
/** POST /agent-debate/:id/settings: 비판 차례 · 건너뛰기 · 참가자(모델 · 생각) · 정리 모델. 고른 값은 다음 토론의 기본이 된다 */
export const DebateSettingsBody = z.object({ rounds: z.number().int().min(0).max(2).optional(), skip: z.boolean().optional(), seats: z.array(DebateSeat).min(2).max(4).optional(), judge: DebateSeat.optional() }).strict()
export const RoomInviteBody = z.object({ agent: z.enum(AGENT_KINDS), perm: z.enum(ROOM_PERMS).optional(), reason: z.string().trim().max(200).optional() }).strict()
export const RoomPermBody = z.object({ agent: z.enum(AGENT_KINDS), perm: z.enum(ROOM_PERMS) }).strict()
export const RoomAgentBody = z.object({ agent: z.enum(AGENT_KINDS) }).strict()
export const RoomRulesBody = RoomRules.partial().strict()
/** POST /agent-room/host/ask: 방장이 방 사람 하나에게 묻는다 (room_ask) */
export const RoomAskBody = z.object({ agent: z.enum(AGENT_KINDS), question: z.string().trim().min(1).max(8000) }).strict()
export const RoomAnswer = z.object({ answer: z.string() }).strict()
export type RoomPerm = (typeof ROOM_PERMS)[number]
export type RoomMember = z.infer<typeof RoomMember>
export type RoomRules = z.infer<typeof RoomRules>
export type RoomState = z.infer<typeof RoomState>
export type VerdictEntry = z.infer<typeof VerdictEntry>
export type DebateDefaults = z.infer<typeof DebateDefaults>
export type DebateSettingsBody = z.infer<typeof DebateSettingsBody>
export type DebateOpened = z.infer<typeof DebateOpened>
export type DebateOpenBody = z.infer<typeof DebateOpenBody>
export type RoomAnswer = z.infer<typeof RoomAnswer>

/**
 * GET /agent-central: 중앙 대화 id (아직 없으면 없음)와 하위 대화.
 * held = 자리를 기다리는 앱 고치기 (at = 맡긴 때), feedback = 사용자가 답할 피드백 가운데 하위 대화가 맡지 않은 것 (작업 현황의 「내 차례」, 11/19)
 */
export const CentralState = z.object({
  id: z.string().optional(), kids: z.array(CentralKid), app: z.boolean(),
  /** 이 컴퓨터에서 고칠 수 있는 다른 앱 (chat_open app, 11/20) */
  apps: z.array(OtherApp).optional(),
  held: z.array(z.object({ title: z.string(), at: z.string().optional() }).strict()).optional(),
  feedback: z.array(z.object({ key: z.string(), target: z.string(), text: z.string(), at: z.string() }).strict()).optional(),
  /** 중앙의 하위 대화가 아닌 대화 가운데 비정상 종료로 멈춘 것 (작업 현황의 「내 차례」, 11/20). count = 그 대화의 비정상 종료 횟수 */
  crashed: z.array(z.object({ id: z.string(), rid: z.string(), title: z.string(), at: z.string(), text: z.string(), count: z.number() }).strict()).optional(),
  /** 중앙 방 (11/20) */
  room: RoomState.optional(),
}).strict()
/** POST /agent-central/messages: 중앙에게 말하기 (중앙이 없으면 연다) */
export const CentralMessageBody = z.object({
  text: message.text, attach: message.attach, view: message.view,
  /** 중앙을 처음 열 때만: 모델 · 생각 깊이 · 계정 (11/20 시안 5절). 열린 뒤에는 입력란 메뉴로 바꾼다 */
  start: z.object({ model: ChatModel, effort: z.enum(CHAT_EFFORTS), account: z.string().min(1).max(40) }).partial().strict().optional(),
}).strict()
/** POST /agent-central/open: 중앙이 하위 대화를 연다. project = 프로젝트 작성, feedback = 피드백 키, task = 맡길 일 (사용자 원문을 그대로 붙인다) */
export const CentralOpenBody = z.object({
  role: z.enum(CENTRAL_ROLES), title: z.string().trim().min(1).max(60), task: z.string().trim().min(1).max(20000),
  project: z.string().optional(), feedback: z.string().optional(),
  /** 피드백 처리: 여러 키를 한 대화에 묶어 맡긴다 (feedback 대신, 11/19) */
  feedbacks: z.array(z.string()).max(5).optional(),
  /** 앱 고치기만: 앱 버그 · 앱이 멈춘 때 메모리 · 줄과 상관없이 바로 연다 (한 번에 하나, 11/19) */
  urgent: z.boolean().optional(),
  /** 앱 고치기만: 고칠 다른 앱 (ChatList.apps의 id). 없으면 이 앱 (11/20) */
  app: z.string().regex(/^[a-z][\w-]{0,30}$/).optional(),
}).strict()
export const CentralSendBody = z.object({ id: z.string(), text: z.string().trim().min(1).max(20000) }).strict()
export const CentralCloseBody = z.object({ id: z.string(), summary: z.string().trim().min(1).max(2000) }).strict()
/**
 * POST /agent-central/archive: 중앙이 하위 대화가 아닌 대화도 보관함에 넣는다 (chat_archive, 11/20 사용자 "대화를 여는 권한도 있으니 닫을 권한도").
 * 일하는 중이 아닌 것만, 보관만 (지우기는 사용자만, 11/20 "지우는 것은 너가 하는 권한이 있으면 안되"). 다른 컴퓨터의 대화는 보관 요청을 개인 저장소로 넘기고 그 컴퓨터가 다음 맞추기 때 보관한다 (machine).
 * POST /agent-central/unarchive: 같은 몸으로 보관함에서 꺼낸다 (chat_unarchive, 끝난 대화 복구)
 */
export const CentralArchiveBody = z.object({ id: z.string(), reason: z.string().trim().min(1).max(300) }).strict()
export const CentralArchived = z.object({ id: z.string(), title: z.string(), machine: z.string().optional() }).strict()
/** POST /agent-central/priority: 자리를 기다리는 앱 고치기(held)의 여는 순서를 바꾼다 (chat_priority, 11/20). title = 기다리는 일의 제목(정확히, 아니면 한 개만 맞는 일부), to = 새 순서 (1 = 맨 앞) */
export const CentralPriorityBody = z.object({ title: z.string().trim().min(1).max(60), to: z.number().int().min(1).default(1), reason: z.string().trim().min(1).max(300) }).strict()
/** 바꾼 뒤의 기다리는 순서 (제목, 맨 앞이 다음에 열린다) */
export const CentralHeldOrder = z.object({ held: z.array(z.string()) }).strict()
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
export type CentralMessageBody = z.infer<typeof CentralMessageBody>
export type CentralKidOne = z.infer<typeof CentralKidOne>
export type CentralHelped = z.infer<typeof CentralHelped>
export type CentralArchived = z.infer<typeof CentralArchived>
export type CentralPriorityBody = z.infer<typeof CentralPriorityBody>
export type CentralHeldOrder = z.infer<typeof CentralHeldOrder>
export type CentralOpened = z.infer<typeof CentralOpened>
export type CentralAnswerBody = z.infer<typeof CentralAnswerBody>

/** GET · POST /agent-central/memo: 중앙 메모 (11/16 시안 §6 · §9 ⑤): 사용자가 정한 오래 갈 사실. where = personal(개인 저장소, 두 맥이 함께) · local(이 컴퓨터만) */
export const CentralMemo = z.object({ text: z.string(), where: z.enum(['personal', 'local']), updated: z.string().optional() }).strict()
export const CentralMemoBody = z.object({ text: z.string().max(4000) }).strict()
export type CentralMemo = z.infer<typeof CentralMemo>

/** 의도 장부 (11/23): 사용자의 말 그대로 · 날짜 · 출처 대화. 더하기만, 바뀐 결정은 옛 항목에 superseded(대체됨, by = 새 항목 번호). GET · POST /agent-central/decisions */
export const CentralDecision = z.object({ n: z.number().int(), words: z.string(), date: z.string(), source: z.string(), superseded: z.object({ date: z.string(), by: z.number().int() }).strict().optional() }).strict()
export const CentralDecisions = z.object({ items: z.array(CentralDecision), where: z.enum(['personal', 'local']) }).strict()
export const CentralDecisionBody = z.object({ words: z.string().trim().min(1).max(2000), source: z.string().trim().min(1).max(100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), replaces: z.number().int().min(1).optional() }).strict()
/** POST /agent-central/review: 앱 고치기 대화의 PR을 깊이 검토 (chat_review). hold = 검토 동안 합치지 않기. POST /agent-central/hold: 검토 중인 PR의 보류를 걸거나 푼다 (pr_hold) */
export const CentralReviewBody = z.object({ id: z.string(), focus: z.string().trim().max(1000).optional(), hold: z.boolean().optional() }).strict()
export const CentralReviewStarted = z.object({ id: z.string(), files: z.number().int(), held: z.boolean() }).strict()
export const CentralHoldBody = z.object({ id: z.string(), on: z.boolean(), reason: z.string().trim().max(300).optional() }).strict()
export const CentralHold = z.object({ id: z.string(), held: z.boolean() }).strict()
export type CentralDecision = z.infer<typeof CentralDecision>
export type CentralDecisions = z.infer<typeof CentralDecisions>
export type CentralDecisionBody = z.infer<typeof CentralDecisionBody>
export type CentralReviewBody = z.infer<typeof CentralReviewBody>
export type CentralReviewStarted = z.infer<typeof CentralReviewStarted>
export type CentralHold = z.infer<typeof CentralHold>

// ---------- 시안 (11/19 "시안을 화면에서 바로") ----------

/** GET /agent-mockups/:dir: 앱 고치기 대화 작업 폴더의 mockups/ 안 파일 이름 (그림 · html · css) */
export const MockupFiles = z.object({ files: z.array(z.string()) }).strict()
export type MockupFiles = z.infer<typeof MockupFiles>
