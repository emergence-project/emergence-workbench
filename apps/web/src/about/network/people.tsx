import type { AboutSection } from '../types'

// 소개 › network › 사람들. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '사람들', prs: [242, 470],
  items: [
    { text: <>왼쪽 사이드바 맨 위에 "나"(구글 계정과 같은 저자)가 따로 있고, 누르면 내 연구 프로필 페이지(소속·이메일, 노트 저자 고르기)로 갑니다. 계정에서 구글에 연결하면 구글 계정의 이름 · 이메일 · 사진으로 나를 저자에 더해 여기에 연구자로 들어옵니다(이미 있는 저자면 빈 칸만 채우고, 소속은 내 페이지에서 적습니다). 그 아래 사람 목록이 있고, 즐겨찾기한 사람에는 ★가 붙습니다.</> },
    { text: <>첫 화면은 사람 카드를 기관별·분야별로 묶어 보여 줍니다. 카드에는 이름 머리글자 동그라미, 이름, "기관 · 주 연구 분야"가 보입니다. 성별을 짐작하는 아이콘은 쓰지 않습니다.</> },
    { text: <>더한 사람 목록은 모든 컴퓨터가 함께 씁니다(11/20): 개인 저장소로 맞출 때마다 더 늦게 고친 컴퓨터의 목록을 따르므로, 한 맥에서 더하거나 지운 사람이 다른 맥에도 그대로 보입니다. 이 기능 전에 맥마다 따로 더해 둔 사람은 처음 맞출 때 합쳐집니다.</> },
    { text: <>사람 목록은 즐겨찾기(★)를 먼저, 그다음 가나다 순으로 놓습니다 (10/4 정함). 카드에는 주 분야 태그 하나와 나머지 수("+2", 가리키면 이름)만 보입니다.</> },
    { text: <>노트 참고 문헌에 두 편 넘게 나오는 사람은 점선 테두리의 작은 추천 카드(이름, 편 수 · 최근 연도, 최근 논문 제목)로 여섯 명까지 보입니다. ＋로 더하고 ×로 이 추천에서만 뺍니다. 같은 사람인지는 성과 이름 첫 글자로 봅니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'People',
  items: [
    { text: <>At the top of the left sidebar is "Me" (the author matching your Google account) on its own; click it to go to your research profile page (affiliation, email, choosing note authors). When you connect Google on the Account page, your Google name, email and photo add you as an author, so you appear here as a researcher (if you are already an author, only empty fields are filled; add your affiliation on your page). Below it is the list of people, with ★ on favorites.</> },
    { text: <>The home screen shows people cards grouped by institution and by field. A card shows a circle with initials, the name, and "institution · main field". No icons that guess gender are used.</> },
    { text: <>The people you add are shared by all your computers (11/20): each sync through the personal repository follows the computer that changed the list last, so people added or removed on one Mac show the same on the others. People added separately on each Mac before this are merged at the first sync.</> },
    { text: <>The list of people puts favorites (★) first, then alphabetical order (decided 10/4). A card shows only one main field tag and the count of the rest ("+2"; hover for names).</> },
    { text: <>People who appear in more than two papers in your notes' references show as small suggestion cards with a dashed border (name, paper count and latest year, latest paper title), up to six. Add with ＋, and × removes them from these suggestions only. Whether two entries are the same person is judged by surname and first initial.</> },
  ],
}
