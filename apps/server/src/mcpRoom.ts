// 에이전트용 입구(mcp.ts)의 중앙 방 도구 (11/20 사용자 결정 "중앙 = 여럿이 말하는 방", 시안 https://claude.ai/artifact/1e4G2p1cQjgVNSSAZ9RFHr):
// 방장(중앙 대화)만 받는다. room_ask 방 사람에게 묻기 · room_invite 초대(읽기만 · 발언까지, 까닭 한 줄) · room_remove 내가 초대한 사람 내보내기 ·
// debate_open 토론 열기(11/20 「토론 + 정해진 4단계」, 결론은 끝난 뒤 다음 차례 앞에 온다).
// 앱 서버 API만 부르고 파일을 직접 읽거나 쓰지 않는다
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AGENT_KINDS, CentralArchived, DebateOpened, RoomAnswer } from '@rw/core/contract/agentChats'
import type { Text } from './mcp.js'

type Reply = { ok: true; body: unknown } | { ok: false; error: Text }
const text = (s: string): Text => ({ content: [{ type: 'text', text: s }] })
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
const agent = z.enum(AGENT_KINDS).describe('claude-code = Claude, codex = Codex, gemini = Gemini')

export function registerRoomTools(server: McpServer, post: (url: string, payload: unknown) => Promise<Reply>): void {
  server.registerTool('room_ask', {
    title: 'Ask a room member',
    description: 'Ask one member of the central room (another agent the user invited, e.g. Codex) a question and get its answer: a second opinion, a review of a plan, a check of your reasoning. It reads only and sees the recent room conversation; its answer also shows in the room. Members with read-only permission give a short folded summary. You may have only as many asks running at once as the room rules allow.',
    inputSchema: { agent, question: z.string().max(8000).describe('What to ask, with the context it needs') },
    annotations: write,
  }, async (a) => {
    const r = await post('/api/agent-room/host/ask', a)
    return r.ok ? text(RoomAnswer.parse(r.body).answer) : r.error
  })
  server.registerTool('room_invite', {
    title: 'Invite to the room',
    description: 'Invite another agent into the central room when the user\'s work would clearly benefit from it (for example Codex to review). Only read (read-only) or talk permission; the edit permission stays with the user to grant. Give a one-line reason in Korean: the user sees it and can remove the agent. Refused when the room rules do not let you invite.',
    inputSchema: { agent, perm: z.enum(['read', 'talk']).describe('read = folded summary when called, talk = answers when called'), reason: z.string().max(200).describe('One line in Korean: why this agent helps now') },
    annotations: write,
  }, async (a) => { const r = await post('/api/agent-room/host/invite', a); return r.ok ? text('Invited') : r.error })
  server.registerTool('room_remove', {
    title: 'Remove from the room',
    description: 'Remove an agent you invited from the central room when it is no longer needed. Members the user invited stay; only the user removes them.',
    inputSchema: { agent },
    annotations: write,
  }, async (a) => { const r = await post('/api/agent-room/host/remove', a); return r.ok ? text('Removed') : r.error })
  server.registerTool('debate_open', {
    title: 'Open a debate',
    description: 'Open a debate: a separate conversation for one question where being wrong is costly (a bug cause, a design choice, a math or physics claim). The app runs fixed steps: the participants answer blind, critique each other with names hidden, revise (a changed position needs a new reason), and a judge that does not vote sums up in three lines. You do not take part. The user watches it and ends it; then its one-line result comes back to you before your next turn. Use it instead of asking members one by one when a careful cross-check matters.',
    inputSchema: { q: z.string().min(1).max(8000).describe('The question, with the context the participants need (they read only this)'), agents: z.array(agent).min(2).max(4).optional().describe('Participants; default = the room members other than you') },
    annotations: write,
  }, async (a) => {
    const r = await post('/api/agent-debate/host', a)
    return r.ok ? text(`Opened debate ${DebateOpened.parse(r.body).id}. Tell the user in one line; the result comes later.`) : r.error
  })
}

/** 중앙이 하위 대화가 아닌 대화를 보관한다 (chat_archive, 11/20 사용자 "대화를 여는 권한도 있으니 닫을 권한도"). 지우기는 사용자 몫 */
export function registerArchiveTool(server: McpServer, post: (url: string, payload: unknown) => Promise<Reply>): void {
  server.registerTool('chat_archive', {
    title: 'Archive a conversation',
    description: 'Archive a conversation that is not your sub-conversation (for sub-conversations use chat_close), only when its work was confirmed finished elsewhere: its feedback is 반영 or 답변, or another conversation already did the work, and it is left on an error or idle. Refused while it is working. It only archives (the user can take it back from the archive; deleting stays with the user), and a line in your conversation shows it. A conversation on another computer is archived at that computer\'s next sync, unless it was continued there meanwhile.',
    inputSchema: { id: z.string().describe('Conversation id (chat_list or the conversation list)'), reason: z.string().max(300).describe('One line in Korean: where its work was finished') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (a) => {
    const r = await post('/api/agent-central/archive', a)
    if (!r.ok) return r.error
    const b = CentralArchived.parse(r.body)
    return text(b.machine ? `Asked ${b.machine} to archive "${b.title}" at its next sync` : `Archived "${b.title}"`)
  })
}
