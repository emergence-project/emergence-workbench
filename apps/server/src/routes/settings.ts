// 화면 설정과 앱 업데이트 (설정 화면)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/settings'
import * as A from '@rw/core/contract/app'
import { parseBody, replies } from '../contract.js'
import { appInfo, appStatus, updateApp, UpdateError } from '../appupdate.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'
import { SYNC_RECHECK_MS, syncDelayMs } from '../syncTiming.js'
import { SYNC_KINDS, type SyncChoice, type SyncKind } from '@rw/core'

export function registerSettings(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  app.get('/api/settings', replies(C.SettingsView), async (): Promise<C.SettingsView> => ({ ui: registry.ui }))
  app.put('/api/settings', replies(C.SettingsView), async (req): Promise<C.SettingsView> => ({ ui: registry.setUi(parseBody(C.SettingsBody, req.body).ui) }))
  // 설정 › 에이전트: 지시를 맥의 Claude가 언제 하는지 (routes/comments.ts가 읽는다)
  // 설정 › 동기화 (10/19 결정 "동기화 주기"): 기록 · 피드백 올리기, 연구 저장소 · 라이브러리 받기, 앱 업데이트 확인
  const syncBase: Record<SyncKind, number | undefined> = {
    publish: opts.recordsAutoPublishMs ?? opts.feedbackAutoPublishMs,
    pull: opts.researchAutoPullMs,
    update: opts.appAutoUpdate?.everyMs,
  }
  const syncView = (): C.SyncSettingsView => {
    const saved = ctx.registry.sync
    const pick = (k: SyncKind): SyncChoice => saved[k] ?? { mode: 'auto', every: Math.max(1, Math.round((syncBase[k] ?? ({ publish: 30_000, pull: 600_000, update: 600_000 })[k]) / 1000)) }
    return {
      publish: pick('publish'), pull: pick('pull'), update: pick('update'),
      available: {
        publish: !opts.sandbox && ((opts.recordsAutoPublishMs !== undefined) || (!!opts.feedbackPublish && opts.feedbackAutoPublishMs !== undefined)),
        pull: opts.researchAutoPullMs !== undefined,
        update: !!(opts.appAutoUpdate && opts.appRepo?.steps.canRestart()),
      },
    }
  }
  app.get('/api/settings/sync', replies(C.SyncSettingsView), async (): Promise<C.SyncSettingsView> => syncView())
  app.put('/api/settings/sync', replies(C.SyncSettingsView), async (req): Promise<C.SyncSettingsView> => {
    const body = parseBody(C.SyncSettingsBody, req.body)
    // 바꾸는 칸은 지금 보이는 값 위에 합친다 (모드만 바꿔도 간격이 남게)
    const now = syncView()
    const patch = Object.fromEntries(SYNC_KINDS.filter((k) => body[k]).map((k) => [k, { ...now[k], ...body[k] }]))
    ctx.registry.setSync(patch)
    return syncView()
  })

  app.get('/api/settings/agents', replies(C.AgentSettings), async (): Promise<C.AgentSettings> => registry.agents)
  app.put('/api/settings/agents', replies(C.AgentSettings), async (req): Promise<C.AgentSettings> => registry.setAgents(parseBody(C.AgentSettingsBody, req.body)))


  app.get<{ Querystring: { fetch?: string } }>('/api/app/status', replies(A.AppStatusReply), async (req): Promise<A.AppStatusReply> => {
    if (!opts.appRepo) return { enabled: false }
    return { enabled: true, status: await appStatus(opts.appRepo.root, opts.appRepo.running, { fetch: req.query.fetch === '1' }) }
  })
  app.get<{ Querystring: { pr?: string } }>('/api/app/info', replies(A.AppInfoReply), async (req): Promise<A.AppInfoReply> => {
    if (!opts.appRepo) return { enabled: false }
    const pr = Number(req.query.pr)
    return { enabled: true, info: await appInfo(opts.appRepo.root, opts.appRepo.running, 20, Number.isInteger(pr) && pr > 0 ? pr : undefined) }
  })
  let updating: Promise<unknown> | null = null
  app.post('/api/app/update', replies(A.AppUpdateResult), async (): Promise<A.AppUpdateResult> => {
    const repo = opts.appRepo
    if (!repo) throw new WorkbenchError(404, t('이 모드에서는 앱을 업데이트하지 않습니다', 'The app does not update in this mode'))
    if (updating) throw new WorkbenchError(409, t('이미 업데이트 중입니다', 'Already updating'))
    const run = updateApp(repo.root, repo.running, repo.steps)
    updating = run
    try { return await run } catch (e) {
      // 서비스 로그(pnpm service:logs)에 남겨 맥에서 이유를 찾을 수 있게 한다
      console.error(`app update failed: ${(e as Error).message}`)
      if (e instanceof UpdateError) throw new WorkbenchError(409, e.message)
      throw e
    } finally { updating = null }
  })

  /*
   * 자동 업데이트 (10/9 사용자 결정 "쉴 때 · 버튼"): 몇 분마다 새 커밋을 받아 빌드까지 해 두고,
   * 다시 시작은 쉴 때만 한다. 쉬는지는 화면이 판단해 /api/app/restart를 부르고(입력 없이 5분, 저장할 것 없음),
   * 열린 화면이 없으면 서버가 스스로 판단한다(쓰기 요청 없이 5분). 둘 다 처리 중인 요청(컴파일·논문 받기·질문)이 있으면 미룬다.
   */
  let inflight = 0
  let lastWrite = Date.now()
  const counted = (url: string) => url.startsWith('/api/') && !url.startsWith('/api/app/') && !url.startsWith('/api/events')
  app.addHook('onRequest', async (req) => {
    if (!counted(req.url)) return
    inflight++
    ;(req as { rwCounted?: boolean }).rwCounted = true
    if (req.method !== 'GET') lastWrite = Date.now()
  })
  app.addHook('onResponse', async (req) => {
    if ((req as { rwCounted?: boolean }).rwCounted) inflight = Math.max(0, inflight - 1)
  })
  app.addHook('onRequestAbort', async (req) => {
    if ((req as { rwCounted?: boolean }).rwCounted) { (req as { rwCounted?: boolean }).rwCounted = false; inflight = Math.max(0, inflight - 1) }
  })

  /** 미리 빌드한 새 버전으로 다시 시작한다. 할 수 없으면 이유 */
  async function restartIfReady(): Promise<{ restarting: boolean; reason?: string }> {
    const repo = opts.appRepo
    if (!repo) return { restarting: false, reason: t('이 모드에서는 앱을 업데이트하지 않습니다', 'The app does not update in this mode') }
    if (updating) return { restarting: false, reason: t('업데이트 중입니다', 'Updating') }
    if (inflight > 0) return { restarting: false, reason: t('처리 중인 일이 있습니다', 'Work is in progress') }
    const status = await appStatus(repo.root, repo.running)
    if (!status.prepared) return { restarting: false, reason: t('다시 시작할 새 버전이 없습니다', 'No new version to restart into') }
    return { restarting: repo.steps.restart() }
  }
  app.post('/api/app/restart', replies(A.AppRestarted), async (): Promise<A.AppRestarted> => {
    const r = await restartIfReady()
    if (!r.restarting) throw new WorkbenchError(409, r.reason ?? t('다시 시작하지 못했습니다', 'Could not restart'))
    return { restarting: true }
  })

  const every = opts.appAutoUpdate?.everyMs
  const repo = opts.appRepo
  if (every && repo && repo.steps.canRestart()) {
    const idleMs = opts.appAutoUpdate!.idleMs
    // 같은 실패(예: 오프라인의 "GitHub를 확인하지 못했습니다")는 처음 한 번만 적고, 풀리면 한 줄 적는다 (10/20 점검: 로그에 같은 줄 915개)
    let lastError: string | null = null
    const tick = async () => {
      if (updating) return
      const run = updateApp(repo.root, repo.running, repo.steps, { restart: false })
      updating = run
      try {
        await run
        if (lastError) console.error('app auto update: 다시 됩니다 (앞의 오류가 풀림)')
        lastError = null
      } catch (e) {
        const message = (e as Error).message
        if (message !== lastError) console.error(`app auto update: ${message}`)
        lastError = message
      } finally { updating = null }
      if (ctx.clients() === 0 && Date.now() - lastWrite >= idleMs) await restartIfReady()
    }
    // 간격은 설정 › 동기화의 업데이트 칸을 돌 때마다 다시 읽는다(10/19). 수동이면 확인하지 않고 잠시 뒤 다시 본다.
    // 새 버전이 없으면 updateApp은 확인만 하고 받기 · 빌드 · 다시 켜기를 하지 않는다
    let timer: NodeJS.Timeout | null = null
    let closed = false
    const next = (ms: number) => { if (closed) return; timer = setTimeout(() => void step(), ms); timer.unref() }
    const step = async () => {
      const ms = syncDelayMs(ctx.registry, 'update', every)
      if (ms !== null) await tick().catch((e) => console.error(`app auto update: ${(e as Error).message}`))
      next(ms ?? SYNC_RECHECK_MS)
    }
    next(syncDelayMs(ctx.registry, 'update', every) ?? SYNC_RECHECK_MS)
    app.addHook('onClose', async () => { closed = true; if (timer) clearTimeout(timer) })
  }
}
