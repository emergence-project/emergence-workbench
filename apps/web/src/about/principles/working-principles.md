---
id: working
kind: norm
title: { ko: 작업 원칙, en: Working principles }
summary:
  ko: 무엇이 쌓이고, 어디가 정본이고, 언제 묻는지를 정한 원칙입니다. 어느 기능을 고치든 걸리고, 앱 고치기 대화는 처음에 이 절을 받습니다.
  en: What accumulates, where the source of truth lives, and when to ask. They apply whatever feature is changed, and an app-fix conversation receives this section first.
---
<!-- ko -->
- **검증된 것만 쌓인다.** 판단과 검증을 통과한 것만 기록으로 남습니다. 에이전트가 낸 결과도 사람이 승인해야 쌓입니다(10/23 목적).
- **저장소가 주인이다.** 연구 저장소의 구조를 앱에 맞게 바꾸지 않고, 앱이 남기는 것은 `workbench/`에만 둡니다.
- **정본은 GitHub에 있다.** 맥의 폴더는 그 사본이고, 맥에만 있는 `workbench/`는 한 시간마다 비공개 백업 저장소에 올립니다.
- **원고는 잃지 않는다.** 다른 곳에서 같은 파일이 바뀌면 덮어쓰지 않고 멈춥니다.
- **고친 것은 바로 반영한다.** 에이전트가 고치고 검사(CI)를 통과하면 합칩니다. 다만 권한 판정 · 저절로 지우기 · 두 컴퓨터 합치기 · 비밀값 · 검사 스크립트를 고친 것은 사용자가 합칩니다(11/27). 맥의 앱은 10분마다(설정 › 동기화에서 바꿈) 새 버전을 받아 빌드해 두고, 입력 없이 5분이 지나면 자동으로 다시 시작합니다. 바로 쓰려면 상단바의 "새 버전 · 다시 시작"을 누릅니다.
- **맡긴 일은 사람이 판단해 끝낸다.** 에이전트는 종결 조건을 먼저 정하고 결과를 보고서로 채우며, 승인은 사용자만 합니다.
- **남긴 말은 기록으로 이어진다.** 피드백 · 코멘트 · 질문은 파일로 남고, 처리 결과는 `feedback/status.yaml` 한 곳에 적습니다. 승인된 피드백은 이 소개의 설명으로 옮기고 원문은 지웁니다.
- **모르면 묻고, 아니면 바로 한다.** 되돌릴 수 없는 일이나 목표가 바뀌는 일만 묻고, 그 밖에는 알맞은 기본값으로 진행한 뒤 무엇을 골랐는지 알립니다. "다음 단계"라고 답할 만한 것은 바로 만듭니다.
- **물리 · 수학 검토는 사람이 한다.** 자동 검사나 수치 일치는 사용자의 검토를 대신하지 않습니다.

<!-- en -->
- **Only what is verified accumulates.** Only what has passed judgment and verification is kept as a record. Results an agent produces are kept only once a person approves them (purpose set 10/23).
- **The repository is in charge.** The app does not reshape a research repository to suit itself, and everything the app keeps goes only in `workbench/`.
- **The source of truth is on GitHub.** The folder on the Mac is a copy, and `workbench/` content that exists only on the Mac is pushed to a private backup repository every hour.
- **Manuscripts are never lost.** If the same file changes somewhere else, the app stops instead of overwriting.
- **Fixes ship right away.** An agent makes the fix and merges it once checks (CI) pass. Changes to permission checks, automatic deletion, merging two computers' files, secrets or the check scripts are merged by you (11/27). The Mac app pulls and builds new versions every 10 minutes (change it in Settings › Sync) and restarts on its own after 5 minutes without input. To use it right away, press "New version · Restart" in the top bar.
- **A person closes delegated tasks.** The agent sets completion criteria first and fills in the result as a report; only you approve.
- **What you leave turns into records.** Feedback, comments and questions are saved as files, and how each was handled is written in one place, `feedback/status.yaml`. Approved feedback moves into this About page as a description, and the original is deleted.
- **Ask when unsure, otherwise just do it.** Only things that cannot be undone or that change the goal are asked about; otherwise the agent goes ahead with a sensible default and says what it chose. Anything you would answer with "next step" gets built right away.
- **A person does the physics and math review.** Automatic checks and matching numbers do not replace your review.
