import type { AboutSection } from '../types'

// 소개 › symbols › 행동. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = { title: '행동', id: 'actions', prs: [103, 142], items: [{ text: <>누르는 기호입니다. 늘 무채색이고, 한 행동에 이름 하나 · 기호 하나입니다.</> }] }

export const en: AboutSection = { title: 'Actions', id: 'actions', items: [{ text: <>Symbols you press. Always neutral; one name and one symbol per action.</> }] }
