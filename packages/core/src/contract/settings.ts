/**
 * 화면 설정 API의 계약 (앱 설정 config.yaml의 ui:, 서버 routes/settings.ts · 화면 api/settings.ts).
 * 고를 수 있는 값은 @rw/core의 UI_OPTIONS 하나에서 온다.
 */
import { z } from 'zod'
import { UI_OPTIONS, type UiSettings as UiSettingsType } from '../ui-settings.js'
import { AGENT_PREF_KINDS, AGENT_ROLES, AGENT_TRUSTS, FEEDBACK_MERGES, FEEDBACK_MINUTES, FEEDBACK_PICKS, INSTRUCTION_HOURS, INSTRUCTION_MODES, REVIEW_MODES, type AgentPrefKind, type AgentRole, type AgentTrust } from '../agent-settings.js'
import { SYNC_MODES } from '../sync-settings.js'

type Key = keyof typeof UI_OPTIONS
const choice = <K extends Key>(k: K) =>
  z.custom<(typeof UI_OPTIONS)[K][number]>((v) => (UI_OPTIONS[k] as readonly unknown[]).includes(v), { message: `Expected one of ${UI_OPTIONS[k].join(', ')}` })

export const UiSettings = z.object({
  language: choice('language'),
  theme: choice('theme'),
  fontSize: choice('fontSize'),
  density: choice('density'),
  accent: choice('accent'),
  highlightColor: choice('highlightColor'),
  editorFont: choice('editorFont'),
  editorSize: choice('editorSize'),
  editorLineHeight: choice('editorLineHeight'),
}).strict() satisfies z.ZodType<UiSettingsType>

/** GET · PUT /settings */
export const SettingsView = z.object({ ui: UiSettings }).strict()

// ---------- 요청 ----------
/** 바꿀 것만 보낸다. 고를 수 없는 값과 모르는 칸은 서버(normalizeUi)가 무시한다 (예전 설정·다른 버전의 화면과 부딪히지 않게) */
export const SettingsBody = z.object({ ui: z.custom<Partial<UiSettingsType>>((v) => !!v && typeof v === 'object' && !Array.isArray(v), { message: 'Expected an object' }) })

/** GET · PUT /settings/agents (설정 › 에이전트) */
const AgentPref = z.object({ trust: z.enum(AGENT_TRUSTS), auto: z.object({ read: z.boolean(), run: z.boolean(), web: z.boolean() }).strict().optional(), role: z.enum(AGENT_ROLES) }).strict()
export const AgentSettings = z.object({
  instructions: z.enum(INSTRUCTION_MODES),
  /** 질문을 언제 하나 (10/29, 지시와 따로) */
  questions: z.enum(INSTRUCTION_MODES),
  at: z.custom<string>((v) => INSTRUCTION_HOURS.includes(v as string), { message: 'Expected HH:00' }),
  /** 앱 피드백 맡기기 (2단계 다): 언제 맡기나 · 언제 합치나 · 한 차례 한도(분) */
  feedback: z.enum(FEEDBACK_PICKS),
  merge: z.enum(FEEDBACK_MERGES),
  minutes: z.custom<number>((v) => (FEEDBACK_MINUTES as readonly unknown[]).includes(v), { message: 'Expected 10, 20, 30 or 60' }),
  /** 에이전트마다 새 대화의 시작 권한 · 자동 허용 · 하는 일 (11/9) */
  per: z.record(z.enum(AGENT_PREF_KINDS), AgentPref),
  /** 저절로 검토 (11/9) */
  review: z.enum(REVIEW_MODES),
  /** 서버로 정한 컴퓨터가 따로 있으면 (11/20): 피드백 맡기기 · 합치기 · 한도는 그 서버의 값. error = 서버에 닿지 않음 (그때 그 칸은 이 맥의 값이고 바꿀 수 없다) */
  place: z.object({ server: z.string(), error: z.string().optional() }).strict().optional(),
}).strict()
/** 바꿀 것만 보낸다. 고를 수 없는 값은 서버(normalizeAgentSettings)가 무시한다 */
/** per는 바꾼 에이전트 · 칸만, auto: null은 권한 이름의 기본값으로 (normalizePrefs) */
type AgentPrefPatch = { trust?: AgentTrust; auto?: { read: boolean; run: boolean; web: boolean } | null; role?: AgentRole }
export const AgentSettingsBody = z.custom<Partial<Omit<z.infer<typeof AgentSettings>, 'per' | 'place'>> & { per?: Partial<Record<AgentPrefKind, AgentPrefPatch>> }>((v) => !!v && typeof v === 'object' && !Array.isArray(v), { message: 'Expected an object' })

