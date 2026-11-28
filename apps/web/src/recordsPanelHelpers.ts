import type { CommentEntry, RecordFile } from './api/comments'
import type { Route } from './router'
import type { Tab } from './Workspace'
import type { RecordFilter } from './recordLabels'
import { localDate } from '@rw/core'
import { monthDay, recordDay } from './format'

/** 오른쪽 기록 패널의 필터: 전체와 기록 종류 */
export type PanelFilter = '전체' | RecordFilter
export const recordKind = (c: Pick<CommentEntry, 'kind'>) => c.kind === '코멘트' ? '메모' : c.kind
/** 사용자가 이어 쓴 답의 이름 (파일 값, docs/repo-format.md §6.2) */
export const USER_ANSWER_BY = '사용자'
/** 에이전트가 하거나 답하는 종류: 이어 쓰기가 있다 */
export const isTalkKind = (kind: string) => kind === '질문' || kind === '지시'
/** 사용자 차례 (10/15): 에이전트가 쓴(by) 질문 · 지시가 대기. 서버 comments.ts isUserTurnRecord와 같은 규칙 */
export const isUserTurnRecord = (c: Pick<CommentEntry, 'kind' | 'by' | 'state'>) => isTalkKind(c.kind) && Boolean(c.by) && c.state === '대기'
export const filterRecords = (items: CommentEntry[], filter: PanelFilter) => items.filter((c) => c.kind !== '하이라이트' && (filter === '전체' || recordKind(c) === filter))
/** Count source records actually classified, excluding changed or removed entries and newly split items. */
export function classifiedRecordCount(before: CommentEntry[], after: CommentEntry[]): number {
  const current = new Map(after.map((c) => [c.id, c]))
  return before.filter((c) => {
    const next = current.get(c.id)
    return c.unsorted && next && !next.unsorted && next.body === c.body
  }).length
}
export const recordDate = (id: string) => { const day = recordDay(id); return day ? monthDay(day) : '' }
/** 기록 줄 아래 오른쪽의 시점 (10/18): 오늘 쓴 것은 시각(14:20), 그 전은 날짜(10/12). title은 날짜와 시각 모두 */
export function recordWhen(id: string, now = new Date()): { label: string; title: string } {
  const m = /^c-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(id)
  if (!m) return { label: recordDate(id), title: recordDay(id) }
  const day = `${m[1]}-${m[2]}-${m[3]}`
  const time = `${m[4]}:${m[5]}`
  return { label: day === localDate(now) ? time : monthDay(day), title: `${day} ${time}` }
}

/**
 * 오른쪽 사이드바 기록의 필터 메뉴 (11/28 결정 「둘째 줄」): 종류마다 체크(메모 · 할 일 · 질문). 예전 지시는 질문과 함께 거른다.
 * 11/21~11/27의 전체 · 할 일 · 대기 한 줄을 바꿨다: 답을 기다리는 것은 따로 묶지 않고 카드의 덧붙임 글로만 알린다
 */
export const SIDE_KINDS = ['메모', '할 일', '질문'] as const
export type SideKind = typeof SIDE_KINDS[number]
export const sideKindOf = (c: Pick<CommentEntry, 'kind'>): SideKind | null => {
  const kind = recordKind(c)
  return kind === '지시' ? '질문' : kind === '메모' || kind === '할 일' || kind === '질문' ? kind : null
}
export const inSideKinds = (c: Pick<CommentEntry, 'kind'>, kinds: ReadonlySet<SideKind>) => { const kind = sideKindOf(c); return kind !== null && kinds.has(kind) }
/** 정렬 (11/28): 최근 것 먼저 | 오래된 것 먼저. 내 차례와 고정은 어느 쪽이든 위에 남는다 */
export type SideOrder = 'new' | 'old'
/** 상태 고르기 (10/18 결정): 진행 중(끝내지 않은 기록, 메모 포함) | 완료(끝냄) */
export type StatusFilter = '진행 중' | '완료'
/** 완료: 끝냄, 그리고 에이전트가 물은 것에 사용자가 답한 것(답함) — 답했으면 내 일은 끝났으니 「완료 n」으로 접는다 (11/23 시안 코멘트) */
export const isDoneRecord = (c: Pick<CommentEntry, 'state' | 'kind' | 'by'>) => c.state === '끝냄' || (isTalkKind(c.kind) && Boolean(c.by) && c.state === '답함')
export const filterByStatus = (items: CommentEntry[], status: StatusFilter) => items.filter((c) => isDoneRecord(c) === (status === '완료'))
/** 순서 (10/18, 11/28): 내 차례가 맨 위, 다음은 위에 고정한 것, 나머지는 최근 것이 위 (기록 id가 c-날짜-시각이라 글자 순이 시간 순) */
type Sortable = Pick<CommentEntry, 'id' | 'kind' | 'by' | 'state' | 'pinned'>
export const compareRecords = (a: Sortable, b: Sortable, order: SideOrder = 'new') => Number(isUserTurnRecord(b)) - Number(isUserTurnRecord(a))
  || Number(b.pinned ?? false) - Number(a.pinned ?? false) || (a.id === b.id ? 0 : (a.id < b.id) === (order === 'new') ? 1 : -1)
