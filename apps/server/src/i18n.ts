import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Language of messages the server sends to the screen (errors, labels).
 * Each message is written in place as `t('한국어', 'English')`.
 *
 * A request from the screen carries `x-rw-lang` (see apps/web/src/api/http.ts), so the answer
 * follows the screen. Without a request (watchers, startup) or the header, the language saved in
 * Settings is used; `system` and unknown fall back to English. RW_LANG overrides it (tests use ko).
 *
 * Text written into research files (journals, STATUS.md, front matter) is a file format other code
 * reads back: change it only together with its readers.
 */
export type Lang = 'ko' | 'en'

const store = new AsyncLocalStorage<Lang>()
let fallback: () => string | undefined = () => undefined

/** The registry tells which language Settings chose. */
export function setDefaultLang(read: () => string | undefined): void { fallback = read }

export const asLang = (v: unknown): Lang | undefined => (v === 'ko' || v === 'en' ? v : undefined)

export function currentLang(): Lang {
  return asLang(process.env.RW_LANG) ?? store.getStore() ?? asLang(fallback()) ?? 'en'
}

/** Run a request handler with the screen's language. */
export function withLang<T>(lang: Lang | undefined, run: () => T): T {
  return lang ? store.run(lang, run) : run()
}

/** Pick the text for the current language. */
export const t = (ko: string, en: string): string => (currentLang() === 'ko' ? ko : en)
