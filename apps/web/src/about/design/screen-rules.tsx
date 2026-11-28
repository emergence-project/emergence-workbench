import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › design › 화면 규칙. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '화면 규칙',
  items: [
    { text: <><b>고정된 것은 늘 같은 자리.</b> 탭의 닫기 ×, 툴바, 입력란처럼 늘 있는 것은 내용 길이와 상관없이 같은 자리에 둡니다(10/8).</> },
    { text: <><b>버튼은 다루는 대상 옆에.</b> 항목의 수정 · 삭제는 항목 오른쪽 위, 여닫는 버튼은 여닫는 칸 쪽에 둡니다.</> },
    { text: <><b>버튼 하나에 동작 하나.</b> "고쳐서 승인"처럼 두 동작을 잇는 버튼은 두지 않고, 고치기와 승인을 따로 둡니다(10/27).</> },
    { text: <><b>고를 것이 넷 이상이면 고르기 상자.</b> 셋 이하면 버튼 묶음(세그먼트)으로 두어, 툴바에 버튼이 늘어 어지럽지 않게 합니다(10/30). 예외: 기록의 종류(전체 · 메모 · 할 일 · 질문 · 맡긴 일)는 버튼 줄로 둡니다(10/31).</> },
    { text: <>툴바는 왼쪽 대상 · 가운데 보기 · 오른쪽 행동입니다. 노트 저장 상태는 오른쪽 행동 바로 왼쪽에 둡니다. 프로젝트 작업 패널은 설명이 길어져도 맨 위에서 시작합니다.</> },
    { text: <>Markdown 노트는 읽기가 기본이고 연필로 고칩니다. LaTeX 원문 편집기는 늘 열려 있습니다. 여러 값을 고치는 프로젝트·주제는 같은 모양의 창을 씁니다. 자세한 배치와 좁은 폭의 규칙은 {c('docs/design-system.md')} 6절에 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Screen rules',
  items: [
    { text: <><b>Fixed things stay in the same place.</b> Things that are always there, such as a tab's close ×, toolbars and input boxes, keep their place whatever the content length (10/8).</> },
    { text: <><b>Buttons sit next to what they act on.</b> An item's Edit and Delete sit at its top right, and a button that opens or closes a side area sits on that area's side.</> },
    { text: <><b>One action per button.</b> No button chains two actions, like "Edit and approve"; editing and approving are separate (10/27).</> },
    { text: <><b>Four or more choices go in a select box.</b> Three or fewer stay a button group (segmented), so toolbars do not fill up with buttons (10/30). Exception: the record kinds (All · Memo · To-do · Question · Delegated task) stay a row of buttons (10/31).</> },
    { text: <>A toolbar is target on the left · view in the middle · actions on the right. A note's save status sits just left of the actions on the right. The project work panel starts at the top even when the description gets long.</> },
    { text: <>Markdown notes read by default and are edited with the pencil. The LaTeX source editor is always open. Projects and topics, which edit several values, use dialogs of the same shape. Detailed layout and narrow-width rules are in section 6 of {c('docs/design-system.md')}.</> },
  ],
}
