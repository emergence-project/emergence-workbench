# 인계: 이번 주 변경 검토와 도그푸딩 (2026-11-24)

이 문서는 인계용이다. main에 합치지 않고, 아래 일이 끝나면 이 브랜치(`claude/dogfood-week-fixes`)와 함께 지운다.

- 한 일: main `376b1730`(#679)까지 이번 주 커밋을 갈래 다섯으로 검토하고, 예제 모드(`pnpm dev`)에서 직접 써 보며 버그를 찾아 고쳤다.
- 상태: 고친 것은 묶음 넷으로 나눠 브랜치에 커밋해 올렸다. **PR은 아직 열지 않았다.**
- 남은 일: (1) 아래 순서로 PR을 하나씩 열어 CI 뒤 합치기, (2) 3절의 고치지 않은 버그, (3) 4절의 개선사항 가운데 사용자가 고른 것.

## 1. 올린 브랜치와 PR 순서

네 브랜치 모두 main `376b1730`에서 갈라졌고 커밋 하나씩이다. 파일이 서로 겹치지 않는다. 이 브랜치(`claude/dogfood-week-fixes`)는 네 커밋을 모두 얹은 것에 이 문서를 더한 것으로, 전체를 한꺼번에 돌려 볼 때 쓴다.

| 순서 | 브랜치 | 파일 | PR 제목(안) |
| --- | --- | --- | --- |
| 1 | `claude/week-fix-data-loss` | 4 | 네트워킹 사람 목록과 보관한 기록이 합칠 때 사라지지 않게 |
| 2 | `claude/week-fix-classifier` | 7 | 에이전트 명령 판정이 묻지 않고 지나가던 꼴 막기 |
| 3 | `claude/week-fix-server` | 11 | 합쳐지지 않은 PR을 합쳐짐으로 적던 것, 컴파일 시간 한도 문구, 추천 논문 빈 답 고치기 |
| 4 | `claude/week-fix-screens` | 20 | 알림 종 · 폰 내 차례의 수 맞추기, 사이드바 터미널 닫기, 보낸 글이 입력란에 남던 것 고치기 |

PR을 열 때 지킬 것:

- 열린 PR은 한 번에 하나다. 11/24에 #674 · #671이 열려 있었다(이 브랜치들과 겹치는 파일은 없다). 먼저 `gh pr list`로 본다.
- 앞 PR을 합친 뒤 다음 브랜치를 `origin/main`에 다시 올려(rebase) 연다.
- 커밋 메시지에 `이식 안내서: 그대로 — 이유` · `소개: 그대로 — 이유` 줄이 이미 들어 있다(2 · 3 · 4번, `check-ports.mjs`).
- **4번(화면)** 은 PR 번호를 안 뒤 `apps/web/src/about/prs/<PR 번호>.json`에 `["settings/parts"]`를 적은 커밋을 더한다(폰 「내 차례」의 흐름 결정을 설정 › 폰에서 보기 절에 적었다).
- 4번은 종의 수와 폰 「내 차례」가 바뀌므로 CI의 `shots` 그림에서 종 숫자 · `#/turns` 화면 · 오른쪽 사이드바 터미널의 닫기 단추를 본다. 로컬에서는 `pnpm shots`를 돌리지 않았다.
- 합칠 때: `gh pr merge N --squash --delete-branch --subject "<한국어 제목> (#N)"`. 자동 합치기는 켜지 않는다.

검증(11/24, 맥):

- 넷을 모두 얹은 상태에서 `pnpm type-check` 통과, `pnpm test`는 core 221 · web 640 통과, server는 이 맥의 환경 탓 실패(`setup.test.ts` 2 · `feedbackStatus.test.ts` 2 · `scripts/remote/register-agents.test.mjs` 1)만 남았다.
- 브랜치 하나씩 따로 돌린 결과는 이 문서 맨 아래 "브랜치별 확인"에 적는다.

## 2. 고친 것

확인 칸: **화면** = 예제 모드에서 고치기 전 재현하고 고친 뒤 확인, **테스트** = 고치기 전 실패하는 테스트를 붙임, **코드** = 타입 검사만(실제 에이전트를 띄워야 재현돼 돌려 보지 않음).

### 2.1 화면 (`claude/week-fix-screens`)

| 버그 | 파일 | 확인 |
| --- | --- | --- |
| 알림 종 「답할 것」이 「확인만」 피드백까지 세어 레일 합과 다름 (#670) | `NoticeBell.tsx` | 테스트 · 화면 |
| 폰 「내 차례」에 결정을 기다리는 흐름이 없음(레일 수와 다름) | `phone/turns.ts` · `phone/PhoneTurns.tsx` · `about/settings/parts.tsx` | 화면 |
| 「터미널에서 실행」 뒤 오른쪽 사이드바가 터미널에 갇힘(탭 줄도 닫기도 없음) (#677 · #658) | `noteScreen.ts` · `TerminalPane.tsx` · `RightSidebar.tsx` · `AgentSide.tsx` | 화면 |
| 소개 「이력 보기」를 열면 사이드바의 「기록」이 「정보」로 바뀜 (#676) | `AboutPage.tsx` | 화면 |
| 저장한 빠른 메모가 다시 열면 그대로 들어 있음 (#592) | `memo.tsx` | 화면 |
| 기록 「답하기」로 보낸 답이 다시 열면 들어 있음 (#597) | `RecordList.tsx` | 화면(고친 뒤만) |
| 새 대화를 보낸 뒤 그 글이 입력란에 남음 (#593) | `ChatComposer.tsx` | 코드 |
| 보관한 오류 대화가 레일의 에이전트 수에 잡힘 | `agentSeen.ts` | 테스트 |
| 변경사항 칸의 코멘트 초안이 다른 대화로 넘어감 | `AgentChats.tsx` (`WorkColumn key`) | 코드 |
| 여러 개 고른 채 대상을 바꾸면 보이지 않는 대화가 삭제 대상에 남음 (#510) | `AgentChatList.tsx` | 코드 |
| 처음 여는 대화로 가면 터미널 칸(셸)이 사라짐 (#486) | `WorkAside.tsx` | 코드 |
| 검토가 없는 대화(다른 에이전트 · 다른 컴퓨터)에 검토 칸이 열림 (#651) | `AgentChats.tsx` | 코드 |
| 「논의」을 보냈습니다 → 를 (#661) | `FeedbackMockups.tsx` | 코드 |

세 초안 버그(메모 · 답하기 · 새 대화)의 원인은 같다: 메모리의 초안 Map을 `setText('')` 뒤의 `useEffect`로 지우는데, 보내자마자 그 부품이 사라지면 지워지지 않는다. 보내는 자리에서 바로 지우게 했다. 같은 꼴이 더 있는지 `unsent` · `quickDrafts` · `unsentReplies` · `unsentAnswers`를 쓰는 곳을 한 번 더 볼 만하다.

### 2.2 자료 유실 (`claude/week-fix-data-loss`)

| 버그 | 파일 | 확인 |
| --- | --- | --- |
| 시각이 없는 사람 목록을 가진 컴퓨터가 더 새 목록을 따를 때, 자기에게만 있던 사람이 다음 동기화에서 지워짐 (#519) | `meSync.ts` (`adoptPeople`) | 테스트(기존 기대값이 틀려 있었음) |
| 보관 파일에 같은 id의 다른 글이 있으면 원본에서만 지워져 글이 사라짐 (#634) | `recordArchive.ts` (`move`) | 테스트 |
| 맥에서만 깨지던 테스트(`/var` → `/private/var`) | `meSync.test.ts` | 테스트 |

### 2.3 서버 (`claude/week-fix-server`)

| 버그 | 파일 | 확인 |
| --- | --- | --- |
| 합친 뒤 같은 브랜치로 새 PR을 연 대화가 옛 PR 때문에 「합쳐짐」으로 적힘 | `appWorktree.ts` (`prMerged`에 번호) · `agentCentral.ts` · `agentFeedbackTick.ts` | 테스트(가짜 `gh`), 실제 `gh`로는 안 돌림 |
| 재시작 뒤 방 사람 줄이 계속 「답하는 중…」 (#514) | `agentChats.ts` | 코드 |
| 추천 논문: 일부 기준만 한도에 걸려도 빈 답을 6시간 붙듦 (#475) | `paperRecommend.ts` | 테스트 |
| 시간 한도로 멈춘 컴파일에 TeX 설치 안내가 나옴 (#587) | `latex.ts` · `manuscript.ts` | 테스트(판정 함수만) |
| 「이 기기를 서버로」 뒤 박동 답의 목록에 자기 자신이 들어감 (#532) | `routes/devices.ts` | 코드 |

### 2.4 명령 분류기 (`claude/week-fix-classifier`)

모두 함수를 직접 불러 재현하고 테스트(`묻지 않고 지나가던 꼴 (11/24 검토)`)를 붙였다.

- 작은따옴표 안의 `$(` · 백틱 때문에 뒤따르는 명령이 가려져 "읽기"로 판정됨 → `maskLiteral`.
- `git -C <폴더> clean|push …`처럼 전역 옵션이 끼면 하위 명령을 못 읽음 → `gitArgs`. `-c` · `--config-env`가 있으면 적어도 "실행".
- `find -exec … + …`에서 홀로 선 `+`를 끝으로 봄 → `{} +`만 끝.
- 붙여 쓴 짧은 옵션(`sed -Ei`, `tree -ao`, `git grep -lO`, `ps -axE`), `>&2file`(파일 쓰기).
- 비밀 경로 검사가 명령 전체 글에만 걸려 `cat .env`가 지나감 → 낱말마다 검사.
- `APP_OWNED` · `CRITICAL`의 `git push`가 전역 옵션을 건너뛰지 못함. `FROZEN_INSTALL` 정규식이 긴 옵션 줄에서 몇 초 걸림.

## 3. 찾았지만 고치지 않은 버그

설계가 필요하거나 범위가 커서 남겼다. 검토에서 나온 것이므로 **고치기 전에 재현부터** 한다. 위쪽이 더 급하다.

### 3.1 명령 분류기 (`packages/core/src/chat-auto.ts` · `chat-readonly.ts` · `chat-bypass.ts`)

놓치는 것:

- zsh 전용 문법(`=(명령)`, glob qualifier의 `e:'…':`, `$=x`)을 명령으로 보지 않는다.
- `python3 -c` 안의 실행(주석 `#`이 문자열 가리기를 헷갈리게 하는 꼴 포함).
- 겹쳐 감싼 지우기: `find -exec sh -c '…'`, `xargs -I{} sh -c '…'`, `find -exec env …`, `time -p …` 안의 `rm`이 "지우기"로 올라가지 않는다.
- `cat < <저장소 밖 경로>`를 밖 읽기로 보지 않는다. 작은따옴표로 싼 절대 경로 리디렉션 대상도.
- `neverBypass`가 `( … )` · `{ …; }` · `xargs` · `find` 꼴을 놓친다. `commandKind`가 `$'…'` 따옴표를 모른다.
- 낮음: `git push origin x:heads/main`, `gh api graphql -f query="$(…)"`, 토큰 환경 변수 `echo`, `writesFiles`의 `&> 파일`.
- 덜 확실: 도구 `Read`의 `~` 경로 풀기, `Glob` 패턴이 저장소 밖으로 나가는 꼴.

반대로 과하게 잡는 것(읽기 전용 대화가 막히거나 매번 물음):

- 따옴표 안의 `>`(`grep "=>"`)를 파일 쓰기로 본다.
- `'\.ts$'` 같은 정규식의 `$`를 변수로 본다.
- `cd x && ../..` 꼴 경로를 저장소 밖으로 본다.
- 셸 내장 명령이 "실행"이 된다. `gh run view` · `gh pr view`를 매번 묻는다.

### 3.2 중앙 · 피드백 처리 (`apps/server/src/agentCentral*.ts` · `agentFeedbackTick.ts` · `appWorktree.ts`)

- 사용자가 손으로 합친 피드백 PR을 중앙이 아닌 피드백 대화에서는 알아채지 못해, 그 대화가 파일 맡기를 계속 쥔다(`agentFeedbackTick.ts`의 `!c.feedback &&` 조건).
- 돕는 컴퓨터가 시작에 실패한 항목을 다시 맡기지 않는다(`picked`에 남음).
- 따로 묶은 묶음들이 돕는 컴퓨터에서 한 대화로 합쳐지고, 방 수를 키 수로 센다.
- 다른 컴퓨터의 옛 중앙 대화를 「이 컴퓨터에서 이어 하기」 하면 중앙이 둘이 된다.
- 되감은 뒤에는 방 사람의 답이 진행자에게 전해지지 않는다(`fed`).
- 토론 중에는 진행자의 `room_ask`가 거절된다(`asking` 수를 함께 씀).
- 서버 컴퓨터의 로컬 대화에서 `central_help`가 404.
- 앱 고치기 대화가 합친 뒤 두 번째 PR을 열어도 `merged`가 지워지지 않아 `app_merge`가 거절된다(`appSubmit`).
- 덜 확실: 요약(compaction) 뒤 `digested` · `memoSent`가 남는 것, `chat_review` 두 번 겹침, `feedback_answer`에서 `dropMockups`가 던지면 반만 쓰이는 것.

### 3.3 기기 (`apps/server/src/deviceServer.ts` · 기기 계약)

- 로그아웃 대기가 메모리에만 있고, 답이 전해지기 전에 지워진다(서버 재시작 · 전달 실패에 사라짐).
- 기기 계약이 엄격해(모르는 칸 거절) 앱 버전이 다른 컴퓨터끼리 박동이 통째로 실패한다(`helper` 칸).

### 3.4 화면 (`apps/web/src`)

- 화면만 바뀐 업데이트의 자동 새로 고침이 적던 글을 지운다(초안이 메모리에만 있음, `AppUpdate.tsx`).
- 소개 › 「수정」 탭의 담은 곳이 탭 · 갈래 · 절을 바꾸면 사라진다.
- 크게 본 창에서 답을 보내면 그 항목이 필터에서 빠져 창이 바로 닫힌다.
- 한글 조합 직후 ⌘↵가 두 입력란에서 무시된다(`AgentSide.tsx` · `AgentChats.tsx`의 입력 키 처리).
- 받기 실패를 빈 상태로 보인다(`CentralChat.tsx`의 `useBoard`, `AgentPanel`, `GlobalAgentPanel`).
- `data-ui`를 번역된 라벨로 만든다(`CentralChat.tsx`), `uiNames.en.json`에 옛 항목이 남아 있다.
- 사이드바의 터미널 갈래가 화면을 넘어 이어진다(이제 닫을 수는 있다).
- 중앙 대화의 배지가 레일 수에는 들어가고 목록에는 없다.
- `PictureGallery`가 그림 수가 줄면 없는 그림에 머문다.
- 기록 보관 계획(미리 보기)의 수가 id가 부딪혀 옮기지 않을 기록까지 센다.
- 낮음: `static.ts`의 500 응답에 1년 캐시 머리가 붙는다.

## 4. 써 보며 본 개선사항 (버그 아님, 사용자 결정 필요)

- **알림 종**: 답할 것이 8개를 넘으면 소식이 「더 보기」 뒤로 숨는다. 소식이 0일 때도 「새 소식 0」과 꺼진 「소식 모두 읽음」이 보인다. 소식을 모두 읽어도 레일 네트워킹의 파란 점이 남는다.
- **수**: 사이드바 「기록」과 「흐름」이 같은 흐름을 두 번 센다. 기록 화면 탭 「내 차례」는 할 일까지 넣어 사이드바 수와 다르다.
- **크게 본 창의 답 초안**이 그림(전 · 후)마다 따로라 그림을 바꾸면 사라진 것처럼 보인다.
- **메모의 @**: 문장 속에 홀로 있는 `@`(예: `@ 300K`)가 기본 에이전트 부르기가 되고, `@이름에게` · `@이름야` · `@모두에게`처럼 조사가 붙으면 불리지 않는다(`calledAgent` · `mentionsOf`). 설계대로라 손대지 않았다.
- **예제 피드백**의 답 문구가 옛 말이다("하자", "승인하면 만든다").
- **접근성**: 피드백 화면의 자동 처리 스위치에 이름이 없다. 아이콘 단추 · 탭 몇 곳이 툴팁 글을 `aria-label`로 쓴다.
- **끝난 메모의 상태 줄**이 본문 뒤에 빈 줄 없이 붙는다.
- **예제 모드**: 서버 파일을 고쳐 백엔드가 다시 뜨는 동안 502와 웹소켓 오류가 잠깐 보인다.

## 5. 브랜치별 확인

11/24 맥에서 브랜치마다 따로 돌렸다. 넷 모두 `pnpm type-check` 통과, `check-about` · `check-ports` · `check-ratchet` · `check-design` 통과.

| 브랜치 | 돌린 테스트 | 결과 |
| --- | --- | --- |
| `claude/week-fix-data-loss` | server `meSync.test.ts` · `recordArchive.test.ts` | 16개 통과 |
| `claude/week-fix-classifier` | core 전체, server `critical.test.ts` · `agentPolicy*` | 통과(server 18개) |
| `claude/week-fix-server` | server `paperRecommend.test.ts` · `agentCentralWake.test.ts` · `app.test.ts` | 51개 통과 |
| `claude/week-fix-screens` | web 전체 | 통과 |

브랜치마다 server 전체 테스트와 `pnpm shots`는 돌리지 않았다(PR의 CI가 돌린다).
