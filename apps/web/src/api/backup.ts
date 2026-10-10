// ---------- 백업 (맥에만 있던 workbench/와 앱 설정을 GitHub와 맞춤, 서버 backup.ts) ----------
import type { BackupResult, BackupStatus } from '@rw/core/contract/backup'
import { json, req } from './http'

export type { BackupResult, BackupStatus } from '@rw/core/contract/backup'
export const backupApi = {
  status: () => req('/api/backup').then((r) => json<BackupStatus>(r)),
  run: () => req('/api/backup', { method: 'POST' }).then((r) => json<BackupResult>(r)),
}
