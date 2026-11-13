# 에이전트용 입구 (MCP)

[English](agent-mcp.md)

Claude Code · Codex 같은 에이전트가 Emergence Workbench의 프로젝트 · 노트 · 기록 · 맡긴 일 · 개념노트를 **앱 서버를 거쳐** 읽는 입구다. MCP 도구는 파일을 직접 열지 않고 앱과 같은 API를 쓰므로, 앱 화면과 같은 내용 · 같은 hash를 본다. 쓰기 도구는 노트를 고치는 `edit_note` · `edit_concept`(10/8 에이전트 고침 검토)와 질문 · 지시 기록에 답하는 `answer_record`(10/15), 사용자에게 묻거나 남기는 기록을 에이전트 이름으로 쓰는 `add_record`(10/15), 그리고 맡긴 일을 만들고 보고하며 오늘 일지에 적는 `add_task` · `report_task` · `add_journal`(10/21)이다. 에이전트는 `workbench/STATUS.md`를 읽거나 workbench 파일을 직접 고치는 대신 이 도구를 쓴다: 출력이 짧고 한 일이 앱에 보인다(10/21: 연구 저장소의 에이전트가 40KB 남짓한 STATUS.md를 읽고 맡긴 일 · 일지 파일을 손으로 고치고 있었다). 고치기 도구는 에이전트는 바로 쓰고, 앱이 고치기 전 글을 기준판으로 남기며, 사용자가 고침 검토 화면(연구노트는 그 프로젝트의 "고침 검토" `#/r/<연구>/edits`, 개념노트는 `#/review`)에서 바뀐 문단마다 승인 · 되돌리기 · 고치기를 고른다. 사용자가 확인한 노트는 대화에서 먼저 허락을 받는다. 고칠 때마다 어느 에이전트가 고쳤는지 적힌다. 이름은 클라이언트가 연결할 때 보내는 이름(`clientInfo.name`)에서 온다: Claude Code는 `claude-code`, Codex는 `codex`, 그 밖에는 보낸 그대로다. 클라이언트가 스스로 밝힌 값이라 앱이 검증하지는 않는다. 에이전트가 앱을 거치지 않고 파일을 직접 고친 것은 여기 남지 않으니, 커밋 작성자로 확인한다. 앱을 거친 고침은 git에도 에이전트 이름으로 남는다(11/10): 고치기 전 그 파일에 사람의 커밋 안 한 고침이 없으면, 쓴 뒤 그 파일만 에이전트 이름(Claude · Codex · Gemini, `<이름>@agents.emergence-workbench`)으로 커밋해 올린다(`apps/server/src/agentCommit.ts`). 사람의 고침이 남아 있던 파일은 섞이지 않게 커밋하지 않고, 다음에 사람이 올릴 때 함께 올라간다. 검토 화면에서 사용자는 바뀐 문단마다 물을 수 있다(10/14): 물은 것은 `edit: 질문` 또는 `edit: 수정`이 붙은 노트 기록으로 남는다(`docs/repo-format.md` §6.2). 앱은 맥의 Claude에게 바로 묻고, 못 부르면 기록은 답 없는 채로 에이전트 차례에 잡힌다. `수정`이면 그 문단을 `edit_note`로 다시 고친 뒤 `answer_record`로 기록에 답한다.

## 쓰기 전에

- 맥에서 Emergence Workbench 앱(설치한 서비스, 기본 `http://127.0.0.1:5174`)이 켜져 있어야 한다. 꺼져 있으면 도구가 "Cannot reach the Emergence Workbench app server"라고 답하고 아무것도 하지 않는다.
- 다른 주소의 서버를 쓰려면 환경 변수 `RW_URL`을 준다. 예제 모드(`pnpm dev`)는 `RW_URL=http://127.0.0.1:8130`.

## 등록

