import type { AboutSection } from '../types'

// 소개 › notes › 원고 화면. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '원고 화면',
  items: [
    { text: <>왼쪽 사이드바 "원고"를 누르면 원고 화면이 열리고 원고 목록이 펼쳐집니다. 원고마다 카드 하나(장 수 · 부록 수)이고, 장 목록은 원고를 열면 목차에 있습니다.</> },
    { text: <>원고 화면에서 원고를 정하거나 "＋ 원고 더하기"로 하나 더 넣고, 목록에서 빼고(파일은 그대로), "복사해 노트 만들기"를 합니다. 여러 노트를 골라 한 번에 내보내기, 지도 보기, "＋ 노트 만들기", 진술 목록도 여기 있습니다.</> },
    { text: <>노트의 상태는 넷입니다: 진행 · 멈춤(기다리는 중, 곧 다시) · 폐기(그만둠) · 해결. 툴바 왼쪽의 색 점 + 이름을 눌러 메뉴에서 고릅니다. 노트를 멈춤·폐기로 바꿀 때는 다시 열 조건을 적습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Manuscript screen',
  items: [
    { text: <>Clicking "Manuscripts" in the left sidebar opens the manuscript screen and expands the list of manuscripts. Each manuscript is one card (chapter count, appendix count); the chapter list is in the outline once you open the manuscript.</> },
    { text: <>On the manuscript screen you set the manuscript or add another with "＋ Add manuscript", remove one from the list (the file stays), and use "Copy into a note". Exporting several selected notes at once, View map, "＋ New note" and the statement list are here too.</> },
    { text: <>A note has four statuses: In progress · Blocked (waiting on something, back soon) · Dropped (given up) · Solved. Click the colored dot and name at the left of the toolbar and pick from the menu. When you change a note to Blocked or Dropped, you write the condition for reopening it.</> },
  ],
}
