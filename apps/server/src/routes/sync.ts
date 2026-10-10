// 연구 저장소와 GitHub (홈 카드의 최신 여부, 프로젝트 정보의 저장소 칸)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { replies } from '../contract.js'
import { fastForward, repoInfo, repoSync, SyncError } from '../gitsync.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

export function registerSync(app: FastifyInstance, ctx: RouteContext): void {
  const { repoPath } = ctx
  app.get<{ Params: { rid: string }; Querystring: { fetch?: string } }>('/api/researches/:rid/sync', replies(C.SyncReply), async (req): Promise<C.SyncReply> =>
    ({ sync: await repoSync(repoPath(req.params.rid), { fetch: req.query.fetch === '1' }) }))
  /** 프로젝트 정보의 저장소 칸. fetch=1이면 원격을 바로 확인한다("확인" 버튼). 받아오기·올리기는 하지 않는다 */
  app.get<{ Params: { rid: string }; Querystring: { fetch?: string } }>('/api/researches/:rid/repo', replies(C.RepoReply), async (req): Promise<C.RepoReply> =>
    ({ repo: await repoInfo(repoPath(req.params.rid), { fetch: req.query.fetch === '1' }) }))
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/sync/update', replies(C.SyncUpdated), async (req): Promise<C.SyncUpdated> => {
    try { return { sync: await fastForward(repoPath(req.params.rid)) } } catch (e) {
      if (e instanceof SyncError) throw new WorkbenchError(409, e.message)
      throw e
    }
  })
}
