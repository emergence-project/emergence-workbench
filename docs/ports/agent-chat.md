---
about:
  - apps/web/src/about/agents/agent-conversations.tsx
code:
  - packages/core/src/contract/agentChats.ts
  - apps/server/src/agentChats.ts
  - apps/server/src/agentRunner.ts
  - apps/server/src/agentPolicy.ts
  - apps/server/src/agentInbox.ts
  - apps/server/src/agentRun.ts
  - apps/server/src/routes/agentChats.ts
  - apps/web/src/api/agentChats.ts
  - apps/web/src/AgentChats.tsx
  - apps/web/src/AgentChanges.tsx
  - apps/server/src/agentDebate.ts
  - apps/web/src/WorkLog.tsx
  - apps/web/src/AgentChatList.tsx
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
| server | `apps/server/src/agentPolicy.ts` | 허락 규칙(순수 함수): 도구 하나를 허락 · 묻기 · 막기로 판정, 파일 잡기. 단계 한 줄 요약(`describeStep`): `feedback_answer`는 「key · 상태」로 적어 피드백 화면이 묶음 대화를 항목별로 나눈다(11/23) |
| server | `apps/server/src/agentRun.ts` | 실행기의 입출력 타입(`RunInput` · `RunEvent` · `AgentRunner`). 실제 실행기와 시험용 가짜가 함께 따른다 |
| server | `apps/server/src/agentInbox.ts` | 차례 사이에 말을 넘기는 줄(AsyncIterable). 닫으면 끝 |
| server | `apps/server/src/routes/agentChats.ts` | HTTP 경로 `/api/agent-chats/*` |
| web | `apps/web/src/api/agentChats.ts` | 위 경로의 클라이언트 |
| web | `apps/web/src/AgentChats.tsx` | 대화 화면: 목록 · 항목 그리기 · 허락 카드 · 고친 파일 |
| web | `apps/web/src/AgentChanges.tsx` | 사이드바 「변경사항」 칸 `Changes`: 파일마다 접힌 줄(› 이름 +n −n)로 시작해 눌러서 펼치고, 머리 줄 「모두 펼치기 · 접기」. 펼친 파일은 대화마다 메모리에 기억(`openChangeFile`: 대화 줄 「변경사항 보기」가 그 파일을 펼쳐 둠), 코멘트를 쓰는 파일은 접히지 않음. 문단을 누르면 코멘트, 모아서 `commentMessage`로 에이전트에게 보냄. 쓰던 코멘트는 그 대화에만 남게 칸(`WorkColumn`)을 대화마다 새로 만든다(키는 대화 칸 `ChatView`의 키와 달라야 한다. 같으면 앞 대화가 화면에 남는다) |
| web | `apps/web/src/WorkLog.tsx` | 작업 로그: 대화 줄을 본문과 로그로 나누는 순수 함수 `chatLog`(생각 · 이어진 도구 묶음 = 로그 한 줄, 이어진 과정 = 대화의 「과정 n–m」 한 줄), 대화 안에서 그 자리에 펼치는 「과정」 줄 `ProcLine`(11/20 시안 2절: 세부 패널의 작업 로그는 없앰) |
| web | `apps/web/src/WorkAside.tsx` | 대화 오른쪽 칸(사이드바): 세부 패널과 터미널 중 하나(`useSideColumn`). 대화 머리에는 사이드바 여닫기만, 칸 맨 위 아이콘 줄 `SideTabs`(왼쪽 이 대화 · 검토(돋보기 안 체크), 오른쪽 끝 `end` 칸부터 변경사항(둥근 네모 안 ± 아이콘과 초록 점, 수는 툴팁) · 터미널, 11/23)로 칸을 고른다. 터미널은 옮길 앱에 셸이 있을 때만 |
| web | `apps/web/src/AgentChatInfo.tsx` | 「이 대화」 칸 `ChatInfo`와 사이드바 아이콘 줄의 단추 목록 `ChatSideTabs`(검토는 검토자(Codex · Gemini)가 있는 Claude 대화에만, `AgentReview.tsx`의 `ReviewPane`이 검토자 고르기 · 실행과 지난 검토) |
| web | `apps/web/src/ChatComposer.tsx` | 입력란: 붙이기 · `/` 명령 · `@` 파일 · 권한 · 모델 · 생각 깊이 (권한을 고르지 않는 자리는 `noTrust`, 중앙 첫 화면). 아래 줄은 늘 한 줄: 권한은 아이콘(`TRUST_ICON`), 생각 깊이는 막대(`EffortGauge`)이고 줄 폭 460px 아래에서는 이름을 숨긴다(`.ac-compose-row`의 container query). 보내지 않은 글은 `keep` 이름(대화 id, 새 대화는 `new:<프로젝트>`)마다 메모리에 두어 다른 화면을 보고 와도 남는다. 그 Map은 `unsent.ts`의 `draftMap`으로 만들어, 앱이 저절로 새로 고칠 때(새 버전) 보내지 않은 글이 있으면 미루게 한다(「변경사항」 칸의 담아 둔 코멘트는 `useUnsent`). 스스로 새로 고치지 않는 앱에 옮길 때는 그냥 `Map`이면 된다 |
| web | `apps/web/src/ChatQuote.tsx` | 대화 줄에서 고른 글을 「답글」로 입력란 칩(`selection`)에 더하는 메뉴. 보낼 때 서버가 인용으로 넣는다 |
| web | `apps/web/src/appLinks.ts` · `AppLinkText.tsx` | 대화 글 속 대화 id · 피드백 키 · PR 번호를 앱 안 링크로 (순수 함수 + 대화 화면을 감싸는 맥락) |

