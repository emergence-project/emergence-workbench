import * as agents from './about/agents'
import * as design from './about/design'
import * as feedback from './about/feedback'
import * as home from './about/home'
import * as intro from './about/intro'
import * as layout from './about/layout'
import * as knowledge from './about/knowledge'
import * as network from './about/network'
import * as next from './about/next'
import * as notes from './about/notes'
import * as principles from './about/principles'
import * as project from './about/project'
import * as reading from './about/reading'
import * as reference from './about/reference'
import * as building from './about/building'
import * as research from './about/research'
import * as rules from './about/rules'
import * as settings from './about/settings'
import * as symbols from './about/symbols'
import { COLOR_ROWS_EN, COLOR_ROWS_KO, SYMBOL_GROUPS_EN, SYMBOL_GROUPS_KO } from './about/symbolTables'
import type { AboutPart, AboutSection, ColorRow } from './about/types'
import { lang } from './i18n'

export type { AboutItem, AboutPart, AboutSection, ColorRow, SymbolRow } from './about/types'
export { COLOR_ROWS_EN, COLOR_ROWS_KO, SYMBOL_GROUPS_EN, SYMBOL_GROUPS_KO }

/**
 * 이 앱 소개의 쪽들 (AboutPage.tsx가 그린다).
 * 소개의 목적 (사용자 10/1 23:31, 10/3 22:55): 에이전트가 사용자의 말을 어떻게 알아들었고 그것을 어떻게 만들었는지 확인하고 바로잡는 곳.
 * 10/4 13:03 피드백 "요청 원문을 늘어놓지 말고 화면의 짜임대로": 쪽마다 지금 앱이 어떤지를 절로 나눠 적는다.
 * 10/4 17:03 요청 "승인된 피드백을 소개에 반영하고 지운다": 승인된 피드백의 내용은 여기 기능 설명으로 남고, 원문은 feedback/에서 지운다.
 * 확인은 절 단위다(11/11 안 C′, aboutChecks.ts): 사용자가 확인한 PR 뒤에 그 절을 고친 PR이 있으면 확인 전. 확실하지 않은 것은 절의 ask(묻는 한 문장)에 적는다.
 * 글은 절마다 파일 하나에 있다: about/<쪽>.tsx(쪽 머리와 절 순서), about/<쪽>/<절>.tsx(절 하나, 한국어 ko와 영어 en이 같은 모양으로 한 파일에).
 * 11/27부터 절을 about/<쪽>/<절>.md로 옮긴다(요약 · 구현 파일 · MCP 도구 머리말, about/md.tsx가 읽음): 화면 · 서버 · MCP · 검사가 같은 파일을 읽는다.
 * 화면이 바뀌면 그 절 파일도 같이 고친다. 고친 절에는 그 PR 번호가 붙는다(절 제목 옆과 설정 › 업데이트 이력이 서로 가리킨다):
 * PR마다 조각 파일 about/prs/<번호>.json(고친 절 "<쪽>/<절>" 목록)을 두고 여기서 절의 prs(ko 쪽)에 합친다. 여러 PR이 같은 prs 줄을 고쳐
 * 부딪히지 않게 (11/20). 앱 고치기 대화는 app_submit이 조각을 적고, 앱 밖 에이전트는 손으로 적는다. 옛 번호는 절 파일의 prs에 그대로 있다.
 * 화면을 바꾸고도 소개를 고치지 않은 PR은 scripts/ci/check-about.mjs가 막지 않고, 그 화면 파일과 함께 고쳐 온 소개 절을 짚어 알린다(11/27).
 * 이유를 남기려면 커밋 메시지에 "소개: 그대로 — 이유" 한 줄을 쓴다(이력에 보인다).
 */
const PARTS = [intro, layout, home, project, notes, knowledge, reading, network, settings, principles, agents, feedback, building, research, rules, design, symbols, reference, next]

