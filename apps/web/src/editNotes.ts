import type { EditHunk } from './api'

const same = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 수정 검토에 보일 "고친 까닭" (10/20 18:01 피드백): 에이전트가 고칠 때마다 적은 요약(summary) 중
 *  빈 것 · 되풀이 · 바뀐 곳의 이유와 같은 말은 뺀다. 순서는 적은 순서 그대로 */
export function editNotes(notes: string[], hunks: Pick<EditHunk, 'reason'>[]): string[] {
  const reasons = new Set(hunks.flatMap((h) => h.reason ? [same(h.reason.reason)] : []))
  const seen = new Set<string>()
  return notes.flatMap((n) => {
    const k = same(n)
    if (!k || seen.has(k) || reasons.has(k)) return []
    seen.add(k)
    return [n.trim()]
  })
}
