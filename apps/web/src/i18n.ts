import { setCoreLang, type UiSettings } from '@rw/core'
import { cachedUi } from './ui'

/**
 * Screen language. Each visible text is written in place as `t('한국어', 'English')`,
 * so both languages sit side by side and a missing translation is a type error.
 *
 * The language is fixed when the page loads (module-level labels are built once).
 * Changing it in Settings saves config.yaml and reloads the page (see applyUi in ui.ts).
 * `data-ui` values are feedback-mode part names and stay Korean in both languages.
 */
export type Lang = 'ko' | 'en'

export function resolveLang(setting: UiSettings['language']): Lang {
  if (setting === 'ko' || setting === 'en') return setting
  const nav = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language])
  return nav.some((l) => /^ko\b/i.test(l ?? '')) ? 'ko' : 'en'
}

// Unit tests (vitest) check the Korean text
export const lang: Lang = import.meta.env?.MODE === 'test' ? 'ko' : resolveLang(cachedUi().language)

setCoreLang(() => lang)

/** Pick the text for the current language. */
export const t = (ko: string, en: string): string => (lang === 'ko' ? ko : en)

/** English plural helper: `plural(n, 'note')` → "1 note" / "3 notes". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** Locale for dates and numbers. */
export const locale = (): string => (lang === 'ko' ? 'ko-KR' : 'en-US')

if (typeof document !== 'undefined') document.documentElement.lang = lang

// Settings changed the language (here or in another window): reload so every label is rebuilt.
if (typeof window !== 'undefined') {
  const check = () => { if (resolveLang(cachedUi().language) !== lang) location.reload() }
  window.addEventListener('rw-ui-changed', check)
  window.addEventListener('storage', (e) => { if (e.key === 'rw-ui') check() })
}

/**
 * English names for Korean words that are stored in files and settings (journal kinds, comment places,
 * feedback kinds, built-in template names and tags). The stored value stays Korean; only the screen shows English.
 */
const STORED_EN: Record<string, string> = {
  메모: 'Memo', '할 일': 'To-do', 상태: 'Status', 완료: 'Done', 전체: 'Whole',
  디자인: 'Design', 버그: 'Bug', 기능: 'Feature', 질문: 'Question', 미분류: 'Unsorted',
  노트: 'Note', 논문: 'Paper', 발표: 'Talk',
  '기본 문서 (article)': 'Basic document (article)', '발표 (Knowledge Factory beamer)': 'Talk (Knowledge Factory beamer)', '연구노트 (rw-research-note)': 'Research note (rw-research-note)',
}
export const shown = (stored: string): string => (lang === 'ko' ? stored : STORED_EN[stored] ?? stored)
