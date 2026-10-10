// 화면 설정과 앱 업데이트 (설정 화면)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/settings'
import { parseBody, replies } from '../contract.js'
import { appInfo, appStatus, updateApp, UpdateError } from '../appupdate.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerSettings(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  app.get('/api/settings', replies(C.SettingsView), async (): Promise<C.SettingsView> => ({ ui: registry.ui }))
  app.put('/api/settings', replies(C.SettingsView), async (req): Promise<C.SettingsView> => ({ ui: registry.setUi(parseBody(C.SettingsBody, req.body).ui) }))


  app.get<{ Querystring: { fetch?: string } }>('/api/app/status', async (req) => {
    if (!opts.appRepo) return { enabled: false }
    return { enabled: true, status: await appStatus(opts.appRepo.root, opts.appRepo.running, { fetch: req.query.fetch === '1' }) }
  })
  app.get('/api/app/info', async () => {
    if (!opts.appRepo) return { enabled: false }
    return { enabled: true, info: await appInfo(opts.appRepo.root, opts.appRepo.running) }
  })
  let updating: Promise<unknown> | null = null
  app.post('/api/app/update', async () => {
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
  app.post('/api/app/restart', async () => {
    const r = await restartIfReady()
    if (!r.restarting) throw new WorkbenchError(409, r.reason ?? t('다시 시작하지 못했습니다', 'Could not restart'))
    return { restarting: true }
  })

  const every = opts.appAutoUpdate?.everyMs
  const repo = opts.appRepo
  if (every && repo && repo.steps.canRestart()) {
    const idleMs = opts.appAutoUpdate!.idleMs
    const tick = async () => {
      if (updating) return
      const run = updateApp(repo.root, repo.running, repo.steps, { restart: false })
      updating = run
      try { await run } catch (e) {
        console.error(`app auto update: ${(e as Error).message}`)
      } finally { updating = null }
      if (ctx.clients() === 0 && Date.now() - lastWrite >= idleMs) await restartIfReady()
    }
    const timer = setInterval(() => void tick().catch((e) => console.error(`app auto update: ${(e as Error).message}`)), every)
    timer.unref()
    app.addHook('onClose', async () => clearInterval(timer))
  }
}
