# 에이전트용 입구 (MCP)

[English](agent-mcp.md)

Claude Code · Codex 같은 에이전트가 Emergence Workbench의 프로젝트 · 노트 · 기록 · 맡긴 일 · 개념노트를 **앱 서버를 거쳐** 읽는 입구다. MCP 도구는 파일을 직접 열지 않고 앱과 같은 API를 쓰므로, 앱 화면과 같은 내용 · 같은 hash를 본다. 쓰기 도구는 노트를 고치는 `edit_note` · `edit_concept`(10/8 에이전트 고침 검토)와 질문 · 지시 기록에 답하는 `answer_record`(10/15), 사용자에게 묻거나 남기는 기록을 에이전트 이름으로 쓰는 `add_record`(10/15), 흐름 도구(10/20), 그리고 맡긴 일을 만들고 보고하며 오늘 일지에 적는 `add_task` · `report_task` · `add_journal`(10/21)이다. 에이전트는 `workbench/STATUS.md`를 읽거나 workbench 파일을 직접 고치는 대신 이 도구를 쓴다: 출력이 짧고 한 일이 앱에 보인다(10/21: 연구 저장소의 에이전트가 40KB 남짓한 STATUS.md를 읽고 맡긴 일 · 일지 파일을 손으로 고치고 있었다). 고치기 도구는 에이전트는 바로 쓰고, 앱이 고치기 전 글을 기준판으로 남기며, 사용자가 고침 검토 화면(연구노트는 그 프로젝트의 "고침 검토" `#/r/<연구>/edits`, 개념노트는 `#/review`)에서 바뀐 문단마다 승인 · 되돌리기 · 고치기를 고른다. 사용자가 확인한 노트는 대화에서 먼저 허락을 받는다. 고칠 때마다 어느 에이전트가 고쳤는지 적힌다. 이름은 클라이언트가 연결할 때 보내는 이름(`clientInfo.name`)에서 온다: Claude Code는 `claude-code`, Codex는 `codex`, 그 밖에는 보낸 그대로다. 클라이언트가 스스로 밝힌 값이라 앱이 검증하지는 않는다. 에이전트가 앱을 거치지 않고 파일을 직접 고친 것은 여기 남지 않으니, 커밋 작성자로 확인한다. 검토 화면에서 사용자는 바뀐 문단마다 물을 수 있다(10/14): 물은 것은 `edit: 질문` 또는 `edit: 수정`이 붙은 노트 기록으로 남는다(`docs/repo-format.md` §6.2). 앱은 맥의 Claude에게 바로 묻고, 못 부르면 기록은 답 없는 채로 에이전트 차례에 잡힌다. `수정`이면 그 문단을 `edit_note`로 다시 고친 뒤 `answer_record`로 기록에 답한다.

## 쓰기 전에

- 맥에서 Emergence Workbench 앱(설치한 서비스, 기본 `http://127.0.0.1:5174`)이 켜져 있어야 한다. 꺼져 있으면 도구가 "Cannot reach the Emergence Workbench app server"라고 답하고 아무것도 하지 않는다.
- 다른 주소의 서버를 쓰려면 환경 변수 `RW_URL`을 준다. 예제 모드(`pnpm dev`)는 `RW_URL=http://127.0.0.1:8130`.

## 등록

맥 설치(`zsh scripts/install.sh`, [mac-setup.ko.md](mac-setup.ko.md))가 아래 둘을 저절로 등록한다. 따로 하려면 `pnpm agents:register`(`scripts/register-agents.sh`: 이미 있으면 건너뛰고, 앱 폴더를 옮겼으면 다시 등록). 손으로 할 때는 앱 저장소 폴더 경로를 `<앱 폴더>`에 넣는다. 연구 저장소에는 아무 파일도 더하지 않는다(사용자 범위 등록).

**Claude Code**

```sh
claude mcp add --scope user emergence-workbench -- node <앱 폴더>/scripts/mcp.mjs
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.emergence-workbench]
command = "node"
args = ["<앱 폴더>/scripts/mcp.mjs"]
```

앱 폴더 안에서는 `pnpm mcp`로도 띄운다(표준 입출력 MCP라 직접 칠 일은 없다).

도구 이름과 설명은 영어다(앱 화면 언어와 상관없이 에이전트가 읽는다).

## 도구 (edit_note · edit_concept · answer_record · add_record · flow_add · flow_update · flow_review · add_task · report_task · add_journal 말고는 읽기 전용)

