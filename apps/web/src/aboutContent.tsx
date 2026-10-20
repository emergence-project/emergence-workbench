import * as agents from './about/agents'
import * as design from './about/design'
import * as feedback from './about/feedback'
import * as home from './about/home'
import * as intro from './about/intro'
import * as knowledge from './about/knowledge'
import * as network from './about/network'
import * as next from './about/next'
import * as notes from './about/notes'
import * as principles from './about/principles'
import * as project from './about/project'
import * as reading from './about/reading'
import * as reference from './about/reference'
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
 * 확실하지 않은 문장은 unsure + ask(사용자에게 묻는 한 문장). 쪽 맨 위 알림과 레일 소개 버튼의 수에 뜬다.
 * 글은 절마다 파일 하나에 있다: about/<쪽>.tsx(쪽 머리와 절 순서), about/<쪽>/<절>.tsx(절 하나, 한국어 ko와 영어 en이 같은 모양으로 한 파일에).
 * 화면이 바뀌면 그 절 파일도 같이 고친다. 고친 절의 prs(ko 쪽)에 그 PR 번호를 더한다(절 제목 옆과 설정 › 업데이트 이력이 서로 가리킨다).
 * 화면을 바꾸고도 소개를 고치지 않는 PR은 커밋 메시지에 "소개: 그대로 — 이유" 한 줄을 쓴다 (scripts/ci/check-about.mjs, 10/15 사용자 결정).
 */
const PARTS = [intro, principles, home, project, notes, knowledge, reading, network, settings, agents, feedback, design, symbols, reference, next]

export const ABOUT_PARTS_KO: AboutPart[] = PARTS.map((p) => p.ko)
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

/** 쪽에서 확인이 필요한 항목들 */
export const unsureItems = (x: AboutPart) => (x.sections ?? []).flatMap((s) => s.items.filter((i) => i.unsure).map((i) => ({ section: s.title, ui: s.ui ?? s.title, item: i })))

/** 절의 주소 이름 (#/about/<쪽>/<이것>): id가 없으면 쪽 안의 순서(1부터) */
export const sectionAnchor = (sec: AboutSection, i: number) => sec.id ?? String(i + 1)

export interface AboutRef { part: string; anchor?: string; label: string }

/** 업데이트(PR) 하나가 고친 소개 자리들 (설정 › 업데이트 이력의 "소개" 칸) */
export function aboutChangesOf(pr: number): AboutRef[] {
  return ABOUT_PARTS.flatMap((p) => (p.sections ?? []).flatMap((sec, i) =>
    sec.prs?.includes(pr) ? [{ part: p.id, anchor: sectionAnchor(sec, i), label: `${p.title} › ${sec.title}` }] : []))
}
