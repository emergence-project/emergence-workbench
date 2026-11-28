---
id: agents
kind: reference
title: { ko: 에이전트, en: Agents }
summary:
  ko: 일을 맡긴 코딩 에이전트(Claude · Codex)와의 대화입니다. 대화는 이 컴퓨터에 있고, 다른 컴퓨터에는 줄인 사본이 읽기 전용으로 보입니다.
  en: Conversations with the coding agents (Claude, Codex) you hand work to. Conversations live on this computer; other computers see a shortened read-only copy.
---
<!-- ko -->
- **정의** — 앱 안에서 에이전트에게 일을 맡기고 결과를 받는 대화. 에이전트는 앱의 안전 규칙을 거쳐 연구 파일을 읽고 고칩니다.
- **하위 요소**
  - **대화** (레일 › 에이전트 · 오른쪽 레일 › 대화) — 고른 프로젝트 하나를 고치는 대화. 프로젝트마다 모아 보고, 기록의 질문 · 지시에서도 엽니다.
  - **권한** (대화 입력란의 권한 고르기 · 대화 사이드바 「이 대화의 권한」) — 대화마다 읽기 전용 · 수동 · 계획 · 편집 자동 수락 · 자동 가운데 하나를 고르고, 읽기 · 편집 · 삭제 · 실행 가운데 무엇을 묻지 않고 하게 할지는 「이 대화의 권한 › 상세 보기」에서 줄마다 정합니다. 허락이 필요한 일은 대화 안의 카드로 묻습니다.
  - **중앙 대화** (에이전트 화면) — 프로젝트를 가리지 않는 대화. 여러 대화의 겹침을 중재하고 앱을 고치는 일도 맡습니다.
  - **터미널** (에이전트 대화 창 안) — 이 컴퓨터의 셸. 대화의 셸 명령을 여기서 바로 실행합니다.
  - **에이전트 입구 (MCP)** (화면 밖) — 앱 밖의 에이전트가 앱 서버를 거쳐 읽고 고치는 통로.
- **저장 위치** — 이 컴퓨터의 앱 설정 폴더 `agent-chats/`. 다른 컴퓨터와는 개인 저장소의 `_chats/<컴퓨터>/`에 올린 줄인 사본으로 나눕니다. 형식은 `docs/repo-format.md` §11.
- **자세히** — [에이전트와 안전](#/about/agents)

<!-- en -->
- **Definition**: a conversation inside the app where you hand work to an agent and get the result. Agents read and edit research files through the app's safety rules.
- **Parts**
  - **Conversation** (Rail › Agents · Right rail › Chat): a conversation that edits one chosen project. Gathered per project, and also opened from questions and instructions in Records.
  - **Permissions** (the permission picker in the input box · "This conversation's permissions" in the conversation sidebar): each conversation picks Read only, Manual, Plan, Auto-accept edits or Auto, and "This conversation's permissions › Details" sets, row by row, which of reading, editing, deleting and running happen without asking. Anything that needs permission is asked with a card inside the conversation.
  - **Central conversation** (Agents screen): a conversation across projects. It mediates overlapping conversations and also takes on fixing the app.
  - **Terminal** (inside the agent conversation window): this computer's shell. Shell commands from a conversation run here directly.
  - **Agent entry (MCP)** (outside the screen): the way agents outside the app read and edit through the app server.
- **Where it is stored**: this computer's app settings folder, `agent-chats/`. Other computers get a shortened copy pushed to `_chats/<computer>/` in the personal repository. Format: `docs/repo-format.md` §11.
- **In detail**: [Agents and safety](#/about/agents)
