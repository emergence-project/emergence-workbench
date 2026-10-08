/**
 * Language of labels made in core (the app picks it: the server per request, the web at page load).
 * Without a picker, Korean is used (unchanged behavior for scripts and tests).
 */
export type CoreLang = 'ko' | 'en'
let pick: () => CoreLang = () => 'ko'

export function setCoreLang(read: () => CoreLang): void { pick = read }

/** Pick the text for the current language: `tr('한국어', 'English')`. */
export const tr = (ko: string, en: string): string => (pick() === 'ko' ? ko : en)
