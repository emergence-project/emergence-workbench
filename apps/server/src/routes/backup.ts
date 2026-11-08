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

/** 맞추기를 한 번 돌리는 함수를 돌려준다 (계정으로 맞추기가 부른다). 백업을 쓰지 않으면 null */
export function registerBackup(app: FastifyInstance, ctx: RouteContext): (() => Promise<BackupResult>) | null {
  const { registry, opts } = ctx
  const cfg = opts.backup
  // 설치판은 개인 저장소(계정 저장소)를 앱을 켠 뒤에 정한다(로그인, accountSync.ts): 맞출 때마다 설정에서 읽는다
  const remoteNow = () => cfg?.remote || registry.personalRepo || null
  let last: BackupResult | null = null
  let running: Promise<BackupResult> | null = null
  const run = (): Promise<BackupResult> => {
    const remote = remoteNow()
    if (!cfg || !remote) return Promise.reject(new WorkbenchError(404, t('이 모드에서는 백업하지 않습니다', 'Backups are off in this mode')))
    if (running) return running
    const list = registry.list()
    running = Promise.all(list.map(async (r) => ({ id: r.id, title: r.title, remote: await remoteOf(r.path), folder: path.basename(r.path), tags: r.tags, state: r.state, ...registry.sharedProfile(r.id) })))
      .then((projects) => backupWorkbenches({ dir: cfg.dir, remote, targets: list.map((r) => ({ id: r.id, path: r.path })), settings: cfg.settings, projects }))
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

  app.get('/api/backup', replies(C.BackupStatus), async (): Promise<C.BackupStatus> => ({ enabled: !!cfg && !!remoteNow(), remote: cfg ? remoteNow() : null, running: !!running, last, minutes: cfg?.intervalMs ? Math.round(cfg.intervalMs / 60_000) : null }))
  app.post('/api/backup', replies(C.BackupResult), async (): Promise<C.BackupResult> => run())

  // 시작하고 조금 뒤 한 번, 그다음은 정한 간격마다 저절로
  if (cfg?.intervalMs) {
    // 개인 저장소를 아직 정하지 않았으면 건너뛴다 (설치판: 로그인한 뒤에 정한다)
    repeat(app, { first: Math.min(60_000, cfg.intervalMs), every: cfg.intervalMs, run: () => (remoteNow() ? run() : Promise.resolve()) })
  }
  return cfg ? run : null
}