연결할 때 서버가 일의 갈래마다 어떤 도구를 어떤 순서로 쓰는지 알려 준다(`apps/server/src/mcp.ts`의 `INSTRUCTIONS`): `rules` → `overview` → `project_status`로 시작한다. 도구를 더하거나 이름을 바꾸면 그 순서도 고친다. `mcp.test.ts`가 거기 적은 이름이 모두 실제 도구인지 본다.

| 도구 | 하는 일 | 부르는 API |
| --- | --- | --- |
| `rules` | 일하기 전에 읽을 규칙: 안전 규칙, 연구 공통 규칙(모든 연구 저장소에 통하는 한 파일, 개인 저장소 사본에 `rules/research.md`가 있을 때), `project`를 주면 그 연구 저장소의 `AGENTS.md` · `CLAUDE.md`. 일부 일에만 필요한 긴 규칙은 이름과 크기만 적고, `part`로 하나를 받는다: `tasks`(맡긴 일 규칙, `docs/agent-delegated-work.md`), `concepts`(공유 라이브러리 README의 개념노트 절). 먼저 읽는다 | `GET /api/rules/common`, (앱 폴더의 문서), `GET /api/concepts/rules`, `GET …/:rid/agent-rules` |
| `list_projects` | 등록한 프로젝트: id · 제목 · 저장소 경로 · 진행 상태 | `GET /api/researches` |
| `overview` | 진행 중인 모든 프로젝트를 한 표로: 사용자 차례(확인할 노트 · 판단할 맡긴 일 · 에이전트 고침, 홈의 "확인 필요"와 같은 수), 에이전트 차례(답 없는 질문 · 진행 중 맡긴 일 · 할 일), 저장소 동기화, 최근 기록. 어디서 일할지 고를 때 | `GET /api/agent-overview` |
| `project_status` | 짧은 프로젝트 요약: 머리 · 목표 · 지금 할 것을 말하는 절(할 일, 맡긴 일, 흐름 요약, 대기 중인 질문·지시, 검토 대기)만 싣고, 다른 절은 이름과 크기만 적는다. `section`은 `workbench/STATUS.md`의 절 하나, `full`은 전부 | `GET …/:rid/agent-status?view=summary`, `?section=<절 이름>` |
| `list_notes` | 노트 목록: 본문 파일 · 기록 이름 `target`(Markdown 노트·블록 노트, `main.tex`에는 없음) · 상태 · 다시 열 조건 · 주제 (`status`로 거르기) | `GET …/:rid/notes` |
| `list_edit_reviews` | 에이전트 수정 검토 대기와 허락 대기. 선택 인자 `project`를 주면 그 프로젝트만, 없으면 모든 프로젝트와 개념노트 | `GET /api/agent-edits?scope=` |
| `read_note` | 노트 본문과 hash | `GET …/:rid/manuscript/part`, 블록 노트는 `GET …/:rid/blocks/:id` |
| `read_records` | 노트·프로젝트 기록(메모 · 할 일 · 질문과 답 · 하이라이트)과 hash. 대상은 `project` · `note-<폴더>` · `topic-<id>` · `flow-<id>` 등이고, `part` · `partText`는 사용자가 가리킨 화면 부위다 | `GET …/:rid/comments/:target` |
| `list_records` | 프로젝트의 모든 기록(프로젝트 · 노트 · 주제 · 흐름 점, 하이라이트 제외)을 한 목록으로, 종류 · 상태 · 대상(정확히 또는 `topic-`처럼 앞부분)으로 거른다. `unanswered: true`면 답을 기다리는 사용자의 질문과 지시(10/15: 에이전트가 하고 나서 답하는 기록)만. `replied: true`면 에이전트가 물은 질문에 사용자가 답한 것(답을 반영하고 `answer_record`로 답하면 끝냄), `unsorted: true`면 "자동"으로 남기고 아직 분류하지 않은 기록. `by`는 기록을 쓴 에이전트(없으면 사용자), 답 이름 `사용자`는 사용자가 이어 쓴 것. 줄은 짧다(본문과 마지막 답은 300자까지, 답 수). `full: true`면 전부. 앱 서버 없이는 `pnpm agent:records <저장소>`가 같은 줄을, `pnpm agent:answer <저장소> <대상> <id> "<답>"`이 같은 답을 쓴다 | `GET …/:rid/records` |
| `list_tasks` · `read_task` | 맡긴 일 목록과 하나의 모든 칸 | `GET …/:rid/tasks`, `…/tasks/:id` |
| `add_task` | 할 일 · 인계 · 새 일 제안을 작업 파일로 만든다 `{ title, task, endCondition?, topic?, agent?, references?, avoid? }`. `workbench/tasks/*.md`를 직접 쓰지 않는다 | `POST …/:rid/tasks` |
| `report_task` | 진행(`working`) 중인 맡긴 일의 보고를 `read_task`의 hash와 함께 쓴다. `kind: proposal`과 `endCondition`(과 `reason`) → `proposed`. `kind: result`와 `conclusion` · `endCheck` · `summary` · `evidence`, 고르면 `ask` · `issues` · `next` · `outputs` · `checkMachine` → `result`. YAML 머리말(쉼표 · 콜론에 깨지지 않게)과 본문 두 절은 앱이 쓰고, 절에 이미 글이 있으면 지우지 않고 시각 `###` 머리 아래 덧붙인다. `done`은 쓰지 않는다 | `POST …/:rid/tasks/:id/report` |
| `add_journal` | 오늘 일지에 메모 한 줄 `{ text, target? }`(한 일과 고친 파일). `workbench/log/<날짜>.md`를 직접 쓰지 않는다 | `POST …/:rid/journal` |
| `search_library` | 개념노트 · 논문 찾기 (이름 · 다른 이름 · 저자 · 연도 · arXiv 번호). 개념노트는 본문으로도 찾고, 맞은 줄마다 `hits`(본문 줄 번호 · 그 줄의 절 제목 · 줄 글)를 붙인다. 노트 전체 대신 그 절만 보면 된다 | `GET /api/search/catalog`, `GET /api/concepts/search` |
| `read_concept` | 개념노트 머리말 · 본문 · hash와 확인 상태(ok · changed · none) | `GET /api/concepts/:id` |
| `edit_note` | 프로젝트 노트(원고 제외)를 글 바꾸기 `{ old, new, reason }`로 고친다. `reason`은 꼭 적는다: 왜 바꿨는지 한 줄로, 바뀐 문단 아래에 보인다. `read_note`의 hash를 보낸다. 바로 쓰고 사용자가 문단마다 검토한다. 상태가 해결인 노트는 첫 시도를 428로 거절하고 사용자에게 알린다. 대화에서 허락을 받은 뒤 `approved: true`로 다시 보낸다 | `POST /api/agent-edits/write` |
| `edit_concept` | 개념노트 본문에 같은 일(머리말은 그대로). `checked: ok`인 노트도 같은 허락이 필요하고, 잠긴 노트는 고치지 않는다 | `POST /api/agent-edits/write` |
| `flow_search` | 프로젝트 흐름에서 낱말이 맞는 지난 점(제목 · 설명 칸 · 실행 매개변수 · 이유)을 잘 맞는 것부터 한 줄씩: 상태 · 매개변수 · 결과 · 반증·폐기한 이유. 계산·증명을 시작하기 전에 본다 | `GET …/:rid/flow/search?q=` |
| `flow_read` | 흐름 점 하나의 모든 칸, 근거와 단계의 확인, 앱이 찾은 빈틈 | `GET …/:rid/flow/:id` |
| `flow_add` | 일을 시작할 때 점을 더한다(대개 `active`, 판정 기준과 함께). 발견이 아닌 일은 `pnpm agent:start`와 같은 시작 기록 문을 지난다(`docs/repo-format.md` §14 "시작 기록"): 가장 가까운 점 `prior`와 `adds`, 또는 `novel`, 그리고 `criterion`. 거절하면 걸린 점을 보이고, 답에는 `matched`로 보인다. `progress: open`(나중에 할 질문)은 문을 건너뛴다. 함께 준 칸은 `flow_update`와 같은 해결 문턱을 지난다 | `POST …/:rid/flow/start`(발견 · `open`은 `POST …/:rid/flow`) 뒤 `PATCH …/:rid/flow/:id`(`gate: true`) |
| `flow_update` | 점을 고친다. 필수 칸이 비면 끝냄(`done`) · 멈춤을 거절하고 빈 칸 이름을 알린다(`docs/repo-format.md` §14 "해결 문턱"). 질문 문장 · 발단 선 · 갈래 폐기는 사용자가 정하므로 거절한다 | `PATCH …/:rid/flow/:id`(`gate: true`) |
| `flow_review` | 근거 하나(`ev`)나 증명 단계 하나(`step`)의 에이전트 검토를 `role: agent`로, 확인한 내용의 hash와 함께 남긴다 | `POST …/:rid/flow/:id/review` |
| `answer_record` | 질문 · 지시 기록 아래에 답을 쓴다 `{ target, id, answer }`. 지시는 먼저 그 일을 하고(노트는 `edit_note`) 답한다. 답 머리에 에이전트 이름이 붙고 기록은 답함이 된다. 덧붙이기라 hash가 없다 | `POST …/:rid/comments/:target/:id/answers` |
| `add_record` | 사용자에게 남기는 기록 `{ file 또는 target, kind: 질문 \| 메모, text, quote?, line? }`. `by`에 에이전트 이름이 적힌다. 질문은 사용자에게 확인 · 결정을 부탁하는 것(예: 에이전트가 쓴 노트의 한 곳, `quote`로 그 자리에 붙인다)으로, 사용자가 앱에서 답할 때까지 사용자 차례다(앱에서 주황, 홈 "확인 필요"에 셈). 사용자가 답하면 `### 답 · 사용자`가 붙고 답함이 된다. 답은 `read_records`로 읽는다. 덧붙이기라 hash가 없다 | `POST …/:rid/comments/:target` |
| `app_submit` | 앱 고치기 대화(앱 안에서 앱 자체를 고치는 에이전트, 10/21) 안에서만. 그 대화의 작업 폴더(따로 둔 git worktree)에서 바뀐 것을 모두 커밋해 `claude/app-…` 브랜치를 올리고 PR `{ title, body }`을 연다(이미 있으면 더한다). 대화마다 자기 브랜치라 다른 PR이 열려 있어도 올린다. 그 대화의 에이전트는 작업 폴더에서 검사(형식 검사 · 시험 · 화면 그림)를 스스로 돌리지만, 올리기 · PR · 합치기와 앱 서비스는 하지 않는다. GitHub CI가 한 번 더 돌린다 | `POST /api/agent-chats/:id/app/submit` |
| `app_checks` | 앱 고치기 대화 안에서만. 그 PR의 CI: 검사마다 상태, `done`, `ok`, 실패한 기록의 끝부분. `wait`(분, 10까지)를 주면 끝날 때까지 기다린다 | `GET /api/agent-chats/:id/app/checks` |
| `feedback_answer` | 피드백을 맡은 앱 고치기 대화 안에서만(피드백 화면의 「에이전트에게 맡기기」). 처리 기록(`status.yaml`)을 앱이 적는다: 상태와 답, 또는 코멘트 답. 수정 요청을 다시 처리하면 그 전 처리를 `revised`로 옮긴다. `after` = 그 PR의 CI가 찍은 화면 그림 이름, 남길 때 그림과 함께 전/후로 둔다 | `POST /api/agent-chats/:id/feedback/answer` |

