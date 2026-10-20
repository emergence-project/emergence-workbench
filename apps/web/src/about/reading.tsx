import * as referenceMaterials from './reading/reference-materials'
import * as paperLibrary from './reading/paper-library'
import * as askingWhileReading from './reading/asking-while-reading'
import type { AboutPart } from './types'

// 소개 › 참고 자료와 논문 읽기 (#/about/reading). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'reading', title: '참고 자료와 논문 읽기',
  sub: '사이드바 "참고 자료"에는 실제로 가진 PDF·파일만 있습니다. 논문을 노트 옆 패널에 띄워 읽으며 코멘트와 질문을 남깁니다.',
  sections: [referenceMaterials.ko, paperLibrary.ko, askingWhileReading.ko],
  left: ['코멘트를 노트로 끌어오기는 아직입니다.', 'Zotero 연결은 나중입니다 (인용을 bib 항목으로 둔 것이 그 준비입니다).'],
}

export const en: AboutPart = {
  id: 'reading', title: 'Reference materials and reading papers',
  sub: 'The sidebar\'s "Reference materials" holds only PDFs and files you actually have. Open a paper in the pane next to a note, read it, and leave comments and questions.',
  sections: [referenceMaterials.en, paperLibrary.en, askingWhileReading.en],
  left: ['Pulling comments into notes is not there yet.', 'Zotero integration comes later (keeping citations as bib entries prepares for it).'],
}
