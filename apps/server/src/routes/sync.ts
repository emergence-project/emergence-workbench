// 연구 저장소와 GitHub (홈 카드의 최신 여부, 프로젝트 정보의 저장소 칸)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { replies } from '../contract.js'
import { writeStatusFor } from '../agentStatus.js'
import { autoPull, fastForward, repoInfo, repoSync, SyncError } from '../gitsync.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

export function registerSync(app: FastifyInstance, ctx: RouteContext): void {
  const { repoPath, registry, opts } = ctx
  const refreshStatus = async (rid: string): Promise<void> => {
    try { await writeStatusFor(registry, rid) } catch { /* retry on the next change, without hiding the sync result */ }
  }
  app.get<{ Params: { rid: string }; Querystring: { fetch?: string } }>('/api/researches/:rid/sync', replies(C.SyncReply), async (req): Promise<C.SyncReply> => {
    const sync = await repoSync(repoPath(req.params.rid), { fetch: req.query.fetch === '1' })
    if (req.query.fetch === '1') await refreshStatus(req.params.rid)
    return { sync }
  })
  /** 프로젝트 정보의 저장소 칸. fetch=1이면 원격을 바로 확인한다("확인" 버튼). 받아오기·올리기는 하지 않는다 */
  app.get<{ Params: { rid: string }; Querystring: { fetch?: string } }>('/api/researches/:rid/repo', replies(C.RepoReply), async (req): Promise<C.RepoReply> => {
    const repo = await repoInfo(repoPath(req.params.rid), { fetch: req.query.fetch === '1' })
    if (req.query.fetch === '1') await refreshStatus(req.params.rid)
    return { repo }
  })
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/sync/update', replies(C.SyncUpdated), async (req): Promise<C.SyncUpdated> => {
    try { return { sync: await fastForward(repoPath(req.params.rid)) } } catch (e) {
      if (e instanceof SyncError) throw new WorkbenchError(409, e.message)
      throw e
    } finally { await refreshStatus(req.params.rid) }
  })

  // 저절로 받기 (실사용만, 10/14): 정한 간격마다 연구 저장소를 하나씩 확인해 안전할 때만 받는다.
  // 받은 파일은 파일 감시가 화면에 알린다. 처음 받은 사본(workbench/가 막 생김)은 연구 목록도 다시 읽게 알린다
  const every = opts.researchAutoPullMs
  if (every) {
    let running = false
    const tick = async () => {
      if (running) return
      running = true
      try {
        for (const r of registry.list()) {
          try {
            if (!await autoPull(r.path)) continue
            await refreshStatus(r.id)
            ctx.ensureWatch(r.id)
            ctx.broadcast({ type: 'research', research: r.id })
          } catch (e) { console.error(`research auto pull ${r.id}: ${(e as Error).message}`) }
        }
      } finally { running = false }
    }
    const first = setTimeout(() => void tick(), Math.min(60_000, every))
    const timer = setInterval(() => void tick(), every)
    first.unref(); timer.unref()
    app.addHook('onClose', async () => { clearTimeout(first); clearInterval(timer) })
  }
}
