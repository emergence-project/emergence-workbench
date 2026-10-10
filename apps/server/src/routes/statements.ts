// 진술 (저장소의 statements/)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import { readStatement, writeStatement } from '../statements.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerStatements(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  app.get<{ Params: { rid: string; sid: string } }>('/api/researches/:rid/statements/:sid', replies(C.StatementDoc), async (req): Promise<C.StatementDoc> =>
    readStatement(wbOf(req.params.rid).root, req.params.sid))
  app.put<{ Params: { rid: string; sid: string } }>('/api/researches/:rid/statements/:sid', replies(C.Saved), async (req, reply) => {
    const { content, baseHash } = parseBody(C.ContentBody, req.body)
    const r = writeStatement(wbOf(req.params.rid).root, req.params.sid, content, baseHash)
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 저장하지 않았음', 'The file changed elsewhere, so it was not saved'), currentHash: r.currentHash })
    return { hash: r.hash }
  })
}
