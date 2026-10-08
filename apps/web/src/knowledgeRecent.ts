// 지식 첫 화면의 순수 함수 (KnowledgeHome.tsx). 테스트: knowledgeHome.test.ts
import type { ConceptBrief, ConceptRow } from './api/concepts'
import { t } from './i18n'

/** 고친 것(서버)과 연 것(이 브라우저)을 한 목록으로: 같은 노트는 나중 것 하나, 최근 것부터 */
export interface RecentRow { id: string; title: string; subject: string; at?: number; kind: 'opened' | 'edited' }
export function mergeRecent(edited: ConceptBrief['recent'], openedRows: Pick<ConceptRow, 'id' | 'title' | 'subject'>[], opened: { id: string; at?: number }[], limit = 8): RecentRow[] {
  const by = new Map<string, RecentRow>()
  for (const e of edited) by.set(e.id, { id: e.id, title: e.title, subject: e.subject, at: e.mtime, kind: 'edited' })
  const rows = new Map(openedRows.map((r) => [r.id, r]))
  for (const o of opened) {
    const r = rows.get(o.id)
    if (!r) continue
    const had = by.get(o.id)
    if (had && (had.at ?? 0) >= (o.at ?? 0)) continue
    by.set(o.id, { id: o.id, title: r.title, subject: r.subject, at: o.at, kind: 'opened' })
  }
  return [...by.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, limit)
}

/** "오늘", "어제", "9/27" */
export function dayOf(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  if (d.toDateString() === new Date(now).toDateString()) return t('오늘', 'Today')
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return t('어제', 'Yesterday')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 긴 분류는 처음과 마지막만: "Mathematics › … › Map Coloring" (전체는 가리키면) */
export const shortSubject = (s: string) => {
  const p = s ? s.split(/\s*›\s*/) : []
  return p.length > 2 ? `${p[0]} › … › ${p[p.length - 1]}` : p.join(' › ')
}
