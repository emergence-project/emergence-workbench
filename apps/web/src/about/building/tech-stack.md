---
id: tech-stack
kind: norm
title: { ko: 기술 선택과 근거, en: Technology and why }
summary:
  ko: 파일과 git이 정본이고, 서버 · 화면 · 계약을 TypeScript 하나로, 화면은 웹 기술로 만듭니다.
  en: Files and git are the source of truth; server, screens and contracts share one language, TypeScript; screens use web technology.
code: [packages/core/src/contract/**]
---
<!-- ko -->
- **데이터베이스 없이 파일과 git이 정본.** 기록은 사람이 읽는 텍스트 파일(Markdown · YAML · LaTeX)이고 이력은 git입니다. 앱이 없어도 읽히고 컴파일되며, 에이전트도 같은 파일을 씁니다. 데이터베이스는 검색용 색인까지만 허용합니다(요구 문서 "하지 않을 것").
  - 대신 동시에 고치는 것은 읽을 때 받은 hash(`baseHash`)로 막고, 바뀌었으면 409로 알립니다.
- **로컬 서버 + 웹 화면.** 맥에서 도는 서버가 파일을 다루고, 화면은 브라우저 기술로 그립니다. 첫 버전은 맥 전용이지만 화면을 웹으로 만들어 iPad · 웹 · Android로 넓힐 길을 막지 않습니다(원칙 9).
- **언어는 TypeScript 하나.** 서버(Node 22)와 화면(React)과 둘 사이의 계약을 한 언어로 써서, 요청 · 응답 모양을 `packages/core/src/contract/`(zod) 한 곳에 두고 양쪽이 같은 타입을 씁니다. 에이전트 SDK(Claude · MCP)도 이 언어로 제공됩니다. *(추정: 처음 고른 이유는 기록에 없습니다. 관리자 확인 필요)*
- **부품.**
  - 서버: Fastify(API와 실시간 알림 웹소켓), chokidar(파일 감시), yaml, zod.
  - 화면: React, TanStack Query(화면 캐시, 바뀐 자료만 다시 받기, 10/15), CodeMirror 6(편집기), pdf.js(PDF 보기), KaTeX(수식), xterm(터미널).
  - 묶음: pnpm 작업 공간(`apps/*`, `packages/*`), Vite(화면 빌드), vitest(테스트).
- **데스크톱 창은 Tauri (10/30).** 크롬 앱 창 대신 가볍고 안정적인 Tauri 창을 씁니다("개발이 오래 걸려도 화면이 깔끔하고 에러가 적고 가볍고 안정적인 것이 더 중요"). 창만 Tauri이고 서버는 뒤에서 도는 서비스라 창을 닫아도 에이전트 대화는 이어집니다.
- **화면 언어는 한국어가 기본, 영어도.** 화면 글은 `t('한국어', 'English')`로 둘 다 쓰고, 저장 값은 한국어 그대로 둡니다(연구 파일을 읽는 코드가 한국어로 찾습니다).

<!-- en -->
- **Files and git, no database, as the source of truth.** Records are plain text (Markdown, YAML, LaTeX) and git keeps the history. They read and compile without the app, and agents use the same files. A database is allowed only as a search index (requirements, "What we won't do").
  - Concurrent edits are caught with the hash read earlier (`baseHash`); a changed file answers 409.
- **Local server plus web screens.** A server on the Mac handles files; screens use browser technology. The first version is Mac only, but web screens keep iPad, web and Android open (principle 9).
- **One language: TypeScript.** Server (Node 22), screens (React) and the contract between them share one language, so request and reply shapes live in one place, `packages/core/src/contract/` (zod), and both sides use the same types. The agent SDKs (Claude, MCP) ship in this language too. *(Assumed: the original reason is not recorded. Maintainer to confirm.)*
- **Parts.**
  - Server: Fastify (API and live-update websocket), chokidar (file watching), yaml, zod.
  - Screens: React, TanStack Query (screen cache, refetch only what changed, 10/15), CodeMirror 6 (editor), pdf.js (PDF viewer), KaTeX (math), xterm (terminal).
  - Tooling: pnpm workspace (`apps/*`, `packages/*`), Vite (screen build), vitest (tests).
- **Desktop window: Tauri (10/30).** A light, stable Tauri window instead of a Chrome app window ("taking longer is fine; clean screens, few errors, light and stable matter more"). Only the window is Tauri; the server runs as a background service, so closing the window does not stop agent conversations.
- **Korean first, English too.** Screen text is written as `t('한국어', 'English')`, and stored values stay in Korean (the code that reads research files looks for Korean).
