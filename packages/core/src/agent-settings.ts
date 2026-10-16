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

export interface AgentSettings {
  instructions: InstructionMode
  at: string
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = { instructions: 'manual', at: '09:00' }

/** 저장된 값이나 요청 값을 믿지 않고, 고를 수 있는 값만 남긴다 */
export function normalizeAgentSettings(raw: unknown, base: AgentSettings = DEFAULT_AGENT_SETTINGS): AgentSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    instructions: (INSTRUCTION_MODES as readonly unknown[]).includes(src.instructions) ? src.instructions as InstructionMode : base.instructions,
    at: INSTRUCTION_HOURS.includes(src.at as string) ? src.at as string : base.at,
  }
}
