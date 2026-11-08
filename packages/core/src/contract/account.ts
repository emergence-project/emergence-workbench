/**
 * 계정 API의 계약 (앱 안의 GitHub 로그인, 서버 routes/account.ts · githubAccount.ts, 화면 api/account.ts · AccountSettings.tsx).
 */
import { z } from 'zod'

/** GET /api/account, POST /api/account/login · cancel · logout */
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
}).strict()

export type AccountView = z.infer<typeof AccountView>