앱의 설정 › 에이전트 › 연결에 에이전트마다 **연결** 버튼이 있다(11/8): Claude 앱(데스크톱)은 `claude_desktop_config.json`(맥 `~/Library/Application Support/Claude`, 윈도우 `%APPDATA%\Claude` 또는 스토어판의 `LocalCache\Roaming\Claude`)에 `emergence-workbench` 한 칸을 더하고(다른 칸은 그대로, 읽지 못하는 파일은 고치지 않음), Claude Code · Codex는 그 명령의 `mcp add`를 부른다(`POST /api/setup/agents/:key/register`, `mcpRegister.ts`). 입구는 앱의 node와 `scripts/mcp.mjs`라 Node가 없는 컴퓨터에서도 된다. 맥 설치(`zsh scripts/install.sh`, [mac-setup.ko.md](mac-setup.ko.md))가 Claude Code · Codex를 저절로 등록한다. 따로 하려면 `pnpm agents:register`(`scripts/register-agents.sh`: 이미 있으면 건너뛰고, 앱 폴더를 옮겼으면 다시 등록). 손으로 할 때는 앱 저장소 폴더 경로를 `<앱 폴더>`에 넣는다. 연구 저장소에는 아무 파일도 더하지 않는다(사용자 범위 등록).

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


## 도구 (new_note · edit_note · edit_concept · answer_record · add_record · problem_propose · problem_prepare · claim_add · attempt_add · attempt_start · attempt_report · attempt_verdict · direction_report · problem_exception · add_task · report_task · checkpoint_task · add_journal, 자기 기준만 옮기는 changes_since 말고는 읽기 전용)

연결할 때 서버가 일의 갈래마다 어떤 도구를 어떤 순서로 쓰는지 알려 준다(`apps/server/src/mcp.ts`의 `INSTRUCTIONS`): `rules` → `overview` → `project_status` → `changes_since`로 시작한다. 도구를 더하거나 이름을 바꾸면 그 순서도 고친다. `mcp.test.ts`가 거기 적은 이름이 모두 실제 도구인지 본다.

