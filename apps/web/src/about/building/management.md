---
id: management
kind: norm
title: { ko: 관리 방침, en: How changes land }
summary:
  ko: 브랜치 → PR → CI → 합치기. 위험한 영역은 사용자가 합치고, 공개 저장소에는 개인 정보를 쓰지 않습니다.
  en: Branch, PR, CI, merge. Risky areas are merged by the user, and nothing personal goes into the public repository.
---
<!-- ko -->
- **반영 흐름.** `claude/…` · `codex/…` 브랜치에서 고치고 PR을 엽니다. CI(형식 검사 · 테스트 · 빌드 · 화면 그림 · 브라우저 검사)가 마지막 커밋에서 초록이면 에이전트가 합칩니다. 맥에서는 합친 뒤 앱을 다시 시작해 반영합니다.
- **사용자가 합치는 고위험 영역 (11/27).** 권한 · 명령 판정, 파일이나 브랜치를 저절로 지우는 코드, 두 컴퓨터의 파일을 합치는 코드, 비밀값, CI와 검사 스크립트. CI가 초록이어도 에이전트는 합치지 않고, 바꾼 것과 별도 검토 결과를 알립니다.
- **PR은 묶어서.** 작은 수정마다 PR을 열지 않고, 같은 화면 · 기능의 수정은 한 PR로 묶습니다. 파일 안전 수정과 서로 관계없는 수정은 따로 올립니다. PR 제목은 업데이트 이력에 보이는 한국어 한 줄이고, 설명에는 이번에 하지 않은 것을 `Not done:` 줄로 적습니다.
- **소개와 함께.** 화면 · 동작을 바꾼 PR은 같은 PR에서 소개의 그 절을 고칩니다. 소개가 정본이고 `docs/`는 자세한 설명입니다.
- **공개 저장소의 경계.** PR · 커밋 · 이슈 글과 공개 파일에 실제 연구 이름 · 사람 이름 · 개인 이메일 · 로컬 경로를 쓰지 않습니다. 바깥 사람의 의견은 Issues · Discussions로, 코드는 fork PR로 받고, 답은 관리자 승인 뒤에 게시합니다.
- **내려받는 앱 (11/27).** 설치 파일 · dmg에 드는 것은 `docs/release-contract.md`의 계약을 지킵니다. 관문이 막으면 검사를 끄거나 우회하지 않고 막힌 까닭을 고칩니다. 무엇을 지키는지는 [저장소 · 서버 · 계정](#/about/building/repositories)의 「공개」.
- **규칙은 늘 의심합니다.** 에이전트 규칙과 실험 기능은 [에이전트 규칙](#/about/rules)과 [연구 중인 기능](#/about/research)에 근거 · 다시 볼 날과 함께 적고, 효과가 없으면 이유를 남기고 풉니다.

<!-- en -->
- **How a change lands.** Work on a `claude/…` or `codex/…` branch and open a PR. When CI (type check, tests, build, screenshots, browser checks) is green on the last commit, an agent merges. On the Mac the app is restarted after a merge.
- **High-risk areas the user merges (11/27).** Permission and command checks, code that deletes files or branches by itself, code that merges files between two computers, secrets, and CI and check scripts. Even with green CI an agent does not merge; it reports what changed and a separate review.
- **Batch PRs.** No PR per small edit; changes to the same screen or feature go in one PR. File-safety fixes and unrelated changes go separately. PR titles are one Korean line, shown in the update history, and the description lists what was left out on a `Not done:` line.
- **With the About.** A PR that changes a screen or behavior updates that About section in the same PR. The About is the source of truth; `docs/` holds the details.
- **The public boundary.** No real research names, people's names, personal emails or local paths in PRs, commits, issues or public files. Outside opinions come through Issues and Discussions, code through fork PRs, and replies are posted only after the maintainer approves.
- **Downloadable builds (11/27).** What goes into an installer or dmg follows the contract in `docs/release-contract.md`. When the gate blocks a build, fix the cause instead of turning the check off or working around it. What it guards is under "Public" in [Repositories, servers and accounts](#/about/building/repositories).
- **Rules are always in doubt.** Agent rules and experiments are listed with their reason and review date in [Agent rules](#/about/rules) and [Features under research](#/about/research), and are lifted with a recorded reason when they do not help.
