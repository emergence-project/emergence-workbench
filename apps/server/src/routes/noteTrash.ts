// 연구노트·계산 노트 지우기: 15일 보관 뒤 지움 (10/4 17:04 피드백, noteTrash.ts)
import type { FastifyInstance } from 'fastify'
import { listTrash, restoreNote, trashNote } from '../noteTrash.js'
import type { RouteContext } from './context.js'

export function registerNoteTrash(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  app.delete<{ Params: { rid: string }; Querystring: { ms?: string } }>('/api/researches/:rid/notes', async (req) => trashNote(wbOf(req.params.rid), typeof req.query.ms === 'string' ? req.query.ms : ''))
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/notes/trash', async (req) => listTrash(wbOf(req.params.rid)))
  app.post<{ Params: { rid: string; id: string } }>('/api/researches/:rid/notes/trash/:id/restore', async (req) => restoreNote(wbOf(req.params.rid), req.params.id))
}
