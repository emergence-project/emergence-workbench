import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › reading › 논문 라이브러리. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '논문 라이브러리', prs: [81, 105, 334, 354],
  items: [
    { text: <>레일의 "논문"은 모든 프로젝트가 함께 쓰는 논문 목록입니다. 첫 화면은 최근 더한 논문 · 점검(PDF 폴더 정하기 · 답이 온 질문) · 통계, 사이드바 "목록"은 표 | 카드 보기이고, 논문을 고르면 오른쪽에 정보가 보입니다.</> },
    { text: <>사이드바는 첫 화면 · <b>전체 문헌</b>(논문과 책 모두)과 그 아래 들인 논문 · 책, 분류, 접어 둔 프로젝트입니다(10/31). 목록 맨 위 가운데의 찾기 칸은 제목 · 저자 · 저널 · arXiv 번호로 찾고, 툴바 왼쪽 「보기」 상자는 사이드바에서 고른 것 안에서 프로젝트에 안 묶임 · 코멘트 있음 · 답 기다리는 질문으로 한 번 더 거릅니다. 표의 열은 제목 · 저자 · 연도 · 분류 · 태그 · 프로젝트 · PDF로 정해 두었고(좁으면 태그 · 분류 · 프로젝트 순으로 숨김), 열 이름을 누르면 그 열로 정렬합니다. 분류 열 이름은 누를 때마다 맨 앞에 올 분류를 다음으로 돌리고(예: 「분류 · Many-Body 먼저」), 태그는 그 논문을 출처로 적은 개념노트(머리말 {c('sources:')}나 본문 {c('[@키]')})입니다. 첫 화면 통계에도 코멘트 있음 · 답 기다리는 질문 줄이 있어 누르면 그 보기로 목록이 열립니다.</> },
    { text: <>논문을 열면 PDF와 오른쪽 정보 · 코멘트가 함께 보입니다. 하이라이트와 코멘트·질문은 노트에서와 같고, 파일은 공유 라이브러리 {c('comments/<키>/<id>.md')}에 하나씩 남습니다. PDF는 설정 › 라이브러리 관리에서 고른 iCloud · Google Drive 폴더에 둡니다.</> },
    { text: <>PDF 툴바 왼쪽의 목차 버튼은 PDF에 든 목차를 왼쪽 칸에 펼치고, 찾기 버튼(⌘F)은 PDF 안 글을 찾습니다(Enter 다음 · ⇧Enter 이전). 인용 · 식 · 그림 번호처럼 PDF 안 자리를 가리키는 링크를 누르면 그 자리로 가고, 왼쪽 아래 "돌아가기"로 보던 곳에 돌아옵니다. 논문을 다시 열면 읽던 쪽과 배율에서 시작합니다(이 브라우저가 기억). 카드 보기의 정렬은 고르기 상자입니다.</> },
    { text: <>그림 라이브러리(레일 "그림")도 같은 틀입니다: 공용 그림은 공유 라이브러리 {c('figures/')}, 한 프로젝트 것은 그 저장소 {c('workbench/figures/')}에 두고 이름과 설명은 {c('figures.yaml')}에 적습니다.</> },
    { text: <>그림 카드나 표 줄을 누르면 그림 화면이 열립니다: 본문에 그림이 크게, 아래에 보던 목록이 한 줄로, 오른쪽에 정보(설명 · 분류 · 노트에 넣는 글 · 쓰는 노트 · 원본 수정)가 있습니다. ← →로 앞뒤 그림, Esc로 목록에 돌아갑니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Paper library',
  items: [
    { text: <>"Papers" on the rail is the list of papers shared by all projects. Its home has recently added papers · Check (set the PDF folder · answered questions) · Stats, and "List" in the sidebar is a Table | Cards view; choosing a paper shows its info on the right.</> },
    { text: <>The sidebar holds the home page · <b>All literature</b> (papers and books) with Papers · Books indented under it, subjects, and folded projects (10/31). The search box at the top center of the list searches titles, authors, journals and arXiv numbers, and the "Show" box at the left of the header narrows what you picked in the sidebar to not in a project · with comments · questions awaiting answers. The table's columns are fixed: title · authors · year · subject · tags · projects · PDF (when narrow, tags, subject and projects hide in that order); click a column name to sort by it. Each click on the subject column name brings the next subject to the top (for example "Subject · Many-Body first"), and tags are the concept notes that cite the paper (front matter {c('sources:')} or {c('[@key]')} in the text). The home page stats also have with-comments and awaiting-answers rows that open the list with that filter.</> },
    { text: <>Opening a paper shows the PDF together with info and comments on the right. Highlights, comments and questions work as in notes, and each is saved as one file in the shared library's {c('comments/<key>/<id>.md')}. PDFs go in the iCloud or Google Drive folder chosen in Settings › Library.</> },
    { text: <>On the left of the PDF toolbar, the contents button opens the PDF's own outline in a side column and the find button (⌘F) searches the PDF's text (Enter next · ⇧Enter previous). Links that point inside the PDF, such as citation, equation and figure numbers, jump there, and "Back" at the bottom left returns to where you were. Reopening a paper starts at the page and zoom you left (remembered by this browser). Sorting in the card view is a select box.</> },
    { text: <>The figure library ("Figures" on the rail) has the same layout: shared figures go in the shared library's {c('figures/')}, a single project's in that repository's {c('workbench/figures/')}, and names and descriptions are written in {c('figures.yaml')}.</> },
    { text: <>Clicking a figure card or table row opens the figure screen: the figure large in the main area, the list you came from as one row below, and its info on the right (description · subjects · text to embed in a note · notes using it · edit source). ← → go to the previous or next figure, Esc returns to the list.</> },
  ],
}
