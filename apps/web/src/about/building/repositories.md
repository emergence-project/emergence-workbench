---
id: repositories
kind: reference
title: { ko: 저장소, en: Repositories }
summary:
  ko: 앱 코드 · 관리자 기록 · 연구 · 라이브러리를 저장소 넷으로 나누고, 공개하는 것은 앱 코드뿐입니다.
  en: App code, maintainer records, research and the library live in four kinds of repository; only the app code is public.
---
<!-- ko -->
- **앱 저장소 (공개, MIT).** 앱 코드, 소개, 형식 문서(`docs/`), 예제(`fixtures/`)만 둡니다. 누구나 읽으므로 실제 연구 이름 · 사람 이름 · 개인 이메일 · 로컬 경로를 쓰지 않습니다.
  - `apps/server`: 맥에서 도는 앱 서버(파일 읽고 쓰기, API, 에이전트 입구 MCP).
  - `apps/web`: 브라우저 · 데스크톱 창에 그리는 화면.
  - `packages/core`: 서버와 화면이 함께 쓰는 계산과 API 계약.
  - `desktop/`: 데스크톱 창(Tauri), `relay/`: GitHub 없이 쓰는 사람의 피드백을 옮기는 작은 서버.
- **관리자 개인 저장소 (비공개).** 피드백 원문과 처리 기록(`feedback/`), 요구와 결정 표(`planning/`), 관리자 개인 규칙, 맥마다의 앱 설정 사본. 앱이 맥에 받아 두고 피드백을 여기에 올립니다.
- **연구 저장소 (프로젝트마다 하나).** 원고 · 노트 · 기록이 있고, 앱이 읽고 쓰는 부분은 `workbench/` 폴더입니다. 앱은 저장소를 옮기지 않고 경로만 등록합니다. 형식은 `docs/repo-format.md`.
- **라이브러리 저장소.** 개념노트 · 논문 · 그림 · 공용 서식(`preamble/`)과 참고문헌. 여러 프로젝트가 함께 씁니다.
- 앱이 없어도 모든 기록은 사람이 읽을 수 있는 텍스트 파일이고, 이력은 git이 남깁니다.

<!-- en -->
- **App repository (public, MIT).** Only app code, this About, format docs (`docs/`) and samples (`fixtures/`). Anyone can read it, so no real research names, people's names, personal emails or local paths.
  - `apps/server`: the app server running on the Mac (reading and writing files, the API, the MCP entry for agents).
  - `apps/web`: the screens drawn in a browser or the desktop window.
  - `packages/core`: logic and API contracts shared by server and screens.
  - `desktop/`: the desktop window (Tauri); `relay/`: a small server that forwards feedback from people without GitHub.
- **Maintainer's personal repository (private).** Raw feedback and its handling records (`feedback/`), requirements and the decision table (`planning/`), the maintainer's personal rules, and a copy of each Mac's settings. The app keeps a copy on the Mac and pushes feedback there.
- **Research repositories (one per project).** Manuscripts, notes and records; the part the app reads and writes is the `workbench/` folder. The app never moves a repository, it only registers its path. Format: `docs/repo-format.md`.
- **Library repository.** Concept notes, papers, figures, the shared LaTeX preamble (`preamble/`) and the bibliography, shared by all projects.
- Without the app, every record is still a plain text file a person can read, and git keeps the history.
