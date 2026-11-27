import type { AboutPart } from './types'

// 소개 › 화면 구조 (#/about/layout). 그림은 AboutParts.tsx의 Layout. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다.

export const ko: AboutPart = { id: 'layout', title: '화면 구조', sub: '한 창이 다섯 영역으로 나뉩니다. 영역을 누르면 그 설명으로 갑니다.' }

export const en: AboutPart = { id: 'layout', title: 'Screen layout', sub: 'One window is divided into five areas. Click an area to go to its description.' }