| 도구 | 하는 일 | 부르는 API |
| --- | --- | --- |
| `rules` | 일하기 전에 읽을 규칙: 안전 규칙, 연구 공통 규칙(모든 연구 저장소에 통하는 한 파일, 개인 저장소 사본에 `rules/research.md`가 있을 때), `project`를 주면 그 연구 저장소의 `AGENTS.md` · `CLAUDE.md`. 일부 일에만 필요한 긴 규칙은 이름과 크기만 적고, `part`로 하나를 받는다: `tasks`(맡긴 일 규칙, `docs/agent-delegated-work.md`), `concepts`(공유 라이브러리 README의 개념노트 절). 먼저 읽는다 | `GET /api/rules/common`, (앱 폴더의 문서), `GET /api/concepts/rules`, `GET …/:rid/agent-rules` |
| `list_projects` | 등록한 프로젝트: id · 제목 · 저장소 경로 · 진행 상태 | `GET /api/researches` |
| `overview` | 진행 중인 모든 프로젝트를 한 표로: 사용자 차례(확인할 노트 · 판단할 맡긴 일 · 에이전트 고침, 홈의 "확인 필요"와 같은 수), 에이전트 차례(답 없는 질문 · 진행 중 맡긴 일 · 할 일), 저장소 동기화, 최근 기록. 어디서 일할지 고를 때 | `GET /api/agent-overview` |
| `project_status` | 짧은 프로젝트 요약: 머리 · 목표 · 지금 할 것을 말하는 절(할 일, 맡긴 일, 흐름, 대기 중인 질문·지시, 검토 대기)만 싣고, 다른 절은 이름과 크기만 적는다. `section`은 `workbench/STATUS.md`의 절 하나, `full`은 전부 | `GET …/:rid/agent-status?view=summary`, `?section=<절 이름>` |
| `changes_since` | 이 에이전트가 지난번 부른 뒤 프로젝트에서 바뀐 것: 새 커밋(다른 맥에서 올린 것도 받은 뒤에는), 이 맥에서 아직 커밋하지 않은 고침, 그것이 건드린 노트 · 흐름과 시도 · 맡긴 일 · 기록 · 다른 파일을 작성자 · 시각과 함께 한 줄씩. 기준은 에이전트마다, Claude는 계정마다(Claude Code `.claude.json`의 `oauthAccount.accountUuid`를 `x-rw-account`로 보냄) 따로이고 부를 때마다 지금으로 옮긴다. `since`를 주면 그때부터, 처음에는 7일 전부터. 앱의 프로젝트 정보 › 변경사항이 같은 목록이다 | `POST …/:rid/changes/read` |
| `list_notes` | 노트 목록: 본문 파일 · 기록 이름 `target`(Markdown 노트, `main.tex`에는 없음) · 상태 · 다시 열 조건 · 주제 (`status`로 거르기) | `GET …/:rid/notes` |
| `list_edit_reviews` | 에이전트 수정 검토 대기와 허락 대기. 선택 인자 `project`를 주면 그 프로젝트만, 없으면 모든 프로젝트와 개념노트 | `GET /api/agent-edits?scope=` |
| `read_note` | 노트 본문과 hash | `GET …/:rid/manuscript/part` |
| `read_records` | 노트·프로젝트 기록(메모 · 할 일 · 질문과 답 · 하이라이트)과 hash. 대상은 `project` · `note-<폴더>` · `topic-<id>` 등이고, `part` · `partText`는 사용자가 가리킨 화면 부위다 | `GET …/:rid/comments/:target` |
| `list_records` | 프로젝트의 모든 기록(프로젝트 · 노트 · 주제, 하이라이트 제외)을 한 목록으로, 종류 · 상태 · 대상(정확히 또는 `topic-`처럼 앞부분)으로 거른다. `unanswered: true`면 답을 기다리는 사용자의 질문과 지시(10/15: 에이전트가 하고 나서 답하는 기록)만. `replied: true`면 에이전트가 물은 질문에 사용자가 답한 것(답을 반영하고 `answer_record`로 답하면 끝냄), `unsorted: true`면 "자동"으로 남기고 아직 분류하지 않은 기록. `by`는 기록을 쓴 에이전트(없으면 사용자), 답 이름 `사용자`는 사용자가 이어 쓴 것. 줄은 짧다(본문과 마지막 답은 300자까지, 답 수). `full: true`면 전부. 앱 서버 없이는 `pnpm agent:records <저장소>`가 같은 줄을, `pnpm agent:answer <저장소> <대상> <id> "<답>"`이 같은 답을 쓴다 | `GET …/:rid/records` |
| `list_tasks` · `read_task` | 맡긴 일 목록과 하나의 모든 칸 | `GET …/:rid/tasks`, `…/tasks/:id` |
| `add_task` | 할 일 · 인계 · 새 일 제안을 작업 파일로 만든다 `{ title, task, endCondition?, topic?, agent?, references?, avoid? }`. `workbench/tasks/*.md`를 직접 쓰지 않는다 | `POST …/:rid/tasks` |
| `report_task` | 진행(`working`) 중인 맡긴 일의 보고를 `read_task`의 hash와 함께 쓴다. `kind: proposal`과 `endCondition`(과 `reason`) → `proposed`. `kind: result`와 `conclusion` · `endCheck` · `summary` · `evidence`, 고르면 `ask` · `issues` · `next` · `outputs` · `checkMachine` → `result`. YAML 머리말(쉼표 · 콜론에 깨지지 않게)과 본문 두 절은 앱이 쓰고, 절에 이미 글이 있으면 지우지 않고 시각 `###` 머리 아래 덧붙인다. `done`은 쓰지 않는다 | `POST …/:rid/tasks/:id/report` |
| `checkpoint_task` | 진행 · 멈춤인 맡긴 일의 지금 상태 한 줄(`checkpoint`, `checkpoint-at`)을 `read_task`의 hash와 함께 덮어쓴다: 방금 한 일, 자리, 다음 할 일. 고비마다(가설 확인 · 반증, 막힘, 다음 단계) 부른다. 작업 탭 줄 · 카드와 STATUS 맡긴 일 절에 보이고, 결과를 보고하면 지워진다 (2026-10-30) | `POST …/:rid/tasks/:id/checkpoint` |
| `add_journal` | 오늘 일지에 메모 한 줄 `{ text, target? }`(한 일과 고친 파일). `workbench/log/<날짜>.md`를 직접 쓰지 않는다 | `POST …/:rid/journal` |
| `search_library` | 개념노트 · 논문 찾기 (이름 · 다른 이름 · 저자 · 연도 · arXiv 번호). 개념노트는 본문으로도 찾고, 맞은 줄마다 `hits`(본문 줄 번호 · 그 줄의 절 제목 · 줄 글)를 붙인다. 노트 전체 대신 그 절만 보면 된다 | `GET /api/search/catalog`, `GET /api/concepts/search` |
| `read_concept` | 개념노트 머리말 · 본문 · hash와 확인 상태(ok · changed · none) | `GET /api/concepts/:id` |
| `new_note` | 빈 Markdown 노트 `{ project, name, kind: note \| calc }`를 만들고 경로를 돌려준다(11/8: 에이전트도 노트를 만들게). 내용은 `edit_note`로 채워 수정 검토에 올린다. 다른 쓰기처럼 읽기만 하는 대화에서는 거절 | `POST /api/researches/:rid/notes` |
| `edit_note` | 프로젝트 노트(원고 제외)를 글 바꾸기 `{ old, new, reason }`로 고친다. `reason`은 꼭 적는다: 왜 바꿨는지 한 줄로, 바뀐 문단 아래에 보인다. `read_note`의 hash를 보낸다. 바로 쓰고 사용자가 문단마다 검토한다. 상태가 해결인 노트는 첫 시도를 428로 거절하고 사용자에게 알린다. 대화에서 허락을 받은 뒤 `approved: true`로 다시 보낸다 | `POST /api/agent-edits/write` |
| `edit_concept` | 개념노트 본문에 같은 일(머리말은 그대로). `checked: ok`인 노트도 같은 허락이 필요하고, 잠긴 노트는 고치지 않는다 | `POST /api/agent-edits/write` |
| `problems` | 프로젝트의 흐름(`workbench/problems/`, `docs/repo-format.md` §16): id · 질문 · 상태(진행 = 사용자가 시작해 에이전트가 일할 수 있음, 쓰는 중, 제안, 종료) · 시도 수/한도 · 다음 후보 · 멈춘 이유. 앱 서버가 없는 곳(클라우드)에서는 아래 흐름 도구 열두 개를 `pnpm agent:problem <폴더> …`가 같은 규칙으로 대신한다(§16 "서버 없이 쓰기") | `GET …/:rid/problems` |
| `problem_brief` | 흐름 하나를 이어받는 데 필요한 것만 3KB 안에: 질문, 사용자의 메시지와 독자, 채점, 주장(번호 · 계산된 상태 · 진술 · 근거가 된 시도), 폐기 사유, 판정 대기, 다음 후보, 한도. 먼저 이것을 읽는다 | `GET …/:rid/problems/:id/brief` |
| `problem_read` | 흐름의 모든 칸과 주장 · 시도 전체(진술 · 조건 · 작업 내용 · 결과 · 파일 · 판정 · 방향 보고와 결정). `claim`을 주면 그 주장과 그것을 겨눈 시도 · 바로 아래 주장만, `attempt`를 주면 그 시도만 | `GET …/:rid/problems/:id` |
| `problem_propose` | 일하다 떠오른 질문을 출처와 함께 제안으로 올린다 `{ question, source }`. 사용자가 받아 메시지를 쓰고 시작해야 흐름이 된다. 메시지 · 독자 · 가치 의견은 적지 않는다 | `POST …/:rid/problems` |
| `problem_prepare` | 사용자가 판단하는 데 쓸 사실을 더한다: 문헌 대조 `literature`(논문마다 사실 한 줄), 첫 시험 `first_test`, 채점 `grading` | `PATCH …/:rid/problems/:id` |
| `claim_add` | 진행 흐름에 주장을 먼저 세운다 `{ statement, condition?, under?, side? }`: 판단할 수 있는 한 문장. `under`를 주면 그 주장의 근거가 되고, 질문 바로 아래면 쪽 `side`(`for_yes` · `for_no` · `neither`)가 있어야 한다. 주장의 상태는 적지 않는다(근거에서 계산된다) | `POST …/:rid/problems/:id/claims` |
| `attempt_add` | 진행 흐름에 후보 방법을 한 줄씩 늘어놓는다. 항목의 `claim`에 겨눌 주장의 번호를 적고, 없으면 질문을 바로 겨눈다. 일하기 전에 먼저 늘어놓고, 순서는 사용자가 바꿀 수 있다 | `POST …/:rid/problems/:id/attempts` |
| `attempt_start` | 후보 하나를 자기 이름으로 시작한다. `attempt`가 없으면 다음 후보. 한도 · 폐기 셋 · 결정 대기에서는 거절하므로 `direction_report`를 낸다 | `POST …/attempts/:aid/start` |
| `attempt_report` | 시작한 시도의 한 일과 결과를 사실로(숫자 · 크기 · 매개변수 · 실패한 자리), 원자료 · 코드 · 노트 파일과 함께 보고한다. 겨눈 주장을 그대로 받치면 진술을 적지 않는다. 해 보니 참인 것이 그와 다르면 진술 `statement`(맞는지 틀리는지 가릴 수 있는 한 문장)와 조건 `condition`(선택)을 적는다: 그 진술이 겨눈 주장 아래의 새 주장이 되고 이 시도가 그 근거가 된다. 질문을 바로 겨눈 시도면 새 주장은 질문 바로 아래에 생기고 쪽 `side`(`for_yes` · `for_no` · `neither`)가 있어야 한다. 주장 없이 질문을 겨눈 채로는 성립이 되지 못한다. 결과를 낸 명령 `command`(커밋은 앱이 적는다)와, 있으면 판정하는 쪽이 다시 돌릴 검사 명령 `test`도 적는다. 성립 여부는 정하지 않는다 | `POST …/attempts/:aid/report` |
| `attempt_verdict` | 다른 쪽이 작업한 시도를 원자료로 판정한다. 판정이 답하는 것은 하나다: 이 시도가 겨눈 주장이 이 시도의 근거(결과 · 파일 · 검사)에서 따라 나오는가. 흐름의 질문에 답하지 않고, 주장을 사실로 받아들이는 승인은 사용자가 흐름을 닫을 때 한다. 근거 `note`, 성립은 교차 검증 `check`, 폐기는 폐기 사유 `lesson`. 검사 명령이 있으면 다시 돌린 결과 `tested`(성립에는 `pass`). 성립이면 앱이 파일 지문을 남겨 뒤에 바뀌면 알린다. 자기가 작업한 시도는 거절 | `POST …/attempts/:aid/verdict` |
| `direction_report` | 멈췄거나 결과가 질문에서 벗어날 때, 사용자의 메시지에 맞춰 사실만 나눠 적고 선다(`for_yes` · `for_no` · `neither`). 계속할지는 권하지 않는다 | `POST …/:rid/problems/:id/report` |
| `problem_exception` | 흐름의 규칙대로 되지 않은 일을 한 줄 적는다 `{ kind, what, instead?, problem?, attempt? }`: `no-claim` 진술 불가(결과를 판단할 수 있는 한 문장으로 적지 못함) · `no-verdict` 판정 불가(원자료 없음 · 다시 돌리지 못함 · 진술이 모호함) · `needs-user` 결정 필요(사용자 차례가 아닌 곳에서 결정이 필요함) · `workaround` 우회 · `other` 기타. 사실만 적는다. 앱이 규칙으로 거절한 요청은 앱이 적는다. 사용자가 흐름 화면에서 보고 이 구조를 평가하는 데 쓴다 | `POST …/:rid/problem-exceptions` |
| `problem_exceptions` | 프로젝트의 예외 기록을 새 것부터 읽는다(`problem`을 주면 그 흐름만) | `GET …/:rid/problem-exceptions` |
| `answer_record` | 질문 · 지시 기록 아래에 답을 쓴다 `{ target, id, answer }`. 지시는 먼저 그 일을 하고(노트는 `edit_note`) 답한다. 답 머리에 에이전트 이름이 붙고 기록은 답함이 된다. 덧붙이기라 hash가 없다 | `POST …/:rid/comments/:target/:id/answers` |
| `add_record` | 사용자에게 남기는 기록 `{ file 또는 target, kind: 질문 \| 메모, text, quote?, line? }`. `by`에 에이전트 이름이 적힌다. 질문은 사용자에게 확인 · 결정을 부탁하는 것(예: 에이전트가 쓴 노트의 한 곳, `quote`로 그 자리에 붙인다)으로, 사용자가 앱에서 답할 때까지 사용자 차례다(앱에서 주황, 홈 "확인 필요"에 셈). 사용자가 답하면 `### 답 · 사용자`가 붙고 답함이 된다. 답은 `read_records`로 읽는다. 덧붙이기라 hash가 없다 | `POST …/:rid/comments/:target` |
| `app_submit` | 앱 고치기 대화(앱 안에서 앱 자체를 고치는 에이전트, 10/21) 안에서만. 그 대화의 작업 폴더(따로 둔 git worktree)에서 바뀐 것을 모두 커밋해 `claude/app-…` 브랜치를 올리고 PR `{ title, body }`을 연다(이미 있으면 더한다). 대화마다 자기 브랜치라 다른 PR이 열려 있어도 올린다. 그 대화의 에이전트는 작업 폴더에서 검사(형식 검사 · 시험 · 화면 그림)를 스스로 돌리지만, 올리기 · PR · 합치기와 앱 서비스는 하지 않는다. GitHub CI가 한 번 더 돌린다 | `POST /api/agent-chats/:id/app/submit` |
| `app_checks` | 앱 고치기 대화 안에서만. 그 PR의 CI: 검사마다 상태, `done`, `ok`, 실패한 기록의 끝부분. `wait`(분, 10까지)를 주면 끝날 때까지 기다린다 | `GET /api/agent-chats/:id/app/checks` |
| `feedback_answer` | 피드백을 맡은 앱 고치기 대화 안에서만(피드백 화면의 「에이전트에게 맡기기」). 처리 기록(`status.yaml`)을 앱이 적는다: 상태와 답, 또는 코멘트 답. 수정 요청을 다시 처리하면 그 전 처리를 `revised`로 옮긴다. `after` = 그 PR의 CI가 찍은 화면 그림 이름, 남길 때 그림과 함께 전/후로 둔다 | `POST /api/agent-chats/:id/feedback/answer` |

