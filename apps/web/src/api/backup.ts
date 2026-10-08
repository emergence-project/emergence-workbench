// ---------- 백업 (맥에만 있던 workbench/와 앱 설정을 GitHub와 맞춤, 서버 backup.ts) ----------
import { json, req } from './http'

export interface BackupResult { at: string; projects: string[]; commit: string | null; pushed: boolean; pulled: string[]; conflicts: string[]; settingsPulled: boolean; message: string; error?: string }
export interface BackupStatus { enabled: boolean; remote: string | null; running: boolean; last: BackupResult | null }
export const backupApi = {
  status: () => req('/api/backup').then((r) => json<BackupStatus>(r)),
  run: () => req('/api/backup', { method: 'POST' }).then((r) => json<BackupResult>(r)),
}
