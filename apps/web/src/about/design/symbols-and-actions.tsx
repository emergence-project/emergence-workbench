import type { AboutSection } from '../types'

// 소개 › design › 기호와 행동. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '기호와 행동', prs: [103, 227],
  items: [
    { text: <>행동 하나에 이름 하나와 기호 하나: 더하기 ＋, 고치기 연필, 지우기 휴지통, 빼기·닫기 ×, 컴파일 ▶, 내보내기 (상자에서 나가는 화살표), 코멘트 말풍선, 순서 ↑↓. 버튼 말이 "삭제·추가·편집"처럼 어긋나면 테스트가 실패합니다.</> },
    { text: <>지우기(사라짐)는 휴지통, 빼기(여기서만 빠짐)는 ×로 나눕니다. 지우기 확인은 되돌릴 수 없을 때만 묻는 것이 규칙입니다. 무엇이 사라지고 무엇이 남는지 적습니다.</> },
    { text: <>상태는 색 점(폐기는 속 빈 고리)과 이름으로만 보입니다. 컴파일 결과는 ✓ 성공, ! 오류입니다.</> },
    { text: <>탭·노트 줄·파일 줄의 기호도 사이드바와 같은 선 그림입니다. 아이콘은 뜻이 바로 읽혀야 합니다(설정은 톱니바퀴).</> },
    { text: <>항목의 연필·휴지통은 오른쪽 위에 둡니다. 넓은 본문 목록에서는 가리키거나 키보드로 고를 때 보이고, 오른쪽 사이드바처럼 좁은 칸과 터치 화면에서는 늘 보입니다.</> },
    { text: <>이름·제목을 적을 때는 브라우저 기본 입력창 대신 앱 모양의 작은 창이 뜹니다.</> },
    { text: <>색과 기호의 표는 <a className="a" href="#/about/symbols">기호와 의미</a> 쪽에 모았습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Symbols and actions',
  items: [
    { text: <>One name and one symbol per action: Add ＋, Edit pencil, Delete trash can, Remove/Close ×, Compile ▶, Export (arrow leaving a box), Comment speech bubble, Order ↑↓. If a button label uses a different word for the same action (in Korean, words like 삭제·추가·편집 instead of the chosen ones), a test fails.</> },
    { text: <>Delete (it is gone) uses the trash can, and Remove (only taken out here) uses ×. The rule is to ask for delete confirmation only when it cannot be undone, saying what disappears and what stays.</> },
    { text: <>Status shows only as a colored dot (Dropped is a hollow ring) and its name. Compile results are ✓ success and ! error.</> },
    { text: <>Symbols on tabs, note rows and file rows are the same line drawings as the sidebar. Icons must read at once (Settings is a gear).</> },
    { text: <>An item's pencil and trash can sit at its top right. In wide body lists they show on hover or keyboard selection; in narrow areas like the right sidebar and on touch screens they always show.</> },
    { text: <>When you type a name or title, a small app-styled dialog appears instead of the browser's default prompt.</> },
    { text: <>The tables of colors and symbols are on the <a className="a" href="#/about/symbols">Symbols and meanings</a> page.</> },
  ],
}
