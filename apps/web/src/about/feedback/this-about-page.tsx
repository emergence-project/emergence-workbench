import type { AboutSection } from '../types'

// 소개 › feedback › 이 소개. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '이 소개', prs: [116, 120, 346, 433],
  items: [
    { text: <>Claude가 이해하고 만든 것을 화면의 짜임대로 적은 곳입니다. 왼쪽 사이드바에서 쪽과 그 아래 절을 고르면 그 절 하나만 열리고(스크롤 대신 따로 열기), 맨 아래 "‹ 이전" · "다음 ›" 두 칸으로 앞뒤 절로 넘깁니다. 쪽 이름을 누르면 첫 절입니다. 절 제목 오른쪽 연필로 글을 직접 고쳐 보내면 다음 피드백 처리 때 반영합니다.</> },
    { text: <>확인은 절 하나씩 합니다(11/11). 내가 확인한 뒤 그 절을 고친 업데이트가 있으면 절 제목 오른쪽에 주황 「확인 전」이 자동으로 붙고(에이전트가 달거나 떼지 않음), 쪽 맨 위 「이 쪽의 확인 항목」에 "#n이 이 절을 고쳤습니다"와 에이전트의 물음이 절마다 한 줄 모입니다. 「맞아요」를 누르면 그때의 업데이트 번호와 날짜로 확인함이 되고, 「답하기」는 피드백으로 남습니다. 왼쪽 목록의 "확인 N"과 레일 소개 버튼의 수는 확인 전인 절 수입니다.</> },
    { text: <>연필로 고쳐 보낸 절에는 회색 「반영 대기」가 붙습니다. 그 글을 반영한 업데이트가 들어오면 사라지고, 그 절은 다시 확인할 차례(확인 전)가 됩니다. 확인 기록은 피드백처럼 개인 저장소(<code>feedback/about.yaml</code>)에 두고 올립니다.</> },
    { text: <>툴바 오른쪽 시계로 이력 보기를 켜고 끕니다(기본 끔, 고른 상태는 기억). 켜면 절 제목 오른쪽에 「✓ 확인함 날짜 · #n」이, 제목 밑에 그 절을 고친 업데이트와 확인한 때가 시간 순서(왼쪽이 옛것)로 한 줄 붙고, 확인 뒤에 고친 업데이트는 주황으로 보입니다. 소개와 업데이트는 1대1이라(10/15) 그 업데이트 번호와 설정 › 업데이트 이력의 "소개" 칸이 서로 가리킵니다.</> },
    { text: <>끝난 피드백에서 오래 지킬 결정은 이 소개가 정본입니다. 같은 지적이 여러 번 온 것은 하나로 묶어 여기에 한 번만 적고, 피드백 화면에는 아직 끝나지 않은 것만 남깁니다(10/31).</> },
  ],
}

export const en: AboutSection = {
  title: 'This About page',
  items: [
    { text: <>The place where what Claude understood and built is written down, following the layout of the screens. Choosing a part and a section under it in the left sidebar opens that one section on its own (instead of scrolling), and the "‹ Previous" · "Next ›" boxes at the bottom move to the previous or next section. Clicking a part's name opens its first section. If you edit the text directly with the pencil at the right of a section heading and send it, it is applied at the next round of feedback handling.</> },
    { text: <>Review happens one section at a time (11/11). If an update changed a section after you reviewed it, an orange "Not reviewed" appears on its own at the right of the section heading (agents do not add or remove it), and "To review on this page" at the top gathers one line per section: "#n changed this section" and the agent's question. "That is right" marks it reviewed with that update number and date, and "Reply" is saved as feedback. "Review N" in the list on the left and the count on the About button on the rail are the number of sections not reviewed.</> },
    { text: <>A section you edited with the pencil and sent gets a gray "Waiting to apply". It goes away when the update that applies your text arrives, and the section is yours to review again (Not reviewed). Review records are kept in the personal repository like feedback (<code>feedback/about.yaml</code>) and pushed.</> },
    { text: <>The clock at the right of the toolbar turns history on and off (off by default; your choice is remembered). With it on, "✓ Reviewed date · #n" shows at the right of the section heading, and one line under the heading lists the updates that changed the section and when you reviewed it, in time order (oldest on the left); updates after your review show in orange. About and updates match one to one (10/15), so those update numbers and the "About" column in Settings › Update history point to each other.</> },
    { text: <>For finished feedback, this About page is the canonical record of the decisions to keep. The same point raised several times is written here once, and the feedback screen keeps only what is not finished yet (10/31).</> },
  ],
}