## 지키는 것

- 노트 · 개념노트는 `edit_note` · `edit_concept`를 먼저 쓴다(사용자가 바뀐 문단마다 검토한다). 그 밖은 앱 서버 API(`GET /api`가 대표 경로와 쓰는 법을, `GET /api?all=1`이 모든 경로를 준다)에 읽을 때 받은 hash를 `baseHash`로 보낸다. 그사이 바깥에서 바뀌었으면 409로 거절된다. 새로 만들기·덧붙이기·한 칸만 고치기는 hash가 없고, 일지 고치기는 기록의 지금 글을 `was`로 보낸다. 예외는 `GET /api`와 `docs/repo-format.md` §12에 있다.
- 앱 서버가 꺼져 있을 때도 저장소 파일을 직접 고칠 수 있다. 서버에 닿지 못하면 사용자에게 알리고, 직접 고칠 때는 `docs/repo-format.md`를 따르며 고친 뒤 `pnpm --dir <앱 폴더> agent:check <저장소>`로 검사한다. 사용자가 확인한 노트·개념노트는 여전히 대화에서 허락을 받아야 하고, 원고는 사용자가 요청할 때만 고친다. 잠긴 개념노트는 고치지 않는다.
- 지시: 설정 › 에이전트에서 맥의 Claude가 직접 할지(바로, 또는 고른 시각에 하루 한 번) 고른다(처음 값은 하지 않음: 에이전트 세션이 집어 간다). 맥의 Claude는 한 번에 하나씩 읽기 도구만으로 하고 `claude`로 답하며, 노트 고침은 사용자가 적용하는 고침 블록으로 적는다. 이미 답한 기록은 `unanswered`에 없다.
- `list_edit_reviews`나 프로젝트 요약에서 검토 대기를 확인한다. 사용자가 되돌린 문단을 다시 넣지 않는다. 프로젝트 노트·블록 노트의 에이전트 고침을 되돌리면 프로젝트 일지에 상태 기록을 남긴다. 개념노트에는 프로젝트 일지가 없어 이 기록을 남기지 않는다.
- 각 연구 저장소의 `AGENTS.md` · `CLAUDE.md` 규칙이 이 입구보다 앞선다.
- 코드: `apps/server/src/mcp.ts`(도구), `scripts/mcp.mjs`(표준 입출력 시작), 테스트 `apps/server/src/mcp.test.ts`.

