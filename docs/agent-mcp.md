# Agent entry point (MCP)

[한국어](agent-mcp.ko.md)

Agents such as Claude Code and Codex read Emergence Workbench projects, notes, records, delegated tasks and concept notes **through the app server**. The MCP tools do not open files directly: they use the same API as the screen, so they see the same content and the same hashes. The only write tools are `edit_note` and `edit_concept`: the agent writes at once, the app keeps the text before the edit as a baseline, and the user approves, reverts or edits each changed paragraph on the edit review screen (`#/review`). Notes the user has reviewed need the user's permission in the conversation first. Each edit records which agent made it, from the name the client sends when it connects (`clientInfo.name`: Claude Code → `claude-code`, Codex → `codex`, others as sent). The name is what the client says about itself and is not checked. Files an agent changes directly, without the app, leave no such record; for those, see the commit author.

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

## Tools (read-only except edit_note and edit_concept)

| Tool | What it does | API it calls |
| --- | --- | --- |
| `rules` | Everything to read before starting, in one place: safety rules, delegated-task rules (`docs/agent-delegated-work.md`), the shared library's concept-note rules (the concept-note section of the research-library README) and, with `project`, that repository's `AGENTS.md` and `CLAUDE.md`. Read this first | (the document in the app folder), `GET /api/concepts/rules`, `GET …/:rid/agent-rules` |
| `list_projects` | Registered projects: id, title, repository path, progress | `GET /api/researches` |
| `project_status` | Project summary (same content as `workbench/STATUS.md`) | `GET …/:rid/agent-status` |
| `list_notes` | Notes: body file, record name `target` (Markdown notes and block notes; absent for `main.tex`), state, condition to reopen, topic (filter with `status`) | `GET …/:rid/notes` |
| `list_edit_reviews` | Pending agent edits and permission requests; optional `project` limits the list to one project, otherwise all projects and concept notes | `GET /api/agent-edits?scope=` |
| `read_note` | A note's body and hash | `GET …/:rid/manuscript/part`, block notes `GET …/:rid/blocks/:id` |
| `read_records` | Records on a note or project (memos, to-dos, questions and answers, highlights) and hash | `GET …/:rid/comments/:target` |
| `list_tasks` · `read_task` | Delegated tasks, and every field of one | `GET …/:rid/tasks`, `…/tasks/:id` |
| `search_library` | Find concept notes and papers (name, alias, author, year, arXiv id). Concept notes are also found by their text, with `hits` for each matching line (body line number, the heading it falls under, the line), so you can read just that section | `GET /api/search/catalog`, `GET /api/concepts/search` |
| `read_concept` | A concept note's front matter, body, hash and check state (ok, changed, none) | `GET /api/concepts/:id` |
| `edit_note` | Change a project note (not a manuscript) by exact text replacement `{ old, new }` with the hash from `read_note`. Written at once and shown to the user for review paragraph by paragraph. A note with status solved is refused on the first try (428) and the user is notified; ask in the conversation, then send again with `approved: true` | `POST /api/agent-edits/write` |
| `edit_concept` | The same for a concept note's body (front matter stays). A note with `checked: ok` needs permission the same way; locked notes are never changed | `POST /api/agent-edits/write` |

## Rules it keeps

- To change a note or concept note, prefer `edit_note` / `edit_concept`. For other writes, call the app server API (`GET /api` lists the routes and how to use them) and send the hash you read as `baseHash`. If the file changed in the meantime, the write is refused with 409. Creating, appending and one-field changes take no hash, and journal edits send the entry's current text as `was`; `GET /api` and `docs/repo-format.md` §12 list them.
- You may also edit repository files directly, including when the app server is stopped: tell the user when it cannot be reached, follow `docs/repo-format.md`, and run `pnpm --dir <app folder> agent:check <repository>` afterwards. Notes and concept notes the user has reviewed still need permission in the conversation; manuscripts are edited only when the user asks. Locked concept notes are never changed.
- Check pending edits with `list_edit_reviews` or the project summary. Do not reintroduce paragraphs the user reverted. Reverting an agent edit to a project note or block note appends a status record to that project’s journal; concept notes have no project journal, so their reverts are not recorded there.
- Each research repository's own `AGENTS.md` and `CLAUDE.md` come before this entry point.
- Code: `apps/server/src/mcp.ts` (tools), `scripts/mcp.mjs` (stdio start), tests `apps/server/src/mcp.test.ts`.
