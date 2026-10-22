// 맥에만 있던 작업대 정보(workbench/)와 앱 설정을 GitHub 백업 저장소와 맞춘다 (설정 화면, backup.ts)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/backup'
import { replies } from '../contract.js'
import { repeat } from '../scheduler.js'
import path from 'node:path'
import { backupWorkbenches, type BackupResult } from '../backup.js'
import { remoteOf, sameRepo } from './google.js'
import { adoptOtherProfiles } from '../profileSync.js'
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
    const list = registry.list()
    running = Promise.all(list.map(async (r) => ({ id: r.id, title: r.title, remote: await remoteOf(r.path), folder: path.basename(r.path), tags: r.tags, state: r.state, ...registry.sharedProfile(r.id) })))
      .then((projects) => backupWorkbenches({ dir: cfg.dir, remote: cfg.remote, targets: list.map((r) => ({ id: r.id, path: r.path })), settings: cfg.settings, projects }))
      .then(async (r) => {
        if (r.settingsPulled) registry.reload()
        // 다른 컴퓨터에서 더 늦게 고친 진행 상태 · 띠 · 색 등을 따른다 (10/22 09:44). 다음 맞추기에서 이 컴퓨터 목록에도 올라간다
        await adoptOtherProfiles(registry, cfg.dir, { remoteOf, sameRepo }).catch(() => [])
        last = r
        return r
      })
      .finally(() => { running = null })
    return running
  }

  app.get('/api/backup', replies(C.BackupStatus), async (): Promise<C.BackupStatus> => ({ enabled: !!cfg, remote: cfg?.remote ?? null, running: !!running, last }))
  app.post('/api/backup', replies(C.BackupResult), async (): Promise<C.BackupResult> => run())

  // 시작하고 조금 뒤 한 번, 그다음은 정한 간격마다 저절로
  if (cfg?.intervalMs) {
    repeat(app, { first: Math.min(60_000, cfg.intervalMs), every: cfg.intervalMs, run })
  }
}