/** 절 파일 about/<쪽>/<절>.tsx의 ko → "<쪽>/<절>" */
const SECTION_FILES = import.meta.glob<{ ko?: AboutSection }>('./about/*/*.tsx', { eager: true })
/** PR 번호 → 그 PR이 고친 절 "<쪽>/<절>" (about/prs/<번호>.json) */
const PR_FILES = import.meta.glob<string[]>('./about/prs/*.json', { eager: true, import: 'default' })

/** 조각 파일들을 절의 prs에 합친다 (번호 차례, 겹치면 하나) */
export function withPrFragments(parts: AboutPart[], files: Record<string, { ko?: AboutSection }>, prs: Record<string, string[]>): AboutPart[] {
  const keyOf = new Map<AboutSection, string>()
  for (const p of parts) for (const sec of p.sections ?? []) if (sec.file) keyOf.set(sec, sec.file)
  for (const [f, m] of Object.entries(files)) {
    const k = f.match(/([^/]+\/[^/]+)\.tsx$/)?.[1]
    if (m.ko && k) keyOf.set(m.ko, k)
  }
  const add = new Map<string, number[]>()
  for (const [f, keys] of Object.entries(prs)) {
    const n = Number(f.match(/(\d+)\.json$/)?.[1])
    if (n) for (const k of keys) add.set(k, [...(add.get(k) ?? []), n])
  }
  if (!add.size) return parts
  return parts.map((p) => ({ ...p, sections: p.sections?.map((sec) => {
    // 옛 절 키(was)를 가리키는 조각도 이 절의 것 (절을 합치거나 쪼개도 이력이 이어지게, 11/27)
    const more = [keyOf.get(sec) ?? '', ...(sec.was ?? [])].flatMap((k) => add.get(k) ?? [])
    if (!more.length) return sec
    return { ...sec, prs: [...new Set([...(sec.prs ?? []), ...more])].sort((a, b) => a - b) }
  }) }))
}

export const ABOUT_PARTS_KO: AboutPart[] = withPrFragments(PARTS.map((p) => p.ko), SECTION_FILES, PR_FILES)
export const ABOUT_PARTS_EN: AboutPart[] = PARTS.map((p) => p.en)

/** English parts carry the Korean titles as `ui` so data-ui values stay Korean */
const withUi = (en: AboutPart[]): AboutPart[] => en.map((p, i) => {
  const ko = ABOUT_PARTS_KO[i]
  return { ...p, ui: ko?.title, sections: p.sections?.map((sec, j) => ({ ...sec, ui: ko?.sections?.[j]?.title, prs: ko?.sections?.[j]?.prs })) }
})

export const ABOUT_PARTS: AboutPart[] = lang === 'ko' ? ABOUT_PARTS_KO : withUi(ABOUT_PARTS_EN)
export const COLOR_ROWS: ColorRow[] = lang === 'ko' ? COLOR_ROWS_KO : COLOR_ROWS_EN
export const SYMBOL_GROUPS: typeof SYMBOL_GROUPS_KO = lang === 'ko' ? SYMBOL_GROUPS_KO : SYMBOL_GROUPS_EN

export const partOf = (id: string | undefined) => ABOUT_PARTS.find((p) => p.id === id) ?? ABOUT_PARTS[0]!

/** 절의 주소 이름 (#/about/<쪽>/<이것>): id가 없으면 쪽 안의 순서(1부터) */
export const sectionAnchor = (sec: AboutSection, i: number) => sec.id ?? String(i + 1)

export interface AboutRef { part: string; anchor?: string; label: string }

/** 업데이트(PR) 하나가 고친 소개 자리들 (설정 › 업데이트 이력의 "소개" 칸) */
export function aboutChangesOf(pr: number): AboutRef[] {
  return ABOUT_PARTS.flatMap((p) => (p.sections ?? []).flatMap((sec, i) =>
    sec.prs?.includes(pr) ? [{ part: p.id, anchor: sectionAnchor(sec, i), label: `${p.title} › ${sec.title}` }] : []))
}
