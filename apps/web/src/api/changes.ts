// ---------- 변경사항 (10/27): 내가 · 에이전트가 마지막으로 본 뒤 프로젝트에서 바뀐 것. 서버 routes/changes.ts ----------
import { enc, json, req, send } from './http'

import type { Changes, ChangesCount, ChangesSeen } from '@rw/core/contract/changes'
export type { ChangeItem, Changes, ChangesCount } from '@rw/core/contract/changes'

export function changesApi(rid: string) {
  const base = `/api/researches/${enc(rid)}/changes`
  return {
    /** since가 없으면 내가 마지막으로 본 때부터 */
    list: (since?: string) => req(since ? `${base}?since=${enc(since)}` : base).then((r) => json<Changes>(r)),
    count: () => req(`${base}/count`).then((r) => json<ChangesCount>(r)),
    /** 화면을 열었다: 내 기준을 at(없으면 지금)으로 */
    seen: (at?: string) => req(`${base}/seen`, send('POST', at ? { at } : {})).then((r) => json<ChangesSeen>(r)),
  }
}
