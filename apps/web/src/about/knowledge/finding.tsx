import type { AboutSection } from '../types'

// 소개 › knowledge › 찾기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '찾기',
  items: [
    { text: <>사이드바는 위에서부터 "지식 라이브러리"(첫 화면) · "목록" · "지도" 줄, 분류 나무, 옛 형식 LaTeX 개념노트, 아직 옮기지 않은 Study 노트입니다. 찾기는 목록 화면의 필터와 상단바 검색이 맡습니다.</> },
    { text: <>노트가 수만 개가 되어도 빠르도록, 앱은 .md를 읽어 다시 만들 수 있는 색인(SQLite)을 따로 두고 목록을 50개씩 받습니다.</> },
    { text: <>"미완성"은 앱이 붙입니다: 빈 절, TODO·"작성 중" 표시, 제목·틀뿐인 노트. 사람이 누르는 것은 "확인함 ✓" 하나이고, 확인한 뒤 본문이 바뀌면 다시 확인하라고 표시합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Finding',
  items: [
    { text: <>From the top, the sidebar has the "Knowledge library" (home), "List" and "Map" rows, the subject tree, old-format LaTeX concept notes, and Study notes not moved yet. Finding is handled by the filters on the list screen and by the top bar search.</> },
    { text: <>So it stays fast even with tens of thousands of notes, the app keeps a separate index (SQLite) rebuilt from the .md files and loads the list 50 at a time.</> },
    { text: <>"Incomplete" is added by the app: empty sections, TODO or "작성 중" (in progress) marks, notes that are only a title or skeleton. The one thing a person presses is "Reviewed ✓", and if the body changes after review, it is marked for review again.</> },
  ],
}
