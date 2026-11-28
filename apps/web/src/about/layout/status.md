---
id: status
kind: reference
title: { ko: 상태와 차례, en: Status and turns }
summary:
  ko: 여러 화면에 걸쳐 같은 뜻으로 쓰는 표시입니다. 상태는 색 점과 이름, 차례는 주황 수 · 점입니다.
  en: Marks that mean the same on every screen. Status is a colored dot with a name; turns are orange counts and dots.
figure: [StatesTable, TurnFigure]
was: [principles/status-and-turns]
---
<!-- ko -->
- **상태** (어디서나 색 점) — 글자 기호가 아니라 색 점과 짧은 이름입니다. 노트 · 맡긴 일 · 프로젝트가 같은 색을 씁니다: 파랑 진행, 주황 멈춤, 회색 고리 폐기, 청록 해결(프로젝트는 완료).
- **차례** (어디서나 주황 수 · 점) — 지금 누가 볼 일인지. 판단 대기 · 확인 필요처럼 내가 볼 것은 어디서나 주황 알약 수나 주황 점 하나의 모양이고, 에이전트를 기다리는 것은 무채색입니다. 알림 종의 수는 레일의 주황 수를 더한 것입니다.
- **저장 위치** — 따로 저장하지 않습니다. 각 파일의 `status`와 기록 · 답에서 계산합니다.
- **자세히** — [기호와 의미](#/about/symbols) · [화면 기준](#/about/design)

<!-- en -->
- **Status** (Colored dots everywhere): a colored dot and a short name, not a text symbol. Notes, delegated tasks and projects use the same colors: blue In progress, orange Blocked, gray ring Dropped, teal Solved (Done for projects).
- **Turn** (Orange counts and dots everywhere): whose move it is now. Anything you need to look at, such as Awaiting decision or Needs review, looks the same everywhere: an orange pill with a count or a single orange dot. Things waiting on an agent are neutral gray. The bell's count is the sum of the rail's orange counts.
- **Where it is stored**: not stored on its own. It is computed from each file's `status` and from records and answers.
- **In detail**: [Symbols and meanings](#/about/symbols) · [Screen standards](#/about/design)
