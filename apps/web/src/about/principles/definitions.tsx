import { DocKindsTable, DocMapFigure } from '../../aboutFigures'
import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › principles › 정의. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '정의', prs: [277, 300, 427, 473],
  figure: <><DocMapFigure /><DocKindsTable /></>,
  items: [
    { text: <><b>프로젝트</b> — 연구 하나. 그 연구의 저장소와 짝입니다. 성격은 연구 · 업무 둘입니다.</> },
    { text: <><b>주제</b> — 프로젝트 안의 소주제. 노트를 묶기만 하고 자기 본문은 없으며, 주제 안에 주제를 두지 않습니다. 노트는 첫 주제의 폴더 안에 있고, 다른 주제에도 들면 노트 머리말({c('note.yaml')} {c('topics:')})에 더 적습니다. 첫 주제를 바꾸면 앱이 폴더를 옮깁니다(10/13). 주제가 없는 노트는 "노트들"에 모입니다.</> },
    { text: <><b>노트</b> — 주제 안에서 완결된 최소 단위 문서. 예전의 연구노트 · 계산 노트 · 주장 하나의 노트를 모두 노트라 부르고, 모두 같은 노트 폴더 형식입니다(블록 노트 {c('workbench/blocks/')}는 2026-10-27에 노트 폴더로 옮기고 없앰). 원고 · 개념노트 · 문헌노트는 따로입니다.</> },
    { text: <><b>진술</b> — 번호 붙은 정의·정리 카드. 노트가 그 증명을 맡습니다.</> },
    { text: <><b>참고 자료</b> — 실제로 가진 PDF·파일. 노트가 인용한 논문 정보(bib)와 논문 라이브러리의 PDF는 따로 봅니다.</> },
    { text: <><b>흐름</b> — 예 · 아니오로 답할 수 있는 질문 하나와 그 아래의 주장 · 시도. 왼쪽 사이드바 "흐름"에서 새 연구 일을 합니다. 사용자가 메시지(답이 예일 때와 아니오일 때 쓸 한 문장씩)와 독자를 써야 시작되고, 답(예 · 아니오 · 답 없음)을 골라 닫습니다. 흐름 하나에 폴더 하나({c('workbench/problems/')})입니다.</> },
    { text: <><b>주장</b> — 흐름 안에서 판단할 수 있는 한 문장(진술)과 그 문장이 성립하는 범위(조건). 흐름 차트의 점 하나가 주장 하나이고, 상태는 적지 않고 근거인 시도의 판정에서 계산합니다.</> },
    { text: <><b>시도</b> — 주장(없으면 질문)을 겨눈 방법 하나. 주장의 근거입니다. 후보를 먼저 늘어놓고 차례로 해 보며, 작업한 쪽이 아닌 쪽이 성립 · 폐기를 판정합니다. 시작한 시도가 한도에 닿거나 폐기가 셋 이어지면 에이전트는 방향 보고를 내고 사용자가 계속할지 정합니다.</> },
    { text: <><b>기록</b> — 왼쪽 사이드바 "기록". 프로젝트의 메모 · 할 일 · 질문 · 지시를 대상(이 프로젝트 · 노트 · 주제)별로 모아 보고 적고, 맡긴 일과 지난 일을 쌓는 작업 일지도 여기서 봅니다. 내 차례에는 맡긴 일의 판단, 에이전트의 질문, 흐름 결정, 수정 검토가 모입니다. 오른쪽 사이드바 기록의 "기록 탭에서 보기 ›"도 여기로 옵니다.</> },
    { text: <><b>맡긴 일</b> — 에이전트에게 맡긴 계산 · 유도 · 대조 하나. 종결 조건을 적고 맡기면 에이전트가 그 파일을 보고서로 채우고, 사용자가 기록 › 내 차례에서 승인하거나 반려합니다(멈춤 · 폐기도 고름). 흐름의 시도와 다른 점: 맡긴 일은 흐름에 매이지 않은 일 하나로 끝나고 사용자가 결과를 직접 판단합니다. 시도는 흐름의 한 주장을 겨누고, 그 판정이 주장의 근거로 쌓여 질문의 답에 이어집니다. 질문에 답하려는 일은 흐름의 시도로, 따로 떨어진 계산 하나는 맡긴 일로 맡깁니다.</> },
    { text: <><b>작업대 정보</b> — 앱이 연구 저장소의 {c('workbench/')}에 남기는 것(프로젝트 정보와 주제, 노트, 흐름, 맡긴 일, 일지, 기록, 그림).</> },
  ],
}

export const en: AboutSection = {
  title: 'Definitions',
  figure: <><DocMapFigure /><DocKindsTable /></>,
  items: [
    { text: <><b>Project</b>: one piece of research, paired with its repository. Its kind is either Research or Work.</> },
    { text: <><b>Topic</b>: a subtopic inside a project. It only groups notes and has no body of its own, and topics are not nested. A note lives in the folder of its first topic; if it belongs to more topics, they are added in the note's front matter ({c('note.yaml')} {c('topics:')}). Changing the first topic makes the app move the folder (10/13). Notes without a topic gather under "Loose notes".</> },
    { text: <><b>Note</b>: the smallest self-contained document inside a topic. What used to be research notes, calculation notes and single-claim notes are all called notes now, and all use the same note folder format (block notes in {c('workbench/blocks/')} were moved into note folders and removed on 2026-10-27). Manuscripts, concept notes and literature notes are separate.</> },
    { text: <><b>Statement</b>: a numbered definition or theorem card. A note carries its proof.</> },
    { text: <><b>Reference materials</b>: PDFs and files you actually have. Paper details a note cites (bib) and PDFs in the paper library are seen separately.</> },
    { text: <><b>Flow</b>: one question with a yes or no answer, and the claims and attempts under it. New research work happens in "Flow" in the left sidebar. A flow starts only when you write its message (one sentence each for a yes and a no answer) and its reader, and you close it by picking an answer (Yes, No or No answer). One flow is one folder ({c('workbench/problems/')}).</> },
    { text: <><b>Claim</b>: one sentence inside a flow that can be judged (the statement) and where it holds (the condition). One dot on the flow chart is one claim; its status is not written but computed from the verdicts on the attempts that ground it.</> },
    { text: <><b>Attempt</b>: one method aimed at a claim (or at the question when there is none). Attempts are a claim's grounds. Candidates are listed first and tried in turn, and the side that did not do the work judges holds or drop. When started attempts reach the limit or three in a row are dropped, the agent files a direction report and you decide whether to continue.</> },
    { text: <><b>Records</b>: "Records" in the left sidebar. The project's memos, to-dos, questions and instructions grouped by what they are about (this project, notes, topics), plus delegated tasks and the work journal that collects what was done. Your turn gathers delegated tasks to decide, agent questions, flow decisions and edit reviews. "Open in Records ›" in the right sidebar's records comes here.</> },
    { text: <><b>Delegated task</b>: one calculation, derivation or comparison handed to an agent. You write completion criteria when delegating, the agent fills the file as its report, and you approve it or send it back for revision in Records › Your turn (or mark it Blocked or Dropped). How it differs from an attempt in a flow: a delegated task is one piece of work not tied to a flow, and you judge its result directly. An attempt aims at one claim of a flow, and its verdict adds to that claim's grounds toward the flow's answer. Work meant to answer a question goes in a flow as an attempt; a standalone calculation goes out as a delegated task.</> },
    { text: <><b>Workbench data</b>: what the app keeps in a research repository's {c('workbench/')} (project info and topics, notes, flows, delegated tasks, journal, records, figures).</> },
  ],
}