## 지키는 것

- 노트 · 개념노트는 `edit_note` · `edit_concept`를 먼저 쓴다(사용자가 바뀐 문단마다 검토한다). 그 밖은 앱 서버 API(`GET /api`가 대표 경로와 쓰는 법을, `GET /api?all=1`이 모든 경로를 준다)에 읽을 때 받은 hash를 `baseHash`로 보낸다. 그사이 바깥에서 바뀌었으면 409로 거절된다. 새로 만들기·덧붙이기·한 칸만 고치기는 hash가 없고, 일지 고치기는 기록의 지금 글을 `was`로 보낸다. 예외는 `GET /api`와 `docs/repo-format.md` §12에 있다.
- 앱 서버가 꺼져 있을 때도 저장소 파일을 직접 고칠 수 있다. 서버에 닿지 못하면 사용자에게 알리고, 직접 고칠 때는 `docs/repo-format.md`를 따르며 고친 뒤 `pnpm --dir <앱 폴더> agent:check <저장소>`로 검사한다. 사용자가 확인한 노트·개념노트는 여전히 대화에서 허락을 받아야 하고, 원고는 사용자가 요청할 때만 고친다. 잠긴 개념노트는 고치지 않는다.
- 지시: 설정 › 에이전트에서 맥의 Claude가 직접 할지(바로, 또는 고른 시각에 하루 한 번) 고른다(처음 값은 하지 않음: 에이전트 세션이 집어 간다). 맥의 Claude는 한 번에 하나씩 읽기 도구만으로 하고 `claude`로 답하며, 노트 고침은 사용자가 적용하는 고침 블록으로 적는다. 이미 답한 기록은 `unanswered`에 없다.
- `list_edit_reviews`나 프로젝트 요약에서 검토 대기를 확인한다. 사용자가 되돌린 문단을 다시 넣지 않는다. 프로젝트 노트의 에이전트 고침을 되돌리면 프로젝트 일지에 상태 기록을 남긴다. 개념노트에는 프로젝트 일지가 없어 이 기록을 남기지 않는다.
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

