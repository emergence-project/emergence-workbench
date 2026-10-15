# Agent entry point (MCP)

[한국어](agent-mcp.ko.md)

Agents such as Claude Code and Codex read Emergence Workbench projects, notes, records, delegated tasks and concept notes **through the app server**. The MCP tools do not open files directly: they use the same API as the screen, so they see the same content and the same hashes. The only write tools are `edit_note` and `edit_concept`, which change notes, `answer_record` (10/15), which answers a question or instruction record, and `add_record` (10/15), which leaves a question or memo for the user under the agent's name. The edit tools work like this: the agent writes at once, the app keeps the text before the edit as a baseline, and the user approves, reverts or edits each changed paragraph on the edit review screen (a project's "Edit review" section `#/r/<project>/edits` for research notes, `#/review` for concept notes). Notes the user has reviewed need the user's permission in the conversation first. Each edit records which agent made it, from the name the client sends when it connects (`clientInfo.name`: Claude Code → `claude-code`, Codex → `codex`, others as sent). The name is what the client says about itself and is not checked. Files an agent changes directly, without the app, leave no such record; for those, see the commit author. In the review the user can ask about a changed paragraph: the question is saved as a note record with `edit: 질문` or `edit: 수정` (`docs/repo-format.md` §6.2). The app asks Claude on the Mac right away; when that is not available the record stays unanswered and shows up in the agent's queue. For `수정`, revise the paragraph with `edit_note`, then answer the record with `answer_record`.

## Before you start

- The app server must be running on the Mac (the installed service, default `http://127.0.0.1:5174`). If it is off, every tool answers "Cannot reach the Emergence Workbench app server" and does nothing.
- To use a server at another address, set `RW_URL`. For sample mode (`pnpm dev`): `RW_URL=http://127.0.0.1:8130`.

## Register it

Put the path of the app folder in `<app folder>`. Nothing is added to your research repositories (user-scope registration).

**Claude Code**

```sh
claude mcp add --scope user emergence-workbench -- node <app folder>/scripts/mcp.mjs
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.emergence-workbench]
command = "node"
args = ["<app folder>/scripts/mcp.mjs"]
```

Inside the app folder, `pnpm mcp` also starts it (it speaks MCP over stdio, so you never type into it).

## Tools (read-only except edit_note, edit_concept, answer_record and add_record)

When it connects, the server tells the agent which tools to use in which order for each kind of job (`INSTRUCTIONS` in `apps/server/src/mcp.ts`): start with `rules`, then `overview`, then `project_status`. If you add or rename a tool, update that order too; `mcp.test.ts` checks that every tool name there exists.

