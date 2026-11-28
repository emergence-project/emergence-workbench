/** 에이전트 대화 계약의 바탕: 대화 · 항목 · 범위 · 모델 · 목록 줄의 모양 (agentChats.ts에서 나눔, agentChats.ts가 모두 다시 내보낸다) */
import { z } from 'zod'

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
/** Claude 대화가 처음 쓰는 모델 (11/20 사용자 "기본 모델을 두기보다 대화에서 설정하고 변경하게"). 「기본 모델」은 계정마다 달라 크레딧이 드는 모델로 풀린 적이 있다 */
export const CLAUDE_START_MODEL = 'opus'
/** 대화의 모델: Claude는 「기본 모델」 없이 정한 모델로 (옛 값도). Codex · Gemini는 그 에이전트의 기본을 받는다 */
export const startModel = (agent: string, m?: string): string => (agent === 'claude-code' && (!m || m === 'default') ? CLAUDE_START_MODEL : m ?? 'default')
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
 * 얼마나 맡길지 (10/21 "에이전트 창 구조"): ask 수동(노트 고치기도 하나씩 묻는다) ·
 * plan 계획 먼저(계획을 승인하기 전에는 읽기만, 승인 뒤 범위 안 노트는 묻지 않고) · edit 고치기 바로(범위 안 노트는 묻지 않고).
 * 명령 · 웹 · 범위 밖은 어느 모드든 묻거나 막는다.
 * auto 자동(11/23 "클로드 자동 모드처럼"): edit에 더해 읽기(어디든, 비밀이 든 곳 빼고) · 실행 · 웹을 묻지 않고, 크리티컬한 일만 한 번 묻는다
 */
export const CHAT_MODES = ['ask', 'plan', 'edit', 'auto'] as const
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
  /** app일 때 고칠 다른 앱 (OTHER_APPS의 id, 예: qcad). 없으면 이 앱 (11/20) */
  app: z.string().regex(/^[a-z][\w-]{0,30}$/).optional(),
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
/** 방 사람의 판정 (11/20 2단계): yes 맞음 · no 틀림 · unsure 모름. prev = 토론에서 앞 차례의 판정 (바뀌었을 때만) */
export const ROOM_VERDICTS = ['yes', 'no', 'unsure'] as const
export type RoomVerdict = (typeof ROOM_VERDICTS)[number]
/** 토론 단계 (11/20 「토론 + 정해진 4단계」): answer 각자 답(서로 못 봄) · critique 서로 비판(이름 가림) · revise 고친 답 · sum 정리(투표 안 함) */
export const DEBATE_STAGES = ['answer', 'critique', 'revise', 'sum'] as const
export type DebateStage = (typeof DEBATE_STAGES)[number]
/**
 * 허락 카드를 물은 뒤 바뀐 것 (앱이 다시 켜진 뒤 남은 카드에만, 11/28): files = 커밋하지 않은 고침이 달라진 파일(지금 HEAD에 견준 줄 수),
 * commits = 그 사이 브랜치가 움직인 커밋 수, main = main에 새로 생긴 커밋 수, ci = PR 검사가 바뀜, error = 셀 수 없음
 */
export const AskSince = z.object({
  files: z.array(z.object({ file: z.string(), added: z.number(), removed: z.number() }).strict()),
  commits: z.number(), main: z.number(),
  ci: z.object({ from: z.string().optional(), to: z.string().optional() }).strict().optional(),
  error: z.string().optional(),
}).strict()
export type AskSince = z.infer<typeof AskSince>

