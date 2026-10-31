import type { AboutSection } from '../types'

// 소개 › feedback › 이 소개. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '이 소개', prs: [116, 120, 346],
  items: [
    { text: <>Claude가 이해하고 만든 것을 화면의 짜임대로 적은 곳입니다. 왼쪽 사이드바에서 쪽과 그 아래 절을 고르면 그 절 하나만 열리고(스크롤 대신 따로 열기), 맨 아래 "‹ 이전" · "다음 ›" 두 칸으로 앞뒤 절로 넘깁니다. 쪽 이름을 누르면 첫 절입니다. 절 제목 오른쪽 연필로 글을 직접 고쳐 보내면 다음 피드백 처리 때 반영합니다.</> },
    { text: <>확실하지 않은 문장에는 "확인 필요"가 붙고, 그 쪽 맨 위에 묻는 것이 모여 보입니다. 왼쪽 목록과 레일의 소개 버튼에도 그 수가 뜹니다.</> },
    { text: <>소개와 업데이트는 1대1입니다(10/15). 화면을 바꾼 업데이트는 같은 업데이트에서 그 절을 고치고, 절 제목 옆 "업데이트 #n"과 설정 › 업데이트 이력의 "소개" 칸이 서로 가리킵니다.</> },
    { text: <>끝난 피드백에서 오래 지킬 결정은 이 소개가 정본입니다. 같은 지적이 여러 번 온 것은 하나로 묶어 여기에 한 번만 적고, 피드백 화면에는 아직 끝나지 않은 것만 남깁니다(10/31).</> },
  ],
}

export const en: AboutSection = {
  title: 'This About page',
  items: [
    { text: <>The place where what Claude understood and built is written down, following the layout of the screens. Choosing a part and a section under it in the left sidebar opens that one section on its own (instead of scrolling), and the "‹ Previous" · "Next ›" boxes at the bottom move to the previous or next section. Clicking a part's name opens its first section. If you edit the text directly with the pencil at the right of a section heading and send it, it is applied at the next round of feedback handling.</> },
    { text: <>Sentences that are not certain get "Needs review", and the questions gather at the top of that page. The count also shows in the list on the left and on the About button on the rail.</> },
    { text: <>About and updates match one to one (10/15). An update that changes a screen also edits that section in the same update, and "Update #n" next to a section heading and the "About" column in Settings › Update history point to each other.</> },
    { text: <>For finished feedback, this About page is the canonical record of the decisions to keep. The same point raised several times is written here once, and the feedback screen keeps only what is not finished yet (10/31).</> },
  ],
}
