import { DocKindsTable, DocMapFigure } from '../../aboutFigures'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › principles › 정의. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '정의',
  figure: <><DocMapFigure /><DocKindsTable /></>,
  items: [
    { text: <><b>프로젝트</b> — 연구 하나. 그 연구의 저장소와 짝입니다. 성격은 연구 · 업무 둘입니다.</> },
    { text: <><b>주제</b> — 프로젝트 안의 소주제. 노트를 묶기만 하고 자기 본문은 없으며, 주제 안에 주제를 두지 않습니다. 노트는 여러 주제에 들 수 있고, 소속은 폴더가 아니라 노트 머리말에 적습니다. 주제가 없는 노트는 "노트들"에 모입니다.</> },
    { text: <><b>노트</b> — 주제 안에서 완결된 최소 단위 문서. 예전의 연구노트 · 계산 노트 · 주장 하나의 노트를 모두 노트라 부르고, 모두 같은 노트 폴더 형식입니다(블록 노트 {c('workbench/blocks/')}는 2026-10-27에 노트 폴더로 옮기고 없앰). 원고 · 개념노트 · 문헌노트는 따로입니다.</> },
    { text: <><b>진술</b> — 번호 붙은 정의·정리 카드. 노트가 그 증명을 맡습니다.</> },
    { text: <><b>참고 자료</b> — 실제로 가진 PDF·파일. 노트가 인용한 논문 정보(bib)와 논문 라이브러리의 PDF는 따로 봅니다.</> },
    { text: <><b>작업</b> — 에이전트에게 맡긴 일의 판단 · 맡긴 일과, 지난 일을 쌓는 작업 일지.</> },
    { text: <><b>기록</b> — 프로젝트의 메모 · 할 일 · 질문 · 지시를 대상(이 프로젝트 · 노트 · 주제 · 흐름 점)별로 모아 보고 적습니다. 오른쪽 사이드바 기록의 "모두 보기 ›"도 여기로 옵니다.</> },
    { text: <><b>맡긴 일</b> — 에이전트에게 맡긴 계산·유도·대조 하나. 종결 조건을 적고 맡기며, 결과를 사용자가 판단합니다.</> },
    { text: <><b>작업대 정보</b> — 앱이 연구 저장소의 {c('workbench/')}에 남기는 것(프로젝트 정보와 주제, 노트, 맡긴 일, 일지, 기록, 그림).</> },
  ],
}

export const en: AboutSection = {
  title: 'Definitions',
  figure: <><DocMapFigure /><DocKindsTable /></>,
  items: [
    { text: <><b>Project</b>: one piece of research, paired with its repository. Its kind is either Research or Work.</> },
    { text: <><b>Topic</b>: a subtopic inside a project. It only groups notes and has no body of its own, and topics are not nested. A note can belong to several topics, and its membership is written in the note's front matter, not by folder. Notes without a topic gather under "Loose notes".</> },
    { text: <><b>Note</b>: the smallest self-contained document inside a topic. What used to be research notes, calculation notes and single-claim notes are all called notes now, and all use the same note folder format (block notes in {c('workbench/blocks/')} were moved into note folders and removed on 2026-10-27). Manuscripts, concept notes and literature notes are separate.</> },
    { text: <><b>Statement</b>: a numbered definition or theorem card. A note carries its proof.</> },
    { text: <><b>Reference materials</b>: PDFs and files you actually have. Paper details a note cites (bib) and PDFs in the paper library are seen separately.</> },
    { text: <><b>Work</b>: decisions and delegated tasks for work handed to agents, plus the work journal that collects what was done.</> },
    { text: <><b>Records</b>: the project's memos, to-dos, questions and instructions grouped by what they are about (this project, notes, topics, flow dots). "See all ›" in the right sidebar's records comes here.</> },
    { text: <><b>Delegated task</b>: one calculation, derivation or comparison handed to an agent. You write completion criteria when delegating, and you decide on the result.</> },
    { text: <><b>Workbench data</b>: what the app keeps in a research repository's {c('workbench/')} (project info and topics, notes, delegated tasks, journal, records, figures).</> },
  ],
}
