import type { AboutSection } from '../types'

// 소개 › symbols › 화면 아이콘. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = { title: '화면 아이콘', id: 'screens', prs: [103, 107, 142], items: [{ text: <>레일 · 왼쪽 사이드바 · 상단바에서 화면으로 가는 아이콘입니다. 가리키면 이름이 뜹니다.</> }] }

export const en: AboutSection = { title: 'Screen icons', id: 'screens', items: [{ text: <>Icons on the rail, the left sidebar and the top bar that take you to a screen. Hover to see the name.</> }] }