export const ChatItem = z.discriminatedUnion('kind', [
  /** queued = 일하는 중에 보내 다음 차례에 읽을 지시, auto = 사용자가 아니라 앱이 중앙 대화를 깨운 알림 (하위 대화가 끝남 · CI 실패 · PR 합쳐짐, 11/18) */
  z.object({ kind: z.literal('user'), at: z.string(), text: z.string(), attach: z.array(Attach).optional(), images: z.number().optional(), imageNames: z.array(z.string()).optional(), queued: z.boolean().optional(), point: z.string().optional(), auto: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('text'), at: z.string(), text: z.string(), sub: z.boolean().optional() }).strict(),
  /** 에이전트가 쓴 도구 한 번. outside = 범위 밖을 읽음, sub = 서브에이전트가 씀 */
  z.object({ kind: z.literal('step'), at: z.string(), tool: z.string(), summary: z.string(), outside: z.boolean().optional(), sub: z.boolean().optional() }).strict(),
  /**
   * 허락 카드. answer가 없으면 기다리는 중. plan이 있으면 계획 승인 카드(허락 = 이대로 하기).
   * note = 거절하며 에이전트에게 한 말(아니요, 이렇게 바꿔서…), mode = 계획을 승인하며 고른 맡기는 정도,
   * expired = 답하기 전에 멈추거나 앱이 다시 켜져 닫힘(answer는 deny), by = central: 사용자 대신 중앙 대화가 답함 (크리티컬하지 않은 것만, 11/18)
   */
  // does = 명령이 하는 일, once = 「늘」 없이 한 번씩 (삭제 · 외부)
  // restored = 앱이 다시 켜진 뒤에도 남은 카드(at = 다시 켜진 때), since = 물은 뒤 바뀐 것 (11/28, agentAskRestore.ts)
  z.object({ kind: z.literal('ask'), at: z.string(), id: z.string(), tool: z.string(), summary: z.string(), plan: z.string().optional(), answer: z.enum(ASK_ANSWERS).optional(), note: z.string().optional(), mode: z.enum(CHAT_MODES).optional(), expired: z.boolean().optional(), does: z.enum(CHAT_KINDS).optional(), once: z.boolean().optional(), by: z.literal('central').optional(), restored: z.object({ at: z.string() }).strict().optional(), since: AskSince.optional() }).strict(),
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
  z.object({ kind: z.literal('result'), at: z.string(), ok: z.boolean(), cost: z.number().optional(), seconds: z.number().optional(), tokens: z.object({ in: z.number(), out: z.number() }).strict().optional(), context: z.object({ used: z.number(), window: z.number(), compactAt: z.number().optional() }).strict().optional() }).strict(),
  /** crash = Claude Code 프로세스가 비정상으로 끝남 (사용자가 멈춘 것 밖, 11/20). 같은 대화의 이력으로 세어 중앙에게 알린다 */
  z.object({ kind: z.literal('error'), at: z.string(), text: z.string(), crash: z.boolean().optional() }).strict(),
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
  /**
   * 중앙 방 사람의 답 (11/20 사용자 결정 "중앙 = 여럿이 말하는 방"): 사용자가 @이름 · @모두로 부르거나 방장이 room_ask로 물었을 때.
   * q = 방장이 물은 말 (from host), fold = 읽기만 사람의 접힌 요약. text가 없고 error도 없으면 답하는 중
   */
  z.object({ kind: z.literal('member'), at: z.string(), by: z.enum(AGENT_KINDS), q: z.string().optional(), from: z.literal('host').optional(), fold: z.boolean().optional(), text: z.string().optional(), error: z.string().optional(), seconds: z.number().optional(), verdict: z.enum(ROOM_VERDICTS).optional(), prev: z.enum(ROOM_VERDICTS).optional(),
    /** 토론 대화에서만 (11/20 「토론 · Debate」): stage = 단계, label = 이름을 가린 이름(A · B …), bare = 새 근거 없이 판정을 바꿈, votes · changed = 정리 줄의 마지막 판정들과 입장을 바꾼 수 */
    stage: z.enum(DEBATE_STAGES).optional(), round: z.number().int().optional(), label: z.string().optional(), bare: z.boolean().optional(), votes: z.array(z.enum(ROOM_VERDICTS)).optional(), changed: z.number().int().optional() }).strict(),
  /** 방이 바뀜: 초대 · 내보내기 · 권한 · 방 규칙. by = 사용자 · 방장, reason = 방장이 초대한 까닭 한 줄 */
  /** 중앙에 남는 토론 한 줄 (/토론 · 방장의 debate_open): chat = 토론 대화 id, state = 도는 중 · 정리 끝(끝내기 대기) · 끝남(보관함), line = 정리의 첫 줄 */
  z.object({ kind: z.literal('debate'), at: z.string(), chat: z.string(), q: z.string(), by: z.enum(['user', 'host']), state: z.enum(['running', 'done', 'ended']), votes: z.array(z.enum(ROOM_VERDICTS)).optional(), changed: z.number().int().optional(), line: z.string().optional() }).strict(),
  z.object({ kind: z.literal('room'), at: z.string(), act: z.enum(['invite', 'remove', 'perm', 'rules']), agent: z.enum(AGENT_KINDS).optional(), perm: z.enum(['read', 'talk', 'edit']).optional(), prev: z.enum(['read', 'talk', 'edit']).optional(), by: z.enum(['user', 'host']), reason: z.string().optional() }).strict(),
])

/** 토론 자리 하나: 에이전트와 그 모델 · 생각 수준 (없으면 그 에이전트의 기본) */
export const DebateSeat = z.object({ agent: z.enum(AGENT_KINDS), model: ChatModel.optional(), effort: z.enum(CHAT_EFFORTS).optional() }).strict()
/**
 * 토론 대화 (11/20 사용자 결정 「토론 + 정해진 4단계」, 시안 https://claude.ai/artifact/R88teWLKuf7DgokaYQA61n):
 * q = 물음, seats = 참가자, judge = 정리(투표 안 함), rounds = 비판 차례 수(0 · 1 · 2), skip = 모두 일치하면 비판 건너뛰기,
 * step = 지금 단계(done = 정리 끝, 끝내기나 더 묻기를 기다림), round = 지금 비판 차례, central = 연 중앙 대화, by = 연 쪽, ended = 끝낸 때
 */
