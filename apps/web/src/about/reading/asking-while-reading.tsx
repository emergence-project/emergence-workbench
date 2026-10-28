import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › reading › 읽으며 묻기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '읽으며 묻기', prs: [300],
  items: [
    { text: <>노트를 쓰는 중에 논문·진술·개념노트를 열면 옆 패널에 열려, 창을 바꾸지 않고 같은 화면에서 읽습니다.</> },
    { text: <>노트 · 편집기 · PDF에서 글을 끌어 고르면 고른 글 메뉴가 뜹니다: 하이라이트 네 색과 코멘트. 하이라이트한 곳을 누르면 색 바꾸기 · 코멘트 달기 · 지우기가 나옵니다.</> },
    { text: <>PDF 패널 가운데 위 툴바의 코멘트(말풍선)는 오른쪽 사이드바 기록을 엽니다. 글을 끌어 고르면 그 자리를 붙이고, 기록은 {c('workbench/comments/<대상>.md')}에 쌓입니다.</> },
    { text: <>"Claude에게 묻기"를 누르면(설정 › 에이전트 › 질문 · 지시 처리가 바로면 질문을 적기만 해도, 10/28) 이 맥의 Claude Code({c('claude -p')}, 읽기만)가 그 PDF를 읽고 같은 파일에 답을 덧붙입니다. 밖에서 적은 대기 질문은 다음에 일하는 에이전트도 답할 수 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Asking while reading',
  items: [
    { text: <>Opening a paper, statement or concept note while writing a note opens it in the side pane, so you read it on the same screen without switching windows.</> },
    { text: <>Dragging to select text in a note, the editor or a PDF brings up the selection menu: four highlight colors and Comment. Clicking a highlight offers change color · add comment · delete.</> },
    { text: <>Comment (speech bubble) in the toolbar at the top middle of the PDF pane opens Records in the right sidebar. Dragging to select text attaches that spot, and records build up in {c('workbench/comments/<target>.md')}.</> },
    { text: <>Pressing "Ask Claude" (or just writing a question when Settings › Agents › Questions and instructions is Right away, 10/28) makes Claude Code on this Mac ({c('claude -p')}, read only) read that PDF and append an answer to the same file. Pending questions written outside can also be answered by the next agent that works.</> },
  ],
}
