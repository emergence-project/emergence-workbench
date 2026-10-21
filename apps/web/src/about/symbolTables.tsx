import type { ReactNode } from 'react'
import type { ColorRow, SymbolRow } from './types'

// 소개 › 기호와 의미 쪽의 색 표와 기호 표 (AboutPage.tsx가 그린다). 한국어(_KO)와 영어(_EN)는 줄이 같고 함께 고친다.

/**
 * 기호와 뜻 표 (10/4 17:57 피드백 "기호별 상태의미를 모아두는 표를 만들자"). 화면 기준 쪽에 보인다.
 * docs/design-system.md 4절과 같은 내용이다. 기호를 바꾸면 둘 다 고친다.
 */
/**
 * 색과 뜻 표 (10/4 사용자 "색의 의미를 표로"). 무채색이 기본이고 색은 아래 뜻에만 쓴다.
 * status가 있으면 상태 색 점으로, 없으면 token 색의 네모로 보여 준다. 값은 tokens.css
 */
export const COLOR_ROWS_KO: ColorRow[] = [
  { status: 'in-progress', color: '파랑', name: '진행', meaning: '하고 있는 일', where: '노트, 맡긴 일, 프로젝트, 진술의 증명' },
  { status: 'blocked', color: '주황', name: '멈춤', meaning: '무엇을 기다리는 중, 곧 다시. 다시 시작할 조건을 함께 적습니다. 맡긴 일의 판단 대기도 같은 색(이름은 판단 대기)', where: '노트, 맡긴 일, 프로젝트, 진술의 증명' },
  { status: 'stopped', color: '짙은 회색 고리', name: '폐기', meaning: '그만둔 일 (지우지는 않음). 속이 빈 고리라 색이 안 보여도 구별됩니다', where: '노트, 맡긴 일' },
  { status: 'solved', color: '청록', name: '해결', meaning: '끝남 (프로젝트와 피드백은 "완료"). ✓ 표시는 이 색이 아니라 무채색입니다', where: '노트, 맡긴 일, 프로젝트, 진술' },
  { status: 'none', color: '옅은 회색', name: '증명 작업 없음', meaning: '아직 증명을 붙이지 않은 진술', where: '진술' },
  { token: '--s-blocked', color: '주황', name: '사용자 차례', meaning: '사용자가 답하거나 확인할 것. 에이전트의 답이나 처리를 기다리는 표시는 회색입니다', where: '레일 배지, 홈 확인 필요, 피드백 확인 필요, 기록 › 내 차례, 라이브러리 점검, 마감 ⚑' },
  { token: '--text-2', color: '회색', name: '에이전트 차례·처리 상태', meaning: '에이전트의 답이나 처리를 기다리는 것과 피드백의 처리 상태', where: '질문의 에이전트 대기, 피드백 상태 태그, ✓ 끝남·확인됨' },
  { token: '--primary', color: '검정 (설정의 강조 색)', name: '주 버튼·선택', meaning: '화면에서 가장 중요한 버튼 하나와 지금 고른 것', where: '모든 화면' },
  { token: '--danger', color: '빨강', name: '지우기·오류', meaning: '지우면 사라짐, 또는 실패함 (!)', where: '지우기 확인, 컴파일 오류, 이번 컴파일 실패' },
  { token: '--focus-line', color: '노랑', name: '지금 가리키는 곳', meaning: '방금 옮겨 간 줄이나 PDF 위치, 하이라이트', where: '원고, PDF, 홈 달력' },
  { token: '--proj-1', color: '여러 색', name: '프로젝트 구분', meaning: '프로젝트마다 다른 색 (상태가 아님)', where: '홈 달력' },
  { token: '--banner-bg', color: '노랑', name: '예제 모드', meaning: '개발용 예제 연구를 보고 있음', where: '맨 위 배너' },
]

