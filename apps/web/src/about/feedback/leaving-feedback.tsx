import { FeedbackFlowFigure } from '../../aboutFigures'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › feedback › 남기기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '남기기', prs: [141, 158, 197, 212, 225, 241, 246],
  figure: <FeedbackFlowFigure />,
  items: [
    { text: <>상단바의 피드백 버튼(위치 핀 + 글줄)으로 피드백 모드를 켜고 화면 부위를 눌러 남깁니다. 등록하기 전에 왼쪽 아래에서 수정 · 질문 · 제안 중 하나를 고르고 오른쪽의 의견 등록을 누릅니다. 이 둘은 늘 한 줄에 있고, 앱 폴더가 공개 저장소를 가리키는 컴퓨터에서만 보이는 GitHub에 보내기는 그 아래 따로 한 줄에 있습니다(고르지 않으면 등록되지 않습니다. 질문을 고친 요청으로 읽지 않게). 창(프로젝트 등록 같은 창, 검색, 빠른 메모)이 열려 있어도 피드백 버튼은 눌리고, 창 안의 부위에도 남길 수 있습니다. 말풍선은 연구 내용의 코멘트에만 씁니다.</> },
    { text: <>코멘트마다 그 순간의 화면 그림이 {c('feedback/pictures/')}에 함께 남아, Claude가 같은 화면을 봅니다. 그림은 등록을 누를 때 찍어서, 부위를 누르면 입력 창이 바로 뜨고 쓰는 동안 멈추지 않습니다(등록에 잠깐 걸립니다). 마지막 코멘트 뒤 설정 › 동기화의 올리기 간격(처음 30초)이 지나면 저절로 GitHub에 등록되고, 수동이면 "피드백 등록"을 누를 때만 등록됩니다. 앱 업데이트는 올리지 않은 피드백을 먼저 커밋한 뒤 새 버전을 받으므로 둘은 부딪히지 않습니다. 에이전트가 승인된 원문을 지운 직후 같은 날짜 파일에 올리지 않은 코멘트가 있을 때만 업데이트가 "아무것도 바꾸지 않았습니다"로 멈춥니다(앱은 그대로 돕니다).</> },
    { text: <>등록하지 않고 창을 닫거나 피드백 모드를 끄고 다른 화면을 보러 가도 적던 글은 이 브라우저에 남습니다. 다시 피드백 모드를 켜면 아래 띠에 "적던 글 · 시각 · 부위"와 <b>이어 쓰기</b> · <b>버리기</b>가 뜹니다. 이어 쓰면 처음 화면으로 돌아가 같은 부위의 창이 열리고, 등록하면 지워집니다. 적던 글은 여러 개를 둡니다(10/21, 많아야 20개). 둘 이상이면 아래 띠에 <b>적던 글 n</b>이 뜨고, 누르면 목록(유형 · 시각 · 부위 · 글 세 줄)에서 글마다 이어 쓰기 · 버리기를 합니다. 오늘 전에 적은 글은 날짜도 보입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Leaving feedback',
  figure: <FeedbackFlowFigure />,
  items: [
    { text: <>Turn on feedback mode with the Feedback button in the top bar (a location pin with text lines), and click a part of the screen to leave a comment. Before posting, choose Fix, Question or Suggestion at the bottom left and press Submit on the right. These two always stay on one line; Send to GitHub, shown only on a computer whose app folder points to the public repository, sits on its own line below (you cannot post without choosing, so a question is not read as a request). The Feedback button still works while a dialog (such as Register project, search or quick memo) is open, and you can leave feedback on parts inside the dialog. The speech bubble is used only for comments on research content.</> },
    { text: <>Each comment saves a picture of the screen at that moment in {c('feedback/pictures/')}, so Claude sees the same screen. The picture is taken when you submit, so the box opens right away when you click a part and typing never stalls (submitting takes a moment). After the last comment it is pushed to GitHub automatically once the push interval in Settings › Sync has passed (30 seconds at first); when that is manual, only "Register feedback" pushes it. An app update first commits any feedback not yet pushed and then pulls the new version, so the two do not collide. Only when an agent has just deleted approved originals and the same date file has comments not yet pushed does the update stop with "nothing was changed" (the app keeps running).</> },
    { text: <>If you close the box or turn feedback mode off to look at another screen without submitting, what you wrote stays in this browser. When you turn feedback mode on again, the bottom bar shows "Unsent draft · time · part" with <b>Continue</b> and <b>Discard</b>. Continue takes you back to the first screen and opens the box on the same part; submitting clears it. Several drafts are kept (10/21, up to 20). With two or more, the bottom bar shows <b>Unsent drafts n</b>; click it for a list (kind · time · part · three lines of text) with Continue and Discard for each. Drafts from before today also show their date.</> },
  ],
}
