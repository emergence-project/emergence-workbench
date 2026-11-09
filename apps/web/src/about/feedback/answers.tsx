import { FeedbackAnswersTable } from '../../aboutFigures'
import type { AboutSection } from '../types'

// 소개 › feedback › 유형과 답. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '유형과 답', id: 'answers', prs: [214, 284, 412],
  figure: <FeedbackAnswersTable />,
  items: [
    { text: <>피드백을 남길 때 고른 유형(<b>수정</b> · <b>질문</b> · <b>제안</b>)대로 처리합니다. 에이전트는 유형을 바꾸지 않습니다.</> },
    { text: <>답의 <b>첫 줄</b>은 위 표의 말 하나로만 시작합니다(10/21). 그 뒤에 근거(PR 번호 · 그림 · 화면 이름)를 붙입니다. 한 답에 고친 것과 고칠 것을 섞지 않습니다: 일부만 고쳤으면 고친 것은 "수정 완료", 남은 것은 따로 묻습니다.</> },
    { text: <>답에 시안 · PR 주소(https://…)가 있으면 눌러서 새 창으로 엽니다. 기록 · 메모 글의 주소도 같습니다.</> },
    { text: <><b>승인</b>은 지금 결과로 끝내는 것이라 결과를 알린 답(수정 완료 · 답변 · 거절 · 나중에)에만 있고, 에이전트가 더 할 일은 없습니다. <b>진행</b>은 에이전트에게 일을 시키는 것입니다: 결정을 물은 답(확인 필요 · 의견에 동의)에서는 물은 대로 만들라는 뜻이고, 결과 답에서는 결과는 맞으니 이 방향으로 더 하라는 뜻입니다. 함께 적은 글(주의점 · 범위 · 고를 안)은 그대로 따르는 지시가 되고, 끝나면 답이 "수정 완료"로 바뀝니다. <b>반려</b>는 결과가 틀렸으니 다시 하라는 뜻이라 반려 횟수로 세고, 진행은 세지 않습니다(11/9).</> },
  ],
}

export const en: AboutSection = {
  title: 'Kinds and answers', id: 'answers',
  figure: <FeedbackAnswersTable />,
  items: [
    { text: <>Feedback is handled by the kind you picked when leaving it (<b>Fix</b> · <b>Question</b> · <b>Suggestion</b>). Agents do not change the kind.</> },
    { text: <>The <b>first line</b> of an answer starts with exactly one phrase from the table above (10/21), followed by the grounds (PR number, picture, screen name). One answer never mixes what was fixed with what is still to fix: a partial fix says "Fixed" for the fixed part and asks about the rest separately.</> },
    { text: <>Addresses in an answer (https://…, such as a mockup or PR) open in a new window when clicked. Addresses in records and memos work the same way.</> },
    { text: <><b>Approve</b> closes the item with the current result, so it appears only on answers that report a result (Fixed · Answered · Declined · Later) and leaves the agent nothing more to do. <b>Proceed</b> gives the agent work: on an answer that asks you to decide (Needs your call · Agreed) it means build it as asked; on a result answer it means the result is right, go further in this direction. Any text you add (cautions, scope, which option) is followed as an instruction, and the answer becomes "Fixed" when done. <b>Revise</b> means the result is wrong, do it again, and counts as a revision; Proceed does not (11/9).</> },
  ],
}
