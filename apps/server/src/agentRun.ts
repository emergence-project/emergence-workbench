// 에이전트 실행기의 입출력 (실제는 agentRunner.ts의 Claude Agent SDK, 테스트는 가짜). agentChats.ts에서 옮김 (11/20, 구조 래칫)
import type { ChatEffort, ChatMode, ChatModel, ChatWrite, ImageIn, ModelChoice } from '@rw/core/contract/agentChats'
import type { Inbox } from './agentInbox.js'

export type ToolDecision = { allow: true } | { allow: false; message: string }

export interface RunInput {
  prompt: string
  /** 붙여 넣은 그림 (이번 지시에만) */
  images?: ImageIn[]
  /** plan이면 계획을 승인할 때까지 SDK의 계획 모드로 시작한다 */
  mode: ChatMode
  model: ChatModel
  effort: ChatEffort
  /** 이어서 지시할 때: 앞 차례의 세션 */
  sessionId?: string
  cwd: string
  /** 읽어도 묻지 않는 폴더 (공용 라이브러리) */
  extraDirs: string[]
  /** 대화를 열 때 주는 짧은 안내 (범위 · 단계 · 다른 대화가 잡은 파일) */
  brief: string
  write: ChatWrite
  /** 앱 고치기 대화: 그 대화 id (앱 MCP에 app_submit · app_checks를 붙이고, 파일 고치기 도구와 명령을 연다). central = 중앙 대화 (chat_* 도구). chat = 중앙이 아닌 대화의 id (central_help로 중앙에게 중재를 청한다, 11/19) */
  appChat?: string; central?: boolean; chat?: string
  /** 에이전트 프로세스에 더할 환경 변수 (앱 고치기 대화: 화면 그림 포트 등) */
  env?: Record<string, string>
  /**
   * 이어서 보낼 지시 (Claude Code처럼 차례가 끝나도 에이전트를 열어 둔다). 실행기는 첫 지시 뒤 여기서 오는 지시를 그대로 넘기고,
   * 닫히면(앱이 오래 쉬거나 설정이 바뀜) 하던 차례를 끝낸 뒤 끝난다. 읽지 않고 끝내는 실행기(예제 · 시험)면 남은 지시를 앱이 다음 실행에 넘긴다
   */
  inbox?: Inbox<Turn>
  /** 되돌리기 뒤: sessionId의 이 메시지까지만 이어 새 세션으로 가른다 (그 뒤 대화는 버린다) */
  resumeAt?: string
  /** 실행기가 하던 차례만 끊는 손잡이를 넘긴다 (Claude Code의 Esc). true = 끊겼고 기다리는 지시도 없음 */
  /** unread = 실행기가 가져갔지만 에이전트가 아직 읽지 않은 지시 (닫힐 때 「다음에 보냄」으로 되돌린다) */ control?: (c: { interrupt(): Promise<boolean>; unread?: () => Turn[] }) => void
  canUseTool: (tool: string, input: Record<string, unknown>) => Promise<ToolDecision>
  signal: AbortSignal
}

export type RunEvent =
  | { type: 'session'; id: string }
  | { type: 'text'; text: string; sub?: boolean }
  | { type: 'tool'; tool: string; input: Record<string, unknown>; sub?: boolean }
  | { type: 'result'; ok: boolean; cost?: number; seconds?: number; error?: string; tokens?: { in: number; out: number }; context?: { used: number; window: number } }
  /** 앞 내용을 요약함 (자동 · /compact) */
  | { type: 'compact'; auto: boolean; before: number; after?: number }
  /** 요약하는 중 */
  | { type: 'status'; compacting: boolean }
  /** 뒤에서 도는 명령 수가 바뀜 */
  | { type: 'tasks'; count: number }
  /** 쓰는 중인 글 조각 (주 에이전트, 다 쓰면 text가 온다) */
  | { type: 'delta'; text: string }
  /** 생각한 것의 요약 */
  | { type: 'think'; text: string }
  /** 주 에이전트의 메시지 하나가 끝남 (되돌리기: 다음 지시 앞에서 대화를 가를 자리) */
  | { type: 'mark'; uuid: string }

/** 지시 하나 (글과 붙인 그림) */
export type Turn = { prompt: string; images?: ImageIn[] }

/**
 * 실행기. models = 고를 수 있는 모델 (맥의 Claude Code에게 묻는다, 모르면 없음),
 * side = 곁 질문 하나에 작은 모델이 도구 없이 답한다 (prompt에 대화 요약과 질문이 다 들어 있다)
 */
export type AgentRunner = ((input: RunInput) => AsyncIterable<RunEvent>) & { models?: () => Promise<ModelChoice[]>; side?: (o: OneShot) => Promise<string>; review?: (o: OneShot) => Promise<string> }
/** 한 번 묻기: model · effort = 토론 자리의 모델 · 생각 수준 (없으면 실행기의 기본) */ export type OneShot = { prompt: string; cwd: string; model?: string; effort?: ChatEffort }
