---
about:
  - apps/web/src/about/feedback/leaving-feedback.tsx
  - apps/web/src/about/feedback/overview.tsx
  - apps/web/src/about/feedback/answers.tsx
  - apps/web/src/about/feedback/handling-and-shipping.tsx
code:
  - packages/core/src/feedback-buckets.ts
  - packages/core/src/feedback-lessons.ts
  - packages/core/src/contract/feedback.ts
  - apps/server/src/feedback.ts
  - apps/web/src/FeedbackMode.tsx
  - apps/web/src/FeedbackSend.tsx
  - apps/web/src/FeedbackPage.tsx
  - apps/web/src/FeedbackAnswer.tsx
  - apps/web/src/FeedbackViewer.tsx
  - apps/web/src/feedbackDraft.ts
---

# 피드백 옮기기

## 무엇

사용자가 화면의 한 부위를 가리켜 피드백(수정 · 질문 · 제안)을 남기면, 코딩 에이전트가 처리 기록을 쓰고, 사용자가 그 처리에 승인 · 반려 · 코멘트로 다시 답한다. 누구 차례인지는 세 파일을 견주어 계산한다. 자세한 동작은 소개 › 피드백의 네 절(위 `about:`)이 정본이다.

## 규약이 먼저

이 기능은 앱에 묶이지 않는 규약이 따로 있다. 옮길 때는 이 순서로 읽는다.

1. [../feedback/README.md](../feedback/README.md) — 세 파일(원문 · 처리 기록 · 사용자 답), 키, 모듈 지도, 차례 규칙
2. [../feedback/new-app.md](../feedback/new-app.md) — 새 앱에 넣는 단계와 점검 목록
3. [../feedback/agent.md](../feedback/agent.md) — 에이전트가 처리할 때 지키는 규칙 (새 앱의 `CLAUDE.md` · `AGENTS.md`가 가리킨다)
4. [../feedback/cases.json](../feedback/cases.json) — 차례 계산의 공통 시험. 고치지 않고 복사한다

## 파일 지도

| 층 | 파일 | 맡은 일 |
| --- | --- | --- |
| core | `packages/core/src/feedback-buckets.ts` | 차례 계산(사용자 차례 · 에이전트 차례 · 끝남). 타입 말고 가져오는 것이 없어 그대로 옮긴다 |
| core | `packages/core/src/feedback-lessons.ts` | 다시 처리한 이력의 `miss` · `lesson`을 세어 에이전트에게 보이는 교훈 |
| core | `packages/core/src/contract/feedback.ts` | API 몸통 · 답의 모양 (zod) |
| server | `apps/server/src/feedback.ts` | 원문 · 처리 기록 · 사용자 답 파일 읽고 쓰기, 답 받기, 목록. 반려 · 진행 · 논의로 다시 처리하면 그 전 처리(전후 그림까지)를 `revised`로 옮기고 `rework`를 적는다(11/20: 논의에 답할 때 덮여 사라지지 않게) |
| server | `apps/server/src/feedbackStatusCheck.ts` | 처리 기록 점검: 모르는 state · area 없는 항목 · 모르는 miss를 에이전트 명령(`pnpm agent:feedback`)이 경고로 알린다. 실제 기록은 테스트가 보지 않는다(11/27: 기록 내용 때문에 맥에서만 늘 실패해 진짜 실패를 가렸다) |
| web | `apps/web/src/FeedbackMode.tsx` | 피드백 모드: 부위(`data-ui`) 강조, 누른 부위 · 화면 그림 · 고른 글 모으기 |
| web | `apps/web/src/FeedbackSend.tsx` | 남기기 창: 유형 고르기(필수) · 글 · 그림 |
| web | `apps/web/src/FeedbackPage.tsx` | 모아 보기 표: 확인 필요 · 대기 · 완료 · 전체, 줄 펼치기 |
| web | `apps/web/src/FeedbackTurnSplit.tsx` · `TurnGroup.tsx` | 확인 필요를 결정 필요(답할 것) · 확인만(`userTurn` 'confirm': 반영 끝, 줄 끝 반려 · 승인, 확인 창 없는 「모두 승인」)으로 나눔. 레일 수 · 맥 알림은 결정 필요만 (11/23) |
| web | `apps/web/src/FeedbackAnswer.tsx` | 처리에 답하기: 승인 · 반려 · 진행 · 중단 · 논의, 코멘트 (`Compose`의 `prefix`로 크게 본 그림에서 보낸 글 앞에 「후 그림:」 등을 붙인다. `approve`면 「승인」을 그 입력란 아래 줄 왼쪽에). 보내지 않은 답은 항목마다 `unsent.ts`의 `draftMap`에 두어, 앱이 저절로 새로 고칠 때 그 글이 있으면 미룬다(스스로 새로 고치지 않는 앱에서는 그냥 `Map`) |
| web | `apps/web/src/FeedbackViewer.tsx` | 전후 그림과 시안을 한 창으로 크게 보기(11/23): 위 줄에서 전 · 후 · 시안 고르기, 오른쪽에 대화와 답 칸, 대화 칸 접기 |
| web | `apps/web/src/feedbackDraft.ts` | 적던 글 보존 |
| web | `apps/web/src/feedbackFocus.tsx` | 항목 하나의 주소 `#/feedback/<키>`: 필터를 풀고 그 항목을 펼쳐 그 자리로 내리기 |

