/**
 * 에이전트 설정 (설정 › 에이전트). 앱 설정 파일(config.yaml)의 `agents:`에 저장한다.
 * instructions: 기록의 지시를 누가 언제 하는지 (10/16 사용자 결정 "설정에서 조절할 수 있게 하자").
 *   manual  = 맥의 Claude가 하지 않는다. 에이전트 세션이 MCP list_records로 집어 간다 (10/15까지의 동작)
 *   instant = 지시를 남기면 맥의 Claude가 바로 한다
 *   daily   = 하루 한 번 at 시각에 대기 중인 지시를 모아 한다
 * 맥의 Claude는 한 번에 하나씩 차례로 돈다 (여러 개가 함께 떠 메모리를 다 쓰지 않게).
 */
export const INSTRUCTION_MODES = ['manual', 'instant', 'daily'] as const
export type InstructionMode = (typeof INSTRUCTION_MODES)[number]

/** 하루 한 번 할 때 고를 수 있는 시각 (정시) */
export const INSTRUCTION_HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

/**
 * 앱 피드백을 이 맥의 앱 고치기 대화가 맡는 방법 (2단계 다, 10/21 "앱 안 대화 + CI가 시험").
 * feedback: off = 맡기지 않음(버튼도 없음) · manual = 피드백 화면의 「에이전트에게 맡기기」로만 · instant = 에이전트 차례가 생기면 앱이 바로 맡김 (한 번에 하나)
 * merge: green = 맡은 대화의 PR이 CI 초록이면 앱이 합침 · approved = 사용자가 그 답을 승인한 뒤에 합침 · never = 합치지 않음(사용자가 합침)
 * minutes: 한 차례 한도. 넘으면 멈춘다. CI가 빨가면 실패 기록을 대화에 다시 보내 고치게 하고, 두 번까지만.
 */
export const FEEDBACK_PICKS = ['off', 'manual', 'instant'] as const
export type FeedbackPick = (typeof FEEDBACK_PICKS)[number]
export const FEEDBACK_MERGES = ['green', 'approved', 'never'] as const
export type FeedbackMerge = (typeof FEEDBACK_MERGES)[number]
export const FEEDBACK_MINUTES = [10, 20, 30, 60] as const

export interface AgentSettings {
  instructions: InstructionMode
  at: string
  feedback: FeedbackPick
  merge: FeedbackMerge
  minutes: number
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = { instructions: 'manual', at: '09:00', feedback: 'manual', merge: 'green', minutes: 30 }

/** 저장된 값이나 요청 값을 믿지 않고, 고를 수 있는 값만 남긴다 */
export function normalizeAgentSettings(raw: unknown, base: AgentSettings = DEFAULT_AGENT_SETTINGS): AgentSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    instructions: (INSTRUCTION_MODES as readonly unknown[]).includes(src.instructions) ? src.instructions as InstructionMode : base.instructions,
    at: INSTRUCTION_HOURS.includes(src.at as string) ? src.at as string : base.at,
    feedback: (FEEDBACK_PICKS as readonly unknown[]).includes(src.feedback) ? src.feedback as FeedbackPick : base.feedback,
    merge: (FEEDBACK_MERGES as readonly unknown[]).includes(src.merge) ? src.merge as FeedbackMerge : base.merge,
    minutes: (FEEDBACK_MINUTES as readonly unknown[]).includes(src.minutes) ? src.minutes as number : base.minutes,
  }
}
