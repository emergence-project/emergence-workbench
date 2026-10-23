// 에이전트용 입구 (MCP, 읽기 단계 A): Claude Code · Codex가 앱의 서버 API를 거쳐 프로젝트를 읽는다.
// 파일을 직접 읽거나 쓰지 않고 맥에서 도는 앱 서버(127.0.0.1)만 부른다. 그래서 화면과 같은 규칙과 hash를 쓴다.
// 강점 강화 계획(2026-10-08)의 A단계. 쓰기 도구는 노트 · 개념노트 고치기(edit_note · edit_concept, 10/8 에이전트 고침 검토), 질문에 답하기(answer_record, 10/15), 사용자에게 묻는 기록 남기기(add_record, 10/15),
// 흐름(flow_*, 10/20), 맡긴 일 만들기 · 보고(add_task · report_task)와 일지(add_journal, 10/21: 에이전트가 workbench 파일을 직접 고치지 않게). 등록은 docs/agent-mcp.md
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { FEEDBACK_MISSES, LIBRARY_RID, noteRecordTarget } from '@rw/core'
import { recordRows } from './recordRows.js'
import * as C from '@rw/core/contract/flow'

// 기본은 맥의 실사용 서버(scripts/serve.sh, 5174). 예제 모드(pnpm dev, 8130)는 RW_URL로 준다.
export const DEFAULT_URL = process.env.RW_URL ?? `http://127.0.0.1:${process.env.RW_PORT ?? 5174}`
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const RULES_FILE = path.join(APP_ROOT, 'docs/agent-delegated-work.md')

/** 모든 도구가 지키는 것. rules 도구가 맡긴 일 규칙과 함께 돌려준다 (도구 이름·설명은 영어, 2026-10-08) */
export const SAFETY = [
  '- Work on workbench files through these tools, not by reading or editing the files: project_status instead of workbench/STATUS.md (a fraction of its size), edit_note / edit_concept for notes and concept notes (the user reviews each changed paragraph in the app), add_record / answer_record for records, flow_* for the research flow, add_task / report_task for tasks, add_journal for the journal. What no tool covers goes through the app server API (GET /api gives the main routes and GET /api?all=1 every route; send the hash you read as baseHash, and read again after a 409). Edit repository files directly only for what neither covers (code, data, decisions, rules) or when the app server is unreachable: follow docs/repo-format.md and run pnpm --dir <app folder> agent:check <repository> afterwards.',
  '- A note or concept note the user has reviewed (concept note checked: ok, note status solved) needs the user\'s permission in the conversation. The first attempt is refused and shown to the user; ask, and only after they agree send again with approved: true.',
  '- Edit manuscripts (LaTeX manuscripts) only when the user asks. Never edit concept notes with locked: true. Do not change bytes outside the part you edit.',
  '- The files in each repository are the source of truth. workbench/STATUS.md is a summary the app writes; do not edit it.',
  '- The common research rules (when set up) and each research repository\'s own AGENTS.md / CLAUDE.md come first. A repository may add to the common rules or make them stricter (for example: plan first, or proposal and approval before structural changes).',
  '- Only the user approves physics and mathematics. A session never approves its own result.',
].join('\n')

/**
 * 연결할 때 에이전트에게 주는 안내: 어떤 일에 어떤 도구를 어떤 순서로 (10/15, 도구마다 설명을 따로 찾지 않게).
 * 도구를 더하거나 바꾸면 여기의 순서도 고친다 (mcp.test.ts가 여기 적은 이름이 모두 실제 도구인지 본다)
 */
export const INSTRUCTIONS = [
  'Read projects, notes, records (and answer questions), delegated tasks and concept notes of Emergence Workbench through its app server.',
  'Start: rules (pass project to include that repository\'s own rules) → overview (every active project: the user\'s turn and your turn) → project_status for the project you work on (a short summary; fetch one section by name when needed).',
  'Use these tools instead of reading or writing files under workbench/: they keep the app\'s format, show your work to the user (records, flow, task tab, edit reviews) and return short outputs. Edit files directly only for what no tool covers.',
  'Outputs are short on purpose: read a longer rule (rules part) or STATUS section (project_status section) only when the work needs it.',
  'Answer the user\'s questions: list_records with unanswered: true → read_note for the context → answer_record (result first, a few lines).',
  'Ask the user to check something (for example a part of a note you wrote): add_record with kind 질문 and the quoted text; when the user has answered, list_records with replied: true shows it → act on it → answer_record closes it.',
  'Change a note: read_note (keep the hash) → edit_note with baseHash. Concept note: rules with part: "concepts" (once) → search_library → read_concept → edit_concept.',
  'Delegated tasks: rules with part: "tasks" (once) → list_tasks → read_task → report_task with kind proposal when end-condition is empty (then stop), or kind result when the work is done. A to-do, handoff or proposal of new work: add_task.',
  'When you finish a piece of work: add_journal with one or two sentences on what you did and the files you touched.',
  'Research flow (one dot = one piece of work: a question, a calculation, a proof, a finding): before you start a calculation or proof, flow_search for earlier attempts (refuted and dropped ones carry their reason), then flow_add the dot as active with its criterion. When it ends, flow_update with the result, evidence pointing to a note section, run (code · commit · params) for calculations, steps for proofs, reason for refuted/dropped/paused, and next. Finishing is refused while required fields are empty. Review a piece of evidence or a step with flow_review.',
  'Find a note: list_notes (status filter). Agent edits waiting for the user: list_edit_reviews.',
  'The user\'s turn (notes to review, task results to judge, agent edits) is for the user; never act on it for them.',
].join('\n')

type Fetch = typeof fetch
type Text = { content: { type: 'text'; text: string }[]; isError?: true }

const text = (s: string): Text => ({ content: [{ type: 'text', text: s }] })
const fail = (s: string): Text => ({ content: [{ type: 'text', text: s }], isError: true })
const json = (v: unknown): Text => text(JSON.stringify(v, null, 1))
const enc = encodeURIComponent