export const sortRecords = <T extends Sortable>(items: T[], order: SideOrder = 'new') => [...items].sort((a, b) => compareRecords(a, b, order))

/** 기록 한 줄과 그 파일 (여러 대상의 기록을 한 목록에 놓을 때) */
export interface RecordAt { file: RecordFile; c: CommentEntry }
/**
 * 묶음 없이 한 목록으로 (11/28 결정 「목록 하나」): 진행 중(내 차례 · 고정 · 나머지)과 완료로만 나눈다.
 * 할 일에 대해 물은 질문은 그 할 일이 목록에 있으면 할 일 아래 대화로만 보인다(따로 줄을 두지 않는다, 10/19)
 */
export function flatRecords(files: RecordFile[], kinds: ReadonlySet<SideKind>, order: SideOrder = 'new'): { open: RecordAt[]; done: RecordAt[] } {
  const rows: RecordAt[] = []
  for (const file of files) {
    const listed = file.comments.filter((c) => inSideKinds(c, kinds))
    const todos = new Set(listed.filter((c) => c.kind === '할 일').map((c) => c.id))
    for (const c of listed) if (!(c.todo && todos.has(c.todo))) rows.push({ file, c })
  }
  rows.sort((a, b) => compareRecords(a.c, b.c, order) || (a.file.target < b.file.target ? -1 : a.file.target > b.file.target ? 1 : 0))
  return { open: rows.filter((r) => !isDoneRecord(r.c)), done: rows.filter((r) => isDoneRecord(r.c)) }
}
/** 이어진 같은 파일의 줄을 한 덩어리로 (RecordList는 파일 하나를 받는다) */
export function recordRuns(rows: RecordAt[]): { file: RecordFile; items: CommentEntry[] }[] {
  const runs: { file: RecordFile; items: CommentEntry[] }[] = []
  for (const { file, c } of rows) {
    const last = runs.at(-1)
    if (last && last.file.target === file.target) last.items.push(c)
    else runs.push({ file, items: [c] })
  }
  return runs
}
export function recordRoute(rid: string, file: Pick<RecordFile, 'target' | 'source'>, firstPartOf: (target: string) => string | undefined): Route | null {
  if (file.target === 'project') return null
  if (file.target.startsWith('note-') || file.target.startsWith('calc-')) return file.source ? { page: 'part', rid, file: file.source } : null
  if (file.target.startsWith('statement-')) return { page: 'statement', rid, sid: file.source ?? file.target.slice(10) }
  if (file.target.startsWith('paper-')) return file.source ? { page: 'doc', rid, name: file.source } : null
  if (file.target.startsWith('topic-')) return { page: 'topic', rid, tid: file.source ?? file.target.slice(6) }
  if (file.target.startsWith('task-')) return { page: 'task', rid, task: file.source ?? file.target.slice(5) }
  const part = firstPartOf(file.target)
  return part ? { page: 'part', rid, file: part } : null
}

/** PDF 쪽에 붙은 기록은 원문과 주소를 공유하되 결과 PDF 탭에서 보여 준다. */
export function recordPdfTab(file: Pick<RecordFile, 'target' | 'source'>, manuscriptKeyOf: (target: string) => string | undefined): Tab | null {
  if (file.target === 'manuscript' || file.target.startsWith('manuscript-')) {
    const ms = manuscriptKeyOf(file.target)
    return ms === undefined ? null : ms ? { k: 'mspdf', ms } : { k: 'mspdf' }
  }
  return null
}

export interface RecordEdit { text: string; original: string; hash: string }
/** An appended answer can refresh the edit hash; a changed body needs explicit review. */
export function rebaseRecordEdit(edit: RecordEdit, body: string, hash: string): RecordEdit {
  return edit.hash !== hash && edit.original === body ? { ...edit, hash } : edit
}