## 앱이 띄우는 대화 (에이전트 대화, 10/21)

앱이 맥의 Claude Code를 직접 띄울 수도 있다(Claude Agent SDK, `apps/server/src/agentChats.ts` · `agentRunner.ts`, API `/api/agent-chats`). 대화마다 프로젝트 하나에 속하고 범위(프로젝트 · 주제 하나 · 노트 하나)와 고치기 단계(읽기만 · 노트와 기록)가 있다. 같은 MCP 도구를 같은 프로세스에서 붙이고, 도구 호출마다 앱이 정한다.

- 프로젝트 · 공용 라이브러리 · 등록한 다른 프로젝트는 읽는다. 범위 밖을 읽으면 대화에 「범위 밖」으로 보인다. 그 밖의 폴더는 사용자에게 묻는다.
- 파일을 바로 쓰지 못한다(`Write` · `Edit` …). 노트는 `edit_note`로만 고쳐 수정 검토에 오른다. 범위 밖 · 다른 프로젝트 · 개념노트 고치기는 막고, 무엇을 어디서 고쳐야 하는지 말하게 한다.
- 노트를 고치는 동안 그 파일을 잡아, 차례가 끝날 때까지 다른 대화가 고치지 못한다. `GET /api/agent-work`가 도는 대화와 잡은 파일을 돌려준다.
- 명령 · 웹 · 모르는 도구는 사용자에게 묻는다(허락 카드). 「늘」은 그 대화의 같은 명령에만이고, 늘 허락한 것은 하나씩 지운다(`POST /api/agent-chats/<id>/forget`).
- 권한은 대화마다 하나(`mode`와 `write`): 읽기 전용 · 묻고 하기(노트 고치기도 하나씩 묻는다) · 편집 자동 허용 · 계획 모드(SDK plan 모드. `ExitPlanMode`의 계획 카드를 승인하기 전에는 노트 고치기를 막는다). 모델과 생각(`low` · `medium` · `high` · `xhigh` · `max`, 그 모델이 받는 것만)은 대화 중에 바꾸고(`POST /api/agent-chats/<id>/settings`) 다음 차례부터 적용된다. 고를 수 있는 모델은 맥의 Claude Code에게 물어 버전까지 보인다(`GET /api/agent-chats/models`: 별칭 `default` · `opus` · `sonnet` · `haiku`와 `claude-opus-5` 같은 id, 실제 모델 `resolved`, 받는 생각 깊이. 지시 없이 띄워 묻고 30분 기억, 못 띄우면 빈 목록). `default`는 그 계정의 Claude Code 기본값이다(사용자 설정은 읽지 않는다).
- 말에 붙인 것(`attach`: 노트 · 주제 · 파일 · 고른 글 · 논문 · 기록, 에이전트가 먼저 읽는다)과 그림 넷까지 함께 보낸다. 도는 동안 보낸 말은 기다렸다가 다음 차례로 돈다. `TodoWrite`는 차례마다 할 일 카드 하나로, 허락된 `edit_note`는 노트 고침 카드(+/−, 수정 검토로)로 보이고, 대화는 `todos`와 바뀐 파일을 둔다.
- 동시에 둘까지 돌고 나머지는 줄을 선다. Claude Code의 저장소 · 사용자 설정(훅 · 허락 규칙)은 읽지 않는다. 대화는 연구 저장소가 아니라 앱 설정 폴더(`agent-chats/<id>.json`)에 둔다.
