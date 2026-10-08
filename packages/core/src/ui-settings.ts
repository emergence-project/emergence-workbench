/**
 * 화면 설정 (설정 화면에서 바꾸는 것). 앱 설정 파일(config.yaml)의 `ui:`에 저장한다.
 * 값마다 고를 수 있는 것을 정해 두고, 모르는 값은 기본값으로 되돌린다.
 */
export const UI_OPTIONS = {
  // Screen language. system follows the browser (Korean if it prefers Korean, otherwise English)
  language: ['system', 'en', 'ko'],
  theme: ['system', 'light', 'dark'],
  fontSize: ['small', 'normal', 'large'],
  density: ['compact', 'normal', 'comfortable'],
  // 청록은 10/4에 뺐다: 해결 색(청록)과 겹친다. 저장된 teal은 흑백으로 돌아간다
  accent: ['mono', 'indigo', 'plum'],
  highlightColor: ['yellow', 'green', 'blue', 'pink'],
  // SF Mono는 macOS 앱 안에만 들어 있어 브라우저(앱 창)에서 쓸 수 없다. 지금까지도 Menlo로 보였다
  editorFont: ['menlo', 'monaco', 'noto-mono', 'courier'],
  editorSize: [11, 12, 12.5, 13, 14, 15, 16],
  editorLineHeight: [1.5, 1.65, 1.8, 2],
} as const

type Opt<K extends keyof typeof UI_OPTIONS> = (typeof UI_OPTIONS)[K][number]

export interface UiSettings {
  language: Opt<'language'>
  theme: Opt<'theme'>
  fontSize: Opt<'fontSize'>
  density: Opt<'density'>
  accent: Opt<'accent'>
  highlightColor: Opt<'highlightColor'>
  editorFont: Opt<'editorFont'>
  editorSize: Opt<'editorSize'>
  editorLineHeight: Opt<'editorLineHeight'>
}

export const DEFAULT_UI: UiSettings = {
  language: 'system',
  theme: 'system',
  fontSize: 'normal',
  density: 'normal',
  accent: 'mono',
  highlightColor: 'yellow',
  editorFont: 'menlo',
  editorSize: 12.5,
  editorLineHeight: 1.8,
}

/** 저장된 값이나 요청 값을 믿지 않고, 고를 수 있는 값만 남긴다 */
export function normalizeUi(raw: unknown, base: UiSettings = DEFAULT_UI): UiSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...base } as Record<keyof UiSettings, unknown>
  for (const key of Object.keys(UI_OPTIONS) as Array<keyof UiSettings>) {
    const v = src[key]
    if ((UI_OPTIONS[key] as readonly unknown[]).includes(v)) out[key] = v
  }
  return out as UiSettings
}
