// Claude 계정 여럿 (11/16 사용자 "pro 계정을 주로 답변용으로" · "로그인 정보를 담아두고 쉽게 전환"):
// 이 컴퓨터에 로그인한 기본 계정 말고 계정을 더 더해, 대화 종류마다 어느 계정으로 돌지 고른다. 로그인 정보는 Claude Code가 계정마다 따로 된 폴더(맥은 키체인)에 둔다
import { z } from 'zod'

/** 이 컴퓨터의 Claude Code에 로그인한 계정 id (터미널의 claude와 같다) */
export const DEFAULT_ACCOUNT = 'default'
/** 계정을 고르는 대화 종류: 중앙 · 피드백 처리 · 앱 고치기 · 프로젝트 대화 */
export const ACCOUNT_ROLES = ['central', 'feedback', 'app', 'project'] as const

export const ClaudeAccountRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  plan: z.string().optional(),
  login: z.boolean(),
  /** 로그인 중: 브라우저에서 열 주소 (열리지 않았을 때), 코드를 붙여 넣을 수 있음 */
  signing: z.object({ url: z.string().optional(), error: z.string().optional() }).strict().optional(),
}).strict()
export const ClaudeAccounts = z.object({
  accounts: z.array(ClaudeAccountRow),
  /** 기본 계정 id (11/16 사용자 "기본으로 설정하는 계정은 별도 설정"): 고르지 않은 대화 종류와 그 밖의 Claude 일(제목 짓기 · 묻기 등)이 쓴다. default = 이 컴퓨터 */
  base: z.string(),
  /** 대화 종류마다 계정 id (고르지 않았으면 기본 계정을 따른 값) */
  roles: z.object({ central: z.string().optional(), feedback: z.string().optional(), app: z.string().optional(), project: z.string().optional() }).strict(),
  /** Claude Code가 이 컴퓨터에 있나 (없으면 더하지 못함) */
  cli: z.boolean(),
}).strict()
export const AddAccountBody = z.object({ name: z.string().trim().min(1).max(30) }).strict()
export const AccountCodeBody = z.object({ code: z.string().trim().min(1).max(2000) }).strict()
export const AccountRolesBody = z.object({ role: z.enum([...ACCOUNT_ROLES, 'base']), id: z.string().min(1).max(40) }).strict()

export type AccountRole = (typeof ACCOUNT_ROLES)[number]
export type ClaudeAccountRow = z.infer<typeof ClaudeAccountRow>
export type ClaudeAccounts = z.infer<typeof ClaudeAccounts>
