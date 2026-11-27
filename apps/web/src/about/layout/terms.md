---
id: terms
kind: reference
title: { ko: 용어, en: Terms }
ui: 정의
summary:
  ko: 앱의 구성요소를 위계대로(프로젝트 › 주제 › 노트, 라이브러리 › 지식 · 논문 · 그림, 에이전트, 네트워킹, 피드백, 계정, 설정) 풀고, 어디서나 쓰는 상태와 차례를 덧붙입니다.
  en: The app's components in their hierarchy (project › topic › note, library › knowledge · papers · figures, agents, networking, feedback, account, settings), plus status and turns, which appear everywhere.
figure: [DocKindsTable, StatesTable, TurnFigure]
was: [principles/definitions, principles/status-and-turns]
prs: [277, 300, 427, 473]
---
<!-- ko -->
- **프로젝트** (레일 › 프로젝트들 · 홈) — 연구 하나. 그 연구의 저장소와 짝입니다. 성격은 연구 · 업무 둘입니다.
  - **저장소** (레일 › 저장소) — 프로젝트와 짝인 GitHub 저장소. 맥의 폴더는 그 사본이고, 저장소 화면에서 GitHub와 같은지 보고 동기화합니다.
  - **주제** (왼쪽 사이드바 › 주제) — 프로젝트 안의 소주제. 노트를 묶기만 하고 자기 본문은 없으며, 주제 안에 주제를 두지 않습니다. 노트는 첫 주제의 폴더 안에 있고, 다른 주제에도 들면 노트 머리말(`note.yaml` `topics:`)에 더 적습니다. 첫 주제를 바꾸면 앱이 폴더를 옮깁니다(10/13). 주제가 없는 노트는 "노트들"에 모입니다.
  - **노트** (주제 › 노트 나무, 열면 주 패널) — 주제 안에서 완결된 최소 단위 문서. 예전의 연구노트 · 계산 노트 · 주장 하나의 노트를 모두 노트라 부르고, 모두 같은 노트 폴더 형식입니다(블록 노트 `workbench/blocks/`는 2026-10-27에 노트 폴더로 옮기고 없앰). 원고 · 개념노트 · 문헌노트는 따로입니다.
  - **진술** (노트 본문의 카드) — 번호 붙은 정의·정리 카드. 노트가 그 증명을 맡습니다.
  - **원고** (왼쪽 사이드바 › 자료) — 결과를 모으는 개인 초고. 개인 연구와 초고까지 쓰고, 공동 집필 · 투고는 Overleaf에 둡니다.
  - **참고 자료** (왼쪽 사이드바 › 자료) — 실제로 가진 PDF·파일. 노트가 인용한 논문 정보(bib)와 논문 라이브러리의 PDF는 따로 봅니다.
  - **기록** (왼쪽 사이드바 › 기록 · 오른쪽 사이드바) — 프로젝트의 메모 · 할 일 · 질문 · 지시를 대상(이 프로젝트 · 노트 · 주제)별로 모아 보고 적고, 맡긴 일과 지난 일을 쌓는 작업 일지도 여기서 봅니다. 내 차례에는 맡긴 일의 판단, 에이전트의 질문, 흐름 결정, 수정 검토가 모입니다. 오른쪽 사이드바 기록의 "기록 탭에서 보기 ›"도 여기로 옵니다.
  - **맡긴 일** (기록 › 맡긴 일) — 에이전트에게 맡긴 계산 · 유도 · 대조 하나. 종결 조건을 적고 맡기면 에이전트가 그 파일을 보고서로 채우고, 사용자가 기록 › 내 차례에서 승인하거나 반려합니다(멈춤 · 폐기도 고름). 흐름의 시도와 다른 점: 맡긴 일은 흐름에 매이지 않은 일 하나로 끝나고 사용자가 결과를 직접 판단합니다. 시도는 흐름의 한 주장을 겨누고, 그 판정이 주장의 근거로 쌓여 질문의 답에 이어집니다. 질문에 답하려는 일은 흐름의 시도로, 따로 떨어진 계산 하나는 맡긴 일로 맡깁니다.
  - **흐름** (왼쪽 사이드바 › 흐름) — 예 · 아니오로 답할 수 있는 질문 하나와 그 아래의 주장 · 시도. 왼쪽 사이드바 "흐름"에서 새 연구 일을 합니다. 사용자가 메시지(답이 예일 때와 아니오일 때 쓸 한 문장씩)와 독자를 써야 시작되고, 답(예 · 아니오 · 답 없음)을 골라 닫습니다. 흐름 하나에 폴더 하나(`workbench/problems/`)입니다.
  - **주장** (흐름 차트의 점) — 흐름 안에서 판단할 수 있는 한 문장(진술)과 그 문장이 성립하는 범위(조건). 흐름 차트의 점 하나가 주장 하나이고, 상태는 적지 않고 근거인 시도의 판정에서 계산합니다.
  - **시도** (흐름 › 주장 아래) — 주장(없으면 질문)을 겨눈 방법 하나. 주장의 근거입니다. 후보를 먼저 늘어놓고 차례로 해 보며, 작업한 쪽이 아닌 쪽이 성립 · 폐기를 판정합니다. 시작한 시도가 한도에 닿거나 폐기가 셋 이어지면 에이전트는 방향 보고를 내고 사용자가 계속할지 정합니다.
  - **작업대 정보** (화면 밖, 연구 저장소의 `workbench/`) — 앱이 연구 저장소의 `workbench/`에 남기는 것(프로젝트 정보와 주제, 노트, 흐름, 맡긴 일, 일지, 기록, 그림).
