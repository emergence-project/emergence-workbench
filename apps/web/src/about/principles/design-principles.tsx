import type { AboutSection } from '../types'

// 소개 › principles › 디자인 원칙. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '디자인 원칙',
  items: [
    { text: <><b>무채색이 기본, 색은 상태에만.</b> 상태는 색 점과 짧은 이름으로 보입니다: 파랑 진행 · 주황 멈춤 · 회색 고리 폐기 · 청록 해결. 사용자 차례는 주황, 에이전트 차례는 회색입니다. 강조 색은 주 버튼과 선택 표시에만 씁니다.</> },
    { text: <><b>행동 하나에 이름 하나, 기호 하나.</b> 더하기 ＋, 고치기 연필, 지우기 휴지통, 빼기·닫기 ×, 컴파일 ▶, 내보내기 (상자에서 나가는 화살표), 코멘트 말풍선, 승인 · 수정은 동그라미 안 체크 · 되돌림 화살표. <a className="a" href="#/about/design">화면 기준 ›</a></> },
    { text: <><b>같은 일은 한 곳에서.</b> 할 일은 기록 화면, 저자 정보는 사람 페이지에서 고칩니다. 프로젝트 첫 화면과 정보 화면의 연필은 같은 고치기 창을 엽니다.</> },
    { text: <><b>버튼은 다루는 대상 옆에.</b> 항목의 고치기·지우기는 항목 오른쪽 위, 여닫는 버튼은 여닫는 칸 쪽에 둡니다.</> },
    { text: <><b>군더더기 없이 한눈에.</b> 같은 이름을 한 화면에서 두 번 크게 쓰지 않고, 카드에는 제목과 한 줄 설명만 둡니다.</> },
    { text: <><b>쉬운 말.</b> 새로 지은 용어를 쓰지 않고, 버튼은 하는 일을 동사로 적습니다.</> },
    { text: <><b>"어디 있나"보다 "무엇을 묻나".</b> 화면은 파일 위치가 아니라 사용자가 묻는 질문으로 나눕니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Design principles',
  items: [
    { text: <><b>Neutral by default, color only for status.</b> Status shows as a colored dot and a short name: blue In progress · orange Blocked · gray ring Dropped · teal Solved. Your turn is orange, the agent's turn is gray. The accent color is used only for the primary button and for selection.</> },
    { text: <><b>One name and one symbol per action.</b> Add ＋, Edit pencil, Delete trash can, Remove/Close ×, Compile ▶, Export (arrow leaving a box), Comment speech bubble, and Approve / Revise as a check in a circle / a return arrow. <a className="a" href="#/about/design">Screen standards ›</a></> },
    { text: <><b>One place for each job.</b> To-dos are edited in the Records screen, author details on the person's page. The pencil on the project home screen and on the project info screen opens the same edit dialog.</> },
    { text: <><b>Buttons sit next to what they act on.</b> An item's Edit and Delete sit at its top right, and a button that opens or closes a side area sits on that area's side.</> },
    { text: <><b>Clean and clear at a glance.</b> The same name is not shown large twice on one screen, and cards carry only a title and a one-line description.</> },
    { text: <><b>Plain words.</b> No newly coined terms; buttons say what they do with a verb.</> },
    { text: <><b>"What am I asking" over "where is it".</b> Screens are divided by the question you are asking, not by where files live.</> },
  ],
}
