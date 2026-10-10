// ---------- 개념노트 (Markdown, research-library/concepts/*.md, 서버 conceptNotes.ts) ----------
import type { ConceptBib, ConceptBrief, ConceptLinks, ConceptList, ConceptMacros, ConceptMd, ConceptMemo, ConceptMemoBody, ConceptResolved, ConceptRows, ConceptSources, ConceptSubjects, ConceptUsage, ConceptBodyBody, ConceptFlagBody, ConceptReviewBody, ConceptCheck, ConceptIssue, ConceptSort } from '@rw/core/contract/concepts'
import { enc, json, req, send } from './http'
import type { RepoInfo } from './research'

export type { CheckState, ConceptMd, ConceptSource, ConceptSources, ConceptRow, ConceptIssue, ConceptCheck, ConceptSort, ConceptTableRow, ConceptMemo, ConceptUse, IdCount, ConceptBrief } from '@rw/core/contract/concepts'

export const conceptsApi = {
  read: (id: string) => req(`/api/concepts/${enc(id)}`).then((r) => json<ConceptMd>(r)),
  sources: (id: string) => req(`/api/concepts/${enc(id)}/sources`).then((r) => json<ConceptSources>(r)),
  macros: () => req('/api/concepts/macros').then((r) => json<ConceptMacros>(r)),
  setChecked: (id: string, on: boolean, baseHash: string) => req(`/api/concepts/${enc(id)}/checked`, send('POST', { on, baseHash } satisfies ConceptFlagBody)).then((r) => json<ConceptMd>(r)),
  setLocked: (id: string, on: boolean, baseHash: string) => req(`/api/concepts/${enc(id)}/locked`, send('POST', { on, baseHash } satisfies ConceptFlagBody)).then((r) => json<ConceptMd>(r)),
  /** 사용자 확인 고르기: 표시 없음 · 검토 예정 · 확인함 */
  setReview: (id: string, choice: 'none' | 'todo' | 'ok', baseHash: string) => req(`/api/concepts/${enc(id)}/review`, send('POST', { choice, baseHash } satisfies ConceptReviewBody)).then((r) => json<ConceptMd>(r)),
  assetUrl: (name: string) => `/api/concepts/asset?name=${enc(name)}`,
  /** 본문 밖 메모 (concepts/<id>.memo.md): 할 일·코멘트·작업 지침 */
  memo: (id: string) => req(`/api/concepts/${enc(id)}/memo`).then((r) => json<ConceptMemo>(r)),
  saveMemo: (id: string, text: string, baseHash: string) => req(`/api/concepts/${enc(id)}/memo`, send('PUT', { text, baseHash } satisfies ConceptMemoBody)).then((r) => json<ConceptMemo>(r)),
  /** 색인에서 한 쪽씩 (노트가 수만 개여도 전체를 받지 않는다) */
  list: (q: ConceptListQuery) => req(`/api/concepts/list?${listQs(q)}`).then((r) => json<ConceptList>(r)),
  subjects: (q: ConceptListQuery) => req(`/api/concepts/subjects?${listQs(q)}`).then((r) => json<ConceptSubjects>(r)).then((r) => r.subjects),
  rows: (ids: string[]) => req(`/api/concepts/rows?ids=${enc(ids.join(','))}`).then((r) => json<ConceptRows>(r)).then((r) => r.items),
  /** 본문 고치기 (머리말은 서버가 그대로 둔다. 잠긴 노트는 423, 바깥에서 바뀌었으면 409) */
  save: (id: string, body: string, baseHash: string) => req(`/api/concepts/${enc(id)}`, send('PUT', { body, baseHash } satisfies ConceptBodyBody)).then((r) => json<ConceptMd>(r)),
  resolve: (name: string) => req(`/api/concepts/resolve?name=${enc(name)}`).then((r) => json<ConceptResolved>(r)).then((r) => r.note),
  /** 편집기의 [@ 찾기: references.bib에서 */
  bib: (q: string) => req(`/api/concepts/bib?q=${enc(q)}`).then((r) => json<ConceptBib>(r)).then((r) => r.items),
  /** 쓰는 곳과 인용: 이 개념을 쓰는 프로젝트마다, 출처를 그 프로젝트 bib도 갖고 있는지 */
  usage: (id: string) => req(`/api/concepts/${enc(id)}/usage`).then((r) => json<ConceptUsage>(r)).then((r) => r.uses),
  /** 지식 첫 화면: 최근 고친 노트 · 점검 · 통계 (서버 conceptBrief.ts, 색인에서) */
  brief: (recent = 8) => req(`/api/concepts/brief?recent=${recent}`).then((r) => json<ConceptBrief>(r)),
  /** 라이브러리 폴더의 Git 상태 (받아오기·올리기는 하지 않는다) */
  libraryRepo: () => req('/api/library/repo').then((r) => json<{ repo: RepoInfo | null }>(r)).then((r) => r.repo),
  links: (id: string) => req(`/api/concepts/${enc(id)}/links`).then((r) => json<ConceptLinks>(r)),
}

export interface ConceptListQuery { subjectPrefix?: string; issue?: ConceptIssue; check?: ConceptCheck; ids?: string[]; sort?: ConceptSort; dir?: 'asc' | 'desc'; q?: string; subject?: string; filter?: 'all' | 'unfinished' | 'checked'; showEmpty?: boolean; offset?: number; limit?: number }
function listQs(q: ConceptListQuery): string {
  const p = new URLSearchParams()
  for (const k of ['subjectPrefix', 'issue', 'check', 'sort', 'dir'] as const) if (q[k] !== undefined) p.set(k, q[k])
  if (q.ids !== undefined) p.set('ids', q.ids.join(','))
  if (q.q) p.set('q', q.q)
  if (q.subject !== undefined) p.set('subject', q.subject)
  if (q.filter) p.set('filter', q.filter)
  if (q.showEmpty) p.set('showEmpty', '1')
  if (q.offset) p.set('offset', String(q.offset))
  if (q.limit) p.set('limit', String(q.limit))
  return p.toString()
}
