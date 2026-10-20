import * as libraryHome from './knowledge/library-home'
import * as whereTheyLive from './knowledge/where-they-live'
import * as finding from './knowledge/finding'
import * as readingAndEditing from './knowledge/reading-and-editing'
import * as organizingRules from './knowledge/organizing-rules'
import type { AboutPart } from './types'

// 소개 › 개념노트 (#/about/knowledge). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'knowledge', title: '개념노트',
  sub: '레일의 책 아이콘 "지식". 개념노트를 프로젝트와 상관없이 찾고 읽고 고치는 화면입니다.',
  open: [{ label: '지식 열기', to: { page: 'library' } }, { label: '지식 지도 열기', to: { page: 'library', view: 'map' } }],
  sections: [libraryHome.ko, whereTheyLive.ko, finding.ko, readingAndEditing.ko, organizingRules.ko],
  left: ['교과서·강의 장별 노트(48개)와 논문 노트는 나중에 옮깁니다.', '개념노트 그림(tikz, 양자 회로)과 손그림 붙이기, LaTeX 내보내기는 개념노트 작업의 다음 단계입니다.', '라이브러리를 여럿이 함께 쓰게 되면 메모마다 작성자 · 공개 범위 칸을 둡니다. 모두가 볼 기록(고칠 곳 · 열린 질문)은 라이브러리 메모에, 나만 볼 메모 · 할 일은 개인 저장소에 개념 ID로 두고 앱이 함께 보여 줍니다.'],
}

export const en: AboutPart = {
  id: 'knowledge', title: 'Concept notes',
  sub: 'The book icon "Knowledge" on the rail. A screen to find, read and edit concept notes regardless of project.',
  open: [{ label: 'Open Knowledge', to: { page: 'library' } }, { label: 'Open knowledge map', to: { page: 'library', view: 'map' } }],
  sections: [libraryHome.en, whereTheyLive.en, finding.en, readingAndEditing.en, organizingRules.en],
  left: ['Chapter notes for textbooks and lectures (48) and paper notes will be moved later.', 'Figures in concept notes (tikz, quantum circuits), attaching hand drawings, and LaTeX export are the next step for concept notes.', 'When several people share a library, each memo gets an author and visibility field. Records for every reader (corrections, open questions) stay in the library memo; personal memos and to-dos go in your personal repository under the concept ID, and the app shows both together.'],
}
