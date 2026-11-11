import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › knowledge › 공부 (책 · 강의). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '공부 (책 · 강의)', prs: [420, 421, 423],
  items: [
    { text: <>지식 왼쪽 사이드바의 「지도」 아래 <b>공부</b> 줄에 책 · 강의가 한 줄씩 있고, 줄 끝에 끝낸 장 수 / 전체 장 수가 보입니다. 「공부」를 누르면 책 · 강의 목록과 「＋ 책 · 강의」가 나옵니다.</> },
    { text: <>책 하나를 열면 장(강의는 회차)마다 상태(아직 · 읽는 중 · 끝), <b>학습 목표</b>, 체크리스트 셋이 보입니다: <b>읽을 것</b>(논문 라이브러리의 문헌과 쪽 · 절, 또는 영상 · 코드 주소) · <b>개념노트</b> · <b>할 일</b>. 상자를 누르면 바로 저장되고, 제목 줄 오른쪽에 한 것 / 전체가 보입니다. 학습 목표는 체크하지 않고, 장을 「끝」으로 둘 때 기준으로 봅니다(11/11 "회차별 계획").</> },
    { text: <>읽을 것의 이름을 누르면 논문 라이브러리에서 그 문헌이, 주소가 있는 것은 새 탭이 열립니다. 개념노트 태그를 누르면 그 노트가 열리고, 확인한 노트에는 체크가 붙습니다. 아직 없는 노트는 점선 태그이고, 누르면 그 이름으로 만듭니다. 정리는 따로 쌓지 않고 처음부터 개념노트로 쌓고, 연구 노트는 공부에서 만든 개념노트도 똑같이 인용합니다(11/4 "지식이 흩어지지 않게", 11/11 "공부의 출처도 등록").</> },
    { text: <>장 · 상태 · 학습 목표 · 읽을 것 · 개념노트 · 할 일은 제목 오른쪽 연필의 고치기 창에서 고칩니다. 장마다 접고 펼치며, 읽는 중인 장은 펼친 채로 열립니다. 학습 목표 · 할 일은 한 줄에 하나씩 적고 Enter로 다음 줄을 엽니다. 책 하나는 라이브러리 {c('study/<id>.yaml')} 한 파일이고, 계획과 진도만 적습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Study (books and lectures)',
  items: [
    { text: <>In the Knowledge left sidebar, under "Map", the <b>Study</b> row lists each book or lecture on its own row, with chapters done / all chapters at the end. Clicking "Study" shows the list of books and lectures and "＋ Book or lecture".</> },
    { text: <>Opening a book shows each chapter (session, for lectures) with its state (not started · reading · done), <b>learning goals</b> and three checklists: <b>reading</b> (references in the paper library with pages or sections, or video and code links) · <b>concept notes</b> · <b>to do</b>. Ticking a box saves at once, and the chapter row shows done / all. Learning goals are not ticked; they are what you check before marking a chapter done (11/11 "plan each session").</> },
    { text: <>Clicking a reading opens that reference in the paper library, or a new tab for a link. Clicking a concept note tag opens that note, and checked notes get a check mark. Notes not written yet show as dashed tags; clicking one creates it under that name. Notes are not kept separately; they go into concept notes from the start, and research notes cite concept notes from study like any other (11/4 "keep knowledge in one place", 11/11 "register study sources").</> },
    { text: <>Edit chapters, states, goals, readings, concept notes and to-dos in the edit dialog from the pencil to the right of the title. Each chapter folds open; chapters being read open unfolded. Goals and to-dos take one line each, and Enter opens the next line. A book is one file, {c('study/<id>.yaml')}, in the library, holding only its plan and progress.</> },
  ],
}
