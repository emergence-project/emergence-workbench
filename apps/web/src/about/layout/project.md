---
id: project
kind: reference
title: { ko: 프로젝트, en: Projects }
ui: 정의
summary:
  ko: 연구 하나와 그 저장소의 짝입니다. 주제 › 노트, 원고 · 참고 자료, 기록 · 맡긴 일, 흐름을 담고, 앱이 남기는 것은 그 저장소의 workbench/에 있습니다.
  en: One piece of research paired with its repository. It holds topics › notes, manuscripts and reference materials, records and delegated tasks, and flows; what the app keeps lives in that repository's workbench/.
figure: DocKindsTable
was: [layout/terms, principles/definitions]
prs: [277, 300, 427, 473]
---
<!-- ko -->
- **정의** — 연구 하나. 그 연구의 GitHub 저장소와 짝이고, 성격은 연구 · 업무 둘입니다. 레일의 프로젝트 단추와 홈에서 엽니다.
- **하위 요소**
  - **저장소** (레일 › 저장소) — 프로젝트와 짝인 GitHub 저장소. 맥의 폴더는 그 사본이고, 저장소 화면에서 GitHub와 같은지 보고 동기화합니다.
  - **주제** (왼쪽 사이드바 › 주제) — 프로젝트 안의 소주제. 노트를 묶기만 하고 자기 본문은 없으며, 주제 안에 주제를 두지 않습니다. 노트는 첫 주제의 폴더 안에 있고, 다른 주제에도 들면 노트 머리말(`note.yaml` `topics:`)에 더 적습니다. 첫 주제를 바꾸면 앱이 폴더를 옮깁니다(10/13). 주제가 없는 노트는 "노트들"에 모입니다.
  - **노트** (주제 › 노트 나무, 열면 주 패널) — 주제 안에서 완결된 최소 단위 문서. 예전의 연구노트 · 계산 노트 · 주장 하나의 노트를 모두 노트라 부르고, 모두 같은 노트 폴더 형식입니다. 원고 · 개념노트 · 문헌노트는 따로입니다.
  - **진술** (노트 본문의 카드) — 번호 붙은 정의 · 정리 카드. 노트가 그 증명을 맡습니다.
  - **원고** (왼쪽 사이드바 › 자료) — 결과를 모으는 개인 초고. 개인 연구와 초고까지 쓰고, 공동 집필 · 투고는 Overleaf에 둡니다.
  - **참고 자료** (왼쪽 사이드바 › 자료) — 실제로 가진 PDF · 파일. 노트가 인용한 논문 정보(bib)와 논문 라이브러리의 PDF는 따로 봅니다.
  - **기록** (왼쪽 사이드바 › 기록 · 오른쪽 사이드바) — 메모 · 할 일 · 질문 · 지시를 대상(이 프로젝트 · 노트 · 주제)별로 모아 보고 적습니다. 맡긴 일과 작업 일지도 여기서 보고, 내 차례에는 맡긴 일의 판단 · 에이전트의 질문 · 흐름 결정 · 수정 검토가 모입니다.
  - **맡긴 일** (기록 › 맡긴 일) — 에이전트에게 맡긴 계산 · 유도 · 대조 하나. 종결 조건을 적고 맡기면 에이전트가 그 파일을 보고서로 채우고, 사용자가 내 차례에서 승인하거나 반려합니다(멈춤 · 폐기도 고름). 흐름에 매이지 않은 일 하나로 끝나고 사용자가 결과를 직접 판단한다는 점이 흐름의 시도와 다릅니다.
  - **흐름** (왼쪽 사이드바 › 흐름, 설정 › 기능에서 설치) — 예 · 아니오로 답할 수 있는 질문 하나와 그 아래의 주장 · 시도. 사용자가 메시지(답이 예일 때와 아니오일 때 쓸 한 문장씩)와 독자를 써야 시작되고, 답(예 · 아니오 · 답 없음)을 골라 닫습니다.
  - **주장** (흐름 차트의 점) — 흐름 안에서 판단할 수 있는 한 문장(진술)과 그 문장이 성립하는 범위(조건). 상태는 적지 않고 근거인 시도의 판정에서 계산합니다.
  - **시도** (흐름 › 주장 아래) — 주장(없으면 질문)을 겨눈 방법 하나. 주장의 근거입니다. 후보를 먼저 늘어놓고 차례로 해 보며, 작업한 쪽이 아닌 쪽이 성립 · 폐기를 판정합니다. 한도에 닿거나 폐기가 셋 이어지면 에이전트가 방향 보고를 내고 사용자가 계속할지 정합니다.
