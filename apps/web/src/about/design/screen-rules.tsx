import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › design › 화면 규칙. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '화면 규칙',
  items: [
    { text: <>툴바는 왼쪽 대상 · 가운데 보기 · 오른쪽 행동입니다. 노트 저장 상태는 오른쪽 행동 바로 왼쪽에 둡니다. 프로젝트 작업 패널은 설명이 길어져도 맨 위에서 시작합니다.</> },
    { text: <>Markdown 노트는 읽기가 기본이고 연필로 고칩니다. LaTeX 원문 편집기는 늘 열려 있습니다. 여러 값을 고치는 프로젝트·주제는 같은 모양의 창을 씁니다. 자세한 배치와 좁은 폭의 규칙은 {c('docs/design-system.md')} 6절에 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Screen rules',
  items: [
    { text: <>A toolbar is target on the left · view in the middle · actions on the right. A note's save status sits just left of the actions on the right. The project work panel starts at the top even when the description gets long.</> },
    { text: <>Markdown notes read by default and are edited with the pencil. The LaTeX source editor is always open. Projects and topics, which edit several values, use dialogs of the same shape. Detailed layout and narrow-width rules are in section 6 of {c('docs/design-system.md')}.</> },
  ],
}