/** 앱 서버의 GET 하나. 서버가 꺼져 있거나 오류면 에이전트가 읽을 한 줄 오류로 */
async function get(base: string, f: Fetch, url: string): Promise<{ ok: true; body: unknown } | { ok: false; error: Text }> {
  let res: Response
  try {
    res = await f(base + url)
  } catch {
    return { ok: false, error: fail(`Cannot reach the Emergence Workbench app server at ${base}. Tell the user. Without the app you may still edit repository files directly: follow docs/repo-format.md and run \`pnpm --dir <app folder> agent:check <repository>\` afterwards; notes and concept notes the user has reviewed still need permission, and manuscripts are edited only when the user asks.`) }
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : res.statusText
    return { ok: false, error: fail(`${res.status} ${msg} (GET ${url})`) }
  }
  return { ok: true, body }
}

/** 앱 서버의 POST · PATCH 하나 (쓰기 도구). 오류는 get과 같은 한 줄 */
async function post(base: string, f: Fetch, url: string, payload: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<{ ok: true; body: unknown } | { ok: false; error: Text }> {
  let res: Response
  try {
    res = await f(base + url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  } catch {
    return { ok: false, error: fail(`Cannot reach the Emergence Workbench app server at ${base}. Tell the user. Without the app you may still edit repository files directly: follow docs/repo-format.md and run \`pnpm --dir <app folder> agent:check <repository>\` afterwards; notes and concept notes the user has reviewed still need permission, and manuscripts are edited only when the user asks.`) }
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : res.statusText
    return { ok: false, error: fail(`${res.status} ${msg}`) }
  }
  return { ok: true, body }
}

const pick = <T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as Pick<T, K>

interface NoteRow { id: string; type: string; file: string; format: string; title: string; status: string; resume?: string; kind?: string; description?: string; topics?: string[]; mtime?: number }
interface SearchItem { kind: string; id: string; title: string; also?: string; rid?: string; file?: string }
/** 본문 찾기의 맞은 줄: line은 머리말을 뺀 본문(read_concept의 body)의 줄 번호 */
interface Hit { line: number; heading: string; text: string }

/** 연결할 때 클라이언트가 밝힌 이름(clientInfo.name) → 맡긴 일과 같은 에이전트 이름. 스스로 밝힌 값이라 검증하지 않는다 */
/** 기록의 by에 쓰는 이름 (영어 소문자 · 숫자 · -, 20자까지, docs/repo-format.md §6.2) */
export function recordAuthor(clientName: string | undefined): string {
  const n = agentOf(clientName).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^[^a-z]+/, '').slice(0, 20).replace(/-+$/, '')
  return n || 'agent'
}

export function agentOf(clientName: string | undefined): string {
  const n = (clientName ?? '').trim()
  if (/claude/i.test(n)) return 'claude-code'
  if (/codex/i.test(n)) return 'codex'
  return n.slice(0, 40) || 'mcp'
}

/** appChat = 앱 고치기 대화 안에서 열 때 그 대화 id (app_submit · app_checks · feedback_answer를 더한다) */
export function createMcpServer(opts: { baseUrl?: string; fetch?: Fetch; appChat?: string } = {}): McpServer {
  const base = (opts.baseUrl ?? DEFAULT_URL).replace(/\/$/, '')
  const f0 = opts.fetch ?? fetch
  // 앱이 에이전트 연결을 알아보게 (설정 › 계정 › 시작 준비, agentSeen.ts)
  const f: Fetch = (url, init) => f0(url, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), 'x-rw-agent': agentOf(server.server.getClientVersion()?.name) } })
  const call = async (url: string, shape: (body: never) => unknown = (b) => b): Promise<Text> => {
    const r = await get(base, f, url)
    return r.ok ? json(shape(r.body as never)) : r.error
  }
  const server = new McpServer({ name: 'emergence-workbench', version: '0.1.0' }, {
    instructions: INSTRUCTIONS,
  })
  const ro = { readOnlyHint: true, openWorldHint: false } as const
  const project = z.string().describe('Project id (from list_projects)')
  /** 기록 도구는 지식 라이브러리(개념노트 기록)도 받는다 (10/18) */
  const recordsProject = z.string().describe(`Project id (from list_projects), or ${LIBRARY_RID} for concept-note records in the knowledge library (targets concept-<concept id>)`)

  server.registerTool('rules', {
    title: 'Rules',
    description: 'What to read before starting work: safety rules, the common research rules (one file for every research repository, when set up) and, with project, that research repository\'s own AGENTS.md / CLAUDE.md. The longer rules for delegated tasks and for concept notes are listed with their size; read one with part: "tasks" or part: "concepts" only when your work touches it.',
    inputSchema: {
      project: z.string().optional().describe('Project id (from list_projects) to include its repository rules'),
      part: z.enum(['tasks', 'concepts']).optional().describe('Only this rule document: tasks = delegated-task rules (docs/agent-delegated-work.md), concepts = concept-note rules of the shared library'),
    },
    annotations: ro,
  }, async ({ project: rid, part }) => {
    const tasksDoc = () => (fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, 'utf8') : '(delegated-task rules document not found)')
    // 개념노트 규칙은 앱 서버가 읽는다 (서버가 꺼져 있으면 그렇다고 적는다)
    const conceptsDoc = async () => {
      const concepts = await get(base, f, '/api/concepts/rules')
      const cr = concepts.ok ? (concepts.body as { rules: { file: string; text: string } | null }).rules : null
      return `# Concept note rules (shared library ${cr?.file ?? 'README.md'})\n\n${cr ? cr.text : concepts.ok ? '(no shared library is set up)' : concepts.error.content[0]!.text}`
    }
    if (part === 'tasks') return text(tasksDoc())
    if (part === 'concepts') return text(await conceptsDoc())
    const parts = [`# Safety rules\n\n${SAFETY}`]
    // 연구 공통 규칙 (R1): 개인 저장소 사본에 있을 때만. 모든 일에 통하므로 늘 싣는다
    const common = await get(base, f, '/api/rules/common')
    const cm = common.ok ? (common.body as { rules: { file: string; text: string; truncated?: true } | null }).rules : null
    if (cm) parts.push(`# Common research rules (${cm.file})\n\n${cm.text}${cm.truncated ? '\n\n(truncated)' : ''}`)
    if (rid) {
      const r = await get(base, f, `/api/researches/${enc(rid)}/agent-rules`)
      if (!r.ok) return r.error
      const files = (r.body as { files: { file: string; text: string; truncated?: true }[] }).files
      parts.push(files.length
        ? files.map((x) => `# Project rules (${x.file})\n\n${x.text}${x.truncated ? '\n\n(truncated)' : ''}`).join('\n\n')
        : '# Project rules\n\n(this repository has no AGENTS.md or CLAUDE.md)')
    }
    // 맡긴 일 · 개념노트 규칙은 길어서(각 8–9KB) 그 일을 할 때만 읽게 이름과 크기만 (10/15)
    const size = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(1)}KB`
    parts.push(['# More rules (read only when your work touches them)', '',
      `- part: "tasks" · delegated tasks (workbench/tasks/*.md: end condition, result format, approval) · ${size(tasksDoc())}`,
      `- part: "concepts" · concept notes in the shared library (sources, format, what not to invent) · ${size(await conceptsDoc())}`].join('\n'))
    return text(parts.join('\n\n'))
  })

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'Registered projects (research repositories): id, title, repository path, kind and state. Use the id as `project` in the other tools.',
    annotations: ro,
  }, async () => call('/api/researches', (b: { researches: Record<string, unknown>[] }) =>
    b.researches.map((r) => pick(r, ['id', 'title', 'path', 'kind', 'fields', 'state', 'available', 'problem']))))

  server.registerTool('overview', {
    title: 'Overview',
    description: 'Every active project in one table: the user\'s turn (notes to review, delegated-task results to judge, agent edits; the same count as the app Home "needs review"), your turn (unanswered questions, working tasks, open to-dos), repository sync and last record. Use it to choose where to work, then project_status for details.',
    annotations: ro,
  }, async () => {
    const r = await get(base, f, '/api/agent-overview')
    return r.ok ? text((r.body as { markdown: string }).markdown) : r.error
  })

  server.registerTool('project_status', {
    title: 'Project status',
    description: 'Current state of a project (workbench/STATUS.md). By default a short summary: header rules, goal and what is waiting now (to-dos, delegated tasks, open questions and instructions, items awaiting review); the other sections (notes, topics, recent records …) are listed with their size. Read one with section: "<name>", or everything with full: true only when you really need it.',
    inputSchema: {
      project,
      section: z.string().optional().describe('One section by name, e.g. 노트, 주제, 최근 7일 기록, 공통 규칙, 정본 위치'),
      full: z.boolean().optional().describe('The whole STATUS (11–18KB); avoid unless needed'),
    },
    annotations: ro,
  }, async ({ project: rid, section, full }) => {
    const r = await get(base, f, `/api/researches/${enc(rid)}/agent-status${section ? `?section=${enc(section)}` : full ? '' : '?view=summary'}`)
    return r.ok ? text((r.body as { markdown: string }).markdown) : r.error
  })

  server.registerTool('list_notes', {
    title: 'List notes',
    description: 'Notes of a project (research, calculation and block notes): file, record target (when available), title, status (in-progress, blocked = paused, stopped = discarded, solved), resume condition, topics. Most recently edited first.',
    inputSchema: { project, status: z.enum(['in-progress', 'blocked', 'stopped', 'solved']).optional().describe('Only notes with this status') },
    annotations: ro,
  }, async ({ project: rid, status }) => call(`/api/researches/${enc(rid)}/notes`, (b: { notes: NoteRow[] }) =>
    b.notes.filter((n) => !status || n.status === status)
      .map((n) => {
        const target = noteRecordTarget(n)
        return { ...pick(n, ['file', 'title', 'type', 'format', 'status', 'resume', 'kind', 'description', 'topics']), ...(target && { target }) }
      })))

  server.registerTool('list_edit_reviews', {
    title: 'List edit reviews',
    description: 'Pending agent edits and permission requests for reviewed notes. Pass project to list only that project, or omit it for all projects and concept notes. Do not reintroduce paragraphs the user reverted; read the project journal for those decisions.',
    inputSchema: { project: project.optional() },
    annotations: ro,
  }, async ({ project: rid }) => call(`/api/agent-edits${rid ? `?scope=${enc(rid)}` : ''}`))

  server.registerTool('read_note', {
    title: 'Read note',
    description: 'Content and hash of a note (or manuscript file). `file` is the repository-relative path from list_notes. Keep the hash as baseHash for later edits.',
    inputSchema: { project, file: z.string().describe('Repository-relative path, e.g. workbench/notes/<name>/note.md or workbench/topics/<topic>/<name>/note.md') },
    annotations: ro,
  }, async ({ project: rid, file }) => {
    // 블록 노트(workbench/blocks/<id>.md|.tex)는 블록 API, 연구노트·계산 노트·원고 파일은 원고 API가 읽는다
    const block = /^workbench\/blocks\/([^/]+)\.(md|tex)$/.exec(file)
    const r = await get(base, f, block ? `/api/researches/${enc(rid)}/blocks/${enc(block[1]!)}` : `/api/researches/${enc(rid)}/manuscript/part?file=${enc(file)}`)
    if (!r.ok) return r.error
    const { content, hash } = r.body as { content: string; hash: string }
    return text(`file: ${file}\nhash: ${hash}\n\n${content}`)
  })

  server.registerTool('read_records', {
    title: 'Read records',
    description: 'Records left on a note or the project (memos, to-dos, questions with answers, highlights) and their hash. target: project, note-<folder>, calc-<folder>, block-<id>, topic-<id>, flow-<id> or manuscript. part/partText = the screen part the user pointed at.',
    inputSchema: { project: recordsProject, target: z.string().describe('project | note-<folder> | calc-<folder> | block-<id> | topic-<id> | flow-<id> | manuscript') },
    annotations: ro,
  }, async ({ project: rid, target }) => call(`/api/researches/${enc(rid)}/comments/${enc(target)}`))

  server.registerTool('list_records', {
    title: 'List records',
    description: 'All records of a project in one list (the project and every note, topic and flow dot; highlights excluded), filtered by kind, state or target. Kinds: 메모 (memo, nobody acts), 할 일 (to-do, the user does it), 질문 (question, an agent answers), 지시 (instruction, an agent does it and then answers). Each row is short: target, id, kind, by (the agent that wrote it; absent = the user), state, where, quote, part, todo (for a question or instruction the user asked about a to-do: that to-do\'s id and text), body (first 300 characters), answerCount and lastAnswer (by 사용자 = the user). Pass full: true, or read one target with read_records, for whole bodies and every answer. unanswered: true = the user\'s questions and instructions waiting for an agent. replied: true = questions an agent asked with add_record that the user has answered: read the answer, act on it, then close the record with answer_record. unsorted: true = records the user left as 자동 and has not sorted yet (memos until sorted; if one reads as a request, ask the user in the conversation instead of acting).',
    inputSchema: {
      project: recordsProject,
      kind: z.enum(['메모', '할 일', '질문', '지시']).optional().describe('메모 (memo) | 할 일 (to-do) | 질문 (question) | 지시 (instruction)'),
      state: z.enum(['대기', '답함', '끝냄']).optional().describe('대기 (waiting) | 답함 (answered) | 끝냄 (closed)'),
      target: z.string().optional().describe('Only this target, or a prefix ending in - (note-, topic-, flow- …)'),
      unanswered: z.boolean().optional().describe('Only the user\'s questions and instructions still waiting for an agent (kind 질문 or 지시, state 대기, no by)'),
      replied: z.boolean().optional().describe('Only agent questions the user has answered (by set, state 답함, last answer by 사용자): yours to act on and close'),
      unsorted: z.boolean().optional().describe('Only records the user has not sorted into a kind yet'),
      full: z.boolean().optional().describe('Whole bodies and every answer instead of short rows'),
    },
    annotations: ro,
  }, async ({ project: rid, ...filter }) => call(`/api/researches/${enc(rid)}/records`, (b: { files: Parameters<typeof recordRows>[0] }) => ({ records: recordRows(b.files, filter) })))

  server.registerTool('answer_record', {
    title: 'Answer a question or instruction record',
    description: 'Write your answer under a question (질문) or instruction (지시) record (from list_records or read_records). The answer is appended with your agent name and the record becomes answered (답함); the user reads it in the app. Lead with the result in the first line and keep it to a few lines; cite files as path:line. On a flow dot (target flow-<id>) the row may carry field (the dot field the user pointed at, e.g. statement) and changed (that field changed since they asked): start with 답: 있음 / 없음 / 일부, or 고침 when you changed the dot, then the grounds (note section, file:line, figure); a changed dot needs the user\'s judgment again. On a question you asked yourself (by set) that the user answered (list_records replied: true), act on the answer, then answer_record saying what you did: that closes the record (끝냄). For a question, answer only what was asked. For an instruction, do the small job first (change notes with edit_note so the user reviews them), then answer saying what you did and where; if it needs an end condition and a report, do not start it and answer suggesting a delegated task instead. For a question with edit: 수정 (the user asked to revise a changed paragraph), revise the paragraph with edit_note first, then answer saying what you changed.',
    inputSchema: {
      project: recordsProject,
      target: z.string().describe('The record\'s target (project, note-<folder>, topic-<id>, flow-<id> …)'),
      id: z.string().describe('The question or instruction record id'),
      answer: z.string().trim().min(1).describe('Your answer (Markdown)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ project: rid, target, id, answer }) => {
    const r = await post(base, f, `/api/researches/${enc(rid)}/comments/${enc(target)}/${enc(id)}/answers`, { by: agentOf(server.server.getClientVersion()?.name), body: answer })
    if (!r.ok) return r.error
    const b = r.body as { hash: string; comments?: { id: string; state: string | null }[] }
    const st = b.comments?.find((c) => c.id === id)?.state ?? '답함'
    return text(`Answered. The record is now ${st}. Records file hash: ${b.hash}.`)
  })

  server.registerTool('add_record', {
    title: 'Add a record for the user',
    description: 'Leave a record the user reads in the app, written under your agent name. Use kind 질문 (question) to ask the user to check or decide something, for example a passage of a note you wrote: it shows in orange as the user\'s turn until the user answers in the app (for project ' + LIBRARY_RID + ' it shows only on that concept note, not in the counts) (their answer is appended as `### 답 · 사용자` and the record becomes 답함). Use 메모 (memo) for a remark that needs no answer. For a note, pass file (from list_notes) and optionally quote (text copied exactly from the note, it is highlighted there) and line; otherwise pass target (project, topic-<id>, flow-<id>). Do not use it to answer a record (use answer_record) or to change notes (use edit_note).',
    inputSchema: {
      project: recordsProject,
      file: z.string().optional().describe('Note file from list_notes (workbench/notes/<name>/note.md, workbench/topics/<topic>/<name>/note.md, workbench/blocks/<id>.md …)'),
      target: z.string().optional().describe(`Instead of file: project | topic-<id> | flow-<id>; with project ${LIBRARY_RID}: concept-<concept id>`),
      kind: z.enum(['질문', '메모']).describe('질문 (question for the user) | 메모 (memo)'),
      text: z.string().trim().min(1).describe('What you ask or note (Markdown)'),
      quote: z.string().optional().describe('Text copied exactly from the note to anchor the record'),
      line: z.number().int().positive().optional().describe('Line of the quote in the note file (1-based), to pick the right place when the quote occurs more than once'),
      field: z.string().optional().describe('With target flow-<id>: the dot field the record is about (statement, condition, criterion, result …); quote must then be copied from that field'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ project: rid, file, target, kind, text: body, quote, line, field }) => {
    let to = target
    let title = target ?? ''
    let source: string | undefined
    if (file) {
      const r = await get(base, f, `/api/researches/${enc(rid)}/notes`)
      if (!r.ok) return r.error
      const n = (r.body as { notes: NoteRow[] }).notes.find((x) => x.file === file)
      const noteTarget = n && noteRecordTarget(n)
      if (!n || !noteTarget) return fail(`No note with records at ${file}. Use a file from list_notes that has a target.`)
      to = noteTarget
      title = n.type === 'block' ? `노트 결과 ${n.title}` : `노트 ${n.title}`
      source = n.type === 'block' ? n.id : n.file
    }
    // 개념노트 기록 (지식 라이브러리, 10/18): target concept-<개념노트 id>, 인용은 그 개념노트 본문에서 찾는다
    if (rid === LIBRARY_RID && to?.startsWith('concept-')) {
      const id = to.slice('concept-'.length)
      title = `개념노트 ${id}`
      source = `concepts/${id}.md`
    }
    if (!to) return fail('Pass file (a note from list_notes) or target (project, topic-<id>, flow-<id>, or concept-<id> with project _library).')
    if (!file && /^(note|calc|block)-/.test(to)) return fail('For a note, pass file (from list_notes) instead of target.')
    const r = await post(base, f, `/api/researches/${enc(rid)}/comments/${enc(to)}`, { kind, title, ...(source && { source }), text: body, ...(quote && { quote }), ...(line && { line }), ...(field && { field }), by: recordAuthor(server.server.getClientVersion()?.name) })
    if (!r.ok) return r.error
    const b = r.body as { entry: { id: string }; hash: string }
    return text(`Added ${kind} ${b.entry.id} on ${to}.${kind === '질문' ? ' It is now the user\'s turn; read their answer later with read_records.' : ''} Records file hash: ${b.hash}.`)
  })

  // ---------- 연구 흐름 (10/20 사용자 결정: 점은 일을 시작할 때 진행으로, 끝날 때 결과로) ----------
  const flowSet = {
    title: z.string().optional().describe('One sentence: the claim, question or task'),
    topics: z.array(z.string()).optional().describe('Topic ids'),
    from: z.array(z.object({ id: z.string(), type: z.enum(C.FLOW_EDGES) })).optional().describe('Earlier dots: origin (where the question came from), support, refute, use'),
    fields: z.record(z.string(), z.string()).optional().describe('Description fields by kind. question: question, motivation, guess, criterion. finding: statement, condition. calc: goal, criterion, setup, result, interpretation. analytic: goal, setup, assumptions, result. proof: goal, assumptions, method, result. literature: reading, gain, use. $…$ math allowed'),
    run: z.object({ code: z.string().optional(), commit: z.string().optional(), params: z.record(z.string(), z.string()).optional(), output: z.string().optional() }).optional().describe('Calculations: code path, commit, parameters (name → value), output file'),
    steps: z.array(z.object({ text: z.string(), uses: z.string().optional() })).optional().describe('Proofs and analytic derivations: each step and what it uses (axiom, earlier step, dot, paper). Replaces the whole list; checks stay with the same position'),
    evidence: z.array(z.object({ kind: z.enum(C.FLOW_EVIDENCE), text: z.string(), title: z.string().optional(), file: z.string().optional(), section: z.string().optional(), ref: z.string().optional() })).optional()
      .describe('Evidence: file (repository path) with section (a heading in that note), or ref (library paper key). Replaces the whole list; checks stay with the same file or ref'),
    reason: z.string().optional().describe('Why it was refuted, dropped or paused'),
    next: z.string().optional().describe('What to do next'),
    priority: z.enum(C.FLOW_PRIORITY).optional(),
  }
  const flowShort = (n: C.FlowNode) => ({ id: n.id, hash: n.hash, kind: n.kind, progress: n.progress, ...(n.result && { result: n.result }), short: n.short, ...(n.gaps.length && { gaps: n.gaps.map((g) => g.text) }) })

  server.registerTool('flow_search', {
    title: 'Search the research flow',
    description: 'Earlier dots of the project flow that match the words (title, fields, run parameters, reasons), best first: state, parameters, result and the reason a dot was refuted or dropped. Use it before starting a calculation or proof so you do not repeat one.',
    inputSchema: { project, q: z.string().min(2).describe('Words, e.g. the model, method or parameter values') },
    annotations: ro,
  }, async ({ project: rid, q }) => call(`/api/researches/${enc(rid)}/flow/search?q=${enc(q)}`))

  server.registerTool('flow_read', {
    title: 'Read a flow dot',
    description: 'One dot of the project flow with every field, its evidence and step checks, and the gaps the app found.',
    inputSchema: { project, id: z.string() },
    annotations: ro,
  }, async ({ project: rid, id }) => call(`/api/researches/${enc(rid)}/flow/${enc(id)}`, (b: C.FlowOne) => b.node))

  server.registerTool('flow_add', {
    title: 'Add a flow dot',
    description: 'Add a dot when you start a piece of work (a question, calculation, proof, literature reading or finding). Give the criterion (what result solves or refutes it) for questions and calculations. Usually progress active. Refused while 3 of your findings wait for the user\'s judgment (when kind is finding), and for work that follows a card the user has not started. Returns the dot id, hash and gaps.',
    inputSchema: { project, kind: z.enum(C.FLOW_KINDS), short: z.string().min(1).max(60).describe('Short name shown on the chart'), progress: z.enum(['open', 'active']).optional(),
      task: z.string().optional().describe('The delegated task (workbench/tasks id) this work belongs to, if any'), ...flowSet },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ project: rid, kind, short, progress, title, topics, from, task, ...rest }) => {
    const made = await post(base, f, `/api/researches/${enc(rid)}/flow`, { kind, short, progress: progress ?? 'active', by: agentOf(server.server.getClientVersion()?.name), ...(title && { title }), ...(topics && { topics }), ...(from && { from }), ...(task && { task }) })
    if (!made.ok) return made.error
    const n = (made.body as C.FlowOne).node
    if (!Object.values(rest).some((v) => v !== undefined)) return json(flowShort(n))
    const r = await post(base, f, `/api/researches/${enc(rid)}/flow/${enc(n.id)}`, { baseHash: n.hash, gate: true, set: rest }, 'PATCH')
    return r.ok ? json(flowShort((r.body as C.FlowOne).node)) : fail(`The dot ${n.id} was created, but its fields were not saved: ${r.error.content[0]!.text}`)
  })

  server.registerTool('flow_update', {
    title: 'Update a flow dot',
    description: 'Change a dot: when the work ends, set progress done with result (solved, refuted) and fill the result, evidence (with section), run or steps, reason and next. Finishing or pausing is refused while required fields are empty; the error names them. People decide the question wording, origin links and dropping a branch: those are refused here. Pass the hash from flow_read or flow_add.',
    inputSchema: {
      project, id: z.string(), baseHash: z.string(),
      progress: z.enum(C.FLOW_PROGRESS).optional(), result: z.enum(['solved', 'refuted']).optional(), short: z.string().min(1).max(60).optional(), end: z.boolean().optional().describe('Flow ends here: no dot follows on this branch'),
      ...flowSet,
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ project: rid, id, baseHash, ...set }) => {
    const cur = await get(base, f, `/api/researches/${enc(rid)}/flow/${enc(id)}`)
    if (!cur.ok) return cur.error
    const n = (cur.body as C.FlowOne).node
    const origins = (xs: { id: string; type: string }[]) => xs.filter((x) => x.type === 'origin').map((x) => x.id).sort().join(',')
    if (n.kind === 'question' && set.fields?.question !== undefined && n.fields.question && set.fields.question !== n.fields.question) return fail('The question wording is decided by the user. Leave it as is and propose a change with add_record (kind 질문, target flow-' + id + ').')
    if (set.from && origins(set.from) !== origins(n.from)) return fail('Origin links are decided by the user. Keep them and propose a change with add_record (target flow-' + id + ').')
    const fields = set.fields && { ...n.fields, ...set.fields }
    const r = await post(base, f, `/api/researches/${enc(rid)}/flow/${enc(id)}`, { baseHash, gate: true, set: { ...set, ...(fields && { fields }) } }, 'PATCH')
    return r.ok ? json(flowShort((r.body as C.FlowOne).node)) : r.error
  })

  server.registerTool('flow_review', {
    title: 'Review flow evidence or a step',
    description: 'Record your review of one piece of evidence (ev, 0-based) or one proof step (step, 0-based) of a dot, as role agent. Read the note section or check the step first; say what you checked in note. The record keeps a hash of what you checked, so it lapses when that text changes. Only the user approves (in the app).',
    inputSchema: { project, id: z.string(), baseHash: z.string(), ev: z.number().int().min(0).optional(), step: z.number().int().min(0).optional(), note: z.string().optional(), revoked: z.boolean().optional() },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ project: rid, id, ...body }) => {
    if ((body.ev === undefined) === (body.step === undefined)) return fail('Pass exactly one of ev or step.')
    const r = await post(base, f, `/api/researches/${enc(rid)}/flow/${enc(id)}/review`, { ...body, by: recordAuthor(server.server.getClientVersion()?.name) })
    return r.ok ? json(flowShort((r.body as C.FlowOne).node)) : r.error
  })

  server.registerTool('list_tasks', {
    title: 'List delegated tasks',
    description: 'Delegated tasks (workbench/tasks/*.md; one file per task, which is also its report): id, title, state (working, proposed, result, done, paused, stopped), agent, conclusion.',
    inputSchema: { project },
    annotations: ro,
  }, async ({ project: rid }) => call(`/api/researches/${enc(rid)}/tasks`, (b: { tasks: Record<string, unknown>[]; diagnostics?: unknown[] }) => ({
    tasks: b.tasks.map((t) => pick(t, ['id', 'file', 'title', 'state', 'agent', 'topic', 'created', 'conclusion'])),
    ...(b.diagnostics?.length ? { diagnostics: b.diagnostics } : {}),
  })))

  server.registerTool('read_task', {
    title: 'Read delegated task',
    description: 'All fields of one delegated task (task, end condition, references, things to avoid, results, user answers, judgments) and its body. The result format is in rules.',
    inputSchema: { project, id: z.string().describe('Task id from list_tasks') },
    annotations: ro,
  }, async ({ project: rid, id }) => call(`/api/researches/${enc(rid)}/tasks/${enc(id)}`, (b: { task: unknown }) => b.task))

  const writeOnce = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

  server.registerTool('add_task', {
    title: 'Add a task (to-do, handoff, proposal)',
    description: 'Create a task file workbench/tasks/<date>-<name>.md through the app (one task per file; the user sees it in the task tab). Use it for a to-do, a handoff to a later session or a proposal instead of writing the file. Leave endCondition empty when it is not settled: the agent who takes the task proposes it first (report_task kind proposal).',
    inputSchema: {
      project,
      title: z.string().trim().min(1).describe('Task name, up to 80 characters'),
      task: z.string().trim().min(1).describe('What to do'),
      endCondition: z.string().optional().describe('Against what and by which criterion it is finished'),
      topic: z.string().optional().describe('Topic id'),
      agent: z.string().optional().describe('claude-code or codex (default claude-code)'),
      references: z.array(z.string()).optional().describe('Notes, papers or folders to read first'),
      avoid: z.string().optional().describe('What not to do'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, ...body }) => {
    const r = await post(base, f, `/api/researches/${enc(rid)}/tasks`, body)
    if (!r.ok) return r.error
    const t = (r.body as { task: { id: string; file: string; state: string; hash: string } }).task
    return text(`Added task ${t.id} (${t.file}, ${t.state}). Hash: ${t.hash}.`)
  })

  server.registerTool('report_task', {
    title: 'Report on a delegated task',
    description: 'Write your report into a delegated task in progress (state working) instead of editing its file: the app writes the YAML front matter and the two body sections, so commas and colons cannot break it. kind proposal: the completion criteria you propose (when end-condition is empty, or it does not fit; do not start the work) → proposed. kind result: conclusion (one sentence), endCheck (pass · fail · unknown), summary (plain words, two or three sentences) and evidence (method, key figures, outputs) → result, the user\'s turn. Text already in a section is kept and the new text goes under a dated heading (corrections are never erased). You never set done: only the user approves. Read the task first (read_task) and pass its hash.',
    inputSchema: {
      project,
      id: z.string().describe('Task id from list_tasks'),
      baseHash: z.string().describe('hash from read_task'),
      kind: z.enum(['proposal', 'result']),
      endCondition: z.array(z.string()).optional().describe('proposal: the completion criteria, one per item'),
      reason: z.string().optional().describe('proposal: why these criteria'),
      conclusion: z.string().optional().describe('result: one sentence, shown on the card and at the top of the report'),
      endCheck: z.enum(['pass', 'fail', 'unknown']).optional().describe('result: did it meet the end condition'),
      summary: z.string().optional().describe('result: section 요약과 결론 (Markdown). Mark unchecked readings as 추정'),
      evidence: z.string().optional().describe('result: section 근거 (Markdown): method, key figures, outputs'),
      ask: z.array(z.union([z.string(), z.object({ q: z.string(), options: z.array(z.string()) })])).max(3).optional().describe('result: up to 3 questions the user decides; a string is yes/no'),
      issues: z.array(z.object({ text: z.string(), impact: z.string().optional(), next: z.number().int().positive().optional() })).optional().describe('result: open issues, those that can change the conclusion first; next = number of the next instruction'),
      next: z.array(z.object({ task: z.string(), endCondition: z.string().optional() })).optional().describe('result: proposed next instructions; the user starts them in the app'),
      outputs: z.array(z.string()).optional().describe('result: files, data folders, commits the result made'),
      checkMachine: z.string().optional().describe('result: machine checks you ran and their outcome, one line'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, id, kind, ...rest }) => {
    if (kind === 'proposal' && !rest.endCondition?.length) return fail('kind proposal needs endCondition.')
    if (kind === 'result' && (!rest.conclusion || !rest.endCheck || !rest.summary || !rest.evidence)) return fail('kind result needs conclusion, endCheck, summary and evidence.')
    const payload = kind === 'proposal'
      ? { kind, baseHash: rest.baseHash, endCondition: rest.endCondition, ...(rest.reason && { reason: rest.reason }) }
      : { kind, ...pick(rest, ['baseHash', 'conclusion', 'endCheck', 'summary', 'evidence', 'ask', 'issues', 'next', 'outputs', 'checkMachine']) }
    const r = await post(base, f, `/api/researches/${enc(rid)}/tasks/${enc(id)}/report`, payload)
    if (!r.ok) return r.error
    const t = (r.body as { task: { state: string; hash: string } }).task
    return text(`Reported. The task is now ${t.state}${t.state === 'result' || t.state === 'proposed' ? ' (the user\'s turn)' : ''}. Hash: ${t.hash}. Run agent:check-tasks only if you also edited task files directly.`)
  })

  server.registerTool('add_journal', {
    title: 'Add a line to today\'s journal',
    description: 'Append a memo line to the project journal for today (workbench/log/<date>.md) through the app: what you did, in a sentence or two, with the files you touched. Use it instead of writing the journal file. To-dos go to add_record or add_task, not the journal.',
    inputSchema: {
      project,
      text: z.string().trim().min(1).describe('The memo (Markdown, one or two sentences)'),
      target: z.string().optional().describe('Attach to a note: workbench/notes/<name>/note.md, workbench/topics/<topic>/<name>/note.md or a block id (default: the whole project)'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, text: body, target }) => {
    const r = await post(base, f, `/api/researches/${enc(rid)}/journal`, { kind: 'memo', text: body, ...(target && { target }) })
    if (!r.ok) return r.error
    const e = (r.body as { entry: { date: string; time?: string } }).entry
    return text(`Added to the journal of ${e.date}.`)
  })

  server.registerTool('search_library', {
    title: 'Search library',
    description: 'Find concept notes and papers in the shared library by name, alias, author, year or arXiv id. Concept notes are also found by their text: those come with hits (body line number, the heading it falls under, the line), so you can read just that part of read_concept.',
    inputSchema: {
      query: z.string().min(1).describe('Words to find; every word must match'),
      kind: z.enum(['concept', 'paper']).optional().describe('Only concept notes or only papers'),
    },
    annotations: ro,
  }, async ({ query, kind }) => {
    const r = await get(base, f, '/api/search/catalog')
    if (!r.ok) return r.error
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const items: (Partial<SearchItem> & { hits?: Hit[] })[] = (r.body as { items: SearchItem[] }).items
      .filter((i) => (kind ? i.kind === kind : i.kind === 'concept' || i.kind === 'paper'))
      .filter((i) => { const hay = `${i.id} ${i.title} ${i.also ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)) })
      .map((i) => pick(i, ['kind', 'id', 'title', 'also']))
    // 개념노트는 본문으로도 찾는다. 이름으로 찾은 노트에는 맞은 줄을 붙이고, 본문으로만 찾은 노트는 뒤에 더한다
    if (kind !== 'paper') {
      const body = await get(base, f, `/api/concepts/search?q=${enc(query)}&limit=30`)
      if (body.ok) for (const b of (body.body as { items: { id: string; title: string; hits: Hit[] }[] }).items ?? []) {
        const have = items.find((i) => i.kind === 'concept' && i.id === b.id)
        if (have) { if (b.hits?.length) have.hits = b.hits } else items.push({ kind: 'concept', id: b.id, title: b.title, ...(b.hits?.length ? { hits: b.hits } : {}) })
      }
    }
    return json(items.slice(0, 50))
  })

  server.registerTool('read_concept', {
    title: 'Read concept note',
    description: 'Front matter, body, hash and review state of one concept note (ok = checked by the user, changed = edited after the check, none = not checked). Treat unchecked notes as drafts.',
    inputSchema: { id: z.string().describe('Concept note id from search_library') },
    annotations: ro,
  }, async ({ id }) => {
    const r = await get(base, f, `/api/concepts/${enc(id)}`)
    if (r.ok) return json(r.body)
    // 예전 LaTeX 개념노트(concepts/<id>.tex)는 라이브러리 노트 API가 읽는다 (확인 상태 없음)
    const old = await get(base, f, `/api/library/notes/concept/${enc(id)}`)
    return old.ok ? json(old.body) : r.error
  })

  // 쓰기 도구 (10/8 에이전트 고침 검토): 앱이 기준판을 남기고 사용자가 문단마다 검토한다
  const edits = z.array(z.object({
    old: z.string().min(1).describe('Exact text to replace; must occur exactly once in the current text'),
    new: z.string().describe('Replacement text'),
    reason: z.string().trim().min(1).describe('One line: why this change (shown under the changed paragraph in the review, so the user rarely needs to ask)'),
  })).min(1).describe('Replacements applied in order')
  const approved = z.boolean().optional().describe('Only for a note the user has reviewed: true after the user agreed in the conversation')
  const summary = z.string().optional().describe('One line on why you made this whole batch of edits, shown to the user above the review as "Why the agent made these edits". Write it in the language the user reads, as a plain sentence a reader of the screen understands: no session-internal numbering ("note 1", "item 3"). Leave it out when each edit\'s reason already says it.')
  const w = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
  const write = async (target: unknown, a: { baseHash: string; edits: unknown; approved?: boolean; summary?: string }): Promise<Text> => {
    const r = await post(base, f, '/api/agent-edits/write', { target, baseHash: a.baseHash, edits: a.edits, approved: a.approved, summary: a.summary, agent: agentOf(server.server.getClientVersion()?.name) })
    if (!r.ok) return r.error
    const b = r.body as { hash: string; changes: number }
    return text(`Written. New hash: ${b.hash}. ${b.changes} changed paragraph(s) now await the user's review in the app (approve, revert or edit). Do not undo or redo the user's decisions.`)
  }

  server.registerTool('edit_note', {
    title: 'Edit note',
    description: 'Change a project note (research, calculation or block note; not manuscripts) by exact text replacement. Read it first with read_note and pass its hash as baseHash. The app keeps the text before your first edit as a baseline and the user approves, reverts or edits each changed paragraph. A note with status solved is refused on the first attempt (the user is notified); ask the user in the conversation, then send again with approved: true.',
    inputSchema: { project, file: z.string().describe('Repository-relative note path from list_notes'), baseHash: z.string().describe('hash from read_note'), edits, approved, summary },
    annotations: w,
  }, async ({ project: rid, file, ...a }) => write({ kind: 'note', rid, file }, a))

  server.registerTool('edit_concept', {
    title: 'Edit concept note',
    description: 'Change the body of a concept note (front matter stays) by exact text replacement. Read it first with read_concept and pass its hash as baseHash; follow the concept-note rules from the rules tool. The user reviews each changed paragraph in the app. A note the user has checked (checked: ok) is refused on the first attempt (the user is notified); ask the user in the conversation, then send again with approved: true. Locked notes are never changed.',
    inputSchema: { id: z.string().describe('Concept note id'), baseHash: z.string().describe('hash from read_concept'), edits, approved, summary },
    annotations: w,
  }, async ({ id, ...a }) => write({ kind: 'concept', id }, a))

  // 앱 고치기 대화에서만 (2단계 10/21): 에이전트는 명령을 돌리지 않고, 커밋 · PR · CI는 앱이 한다
  if (opts.appChat) {
    const chat = encodeURIComponent(opts.appChat)
    server.registerTool('app_submit', {
      title: 'Commit and open PR',
      description: 'Commit every change in the work folder, push the branch and open the pull request (or add to it if already open). The app refuses while another pull request is open. Title: one Korean line the user reads in the update history. Body: follow the PR template (Before / After / How / Checks).',
      inputSchema: { title: z.string().describe('One-line Korean PR title'), body: z.string().describe('PR body following the template') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (a) => {
      const r = await post(base, f, `/api/agent-chats/${chat}/app/submit`, a)
      if (!r.ok) return r.error
      const b = r.body as { number: number; url: string; created: boolean }
      return text(`${b.created ? 'Opened' : 'Updated'} PR #${b.number}: ${b.url}. CI runs now (about 3 minutes); call app_checks to read the result.`)
    })
    server.registerTool('app_checks', {
      title: 'PR checks',
      description: 'The CI result of this conversation\'s pull request: each check and its state, done / ok, and the end of the failed log when a check failed. Pass wait (minutes, up to 10) to wait here until the checks finish instead of calling again; do not sleep in a shell to wait.',
      inputSchema: { wait: z.number().min(0).max(10).optional().describe('Minutes to wait for the checks to finish (default 0 = answer now)') },
      annotations: ro,
    }, async ({ wait }) => call(`/api/agent-chats/${chat}/app/checks${wait ? `?wait=${wait}` : ''}`))
    server.registerTool('feedback_answer', {
      title: 'Record feedback handling',
      description: 'Only when this conversation handles an app feedback item: the app writes its handling record (status.yaml) for you; never edit the feedback files. state + note write a new handling (note first line: one fixed answer phrase from docs/feedback/agent.md §3). When redoing a revision request the app moves the previous handling to revised and adds miss / lesson there. after = screen picture name (scripts/shots/screens.mjs) that shows the fix, taken by this PR\'s CI: the app saves it with the picture left with the feedback as 전/후. replies = answers to unanswered comments (to = the comment\'s at); send replies without state to answer only.',
      inputSchema: {
        state: z.enum(['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류']).optional().describe('Handling state'),
        note: z.string().optional().describe('The answer the user reads; first line is the fixed phrase (수정 완료 (#PR) · 확인 필요 · 답변: 있음/없음/일부 · 의견에 동의 (크기) · 나중에 · 거절)'),
        understood: z.string().optional().describe('The request as understood'),
        cause: z.string().optional().describe('Cause'),
        clean: z.string().optional().describe('The feedback text, grammatically corrected'),
        ask: z.string().optional().describe('One sentence the user must decide'),
        miss: z.enum(FEEDBACK_MISSES).optional().describe('When redoing a revision request: why the previous handling was sent back'),
        lesson: z.string().optional().describe('When redoing: one line on what to do differently next time'),
        after: z.string().optional().describe('Screen picture name from scripts/shots/screens.mjs, after CI is green'),
        replies: z.array(z.object({ to: z.string(), note: z.string() })).optional().describe('Answers to unanswered comments'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async (a) => {
      const r = await post(base, f, `/api/agent-chats/${chat}/feedback/answer`, a)
      if (!r.ok) return r.error
      const b = r.body as { state?: string; pictures?: string[]; replies: number }
      return text(`Recorded${b.state ? ` ${b.state}` : ''}${b.pictures ? ` with pictures ${b.pictures.join(', ')}` : ''}${b.replies ? `, ${b.replies} replies` : ''}. The feedback screen shows it now.`)
    })
  }

  return server
}

/** scripts/mcp.mjs (pnpm mcp)가 부른다: 표준 입출력으로 MCP를 연다 */
export async function startStdio(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport())
}