export const SYMBOL_GROUPS_KO = (g: { icons: Record<'pencil' | 'trash' | 'play' | 'download' | 'comment' | 'approve' | 'sendBack' | 'memo' | 'feedback' | 'panelLeft' | 'more' | 'reopen' | 'search' | 'plus' | 'x' | 'up' | 'down' | 'todo' | 'ask' | 'send' | 'spark' | 'star' | 'check' | 'unchecked' | 'flag' | 'swap' | 'claude', ReactNode> }): { title: string; note: string; rows: SymbolRow[] }[] => [
  {
    title: '행동', note: '늘 무채색입니다. 한 행동에 이름 하나·기호 하나.',
    rows: [
      { mark: g.icons.plus, name: '더하기', meaning: '새로 만들거나 넣기', where: '모든 목록' },
      { mark: g.icons.pencil, name: '고치기', meaning: '그 항목의 입력란 열기', where: '항목 오른쪽 위 (좁은 칸은 늘 보임)' },
      { mark: g.icons.trash, name: '지우기', meaning: '사라짐. 되돌릴 수 없는 지우기는 무엇이 남는지 적고 확인합니다', where: '항목 오른쪽 위 (좁은 칸은 늘 보임)' },
      { mark: g.icons.x, name: '빼기·닫기', meaning: '여기서만 빠짐, 파일은 그대로', where: '태그, 목록, 창' },
      { mark: g.icons.play, name: '컴파일', meaning: 'PDF 만들기', where: '노트·원고 툴바' },
      { mark: g.icons.download, name: '내보내기', meaning: '파일로 받기', where: '노트·원고' },
      { mark: g.icons.comment, name: '코멘트 · 기록', meaning: '연구 내용(노트·PDF)에 말 남기기. 말풍선은 기록 묶음의 그림입니다', where: '노트 툴바, 왼쪽 사이드바 기록, 기록 탭' },
      { mark: g.icons.memo, name: '메모', meaning: '기록 종류: 프로젝트나 노트 옆에 적어 두는 것 (M 키)', where: '기록 줄 맨 앞, 기록 종류 고르기, 달력' },
      { mark: g.icons.todo, name: '할 일', meaning: '기록 종류: 할 것. 줄에서는 눌러서 끝내는 체크 상자', where: '기록 줄 맨 앞, 기록 종류 고르기' },
      { mark: g.icons.ask, name: '질문', meaning: '기록 종류: 묻는 것 (말풍선 안 ?)', where: '기록 줄 맨 앞, 기록 종류 고르기' },
      { mark: g.icons.send, name: '지시', meaning: '기록 종류: 에이전트에게 보내는 일 (종이비행기)', where: '기록 줄 맨 앞, 기록 종류 고르기' },
      { mark: g.icons.feedback, name: '피드백', meaning: '앱 화면의 이 자리에 남긴 말 (피드백 모드, 피드백 모아 보기)', where: '상단바, 레일' },
      { mark: g.icons.panelLeft, name: '사이드바 여닫기', meaning: '여닫는 쪽을 채운 네모. 버튼은 그 칸 쪽 끝에', where: '상단바 양 끝' },
      { mark: g.icons.more, name: '더 보기', meaning: '자주 쓰지 않는 일 (서식 · PDF 보기 · 내보내기 · 지우기 …)', where: '노트 툴바' },
      { mark: <>{g.icons.up}{g.icons.down}</>, name: '순서', meaning: '한 칸 앞·뒤로', where: '내보낼 저자' },
      { mark: g.icons.reopen, name: '다시 열기', meaning: '멈춘 노트를 진행으로, 끝낸 질문을 다시 대기로', where: '작업 패널, 기록' },
      { mark: g.icons.spark, name: 'Claude에게 묻기', meaning: '기록을 질문으로 보내 이 맥의 Claude가 답하게 함. 반짝이는 Claude가 하는 행동에만 씁니다', where: '기록 줄 오른쪽 위' },
      { mark: g.icons.search, name: '검색', meaning: '앱 전체에서 이름으로 찾기 (/ 키)', where: '상단바 오른쪽' },
      { mark: g.icons.approve, name: '승인', meaning: '결과가 맞음', where: '기록 › 내 차례 판단' },
      { mark: g.icons.sendBack, name: '수정', meaning: '맞지 않아 다시 하도록 돌려보냄 (지우지 않음)', where: '기록 › 내 차례 판단' },
      { mark: <><span className="star-ico on">{g.icons.star}</span> <span className="star-ico">{g.icons.star}</span></>, name: '즐겨찾기', meaning: '먼저 보이게 하기 (찬 별) / 풀기 (빈 별)', where: '카드, 주제, 사람' },
    ],
  },
  {
    title: '기록 표시', note: '누르지 않는 표시입니다.',
    rows: [
      { mark: g.icons.check, name: '끝남·확인됨', meaning: '컴파일 성공, 개념노트 확인함, 피드백 승인함, 끝낸 할 일 (무채색). 연구 상태의 해결은 ✓가 아니라 청록 점', where: '컴파일 결과, 개념노트, 피드백, 달력' },
      { mark: '!', name: '오류', meaning: '실패함 (빨강). 이 뜻으로만 씁니다', where: '컴파일 결과' },
      { mark: g.icons.flag, name: '마감', meaning: '할 일의 마감 (주황, 사용자 차례)', where: '홈 달력, 기록 달력' },
      { mark: g.icons.unchecked, name: '확인 전', meaning: '개념노트를 아직 확인하지 않음', where: '개념노트' },
      { mark: '—', name: '공리·정의', meaning: '증명할 것이 없는 진술', where: '진술' },
      { mark: g.icons.pencil, name: '고침', meaning: '노트를 고친 기록', where: '홈 달력' },
      { mark: g.icons.swap, name: '상태 바꿈', meaning: '상태가 바뀐 기록', where: '홈 달력, 기록 달력' },
      { mark: '→ ›', name: '열기·옮기기', meaning: '그 화면으로 가기', where: '링크' },
      { mark: '∎', name: '증명 끝', meaning: '증명이 끝나는 곳', where: '개념노트 본문' },
      { mark: g.icons.claude, name: '쓴 이 Claude', meaning: 'Claude가 쓴 기록 · 답 (이름 앞 회색 표시, 누르지 않음). 다른 에이전트는 이름만', where: '기록 줄 위 줄, 기록 대화, 오른쪽 사이드바 · PDF 코멘트의 "답 · 쓴 이"' },
      { mark: <span className="turn-dot" />, name: '내 차례 (에이전트가 물은 기록)', meaning: '에이전트가 물어 내 답을 기다림 (주황 점과 테두리, 노트 본문은 주황 칠)', where: '기록 줄, 노트 본문' },
      { mark: '2', name: '사용자 차례 수', meaning: '사용자가 볼 것이 몇 개인지 (주황 알약 하나의 모양)', where: '레일, 왼쪽 사이드바 기록 · 수정 검토, 피드백 필터, 기록 › 내 차례, 라이브러리 점검' },
    ],
  },
]

