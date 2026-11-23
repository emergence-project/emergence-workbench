// 에이전트용 입구(mcp.ts)의 중앙 검토 도구 (11/23 사용자 "충돌/모순이나 잘못된 결정은 없는지 검토하는 역할", agentCentralReview.ts):
// chat_review 깊은 검토(사용자 요청 · 의심 · 위험한 곳 · 겹침일 때만) · pr_hold 검토 중 합치기 보류 · decision_add 의도 장부에 사용자의 말 그대로 더하기.
// 중앙 대화만 받는다. 앱 서버 API만 부르고 파일을 직접 읽거나 쓰지 않는다
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CentralDecisions, CentralHold, CentralReviewStarted } from '@rw/core/contract/agentChats'
import type { Text } from './mcp.js'

type Reply = { ok: true; body: unknown } | { ok: false; error: Text }
const text = (s: string): Text => ({ content: [{ type: 'text', text: s }] })
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

export function registerReviewTools(server: McpServer, post: (url: string, payload: unknown) => Promise<Reply>): void {
  server.registerTool('chat_review', {
    title: 'Deep review of an app pull request',
    description: 'Start a deep review of one app-fix conversation\'s changes by a fresh reviewer that sees only the diff and the intent ledger (not its report, not your view). Two steps (find, then confirm); only confirmed findings come back to you as a wake, and a clean review stays silent. Costly: use it only when the user asks, when you suspect something, for risky areas (permissions, deleting, merge rules, sync, settings), or when open conversations change the same files. hold: true keeps its pull request from being merged (app_merge and auto-merge) until the review ends or you lift it with pr_hold.',
    inputSchema: {
      id: z.string().describe('The app-fix conversation id'),
      focus: z.string().max(1000).optional().describe('What to look at closely (your suspicion, the overlapping files)'),
      hold: z.boolean().optional().describe('Hold its merge while the review runs'),
    },
    annotations: write,
  }, async (a) => {
    const r = await post('/api/agent-central/review', a)
    if (!r.ok) return r.error
    const b = CentralReviewStarted.parse(r.body)
    return text(`Review started on ${b.files} changed files${b.held ? ', merge held' : ''}. Findings, if any, come later; silence means none.`)
  })
  server.registerTool('pr_hold', {
    title: 'Hold or release a merge under review',
    description: 'Hold (on: true) or release (on: false) the merge of an app-fix pull request whose deep review is running. A held pull request is skipped by app_merge and by auto-merge; never merge it any other way. The hold ends by itself when the review ends.',
    inputSchema: { id: z.string(), on: z.boolean(), reason: z.string().max(300).optional().describe('One line in Korean: why') },
    annotations: { ...write, idempotentHint: true },
  }, async (a) => {
    const r = await post('/api/agent-central/hold', a)
    return r.ok ? text(CentralHold.parse(r.body).held ? 'Held' : 'Released') : r.error
  })
  server.registerTool('decision_add', {
    title: 'Add to the intent ledger',
    description: 'Add a lasting decision of the user to the intent ledger, in the user\'s own words (verbatim, Korean as said), with the conversation it came from. Entries are never deleted: when the user changes a decision, add the new words with replaces = the old entry number, and the old one is marked superseded (대체됨). Not for task progress or your own conclusions.',
    inputSchema: {
      words: z.string().min(1).max(2000).describe('The user\'s words, verbatim'),
      source: z.string().min(1).max(100).describe('The conversation id where the user said it'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('When the user said it (default today)'),
      replaces: z.number().int().min(1).optional().describe('Number of the entry this decision replaces'),
    },
    annotations: write,
  }, async (a) => {
    const r = await post('/api/agent-central/decisions', a)
    if (!r.ok) return r.error
    const items = CentralDecisions.parse(r.body).items
    return text(`Added as ${items[items.length - 1]?.n ?? '?'}. ${items.filter((x) => !x.superseded).length} decisions in force.`)
  })
}
