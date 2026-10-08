// ---------- 개념노트 (Markdown, research-library/concepts/*.md, 서버 conceptNotes.ts) ----------
import { enc, json, req, send } from './http'
import type { SubjectCount } from './subjects'
import type { RepoInfo } from './research'

/** 확인함 상태: 안 함 · 확인함 · 확인한 뒤 본문이 바뀜 */
export type CheckState = 'none' | 'ok' | 'changed'
export interface ConceptMd {
  id: string
  meta: { title: string; aliases: string[]; subject?: string; subjects?: string[]; study?: string; checked?: { at: string; hash: string }; locked: boolean; review?: 'todo'; sources: string[]; related: string[]; sourcesUnsorted: string[] }
  body: string; hash: string; unfinished: string[]; checked: CheckState
}
/** 개념노트 출처 한 건: references.bib 항목, 또는 bib에 없는 키 */
export type ConceptSource =
  | { key: string; type: string; title?: string; author?: string; year?: string; eprint?: string; doi?: string; journal?: string; missing?: undefined }
  | { key: string; missing: true }
export interface ConceptSources { sources: ConceptSource[]; cited: string[]; unsorted: string[] }
export const conceptsApi = {
  read: (id: string) => req(`/api/concepts/${enc(id)}`).then((r) => json<ConceptMd>(r)),
  sources: (id: string) => req(`/api/concepts/${enc(id)}/sources`).then((r) => json<ConceptSources>(r)),
  macros: () => req('/api/concepts/macros').then((r) => json<{ file: string; exists: boolean; macros: Record<string, string> }>(r)),
  setChecked: (id: string, on: boolean, baseHash: string) => req(`/api/concepts/${enc(id)}/checked`, send('POST', { on, baseHash })).then((r) => json<ConceptMd>(r)),
  setLocked: (id: string, on: boolean, baseHash: string) => req(`/api/concepts/${enc(id)}/locked`, send('POST', { on, baseHash })).then((r) => json<ConceptMd>(r)),
  /** 사용자 확인 고르기: 표시 없음 · 검토 예정 · 확인함 */
  setReview: (id: string, choice: 'none' | 'todo' | 'ok', baseHash: string) => req(`/api/concepts/${enc(id)}/review`, send('POST', { choice, baseHash })).then((r) => json<ConceptMd>(r)),
  assetUrl: (name: string) => `/api/concepts/asset?name=${enc(name)}`,
  /** 본문 밖 메모 (concepts/<id>.memo.md): 할 일·코멘트·작업 지침 */
  memo: (id: string) => req(`/api/concepts/${enc(id)}/memo`).then((r) => json<ConceptMemo>(r)),
  saveMemo: (id: string, text: string, baseHash: string) => req(`/api/concepts/${enc(id)}/memo`, send('PUT', { text, baseHash })).then((r) => json<ConceptMemo>(r)),
  /** 색인에서 한 쪽씩 (노트가 수만 개여도 전체를 받지 않는다) */
  list: (q: ConceptListQuery) => req(`/api/concepts/list?${listQs(q)}`).then((r) => json<{ total: number; items: ConceptTableRow[] }>(r)),
  subjects: (q: ConceptListQuery) => req(`/api/concepts/subjects?${listQs(q)}`).then((r) => json<{ subjects: SubjectCount[] }>(r)).then((r) => r.subjects),
  rows: (ids: string[]) => req(`/api/concepts/rows?ids=${enc(ids.join(','))}`).then((r) => json<{ items: ConceptRow[] }>(r)).then((r) => r.items),
  /** 본문 고치기 (머리말은 서버가 그대로 둔다. 잠긴 노트는 423, 바깥에서 바뀌었으면 409) */
  save: (id: string, body: string, baseHash: string) => req(`/api/concepts/${enc(id)}`, send('PUT', { body, baseHash })).then((r) => json<ConceptMd>(r)),
  resolve: (name: string) => req(`/api/concepts/resolve?name=${enc(name)}`).then((r) => json<{ note: ConceptRow | null }>(r)).then((r) => r.note),
  /** 편집기의 [@ 찾기: references.bib에서 */
  bib: (q: string) => req(`/api/concepts/bib?q=${enc(q)}`).then((r) => json<{ items: { key: string; title?: string; author?: string; year?: string }[] }>(r)).then((r) => r.items),
  /** 쓰는 곳과 인용: 이 개념을 쓰는 프로젝트마다, 출처를 그 프로젝트 bib도 갖고 있는지 */
  usage: (id: string) => req(`/api/concepts/${enc(id)}/usage`).then((r) => json<{ uses: ConceptUse[] }>(r)).then((r) => r.uses),
  /** 지식 첫 화면: 최근 고친 노트 · 점검 · 통계 (서버 conceptBrief.ts, 색인에서) */
  brief: (recent = 8) => req(`/api/concepts/brief?recent=${recent}`).then((r) => json<ConceptBrief>(r)),
  /** 라이브러리 폴더의 Git 상태 (받아오기·올리기는 하지 않는다) */
  libraryRepo: () => req('/api/library/repo').then((r) => json<{ repo: RepoInfo | null }>(r)).then((r) => r.repo),
  links: (id: string) => req(`/api/concepts/${enc(id)}/links`).then((r) => json<{ out: ConceptRow[]; back: ConceptRow[]; missing: string[] }>(r)),
}

export interface ConceptRow { id: string; key: string; title: string; subject: string; subjects?: string[]; aliases: string[]; unfinished: string[]; checked: 'none' | 'ok' | 'changed'; locked: boolean }
export type ConceptIssue = 'empty' | 'emptySection' | 'todo' | 'brokenLink' | 'noSource' | 'unknownCite'
export type ConceptCheck = 'unchecked' | 'changedAfterCheck' | 'draftsToReview'
export type ConceptSort = 'title' | 'subject' | 'sources' | 'links' | 'issues' | 'mtime' | 'projects' | 'aliases' | 'checked'
export interface ConceptTableRow extends ConceptRow { sources: number; links: number; issues: ConceptIssue[]; mtime: number; projects: string[] }
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

export interface ConceptMemo { id: string; text: string; hash: string; exists: boolean }

/** 이 개념을 쓰는 프로젝트 하나: 프로젝트 전체 연결(research.yaml), 기대는 연구노트, 개념노트 출처가 그 bib에 있는지 */
export interface ConceptUse { rid: string; project: string; linked: boolean; notes: { id: string; title: string }[]; cites: { key: string; projectKey?: string }[] }

/** 수와 id 목록 */
export interface IdCount { count: number; ids: string[] }
/** 지식 첫 화면 (서버 conceptBrief.ts) */
export interface ConceptBrief {
  total: number
  recent: { id: string; title: string; subject: string; mtime: number }[]
  /** 점검(사용자 차례): 연구가 쓰는 노트 중 확인 전 · 확인 뒤 바뀜, 초안이 다 된 공부할 것(ids는 항목 id, concepts는 개념노트 id) */
  check: { used: number; unchecked: IdCount; changedAfterCheck: IdCount; draftsToReview: IdCount & { concepts: string[] } }
  /** 통계(이상, 에이전트 차례) */
  stats: { empty: IdCount; emptySection: IdCount; todo: IdCount; brokenLink: IdCount; noSource: IdCount; unknownCite: IdCount }
}
