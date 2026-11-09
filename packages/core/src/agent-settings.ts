/**
 * 에이전트 설정 (설정 › 에이전트). 앱 설정 파일(config.yaml)의 `agents:`에 저장한다.
 * instructions: 기록의 지시를 누가 언제 하는지 (10/16 사용자 결정 "설정에서 조절할 수 있게 하자").
 * questions: 기록의 질문을 누가 언제 하는지 (10/28 23:07 피드백 "질문 따로 지시 따로"). 값은 instructions와 같은 셋이고, 저장된 값이 없으면 instructions를 이어받는다.
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

/**
 * 에이전트마다 (11/9 사용자 결정 "Claude가 쓰고 Codex가 검토", 시안 https://claude.ai/artifact/3rzyEjiuLgnmBvmWLJoER8 2절).
 * trust = 새 대화의 시작 권한(대화 안에서 바꾼 것은 그 대화에만), auto = 시작할 때 자동 허용(읽기 · 실행 · 웹 보기, 없으면 권한 이름의 기본값 presetAuto),
 * role = 하는 일: write 새 대화를 맡음 · review 검토만(새 대화의 에이전트 줄에 없음) · both. 검토는 Codex만 하고, 검토로 불리면 늘 읽기 전용
 */
export const AGENT_TRUSTS = ['read', 'ask', 'plan', 'edit'] as const
export type AgentTrust = (typeof AGENT_TRUSTS)[number]
export const AGENT_ROLES = ['write', 'review', 'both'] as const
export type AgentRole = (typeof AGENT_ROLES)[number]
export const AGENT_PREF_KINDS = ['claude-code', 'codex', 'gemini'] as const
export type AgentPrefKind = (typeof AGENT_PREF_KINDS)[number]
export interface AgentPref { trust: AgentTrust; auto?: { read: boolean; run: boolean; web: boolean }; role: AgentRole }
/** 저절로 검토: off = 「Codex 검토」를 누를 때만 · edits = Claude가 파일을 고친 차례가 끝날 때마다 */
export const REVIEW_MODES = ['off', 'edits'] as const
export type ReviewMode = (typeof REVIEW_MODES)[number]

export interface AgentSettings {
  instructions: InstructionMode
  questions: InstructionMode
  at: string
  feedback: FeedbackPick
  merge: FeedbackMerge
  minutes: number
  per: Record<AgentPrefKind, AgentPref>
  review: ReviewMode
}

/** Claude는 지금까지의 새 대화 처음 값(편집 자동 허용), Codex · Gemini는 묻고 하기 (계획 모드는 Claude만). 자동 허용은 권한 이름의 기본값 */
export const DEFAULT_AGENT_PREFS: Record<AgentPrefKind, AgentPref> = {
  'claude-code': { trust: 'edit', role: 'write' },
  codex: { trust: 'ask', role: 'both' },
  gemini: { trust: 'ask', role: 'write' },
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = { instructions: 'manual', questions: 'manual', at: '09:00', feedback: 'manual', merge: 'green', minutes: 30, per: DEFAULT_AGENT_PREFS, review: 'off' }

/** 저장된 값이나 요청 값을 믿지 않고, 고를 수 있는 값만 남긴다 */
export function normalizeAgentSettings(raw: unknown, current?: AgentSettings): AgentSettings {
  const base = current ?? DEFAULT_AGENT_SETTINGS
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const mode = (v: unknown): v is InstructionMode => (INSTRUCTION_MODES as readonly unknown[]).includes(v)
  const instructions = mode(src.instructions) ? src.instructions : base.instructions
  return {
    instructions,
    // 10/29 전 설정 파일에는 questions가 없다: 읽을 때(current 없음)는 instructions를 이어받고, 바꿀 때는 지금 값을 둔다
    questions: mode(src.questions) ? src.questions : current ? current.questions : instructions,
    at: INSTRUCTION_HOURS.includes(src.at as string) ? src.at as string : base.at,
    feedback: (FEEDBACK_PICKS as readonly unknown[]).includes(src.feedback) ? src.feedback as FeedbackPick : base.feedback,
    merge: (FEEDBACK_MERGES as readonly unknown[]).includes(src.merge) ? src.merge as FeedbackMerge : base.merge,
    minutes: (FEEDBACK_MINUTES as readonly unknown[]).includes(src.minutes) ? src.minutes as number : base.minutes,
    per: normalizePrefs(src.per, base.per),
    review: has(REVIEW_MODES, src.review) ? src.review : base.review,
  }
}

const has = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {})

/** 바꾼 칸만 와도 된다 (예: { codex: { role: 'review' } }). 계획 모드는 Claude만, 검토는 Codex만, Claude는 쓰기만. auto: null이면 권한 이름의 기본값으로 */
function normalizePrefs(raw: unknown, base: Record<AgentPrefKind, AgentPref>): Record<AgentPrefKind, AgentPref> {
  const src = rec(raw)
  const one = (k: AgentPrefKind): AgentPref => {
    const b = base[k] ?? DEFAULT_AGENT_PREFS[k]
    const v = rec(src[k])
    const trust = has(AGENT_TRUSTS, v.trust) && (v.trust !== 'plan' || k === 'claude-code') ? v.trust : b.trust
    const role = k === 'claude-code' ? 'write' : has(AGENT_ROLES, v.role) && (v.role === 'write' || k === 'codex') ? v.role : b.role
    const a = rec(v.auto)
    const auto = v.auto === null ? undefined : typeof a.read === 'boolean' && typeof a.run === 'boolean' && typeof a.web === 'boolean' ? { read: a.read, run: a.run, web: a.web } : b.auto
    return { trust, role, ...(auto && { auto }) }
  }
  return { 'claude-code': one('claude-code'), codex: one('codex'), gemini: one('gemini') }
}