- **라이브러리** — 프로젝트와 상관없이 여러 연구가 함께 쓰는 자료. 지식 · 논문 · 그림 셋이고, 레일에 하나씩 있습니다.
  - **지식 · 개념노트** (레일 › 지식) — 개념노트는 여러 연구가 다시 쓰는 지식 하나입니다. 지식 화면에서 찾고 읽고 고치며, 개념노트 사이의 링크를 그린 지식 지도와 책 · 강의의 장을 따라가는 공부도 여기 있습니다.
  - **논문 · 문헌노트** (레일 › 논문) — 라이브러리의 논문과 책, PDF. 문헌노트는 논문 하나의 정리입니다.
  - **그림** (레일 › 그림) — 노트에서 함께 쓰는 tikz · svg 그림.
- **에이전트** (레일 › 에이전트) — 일을 맡긴 코딩 에이전트와의 대화. 프로젝트마다 모아 보고, 허락이 필요한 일은 대화 안에서 묻습니다.
- **네트워킹** (레일 › 네트워킹) — 저자와 소속, 공동 연구자들. 내 저자 정보도 여기서 고칩니다.
- **피드백** (레일 › 피드백 · 상단바의 피드백 단추) — 앱을 쓰다 남기는 말(수정 · 질문 · 제안). 에이전트가 처리하고 내가 다시 답합니다.
- **계정** (레일 아래 계정 단추) — 앱에 로그인한 나. 이름 · 소속과 GitHub · Claude 계정을 이어 둡니다.
- **설정** (레일 맨 아래 톱니바퀴) — 앱 전체의 설정. 왼쪽 사이드바에서 부분을 고릅니다.
  - **기기 관리** (설정 › 기기 관리) — 앱을 쓰는 컴퓨터들과 로그인을 맡는 서버.
  - **기능** (설정 › 기능) — 아직 해 보는 중인 기능(지금은 흐름)을 이 컴퓨터에서 설치하거나 제거합니다.
- **상태** (어디서나 색 점) — 글자 기호가 아니라 색 점과 짧은 이름입니다. 노트 · 맡긴 일 · 프로젝트가 같은 색을 씁니다: 파랑 진행, 주황 멈춤, 회색 고리 폐기, 청록 해결(프로젝트는 완료).
- **차례** (어디서나 주황 수 · 점) — 지금 누가 볼 일인지. 주황은 "사용자 차례"이기도 합니다. 판단 대기 · 확인 필요처럼 내가 볼 것은 어디서나 주황 알약 수나 주황 점 하나의 모양이고, 에이전트를 기다리는 것은 무채색입니다.