export const COLOR_ROWS_EN: ColorRow[] = [
  { status: 'in-progress', color: 'Blue', name: 'In progress', meaning: 'Work being done', where: 'Notes, delegated tasks, projects, statement proofs' },
  { status: 'blocked', color: 'Orange', name: 'Blocked', meaning: 'Waiting on something, back soon. The condition for restarting is written with it. Awaiting decision on delegated tasks uses the same color (named Awaiting decision)', where: 'Notes, delegated tasks, projects, statement proofs' },
  { status: 'stopped', color: 'Dark gray ring', name: 'Dropped', meaning: 'Work given up (not deleted). It is a hollow ring, so it is distinct even when color cannot be seen', where: 'Notes, delegated tasks' },
  { status: 'solved', color: 'Teal', name: 'Solved', meaning: 'Finished ("Done" for projects and feedback). The ✓ mark is neutral, not this color', where: 'Notes, delegated tasks, projects, statements' },
  { status: 'none', color: 'Light gray', name: 'No proof work', meaning: 'A statement with no proof attached yet', where: 'Statements' },
  { token: '--s-blocked', color: 'Orange', name: 'Your turn', meaning: 'Something for you to answer or review. Marks waiting on an agent\'s answer or handling are gray', where: 'Rail badge, Needs review on Home, Needs review in Feedback, Your turn in Records, library Check, deadline ⚑' },
  { token: '--text-2', color: 'Gray', name: 'Agent\'s turn and handling state', meaning: 'Things waiting on an agent\'s answer or handling, and feedback handling states', where: 'Questions waiting on an agent, feedback state tags, ✓ done and reviewed' },
  { token: '--primary', color: 'Black (the accent color in Settings)', name: 'Primary button and selection', meaning: 'The single most important button on the screen, and what is selected now', where: 'All screens' },
  { token: '--danger', color: 'Red', name: 'Delete and error', meaning: 'Gone once deleted, or failed (!)', where: 'Delete confirmation, compile errors, this compile failed' },
  { token: '--focus-line', color: 'Yellow', name: 'Where you are pointing now', meaning: 'The line or PDF spot you just moved to, highlights', where: 'Manuscripts, PDFs, Home calendar' },
  { token: '--proj-1', color: 'Various colors', name: 'Project marker', meaning: 'A different color per project (not a status)', where: 'Home calendar' },
  { token: '--banner-bg', color: 'Yellow', name: 'Sample mode', meaning: 'You are looking at the sample research for development', where: 'Banner at the very top' },
]