/** GET · PUT /settings/sync (설정 › 동기화, 10/19). 지금 쓰는 값(저장 안 한 칸은 앱을 켤 때 정한 값)과, 이 앱에서 그 일을 하는지 */
const SyncChoice = z.object({ mode: z.enum(SYNC_MODES), every: z.number().int().positive() }).strict()
export const SyncSettingsView = z.object({
  publish: SyncChoice, pull: SyncChoice, update: SyncChoice,
  /** 개발용 예제 모드 · 개인 저장소 없음 · 앱 사본이 아님 등으로 그 일을 하지 않으면 false */
  available: z.object({ publish: z.boolean(), pull: z.boolean(), update: z.boolean() }).strict(),
}).strict()
/** 바꿀 칸만 보낸다. 고를 수 없는 값은 서버(normalizeSyncSettings)가 무시한다 */
export const SyncSettingsBody = z.custom<Partial<Record<'publish' | 'pull' | 'update', { mode?: string; every?: number }>>>((v) => !!v && typeof v === 'object' && !Array.isArray(v), { message: 'Expected an object' })
export type SyncSettingsView = z.infer<typeof SyncSettingsView>
export type SyncSettingsBody = z.input<typeof SyncSettingsBody>
export type AgentSettings = z.infer<typeof AgentSettings>
export type AgentSettingsBody = z.input<typeof AgentSettingsBody>
export type SettingsView = z.infer<typeof SettingsView>
export type SettingsBody = z.input<typeof SettingsBody>

// ---------- 설정 › 공통 규칙 (서버 routes/commonRules.ts, 2026-10-18 사용자 승인 시안) ----------

/** GET · PUT /settings/common-rules: 연구 공통 규칙 파일 하나 (개인 저장소 사본의 rules/research.md) */
export const CommonRulesView = z.object({
  /** 화면에 보일 자리 (홈은 ~) */
  file: z.string(),
  exists: z.boolean(),
  /** 머리말의 status (accepted · in-review · draft …). 없으면 null */
  status: z.string().nullable(),
  /** 머리말의 updated */
  updated: z.string().nullable(),
  /** 번호 붙은 규칙 줄 수 */
  count: z.number(),
  /** 절 제목 (## …) */
  sections: z.array(z.string()),
  /** 입력란에 둘 글: 머리말을 뗀 본문 */
  body: z.string(),
  /** 파일 전체의 hash (고칠 때 baseHash) */
  hash: z.string(),
  /** 고친 것이 아직 GitHub에 없다 (올리지 못함) */
  unpublished: z.boolean(),
}).strict()
export const CommonRulesBody = z.object({ body: z.string().max(200_000), baseHash: z.string() }).strict()
/** PUT의 답: 저장한 뒤의 모습과 올리기 결과 (올리지 않는 모드면 published: null) */
export const CommonRulesSaved = z.object({
  view: CommonRulesView,
  published: z.object({ pushed: z.boolean(), message: z.string() }).strict().nullable(),
}).strict()

export type CommonRulesView = z.infer<typeof CommonRulesView>
export type CommonRulesBody = z.infer<typeof CommonRulesBody>
export type CommonRulesSaved = z.infer<typeof CommonRulesSaved>

/**
 * GET /settings/ai-key · PUT /settings/ai-key(키 넣기) · DELETE /settings/ai-key/:provider(키 지우기): 앱이 직접 묻는 AI의 키 (계정 페이지, 서버 aiKey.ts).
 * PUT /settings/ai-key/use: 질문에 답할 AI 고르기 (설정 › 에이전트). null이면 이 컴퓨터의 claude 명령.
 * 키는 받기만 하고 돌려주지 않는다: 고른 AI와 쓰는 모델, 넣어 둔 키마다 끝 네 자만.
 */
export const AI_PROVIDERS = ['claude', 'gemini', 'chatgpt'] as const
export const KEY_PROVIDERS = ['claude', 'gemini'] as const
export const AiKeyView = z.object({
  key: z.object({ provider: z.enum(AI_PROVIDERS), model: z.string(), hint: z.string() }).strict().nullable(),
  saved: z.object({ claude: z.string().nullable(), gemini: z.string().nullable() }).strict(),
}).strict()
/** 키 넣기 (ChatGPT는 키 없이 Codex 로그인: 계정 페이지의 Codex 「이 컴퓨터」 줄) */
export const AiKeyBody = z.object({ provider: z.enum(KEY_PROVIDERS), key: z.string().trim().min(8).max(400) }).strict()
export const AiUseBody = z.object({ provider: z.enum(AI_PROVIDERS).nullable() }).strict()
/**
 * GET /settings/codex · POST /settings/codex/install · POST /settings/codex/login: ChatGPT로 답하게 하는 Codex (서버 codexCli.ts).
 * 받기 · 로그인은 오래 걸려 바로 돌려주고, 화면이 busy가 빌 때까지 GET으로 본다.
 */
export const CodexStatus = z.object({
  installed: z.boolean(), version: z.string().nullable(), login: z.boolean(),
  busy: z.object({ step: z.enum(['install', 'login']), received: z.number(), total: z.number() }).strict().nullable(),
  error: z.string().nullable(),
}).strict()
export type CodexStatus = z.infer<typeof CodexStatus>
export type AiKeyView = z.infer<typeof AiKeyView>
export type AiKeyBody = z.infer<typeof AiKeyBody>
export type AiUseBody = z.infer<typeof AiUseBody>
