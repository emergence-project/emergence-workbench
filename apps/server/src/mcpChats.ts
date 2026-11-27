// 에이전트 대화에서만 여는 MCP 도구 (mcp.ts에서 나눔): 앱 고치기 대화의 올리기 · 합치기 · 검사 · 피드백 기록,
// 앱 안 대화의 중앙 도움 요청, 중앙 대화의 하위 대화 열기 · 보내기 · 닫기
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { FEEDBACK_MISSES } from '@rw/core'
import { FEEDBACK_VERDICTS } from '@rw/core/contract/feedback'
import type { Text } from './mcp.js'
import { registerArchiveTool, registerRoomTools } from './mcpRoom.js'
import { registerReviewTools } from './mcpReview.js'

type Reply = { ok: true; body: unknown } | { ok: false; error: Text }
const text = (s: string): Text => ({ content: [{ type: 'text', text: s }] })
const Kid = z.object({ kid: z.object({ id: z.string(), title: z.string(), state: z.string(), pr: z.object({ number: z.number() }).optional() }) })

/** 이 대화가 무엇인지(opts)에 따라 도구를 더한다. post · call은 mcp.ts가 앱 서버로 보낸다 */
export function registerChatTools(server: McpServer, o: {
  opts: { appChat?: string; chat?: string; central?: boolean }
  post: (url: string, payload: unknown) => Promise<Reply>
  call: (url: string, shape?: (body: never) => unknown) => Promise<Text>
  ro: { readonly readOnlyHint: true; readonly openWorldHint: false }
}): void {
  const { opts, post, call, ro } = o
  // 앱 고치기 대화에서만 (2단계 10/21): 에이전트는 명령을 돌리지 않고, 커밋 · PR · CI는 앱이 한다
  if (opts.appChat) {
    const chat = encodeURIComponent(opts.appChat)
    server.registerTool('app_submit', {
      title: 'Commit and open PR',
      description: 'Commit every change in the work folder, push the branch and open the pull request (or add to it if already open). Before pushing, the app runs pnpm type-check and the ports-guide, about and structure-ratchet checks (scripts/ci/check-ports.mjs, check-about.mjs, check-ratchet.mjs) in the work folder; if one fails it undoes its commit, pushes nothing and returns the errors, so fix them and call app_submit again. When you changed a screen but no about section, the reply names the about sections that usually change with that screen file: read them and update the one whose description no longer matches. After the pull request number is known, the app writes the about sections you changed to apps/web/src/about/prs/<number>.json and pushes once more (do not add the number to a section\'s prs yourself). Title: one Korean line the user reads in the update history. Body: follow the PR template (Before / After / How / Checks).',
      inputSchema: { title: z.string().describe('One-line Korean PR title'), body: z.string().describe('PR body following the template') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (a) => {
      const r = await post(`/api/agent-chats/${chat}/app/submit`, a)
      if (!r.ok) return r.error
      const b = z.object({ number: z.number(), url: z.string(), created: z.boolean(), notes: z.array(z.string()).optional() }).parse(r.body)
      const notes = b.notes?.length ? `\n\nThe checks did not block, but ask you to look:\n${b.notes.map((n) => `- ${n}`).join('\n')}\nIf one applies, fix it and call app_submit again; otherwise carry on.` : ''
      return text(`${b.created ? 'Opened' : 'Updated'} PR #${b.number}: ${b.url}. CI runs now (about 3 minutes); call app_checks to read the result.${notes}`)
    })
    server.registerTool('app_merge', {
      title: 'Merge own PR',
      description: 'Squash-merge this conversation\'s own pull request into main. The app merges only when every check on the last commit passed and the branch does not conflict with main; otherwise it says what to do (wait with app_checks, fix and app_submit again, or merge origin/main). Feedback conversations do not call this: the app merges their pull requests by the merge setting. After merging, the app picks up the new version and restarts when idle.',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async () => {
      const r = await post(`/api/agent-chats/${chat}/app/merge`, {})
      if (!r.ok) return r.error
      const b = z.object({ number: z.number(), sha: z.string() }).parse(r.body)
      return text(`Merged PR #${b.number} by squash (${b.sha.slice(0, 7)}). The app restarts with it when idle.`)
    })
    server.registerTool('app_checks', {
      title: 'PR checks',
      description: 'The CI result of this conversation\'s pull request: each check and its state, done / ok, and the end of the failed log when a check failed. Pass wait (minutes, up to 10, or up to 30 for an app whose brief says so) to wait here until the checks finish instead of calling again; do not sleep in a shell to wait.',
      inputSchema: { wait: z.number().min(0).max(30).optional().describe('Minutes to wait for the checks to finish (default 0 = answer now)') },
      annotations: ro,
    }, async ({ wait }) => call(`/api/agent-chats/${chat}/app/checks${wait ? `?wait=${wait}` : ''}`))
    server.registerTool('feedback_answer', {
      title: 'Record feedback handling',
      description: 'Only when this conversation handles app feedback (one item, or several bundled: pass key for each): the app writes its handling record (status.yaml) for you; never edit the feedback files. state + note write a new handling (note first line: one fixed answer phrase from docs/feedback/agent.md §3). When redoing a revision request the app moves the previous handling to revised and adds miss / lesson there. after = screen picture name (scripts/shots/screens.mjs) that shows the fix, taken by this PR\'s CI: the app saves it with the picture left with the feedback as 전/후. replies = answers to unanswered comments (to = the comment\'s at); send replies without state to answer only. mockups = names of mockups in this folder\'s mockups/ (<name>.png and <name>.html, with or without extension): the app copies them into the feedback folder and shows them as thumbnails on the handling (or on a reply via replies[].mockups) so the user can page through them, open the html and choose 진행 / 논의 there; send mockups without state to add them to the current handling. dropMockups = names of mockups already attached to this item\'s answers (current handling, revised or replies) that will not be used, to take them off when the user asks; it never touches pictures, the user\'s text, verdicts or comments. verdict = the user\'s own verdict on the current handling when they said it in this conversation (진행 · 승인 · 반려 · 중단 · 논의, with verdictNote = their words): the app records it as if they chose it on the feedback screen, before the new handling; send it with the new state, or alone right when they say it.',
      inputSchema: {
        key: z.string().optional().describe('Which feedback item, when this conversation handles several (required then)'),
        state: z.enum(['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류']).optional().describe('Handling state'),
        note: z.string().optional().describe('The answer the user reads; first line is the fixed phrase (수정 완료 (#PR) · 확인 필요 · 답변: 있음/없음/일부 · 의견에 동의 (크기) · 나중에 · 거절)'),
        understood: z.string().optional().describe('The request as understood'),
        cause: z.string().optional().describe('Cause'),
        clean: z.string().optional().describe('The feedback text, grammatically corrected'),
        ask: z.string().optional().describe('One sentence the user must decide'),
        miss: z.enum(FEEDBACK_MISSES).optional().describe('When redoing a revision request: why the previous handling was sent back'),
        lesson: z.string().optional().describe('When redoing: one line on what to do differently next time'),
        after: z.string().optional().describe('Screen picture name from scripts/shots/screens.mjs, after CI is green'),
        mockups: z.array(z.string()).optional().describe('Mockup names in mockups/ of this folder to attach to the handling (e.g. ["nav-tabs"])'),
        replies: z.array(z.object({ to: z.string(), note: z.string(), mockups: z.array(z.string()).optional() })).optional().describe('Answers to unanswered comments, each with optional mockups'), dropMockups: z.array(z.string()).optional().describe('Names of attached mockups to take off this item\'s answers (e.g. ["agent-side-views"]), only when the user asks'),
        verdict: z.enum(FEEDBACK_VERDICTS).optional().describe('The user\'s verdict said in this conversation (never your own judgement)'),
        verdictNote: z.string().optional().describe('The user\'s words with that verdict (needed for 논의)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async (a) => {
      const r = await post(`/api/agent-chats/${chat}/feedback/answer`, a)
      if (!r.ok) return r.error
      const b = z.object({ state: z.string().optional(), verdict: z.string().optional(), pictures: z.array(z.string()).optional(), replies: z.number() }).parse(r.body)
      return text(`Recorded${b.verdict ? ` the user's ${b.verdict}` : ''}${b.state ? ` ${b.state}` : ''}${b.pictures ? ` with pictures ${b.pictures.join(', ')}` : ''}${b.replies ? `, ${b.replies} replies` : ''}. The feedback screen shows it now.`)
    })
  }

  // 중앙이 아닌 앱 안 대화 (11/19 사용자 "대화중에 다른 영역 · 앱 버그가 발생하면 중앙에 중재를 요청"): 고칠 수 없는 곳의 일을 중앙에게 넘긴다
  if (opts.chat && !opts.central) {
    const chat = opts.chat
    server.registerTool('central_help', {
      title: 'Ask the central conversation',
      description: 'Ask the central conversation to mediate when the work needs something this conversation cannot do: a change in a project it may not change or in a concept note (those are read-only here), or a bug in the app itself. Say what should change, where and why, in a few lines. The central conversation is woken right away and opens the conversation that owns it or asks the user. Keep doing the rest of your own work.',
      inputSchema: { text: z.string().max(4000).describe('What should change, where and why') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ text: s }) => {
      const r = await post('/api/agent-central/help', { chat, text: s })
      return r.ok ? text('Sent to the central conversation. Continue with your own work; it handles this.') : r.error
    })
  }

  // 중앙 대화에서만 (11/16 "중앙 에이전트"): 하위 대화 열기 · 이어 보내기 · 닫기 · 목록
  if (opts.central) {
    const APP_HELD = 'not enough free memory for another app conversation, so the app holds it and opens it by itself when memory frees or one ends. Do not open it again.'
    const kidLine = (k: { id: string; title: string; state: string; pr?: { number: number } }) => `${k.id} · "${k.title}" · ${k.state}${k.pr ? ` · PR #${k.pr.number}` : ''}`
    const kidCall = async (url: string, body: unknown, verb: string): Promise<Text> => {
      const r = await post(url, body)
      return r.ok ? text(`${verb}: ${kidLine(Kid.parse(r.body).kid)}`) : r.error
    }
    server.registerTool('chat_list', {
      title: 'Sub-conversations',
      description: 'Your sub-conversations, and apps = the other apps whose repositories are on this computer (open an app conversation for one with chat_open app). Each: id, project (_app = an app conversation, app = which other app if not this one), title, state, wait (plan / ask = the user must answer), pull request, report (with reported: true its own report section from the last turn, whole: what changed, where, decision, what is left; otherwise its last agent text, cut) and, for closed ones, the summary. Check it before opening a new one.',
      inputSchema: {},
      annotations: ro,
    }, async () => call('/api/agent-central', (b: { kids: unknown[]; apps?: unknown[] }) => (b.apps?.length ? { kids: b.kids, apps: b.apps } : b.kids)))
    server.registerTool('feedback_turns', {
      title: 'Feedback for the agent',
      description: 'App feedback items that are the agent\'s turn now (new items, revise requests, unanswered comments): key, kind, screen part (target), text, reasons, taken (another computer or the cloud routine claimed it: skip), chat (a conversation here already handles it), group (items with the same group go to one conversation: fixes on the same screen, or questions · suggestions). Use it when the user asks to handle new feedback, then open one feedback sub-conversation per group with chat_open (feedbacks = the keys of that group).',
      inputSchema: {},
      annotations: ro,
    }, async () => call('/api/agent-central/feedback', (b: { items: unknown[] }) => b.items))
    server.registerTool('chat_open', {
      title: 'Open sub-conversation',
      description: 'Hand work to a new sub-conversation. role app = fix or build in the app repository (own work folder and pull request; pass app = an id from chat_list apps, e.g. qcad, to fix that other app instead of this one; opened while memory is free, otherwise held and opened by the app when memory frees; urgent: true opens one at once for an app bug or a stuck app). role project = write or edit in one research project (pass project; edits go to the user\'s edit review). role feedback = handle app feedback (pass feedbacks = the keys of one group from feedback_turns, or feedback = one key; refused if another computer or the cloud routine claimed one). task = the user\'s words verbatim plus the context needed. It starts working right away.',
      inputSchema: {
        role: z.enum(['app', 'project', 'feedback']),
        title: z.string().max(60).describe('Short Korean title the user sees'),
        task: z.string().describe('What to do: the user\'s own words verbatim, then needed context'),
        project: z.string().optional().describe('Project id for role project (from list_projects)'), feedback: z.string().optional().describe('One feedback key for role feedback'),
        feedbacks: z.array(z.string()).max(5).optional().describe('Keys of one feedback group (same group in feedback_turns) for role feedback, handled together in one conversation'),
        urgent: z.boolean().optional().describe('role app only, and only when the app itself is broken or stuck (an app bug, the app not responding): opens at once whatever the memory and queue, one at a time'),
        app: z.string().optional().describe('role app only: fix another app whose repository is on this computer (an id from chat_list apps, e.g. qcad). Leave out for this app'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async (a) => {
      const r = await post('/api/agent-central/open', a)
      if (!r.ok) return r.error
      const b = z.object({ kid: z.object({ id: z.string(), title: z.string(), state: z.string(), pr: z.object({ number: z.number() }).optional() }).optional(), held: z.number().optional() }).parse(r.body)
      return text(b.kid ? `Opened: ${kidLine(b.kid)}` : `Held (#${b.held ?? 0}): ${APP_HELD}`)
    })
    server.registerTool('chat_send', {
      title: 'Send to sub-conversation',
      description: 'Send a message to one of your sub-conversations (change direction, add what the user said, ask for a report). A working one reads it in its current turn.',
      inputSchema: { id: z.string().describe('Sub-conversation id from chat_list'), text: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async (a) => kidCall('/api/agent-central/send', a, 'Sent'))
    server.registerTool('memo_write', {
      title: 'Central memo',
      description: 'Rewrite the central memo: lasting facts and rules the user set ("from now on X is Y"), read at the start of every central conversation and shown to the user in Settings › Agents. Send the whole memo (it replaces the old one): short lines, at most 4000 characters, no task progress.',
      inputSchema: { text: z.string().max(4000).describe('The whole memo') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (a) => { const r = await post('/api/agent-central/memo', a); return r.ok ? text('Memo saved') : r.error })
    server.registerTool('chat_answer', {
      title: 'Answer for the user',
      description: 'Answer a plan approval or permission request a sub-conversation or a feedback conversation waits on (chat_list or the wake-up shows ask id), from what the user asked. Only non-critical ones: the app refuses critical ones (merging, restarting the app, deleting or overwriting, sending outside, changing research or concept notes, money or accounts) — leave those to the user. The card shows that you answered.',
      inputSchema: {
        id: z.string().describe('Sub-conversation or feedback conversation id'),
        ask: z.string().describe('Ask id from chat_list or the wake-up'),
        answer: z.enum(['allow', 'deny']),
        note: z.string().optional().describe('For deny: what to do instead'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async (a) => kidCall('/api/agent-central/answer', a, 'Answered'))
    server.registerTool('chat_close', {
      title: 'Close sub-conversation',
      description: 'Close a sub-conversation whose work ended (pull request merged, edits reviewed, question answered): it is archived with your summary. Refused while it is still working.',
      inputSchema: { id: z.string(), summary: z.string().max(2000).describe('Three lines: what was done, where the result is, what is left') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (a) => kidCall('/api/agent-central/close', a, 'Closed'))
    registerRoomTools(server, post); registerArchiveTool(server, post); registerReviewTools(server, post)
  }
}
