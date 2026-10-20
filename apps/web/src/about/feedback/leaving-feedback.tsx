import { FeedbackFlowFigure } from '../../aboutFigures'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › feedback › 남기기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '남기기', prs: [141, 158, 197],
  figure: <FeedbackFlowFigure />,
  items: [
    { text: <>상단바의 피드백 버튼(위치 핀 + 글줄)으로 피드백 모드를 켜고 화면 부위를 눌러 남깁니다. 등록하기 전에 왼쪽 아래에서 수정 · 질문 · 제안 중 하나를 고릅니다(고르지 않으면 등록되지 않습니다. 질문을 고친 요청으로 읽지 않게). 창(프로젝트 등록 같은 창, 검색, 빠른 메모)이 열려 있어도 피드백 버튼은 눌리고, 창 안의 부위에도 남길 수 있습니다. 말풍선은 연구 내용의 코멘트에만 씁니다.</> },
    { text: <>코멘트마다 그 순간의 화면 그림이 {c('feedback/pictures/')}에 함께 남아, Claude가 같은 화면을 봅니다. 그림은 등록을 누를 때 찍어서, 부위를 누르면 입력 창이 바로 뜨고 쓰는 동안 멈추지 않습니다(등록에 잠깐 걸립니다). 마지막 코멘트 뒤 설정 › 동기화의 올리기 간격(처음 30초)이 지나면 저절로 GitHub에 등록되고, 수동이면 "피드백 등록"을 누를 때만 등록됩니다. 앱 업데이트는 올리지 않은 피드백을 먼저 커밋한 뒤 새 버전을 받으므로 둘은 부딪히지 않습니다. 에이전트가 승인된 원문을 지운 직후 같은 날짜 파일에 올리지 않은 코멘트가 있을 때만 업데이트가 "아무것도 바꾸지 않았습니다"로 멈춥니다(앱은 그대로 돕니다).</> },
  ],
}

export const en: AboutSection = {
  title: 'Leaving feedback',
  figure: <FeedbackFlowFigure />,
  items: [
    { text: <>Turn on feedback mode with the Feedback button in the top bar (a location pin with text lines), and click a part of the screen to leave a comment. Before posting, choose Fix, Question or Suggestion at the bottom left (you cannot post without choosing, so a question is not read as a request). The Feedback button still works while a dialog (such as Register project, search or quick memo) is open, and you can leave feedback on parts inside the dialog. The speech bubble is used only for comments on research content.</> },
    { text: <>Each comment saves a picture of the screen at that moment in {c('feedback/pictures/')}, so Claude sees the same screen. The picture is taken when you submit, so the box opens right away when you click a part and typing never stalls (submitting takes a moment). After the last comment it is pushed to GitHub automatically once the push interval in Settings › Sync has passed (30 seconds at first); when that is manual, only "Register feedback" pushes it. An app update first commits any feedback not yet pushed and then pulls the new version, so the two do not collide. Only when an agent has just deleted approved originals and the same date file has comments not yet pushed does the update stop with "nothing was changed" (the app keeps running).</> },
  ],
}
