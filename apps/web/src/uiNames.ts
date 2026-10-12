/**
 * English names for screen parts (data-ui). The stored value stays Korean, because feedback records and
 * jumping back to a part (feedbackJump.ts) match on it; only what the screen shows follows the language.
 * Names not in the table are shown as they are. Table: uiNames.en.json (add a line when a data-ui is added).
 */
import { lang } from './i18n'
import { parseUiPath } from './feedbackJump'
import table from './uiNames.en.json'

const EN: Record<string, string> = table

/**
 * Korean names that changed after the part was named (docs/design-system.md §5 term table, the same old names
 * check-design.mjs blocks in screen text). The stored data-ui keeps the old name; the screen shows the new one,
 * so feedback mode and the feedback list say "레일", not "왼쪽 띠" (10/11 12:37 feedback).
 */
const KO_RENAMED: [RegExp, string][] = [
  [/왼쪽 띠/g, '레일'], [/보조 노트/g, '노트'], [/제목줄/g, '상단바'], [/거르기/g, '필터'], [/형광펜/g, '하이라이트'],
  [/이름표/g, '태그'], [/입력칸/g, '입력란'], [/도구 줄|도구 막대|머리줄/g, '툴바'], [/탭 줄/g, '탭 바'],
  [/오른쪽 칸|맥락 칸/g, '오른쪽 사이드바'], [/왼쪽 칸/g, '왼쪽 사이드바'], [/작업 칸|지금 칸|다른 칸|옆 칸/g, '패널'], [/다 고침/g, '편집 완료'], [/단추/g, '버튼'],
]
export const koName = (name: string): string => KO_RENAMED.reduce((s, [re, to]) => s.replace(re, to), name)

/** One part name in the screen language */
export const uiName = (name: string): string => (lang === 'ko' ? koName(name) : EN[name] ?? name)

/** A part path ("홈 › 할 일 “Read paper”") in the screen language. Item names (in “ ”) are user text and stay */
export function uiShown(path: string): string {
  if (!path) return path
  return parseUiPath(path).map((s) => (s.item !== undefined ? `${uiName(s.name)} “${s.item}”` : uiName(s.name))).join(' › ')
}
