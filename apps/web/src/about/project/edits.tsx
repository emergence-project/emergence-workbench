import type { AboutSection } from '../types'

// 소개 › project › 수정 검토. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '수정 검토', id: 'edits', prs: [103, 137, 158, 181, 210],
  items: [
    { text: <>왼쪽 사이드바 "수정 검토". 에이전트가 이 프로젝트의 노트를 고친 것을 노트마다 모아, 위 표에서 검토할 노트를 한 줄씩(노트 · 주제 · 에이전트 · 고친 때 · 바뀐 곳) 보고, 줄을 누르면 아래 "이 노트에서 바뀐 곳" 표에 그 노트의 바뀐 곳(문단)마다 전 · 후가 펼쳐집니다. 노트 이름 옆 아이콘은 노트 열기, 바뀐 곳의 화살표 아이콘은 노트를 열어 그 문단으로 갑니다. 바뀐 낱말에는 칠이 되고, 앞뒤 문단을 펼쳐 볼 수 있습니다. 개념노트의 고침은 라이브러리 쪽 수정 검토에 있습니다.</> },
    { text: <>바뀐 곳마다 <b>승인</b>(받아들임, 파일은 그대로) · <b>묻기</b>(왜 바꿨는지 묻거나 다시 고쳐 달라고 함, 에이전트의 답이 그 자리에 붙음) · ⋯의 <b>고치기</b> · <b>되돌리기</b>(이 부분만 고치기 전 글로)를 합니다. 에이전트가 적은 고친 이유 한 줄이 함께 보입니다.</> },
    { text: <>사용자가 확인한 노트는 에이전트가 쓰지 않고 "확인된 노트 고치기 요청"으로 남깁니다. 그 대화에서 허락하면 에이전트가 다시 씁니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Edit review', id: 'edits',
  items: [
    { text: <>"Edit review" in the left sidebar. The upper table lists the notes to review, one row each (note · topic · agent · edited · changes); click a row and the lower table, "Changes in this note", shows that note's changed places (paragraphs) with before and after. The icon next to a note name opens the note, and the arrow icon on a change opens the note at that paragraph. Changed words are painted, and you can expand the paragraphs around a change. Edits to concept notes are in the library's edit review.</> },
    { text: <>For each change: <b>Approve</b> (accept; the file stays as is) · <b>Ask</b> (ask why, or ask for another edit; the agent's answer appears in place) · under ⋯, <b>Edit</b> · <b>Revert</b> (this part only, back to the text before). The one-line reason the agent gave is shown with it.</> },
    { text: <>Agents do not write to notes you have confirmed; they leave an "edit request for a confirmed note" instead. If you allow it in that conversation, the agent writes again.</> },
  ],
}