export const Debate = z.object({
  q: z.string(), seats: z.array(DebateSeat), judge: DebateSeat, rounds: z.number().int().min(0).max(2), skip: z.boolean(),
  step: z.enum([...DEBATE_STAGES, 'done']), round: z.number().int(), central: z.string().optional(), by: z.enum(['user', 'host']), ended: z.string().optional(),
}).strict()
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
  /** 기록에서 부른 대화: 마지막 답이 고치는 일이라고 판단함. 기록의 답 아래에 「고치게 하기」를 보인다 (11/21) */
  needsEdit: z.boolean().optional(),
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
  /** 피드백 대화를 같은 항목에 다시 맡긴 시각 (코멘트마다 새 대화를 열지 않고 이어 쓴다, 11/20) */
  handed: z.string().optional(),
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
  /** 끝난 차례의 마지막 글이 사용자에게 묻는 말: 답할 때까지 내 차례(답 기다림)이고 저절로 보관하지 않는다 (11/24, chat-asks.ts) */
  asks: z.boolean().optional(),
  compacting: z.boolean().optional(),
  /** 에이전트가 지금 쓰는 중인 글 (다 쓰면 대화 줄이 되고 지워진다. 기록에는 남기지 않는다) */
  draft: z.string().optional(),
  /** 줄 선(queued) 대화의 차례: 1 = 다음에 시작 (대화 목록 「대기」 묶음, 11/20 시안 1절) */
  queue: z.number().int().positive().optional(),
  /** 다른 컴퓨터에서 돌린 대화면 그 컴퓨터 이름 (개인 저장소로 받아 읽기만, 「이 맥에서 이어 하기」로 이 컴퓨터의 새 대화가 된다, 11/20) */
  machine: z.string().optional(),
  /** 서버(설정 › 기기 관리)가 있는 컴퓨터에서, 서버가 아니라 이 컴퓨터에서 도는 대화 (목록의 「이 맥」 태그, 11/20) */
  local: z.boolean().optional(),
  /** 토론 대화면 그 진행 (11/20) */
  debate: Debate.optional(),
  created: z.string(),
  updated: z.string(),
}).strict()

/** always = 이 대화에서 늘 허락한 것(보일 이름), todos = 마지막 할 일 목록 */
/** trimmed = 오래되어 지운 앞 줄 수 (대화는 마지막 400줄만 둔다) */
export const Chat = ChatRow.extend({ items: z.array(ChatItem), always: z.array(z.string()), todos: z.array(Todo), trimmed: z.number().optional() }).strict()

/** GET /agent-chats?rid= */
/** app = 이 맥에서 앱 고치기 대화를 열 수 있는지 (앱 저장소가 있을 때) */
/** handOff = 피드백을 맡길 수 있는지 (앱 저장소 · 피드백 폴더가 있고 설정 › 에이전트에서 끄지 않음) */
/** 이 컴퓨터에서 앱 고치기 대화로 고칠 수 있는 다른 앱 (저장소를 받아 둔 것만, 11/20) */
export const OtherApp = z.object({ id: z.string(), name: z.string() }).strict()
export const ChatList = z.object({ chats: z.array(ChatRow), limit: z.number(), app: z.boolean(), apps: z.array(OtherApp).optional(), handOff: z.boolean() }).strict()
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

export type ChatScope = z.infer<typeof ChatScope>
export type ChatAuto = z.infer<typeof ChatAuto>
export type Attach = z.infer<typeof Attach>
export type Todo = z.infer<typeof Todo>
export type ChatModel = z.infer<typeof ChatModel>
export type ModelChoice = z.infer<typeof ModelChoice>
export type ChatModels = z.infer<typeof ChatModels>
export type ChatAgents = z.infer<typeof ChatAgents>
export type ChatExtras = z.infer<typeof ChatExtras>
export type ChatItem = z.infer<typeof ChatItem>
export type ChatRow = z.infer<typeof ChatRow>
export type Chat = z.infer<typeof Chat>
export type ChatList = z.infer<typeof ChatList>
export type OtherApp = z.infer<typeof OtherApp>
export type ChatOne = z.infer<typeof ChatOne>
export type ChatDeleted = z.infer<typeof ChatDeleted>
export type WorkState = z.infer<typeof WorkState>
export type DebateSeat = z.infer<typeof DebateSeat>
export type Debate = z.infer<typeof Debate>
