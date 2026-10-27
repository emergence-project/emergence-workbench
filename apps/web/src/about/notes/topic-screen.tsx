import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › notes › 주제 화면. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '주제 화면', prs: [53, 73, 75, 280, 285],
  items: [
    { text: <>왼쪽 사이드바에서 주제 이름을 누르면 <b>주제 화면</b>이 열립니다. 머리에 주제 이름, 연필(주제 고치기), ★(즐겨찾기, 바로 켜고 끔), 설명이 있습니다. 그 아래 이 주제에 든 노트가 <b>노트 카드</b>로 보입니다. 여러 주제에 든 노트는 든 모든 주제 화면에 카드로 보입니다.</> },
    { text: <>노트 카드에는 제목 위 작은 글씨로 성격(증명 · 계산 · 이론 · 검증 · 요약 · 탐색 · 미분류. 계산은 수치로 돌리는 노트, 이론은 식을 유도하고 확인하는 노트), 제목, 설명 앞 두 줄, 이 노트가 든 주제 태그 한 줄(넘치면 …와 +n), 상태와 최근 시각이 있습니다. 멈춘 노트는 상태에 마우스를 올리면 다시 열 조건이 보입니다. 카드를 누르면 노트가 열리고, ☆로 즐겨찾기하면 어느 정렬에서도 앞에 옵니다.</> },
    { text: <>정렬은 최근 작업 · 상태 · 이름입니다. 해결 · 폐기 노트는 아래 접는 칸에 모이고, 정렬이 "상태"면 함께 놓입니다. 카드 줄 맨 앞의 점선 카드는 둘로 나뉩니다. 위 "＋ 노트 만들기"로 이 주제의 새 노트를 만들고, 아래 "노트 지정하기"로 다른 주제나 "노트들"의 노트를 골라 이 주제에도 지정합니다(원래 주제와 주 주제는 그대로). 예전에 원고의 장을 묶어 둔 주제는 아래 "원고의 장 n개"로 장 목록을 엽니다. 왼쪽 사이드바도 주제 아래에 같은 노트를 보입니다. 주 주제가 다른 노트는 그 주 주제 아래가 원래 자리이고, 이 주제 아래에는 흐린 글씨로 한 번 더 보입니다(가리키면 주 주제 이름).</> },
    { text: <><b>주제 고치기</b> 창(연필)에서 이름(80자) · 설명(300자, "- " 목록) · 카드 미리보기 글(30자, {c('$…$')} 안은 수식) · 그림 · 바탕색(기본 = 프로젝트 색, 또는 정해 둔 다섯 색)을 고칩니다. 그림과 바탕색은 오른쪽 주제 카드 바로 아래에 있어 고르는 대로 카드가 바뀝니다. 노트 성격은 노트들의 성격을 모아 "자동"으로 보일 뿐이고, 노트의 오른쪽 사이드바에서 고릅니다. 취소는 Esc, 저장은 ⌘↵입니다. 다른 곳에서 {c('research.yaml')}이 바뀌었으면 저장하지 않고 알립니다.</> },
    { text: <>"노트들"(주제가 없는 노트)도 같은 모양의 화면입니다. 노트의 오른쪽 사이드바에서 주제를 고르면 그 주제로 갑니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Topic screen',
  items: [
    { text: <>Clicking a topic name in the left sidebar opens the <b>topic screen</b>. Its header has the topic name, a pencil (Edit topic), ★ (favorite, toggles right away) and the description. Below, the notes in this topic show as <b>note cards</b>. A note in several topics shows as a card on every one of those topic screens.</> },
    { text: <>A note card has, in small text above the title, its kind (Proof · Calculation · Theory · Verification · Summary · Exploration · No kind; a calculation runs numbers, a theory note derives and checks formulas), then the title, the first two lines of the description, one line of topic tags it belongs to (with … and +n when it overflows), and its status and last activity. For a blocked note, hover over the status to see the reopen condition. Click a card to open the note; star it with ☆ to put it first in any sort.</> },
    { text: <>Sort by recent work, status or name. Solved and Dropped notes gather in a collapsed area below; when sorting by status they sit together with the rest. The dashed card at the start of the card row has two parts: "＋ New note" makes a new note in this topic, and "Assign notes" picks notes from other topics or "Loose notes" and assigns them to this topic too (their current topics and main topic stay). Topics that once grouped manuscript chapters open the chapter list with "n manuscript chapters" below. The left sidebar shows the same notes under the topic. A note whose main topic is another one sits under that main topic, and shows here once more in faded text (hover for its main topic).</> },
    { text: <>In the <b>Edit topic</b> dialog (pencil) you edit the name (80 characters), description (300 characters, "- " lists), card preview text (30 characters, math inside {c('$…$')}), image and background color (default = the project color, or one of five preset colors). The image and background sit right under the topic card on the right, so the card changes as you pick. Note kind is only shown as "Auto", gathered from its notes' kinds; you choose it in a note's right sidebar. Cancel is Esc, Save is ⌘↵. If {c('research.yaml')} changed elsewhere, it does not save and tells you.</> },
    { text: <>"Loose notes" (notes without a topic) is the same kind of screen. Choosing a topic in a note's right sidebar moves it to that topic.</> },
  ],
}
