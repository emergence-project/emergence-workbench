/**
 * 백업 API의 계약 (맥에만 있던 workbench/와 앱 설정을 GitHub와 맞춤, 서버 routes/backup.ts · 화면 api/backup.ts).
 */
import { z } from 'zod'

export const BackupResult = z.object({
  at: z.string(),
  /** 이번에 맞춘 연구 id */
  projects: z.array(z.string()),
  /** 새로 만든 커밋 (짧은 해시). 올릴 것이 없으면 null */
  commit: z.string().nullable(),
  pushed: z.boolean(),
  /** GitHub에서 받아 맥에 쓴 파일 */
  pulled: z.array(z.string()),
  /** 양쪽이 다르게 바뀐 파일 (맥 것을 두고 GitHub 것은 옆에 받아 둠) */
  conflicts: z.array(z.string()),
  /** 앱 설정(config.yaml)을 GitHub에서 받아 바꿨으면 true */
  settingsPulled: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
}).strict()

/** GET /backup */
export const BackupStatus = z.object({ enabled: z.boolean(), remote: z.string().nullable(), running: z.boolean(), last: BackupResult.nullable() }).strict()

export type BackupResult = z.infer<typeof BackupResult>
export type BackupStatus = z.infer<typeof BackupStatus>
