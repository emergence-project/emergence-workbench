import type { AboutSection } from '../types'

// 소개 › project › 수정 검토. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '수정 검토', id: 'edits', prs: [103, 137, 158, 181, 210, 215, 351, 445],
  items: [
    { text: <>왼쪽 사이드바 "수정 검토". 에이전트가 이 프로젝트의 노트를 고친 것을 노트마다 모아, 위 표에서 검토할 노트를 한 줄씩(노트 · 주제 · 에이전트 · 고친 때 · 변경사항) 보고, 줄을 누르면 아래 "이 노트에서 변경사항" 표에 그 노트의 변경사항(문단)마다 전 · 후가 펼쳐집니다. 노트 이름 옆 아이콘은 노트 열기, 변경사항의 화살표 아이콘은 노트를 열어 그 문단으로 갑니다. 바뀐 낱말에는 칠이 되고, 앞뒤 문단을 펼쳐 볼 수 있습니다. 개념노트의 고침은 라이브러리 쪽 수정 검토에 있습니다.</> },
    { text: <>변경사항마다 <b>승인</b>(받아들임, 파일은 그대로) · <b>묻기</b>(왜 바꿨는지 묻거나 다시 고쳐 달라고 함, 에이전트의 답이 그 자리에 붙음) · ⋯의 <b>수정</b> · <b>되돌리기</b>(이 부분만 수정 전 글로)를 합니다. 에이전트가 적은 고친 이유 한 줄은 그 변경사항 아래에 전 · 후 · 검토를 가로지르는 옅은 줄로 보입니다(10/31). 표 위의 <b>에이전트가 적은 고친 까닭</b>은 이번 고침 묶음 전체를 왜 했는지입니다(변경사항의 이유와 같은 말은 빼고 보임).</> },
    { text: <><b>내 문단에 대한 제안</b>: 에이전트가 앱(MCP · 수정 요청)을 거쳐 노트를 고칠 때, 내가 쓴 문단(git 기록에서 마지막으로 고친 이가 나인 문단, 아직 올리지 않은 글 포함)은 바로 바꾸지 않고 제안으로 남깁니다. 에이전트가 쓴 문단은 지금처럼 바로 고치고 이 표에 오릅니다. 제안은 노트 본문에서 그 문단 밑에 카드(에이전트 · 이유 · 바꿀 글과 바뀐 글)로, 이 화면 위 「내 문단에 대한 제안」에 모여 보입니다. <b>받기</b>를 누르면 그때 파일에 들어가고(나의 커밋, 에이전트는 공동 작성자), <b>버리기</b>를 누르면 파일은 그대로입니다. git이 없는 폴더에서는 지금처럼 모두 바로 고칩니다.</> },
    { text: <>사용자가 확인한 노트는 에이전트가 쓰지 않고 "확인된 노트 수정 요청"으로 남깁니다. 그 대화에서 허락하면 에이전트가 다시 씁니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Edit review', id: 'edits',
  items: [
    { text: <>"Edit review" in the left sidebar. The upper table lists the notes to review, one row each (note · topic · agent · edited · changes); click a row and the lower table, "Changes in this note", shows that note's changed places (paragraphs) with before and after. The icon next to a note name opens the note, and the arrow icon on a change opens the note at that paragraph. Changed words are painted, and you can expand the paragraphs around a change. Edits to concept notes are in the library's edit review.</> },
    { text: <>For each change: <b>Approve</b> (accept; the file stays as is) · <b>Ask</b> (ask why, or ask for another edit; the agent's answer appears in place) · under ⋯, <b>Edit</b> · <b>Revert</b> (this part only, back to the text before). The one-line reason the agent gave sits under the change as a faint row across before · after · review (10/31). <b>Why the agent made these edits</b> above the table says why the whole batch was made (lines identical to a change's reason are left out).</> },
    { text: <><b>Suggestions on your paragraphs</b>: when an agent edits a note through the app (MCP · edit request), paragraphs you wrote (the git history says you changed them last, including text not yet committed) are not changed directly but kept as suggestions. Paragraphs an agent wrote are still changed directly and listed in this table. A suggestion shows as a card under that paragraph in the note (agent · reason · old and new text) and is gathered in "Suggestions on your paragraphs" at the top of this screen. <b>Take</b> writes it into the file then (your commit, with the agent as co-author); <b>Discard</b> leaves the file as is. In a folder without git, every edit is still made directly.</> },
    { text: <>Agents do not write to notes you have confirmed; they leave an "edit request for a confirmed note" instead. If you allow it in that conversation, the agent writes again.</> },
  ],
}
