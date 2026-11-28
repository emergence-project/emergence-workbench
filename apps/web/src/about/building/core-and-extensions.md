---
id: core-and-extensions
kind: norm
title: { ko: 본체와 확장, en: Core and extensions }
summary:
  ko: 정본과 안전은 본체에, 그 위에 일하는 방법 하나를 더하는 것은 확장에 둡니다. 확장은 정해진 자리만 채우고 본체의 저장소에 쌓으며, 새 기능은 처음부터 확장으로 만듭니다.
  en: The source of truth and safety stay in the core; one more way of working on top goes in an extension. Extensions fill fixed slots and store into the core's repositories, and new features start as extensions.
---
<!-- ko -->
- **나누는 까닭 (11/28).** 실험과 무거운 기능을 본체에서 떼어 본체를 가볍고 안정되게 하고, 확장이 늘어도 기본 디자인이 크게 바뀌지 않게 합니다.
- **세 단계.** 본체(제거할 수 없음), 기본 확장(설치된 채로 오고 제거할 수 있음), 선택 확장(실험이거나 무겁거나 바깥 계정이 필요해 골라 설치). 설치와 제거는 [설정 › 기능](#/about/layout/settings)에서 컴퓨터마다 하고, 제거해도 파일은 남습니다.
- **본체인 것.** 다른 기능이 읽는 파일 형식의 주인(노트 · 기록 · 개념노트 · 논문 · 그림), 안전과 무결성(권한 · 동기화 · 백업 · 비밀값), 여러 기능이 기대는 것(내 차례 · 상태 · 검색 · 분류), 앱이 고쳐지는 길(피드백 · 소개 · 업데이트). 자기 파일이 없는 보기 하나(지도 · 달력)와 화면이 없는 내부 실험도 떼지 않습니다.
- **확장이 되려면 셋 다.** 빼도 나머지 화면이 온전하다. 자기 파일에는 계획 · 진도 · 상태만 적고, 지식 · 문헌 · 그림은 본체 저장소에 본체의 길로 쓴다. 본체와 닿는 곳이 적다.
- **지금의 분류.** 선택 확장: 흐름(보류), 단체방 · 토론(12/5 점검 뒤 뗌). 기본 확장으로 정한 것: 공부(책 · 강의), 네트워킹의 사람 목록과 새 논문(내 저자 정보는 본체), 앞으로 만들 그림 편집. 선택 확장 후보: 구글 달력 일정, 쇼츠 도구(지금은 만들지 않음). 그 밖의 화면은 본체입니다. 흐름 말고는 아직 코드를 옮기지 않았습니다.
- **옮기는 차례.** 단체방 · 토론 → 공부 → 그림 편집(만들 때 처음부터 확장으로) → 네트워킹. 화면이 그대로인 옮기기를 한꺼번에 하지 않습니다.
- **새 기능은 처음부터 확장으로.** 본체의 조건에 들지 않는 새 기능은 `packages/core` · `apps/server` · `apps/web`의 `src/plugins/<id>/`에 만들고 등록부 둘(서버 · 화면)에만 겁니다. 본체는 확장 폴더를 직접 부르지 않습니다.
- **확장의 경계.** 본체 파일 형식은 본체가 고칩니다(칸이 필요하면 `docs/repo-format.md`에 먼저). 권한 판정 · 저절로 지우기 · 두 컴퓨터 합치기 · 비밀값을 확장이 새로 하지 않습니다. 파일 보호 검사는 제거한 컴퓨터에서도 돕니다.
- **확장의 자리.** 확장은 왼쪽 사이드바의 줄, 본체 화면 틀을 쓰는 페이지, 툴바 오른쪽의 행동 버튼, 내 차례의 줄, 설정 › 기능의 자기 줄 아래에만 나타나고 레일 버튼을 새로 만들지 않습니다. 본체 디자인을 바꾸는 일은 확장 PR에 섞지 않습니다. 자세한 표는 `docs/design-system.md` 6절 「확장의 자리」. 자리는 둘째 확장이 실제로 필요로 할 때 엽니다.

<!-- en -->
- **Why split (11/28).** Experiments and heavy features leave the core so it stays light and stable, and the base design does not change much as extensions are added.
- **Three tiers.** Core (cannot be removed), default extensions (come installed, can be removed), optional extensions (experimental, heavy, or needing an outside account; installed by choice). Install and remove per computer in [Settings › Features](#/about/layout/settings); removing keeps the files.
- **What is core.** Owners of file formats other features read (notes, records, concept notes, papers, figures), safety and integrity (permissions, sync, backup, secrets), things several features lean on (your turn, status, search, subjects), and the way the app gets fixed (feedback, this About, updates). A single view with no files of its own (maps, the calendar) and screenless internal experiments are not split off either.
- **An extension meets all three.** The other screens stay whole without it. Its own files hold only plans, progress and state, while knowledge, literature and figures go into the core repositories through the core's paths. It touches the core in few places.
- **The classification now.** Optional: Flow (on hold), group room and debate (split off after the 12/5 review). Decided as default extensions: Study (books and lectures), Networking's people list and new papers (your author details are core), and figure editing when it is built. Optional candidates: Google Calendar events, a shorts tool (not being built now). Every other screen is core. Apart from Flow, no code has moved yet.
- **Order of moving.** Group room and debate, then Study, then figure editing (built as an extension from the start), then Networking. Moves that leave screens unchanged are not done all at once.
- **New features start as extensions.** A new feature that does not meet the core conditions is built in `src/plugins/<id>/` of `packages/core`, `apps/server` and `apps/web` and hooked only into the two registries (server and web). The core never calls an extension folder directly.
- **Boundaries.** Core file formats are changed by the core (a new field goes into `docs/repo-format.md` first). Extensions do not add their own permission checks, automatic deletion, two-computer merging or secrets. File-protection checks run even where an extension is removed.
- **Slots.** An extension appears only as a left sidebar row, a page in the core screen frame, action buttons on the right of a toolbar, a row in Your turn, and under its own row in Settings › Features; it does not add a rail button. Changes to the core design are not mixed into an extension PR. The full table is in `docs/design-system.md` section 6, "Slots for extensions". A slot opens when a second extension actually needs it.