export const SYMBOL_GROUPS_EN = (g: { icons: Record<'pencil' | 'trash' | 'play' | 'download' | 'comment' | 'approve' | 'sendBack' | 'memo' | 'feedback' | 'panelLeft' | 'more' | 'reopen' | 'search' | 'plus' | 'x' | 'up' | 'down' | 'todo' | 'ask' | 'send' | 'spark' | 'star' | 'check' | 'unchecked' | 'flag' | 'swap' | 'claude', ReactNode> }): { title: string; note: string; rows: SymbolRow[] }[] => [
  {
    title: 'Actions', note: 'Always neutral. One name and one symbol per action.',
    rows: [
      { mark: g.icons.plus, name: 'Add', meaning: 'Create or insert something new', where: 'Every list' },
      { mark: g.icons.pencil, name: 'Edit', meaning: 'Open the item\'s input', where: 'Item top right (always shown in narrow areas)' },
      { mark: g.icons.trash, name: 'Delete', meaning: 'Gone. A delete that cannot be undone says what stays and asks for confirmation', where: 'Item top right (always shown in narrow areas)' },
      { mark: g.icons.x, name: 'Remove/Close', meaning: 'Taken out only here; the file stays', where: 'Tags, lists, dialogs' },
      { mark: g.icons.play, name: 'Compile', meaning: 'Make the PDF', where: 'Note and manuscript toolbar' },
      { mark: g.icons.download, name: 'Export', meaning: 'Save as a file', where: 'Notes and manuscripts' },
      { mark: g.icons.comment, name: 'Comment · Records', meaning: 'Leave a remark on research content (notes, PDFs). The speech bubble is the picture for records as a whole', where: 'Note toolbar, Records in the left sidebar, Records tab' },
      { mark: g.icons.memo, name: 'Memo', meaning: 'Record kind: something jotted next to a project or note (M key)', where: 'Start of a record row, record kind picker, calendar' },
      { mark: g.icons.todo, name: 'To-do', meaning: 'Record kind: something to do. In the row it is a checkbox you click to finish', where: 'Start of a record row, record kind picker' },
      { mark: g.icons.ask, name: 'Question', meaning: 'Record kind: something you ask (? in a speech bubble)', where: 'Start of a record row, record kind picker' },
      { mark: g.icons.send, name: 'Instruction', meaning: 'Record kind: work sent to an agent (paper plane)', where: 'Start of a record row, record kind picker' },
      { mark: g.icons.feedback, name: 'Feedback', meaning: 'A remark left on this spot of the app screen (feedback mode, feedback overview)', where: 'Top bar, rail' },
      { mark: g.icons.panelLeft, name: 'Toggle sidebar', meaning: 'A box with the side that opens filled in. The button sits at that side\'s end', where: 'Both ends of the top bar' },
      { mark: g.icons.more, name: 'More', meaning: 'Less frequent actions (template · View PDF · Export · Delete …)', where: 'Note toolbar' },
      { mark: <>{g.icons.up}{g.icons.down}</>, name: 'Order', meaning: 'Move one place up or down', where: 'Authors to export' },
      { mark: g.icons.reopen, name: 'Reopen', meaning: 'A blocked note back to In progress, a finished question back to waiting', where: 'Work panel, Records' },
      { mark: g.icons.spark, name: 'Ask Claude', meaning: 'Send a record as a question for Claude on this Mac to answer. Sparkles are used only for things Claude does', where: 'Top right of a record row' },
      { mark: g.icons.search, name: 'Search', meaning: 'Find by name across the whole app (/ key)', where: 'Right of the top bar' },
      { mark: g.icons.approve, name: 'Approve', meaning: 'The result is right', where: 'Decisions in Records › Your turn' },
      { mark: g.icons.sendBack, name: 'Revise', meaning: 'Not right; send it back to be done again (not deleted)', where: 'Decisions in Records › Your turn' },
      { mark: <><span className="star-ico on">{g.icons.star}</span> <span className="star-ico">{g.icons.star}</span></>, name: 'Favorite', meaning: 'Show first (filled star) / unset (empty star)', where: 'Cards, topics, people' },
    ],
  },
  {
    title: 'Record marks', note: 'Marks that are not clicked.',
    rows: [
      { mark: g.icons.check, name: 'Done and reviewed', meaning: 'Compile succeeded, concept note reviewed, feedback approved, to-do finished (neutral). Solved as a research status is a teal dot, not ✓', where: 'Compile result, concept notes, feedback, calendar' },
      { mark: '!', name: 'Error', meaning: 'Failed (red). Used only for this', where: 'Compile result' },
      { mark: g.icons.flag, name: 'Deadline', meaning: 'A to-do\'s deadline (orange, your turn)', where: 'Home calendar, Records calendar' },
      { mark: g.icons.unchecked, name: 'Not reviewed', meaning: 'A concept note not reviewed yet', where: 'Concept notes' },
      { mark: '—', name: 'Axiom/definition', meaning: 'A statement with nothing to prove', where: 'Statements' },
      { mark: g.icons.pencil, name: 'Edited', meaning: 'A record that a note was edited', where: 'Home calendar' },
      { mark: g.icons.swap, name: 'Status changed', meaning: 'A record that a status changed', where: 'Home calendar, Records calendar' },
      { mark: '→ ›', name: 'Open/go', meaning: 'Go to that screen', where: 'Links' },
      { mark: '∎', name: 'End of proof', meaning: 'Where a proof ends', where: 'Concept note body' },
      { mark: g.icons.claude, name: 'Written by Claude', meaning: 'A record or answer Claude wrote (grey mark before the name, not clickable). Other agents show the name only', where: 'Top line of a record row, record conversation, "Answer · author" in the right sidebar and PDF comments' },
      { mark: <span className="turn-dot" />, name: 'Your turn (agent question)', meaning: 'An agent asked and waits for your answer (orange dot and border; orange paint in the note body)', where: 'Record rows, note body' },
      { mark: '2', name: 'Your-turn count', meaning: 'How many things you need to look at (always one orange pill shape)', where: 'Rail, Records and Edit review in the left sidebar, feedback filter, Your turn in Records, library Check' },
    ],
  },
]
