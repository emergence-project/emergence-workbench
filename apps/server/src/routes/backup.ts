// 맥에만 있던 작업대 정보(workbench/)와 앱 설정을 GitHub 백업 저장소와 맞춘다 (설정 화면, backup.ts)
import type { FastifyInstance } from 'fastify'
import { backupWorkbenches, type BackupResult } from '../backup.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerBackup(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  const cfg = opts.backup
  let last: BackupResult | null = null
  let running: Promise<BackupResult> | null = null
  const run = (): Promise<BackupResult> => {
    if (!cfg) return Promise.reject(new WorkbenchError(404, t('이 모드에서는 백업하지 않습니다', 'Backups are off in this mode')))
    if (running) return running
    running = backupWorkbenches({ dir: cfg.dir, remote: cfg.remote, targets: registry.list().map((r) => ({ id: r.id, path: r.path })), settings: cfg.settings })
      .then((r) => { if (r.settingsPulled) registry.reload(); last = r; return r })
      .finally(() => { running = null })
    return running
  }

  app.get('/api/backup', async () => ({ enabled: !!cfg, remote: cfg?.remote ?? null, running: !!running, last }))
  app.post('/api/backup', async () => run())

  // 시작하고 조금 뒤 한 번, 그다음은 정한 간격마다 저절로
  if (cfg?.intervalMs) {
    const first = setTimeout(() => { void run().catch(() => undefined) }, Math.min(60_000, cfg.intervalMs))
    const every = setInterval(() => { void run().catch(() => undefined) }, cfg.intervalMs)
    app.addHook('onClose', async () => { clearTimeout(first); clearInterval(every) })
  }
}