## 저장 모양

대화마다 JSON 파일 하나(이 앱은 앱 설정 폴더의 `agent-chats/<id>.json`). 모양은 `contract/agentChats.ts`의 `Chat` · `ChatItem`이 정본이다.

- 머리: `id` · `rid`(프로젝트) · `title` · `state`(`running` · `waiting` · `queued` · `idle` · `stopped` · `error`) · `mode`(`ask` · `plan` · `edit` · `auto`) · `model` · `effort` · `created` · `updated`
- 보관: `archived` · `summary`(보관할 때 작은 모델이 쓴 결과 요약 세 줄) · `packed`(압축해 둔 원문 줄 수. 원문은 같은 폴더의 `<id>.items.json.gz`이고, 그 대화를 열면 다시 푼다)
- 서버만: `sessionId`(SDK 세션, 이어 가기) · `alwaysKeys`(이 대화에서 늘 허락한 것) · `pending`(일하는 중에 보낸 말) · `points`(되감기 자리)
- `items`: 종류(`kind`)로 나뉜 항목 목록 — `user`(내 말) · `text`(에이전트 글) · `step`(도구 사용 한 줄) · `ask`(허락 카드, 답하면 `answer`) · `bypass`(중앙 대화가 허락으로 우회해 돌린 명령: 명령 · 한 번/늘 · 시각) · `edit`(고친 파일 +n −n) · `result`(차례 끝: 성공 · 비용 · 토큰) · `error`(사용자가 멈추지 않았는데 프로세스가 끝났으면 `crash: true`. 대화 기록에 남아 다시 켜도 비정상 종료 이력을 센다)

## 옮기는 순서

