import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › notes › 인용. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '인용', prs: [128],
  items: [
    { text: <>Markdown 노트는 {c('[@키]')}, LaTeX 원고·노트는 {c('\\cite{키}')}로 인용하고 항목은 {c('references.bib')}에 둡니다({c('[@키]')}는 PDF에서 {c('\\cite')}가 됩니다). 프로젝트 bib에 없는 키는 공유 라이브러리의 {c('references.bib')}에서 찾습니다. 참고문헌 절은 컴파일할 때 인용한 것만 골라 PDF에 붙고(라이브러리에서 찾은 항목은 {c('library-refs.bib')}로 뽑아 넣습니다), 어디에도 없는 키는 경고합니다.</> },
    { text: <>읽는 본문 맨 아래 "인용한 논문 N · 파일 이름에서"를 펼치면 그 노트가 인용한 논문이 나옵니다. 본문과 함께 스크롤하고, 펼쳤는지는 노트마다 기억합니다. LaTeX에서는 편집기 아래에 있고 위 경계를 끌어 높이를 바꿉니다. 여기서 arXiv PDF를 받거나 문헌노트를 만듭니다. 공유 라이브러리의 논문은 "라이브러리에서 열기"로 논문 라이브러리에서 엽니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Citations',
  items: [
    { text: <>Cite with {c('[@key]')} in Markdown notes and {c('\\cite{key}')} in LaTeX manuscripts and notes, and keep entries in {c('references.bib')} ({c('[@key]')} becomes {c('\\cite')} in the PDF). Keys not in the project bib are looked up in the shared library's {c('references.bib')}. At compile time the references section includes only what was cited (entries found in the library are copied into {c('library-refs.bib')}), and keys found nowhere give a warning.</> },
    { text: <>At the bottom of the reading body, expand "Cited papers N · from file name" to see the papers the note cites. It scrolls with the body, and whether it is expanded is remembered per note. In LaTeX it sits below the editor, and you drag its top edge to change the height. From here you download the arXiv PDF or make a literature note. Papers from the shared library open in the paper library with "Open in the library".</> },
  ],
}
