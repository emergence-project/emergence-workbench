// 노트 본문·PDF 기록
import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import { agentAnswer, appendAnswer, applyAnswerFixes, askPrompt, claudeClassifierRunner, claudeRunner, replyToRecord } from '../ask.js'
import { repeat } from '../scheduler.js'
import * as C from '@rw/core/contract/comments'
import { LIBRARY_RID } from '@rw/core'
import { parseBody, replies } from '../contract.js'
import { addComment, classifyComments, isAgentKind, commentSourceFile, deleteComment, listComments, listRecords, pendingQuestions, readComments, updateComment } from '../comments.js'
import { materialPath } from '../materials.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'
import { projectRules } from '../agentRules.js'
import { ClaudeQueue, dailyDue } from '../instructions.js'

export function registerComments(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf, repoPath, recordsRoot, opts, registry } = ctx
  /** 지금 Claude가 답을 쓰고 있는 질문 (같은 질문을 두 번 넘기지 않게) */
  const asking = new Set<string>()
  const classifying = new Set<string>()
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/comments', replies(C.CommentOverview), async (req): Promise<C.CommentOverview> => {
    const root = recordsRoot(req.params.rid)
    return {
      files: listComments(root).map((f) => ({ target: f.target, title: f.title, source: f.source, count: f.comments.length })),
      pending: pendingQuestions(root),
    }
  })
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/records', replies(C.RecordList), async (req): Promise<C.RecordList> => {
    const rid = req.params.rid
    return { files: listRecords(recordsRoot(rid), rid === LIBRARY_RID ? null : wbOf(rid).readResearch().title) }
  })
  app.get<{ Params: { rid: string; target: string } }>('/api/researches/:rid/comments/:target', replies(C.CommentFile), async (req): Promise<C.CommentFile> =>
    readComments(recordsRoot(req.params.rid), req.params.target))
  app.post<{ Params: { rid: string; target: string } }>('/api/researches/:rid/comments/:target', replies(C.CommentAdded), async (req): Promise<C.CommentAdded> => {
    const added = addComment(recordsRoot(req.params.rid), req.params.target, parseBody(C.NewCommentBody, req.body))
    if (added.entry.kind === '지시') instantFor(req.params.rid, req.params.target)
    return added
  })
  app.post<{ Params: { rid: string; target: string } }>('/api/researches/:rid/comments/:target/classify', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { rid, target } = req.params
    const { baseHash } = parseBody(C.ClassifyBody, req.body)
    const root = recordsRoot(rid)
    const key = `${root}/${target}`
    if (classifying.has(key)) throw new WorkbenchError(409, t('이미 이 기록을 분류하는 중입니다', 'Already sorting this record'))
    classifying.add(key)
    try {
      const sorted = await classifyComments(root, target, baseHash, opts.classify ?? claudeClassifierRunner, repoPath(rid))
      instantFor(rid, target)
      return sorted
    } finally { classifying.delete(key) }
  })
  app.patch<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { state, color, text, kind, baseHash } = parseBody(C.CommentChangeBody, req.body)
    return updateComment(recordsRoot(req.params.rid), req.params.target, req.params.id, { state, color, text, kind }, baseHash)
  })
  app.delete<{ Params: { rid: string; target: string; id: string }; Querystring: { baseHash?: string } }>('/api/researches/:rid/comments/:target/:id', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const baseHash = req.query.baseHash
    if (typeof baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    return deleteComment(recordsRoot(req.params.rid), req.params.target, req.params.id, baseHash)
  })
  /** 질문 · 지시를 맥의 Claude에게 넘기고, 답이 오면 그 아래에 덧붙인다. 답이 올 때까지(몇 분) 기다렸다가 고친 파일을 돌려준다 */
  async function answerWithClaude(rid: string, target: string, id: string): Promise<C.CommentFile> {
    const root = recordsRoot(rid)
    const f = readComments(root, target)
    const q = f.comments.find((c) => c.id === id)
    if (!q || !isAgentKind(q.kind)) throw new WorkbenchError(404, t(`질문이나 지시가 없음: ${id}`, `No such question or instruction: ${id}`))
    const key = `${rid}/${target}/${id}`
    if (asking.has(key)) throw new WorkbenchError(409, t('Claude가 이미 이 기록에 답을 쓰고 있습니다', 'Claude is already writing an answer to this record'))
    asking.add(key)
    try {
      const repo = repoPath(rid)
      let file: string | undefined
      if (target.startsWith('paper-') && f.source && rid !== LIBRARY_RID) {
        const wb = wbOf(rid)
        try { file = path.relative(repo, materialPath(wb.root, f.source, wb.readResearch().sources)) } catch { /* 찾지 못하면 Claude가 이름으로 찾는다 */ }
      } else {
        const source = commentSourceFile(root, f)
        if (source) file = path.relative(repo, source)
      }
      const answer = await (opts.ask ?? claudeRunner)({ cwd: repo, prompt: askPrompt(f, id, { repo, file, rules: projectRules(repo) }) })
      return appendAnswer(root, target, id, 'claude', answer)
    } finally {
      asking.delete(key)
    }
  }
  app.post<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id/answer', replies(C.CommentFile), async (req): Promise<C.CommentFile> =>
    answerWithClaude(req.params.rid, req.params.target, req.params.id))

  /*
   * 지시를 맥의 Claude가 하는 때 (설정 › 에이전트, 10/16): 바로(instant)면 지시를 남기거나 이어 쓸 때, 하루 한 번(daily)이면 고른 시각에.
   * 사용자가 남긴 대기 중인 지시만 집고, 차례(ClaudeQueue)로 하나씩 한다. 차례가 왔을 때 이미 답이 있으면 건너뛴다.
   */
  const queue = new ClaudeQueue()
  function enqueue(rid: string, target: string, id: string): void {
    queue.add(`${rid}/${target}/${id}`, async () => {
      const q = readComments(recordsRoot(rid), target).comments.find((c) => c.id === id)
      if (q?.kind === '지시' && q.state === '대기' && !q.by) await answerWithClaude(rid, target, id)
    })
  }
  /** 한 기록 파일의 대기 중인 지시를 모두 차례에 넣는다 (바로일 때만) */
  function instantFor(rid: string, target: string): void {
    if (registry.agents.instructions !== 'instant') return
    for (const c of readComments(recordsRoot(rid), target).comments) if (c.kind === '지시' && c.state === '대기' && !c.by) enqueue(rid, target, c.id)
  }
  let lastDaily: string | null = null
  repeat(app, { first: 60_000, every: 60_000, run: async () => {
    const s = registry.agents
    if (s.instructions !== 'daily') return
    const day = dailyDue(s.at, new Date(), lastDaily)
    if (!day) return
    lastDaily = day
    // 멈춤 · 완료 프로젝트는 하루 한 번 모아 돌리지 않는다 (사용자가 그 프로젝트에 바로 쓴 지시는 instantFor가 받는다)
    // 지식 라이브러리의 지시도 함께 모은다 (10/18)
    for (const rid of [...registry.list().filter((x) => x.state === 'active').map((x) => x.id), ...(registry.libraryPath ? [LIBRARY_RID] : [])]) {
      try { for (const p of pendingQuestions(recordsRoot(rid), '지시')) enqueue(rid, p.target, p.id) } catch { /* 저장소가 없거나 읽지 못하면 그 연구는 건너뛴다 */ }
    }
  } })
  ;(app as unknown as { instructionQueue?: ClaudeQueue }).instructionQueue = queue

  /** 에이전트가 쓴 답을 질문 · 지시 아래에 덧붙인다 (MCP answer_record, 10/15; 클라우드는 pnpm agent:answer가 같은 agentAnswer를 부른다) */
  app.post<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id/answers', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { by, body } = parseBody(C.AgentAnswerBody, req.body)
    return agentAnswer(recordsRoot(req.params.rid), req.params.target, req.params.id, by, body)
  })
  /** 사용자가 질문 · 지시 아래에 이어 쓴다 (10/15). 사용자가 쓴 기록은 다시 대기(에이전트 차례), 에이전트가 쓴 기록은 답함 */
  app.post<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id/reply', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { text } = parseBody(C.ReplyBody, req.body)
    const f = replyToRecord(recordsRoot(req.params.rid), req.params.target, req.params.id, text)
    instantFor(req.params.rid, req.params.target)
    return f
  })
  /** 답에 든 고침을 노트에 적용한다 (사용자가 "노트에 적용"을 누를 때). { answer: 답 번호, baseHash: 기록 파일 hash } */
  app.post<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id/apply', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { answer, baseHash } = parseBody(C.ApplyAnswerBody, req.body)
    return applyAnswerFixes(recordsRoot(req.params.rid), req.params.target, req.params.id, answer, baseHash)
  })
}
