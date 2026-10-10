// 연구 저장소와 GitHub (홈 카드의 최신 여부, 프로젝트 정보의 저장소 칸)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { replies } from '../contract.js'
import { writeStatus } from '../agentStatus.js'
import { fastForward, repoInfo, repoSync, SyncError } from '../gitsync.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

export function registerSync(app: FastifyInstance, ctx: RouteContext): void {
  const { repoPath } = ctx
  const refreshStatus = (rid: string) => {
    try {
      const wb = ctx.wbOf(rid)
      if (wb.readResearch().agentStatus) writeStatus(wb)
    } catch { /* retry on the next change, without hiding the sync result */ }
  }
  app.get<{ Params: { rid: string }; Querystring: { fetch?: string } }>('/api/researches/:rid/sync', replies(C.SyncReply), async (req): Promise<C.SyncReply> => {
    const sync = await repoSync(repoPath(req.params.rid), { fetch: req.query.fetch === '1' })
    if (req.query.fetch === '1') refreshStatus(req.params.rid)
    return { sync }
  })
  /** 프로젝트 정보의 저장소 칸. fetch=1이면 원격을 바로 확인한다("확인" 버튼). 받아오기·올리기는 하지 않는다 */
  app.get<{ Params: { rid: string }; Querystring: { fetch?: string } }>('/api/researches/:rid/repo', replies(C.RepoReply), async (req): Promise<C.RepoReply> => {
    const repo = await repoInfo(repoPath(req.params.rid), { fetch: req.query.fetch === '1' })
    if (req.query.fetch === '1') refreshStatus(req.params.rid)
    return { repo }
  })
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/sync/update', replies(C.SyncUpdated), async (req): Promise<C.SyncUpdated> => {
    try { return { sync: await fastForward(repoPath(req.params.rid)) } } catch (e) {
      if (e instanceof SyncError) throw new WorkbenchError(409, e.message)
      throw e
    } finally { refreshStatus(req.params.rid) }
  })
}
