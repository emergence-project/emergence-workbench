import fs from 'node:fs'
import path from 'node:path'
import { COMMENTS_DIR } from './comments.js'
import { buildDirOf, pathKeyOf } from './manuscript.js'
import type { Workbench } from './workbench.js'

/**
 * 예전 key '' 자료를 지금 그 노트의 key로 한 번 옮긴다 (10/5 검토, manuscript.ts msKeyOf).
 * 전에는 research.yaml에 원고를 적지 않은 프로젝트에서 연구노트·계산 노트 중 이름순 첫째가 key ''였다.
 * 이제 그 노트도 경로 key라서, 그 노트의 PDF 코멘트(comments/manuscript.md)와 컴파일 결과(.build/manuscript/)를
 * 지금 같은 노트의 자리(comments/manuscript-<key>.md, .build/manuscript-<key>/)로 옮긴다. 옮길 자리에 이미 있으면 두지 않고 그대로 둔다.
 */
export function migrateLegacyMainKey(wb: Workbench): void {
  let first: { path: string; declared?: true } | undefined
  try { first = wb.readResearch().sources.manuscripts[0] } catch { return }
  if (!first || first.declared) return
  const key = pathKeyOf(first.path)
  const moves: [string, string][] = [
    [path.join(wb.root, COMMENTS_DIR, 'manuscript.md'), path.join(wb.root, COMMENTS_DIR, `manuscript-${key}.md`)],
    [buildDirOf(wb, ''), buildDirOf(wb, key)],
  ]
  for (const [from, to] of moves) {
    try { if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to) } catch { /* 옮기지 못하면 예전 자리에 둔다 */ }
  }
}
