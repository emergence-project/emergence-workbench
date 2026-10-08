// ---------- 프로젝트 등록 창 (서버 routes/researches.ts의 GitHub 목록) ----------
import { json, req } from './http'

/** 이 컴퓨터가 로그인한 GitHub 계정의 저장소 하나 (서버 githubRepos.ts의 RepoItem) */
export interface GitHubRepoItem {
  owner: string; name: string; url: string; private: boolean; description: string; updatedAt: string
  /** 이미 등록한 프로젝트 id */
  registeredId?: string
  /** 받을 폴더에 같은 이름의 폴더가 이미 있으면 그 경로 */
  localPath?: string
}
export type GitHubRepoList = { parent: string } & (
  | { ok: true; source: 'gh' | 'git' | 'sample'; repos: GitHubRepoItem[] }
  | { ok: false; reason: string })

export const githubRepos = async (): Promise<GitHubRepoList> => json(await req('/api/researches/github-repos'))
