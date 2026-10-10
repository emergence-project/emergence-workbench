/**
 * 화면 설정 API의 계약 (앱 설정 config.yaml의 ui:, 서버 routes/settings.ts · 화면 api/settings.ts).
 * 고를 수 있는 값은 @rw/core의 UI_OPTIONS 하나에서 온다.
 */
import { z } from 'zod'
import { UI_OPTIONS, type UiSettings as UiSettingsType } from '../ui-settings.js'

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

export type SettingsView = z.infer<typeof SettingsView>
export type SettingsBody = z.input<typeof SettingsBody>
