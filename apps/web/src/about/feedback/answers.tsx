import { FeedbackAnswersTable } from '../../aboutFigures'
import type { AboutSection } from '../types'

// 소개 › feedback › 유형과 답. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '유형과 답', id: 'answers', prs: [214, 284],
  figure: <FeedbackAnswersTable />,
  items: [
    { text: <>피드백을 남길 때 고른 유형(<b>수정</b> · <b>질문</b> · <b>제안</b>)대로 처리합니다. 에이전트는 유형을 바꾸지 않습니다.</> },
    { text: <>답의 <b>첫 줄</b>은 위 표의 말 하나로만 시작합니다(10/21). 그 뒤에 근거(PR 번호 · 그림 · 화면 이름)를 붙입니다. 한 답에 고친 것과 고칠 것을 섞지 않습니다: 일부만 고쳤으면 고친 것은 "수정 완료", 남은 것은 따로 묻습니다.</> },
    { text: <>답에 시안 · PR 주소(https://…)가 있으면 눌러서 새 창으로 엽니다. 기록 · 메모 글의 주소도 같습니다.</> },
    { text: <>"진행"은 결정을 물은 답(확인 필요 · 의견에 동의)에만 있습니다. 진행을 누르면 에이전트가 만들고, 끝나면 답이 "수정 완료"로 바뀝니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Kinds and answers', id: 'answers',
  figure: <FeedbackAnswersTable />,
  items: [
    { text: <>Feedback is handled by the kind you picked when leaving it (<b>Fix</b> · <b>Question</b> · <b>Suggestion</b>). Agents do not change the kind.</> },
    { text: <>The <b>first line</b> of an answer starts with exactly one phrase from the table above (10/21), followed by the grounds (PR number, picture, screen name). One answer never mixes what was fixed with what is still to fix: a partial fix says "Fixed" for the fixed part and asks about the rest separately.</> },
    { text: <>Addresses in an answer (https://…, such as a mockup or PR) open in a new window when clicked. Addresses in records and memos work the same way.</> },
    { text: <>"Proceed" appears only on answers that ask you to decide (Needs your call · Agreed). Pressing it has the agent build it, and the answer then becomes "Fixed".</> },
  ],
}