| Tool | What it does | API it calls |
| --- | --- | --- |
| `rules` | What to read before starting: safety rules, the common research rules (one file for every research repository, when the personal repository copy has `rules/research.md`) and, with `project`, that repository's `AGENTS.md` and `CLAUDE.md`. Longer rules that only some work needs are listed by name and size, and `part` returns one: `tasks` (delegated-task rules, `docs/agent-delegated-work.md`) or `concepts` (the concept-note section of the shared library README). Read this first | `GET /api/rules/common`, (the document in the app folder), `GET /api/concepts/rules`, `GET …/:rid/agent-rules` |
| `list_projects` | Registered projects: id, title, repository path, progress | `GET /api/researches` |
| `overview` | Every active project in one table: the user's turn (notes to review, delegated-task results to judge, agent edits; the same count as Home's "needs review"), the agent's turn (unanswered questions, working tasks, open to-dos), repository sync, last record. Use it to choose where to work | `GET /api/agent-overview` |
| `project_status` | Short project summary: the header, the goal and the sections that say what to do now (to-dos, delegated tasks, pending questions and instructions, reviews), with every other section listed by name and size. `section` returns one section of `workbench/STATUS.md`, `full` the whole file | `GET …/:rid/agent-status?view=summary`, `?section=<name>` |
| `list_notes` | Notes: body file, record name `target` (Markdown notes and block notes; absent for `main.tex`), state, condition to reopen, topic (filter with `status`) | `GET …/:rid/notes` |
| `list_edit_reviews` | Pending agent edits and permission requests; optional `project` limits the list to one project, otherwise all projects and concept notes | `GET /api/agent-edits?scope=` |
| `read_note` | A note's body and hash | `GET …/:rid/manuscript/part`, block notes `GET …/:rid/blocks/:id` |
| `read_records` | Records on a note or project (memos, to-dos, questions and answers, highlights) and hash. Targets are `project`, `note-<folder>`, `topic-<id>`, `flow-<id>` and so on; `part` · `partText` are the screen part the user pointed at | `GET …/:rid/comments/:target` |
| `list_records` | Every record of a project in one list (project, notes, topics, flow dots; highlights excluded), filtered by kind, state or target (exact, or a prefix such as `topic-`). `unanswered: true` gives only the user's questions and instructions (지시, 10/15: an agent does it, then answers) waiting for an answer. `by` is the agent that wrote a record (absent = the user); answers by `사용자` are the user's follow-ups | `GET …/:rid/records` |
| `list_tasks` · `read_task` | Delegated tasks, and every field of one | `GET …/:rid/tasks`, `…/tasks/:id` |
| `search_library` | Find concept notes and papers (name, alias, author, year, arXiv id). Concept notes are also found by their text, with `hits` for each matching line (body line number, the heading it falls under, the line), so you can read just that section | `GET /api/search/catalog`, `GET /api/concepts/search` |
| `read_concept` | A concept note's front matter, body, hash and check state (ok, changed, none) | `GET /api/concepts/:id` |
| `edit_note` | Change a project note (not a manuscript) by exact text replacement `{ old, new, reason }` with the hash from `read_note`. `reason` is required: one line on why, shown under the changed paragraph. Written at once and shown to the user for review paragraph by paragraph. A note with status solved is refused on the first try (428) and the user is notified; ask in the conversation, then send again with `approved: true` | `POST /api/agent-edits/write` |
| `edit_concept` | The same for a concept note's body (front matter stays). A note with `checked: ok` needs permission the same way; locked notes are never changed | `POST /api/agent-edits/write` |
| `answer_record` | Write an answer under a question or instruction record `{ target, id, answer }`. For an instruction, do the work first (notes with `edit_note`). The answer header carries your agent name and the record becomes 답함 (answered). Appending, so no hash | `POST …/:rid/comments/:target/:id/answers` |
| `add_record` | Leave a record for the user `{ file or target, kind: 질문 \| 메모, text, quote?, line? }`, written with `by` = your agent name. A 질문 asks the user to check or decide something (for example a passage of a note you wrote, anchored by `quote`): it is the user's turn (orange in the app, counted in Home's "needs review") until the user answers in the app, which appends `### 답 · 사용자` and sets 답함. Read the answer with `read_records`. Appending, so no hash | `POST …/:rid/comments/:target` |

## Rules it keeps

- To change a note or concept note, prefer `edit_note` / `edit_concept`. For other writes, call the app server API (`GET /api` gives the main routes and how to use them, `GET /api?all=1` every route) and send the hash you read as `baseHash`. If the file changed in the meantime, the write is refused with 409. Creating, appending and one-field changes take no hash, and journal edits send the entry's current text as `was`; `GET /api` and `docs/repo-format.md` §12 list them.
- You may also edit repository files directly, including when the app server is stopped: tell the user when it cannot be reached, follow `docs/repo-format.md`, and run `pnpm --dir <app folder> agent:check <repository>` afterwards. Notes and concept notes the user has reviewed still need permission in the conversation; manuscripts are edited only when the user asks. Locked concept notes are never changed.
- Check pending edits with `list_edit_reviews` or the project summary. Do not reintroduce paragraphs the user reverted. Reverting an agent edit to a project note or block note appends a status record to that project’s journal; concept notes have no project journal, so their reverts are not recorded there.
- Each research repository's own `AGENTS.md` and `CLAUDE.md` come before this entry point.
- Code: `apps/server/src/mcp.ts` (tools), `scripts/mcp.mjs` (stdio start), tests `apps/server/src/mcp.test.ts`.
