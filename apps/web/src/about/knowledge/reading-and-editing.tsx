import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › knowledge › 읽기와 고치기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '읽기와 고치기', prs: [70, 81, 169],
  items: [
    { text: <>기본은 읽기 화면입니다. 툴바 "고치기"를 누르면 Obsidian처럼 바로 보이는 편집기가 열리고(바로 보기 · 원문 | 미리보기), 줄 맨 앞이나 띄어쓰기 뒤의 "/" 또는 ⌘K로 명령 메뉴, "[["로 개념, "[@"로 출처를 찾습니다. 고치는 동안 저절로 저장되고, ⌘S는 바로 저장한 뒤 편집을 이어 갑니다. 마칠 때는 "편집 완료"(Esc)입니다.</> },
    { text: <>노트마다 "고치기 잠금"이 있어 잠긴 노트는 앱도 에이전트도 고치지 않습니다.</> },
    { text: <>본문에는 연구와 무관한 개념 내용(정의, 성질과 증명)만 둡니다. 연구에 딸린 질문, 주요 참고 문헌, 작업 지침은 본문 밖 <b>기록</b>에 둡니다.</> },
    { text: <>오른쪽 사이드바 <b>기록</b>은 프로젝트 노트의 기록과 같습니다(10/18): 종류 고르기(전체 · 메모 · 할 일 · 질문 · 지시), 진행 중 | 완료, 기록 줄, 아래 입력란. 본문에서 글을 고르면 하이라이트하거나 기록을 달고, 기록 줄 아래 왼쪽에는 붙은 절 이름(가리키면 줄 번호)이 보여 누르면 본문의 그 자리로 갑니다. 지시는 맥의 Claude가 라이브러리 폴더에서 합니다. 기록은 라이브러리 {c('workbench/comments/concept-<id>.md')}에 남고 연구 저장소 기록처럼 저절로 올라갑니다.</> },
    { text: <><b>기본 양식</b>: 본문과 절 이름은 영어로 쓰고, 첫 절은 {c('## Definition')}(모형 · 정리는 {c('## Model')} · {c('## Statement')}도 됨)으로 이 개념이 무엇인지 한두 문장 말합니다. 그다음 {c('## Properties')}(성질마다 바로 아래 {c('**Proof.** … ∎')}, 읽기 화면에서 접힘) · {c('## Examples')}, 필요하면 {c('## Remarks')}입니다. "/" 명령의 "개념노트 틀"이 이 틀을 넣습니다. 규칙의 정본은 공유 라이브러리 {c('README.md')}입니다.</> },
    { text: <>오른쪽 사이드바 정보에는 "이 개념을 쓰는 개념", "이 노트가 가리키는 개념"이 있습니다. 출처는 {c('[@키]')}로 적어 본문에 [1]처럼 보이고 본문 아래 출처 목록으로 이어집니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Reading and editing',
  items: [
    { text: <>The reading view is the default. Pressing "Edit" in the toolbar opens a live editor like Obsidian (Live preview · Source | Preview); "/" at the start of a line or after a space, or ⌘K, opens the command menu, "[[" finds concepts and "[@" finds sources. Edits save on their own; ⌘S saves right away and keeps editing. Finish with "Done" (Esc).</> },
    { text: <>Each note has an "edit lock"; locked notes are not edited by the app or by agents.</> },
    { text: <>The body holds only concept content unrelated to any research (definitions, properties and proofs). Questions tied to a research project, key references and working instructions go in <b>records</b> outside the body.</> },
    { text: <>The right sidebar's <b>Records</b> works like project note records (10/18): kind choice (All · Memo · To-do · Question · Instruction), In progress | Done, record rows and the input below. Select text in the body to highlight it or attach a record; the lower left of a record row shows the section it is attached to (hover for the line number) and takes you to that spot. Instructions are carried out by Claude on this Mac in the library folder. Records are kept in the library's {c('workbench/comments/concept-<id>.md')} and pushed on their own like research-repo records.</> },
    { text: <><b>Default template</b>: the body and section names are in English. The first section, {c('## Definition')} ({c('## Model')} or {c('## Statement')} for a model or theorem), says in a sentence or two what the concept is. Then come {c('## Properties')} (each followed by its {c('**Proof.** … ∎')}, folded in the reading view) and {c('## Examples')}, and {c('## Remarks')} when needed. The "Concept note template" command under "/" inserts this. The rules live in the shared library's {c('README.md')}.</> },
    { text: <>The right sidebar's Info has "Concepts that use this concept" and "Concepts this note points to". Sources are written as {c('[@key]')}, show in the body like [1], and lead to the source list below the body.</> },
  ],
}
