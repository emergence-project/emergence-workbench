import type { AboutSection } from '../types'

// 소개 › symbols › 흐름. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = { title: '흐름', id: 'flow', prs: [103, 216], items: [{ text: <>흐름 화면의 점과 선입니다. 점의 기호는 종류, 색은 상태입니다. 동그라미는 진술, 둥근 네모는 행위입니다. 점 오른쪽 세로 막대는 흐름 종료(이 갈래는 여기서 끝남)입니다. <a className="a" href="#/about/project/flow">흐름 화면 설명 ›</a></> }] }

export const en: AboutSection = { title: 'Flow', id: 'flow', items: [{ text: <>Dots and lines on the flow screen. A dot's mark is its kind and its color is its state. Circles are statements, rounded squares are actions. A vertical bar right of a dot means the flow ends there (this branch ends). <a className="a" href="#/about/project/flow">Flow screen ›</a></> }] }
