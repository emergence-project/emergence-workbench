// 진술 (저장소의 statements/)
import type { FastifyInstance } from 'fastify'
import { readStatement, writeStatement } from '../statements.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerStatements(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  app.get<{ Params: { rid: string; sid: string } }>('/api/researches/:rid/statements/:sid', async (req) =>
    readStatement(wbOf(req.params.rid).root, req.params.sid))
  app.put<{ Params: { rid: string; sid: string }; Body: { content: string; baseHash: string } }>('/api/researches/:rid/statements/:sid', async (req, reply) => {
    const { content, baseHash } = req.body ?? ({} as never)
    if (typeof content !== 'string' || typeof baseHash !== 'string') throw new WorkbenchError(400, t('content와 baseHash가 필요함', 'content and baseHash are required'))
    const r = writeStatement(wbOf(req.params.rid).root, req.params.sid, content, baseHash)
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 저장하지 않았음', 'The file changed elsewhere, so it was not saved'), currentHash: r.currentHash })
    return { hash: r.hash }
  })
}
