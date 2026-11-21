// 기기의 앱 버전을 사람이 읽는 말로 (11/21 사용자 "1a19a27로 적혀 있어 어떻게 차이나는지 모르겠다"):
// 커밋 해시를 이 컴퓨터의 앱 저장소에서 찾아 마지막 업데이트 번호(#PR) · 시각과, 이 컴퓨터보다 몇 개 앞뒤인지로 바꾼다.
// 받은 적 없는 커밋(이 컴퓨터보다 새 버전)은 찾지 못해 null이고, 화면은 해시를 그대로 보인다
import type { DeviceBuild } from '@rw/core/contract/devices'
import { git } from './git.js'

const cache = new Map<string, DeviceBuild | null>()

/** 커밋 제목 끝의 업데이트 번호: "… (#622)" */
export const prOf = (subject: string): number | undefined => { const m = /\(#(\d+)\)\s*$/.exec(subject); return m ? Number(m[1]) : undefined }

/** sha의 업데이트 번호 · 시각과, here(이 컴퓨터가 도는 커밋)보다 몇 개 뒤(behind) · 앞(ahead)인지 */
export async function deviceBuild(root: string, sha: string, here: string): Promise<DeviceBuild | null> {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return null
  const key = `${root}\n${here}\n${sha}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let out: DeviceBuild | null = null
  try {
    const [at = '', subject = ''] = (await git(root, ['log', '-1', '--format=%cI%x09%s', sha, '--'])).split('\t')
    const pr = prOf(subject)
    const [behind, ahead] = (await git(root, ['rev-list', '--left-right', '--count', `${here}...${sha}`, '--'])).split(/\s+/).map(Number)
    out = { ...(pr && { pr }), at, behind: behind ?? 0, ahead: ahead ?? 0 }
    cache.set(key, out)
  } catch { /* 모르는 커밋: 다음에 받은 뒤 다시 찾게 캐시에 두지 않는다 */ }
  return out
}
