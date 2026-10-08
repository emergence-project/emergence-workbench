# 관리자용: 공개 피드백과 기여 처리

공개 저장소에서 다른 사람의 피드백과 코드를 받는 방법이다. 관리자 자신의 앱 피드백은 지금처럼 개인 저장소 `feedback/`와 `status.yaml`(`CLAUDE.md` "앱 피드백 처리")에 둔다. 같은 문제를 가리키면 `status.yaml` 항목 `note`에 이슈 번호만 적는다. 결정 배경: 2026-10-08 제안 "공개 뒤 피드백과 기여 관리".

## 받는 곳

| 무엇 | 어디 | 양식 |
| --- | --- | --- |
| 버그 | Issues | `.github/ISSUE_TEMPLATE/bug.yml` (라벨 `bug`, `triage`) |
| 요청 | Issues | `.github/ISSUE_TEMPLATE/request.yml` (라벨 `enhancement`, `triage`) |
| 질문·사용법 | Discussions › Q&A | `.github/DISCUSSION_TEMPLATE/q-a.yml` |
| 코드 | fork → PR | `.github/pull_request_template.md`, `CONTRIBUTING.md` |

빈 이슈는 막아 두었다(`config.yml`). 이슈 양식의 칸 id(`what`, `area`, `route`, `version`, `environment`)는 앱의 "GitHub에 보내기"가 주소로 미리 채우는 이름이므로 바꾸지 않는다.

## 공개 직후 한 번 할 설정 (저장소 Settings)

1. **General › Features**: Discussions 켜기. 카테고리 Q&A(슬러그 `q-a`)와 Ideas만 남긴다.
2. **Labels**: 아래 표대로 만든다. 양식의 라벨은 저장소에 있어야 붙는다.
3. **Rules › Rulesets › main**: PR 필수, 승인 1 + Code owners 승인 필수, 강제 푸시·지우기 금지, 상태 검사 `check`(ci.yml) 필수. Bypass 목록에 관리자(Repository admin)를 넣어 에이전트 PR은 검사 통과 뒤 바로 합칠 수 있게 한다.
4. **Actions › General**: "Require approval for first-time contributors" (기본값 유지).
5. **Watch → Custom: Issues, Pull requests, Discussions**: 메일·GitHub 모바일 앱으로 알림을 받는다.

| 묶음 | 라벨 |
| --- | --- |
| 종류 | `bug`, `enhancement`, `question` |
| 상태 | `triage`(양식이 붙임), `needs-info`, `accepted`, `wontfix`, `duplicate` |
| 부위 | `area: notes`, `area: manuscript`, `area: library`, `area: work`, `area: feedback`, `area: settings` (data-ui 첫 단계에 맞춰 필요할 때 더한다) |

저장해 둘 목록: `is:open label:triage`(새로 온 것), `is:open label:accepted`(할 일).

## 처리 흐름

1. **분류** (에이전트): `triage` 이슈를 읽고 종류·부위 라벨, 중복이면 원래 이슈 연결, 버그면 `pnpm dev` 예제 모드에서 재현을 시도한다. 재현되면 `accepted`, 정보가 모자라면 `needs-info`.
2. **답장 초안** (에이전트): 이슈에 바로 쓰지 않고 관리자 대화(프로젝트 스레드)에 초안을 올린다. 관리자가 승인하면 그대로 이슈 댓글로 단다. 공개 저장소의 글은 되돌릴 수 없으므로 승인 전에는 아무것도 게시하지 않는다.
3. **고치기**: `claude/…`·`codex/…` 브랜치 → PR 설명에 `Fixes #n`. 합치면 이슈가 닫히고 올린 사람에게 알림이 간다. 닫는 댓글에 그 수정이 들어간 앱 버전(설정 › 앱 기본정보 › 업데이트 이력)을 적는다.
4. **안 하기**: 이유 한 줄과 함께 `wontfix`로 닫는다. 같은 요청이 모이면 Discussions › Ideas로 옮긴다.

이슈 댓글이 곧 답장이다. 올린 사람은 자동으로 구독되어 알림을 받는다.

## 바깥 PR

- CODEOWNERS(`* @sungmin-park-dev`) 승인 없이는 합쳐지지 않는다.
- 에이전트는 바깥 PR을 검토해 의견 초안을 관리자에게 올리고, 승인·합치기는 관리자가 한다. 바깥 PR 브랜치에 에이전트가 푸시하지 않는다.
- 원고 무손실·바깥 수정 덮어쓰기 금지(`CONTRIBUTING.md` "Rules that keep research safe")를 어기는 변경은 받지 않는다.
