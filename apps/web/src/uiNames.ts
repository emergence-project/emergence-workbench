/**
 * English names for screen parts (data-ui). The stored value stays Korean, because feedback records and
 * jumping back to a part (feedbackJump.ts) match on it; only what the screen shows follows the language.
 * Names not in the table are shown as they are. Table: uiNames.en.json (add a line when a data-ui is added).
 */
import { lang } from './i18n'
import { parseUiPath } from './feedbackJump'
import table from './uiNames.en.json'

const EN: Record<string, string> = table

/** One part name in the screen language */
export const uiName = (name: string): string => (lang === 'ko' ? name : EN[name] ?? name)

/** A part path ("홈 › 할 일 “Read paper”") in the screen language. Item names (in “ ”) are user text and stay */
export function uiShown(path: string): string {
  if (lang === 'ko' || !path) return path
  return parseUiPath(path).map((s) => (s.item !== undefined ? `${uiName(s.name)} “${s.item}”` : uiName(s.name))).join(' › ')
}