## 상태 알리기 훅 (2026-10-30)

설정 › 에이전트 › 상태 알리기를 켜면 터미널에서 도는 Claude Code와 Codex가 MCP 도구를 부르지 않아도 앱에 상태를 알린다. 켜면 `~/.claude/settings.json`에 이벤트마다 훅 명령 하나(`UserPromptSubmit` → 일하는 중, `Notification` → 사용자를 기다림, `Stop` → 차례 끝남, `SessionEnd` → 뺌)를, `~/.codex/config.toml` 맨 위에 `notify` 한 줄(차례 끝남)을 넣는다. Codex는 `notify`를 하나만 받으므로, 원래 한 줄짜리 `notify` 배열이 있으면 앱 줄의 `--` 뒤로 옮기고 스크립트가 알린 뒤 같은 인자로 그것을 부른다. 끄면 원래 줄로 되돌린다. 명령은 `<설정 폴더>/agent-hooks/emergence-workbench-hook.sh`를 돌리고, 스크립트는 `endpoint.env`(서버가 뜰 때마다 다시 씀)에서 서버 주소를 읽어 `POST /api/agent-hooks`로 보낸다. 앱이 꺼져 있으면 아무것도 하지 않는다. 끄면 앱이 넣은 줄(스크립트 이름으로 알아봄)만 뺀다. 앱은 세션마다 마지막 상태를 메모리에 12시간 둔다(`GET /api/agent-hooks`). 앱 안 대화는 사용자 설정을 읽지 않으므로 여기에 오지 않는다.
