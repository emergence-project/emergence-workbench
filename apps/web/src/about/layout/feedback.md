---
id: feedback
kind: reference
title: { ko: 피드백, en: Feedback }
summary:
  ko: 앱을 쓰다 남기는 말(수정 · 질문 · 제안)입니다. 에이전트가 처리하고 내가 다시 답합니다.
  en: What you leave while using the app (fix, question, suggestion). An agent handles it and you answer back.
---
<!-- ko -->
- **정의** — 화면 부위를 골라 남기는 앱에 대한 말. 이 작업대가 무엇이기를 원하는지 담은 1차 자료입니다.
- **하위 요소**
  - **항목** (상단바 피드백 단추 · 레일 › 피드백) — 유형(수정 · 질문 · 제안)과 부위, 그 순간의 그림.
  - **답** (피드백 화면) — 에이전트가 처리하고 첫 줄에 결과를 적은 답.
  - **다시 답하기** (답 아래) — 승인 · 진행 · 질문 · 논의 · 반려 · 중단.
  - **차례** (피드백 화면 › 내 차례) — 내가 답할 항목과 에이전트가 처리할 항목.
- **저장 위치** — 관리자 개인 저장소의 `feedback/`(원문 `날짜.md`, 처리 기록 `status.yaml`, 사용자 답 `reviews.yaml`, 그림 `pictures/`). GitHub 없이 쓰는 사람의 피드백은 중계 서버가 같은 곳으로 옮깁니다. 규약은 `docs/feedback/`.
- **자세히** — [피드백이 반영되는 길](#/about/feedback)

<!-- en -->
- **Definition**: what you say about the app, pinned to a part of the screen. It is the primary record of what this workbench should be.
- **Parts**
  - **Item** (Feedback button in the top bar · Rail › Feedback): its kind (fix, question, suggestion), the screen part, and a picture of that moment.
  - **Answer** (Feedback screen): the agent's handling, with the result on its first line.
  - **Answer back** (below the answer): approve, go ahead, question, discuss, send back, stop.
  - **Turns** (Feedback screen › Your turn): items you need to answer and items the agent will handle.
- **Where it is stored**: the maintainer's personal repository, `feedback/` (raw `date.md`, handling records `status.yaml`, your answers `reviews.yaml`, pictures `pictures/`). Feedback from people without GitHub is moved there by the relay server. Protocol: `docs/feedback/`.
- **In detail**: [How feedback lands](#/about/feedback)
