// ---------- 프로젝트 등록 창 (서버 routes/researches.ts의 GitHub 목록) ----------
import type { GitHubRepoList, NewProjectBody, PickedFolder } from '@rw/core/contract/register'
import type { ResearchListItem } from '@rw/core/contract/research'
import { json, req, send } from './http'

export type { GitHubRepoItem, GitHubRepoList } from '@rw/core/contract/register'

export const githubRepos = async (): Promise<GitHubRepoList> => json(await req('/api/researches/github-repos'))
/** 맥의 Finder 폴더 고르기 창. 취소하면 path: null */
export const pickFolder = async (start?: string): Promise<PickedFolder> => json(await req('/api/researches/pick-folder', send('POST', start ? { start } : {})))
/** 저장소 없이 새로 시작: 폴더를 만들고 git 저장소로 시작한 뒤 등록한다 */
export const newProject = async (body: NewProjectBody): Promise<ResearchListItem> => json(await req('/api/researches/new', send('POST', body)))
