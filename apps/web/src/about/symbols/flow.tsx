import type { AboutSection } from '../types'

// 소개 › symbols › 흐름. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = { title: '흐름', id: 'flow', prs: [103, 216, 257, 258, 266], items: [{ text: <>흐름 화면의 점과 선입니다. 점의 모양은 역할(◇ 일을 여는 질문 · ○ 작업 · □ 일을 맺는 명제와 정리, 10/26), 안의 기호는 종류, 색은 상태입니다. 명제는 판단 전이면 주황, 사람이 승인하면 청록, 기각하면 회색 고리이고, 시작을 기다리는 카드도 주황입니다. 접은 흐름에서는 묶음(질문과 그 작업 · 명제) 하나가 점 하나이고, 점선 고리는 질문 없이 시작한 묶음입니다. 빈틈과 흐름 종료는 점에 표시하지 않고 툴바 "빈틈"과 점의 자세히에서 봅니다. <a className="a" href="#/about/project/flow">흐름 화면 설명 ›</a></> }] }

export const en: AboutSection = { title: 'Flow', id: 'flow', items: [{ text: <>Dots and lines on the flow screen. A dot's shape is its role (◇ a question that opens work · ○ work · □ a proposition or theorem that closes it, 10/26), the mark inside is its kind and its color is its state. A proposition is orange until judged, teal once a person approves it and a gray ring once rejected; a card waiting for a start is orange too. In the folded flow one dot is a bundle (a question with its work and propositions), and a dashed ring marks a bundle started without a question. Gaps and flow ends are not marked on the dot; see the toolbar's "Gaps" and the dot's details. <a className="a" href="#/about/project/flow">Flow screen ›</a></> }] }
