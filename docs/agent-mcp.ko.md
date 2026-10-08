# 에이전트용 입구 (MCP)

[English](agent-mcp.md)

Claude Code · Codex 같은 에이전트가 Emergence Workbench의 프로젝트 · 노트 · 기록 · 맡긴 일 · 개념노트를 **앱 서버를 거쳐** 읽는 입구다. 파일을 직접 열지 않고 앱과 같은 API를 쓰므로, 앱 화면과 같은 내용 · 같은 hash를 본다. 쓰기 도구는 `edit_note` · `edit_concept` 둘뿐이다(10/8 에이전트 고침 검토): 에이전트는 바로 쓰고, 앱이 고치기 전 글을 기준판으로 남기며, 사용자가 고침 검토 화면(`#/review`)에서 바뀐 문단마다 승인 · 되돌리기 · 고치기를 고른다. 사용자가 확인한 노트는 대화에서 먼저 허락을 받는다. 고칠 때마다 어느 에이전트가 고쳤는지 적힌다. 이름은 클라이언트가 연결할 때 보내는 이름(`clientInfo.name`)에서 온다: Claude Code는 `claude-code`, Codex는 `codex`, 그 밖에는 보낸 그대로다. 클라이언트가 스스로 밝힌 값이라 앱이 검증하지는 않는다. 에이전트가 앱을 거치지 않고 파일을 직접 고친 것은 여기 남지 않으니, 커밋 작성자로 확인한다.

## 쓰기 전에

- 맥에서 Emergence Workbench 앱(서버, 기본 `http://127.0.0.1:8130`)이 켜져 있어야 한다. 꺼져 있으면 도구가 "Cannot reach the Emergence Workbench app server"라고 답하고 아무것도 하지 않는다.
- 다른 주소의 서버를 쓰려면 환경 변수 `RW_URL`(예: 예제 모드 서버)을 준다.

## 등록

앱 저장소 폴더 경로를 `<앱 폴더>`에 넣는다. 연구 저장소에는 아무 파일도 더하지 않는다(사용자 범위 등록).

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

## 도구 (edit_note · edit_concept 말고는 읽기 전용)

| 도구 | 하는 일 | 부르는 API |
| --- | --- | --- |
| `rules` | 일하기 전에 읽을 규칙을 한 번에: 안전 규칙, 맡긴 일 규칙(`docs/agent-delegated-work.md`), 개념노트 규칙(research-library README의 개념노트 절), `project`를 주면 그 연구 저장소의 `AGENTS.md` · `CLAUDE.md`. 먼저 읽는다 | (앱 폴더의 문서), `GET /api/concepts/rules`, `GET …/:rid/agent-rules` |
| `list_projects` | 등록한 프로젝트: id · 제목 · 저장소 경로 · 진행 상태 | `GET /api/researches` |
| `project_status` | 프로젝트 요약(`workbench/STATUS.md`와 같은 내용) | `GET …/:rid/agent-status` |
| `list_notes` | 노트 목록: 본문 파일 · 상태 · 다시 열 조건 · 주제 (`status`로 거르기) | `GET …/:rid/notes` |
| `read_note` | 노트 본문과 hash | `GET …/:rid/manuscript/part`, 보조 노트는 `GET …/:rid/blocks/:id` |
| `read_records` | 노트·프로젝트 기록(메모 · 할 일 · 질문과 답 · 하이라이트)과 hash | `GET …/:rid/comments/:target` |
| `list_tasks` · `read_task` | 맡긴 일 목록과 하나의 모든 칸 | `GET …/:rid/tasks`, `…/tasks/:id` |
| `search_library` | 개념노트 · 논문 찾기 (이름 · 다른 이름 · 저자 · 연도 · arXiv 번호). 개념노트는 본문으로도 찾고, 맞은 줄마다 `hits`(본문 줄 번호 · 그 줄의 절 제목 · 줄 글)를 붙인다. 노트 전체 대신 그 절만 보면 된다 | `GET /api/search/catalog`, `GET /api/concepts/search` |
| `read_concept` | 개념노트 머리말 · 본문 · hash와 확인 상태(ok · changed · none) | `GET /api/concepts/:id` |
| `edit_note` | 프로젝트 노트(원고 제외)를 글 바꾸기 `{ old, new }`로 고친다. `read_note`의 hash를 보낸다. 바로 쓰고 사용자가 문단마다 검토한다. 상태가 해결인 노트는 첫 시도를 428로 거절하고 사용자에게 알린다. 대화에서 허락을 받은 뒤 `approved: true`로 다시 보낸다 | `POST /api/agent-edits/write` |
| `edit_concept` | 개념노트 본문에 같은 일(머리말은 그대로). `checked: ok`인 노트도 같은 허락이 필요하고, 잠긴 노트는 고치지 않는다 | `POST /api/agent-edits/write` |

## 지키는 것

- 노트 · 개념노트는 `edit_note` · `edit_concept`로 고친다. 그 밖은 앱 서버 API(`GET /api`가 목록과 쓰는 법을 준다)에 읽을 때 받은 hash를 `baseHash`로 보낸다. 그사이 바깥에서 바뀌었으면 409로 거절된다.
- 앱 서버가 꺼져 있을 때 파일을 직접 고쳐 우회하지 않는다.
- 각 연구 저장소의 `AGENTS.md` · `CLAUDE.md` 규칙이 이 입구보다 앞선다.
- 코드: `apps/server/src/mcp.ts`(도구), `scripts/mcp.mjs`(표준 입출력 시작), 테스트 `apps/server/src/mcp.test.ts`.
