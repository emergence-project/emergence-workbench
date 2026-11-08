/**
 * 계정 API의 계약 (앱 안의 GitHub 로그인, 서버 routes/account.ts · githubAccount.ts, 화면 api/account.ts · AccountSettings.tsx).
 */
import { z } from 'zod'

/** 계정으로 맞추기 (설치판에서 로그인했을 때, 서버 accountSync.ts) */
export const AccountSyncView = z.object({
  /** 로그인해서 맞추는 중인지 */
  on: z.boolean(),
  running: z.boolean(),
  /** 마지막으로 끝난 때 */
  at: z.string().nullable(),
  error: z.string().nullable(),
  /** 지난번에 한 일 (처음 올린 것 · 받은 것) */
  note: z.string().nullable(),
  /** 계정 저장소 주소 */
  home: z.string().nullable(),
  /** 너무 커서(95MB 넘음) 올리지 않은 논문 파일 */
  skipped: z.array(z.string()),
}).strict()

/** GET /api/account, POST /api/account/login · cancel · logout · sync */
export const AccountView = z.object({
  /** 로그인한 GitHub 계정 (없으면 null). 열쇠는 돌려주지 않는다 */
  github: z.object({
    login: z.string(),
    name: z.string(),
    avatar: z.string(),
    /** 커밋에 적는 noreply 주소 */
    email: z.string(),
  }).strict().nullable(),
  /** 기기 코드 로그인을 기다리는 중: 사용자가 GitHub 쪽(uri)에 넣을 코드 */
  pending: z.object({
    userCode: z.string(),
    uri: z.string(),
    expiresAt: z.string(),
  }).strict().nullable(),
  /** 지난 로그인이 실패했거나 풀린 까닭 */
  error: z.string().optional(),
  /** 계정 동기화 (설치판만, 저장소에서 돌리는 앱과 예제 모드는 null) */
  sync: AccountSyncView.nullable(),
}).strict()

export type AccountView = z.infer<typeof AccountView>
export type AccountSyncView = z.infer<typeof AccountSyncView>
