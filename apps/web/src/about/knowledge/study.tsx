import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › knowledge › 공부 (책 · 강의). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '공부 (책 · 강의)', prs: [420, 421],
  items: [
    { text: <>지식 왼쪽 사이드바의 「지도」 아래 <b>공부</b> 줄에 책 · 강의가 한 줄씩 있고, 줄 끝에 끝낸 장 수 / 전체 장 수가 보입니다. 「공부」를 누르면 책 · 강의 목록과 「＋ 책 · 강의」가 나옵니다.</> },
    { text: <>책 하나를 열면 장마다 그 장에서 정리한 <b>개념노트</b>와 상태(아직 · 읽는 중 · 끝)가 표로 보입니다. 개념노트 태그를 누르면 그 노트가 열리고, 확인한 노트에는 체크가 붙습니다. 정리는 따로 쌓지 않고 처음부터 개념노트로 쌓습니다(11/4 "지식이 흩어지지 않게").</> },
    { text: <>장 · 상태 · 개념노트는 제목 오른쪽 연필의 고치기 창에서 고칩니다. 책 하나는 라이브러리 {c('study/<id>.yaml')} 한 파일이고, 차례와 진도만 적습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Study (books and lectures)',
  items: [
    { text: <>In the Knowledge left sidebar, under "Map", the <b>Study</b> row lists each book or lecture on its own row, with chapters done / all chapters at the end. Clicking "Study" shows the list of books and lectures and "＋ Book or lecture".</> },
    { text: <>Opening a book shows a table of its chapters with the <b>concept notes</b> written from each chapter and its state (not started · reading · done). Clicking a concept note tag opens that note, and checked notes get a check mark. Notes are not kept separately; they go into concept notes from the start (11/4 "keep knowledge in one place").</> },
    { text: <>Edit chapters, states and concept notes in the edit dialog from the pencil to the right of the title. A book is one file, {c('study/<id>.yaml')}, in the library, holding only its contents and progress.</> },
  ],
}
