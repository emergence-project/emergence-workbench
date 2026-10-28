import { NoteToolbarFigure } from '../../aboutFigures'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › notes › 노트 화면. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '노트 화면', prs: [104, 113, 122, 123, 143, 187, 194, 197, 305],
  figure: <NoteToolbarFigure />,
  items: [
    { text: <>모든 노트는 같은 화면입니다. 위에서부터 상단바 › 탭 바 › <b>노트 툴바</b> › 본문입니다. 읽을 때 본문 머리에는 제목, 맨 아래에는 인용한 논문이 있습니다. 상태는 툴바 왼쪽에 둡니다.</> },
    { text: <>읽는 중 툴바는 <b>왼쪽 상태</b>, <b>오른쪽 저장 상태 · 코멘트 · 연필 · ▶ · ⋯</b>입니다. 코멘트(말풍선)는 오른쪽 사이드바를 기록으로 열고, ▶는 컴파일한 PDF를 옆 패널에 엽니다. ⋯에는 PDF 보기 · 파일 다시 읽기 · Finder에서 보기가 있고, 폴더 노트에서는 서식 고르기 · 내보내기 · 지우기도 합니다.</> },
    { text: <>연필을 누르면 제목 입력란이 툴바로 올라옵니다. 고치는 중에는 <b>왼쪽 제목 입력란과 상태</b>, <b>가운데 원문 · 원문 | 미리보기 · 바로 보기</b>, <b>오른쪽 저장 상태와 "편집 완료"</b>입니다. Markdown 본문은 편집기로 바뀌고 저절로 저장됩니다. "편집 완료"(Esc)으로 마칩니다. LaTeX 본문은 늘 편집기이고, 연필로는 이름을 고칩니다.</> },
    { text: <>원문 보기(원문 · 원문 | 미리보기)에서는 수식마다 회색 바탕이 깔리고, 여는 · 닫는 기호가 종류마다 다른 색입니다: <code>$</code> 파랑, <code>\(</code> 청록, <code>$$</code> 주황, <code>\[</code> 보라. 짝이 없는 기호는 빨강 물결 밑줄입니다.</> },
    { text: <>저장 상태("저장됨 · 3분 전")는 늘 오른쪽 행동 바로 왼쪽입니다. 좁아지면 시각부터 숨기고, 연필이나 "편집 완료"을 가리키면 봅니다. 저장 중 · 충돌 · 실패와 해결 버튼은 숨기지 않습니다. PDF가 노트보다 오래되었으면 "PDF는 이전 결과"도 붙습니다.</> },
    { text: <><b>오른쪽 사이드바</b>(상단바 맨 오른쪽 버튼)는 정보 · 기록입니다. 기록에서 메모 · 할 일 · 질문 · 지시를 남기고, 처음 종류인 자동은 분류 전 메모로 남습니다. 노트에서 질문으로 "이렇게 고쳐 줘"라고 적으면 이 맥의 Claude(읽기만)가 바꿀 글과 바꾼 글을 답에 적고, "노트에 적용"을 누르면 앱이 노트에서 그 글만 바꿉니다(바꿀 글이 노트에 꼭 한 곳 있을 때만). 노트를 열지 않았을 때는 프로젝트에 적고, 프로젝트의 노트 기록도 함께 봅니다. 주제 화면에서는 그 주제에, 흐름 화면에서는 모든 흐름 점의 기록이 점별로 묶여 한 목록에 보이고(점 이름을 누르면 그 점으로), 점을 고른 채 적으면 그 점에 붙고, 적기 칸 아래 줄의 "남길 곳"이 어디에 남는지 보입니다(지금 보고 있는 화면으로 정해지고 따로 고르지 않습니다). 과녁 단추(가리키기)를 누른 뒤 화면 한 곳을 누르면 피드백 모드처럼 그 부위 이름과 글자가 기록에 붙습니다(Esc 취소). 본문을 고칠 때도 사이드바는 그대로 열려 있습니다.</> },
    { text: <>정보에는 상태와 다시 열 조건, 성격(고르기), 주제(태그, 첫 번째가 주 주제; 더하기 · 빼기 · ↑ 위로), 설명(여러 줄, "- " 목록, 200자), 본문에 쓴 개념노트, 이 노트를 인용한 노트(5개까지, 나머지는 "N개 더 보기"), 맨 아래 파일 이름(가리키면 전체 경로)이 있습니다. 두 목록은 본문의 {c('[[링크]]')}에서 앱이 모읍니다. 주장 하나의 노트는 증명할 진술 · 기대는 노트 · 다른 방법 · 다음 할 일도 여기서 고칩니다.</> },
    { text: <>노트는 늘 왼쪽 패널에 열고, 그 노트의 PDF가 이미 있을 때만 오른쪽 패널에 함께 엽니다. 없으면 노트가 패널 하나 전체로 열리고, 컴파일하면 오른쪽에 PDF가 열립니다. 탭과 배치는 기억하지만, 예전에 고른 노트 · PDF를 다시 열지는 않습니다.</> },
    { text: <>컴파일은 프로젝트 서식을 기본값으로 바로 합니다. ▶ 옆에서 서식 · 저자(넣기 · 넣지 않음, 넣으면 순서) · 날짜(없음 · 오늘 · 지정)를 바꾸거나 기본값으로 되돌리고, 고른 것은 프로젝트마다 기억합니다. 내보내기도 같은 "내보내기 설정" 상자를 엽니다(원고는 저자 넣기, 노트는 넣지 않음이 처음 값).</> },
    { text: <>컴파일 설정의 <b>기록 넣기</b>(처음엔 끔, 진행 중만 · 완료도)를 켜면 그 노트의 기록이 PDF 주석으로 들어갑니다: 고른 글은 하이라이트(누르면 기록 글과 답), 고른 글이 표시 수식 · 제목에 걸치거나 고른 글이 없는 기록은 그 자리 쪽지. 노트 파일은 바뀌지 않고, 미리보기 · Acrobat에서 열어도 보입니다. 하이라이트는 XeLaTeX로 컴파일할 때만이고, 본문만 있는 노트에만 넣습니다. 기록을 넣고 PDF를 만들지 못하면 기록 없이 다시 만들고 알립니다(오류가 있어도 PDF를 만들었으면 그대로 둡니다).</> },
    { text: <>내보내기는 노트마다 하거나, 원고 화면에서 여러 개를 골라 한 번에 합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Note screen',
  figure: <NoteToolbarFigure />,
  items: [
    { text: <>Every note uses the same screen. From the top: top bar › tab bar › <b>note toolbar</b> › body. While reading, the body starts with the title and ends with the cited papers. Status sits at the left of the toolbar.</> },
    { text: <>While reading, the toolbar has <b>status on the left</b> and <b>save status · Comment · pencil · ▶ · ⋯ on the right</b>. Comment (speech bubble) opens the right sidebar on Records, and ▶ opens the compiled PDF in the side pane. ⋯ has View PDF · Reload file · Show in Finder, and for folder notes also choose template · Export · Delete.</> },
    { text: <>Pressing the pencil brings a title input up into the toolbar. While editing, the toolbar has <b>the title input and status on the left</b>, <b>Source · Source | Preview · Live preview in the middle</b>, and <b>save status and "Done" on the right</b>. The Markdown body turns into an editor and saves on its own. Finish with "Done" (Esc). A LaTeX body is always an editor, and the pencil edits the name.</> },
    { text: <>In the source views (Source · Source | Preview) each formula gets a grey background, and its opening and closing delimiters are coloured by kind: <code>$</code> blue, <code>\(</code> teal, <code>$$</code> orange, <code>\[</code> purple. A delimiter with no partner gets a red wavy underline.</> },
    { text: <>Save status ("Saved · 3 min ago") always sits just left of the actions on the right. When space is tight the time hides first; hover the pencil or "Done" to see it. Saving, conflict and failure states and their fix buttons never hide. If the PDF is older than the note, "PDF is from before" is added.</> },
    { text: <>The <b>right sidebar</b> (the button at the far right of the top bar) has Info and Records. In Records you leave memos, to-dos, questions and instructions; the first kind, Auto, saves as an unsorted memo. If you write a question in a note such as "change it like this", Claude on this Mac (read only) answers with the text to replace and the replacement, and pressing "Apply to note" makes the app replace just that text in the note (only when that text appears exactly once in the note). When no note is open, entries go to the project, and the project's note records show as well. On a topic screen they go to that topic, and on the flow screen to the selected dot (the list there shows the records of every flow dot, grouped by dot; click a dot name to go to it); "Saved to" on the row below the input shows where (it follows the screen you are on; there is nothing to choose). After the target button (Point), click a part of the screen and its name and text attach to the record, as in feedback mode (Esc cancels). The sidebar stays open while you edit the body.</> },
    { text: <>Info has status and reopen condition, kind (choose), topics (tags; the first is the main topic; Add · Remove · ↑ move up), description (multi-line, "- " lists, 200 characters), concept notes used in the body, notes that cite this note (up to 5; the rest under "Show N more"), and the file name at the bottom (hover for the full path). The two lists are gathered by the app from {c('[[links]]')} in the body. For a single-claim note, the statement it proves, the notes it relies on, other approaches and next steps are also edited here.</> },
    { text: <>A note always opens in the left pane, and its PDF opens in the right pane alongside only if it already exists. If not, the note fills the whole pane, and compiling opens the PDF on the right. Tabs and layout are remembered, but notes and PDFs chosen before are not reopened.</> },
    { text: <>Compile runs right away with the project template defaults. Next to ▶ you can change template, authors (include or not, and the order if included) and date (none · today · set) or reset them to defaults, and your choices are remembered per project. Export opens the same "Export settings" box (manuscripts start with authors included, notes without).</> },
    { text: <>Turn on <b>Include records</b> in the compile settings (off at first; open only · done too) to put the note's records into the PDF as annotations: selected text becomes a highlight (click it for the record and its answers), and records on display math or a heading, or without selected text, become a note at that place. The note file does not change, and they show in Preview and Acrobat too. Highlights need XeLaTeX, and records go only into body-only notes. If no PDF can be made with the records, it is made again without them and you are told (a PDF made despite errors is kept).</> },
    { text: <>Export one note at a time, or pick several on the manuscript screen and export them together.</> },
  ],
}
