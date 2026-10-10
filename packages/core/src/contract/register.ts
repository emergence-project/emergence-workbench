/**
 * 프로젝트 등록 창의 GitHub 목록 계약 (서버 routes/researches.ts · githubRepos.ts, 화면 api/register.ts).
 */
import { z } from 'zod'

/** 이 컴퓨터가 로그인한 GitHub 계정의 저장소 하나 */
export const GitHubRepoItem = z.object({
  owner: z.string(),
  name: z.string(),
  /** clone에 넘길 주소 */
  url: z.string(),
  private: z.boolean(),
  description: z.string(),
  updatedAt: z.string(),
  /** 이미 등록한 프로젝트 id */
  registeredId: z.string().optional(),
  /** 받을 폴더에 같은 이름의 폴더가 이미 있으면 그 경로 */
  localPath: z.string().optional(),
}).strict()

/** GET /researches/github-repos. parent: 받을 폴더의 기본값. 로그인을 못 찾으면 ok: false와 이유 */
export const GitHubRepoList = z.union([
  z.object({ parent: z.string(), ok: z.literal(true), source: z.enum(['gh', 'git', 'sample']), repos: z.array(GitHubRepoItem) }).strict(),
  z.object({ parent: z.string(), ok: z.literal(false), reason: z.string() }).strict(),
])

export type GitHubRepoItem = z.infer<typeof GitHubRepoItem>
export type GitHubRepoList = z.infer<typeof GitHubRepoList>
