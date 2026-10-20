import type { AboutSection } from '../types'

// 소개 › notes › 지도. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '지도',
  items: [
    { text: <>원고 화면의 "지도 보기"로 엽니다. 고른 노트를 가운데 두고 왼쪽에 기대는 것, 오른쪽에 쓰이는 곳을 보여 주는 초점 보기와, 순서대로 어디까지 했는지 보는 목록입니다. 자유 배치 그래프는 증명 구조를 읽는 데 덜 도움이 되어 쓰지 않습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Map',
  items: [
    { text: <>Open it with "View map" on the manuscript screen. There is a focus view, with the chosen note in the middle, what it relies on to the left and where it is used to the right, and a list that shows in order how far things have got. A free-layout graph helps less in reading proof structure, so it is not used.</> },
  ],
}
