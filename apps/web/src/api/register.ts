// ---------- 프로젝트 등록 창 (서버 routes/researches.ts의 GitHub 목록) ----------
import type { GitHubRepoList } from '@rw/core/contract/register'
import { json, req } from './http'

export type { GitHubRepoItem, GitHubRepoList } from '@rw/core/contract/register'

export const githubRepos = async (): Promise<GitHubRepoList> => json(await req('/api/researches/github-repos'))
