---
about:
  - apps/web/src/about/agents/agent-conversations.tsx
code:
  - packages/core/src/contract/agentChats.ts
  - apps/server/src/agentChats.ts
  - apps/server/src/agentRunner.ts
  - apps/server/src/agentPolicy.ts
  - apps/server/src/agentInbox.ts
  - apps/server/src/routes/agentChats.ts
  - apps/web/src/api/agentChats.ts
  - apps/web/src/AgentChats.tsx
  - apps/web/src/ChatComposer.tsx
---

# 에이전트 대화 옮기기

## 무엇

앱 안에서 코딩 에이전트(이 앱은 맥의 Claude Code)와 대화한다. 대화 하나가 일 하나다. 에이전트의 글 · 도구 사용 · 고친 파일이 쓰는 대로 보이고, 허락이 필요한 도구는 카드로 묻는다. 차례가 끝나도 잠시 열려 있어 다음 말을 바로 받고, 앱을 다시 켜도 같은 세션으로 이어 간다. 자세한 동작은 소개 › 에이전트와 안전 › 앱에서 맡기는 대화(위 `about:`)가 정본이다.

## 파일 지도

| 층 | 파일 | 맡은 일 |
| --- | --- | --- |
| core | `packages/core/src/contract/agentChats.ts` | 대화 기록 · 항목 · API 몸통의 모양 (zod) |
| server | `apps/server/src/agentChats.ts` | 대화의 상태 기계: 차례 돌리기 · 항목 쌓기 · 저장 · 멈춤 · 다시 켰을 때 이어 가기 · 화면에 알리기 |
| server | `apps/server/src/agentRunner.ts` | Claude Agent SDK의 `query()`를 띄우고 사건(글 조각 · 도구 · 결과)으로 바꾼다. 곁 질문 · 맥락 줄이기 |
| server | `apps/server/src/agentPolicy.ts` | 허락 규칙(순수 함수): 도구 하나를 허락 · 묻기 · 막기로 판정, 파일 잡기 |
| server | `apps/server/src/agentInbox.ts` | 차례 사이에 말을 넘기는 줄(AsyncIterable). 닫으면 끝 |
| server | `apps/server/src/routes/agentChats.ts` | HTTP 경로 `/api/agent-chats/*` |
| web | `apps/web/src/api/agentChats.ts` | 위 경로의 클라이언트 |
| web | `apps/web/src/AgentChats.tsx` | 대화 화면: 목록 · 항목 그리기 · 허락 카드 · 고친 파일 |
| web | `apps/web/src/WorkAside.tsx` | 대화 오른쪽 칸: 세부 패널과 터미널 중 하나(`useSideColumn`, 머리의 목록 · `>_` 아이콘). 터미널은 옮길 앱에 셸이 있을 때만 |
| web | `apps/web/src/ChatComposer.tsx` | 입력란: 붙이기 · `/` 명령 · `@` 파일 · 권한 · 모델 · 생각 깊이 |

## 저장 모양

대화마다 JSON 파일 하나(이 앱은 앱 설정 폴더의 `agent-chats/<id>.json`). 모양은 `contract/agentChats.ts`의 `Chat` · `ChatItem`이 정본이다.

- 머리: `id` · `rid`(프로젝트) · `title` · `state`(`running` · `waiting` · `queued` · `idle` · `stopped` · `error`) · `mode`(`ask` · `plan` · `edit`) · `model` · `effort` · `created` · `updated`
- 서버만: `sessionId`(SDK 세션, 이어 가기) · `alwaysKeys`(이 대화에서 늘 허락한 것) · `pending`(일하는 중에 보낸 말) · `points`(되감기 자리)
- `items`: 종류(`kind`)로 나뉜 항목 목록 — `user`(내 말) · `text`(에이전트 글) · `step`(도구 사용 한 줄) · `ask`(허락 카드, 답하면 `answer`) · `edit`(고친 파일 +n −n) · `result`(차례 끝: 성공 · 비용 · 토큰) · `error`

## 옮기는 순서

