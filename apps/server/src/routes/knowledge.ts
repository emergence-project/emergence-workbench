// 지식 (주제 색인 · 지식 지도 · Topic Review)
import type { FastifyInstance } from 'fastify'
import { readReview } from '../knowledge.js'
import type { RouteContext } from './context.js'

export function registerKnowledge(app: FastifyInstance, ctx: RouteContext): void {
  const { registry } = ctx
  /** 주제마다 Study 원료·개념노트·Topic Review·문헌노트·쓰는 곳과 [[링크]] 연결 */
  app.get('/api/knowledge', async () => ctx.libraryReads.knowledge())
  app.get<{ Querystring: { path: string } }>('/api/knowledge/review', async (req) => readReview(registry.reviewsPath, String(req.query.path ?? '')))
}
