// 완료 기록 보관 (11/23): 오래된 완료 기록을 comments/archive/로 옮기고, 보관한 것을 읽고, 되돌린다
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/comments'
import { parseBody, replies } from '../contract.js'
import { ARCHIVE_AFTER_DAYS, archivePlan, archiveRecords, listArchived, restoreRecords } from '../recordArchive.js'
import type { RouteContext } from './context.js'

export function registerRecordArchive(app: FastifyInstance, ctx: RouteContext): void {
  const { recordsRoot } = ctx
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/records/archive', replies(C.RecordArchive), async (req): Promise<C.RecordArchive> => {
    const root = recordsRoot(req.params.rid)
    return {
      files: listArchived(root).map(({ highlights: _highlights, ...file }) => file),
      ready: archivePlan(root).reduce((n, m) => n + m.ids.length, 0),
      days: ARCHIVE_AFTER_DAYS,
    }
  })
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/records/archive', replies(C.RecordsArchived), async (req): Promise<C.RecordsArchived> => ({ moved: archiveRecords(recordsRoot(req.params.rid)) }))
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/records/archive/restore', replies(C.RecordsRestored), async (req): Promise<C.RecordsRestored> => {
    const { moves } = parseBody(C.RestoreArchiveBody, req.body)
    return { restored: restoreRecords(recordsRoot(req.params.rid), moves) }
  })
}
