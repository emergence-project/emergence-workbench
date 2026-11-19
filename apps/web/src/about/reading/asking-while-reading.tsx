import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › reading › 읽으며 묻기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '읽으며 묻기', port: 'pdf-comments', prs: [300, 315, 335, 460, 469, 483],
  items: [
    { text: <>노트를 쓰는 중에 논문·진술·개념노트를 열면 옆 패널에 열려, 창을 바꾸지 않고 같은 화면에서 읽습니다.</> },
    { text: <>노트 · 편집기 · PDF에서 글을 끌어 고르면 고른 글 메뉴가 뜹니다: 하이라이트 네 색 · 코멘트 · 질문. <b>? 질문</b>은 고른 글을 붙인 질문 기록 칸을 오른쪽 사이드바에 열고, 보내면 그 질문의 에이전트 대화가 답합니다(11/19). 하이라이트한 곳을 누르면 색 바꾸기 · 코멘트 달기 · 삭제가 나옵니다.</> },
    { text: <>PDF에서 고른 글로 쓰는 칸은 메모와 질문 두 칸이라, 한 자리에 메모와 질문을 함께 남깁니다(하나만 써도 됨). 오른쪽 "정리"는 고른 곳마다 하이라이트 · 메모 · 질문과 답을 한 묶음으로 쪽 순서대로 보이고, 묶음의 ＋로 그 자리에 추가하며, 복사 버튼은 정리 전체를 Markdown으로 복사합니다.</> },
    { text: <>PDF 패널 가운데 위 툴바의 코멘트(말풍선)는 오른쪽 사이드바 기록을 엽니다. 글을 끌어 고르면 그 자리를 붙이고, 기록은 {c('workbench/comments/<대상>.md')}에 쌓입니다.</> },
    { text: <>반짝이 "에이전트에게 보내기"를 누르면(설정 › 에이전트 › 질문 처리가 바로면 질문을 적기만 해도, 10/28) 이 맥의 Claude Code({c('claude -p')}, 읽기만)가 그 PDF를 읽고 같은 파일에 답을 덧붙입니다. 밖에서 적은 대기 질문은 다음에 일하는 에이전트도 답할 수 있습니다.</> },
    { text: <>에이전트 대화는 보낼 때마다 지금 보는 화면(화면 이름 · 프로젝트 · 노트나 파일)을 한 줄로 함께 받고, 앞과 다를 때만 그 줄을 읽습니다. 여러 기기면 마지막으로 보낸 기기의 화면입니다. 입력란 ＋ › <b>지금 화면 붙이기</b> · <b>고른 글 붙이기</b>는 그 화면이나 어느 화면에서든 마지막으로 끌어 고른 글을 칩으로 붙입니다. 고른 글이 없으면 흐리게 보입니다(11/19).</> },
  ],
}

export const en: AboutSection = {
  title: 'Asking while reading', port: 'pdf-comments',
  items: [
    { text: <>Opening a paper, statement or concept note while writing a note opens it in the side pane, so you read it on the same screen without switching windows.</> },
    { text: <>Dragging to select text in a note, the editor or a PDF brings up the selection menu: four highlight colors, Comment and Question. <b>? Question</b> opens a question record in the right sidebar with the selection attached, and its agent conversation answers once sent (11/19). Clicking a highlight offers change color · add comment · delete.</> },
    { text: <>In a PDF, writing from a selection gives two boxes, note and question, so one spot gets both (either alone is fine). "Notes" on the right groups each spot's highlight, notes, questions and answers into one card in page order; a card's ＋ adds more there, and the copy button copies all the notes in Markdown.</> },
    { text: <>Comment (speech bubble) in the toolbar at the top middle of the PDF pane opens Records in the right sidebar. Dragging to select text attaches that spot, and records build up in {c('workbench/comments/<target>.md')}.</> },
    { text: <>Pressing the sparkle "Send to agent" (or just writing a question when Settings › Agents › Questions is Right away, 10/28) makes Claude Code on this Mac ({c('claude -p')}, read only) read that PDF and append an answer to the same file. Pending questions written outside can also be answered by the next agent that works.</> },
    { text: <>Each message to an agent conversation carries one line about the screen you are on (screen name · project · note or file), and the agent reads it only when it changed; with several devices it is the screen of the device that sent last. In the input, ＋ › <b>Attach current screen</b> · <b>Attach selected text</b> adds that screen, or the text you last dragged to select on any screen, as a chip. With no selection the item is greyed out (11/19).</> },
  ],
}
