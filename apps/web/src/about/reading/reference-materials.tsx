import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › reading › 참고 자료. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '참고 자료', prs: [294, 315],
  items: [
    { text: <>사이드바 "참고 자료"를 펼치면 가진 PDF·파일({c('workbench/materials/')}와 {c('sources.materials')} 폴더)이 나오고 누르면 열립니다. 참고 자료는 이 연구 밖에서 온 것입니다(10/29): 묶음 둘 「논문」(논문 라이브러리 · 가진 논문 PDF)과 「원자료」(PDF · 발표 · 그림 · 글 문서)로 보이고, 자료 폴더 안의 Markdown · 텍스트(우리가 쓴 글)는 넣지 않습니다. 그런 글은 노트로 두고, 코드와 데이터와 함께 사이드바 「파일」 탭에서 봅니다. 파일을 끌어다 놓으면 넣습니다. 논문 라이브러리에 있는 논문 PDF는 여기 두지 않고, 맨 위 "논문 N편"이 논문 라이브러리로 갑니다.</> },
    { text: <>노트가 인용만 한 논문은 여기 넣지 않고, 그 노트 화면의 "인용한 논문"에서 봅니다. 파일 줄의 "＋ 문헌노트"로 그 논문의 문헌노트를 만듭니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Reference materials',
  items: [
    { text: <>Expand "Reference materials" in the sidebar to see the PDFs and files you have ({c('workbench/materials/')} and the {c('sources.materials')} folder); click to open. Reference materials are what comes from outside this research (10/29): they show in two groups, "Papers" (the paper library and paper PDFs you have) and "Source files" (PDFs, slides, images, text documents), and Markdown or plain text in the materials folders (our own writing) is left out. Keep such writing as notes; it shows with code and data in the sidebar's "Files" tab. Drag and drop a file to add it. Paper PDFs in the paper library are not kept here; "N papers" at the top goes to the paper library.</> },
    { text: <>Papers a note only cites are not added here; see them in "Cited papers" on that note's screen. "＋ Literature note" on a file row makes a literature note for that paper.</> },
  ],
}
