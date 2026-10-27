import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › notes › 주장 하나의 노트와 진술. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '주장 하나의 노트와 진술', prs: [277],
  items: [
    { text: <>주장 하나(보조정리·유도·계산·열린 문제)도 다른 노트처럼 주제 폴더 안의 노트 하나({c('note.md')} 또는 {c('main.tex')} + {c('note.yaml')})로 적습니다. 따로 있던 블록 노트({c('workbench/blocks/')})는 2026-10-27에 없앴고, 같은 이름의 노트 폴더로 옮겼습니다. 상태는 진행 · 멈춤 · 폐기 · 해결입니다.</> },
    { text: <>연구 질문은 '열린 질문' 노트로 본문에 남기고, 옆 메모에는 할 일만 둡니다.</> },
    { text: <>멈춘 노트에는 다시 열 조건을 적어 둡니다.</> },
    { text: <>노트 편집기의 "/"에서 "멈춤 기록 (선택)"으로 목표와 가정, 멈춘 근거(식·반례·문헌 위치), 다시 열 조건의 안내를 넣을 수 있습니다. "계산·결과 근거 (선택)"은 결과 파일·코드 커밋·주요 입력·확인한 범위를 적을 때 씁니다. 모두 선택 사항이며 빈 항목과 안내는 읽기 화면과 PDF에 나오지 않습니다.</> },
    { text: <>진술은 번호 붙은 정의·정리 카드이고, 진술끼리는 "사용", 노트와는 "증명"으로 이어집니다. 진술의 {c('proofs:')}에 노트 폴더 이름을 적으면 지도와 진술 화면에 그 노트가 증명 작업으로 보입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Single-claim notes and statements',
  items: [
    { text: <>A single claim (a lemma, derivation, calculation or open problem) is written like any other note: one note folder inside a topic folder ({c('note.md')} or {c('main.tex')} + {c('note.yaml')}). The separate block notes ({c('workbench/blocks/')}) were removed on 2026-10-27 and moved into note folders of the same name. Its status is In progress · Blocked · Dropped · Solved.</> },
    { text: <>Research questions stay in the body as an "open question" note, and the side memo holds only to-dos.</> },
    { text: <>A blocked note has its reopen condition written down.</> },
    { text: <>From "/" in the note editor, "Blocked record (optional)" inserts prompts for the goal and assumptions, the grounds for blocking (equations, counterexamples, places in the literature) and the reopen condition. "Calculation and result grounds (optional)" is for writing the result files, code commit, main inputs and the range checked. All of this is optional, and empty items and prompts do not appear in the reading view or the PDF.</> },
    { text: <>Statements are numbered definition and theorem cards; statements connect to each other by "uses", and to notes by "proves". Write note folder names in a statement's {c('proofs:')} and those notes show as its proof work on the map and the statement screen.</> },
  ],
}
