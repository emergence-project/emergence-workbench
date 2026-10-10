// 노트 본문·PDF 기록
import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import { appendAnswer, applyAnswerFixes, askPrompt, claudeClassifierRunner, claudeRunner } from '../ask.js'
import * as C from '@rw/core/contract/comments'
import { parseBody, replies } from '../contract.js'
import { addComment, classifyComments, commentSourceFile, deleteComment, listComments, listRecords, pendingQuestions, readComments, updateComment } from '../comments.js'
import { materialPath } from '../materials.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerComments(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf, repoPath, opts } = ctx
  /** 지금 Claude가 답을 쓰고 있는 질문 (같은 질문을 두 번 넘기지 않게) */
  const asking = new Set<string>()
  const classifying = new Set<string>()
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/comments', replies(C.CommentOverview), async (req): Promise<C.CommentOverview> => {
    const root = wbOf(req.params.rid).root
    return {
      files: listComments(root).map((f) => ({ target: f.target, title: f.title, source: f.source, count: f.comments.length })),
      pending: pendingQuestions(root),
    }
  })
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/records', replies(C.RecordList), async (req): Promise<C.RecordList> => {
    const wb = wbOf(req.params.rid)
    return { files: listRecords(wb.root, wb.readResearch().title) }
  })
  app.get<{ Params: { rid: string; target: string } }>('/api/researches/:rid/comments/:target', replies(C.CommentFile), async (req): Promise<C.CommentFile> =>
    readComments(wbOf(req.params.rid).root, req.params.target))
  app.post<{ Params: { rid: string; target: string } }>('/api/researches/:rid/comments/:target', replies(C.CommentAdded), async (req): Promise<C.CommentAdded> =>
    addComment(wbOf(req.params.rid).root, req.params.target, parseBody(C.NewCommentBody, req.body)))
  app.post<{ Params: { rid: string; target: string } }>('/api/researches/:rid/comments/:target/classify', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { rid, target } = req.params
    const { baseHash } = parseBody(C.ClassifyBody, req.body)
    const root = wbOf(rid).root
    const key = `${root}/${target}`
    if (classifying.has(key)) throw new WorkbenchError(409, t('이미 이 기록을 분류하는 중입니다', 'Already sorting this record'))
    classifying.add(key)
    try {
      return await classifyComments(root, target, baseHash, opts.classify ?? claudeClassifierRunner, repoPath(rid))
    } finally { classifying.delete(key) }
  })
  app.patch<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { state, color, text, baseHash } = parseBody(C.CommentChangeBody, req.body)
    return updateComment(wbOf(req.params.rid).root, req.params.target, req.params.id, { state, color, text }, baseHash)
  })
  app.delete<{ Params: { rid: string; target: string; id: string }; Querystring: { baseHash?: string } }>('/api/researches/:rid/comments/:target/:id', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const baseHash = req.query.baseHash
    if (typeof baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    return deleteComment(wbOf(req.params.rid).root, req.params.target, req.params.id, baseHash)
  })
  /** 질문을 맥의 Claude에게 넘기고, 답이 오면 질문 아래에 덧붙인다. 답이 올 때까지(몇 분) 기다렸다가 고친 파일을 돌려준다 */
  app.post<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id/answer', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { rid, target, id } = req.params
    const wb = wbOf(rid)
    const f = readComments(wb.root, target)
    const q = f.comments.find((c) => c.id === id)
    if (!q || q.kind !== '질문') throw new WorkbenchError(404, t(`질문이 없음: ${id}`, `No such question: ${id}`))
    const key = `${rid}/${target}/${id}`
    if (asking.has(key)) throw new WorkbenchError(409, t('Claude가 이미 이 질문에 답을 쓰고 있습니다', 'Claude is already writing an answer to this question'))
    asking.add(key)
    try {
      const repo = repoPath(rid)
      let file: string | undefined
      if (target.startsWith('paper-') && f.source) {
        try { file = path.relative(repo, materialPath(wb.root, f.source, wb.readResearch().sources)) } catch { /* 찾지 못하면 Claude가 이름으로 찾는다 */ }
      } else {
        const source = commentSourceFile(wb.root, f)
        if (source) file = path.relative(repo, source)
      }
      const answer = await (opts.ask ?? claudeRunner)({ cwd: repo, prompt: askPrompt(f, id, { repo, file }) })
      return appendAnswer(wb.root, target, id, 'claude', answer)
    } finally {
      asking.delete(key)
    }
  })
  /** 답에 든 고침을 노트에 적용한다 (사용자가 "노트에 적용"을 누를 때). { answer: 답 번호, baseHash: 기록 파일 hash } */
  app.post<{ Params: { rid: string; target: string; id: string } }>('/api/researches/:rid/comments/:target/:id/apply', replies(C.CommentFile), async (req): Promise<C.CommentFile> => {
    const { answer, baseHash } = parseBody(C.ApplyAnswerBody, req.body)
    return applyAnswerFixes(wbOf(req.params.rid).root, req.params.target, req.params.id, answer, baseHash)
  })
}