1. **기록 모양과 저장.** `contract/agentChats.ts`의 `Chat` · `ChatItem`을 옮기고, 대화 하나를 파일 하나로 쓰고 읽는다.
2. **실행기.** `agentRunner.ts`처럼 SDK `query()`를 띄우고 메시지를 사건으로 바꾼다. 처음엔 글 · 도구 · 결과 셋이면 된다. 저장소의 사용자 설정은 읽지 않고(`settingSources: []`) 허락은 앱의 `canUseTool`이 정한다.
3. **허락.** `agentPolicy.ts`의 판정 함수(읽기 · 고치기 · 지우기 · 명령 · 웹 · 작업 폴더 밖)를 옮기고, 묻는 것은 `ask` 항목으로 쌓아 답을 기다린다.
4. **상태 기계.** `agentChats.ts`의 차례 돌리기: 보내기 → `running` → (허락 대기 `waiting`) → `idle`. 일하는 중 보낸 말은 `pending`에서 다음 차례로. 멈춤은 `interrupt()` 뒤 시간이 지나면 abort.
5. **경로와 화면.** `routes/agentChats.ts`의 만들기 · 보내기 · 답하기 · 멈추기 · 이어 하기, 화면은 서버가 알리는 줄(SSE 등)로 다시 그린다.
5-1. **동시에 도는 수.** 고정된 수 대신 컴퓨터 크기로 상한(`limit`, `appMemory.ts`의 `chatCap`)을 정하고, 그 안에서 남은 메모리로 하나 더 열지(`room`, `chatRoom`) 정한다. 메모리는 몇 초마다 재어 두고(`MemoryGauge`) 대화를 시작할 때는 그 값을 바로 쓴다. 줄 선 대화는 새 대화에 앞지르지 않고, 메모리가 풀리면 `drain()`이 시작한다.
5-2. **묶어 맡긴 피드백.** 대화 하나가 피드백 여러 개를 맡을 수 있다(`feedback` = 첫 키, `bundle` = 모든 키, 11/19). 처리 기록을 쓰는 도구는 그때 `key`로 항목을 받는다. 묶는 규칙과 첫 지시는 `feedbackGroups.ts`.
6. **다시 켰을 때.** 줄 선(`queued`) 대화는 줄 설 때 파일에 적어 둔 차례(`turn`)로 다시 줄을 선다(사용자의 새 지시를 잃지 않게). 일하던(`running`) 대화는 `stopped`로 두고 앱이 뜬 뒤 같은 `sessionId`로 "이어서" 한 번 보낸다(횟수 제한). 사용자 답을 기다리던(`waiting`) 대화는 깨우지 않는다. 동시에 도는 수(`limit`)에 들지 않는 대화(이 앱에서는 중앙 대화와 급한 앱 고치기)는 줄을 서지 않는다.

## 이 앱에만 있는 것

- 앱 고치기 대화의 작업 폴더 · 브랜치 · PR(`appWorktree.ts`)과 CI 기다리기
- 중앙 대화가 하위 대화를 여는 것(`agentCentral.ts`), 피드백 맡기기(`agentFeedbackTick.ts`)
- 중앙 오른쪽 칸의 작업 현황(`centralBoard.ts` · `CentralChat.tsx`): 하위 대화 · 자리 기다림 · 피드백을 묶음과 정체 시간으로 한 줄씩. 세부 칸의 절 모양은 `SideSection.tsx`
- 앱 MCP 도구(노트 · 기록 · 맡긴 일). 다른 앱은 자기 MCP를 `mcpFor` 자리에 붙인다
- Codex · Gemini 대화(`agentAcp.ts`)와 Codex 검토

## 점검

- [ ] 대화 파일 하나로 다시 열면 같은 항목이 보인다
- [ ] 허락이 필요한 도구는 답하기 전에 돌지 않는다
- [ ] 일하는 중에 보낸 말이 사라지지 않고 다음 차례에 들어간다
- [ ] 멈추기가 15초 안에 끝난다
- [ ] 앱을 다시 켜면 하던 대화가 같은 세션으로 이어진다
