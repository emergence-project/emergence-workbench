// 계정: 앱 안의 GitHub 로그인 (githubAccount.ts, 설정 › 계정)과 계정으로 맞추기 (accountSync.ts, 설치판만)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/account'
import { AccountSync } from '../accountSync.js'
import { appFile } from '../agentPaths.js'
import { defaultCloneDir } from '../clone.js'
import { replies } from '../contract.js'
import { repeat } from '../scheduler.js'
import { t } from '../i18n.js'
import { WorkbenchError } from '../workbench.js'
import { remoteOf } from './google.js'
import type { RouteContext } from './context.js'

/** 바뀐 것을 올려 보는 간격 (바뀐 것이 없으면 GitHub를 부르지 않는다) */
export const ACCOUNT_SYNC_MS = 2 * 60_000

/** runBackup: 계정 저장소와 맞추기 (routes/backup.ts). 없으면 계정으로 맞추지 않는다 */
export function registerAccount(app: FastifyInstance, ctx: RouteContext, runBackup: (() => Promise<unknown>) | null): void {
  const { account, registry, opts } = ctx
  // 설치판(내려받은 앱)만: 저장소에서 돌리는 앱은 연구 저장소마다 사람이 정한 규칙이 있다
  const sync = opts.bundled && !opts.sandbox && runBackup && opts.backup
    ? new AccountSync({
      account, registry, configDir: opts.configDir, backupDir: opts.backup.dir, runBackup,
      cloneParent: () => defaultCloneDir(registry.list().map((r) => r.path)),
      libraryTemplate: appFile('templates/shared-library'), remoteOf,
      registered: (id) => { ctx.ensureWatch(id); ctx.broadcast({ type: 'research', research: id }) },
      changed: () => ctx.broadcast({ type: 'account', research: null }),
    })
    : null
  if (sync) {
    // 로그인하면 바로, 그다음은 2분마다 (켤 때는 30초 뒤: 저장한 로그인을 읽은 뒤)
    account.onChange(() => { if (account.account) void sync.run() })
    repeat(app, { first: 30_000, every: ACCOUNT_SYNC_MS, run: () => sync.run() })
  }
  const view = (): C.AccountView => ({ ...account.view(), sync: sync?.view() ?? null })

  app.get('/api/account', replies(C.AccountView), async (): Promise<C.AccountView> => view())
  /** 기기 코드를 받아 보인다. 사용자가 GitHub에서 승인하면 서버가 알아채고 'account' 알림을 보낸다 */
  app.post('/api/account/login', replies(C.AccountView), async (): Promise<C.AccountView> => { await account.start(); return view() })
  app.post('/api/account/cancel', replies(C.AccountView), async (): Promise<C.AccountView> => { account.cancel(); return view() })
  app.post('/api/account/logout', replies(C.AccountView), async (): Promise<C.AccountView> => { await account.logout(); return view() })
  /** 「동기화하기」: 끝날 때까지 기다린다 */
  app.post('/api/account/sync', replies(C.AccountView), async (): Promise<C.AccountView> => {
    if (!sync) throw new WorkbenchError(404, t('설치판에서 로그인했을 때만 계정과 동기화합니다', 'Only the installed app syncs with the account after signing in'))
    if (!account.account) throw new WorkbenchError(400, t('먼저 GitHub로 로그인해 주세요', 'Sign in with GitHub first'))
    await sync.run()
    return view()
  })
}
