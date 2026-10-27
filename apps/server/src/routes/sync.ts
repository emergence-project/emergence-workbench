// 연구 저장소와 GitHub (홈 카드의 최신 여부, 프로젝트 정보의 저장소 칸)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { replies } from '../contract.js'
import { writeStatusFor } from '../agentStatus.js'
import { autoPull, fastForward, repoInfo, repoSync, switchToDefault, SyncError, syncNow } from '../gitsync.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { SYNC_RECHECK_MS, syncDelayMs } from '../syncTiming.js'
import { repeat } from '../scheduler.js'

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

  // 프로젝트 정보 › 저장소의 「동기화」(받기 또는 올리기)와 「main으로 돌리기」 (10/28)
  for (const [name, run] of [['now', syncNow], ['main', switchToDefault]] as const) {
    app.post<{ Params: { rid: string } }>(`/api/researches/:rid/sync/${name}`, replies(C.SyncUpdated), async (req): Promise<C.SyncUpdated> => {
      try { return { sync: await run(repoPath(req.params.rid)) } } catch (e) {
        if (e instanceof SyncError) throw new WorkbenchError(409, e.message)
        throw e
      } finally { await refreshStatus(req.params.rid) }
    })
  }

  // 저절로 받기 (실사용만, 10/14): 정한 간격마다 연구 저장소를 하나씩 확인해 안전할 때만 받는다.
  // 받은 파일은 파일 감시가 화면에 알린다. 처음 받은 사본(workbench/가 막 생김)은 연구 목록도 다시 읽게 알린다
  const every = opts.researchAutoPullMs
  if (every) {
    let running = false
    const tick = async () => {
      if (running) return
      running = true
      try {
        // 진행 중인 프로젝트만 (10/20 사용자 결정: 저절로 도는 일은 멈춤 · 완료 프로젝트에 손대지 않는다). 받기 버튼은 그대로 된다
        for (const r of registry.list().filter((x) => x.state === 'active')) {
          try {
            if (!await autoPull(r.path)) continue
            await refreshStatus(r.id)
            ctx.ensureWatch(r.id)
            ctx.broadcast({ type: 'research', research: r.id })
          } catch (e) { console.error(`research auto pull ${r.id}: ${(e as Error).message}`) }
        }
        // 지식 라이브러리도 같은 간격으로 받는다 (10/18 "지식 라이브러리도 같은 장치로"). 받은 파일은 라이브러리 감시가 화면에 알린다
        const lib = registry.libraryPath
        if (lib) {
          try { await autoPull(lib) } catch (e) { console.error(`library auto pull: ${(e as Error).message}`) }
        }
      } finally { running = false }
    }
    // 간격은 설정 › 동기화의 받기 칸 (바꾸면 1분 안에 적용, 10/19). 수동이면 받지 않는다
    repeat(app, { first: Math.min(60_000, syncDelayMs(ctx.registry, 'pull', every) ?? SYNC_RECHECK_MS), every: () => syncDelayMs(ctx.registry, 'pull', every), run: tick })
  }
}
