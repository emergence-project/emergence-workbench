import type { AboutSection } from '../types'

// 소개 › design › 값과 부품. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '값과 부품', prs: [134, 135, 136, 139, 158],
  items: [
    { text: <>원칙 여섯(위계, 일관성, 구조는 드러나지 않게, 기초 토큰 먼저, 한 가족, 조금씩 다듬기)을 Apple·Linear·Atlassian에서 가져왔습니다.</> },
    { text: <>색·글자 크기·굵기·모서리·간격은 정해진 단계(토큰)에서만 고르고, 어기면 테스트가 실패합니다. 무채색이 기본이고 색은 상태에만, 텍스트 버튼·링크도 무채색입니다.</> },
    { text: <>옅은 글자(날짜·종류·빈 상태)는 흰 바탕 · 움푹한 칸 위에서 명암비 4.5:1(WCAG AA)을 넘는 회색이고(고른 줄 위는 라이트 4.7:1 · 다크 4.4:1), 편집기 주석도 같은 회색입니다. 해결의 청록도 흰 글자와 4.5:1을 넘게 진하게 했습니다. 버튼 높이는 입력란과 같고 글자 배율을 따르며, 메뉴·창·툴팁의 겹침 순서도 정해진 단계에서 고릅니다.</> },
    { text: <>여러 화면이 같이 쓰는 부품(작은 버튼 · 작은 아이콘 버튼 · 메뉴 · 툴팁 · 빈 상태 · 카드 · 점선 만들기 카드 · 사용자 차례의 주황 알약과 점)은 한 곳에서 정합니다. 빈 상태는 어느 화면에서나 상자 없는 옅은 한 줄이고, "＋ 만들기 · 추가" 점선 카드는 어디서나 같은 굵기의 점선입니다. 버튼 이름 · 단축키 툴팁도 어디서나 같은 모양으로 아래(레일은 옆)에 뜹니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Values and components',
  items: [
    { text: <>Six principles (hierarchy, consistency, structure that does not draw attention, foundation tokens first, one family, refine bit by bit) taken from Apple, Linear and Atlassian.</> },
    { text: <>Color, text size, weight, corner radius and spacing are chosen only from fixed steps (tokens), and breaking this fails a test. Neutral is the default and color is only for status; text buttons and links are neutral too.</> },
    { text: <>Faint text (dates, kinds, empty states) is a gray with at least 4.5:1 contrast (WCAG AA) on white and on sunken cells (on selected rows 4.7:1 light, 4.4:1 dark), and editor comments use the same gray. The teal for Solved is dark enough for white text at 4.5:1. Buttons are as tall as inputs and follow the text scale, and menus, dialogs and tooltips stack in fixed steps.</> },
    { text: <>Parts that several screens share (small buttons, small icon buttons, menus, tooltips, empty states, cards, dashed create cards, the orange your-turn pill and dot) are defined in one place. An empty state is one faint line without a box on every screen, and the dashed "＋ Create / Add" card has the same dashed border everywhere. Tooltips with a button's name or shortcut look the same everywhere and appear below (beside, on the rail).</> },
  ],
}
