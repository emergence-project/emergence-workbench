// 연구노트·계산 노트 지우기: 15일 보관 뒤 지움 (10/4 17:04 피드백, noteTrash.ts)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { replies } from '../contract.js'
import { listTrash, restoreNote, trashNote } from '../noteTrash.js'
import type { RouteContext } from './context.js'

export function registerNoteTrash(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  app.delete<{ Params: { rid: string }; Querystring: { ms?: string } }>('/api/researches/:rid/notes', replies(C.TrashedNote), async (req): Promise<C.TrashedNote> => trashNote(wbOf(req.params.rid), typeof req.query.ms === 'string' ? req.query.ms : ''))
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/notes/trash', replies(C.TrashList), async (req): Promise<C.TrashList> => listTrash(wbOf(req.params.rid)))
  app.post<{ Params: { rid: string; id: string } }>('/api/researches/:rid/notes/trash/:id/restore', replies(C.RestoredNote), async (req): Promise<C.RestoredNote> => restoreNote(wbOf(req.params.rid), req.params.id))
}