1. **기록 모양과 저장.** `contract/agentChats.ts`의 `Chat` · `ChatItem`을 옮기고, 대화 하나를 파일 하나로 쓰고 읽는다.
2. **실행기.** `agentRunner.ts`처럼 SDK `query()`를 띄우고 메시지를 사건으로 바꾼다. 처음엔 글 · 도구 · 결과 셋이면 된다. 저장소의 사용자 설정은 읽지 않고(`settingSources: []`) 허락은 앱의 `canUseTool`이 정한다.
3. **허락.** `agentPolicy.ts`의 판정 함수(읽기 · 고치기 · 지우기 · 명령 · 웹 · 작업 폴더 밖)를 옮기고(명령 줄 판정은 `packages/core/src/chat-auto.ts` · `chat-readonly.ts` · `chat-bypass.ts`, 셋이 함께 쓰는 셸 글 읽기는 `chat-shell.ts`. 읽는 도구의 `~` 경로는 홈으로 풀어서 본다), 묻는 것은 `ask` 항목으로 쌓아 답을 기다린다. 실행의 「늘」(열쇠 `run:<프로그램>`)은 줄 안의 실행 프로그램(`runPrograms`)이 모두 허락됐을 때만 묻지 않는다. 중앙 대화의 Bash는 상태 보기 목록(`packages/core/src/chat-readonly.ts`의 `stateOnlyCommand`: 읽기 명령, for 반복문 · find -exec 안의 읽기, 읽기만 하는 `python3 -I -c`)이면 묻지 않고 돌리고, 맡기는 정도와 상관없이 같으며(입력 줄의 권한 설명도 중앙용 `CENTRAL_HINT`), 목록 밖이라도 막지 않고 명령 · 까닭 · 폴더를 보이며 묻는다(우회, 「늘」은 바로 그 명령만, 열쇠 `bypass:<명령>`); 허락해 돌리면 `bypass` 항목을 남긴다. 강제 푸시 · reset --hard · main 지우기 · 임시 폴더 밖 rm -rf · workbench/ 쓰기는 허락해도 막는다(`packages/core/src/chat-bypass.ts`의 `neverBypass`, 셸 감싸기 안쪽도). 임시 폴더 밖 파일 쓰기(돌려보내기 · heredoc · cp · tee · sed -i · 쓰는 코드, 같은 파일의 `writesFiles`)도 허락해도 막고 하위 대화로 보낸다(11/24: 중앙이 우회로 코드를 명령마다 물으며 썼다). 저절로 허락 · 시간 초과 허락은 없다. 판정은 적힌 낱말을 보지만 셸은 돌리기 전에 낱말을 펼치므로(`find .$IFS-delete`, `find . -{delete,print}`, 반복 변수에 담은 옵션, `${x@P}`), 옵션을 가리는 프로그램에서는 중괄호 펼침과 변수를 막고 한 낱말로 정해진 값(`$HOME`, 글자 그대로 적은 반복 낱말)만 두며, 하위 명령은 첫 낱말로만 고른다(`npm --loglevel info run x`). 옮길 때 이 시험 사례(`chat-readonly.test.ts`)도 함께 옮긴다. 「자동」(`mode: 'auto'`, 11/23)은 읽기 · 작업 폴더 안 명령 · 웹을 묻지 않고, 고치기는 대화 자신의 폴더만 허락한다(`judgeAuto` · `judgeWeb`). 열쇠가 든 곳 읽기(`touchesSecret`), 지우기, 크리티컬 명령(`apps/server/src/critical.ts`의 `commandCritical`: 합치기 · 다시 시작 · 외부로 내보내기 · 돈 · 계정, 따옴표 안 글은 빼고 본다), 폴더 밖 쓰기는 한 번 묻는다.
4. **상태 기계.** `agentChats.ts`의 차례 돌리기: 보내기 → `running` → (허락 대기 `waiting`) → `idle`. 일하는 중 보낸 말은 `pending`에서 다음 차례로. 멈춤은 `interrupt()` 뒤 시간이 지나면 abort. 일하는 중 보낸 말은 SDK가 곧바로 가져가 제 줄에 두므로, 넘길 때 uuid를 붙이고 주 에이전트의 답(`user_message_uuids`)이 읽었다고 알릴 때까지 `Unread`(`agentInbox.ts`)에 둔다. 멈춤 · 실패로 닫히면 읽히지 않은 말을 `pending`(「다음에 보냄」)으로 되돌린다(그러지 않으면 화면에는 보냈는데 에이전트는 못 읽고 사라진다).
5. **경로와 화면.** `routes/agentChats.ts`의 만들기 · 보내기 · 답하기 · 멈추기 · 이어 하기, 화면은 서버가 알리는 줄(SSE 등)로 다시 그린다.
5-a. **목록.** 사이드바 맨 위는 중앙 대화, 그 아래 한 줄에 ☰ 대상 메뉴(전체 · 앱 개발 · 프로젝트마다 · 지식, 수와 함께)와 새 대화 아이콘(네모 위 연필)이 있다. 그 아래는 상태 묶음 넷(내 차례 · 작업 중 · 대기 · 종료)이고 종료는 처음 접혀 있다. 대기 줄은 서버가 주는 차례(`queue`)로 「대기 n번째」를 보인다. 차례가 끝났어도 백그라운드 명령(`tasks`)이 도는 대화는 「작업 중 · 백그라운드 명령 n개」로 작업 중 묶음에 둔다(`agentSeen.ts`의 `inBackground` · `shownState`, 11/21). 「전체」에서는 줄 상태 글 뒤에 대상 이름을 붙인다. 보관한 대화는 목록 맨 아래 상자 아이콘(개수 표시)으로 열고, 열면 대상별로 묶인다(11/20, 구현 `AgentChatList.tsx`). `›`는 묶음 접기에만 쓴다. 목록을 받지 못하면 빈 묶음 대신 이유 한 줄을 보인다(11/21).
5-0. **띄울 Claude Code와 명령.** SDK에 든 Claude Code보다 이 컴퓨터에 깐 `claude`가 새 버전이면 그것을 띄운다(`ask.ts` `claudeExecutable`, 11/20). Claude Code는 스스로 업데이트되므로 새 모델 · 스킬이 앱의 SDK를 올리기 전에 보인다. 대화의 git 커밋 이름은 앱 설정의 것을 환경 변수로 준다(`git.ts` `gitIdentityEnv`). 입력란의 `/` 메뉴에서 뒤에 쓸 말이 없는 명령(`/compact` · `/context`)은 고르면 바로 보낸다. 자동 맥락 줄이기는 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`(`AUTO_COMPACT_WINDOW`, 20만)로 정하고, Claude Code가 응답 몫(`COMPACT_RESERVE`, 약 3.3만)을 남겨 그만큼 앞에서 줄인다. 차례 결과의 `context`에 그 선(`compactAt`)을 함께 실어, 차례 끝 줄과 「이 대화」 막대가 모델 창(1M) 대신 그 선을 잰다(11/23).
5-1. **동시에 도는 수.** 고정된 수 대신 컴퓨터 크기로 상한(`limit`, `appMemory.ts`의 `chatCap`)을 정하고, 그 안에서 남은 메모리로 하나 더 열지(`room`, `chatRoom`) 정한다. 메모리는 몇 초마다 재어 두고(`MemoryGauge`) 대화를 시작할 때는 그 값을 바로 쓴다. 줄 선 대화는 새 대화에 앞지르지 않고, 메모리가 풀리면 `drain()`이 시작한다.
5-2. **묶어 맡긴 피드백.** 대화 하나가 피드백 여러 개를 맡을 수 있다(`feedback` = 첫 키, `bundle` = 모든 키, 11/19). 처리 기록을 쓰는 도구는 그때 `key`로 항목을 받는다. 묶는 규칙과 첫 지시는 `feedbackGroups.ts`.
6. **다시 켰을 때.** 줄 선(`queued`) 대화는 줄 설 때 파일에 적어 둔 차례(`turn`)로 다시 줄을 선다(사용자의 새 지시를 잃지 않게). 일하던(`running`) 대화는 `stopped`로 두고 앱이 뜬 뒤 같은 `sessionId`로 "이어서" 한 번 보낸다(횟수 제한). 사용자 답을 기다리던(`waiting`) 대화는 깨우지 않는다. 동시에 도는 수(`limit`)에 들지 않는 대화(이 앱에서는 중앙 대화와 급한 앱 고치기)는 줄을 서지 않는다.

## 이 앱에만 있는 것

- 앱 고치기 대화의 작업 폴더 · 브랜치 · PR(`appWorktree.ts`)과 CI 기다리기, 끝난 대화의 작업 폴더 치우기([app-fix.md](app-fix.md) 7단계: 에이전트가 닫힌 대화만 치우므로 열어 둔 에이전트 표 `sessions`를 본다. 치운 대화의 되돌리기는 파일 없이 대화만, 곁 질문 · 검토의 작업 폴더는 대화 기록 폴더로)
- 중앙 대화가 하위 대화를 여는 것(`agentCentral.ts`. 중앙이 열지 않은 피드백 대화의 허락 기다림도 중앙을 깨우고, 크리티컬하지 않은 허락은 중앙이 `chat_answer`로 답한다, 11/23), 피드백 맡기기(`agentFeedbackTick.ts`). 서버 컴퓨터를 정했으면 서버만 저절로 맡는다(`feedback.elsewhere`, `serverRelay.ts`). 서버의 자리가 차면 「피드백 돕기」를 켠 맥에 맡긴다(11/23, `feedback.helpers` = `deviceServer.ts`의 `DeviceHub`, 그 맥은 1분 알림의 답 `feedback`으로 받아 `ctx.feedbackHelp.start`로 연다. 늦으면 서버가 맡음을 풀고 `drop`으로 멈춘다)
- 중앙 오른쪽 칸의 작업 현황(`centralBoard.ts` · `CentralChat.tsx`): 하위 대화 · 자리 기다림 · 피드백을 묶음과 정체 시간으로 한 줄씩. 세부 칸의 절 모양은 `SideSection.tsx`
- 앱 MCP 도구(노트 · 기록 · 맡긴 일). 다른 앱은 자기 MCP를 `mcpFor` 자리에 붙인다
- Codex · Gemini 대화(`agentAcp.ts`)와 검토(`review(id, auto, by)`: 고른 검토자마다 같은 글로 따로 한 번 묻기. Codex는 `codex exec` 읽기 전용, Gemini는 `readOnlyAsk`로 ACP 실행기를 읽기만, 11/23)
- 다른 컴퓨터의 대화(`agentShare.ts`, 11/20): 맞추기가 대화를 개인 저장소 `_chats/<컴퓨터>/<id>.json`으로 올리고(내 지시 · 에이전트 글 · 고친 파일 이름 · 오류만), 다른 컴퓨터는 그것을 `machine`을 단 읽기 전용 줄로 보관함에 보인다. 「이 컴퓨터에서 이어 하기」는 새 대화를 열고 SDK 세션 대신 앞 대화를 첫 지시에 붙인다(`carry`, `promptFor`가 한 번 붙이고 지운다). 중앙 대화도 올린다. 서버로 정한 컴퓨터가 따로 있으면(`routes/chatPlace.ts`) 대화 요청을 서버로 넘기되, 이 컴퓨터에만 있는 대화 id는 여기서 처리하고 목록에 `local`(화면의 「이 맥」 태그)로 섞는다(`mergeLists`). 새 대화는 `here: true`면 이 컴퓨터에서 연다. 중앙의 `chat_archive`(11/20)는 하위 대화가 아닌 대화도 보관하는데, 다른 컴퓨터의 대화는 이 컴퓨터가 바꿀 수 없으니 보관 요청을 `_chats/<이 컴퓨터>/_archive.json`으로 올리고, 그 컴퓨터가 맞추기 뒤 `applyArchiveAsks`로 적용한다(요청 뒤에 다시 쓰였거나 일하는 중이면 두고). `chat_unarchive`는 같은 길로 보관함에서 꺼낸다(요청에 `undo: true`). 중앙에게 지우기는 없다(사용자만). 자리를 기다리는 앱 고치기(held)의 순서는 `chat_priority`가 `agentHeld.ts`의 `moveHeld`로 바꾼다. 컴퓨터를 여럿 쓰지 않는 앱은 건너뛴다
- 중앙 방(`agentRoom.ts` · `CentralRoom.tsx`, 11/20): 방장(수정) 하나와 읽기만 · 발언 사람, 받는 이(그냥 = 방장, @이름 = 그 사람만, @모두 · @all = 모두 · 방장 마지막, `@rw/core` `routeOf`. @ 메뉴는 `aka`로 다른 이름에도 맞는다). 여럿을 부르면 같은 시점의 대화를 떼어 두고(`seen`) 동시에 물어 서로의 답을 가리고 방장만 모두의 답을 본다. 방 사람은 세션 없이 부를 때마다 최근 방 대화를 한 번 읽고 답하고(`ChatItem` `member`), 방이 바뀌면 `room` 줄이 남는다. 방장은 MCP `room_ask` · `room_invite` · `room_remove`(`mcpRoom.ts`). 다른 앱은 한 번 묻기(`review` · `side`) 자리만 있으면 옮길 수 있다
- 토론(`agentDebate.ts` · `Debate.tsx`, 11/20): 중앙과 따로 연 대화(rid `_debate`)에서 앱이 사회를 보는 네 단계(각자 답 → 이름을 가린 서로 비판 → 「새 근거:」가 있어야 바꾸는 고친 답 → 투표하지 않는 정리). 모두 같은 판정이면 비판을 건너뛰고(`skip`), 비판 회수 `rounds`(0–2), 자리마다 모델 · 생각(`DebateSeat`, Codex는 `codexPickArgs`)은 방 상태 `debate`에 다음 토론의 기본으로 남는다. 끝내면 판정 기록 한 줄 · 중앙 `debate` 줄의 결론 · 방장 소식(`news`) · 보관. 다른 앱은 한 번 묻기 자리만 있으면 단계 함수(`answerPrompt` · `critiquePrompt` · `revisePrompt` · `sumPrompt`)와 `runDebate`를 그대로 옮길 수 있다
- 답 기다림(`packages/core/src/chat-asks.ts`, 11/24): 마지막 내 말 뒤 에이전트의 마지막 글 끝 문단이 물음이면 행에 `asks`를 달고, 화면은 읽어도 「종료」로 내리지 않고 내 차례(`agentSeen.ts`의 `asksMe`)로 둔다. 저절로 보관(`due`)과 중앙의 `chat_archive`도 이런 대화는 건너뛴다
- 오래된 대화 정리와 중앙 메모(`agentTidy.ts`): 끝나고 7일 손대지 않은 대화를 보관 · 요약 · 압축하고, 중앙이 읽는 오래 갈 규칙을 한 파일에 둔다. 옮길 때는 보관 · 압축만 가져가도 된다
- 중앙의 검토 역할(`agentCentralReview.ts` · `mcpReview.ts`, 11/23): 앱 고치기 대화 둘이 같은 파일을 바꾸면 깨우는 글에 「겹침:」 줄(토큰 없음). 의도 장부 `agent/central-decisions.json`(`decision_add`, 사용자의 말 그대로 · 날짜 · 출처, 더하기만 · 바뀌면 옛 항목에 대체됨). 깊은 검토 `chat_review`는 PR diff와 장부만 받은 한 번 묻기(`side`) 둘(찾기 → 확인)로, 확인된 것만 중앙을 깨우고 없으면 조용하다. 검토 중 보류(`pr_hold`)된 PR은 `appMerge`와 자동 합치기가 건너뛴다. 다른 앱은 한 번 묻기 자리와 diff만 있으면 옮길 수 있다

## 점검

- [ ] 대화 파일 하나로 다시 열면 같은 항목이 보인다
- [ ] 허락이 필요한 도구는 답하기 전에 돌지 않는다
- [ ] 일하는 중에 보낸 말이 사라지지 않고 다음 차례에 들어간다
- [ ] 멈추기가 15초 안에 끝난다
- [ ] 앱을 다시 켜면 하던 대화가 같은 세션으로 이어진다 (이어 가는 말에 멈춘 차례의 마지막 지시를 붙이고, 줄 선 대화는 지시를 지닌 채 줄에 남고, 사용자 답을 기다리던 · 끝난 대화는 깨우지 않는다)
