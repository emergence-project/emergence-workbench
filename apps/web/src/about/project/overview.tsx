import type { AboutSection } from '../types'

// 소개 › project › 첫 화면 (현황판). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '첫 화면 (현황판)', prs: [53, 102, 104, 110, 117, 165, 171, 173, 197, 271],
  items: [
    { text: <>열린 탭이 없을 때 보이는 기본 화면입니다. 따로 된 탭이 아닙니다.</> },
    { text: <>위쪽 왼쪽은 제목 · 설명 · 성격과 분야, 오른쪽은 <b>작업</b>입니다. 성격과 분야 아래 <b>흐름</b> 한 줄은 흐름 지도 대신 열린 질문(끝나지 않은 질문 점) · 진행(진행 중인 작업 점) · 판단 대기(기록 › 내 차례의 판단 대기열, 있을 때만 주황) 수를 보이고, 누르면 흐름 지도가 열립니다. 흐름 점이 없으면 이 줄도 없습니다. 그 아래 <b>주제</b>와 <b>노트</b> 카드가 한 줄에 4장씩 놓입니다(사이드바를 열어 좁으면 카드가 조금 작아집니다). 좁으면 한 열로, 제목 · 설명 아래 주제 위에 작업이 놓입니다. 원고는 왼쪽 사이드바 "원고"에서 엽니다.</> },
    { text: <>작업 패널은 제목 옆 높이에 맞춰 크기가 정해져, 할 일이 늘어도 카드 줄은 같은 자리에서 시작합니다. 위 한 줄 선택 칸 <b>전체</b> · 검토(검토 대기) · 고침(에이전트 고침) · 멈춤 · 할 일에서 하나를 고르면 그 목록만 보입니다. 이름은 줄 오른쪽 태그와 같고, 수는 사용자 차례인 검토 · 고침에만 주황 알약으로 붙습니다(다른 수는 가리키면 나옵니다). 처음엔 전체: 사용자 차례부터 묶음 순서로 섞고 줄 오른쪽에 묶음 태그를 붙입니다. 줄 앞 칸은 멈춘 노트의 상태 점이나 할 일의 완료 칸이 있을 때만 생깁니다. 자리가 모자라 못 보인 줄은 마지막 줄 바로 아래, 태그 열에 "+3"처럼 세고, 누르면 그 묶음의 화면(전체면 기록)이 열립니다. 제목 줄 오른쪽 "모두 보기 ›"는 기록을 엽니다.</> },
    { text: <>툴바 오른쪽 연필은 <b>프로젝트 고치기</b> 창을 엽니다. 왼쪽에서 이름(80자) · 설명(300자) · 성격(연구 · 업무) · 분야 · 진행 상태 · 시작일을 고치고, 오른쪽 카드 미리보기 바로 아래에서 카드 그림과 색을 고릅니다(저장 ⌘↵, 취소 Esc). 색은 레일 버튼과 홈 카드에 쓰이고, "자동"이면 다른 프로젝트와 겹치지 않는 색을 저절로 고릅니다. 고른 색은 이 컴퓨터의 설정에 저장됩니다. 업무 프로젝트의 노트만 노트 성격 "설계"를 고를 수 있습니다.</> },
    { text: <><b>주제</b>: 주제 카드(미리보기 · 설명 · 노트들의 성격 · 상태별 노트 수 · 최근 시각)가 한 줄로 놓이고, 정렬은 최근 작업 · 상태 · 이름입니다. 카드를 누르면 주제 화면이 열리고, ☆로 즐겨찾기합니다. 줄 맨 앞 점선 카드 "＋ 주제 만들기"는 이름만 받아 만들고 주제 고치기 창을 엽니다. 주제가 없는 노트가 있으면 제목 옆 "노트들 n"으로 그 묶음을 엽니다.</> },
    { text: <><b>노트</b>: 최근 손댄 노트를 노트 카드로 보입니다. 제목 옆에서 기간(오늘 · 이번 주(월요일부터) · 전체, 각 개수)을, 오른쪽에서 정렬(최신순 · 이름)을 고릅니다. 처음에는 한 줄만 보이고 "노트 n개 더 보기 ▾"로 펼칩니다. 줄 맨 앞 점선 카드 "＋ 노트 만들기"로 만든 노트는 주제 없이 "노트들"에 들어갑니다. 지운 노트(15일 보관)는 맨 아래 "지운 노트" 줄을 펼쳐 되살립니다.</> },
    { text: <>할 일 줄 앞의 완료 칸을 누르면 그 할 일이 바로 완료가 됩니다(확인은 묻지 않고, 기록 탭의 완료에서 다시 열 수 있습니다. 못 하면 화면 아래 알림으로 까닭을 알립니다). 줄의 나머지를 누르면 기록 탭의 할 일에서 그 항목이 보입니다. 멈춘 노트 줄에는 다시 열기가 있습니다. 할 일을 적는 일은 기록 탭에서 합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Home screen (overview)',
  items: [
    { text: <>The default screen shown when no tab is open. It is not a separate tab.</> },
    { text: <>At the top, the left has the title, description, kind and fields, and the right has <b>Work</b>. Under kind and fields, the one-line <b>Flow</b> strip stands in for the flow map: it counts open questions (question dots not yet done), in progress (work dots in progress) and to judge (the judging queue in Records › Your turn, in orange, only when there is any); clicking it opens the flow map. With no flow dots the strip is not shown. Below them, <b>Topics</b> and <b>Notes</b> cards sit four to a row (they shrink a little when sidebars are open). On a narrow screen everything goes into one column, with Work below the title and description and above Topics. Manuscripts open from "Manuscripts" in the left sidebar.</> },
    { text: <>The work panel takes the height of the header beside it, so the card row starts at the same place however many to-dos there are. Pick one of <b>All</b> · Review · Edits · Blocked · To-do in the one-line control at the top to see only that list. The names match the row tags, and only your-turn choices (Review, Edits) carry a count, as an orange pill (other counts show on hover). It starts on All: your turn first, in group order, with the group as a tag at the right of each row. The column before the rows appears only when a blocked note's status dot or a to-do's done box is shown. Rows that do not fit are counted right under the last row, in the tag column, as in "+3", which opens that group's screen (Records for All). "See all ›" at the top right opens Records.</> },
    { text: <>The pencil at the right of the toolbar opens the <b>Edit project</b> dialog. On the left you edit the name (80 characters), description (300 characters), kind (Research · Work), fields, progress status and start date; right under the card preview on the right you pick the card image and color (Save ⌘↵, Cancel Esc). The color is used for the rail button and the Home card; "Auto" picks a color no other project uses. The chosen color is saved in this computer's settings. Only notes in Work projects can choose the note kind "Design".</> },
    { text: <><b>Topics</b>: topic cards (preview, description, kinds of its notes, note count by status, last activity) sit in one row, sorted by recent work, status or name. Click a card to open the topic screen, and star it with ☆. The dashed card "＋ New topic" at the start of the row takes just a name, creates the topic and opens the Edit topic dialog. If there are notes without a topic, "Loose notes n" next to the heading opens that group.</> },
    { text: <><b>Notes</b>: recently touched notes are shown as note cards. Next to the heading you choose a period (Today · This week (from Monday) · All, each with a count), and on the right a sort (Newest · Name). At first only one row shows; "Show n more notes ▾" expands it. A note made with the dashed card "＋ New note" at the start of the row goes into "Loose notes" without a topic. Deleted notes (kept for 15 days) can be restored by expanding the "Deleted notes" row at the bottom.</> },
    { text: <>Clicking the done box at the start of a to-do row marks it done right away (no confirmation; reopen it under Done in the Records tab. If it fails, a notice at the bottom of the screen says why). Clicking the rest of the row shows that item in the Records tab's to-dos. Blocked note rows have a Reopen. Writing to-dos is done in the Records tab.</> },
  ],
}
