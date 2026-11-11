// 에이전트용 입구(mcp.ts)의 문제 · 시도 나무 도구: problems · problem_brief · problem_read · problem_propose · problem_prepare ·
// attempt_add · attempt_start · attempt_report · attempt_verdict · direction_report (11/11 결정 "흐름을 시도 나무로 · 메시지 관문").
// 앱 서버 API만 부르고 파일을 직접 읽거나 쓰지 않는다. 누가 불렀는지는 mcp.ts가 붙이는 x-rw-agent로 서버가 가린다
// (문제를 시작하고 종료하는 것, 메시지 · 독자 · 한도 · 순서는 사용자만. 판정은 일한 쪽이 아닌 쪽만).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ATTEMPT_VERDICTS } from '@rw/core'
import * as C from '@rw/core/contract/problems'
import type { Text } from './mcp.js'

type Reply = { ok: true; body: unknown } | { ok: false; error: Text }
type Hints = { readonly readOnlyHint: boolean; readonly openWorldHint: false; readonly destructiveHint?: false; readonly idempotentHint?: false }

/** 연결할 때 에이전트에게 주는 순서 (mcp.ts INSTRUCTIONS의 한 줄) */
export const PROBLEM_INSTRUCTIONS = 'Problems and the attempt tree (new work; the older flow dots stay as they are): problems lists them. Work only under a problem the user has opened: problem_brief (question, the user\'s message, lessons of dropped attempts, the next candidate, the limit) → attempt_add to list candidate methods → attempt_start the next candidate → do the work → attempt_report (what you did, the result as facts, files). You never judge your own attempt: another agent or the user gives attempt_verdict from the raw data (holds needs a check outside the fitted condition, dropped needs a one-line lesson). At the limit, after three dropped in a row, or with no candidates left, starting is refused: file direction_report (facts for the yes sentence, for the no sentence, for neither) and stop; the user decides to continue, narrow or close. A new problem is only proposed (problem_propose, with its source); the user writes the message and opens it. Before it opens you may add literature comparison, a first test and a grading rule (problem_prepare). Do not rate whether a problem is worth doing.'

const text = (s: string): Text => ({ content: [{ type: 'text', text: s }] })
const json = (v: unknown): Text => text(JSON.stringify(v, null, 1))
const enc = encodeURIComponent
const one = (s: string, max = 120) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t }

const STOP: Record<C.ProblemStop, string> = {
  decision: 'A direction report is waiting for the user\'s decision. Stop here.',
  limit: 'The attempt limit is reached. File direction_report and stop.',
  stuck: 'Three attempts in a row were dropped. File direction_report and stop.',
  exhausted: 'No candidates are left. List more with attempt_add, or file direction_report.',
}
/** 쓰기 도구의 답 끝에 붙이는 지금 상태 한 줄: 멈춤 · 판정 대기 · 다음 */
function now(p: C.Problem): string {
  const waiting = p.attempts.filter((a) => a.state === 'reported').map((a) => `${a.label}${a.worker ? ` (by ${a.worker})` : ''}`)
  return [
    `Attempts ${p.used}/${p.limit}.`,
    waiting.length ? `Awaiting verdict: ${waiting.join(', ')}.` : '',
    p.stop ? STOP[p.stop] : p.next ? `Next: ${p.next.label} (${p.next.id}) ${one(p.next.method, 90)}.` : '',
  ].filter(Boolean).join(' ')
}

