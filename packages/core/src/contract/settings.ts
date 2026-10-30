/**
 * 화면 설정 API의 계약 (앱 설정 config.yaml의 ui:, 서버 routes/settings.ts · 화면 api/settings.ts).
 * 고를 수 있는 값은 @rw/core의 UI_OPTIONS 하나에서 온다.
 */
import { z } from 'zod'
import { UI_OPTIONS, type UiSettings as UiSettingsType } from '../ui-settings.js'
import { FEEDBACK_MERGES, FEEDBACK_MINUTES, FEEDBACK_PICKS, INSTRUCTION_HOURS, INSTRUCTION_MODES } from '../agent-settings.js'
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
export const AgentSettings = z.object({
  instructions: z.enum(INSTRUCTION_MODES),
  /** 질문을 언제 하나 (10/29, 지시와 따로) */
  questions: z.enum(INSTRUCTION_MODES),
  at: z.custom<string>((v) => INSTRUCTION_HOURS.includes(v as string), { message: 'Expected HH:00' }),
  /** 앱 피드백 맡기기 (2단계 다): 언제 맡기나 · 언제 합치나 · 한 차례 한도(분) */
  feedback: z.enum(FEEDBACK_PICKS),
  merge: z.enum(FEEDBACK_MERGES),
  minutes: z.custom<number>((v) => (FEEDBACK_MINUTES as readonly unknown[]).includes(v), { message: 'Expected 10, 20, 30 or 60' }),
}).strict()
/** 바꿀 것만 보낸다. 고를 수 없는 값은 서버(normalizeAgentSettings)가 무시한다 */
export const AgentSettingsBody = z.custom<Partial<z.infer<typeof AgentSettings>>>((v) => !!v && typeof v === 'object' && !Array.isArray(v), { message: 'Expected an object' })

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
