import type { AboutSection } from '../types'

// 소개 › network › 사람 페이지. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '사람 페이지', prs: [172, 188],
  items: [
    { text: <>사람마다 페이지에 공유 라이브러리와 프로젝트 bib에서 그 사람이 저자인 논문을 모읍니다. 참고 문헌에 다르게 적힌 이름(예: A. E. Example)도 적을 수 있습니다.</> },
    { text: <>프로필 카드는 큰 머리글자, 소속(주소속 · 보조 소속), 이메일(여러 개, 한 줄에 하나), 홈페이지, 주 연구 분야, 메모, 다른 이름, arXiv · Google Scholar 찾기 링크입니다. 평소에는 읽기만 하고, 카드 오른쪽 위 연필이 주제 · 프로젝트 고치기와 같은 <b>사람 고치기</b> 창을 엽니다. 왼쪽에 이름 · 소속 · 이메일 · 홈페이지 · 다른 이름 · 메모, 오른쪽에 사람 카드 미리보기(노트 저자면 그 아래 교신 저자)가 있습니다. 소속은 한 줄에 한 칸(첫 칸이 주소속)이고, 적는 대로 다른 사람 · 원고 저자에게 적은 소속을 아래에 제안합니다(↑↓로 고르고 Enter). 첫 화면에서 모든 저자를 한 양식으로 고치지 않습니다.</> },
    { text: <>사람 페이지 아래 "함께 쓴 사람"에 네트워킹에 있는 공저자가 같은 사람 카드로, 함께 쓴 논문 수와 함께 보입니다.</> },
    { text: <><b>사진</b>: 큰 동그라미를 누르면 사진 파일을 고릅니다(작게 줄여 앱 설정 폴더에 둠). 빼려면 연필 › "사진 빼기".</> },
    { text: <><b>새 논문</b>: 최근 90일 논문을 하루에 한 번 찾습니다. 연필 › "Semantic Scholar 저자"로 저자를 골라 두면 그 저자 ID로(동명이인이 섞이지 않음), 아니면 arXiv에서 이름 · 다른 이름으로 찾습니다. 처음 보는 논문엔 파란 점이 붙고, 사이드바의 그 사람 줄에 새 논문 수가 보입니다. "논문 라이브러리에 더하기"로 바로 더하고, 같은 이름의 다른 사람 논문은 "이 사람 아님"으로 숨깁니다.</> },
    { text: <><b>나오는 곳</b>: 프로젝트마다 그 프로젝트 참고 문헌에 있는 이 사람 논문 수와 이름이 들어간 기록을 보입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Person page',
  items: [
    { text: <>Each person's page gathers papers they authored from the shared library and project bibs. You can also add other forms of their name used in references (for example A. E. Example).</> },
    { text: <>The profile card has large initials, affiliations (main and secondary), emails (several, one per line), homepage, main field, memo, other names, and arXiv and Google Scholar search links. It is normally read only; the pencil at the card's top right opens the <b>Edit person</b> dialog, the same dialog as editing a topic or project. Name, affiliations, emails, homepage, other names and memo are on the left; a person card preview is on the right (with Corresponding author below it for note authors). Affiliations take one box per line (the first is the main one), and as you type, affiliations already given to other people and manuscript authors are suggested below (pick with ↑↓ and Enter). All authors are not edited in one form on the home screen.</> },
    { text: <>Under "Co-authors" at the bottom of a person page, co-authors who are in Networking show as the same person cards, with the number of papers written together.</> },
    { text: <><b>Photo</b>: click the large circle to pick an image file (shrunk and kept in the app settings folder). To remove it, use the pencil › "Remove photo".</> },
    { text: <><b>New papers</b>: papers from the last 90 days are looked up once a day. If you pick an author under the pencil › "Semantic Scholar author", that author ID is used (no namesakes mixed in); otherwise arXiv is searched by the name and other names. Papers you have not seen get a blue dot, and the person's row in the sidebar shows the count. "Add to paper library" adds one right away, and "Not this person" hides a namesake's paper.</> },
    { text: <><b>Appears in</b>: for each project, the number of this person's papers in that project's references and the records that mention their name.</> },
  ],
}