처리 · 답에 붙인 시안(`mockups`)은 `apps/server/src/feedbackMockups.ts`가 에이전트 작업 폴더 `mockups/`(끝난 대화의 작업 폴더를 치운 뒤에는 남겨 둔 시안 `<설정 폴더>/agent-mockups/<대화>`, [app-fix.md](app-fix.md))에서 `pictures/`로 옮겨 적고, `apps/web/src/FeedbackMockups.tsx`가 작은 그림 · html 새 창 · 「이 시안으로 진행」 · 「논의」로 보이고, 크게 넘겨 보기는 전후 그림과 함께 `FeedbackViewer.tsx`가 맡는다. 작업 폴더가 없는 앱이면 시안 파일을 `pictures/`에 바로 두고 `mockups`에 이름만 적어도 된다. 쓰지 않을 시안은 `dropMockups`(같은 파일)가 그 항목의 답(지금 처리 · `revised` · `replies`)의 `mockups`에서만 떼고, 원문 · 판정 · 코멘트 · 전후 그림(`pictures`)과 그림 파일은 건드리지 않는다(11/24, `feedback_answer`의 `dropMockups`).

## 옮기는 순서

[../feedback/new-app.md](../feedback/new-app.md)의 1단계(최소 묶음) → 2단계(쌓이면 더함)를 그대로 따른다. 화면 부위 이름은 `data-ui` 같은 바꾸지 않을 이름으로 붙이고, 영어 이름 표(이 앱은 `apps/web/src/uiNames.en.json`)를 함께 둔다.

## 이 앱에만 있는 것

- 저절로 맡기기와 컴퓨터 사이 맡음 표시(`apps/server/src/agentFeedbackTick.ts`, `feedbackClaims.ts`) — 에이전트 대화([agent-chat.md](agent-chat.md))가 있어야 한다. 서버 컴퓨터를 정했으면 맡기기 · 자동 처리 설정은 서버 한 곳의 것이다: 다른 맥은 맡기기 요청을 서버로 넘기고(`routes/chatPlace.ts`), 툴바의 「자동 처리」(`FeedbackSend.tsx`)와 설정은 서버의 값을 읽고 쓴다(`routes/settings.ts`, `serverRelay.ts`, 11/20). 피드백 돕기(`helper`, 설정 › 기기 관리 · 11/23)를 켠 맥이면 「자동 처리」 풀이에 서버가 넘칠 때 이 맥이 돕는다고 적는다
- 묶어 맡기기(`apps/server/src/feedbackGroups.ts`, 11/19): 같은 화면의 수정끼리, 질문 · 제안끼리 한 대화에(5개까지). 대화마다 작업 폴더 · 규칙 읽기 · PR · CI를 다시 하지 않으려고
- 저절로 맡기기에서 코멘트 · 답을 저장하면 그 항목의 앞 대화에 이어 바로 답한다(11/20). 맡은 대화는 주고받은 대화 옆 「맡은 대화」 칸(`apps/web/src/FeedbackChat.tsx`, 11/23: 머리 줄 상태 · 맡김 · PR · 대화 보기 · 멈추기, 아래 이 항목 몫의 글. 묶음이면 `feedbackChatPart.ts`가 `feedback_answer` 기록 줄의 key로 나눈 몫만, key가 없는 옛 대화는 전부), 「에이전트에게 맡기기」와 맡은 대화 찾기는 `apps/web/src/FeedbackAgentLine.tsx`, 대화에서 사용자가 말한 판정(진행 · 승인 · 반려 · 중단 · 논의)은 `feedback_answer`의 `verdict`로 적는다(`apps/server/src/feedbackVerdict.ts`)
- 중계 서버로 다른 사람의 피드백 받기(`relay/`, `feedbackRelay.ts`)
- 소개 절 확인(`feedback/about.yaml`, `aboutChecks.ts`)

## 점검

- [ ] [../feedback/new-app.md](../feedback/new-app.md)의 점검 목록을 모두 통과한다
- [ ] 화면의 부위마다 바꾸지 않을 이름이 있다
- [ ] 에이전트 규칙 파일(`CLAUDE.md` 등)이 [../feedback/agent.md](../feedback/agent.md)를 가리킨다
