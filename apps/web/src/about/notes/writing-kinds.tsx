import { NoteSyntaxTable } from '../../aboutFigures'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › notes › 글의 종류와 쓰는 법. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '글의 종류와 쓰는 법', prs: [105, 143],
  figure: <NoteSyntaxTable />,
  items: [
    { text: <><b>원고</b>는 {c('research.yaml')}의 {c('sources.manuscript')}에 적은 LaTeX 파일입니다. 원고는 개인 연구와 초고까지, 공동 집필·투고는 Overleaf에 둡니다. 한 파일 원고(예: 논문 하나인 PRB.tex)는 {c('\\section')}마다 한 장으로 보입니다.</> },
    { text: <><b>노트</b>는 {c('workbench/notes/')} 또는 계산용 {c('workbench/calc/')} 아래 폴더 하나({c('note.md')} + {c('note.yaml')})이거나, 주장 하나만 담는 {c('workbench/blocks/<id>.md')}입니다. 계산 코드(.py, .ipynb)도 노트 폴더에 함께 둡니다. 개념노트·문헌노트는 "정의와 원칙"의 표를 보세요.</> },
    { text: <>원고만 LaTeX이고, 노트는 개념노트와 같은 <b>Markdown + KaTeX</b>입니다. 읽기가 기본이고, 연필(고치기)을 누르면 개념노트와 같은 편집기가 열립니다("/"·⌘K 명령, {c('[[')} 개념 링크, {c('[@')} 출처). 목록 줄에서 Tab · Shift-Tab으로 들여쓰고 내어 쓰며(• ◦ ▪), {c('[@')}는 키 · 저자 · 제목 · 연도 낱말로 찾습니다. 절은 {c('## 제목')}으로 나누고, 노트가 커지면 하위 노트 대신 "이어지는 노트"를 따로 만들어 링크합니다.</> },
    { text: <>읽기 화면과 흐름 점 설명의 그림은 누르면 화면 위에 크게 뜨고, ← →로 그 글의 다른 그림을 넘겨 봅니다. 그림 라이브러리의 그림이면 위에 "그림 화면에서 열기"가 있습니다.</> },
    { text: <>번호와 참조는 LaTeX처럼 씁니다(위 표). 제목 끝·{c('$$')} 안의 식·그림 캡션에 {c('\\label{…}')}을 두고 {c('\\ref{…}')}·{c('\\eqref{…}')}로 부르면 읽기 화면과 PDF에 같은 번호가 붙습니다. PDF에는 노트 폴더의 .bib(없으면 프로젝트 bib)로 참고문헌 목록이 붙습니다.</> },
    { text: <>여러 노트에서 쓰는, 연구와 무관한 정의는 개념노트로 옮기고 노트에서는 링크만 겁니다. PDF는 컴파일·내보내기 때 프로젝트 LaTeX 서식으로 바꿔 만듭니다(노트 파일은 그대로). 예전 LaTeX 노트({c('main.tex')})도 그대로 열립니다.</> },
    { text: <>원고 줄의 "복사해 노트 만들기"는 원고의 본문과 그것이 부르는 장·그림·bib만 복사합니다. 원고는 그대로입니다. 주제 화면이나 첫 화면 줄 맨 앞의 점선 카드 "＋ 노트 만들기"로 빈 노트를 만듭니다.</> },
    { text: <>LaTeX 노트 파일에는 <b>본문만</b> 둡니다. {c('\\documentclass')}·패키지·제목·저자 같은 머리말은 컴파일·내보내기 때 앱이 프로젝트 서식(설정 › LaTeX 서식)과 네트워킹의 저자 순서로 붙입니다. 프로젝트 전용 기호는 {c('workbench/macros.tex')} 하나에 모읍니다. 이미 머리말이 붙은 노트는 "모두 본문만 남기기"로 뗍니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Kinds of writing and how to write them',
  figure: <NoteSyntaxTable />,
  items: [
    { text: <>A <b>manuscript</b> is the LaTeX file named in {c('sources.manuscript')} of {c('research.yaml')}. Manuscripts cover personal research up to a first draft; co-writing and submission happen in Overleaf. A single-file manuscript (for example a paper's PRB.tex) shows one chapter per {c('\\section')}.</> },
    { text: <>A <b>note</b> is one folder ({c('note.md')} + {c('note.yaml')}) under {c('workbench/notes/')} or, for calculations, {c('workbench/calc/')}, or a single-claim {c('workbench/blocks/<id>.md')}. Calculation code (.py, .ipynb) goes in the note folder too. For concept notes and literature notes, see the table in "Definitions and principles".</> },
    { text: <>Only manuscripts are LaTeX; notes are <b>Markdown + KaTeX</b>, like concept notes. Reading is the default, and the pencil (Edit) opens the same editor as concept notes ("/" and ⌘K commands, {c('[[')} concept links, {c('[@')} sources). On a list line, Tab and Shift-Tab indent and outdent (• ◦ ▪), and {c('[@')} searches by key, author, title or year words. Sections are split with {c('## Title')}, and when a note grows, make a separate "follow-up note" and link to it instead of sub-notes.</> },
    { text: <>Click a figure in the reading view or in a flow dot description to see it large over the screen; ← → step through the other figures in that text. For a figure from the figure library, "Open in figure screen" is at the top.</> },
    { text: <>Numbering and references are written as in LaTeX (table above). Put {c('\\label{…}')} at the end of a heading, inside a {c('$$')} equation or in a figure caption, and call it with {c('\\ref{…}')} or {c('\\eqref{…}')}; the reading view and the PDF get the same number. The PDF gets a reference list from the note folder's .bib (or the project bib if there is none).</> },
    { text: <>Definitions used across several notes that are not specific to the research move into concept notes, and notes only link to them. The PDF is built at compile or export time using the project's LaTeX template (the note file stays as it is). Old LaTeX notes ({c('main.tex')}) still open.</> },
    { text: <>"Copy into a note" on a manuscript row copies only the manuscript's body and the chapters, figures and bib it uses. The manuscript stays as it is. The dashed card "＋ New note" at the start of a row on the topic screen or home screen makes an empty note.</> },
    { text: <>LaTeX note files hold <b>only the body</b>. The preamble ({c('\\documentclass')}, packages, title, authors) is added by the app at compile or export time from the project template (Settings › LaTeX templates) and the author order in Networking. Project-specific symbols go in one file, {c('workbench/macros.tex')}. Notes that already have a preamble can have it stripped with "Keep body only for all".</> },
  ],
}
