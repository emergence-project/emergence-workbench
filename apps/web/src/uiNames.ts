/**
 * English names for screen parts (data-ui). The stored value stays Korean, because feedback records and
 * jumping back to a part (feedbackJump.ts) match on it; only what the screen shows follows the language.
 * Names not in the table are shown as they are. Table: uiNames.en.json (add a line when a data-ui is added).
 * Parts that left the screen keep their English name in uiNames.old.en.json, so old feedback records still read in English
 * (move the line there when a data-ui is removed; uiNames.test.ts tells you which).
 */
import { lang } from './i18n'
import { parseUiPath } from './feedbackJump'
import table from './uiNames.en.json'
import old from './uiNames.old.en.json'

const EN: Record<string, string> = { ...old, ...table }

/**
 * Korean names that changed after the part was named (docs/design-system.md §5 term table, the same old names
 * check-design.mjs blocks in screen text). The stored data-ui keeps the old name; the screen shows the new one,
 * so feedback mode and the feedback list say "레일", not "왼쪽 띠" (10/11 12:37 feedback).
 */
const KO_RENAMED: [RegExp, string][] = [
  [/왼쪽 띠/g, '레일'], [/보조 노트/g, '노트'], [/제목줄/g, '상단바'], [/거르기/g, '필터'], [/형광펜/g, '하이라이트'],
  [/이름표/g, '태그'], [/입력칸/g, '입력란'], [/도구 줄|도구 막대|머리줄/g, '툴바'], [/탭 줄/g, '탭 바'],
  [/맥락 칸/g, '오른쪽 사이드바'], [/왼쪽 칸/g, '왼쪽 패널'], [/오른쪽 칸/g, '오른쪽 패널'], [/작업 칸|지금 칸|다른 칸|옆 칸/g, '패널'], [/다 고침/g, '편집 완료'], [/단추/g, '버튼'],
]
export const koName = (name: string): string => KO_RENAMED.reduce((s, [re, to]) => s.replace(re, to), name)

/** One part name in the screen language */
export const uiName = (name: string): string => (lang === 'ko' ? koName(name) : EN[name] ?? name)

/** A part path ("홈 › 할 일 “Read paper”") in the screen language. Item names (in “ ”) are user text and stay */
export function uiShown(path: string): string {
  if (!path) return path
  return parseUiPath(path).map((s) => (s.item !== undefined ? `${uiName(s.name)} “${s.item}”` : uiName(s.name))).join(' › ')
}

/**
 * 작업 화면 패널의 부위 이름 (11/23 15:21 피드백): 한 패널이면 「패널」, 두 패널이면 「왼쪽 패널」 · 「오른쪽 패널」.
 * 예전 이름 「왼쪽 칸」 · 「오른쪽 칸」은 사이드바로 보였다. 그 이름이 적힌 옛 피드백도 찾아가기가 중간 칸을 건너뛰어 그대로 찾는다
 */
export const paneName = (i: 0 | 1, two: boolean) => (!two ? '패널' : i === 0 ? '왼쪽 패널' : '오른쪽 패널')
