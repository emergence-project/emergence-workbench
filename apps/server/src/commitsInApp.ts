import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/**
 * 피드백의 반영 커밋이 지금 돌고 있는 앱에 들어 있는가 (10/4 피드백 "반영했는지 안 했는지 어떻게 봐?").
 * 돌고 있는 커밋의 조상 목록과 이 저장소가 아는 모든 커밋 목록을 한 번씩 읽어 짧은 해시로 찾는다.
 * - true: 앱에 들어 있다 · false: 저장소에는 있지만 앱이 더 옛것이다 (업데이트 필요) · undefined: 이 저장소가 모르는 커밋
 * 목록은 잠깐(1분) 기억한다. 업데이트 확인(fetch)이 새 커밋을 들여오면 그다음에 반영된다.
 */
export function commitChecker(root: string, running: string, ttlMs = 60_000) {
  let cached: { at: number; inApp: string[]; known: string[] } | null = null
  const revs = async (...args: string[]) => (await exec('git', ['-C', root, 'rev-list', ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter(Boolean)
  const load = async () => {
    if (cached && Date.now() - cached.at < ttlMs) return cached
    const [inApp, known] = await Promise.all([revs(running), revs('--all')])
    cached = { at: Date.now(), inApp, known }
    return cached
  }
  const has = (list: string[], short: string) => list.some((h) => h.startsWith(short))
  /** "6f45bc7, 3859d32"처럼 여럿이면 모두 들어 있어야 true */
  return async (commit: string): Promise<boolean | undefined> => {
    const shorts = commit.split(/[\s,]+/).filter((s) => /^[0-9a-f]{7,40}$/.test(s))
    if (!shorts.length) return undefined
    let c
    try { c = await load() } catch { return undefined }
    if (shorts.some((s) => !has(c.known, s))) return undefined
    return shorts.every((s) => has(c.inApp, s))
  }
}
