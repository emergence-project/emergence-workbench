// 흐름의 근거를 git에서 읽는 것 (11/20 결정 "흐름 근거 공통 기준"): 한 날의 기본값과 커밋 꼬리말.
// 쓰기 함수(problems.ts)는 git을 부르지 않으므로, 부르는 쪽(라우트 · pnpm agent:problem)이 여기서 먼저 읽어 넘긴다.
import { evidencePaths, hasAttemptTrailer } from '@rw/core'
import { GIT_TIMEOUT, git } from './git.js'
import { headCommit } from './problemFiles.js'

/** git에서 읽은 근거의 사실. 읽지 못하면 칸을 비운다(경고하지 않는다) */
export interface EvidenceFacts {
  /** 근거 파일이 처음 커밋된 날 (YYYY-MM-DD). 지난 일의 한 날 기본값 */
  firstDay?: string
  /** 보고 커밋의 메시지에 이 시도의 꼬리말이 있나 */
  trailer?: boolean
}

/** 근거 경로들 가운데 가장 먼저 커밋된 날. git 저장소가 아니거나 커밋된 적이 없으면 undefined */
export async function firstCommitDay(repo: string, files: string[]): Promise<string | undefined> {
  const paths = evidencePaths(files)
  if (!paths.length) return undefined
  try {
    const out = await git(repo, ['log', '--format=%as', '--reverse', '--', ...paths], { timeout: GIT_TIMEOUT.read })
    const day = out.split('\n')[0]?.trim()
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
  } catch { return undefined }
}

/** 커밋 메시지에 `Attempt: <흐름>/<글자>`가 있나. 읽지 못하면 undefined */
export async function commitHasTrailer(repo: string, commit: string, flow: string, label: string): Promise<boolean | undefined> {
  try {
    const msg = await git(repo, ['log', '-1', '--format=%B', commit], { timeout: GIT_TIMEOUT.read })
    return hasAttemptTrailer(msg, flow, label)
  } catch { return undefined }
}

/** 보고 전에: 보고 커밋(직접 준 것, 없으면 지금 HEAD)의 꼬리말 */
export async function reportFacts(repo: string, flow: string, aid: string, commit?: string): Promise<EvidenceFacts> {
  const c = commit?.trim() || headCommit(repo)
  if (!c) return {}
  const trailer = await commitHasTrailer(repo, c, flow, aid)
  return trailer === undefined ? {} : { trailer }
}

/** 지난 일을 적기 전에: 한 날을 비웠으면 근거의 첫 커밋 날 */
export async function recordFacts(repo: string, when: string | undefined, files: string[] | undefined): Promise<EvidenceFacts> {
  if (when || !files?.length) return {}
  const firstDay = await firstCommitDay(repo, files)
  return firstDay ? { firstDay } : {}
}
