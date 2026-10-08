// 화면 설정과 앱 업데이트 (설정 화면)
import type { FastifyInstance } from 'fastify'
import { appInfo, appStatus, updateApp, UpdateError } from '../appupdate.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerSettings(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  app.get('/api/settings', async () => ({ ui: registry.ui }))
  app.put<{ Body: { ui?: unknown } }>('/api/settings', async (req) => ({ ui: registry.setUi(req.body?.ui) }))


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
}