- **저장 위치** — 연구 저장소의 `workbench/`(작업대 정보). 프로젝트 정보와 주제 순서 `research.yaml`, 주제와 그 노트 `topics/<주제>/`(주제 없는 노트 `notes/`), 기록 `comments/`, 맡긴 일 `tasks/`, 일지 `log/`, 흐름 `problems/`, 그림 `figures/`. 원고는 저장소 안 어디든 두고 `research.yaml` `sources`에 적습니다. 형식은 `docs/repo-format.md` §1–8 · §16.
- **자세히** — [프로젝트 화면](#/about/project) · [노트](#/about/notes) · [참고 자료와 논문 읽기](#/about/reading)

<!-- en -->
- **Definition**: one piece of research, paired with its GitHub repository; its kind is Research or Work. Open it from its rail button or from Home.
- **Parts**
  - **Repository** (Rail › Repositories): the GitHub repository paired with a project. The folder on the Mac is a copy; the Repositories screen shows whether it matches GitHub and syncs it.
  - **Topic** (Left sidebar › Topics): a subtopic inside a project. It only groups notes and has no body of its own, and topics are not nested. A note lives in the folder of its first topic; further topics go in its front matter (`note.yaml` `topics:`). Changing the first topic makes the app move the folder (10/13). Notes without a topic gather under "Loose notes".
  - **Note** (Topic › note tree, opens in the main pane): the smallest self-contained document inside a topic. Former research notes, calculation notes and single-claim notes are all notes now, in one note folder format. Manuscripts, concept notes and literature notes are separate.
  - **Statement** (Cards in a note body): a numbered definition or theorem card. A note carries its proof.
  - **Manuscript** (Left sidebar › Materials): a personal draft that gathers results, up to a first draft; co-writing and submission happen in Overleaf.
  - **Reference materials** (Left sidebar › Materials): PDFs and files you actually have. Paper details a note cites (bib) and PDFs in the paper library are seen separately.
  - **Records** (Left sidebar › Records · right sidebar): memos, to-dos, questions and instructions grouped by what they are about (this project, notes, topics). Delegated tasks and the work journal are here too, and Your turn gathers tasks to decide, agent questions, flow decisions and edit reviews.
  - **Delegated task** (Records › Delegated tasks): one calculation, derivation or comparison handed to an agent. You write completion criteria, the agent fills the file as its report, and you approve it or send it back in Your turn (or mark it Blocked or Dropped). Unlike an attempt, it is one piece of work not tied to a flow, and you judge its result directly.
  - **Flow** (Left sidebar › Flow, installed in Settings › Features): one yes-or-no question and the claims and attempts under it. It starts only when you write its message (one sentence for a yes and one for a no) and its reader, and you close it by picking Yes, No or No answer.
  - **Claim** (A dot on the flow chart): one sentence inside a flow that can be judged (the statement) and where it holds (the condition). Its status is not written but computed from the verdicts on the attempts that ground it.
  - **Attempt** (Flow › under a claim): one method aimed at a claim (or at the question). Attempts are a claim's grounds. Candidates are listed first and tried in turn, and the side that did not do the work judges holds or drop. At the limit, or after three drops in a row, the agent files a direction report and you decide whether to continue.
- **Where it is stored**: the research repository's `workbench/` (workbench data). Project info and topic order in `research.yaml`, topics and their notes in `topics/<topic>/` (loose notes in `notes/`), records in `comments/`, delegated tasks in `tasks/`, the journal in `log/`, flows in `problems/`, figures in `figures/`. A manuscript can sit anywhere in the repository and is listed in `research.yaml` `sources`. Format: `docs/repo-format.md` §1–8, §16.
- **In detail**: [Project screen](#/about/project) · [Notes](#/about/notes) · [Reference materials and reading papers](#/about/reading)
