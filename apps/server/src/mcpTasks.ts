// 에이전트용 입구(mcp.ts)의 맡긴 일 도구: list_tasks · read_task · add_task · report_task · checkpoint_task(지금 상태 한 줄, 10/30).
// mcp.ts에서 떼어 냄 (10/30, 구조 래칫). 앱 서버 API만 부르고 파일을 직접 읽거나 쓰지 않는다
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { pick, type Text } from './mcp.js'

type Reply = { ok: true; body: unknown } | { ok: false; error: Text }
type Hints = { readonly readOnlyHint: boolean; readonly openWorldHint: false; readonly destructiveHint?: false; readonly idempotentHint?: false }

const text = (s: string): Text => ({ content: [{ type: 'text', text: s }] })
const fail = (s: string): Text => ({ content: [{ type: 'text', text: s }], isError: true })
const enc = encodeURIComponent
/** 앱 서버가 돌려준 맡긴 일 (답에 쓰는 칸만) */
const TaskReply = z.object({ task: z.object({ id: z.string(), file: z.string(), state: z.string(), hash: z.string() }).passthrough() })
const taskOf = (body: unknown) => TaskReply.parse(body).task

export function registerTaskTools(server: McpServer, o: {
  project: z.ZodString
  /** GET 하나를 도구 답으로 (shape로 줄여서) */
  call: (url: string, shape: (body: never) => unknown) => Promise<Text>
  /** POST 하나 */
  write: (url: string, payload: unknown) => Promise<Reply>
  ro: Hints
  writeOnce: Hints
}): void {
  const { project, call, write, ro, writeOnce } = o
  server.registerTool('list_tasks', {
    title: 'List delegated tasks',
    description: 'Delegated tasks (workbench/tasks/*.md; one file per task, which is also its report): id, title, state (working, proposed, result, done, paused, stopped), agent, conclusion.',
    inputSchema: { project },
    annotations: ro,
  }, async ({ project: rid }) => call(`/api/researches/${enc(rid)}/tasks`, (b: { tasks: Record<string, unknown>[]; diagnostics?: unknown[] }) => ({
    tasks: b.tasks.map((t) => pick(t, ['id', 'file', 'title', 'state', 'agent', 'topic', 'created', 'conclusion', 'checkpoint'])),
    ...(b.diagnostics?.length ? { diagnostics: b.diagnostics } : {}),
  })))

  server.registerTool('read_task', {
    title: 'Read delegated task',
    description: 'All fields of one delegated task (task, end condition, references, things to avoid, results, user answers, judgments) and its body. The result format is in rules.',
    inputSchema: { project, id: z.string().describe('Task id from list_tasks') },
    annotations: ro,
  }, async ({ project: rid, id }) => call(`/api/researches/${enc(rid)}/tasks/${enc(id)}`, (b: { task: unknown }) => b.task))

  server.registerTool('add_task', {
    title: 'Add a task (to-do, handoff, proposal)',
    description: 'Create a task file workbench/tasks/<date>-<name>.md through the app (one task per file; the user sees it in the task tab). Use it for a to-do, a handoff to a later session or a proposal instead of writing the file. Leave endCondition empty when it is not settled: the agent who takes the task proposes it first (report_task kind proposal).',
    inputSchema: {
      project,
      title: z.string().trim().min(1).describe('Task name, up to 80 characters'),
      task: z.string().trim().min(1).describe('What to do'),
      endCondition: z.string().optional().describe('Against what and by which criterion it is finished'),
      topic: z.string().optional().describe('Topic id'),
      flow: z.string().optional().describe('The flow dot this task works on (usually a question), so flow_search finds its result'),
      agent: z.string().optional().describe('claude-code or codex (default claude-code)'),
      references: z.array(z.string()).optional().describe('Notes, papers or folders to read first'),
      avoid: z.string().optional().describe('What not to do'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, ...body }) => {
    const r = await write(`/api/researches/${enc(rid)}/tasks`, body)
    if (!r.ok) return r.error
    const t = taskOf(r.body)
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
    const r = await write(`/api/researches/${enc(rid)}/tasks/${enc(id)}/report`, payload)
    if (!r.ok) return r.error
    const t = taskOf(r.body)
    return text(`Reported. The task is now ${t.state}${t.state === 'result' || t.state === 'proposed' ? ' (the user\'s turn)' : ''}. Hash: ${t.hash}. Run agent:check-tasks only if you also edited task files directly.`)
  })

  server.registerTool('checkpoint_task', {
    title: 'Set the current state of a delegated task',
    description: 'Overwrite the one-line current state of a delegated task you are working on (state working or paused): what just happened, where, and the next step, e.g. "L=24 done, eta 0.23 (data-space/x.csv); next L=32". Call it at milestones: a hypothesis confirmed or refuted, a blocker, a move from investigation to calculation. The user sees it on the task row and card without opening the conversation; a result report (report_task) replaces it. Read the task first (read_task): keep what the user wrote there if it still holds, and pass its hash.',
    inputSchema: {
      project,
      id: z.string().describe('Task id from list_tasks'),
      baseHash: z.string().describe('hash from read_task'),
      text: z.string().trim().min(1).max(300).describe('One line: what just happened, where, next step'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, id, ...body }) => {
    const r = await write(`/api/researches/${enc(rid)}/tasks/${enc(id)}/checkpoint`, body)
    if (!r.ok) return r.error
    const t = taskOf(r.body)
    return text(`Checkpoint saved. Hash: ${t.hash}.`)
  })
}