<!-- en -->
- **Project** (Rail › Projects · Home): one piece of research, paired with its repository. Its kind is either Research or Work.
  - **Repository** (Rail › Repositories): the GitHub repository paired with a project. The folder on the Mac is a copy; the Repositories screen shows whether it matches GitHub and syncs it.
  - **Topic** (Left sidebar › Topics): a subtopic inside a project. It only groups notes and has no body of its own, and topics are not nested. A note lives in the folder of its first topic; if it belongs to more topics, they are added in the note's front matter (`note.yaml` `topics:`). Changing the first topic makes the app move the folder (10/13). Notes without a topic gather under "Loose notes".
  - **Note** (Topic › note tree, opens in the main pane): the smallest self-contained document inside a topic. What used to be research notes, calculation notes and single-claim notes are all called notes now, and all use the same note folder format (block notes in `workbench/blocks/` were moved into note folders and removed on 2026-10-27). Manuscripts, concept notes and literature notes are separate.
  - **Statement** (Cards in a note body): a numbered definition or theorem card. A note carries its proof.
  - **Manuscript** (Left sidebar › Materials): a personal draft that gathers results. It covers personal research up to a first draft; co-writing and submission happen in Overleaf.
  - **Reference materials** (Left sidebar › Materials): PDFs and files you actually have. Paper details a note cites (bib) and PDFs in the paper library are seen separately.
  - **Records** (Left sidebar › Records · right sidebar): The project's memos, to-dos, questions and instructions grouped by what they are about (this project, notes, topics), plus delegated tasks and the work journal that collects what was done. Your turn gathers delegated tasks to decide, agent questions, flow decisions and edit reviews. "Open in Records ›" in the right sidebar's records comes here.
  - **Delegated task** (Records › Delegated tasks): one calculation, derivation or comparison handed to an agent. You write completion criteria when delegating, the agent fills the file as its report, and you approve it or send it back for revision in Records › Your turn (or mark it Blocked or Dropped). How it differs from an attempt in a flow: a delegated task is one piece of work not tied to a flow, and you judge its result directly. An attempt aims at one claim of a flow, and its verdict adds to that claim's grounds toward the flow's answer. Work meant to answer a question goes in a flow as an attempt; a standalone calculation goes out as a delegated task.
  - **Flow** (Left sidebar › Flow): one question with a yes or no answer, and the claims and attempts under it. New research work happens in "Flow" in the left sidebar. A flow starts only when you write its message (one sentence each for a yes and a no answer) and its reader, and you close it by picking an answer (Yes, No or No answer). One flow is one folder (`workbench/problems/`).
  - **Claim** (A dot on the flow chart): one sentence inside a flow that can be judged (the statement) and where it holds (the condition). One dot on the flow chart is one claim; its status is not written but computed from the verdicts on the attempts that ground it.
  - **Attempt** (Flow › under a claim): one method aimed at a claim (or at the question when there is none). Attempts are a claim's grounds. Candidates are listed first and tried in turn, and the side that did not do the work judges holds or drop. When started attempts reach the limit or three in a row are dropped, the agent files a direction report and you decide whether to continue.
  - **Workbench data** (Outside the screen, in the research repository's `workbench/`): what the app keeps in a research repository's `workbench/` (project info and topics, notes, flows, delegated tasks, journal, records, figures).
- **Library**: material several projects share, whatever the project. It has three parts, Knowledge, Papers and Figures, each with its own place on the rail.
  - **Knowledge · concept notes** (Rail › Knowledge): a concept note is one piece of knowledge reused across projects. The Knowledge screen finds, reads and edits them; the knowledge map of links between concept notes and Study, which follows the chapters of books and lectures, are here too.
  - **Papers · literature notes** (Rail › Papers): papers, books and PDFs in the library. A literature note is a summary of one paper.
  - **Figures** (Rail › Figures): tikz and svg figures shared across notes.
- **Agents** (Rail › Agents): conversations with the coding agents you handed work to, gathered per project. Anything that needs permission is asked inside the conversation.
- **Networking** (Rail › Networking): authors, affiliations and collaborators. Your own author details are edited here too.
- **Feedback** (Rail › Feedback · Feedback button in the top bar): what you leave while using the app (fix · question · suggestion). An agent handles it and you answer back.
- **Account** (account button below the rail): you, signed in to the app. Your name and affiliation, and your GitHub and Claude accounts, are linked here.
- **Settings** (gear at the bottom of the rail): settings for the whole app. Pick a part in the left sidebar.
  - **Devices** (Settings › Devices): the computers you use the app on, and the server that handles sign-in.
  - **Features** (Settings › Features): install or remove features still being tried (now Flow) on this computer.
- **Status** (Colored dots everywhere): a colored dot and a short name, not a text symbol. Notes, delegated tasks and projects use the same colors: blue In progress, orange Blocked, gray ring Dropped, teal Solved (Done for projects).
- **Turn** (Orange counts and dots everywhere): whose move it is now. Orange also means "your turn". Anything you need to look at, such as Awaiting decision or Needs review, looks the same everywhere: an orange pill with a count or a single orange dot. Things waiting on an agent are neutral gray.