export function registerProblemTools(server: McpServer, o: {
  project: z.ZodString
  read: (url: string) => Promise<Reply>
  write: (url: string, payload: unknown, method?: 'POST' | 'PATCH') => Promise<Reply>
  ro: Hints
  writeOnce: Hints
}): void {
  const { project, read, write, ro, writeOnce } = o
  const problem = z.string().describe('Problem id (from problems)')
  const attempt = z.string().describe('Attempt id (a, b, c1 … from problem_brief or problem_read)')
  const R = (rid: string, id?: string) => `/api/researches/${enc(rid)}/problems${id ? `/${enc(id)}` : ''}`
  const done = (r: Reply, say: (p: C.Problem) => string): Text => {
    if (!r.ok) return r.error
    const p = C.ProblemOne.parse(r.body).problem
    return text(`${say(p)} ${now(p)}`.trim())
  }

  server.registerTool('problems', {
    title: 'List problems',
    description: 'Problems of a project (workbench/problems/): id, question, state (open = the user started it and agents may work under it; draft = the user is still writing its message; proposed = suggested by an agent, waiting for the user; closed), attempts used / limit, counts by attempt state, the next candidate and why work is stopped (stop).',
    inputSchema: { project },
    annotations: ro,
  }, async ({ project: rid }) => {
    const r = await read(R(rid))
    if (!r.ok) return r.error
    const b = C.ProblemList.parse(r.body)
    return json({ problems: b.problems.map(({ waiting: _w, ...row }) => row), ...(b.diagnostics.length && { diagnostics: b.diagnostics }) })
  })

  server.registerTool('problem_brief', {
    title: 'Take over a problem (short brief)',
    description: 'What a new session needs to continue one problem, under 2KB: the question, the user\'s message (the sentence if the answer is yes, if it is no) and reader, the grading rule, lessons of dropped attempts (do not go down the same path), attempts awaiting a verdict, the next candidate and the limit. Read this first; use problem_read only when you need every field.',
    inputSchema: { project, problem },
    annotations: ro,
  }, async ({ project: rid, problem: id }) => {
    const r = await read(`${R(rid, id)}/brief`)
    return r.ok ? text(C.ProblemBrief.parse(r.body).markdown) : r.error
  })

  server.registerTool('problem_read', {
    title: 'Read a problem (all fields)',
    description: 'Every field of one problem and its whole attempt tree: what each attempt did, its result, files, verdict (by whom, the check outside the fitted condition), lessons, direction reports and the user\'s decisions. With attempt, only that attempt.',
    inputSchema: { project, problem, attempt: attempt.optional() },
    annotations: ro,
  }, async ({ project: rid, problem: id, attempt: aid }) => {
    const r = await read(R(rid, id))
    if (!r.ok) return r.error
    const p = C.ProblemOne.parse(r.body).problem
    if (!aid) return json(p)
    const a = p.attempts.find((x) => x.id === aid.toLowerCase())
    return a ? json(a) : text(`No attempt ${aid} in problem ${id}. Attempts: ${p.attempts.map((x) => x.id).join(', ') || 'none'}.`)
  })

  server.registerTool('problem_propose', {
    title: 'Propose a problem',
    description: 'Suggest a question that came up while working (from a paper, a note section or an attempt). It is saved as a proposal the user sees folded in the problem list; the user decides whether to take it, writes the message and opens it. Give only the question and where it came from: do not write the message, the reader or an opinion on its value.',
    inputSchema: {
      project,
      question: z.string().trim().min(1).describe('The question, one sentence that can be answered yes or no'),
      source: z.string().trim().min(1).describe('Where it came from: a paper key, a note file and section, or problem/attempt ids'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, question, source }) => done(await write(R(rid), { question, source }), (p) => `Proposed problem ${p.id}. It stays a proposal until the user writes its message and opens it; do not work on it.`))

  server.registerTool('problem_prepare', {
    title: 'Prepare a problem (literature, first test, grading)',
    description: 'Add what the user needs to judge a draft or proposed problem, or to grade an open one. literature: papers that did the same or close, each with one factual line on what they did (rows are added to the list). first_test: the cheapest check that would show the direction is wrong. grading: the rule a result is graded against (for example "gap below 1e-6 at L = 24, 36, 48"); leave it out when the problem is exploratory. Facts only, no opinion on value.',
    inputSchema: {
      project, problem,
      literature: z.array(z.object({ ref: z.string().trim().min(1).describe('Paper key in the paper library, DOI or arXiv id'), fact: z.string().trim().min(1).describe('What that paper did, one line') })).optional(),
      first_test: z.string().optional(),
      grading: z.string().optional(),
    },
    annotations: writeOnce,
  }, async ({ project: rid, problem: id, literature, first_test, grading }) => {
    const cur = await read(R(rid, id))
    if (!cur.ok) return cur.error
    const p = C.ProblemOne.parse(cur.body).problem
    const rows = literature?.length ? [...p.literature.map(({ ref, fact }) => ({ ref, fact })), ...literature.filter((x) => !p.literature.some((y) => y.ref === x.ref && y.fact === x.fact))] : undefined
    const set = { ...(rows && { literature: rows }), ...(first_test !== undefined && { first_test }), ...(grading !== undefined && { grading }) }
    if (!Object.keys(set).length) return text('Nothing to change: give literature, first_test or grading.')
    return done(await write(R(rid, id), { baseHash: p.hash, set }, 'PATCH'), (q) => `Saved on problem ${q.id} (${q.state}): ${Object.keys(set).join(', ')}.`)
  })

  server.registerTool('attempt_add', {
    title: 'List attempt candidates',
    description: 'Add candidate methods under an open problem (or under an attempt, to go deeper along a branch that holds). List the candidates before working, one line each; the user may reorder them. Ids are given in order: a, b, c under the problem, c1, c2 under c. needs: "all" on a candidate means its own sub-attempts must all hold (a decomposition), otherwise sub-attempts are alternatives.',
    inputSchema: {
      project, problem,
      attempts: z.array(z.object({
        method: z.string().trim().min(1).describe('The method in one line: what will be tried'),
        parent: z.string().optional().describe('Attempt id to put this under'),
        needs: z.literal('all').optional(),
      })).min(1).max(12),
    },
    annotations: writeOnce,
  }, async ({ project: rid, problem: id, attempts }) => {
    const before = await read(R(rid, id))
    const had = new Set(before.ok ? C.ProblemOne.parse(before.body).problem.attempts.map((a) => a.id) : [])
    return done(await write(`${R(rid, id)}/attempts`, { attempts }), (p) => `Added ${p.attempts.filter((a) => !had.has(a.id)).map((a) => a.label).join(', ')}.`)
  })

  server.registerTool('attempt_start', {
    title: 'Start an attempt',
    description: 'Take a candidate and mark it as being worked on under your name. Without attempt, takes the next candidate (the first in the user\'s order). Refused at the attempt limit, after three dropped in a row, or while a direction report waits for the user: then file direction_report instead.',
    inputSchema: { project, problem, attempt: attempt.optional() },
    annotations: writeOnce,
  }, async ({ project: rid, problem: id, attempt: given }) => {
    let aid = given?.toLowerCase()
    if (!aid) {
      const cur = await read(R(rid, id))
      if (!cur.ok) return cur.error
      const p = C.ProblemOne.parse(cur.body).problem
      if (!p.next) return text(`Nothing to start in problem ${id}. ${now(p)}`)
      aid = p.next.id
    }
    return done(await write(`${R(rid, id)}/attempts/${enc(aid)}/start`, {}), (p) => {
      const a = p.attempts.find((x) => x.id === aid)
      return `Started ${a?.label ?? aid}: ${one(a?.method ?? '')}. Report with attempt_report when the work is done.`
    })
  })

  server.registerTool('attempt_report', {
    title: 'Report an attempt',
    description: 'Report the attempt you started: what you did and the result, as facts (numbers, sizes, parameters, where it failed), with the files that hold the raw data, code and note. The attempt then waits for a verdict from another agent or the user; you do not decide whether it holds. If you think it failed, add the one-line lesson and, when there is one, the condition under which it would be worth reopening.',
    inputSchema: {
      project, problem, attempt,
      did: z.string().trim().min(1).describe('What was done'),
      result: z.string().trim().min(1).describe('The result as facts'),
      files: z.array(z.string()).optional().describe('Repository paths: raw data, code, note section'),
      lesson: z.string().optional().describe('If it failed: what the next attempt should not repeat, one line'),
      reopen: z.string().optional().describe('Condition under which this path is worth reopening'),
    },
    annotations: writeOnce,
  }, async ({ project: rid, problem: id, attempt: aid, ...body }) =>
    done(await write(`${R(rid, id)}/attempts/${enc(aid.toLowerCase())}/report`, body), () => `Reported ${aid.toUpperCase()}. It waits for a verdict from another agent or the user.`))

  server.registerTool('attempt_verdict', {
    title: 'Give a verdict on an attempt',
    description: 'Judge an attempt someone else worked on, from its raw data and files (problem_read), not from its summary. holds: you reproduced it and checked it outside the condition it was fitted on (another size, other parameters, an independent implementation or a limit); say what in check. dropped: it does not hold; give the one-line lesson. Refused for an attempt you worked on yourself.',
    inputSchema: {
      project, problem, attempt,
      result: z.enum(ATTEMPT_VERDICTS),
      note: z.string().trim().min(1).describe('What you reran or read, and what you found'),
      check: z.string().optional().describe('For holds: the check outside the fitted condition and its outcome'),
      lesson: z.string().optional().describe('For dropped: the lesson, one line (kept from the report when left out)'),
      reopen: z.string().optional(),
    },
    annotations: writeOnce,
  }, async ({ project: rid, problem: id, attempt: aid, ...body }) =>
    done(await write(`${R(rid, id)}/attempts/${enc(aid.toLowerCase())}/verdict`, body), () => `Verdict on ${aid.toUpperCase()}: ${body.result}.`))

  server.registerTool('direction_report', {
    title: 'File a direction report',
    description: 'When work stops (the attempt limit, three dropped in a row, no candidates left) or the results drift from the question, report where the problem stands and stop. Facts only, sorted by the user\'s message: for_yes = results that support the sentence for "yes", for_no = results that support the sentence for "no", neither = results that bear on neither. Do not recommend whether to continue; the user decides to continue, narrow or close.',
    inputSchema: { project, problem, for_yes: z.string().optional(), for_no: z.string().optional(), neither: z.string().optional() },
    annotations: writeOnce,
  }, async ({ project: rid, problem: id, ...body }) => done(await write(`${R(rid, id)}/report`, body), () => 'Direction report filed.'))
}
