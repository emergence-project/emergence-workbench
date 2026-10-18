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

/** 상태 고르기 (10/18 결정): 진행 중(끝내지 않은 기록, 메모 포함) | 완료(끝냄) */
export type StatusFilter = '진행 중' | '완료'
export const isDoneRecord = (c: Pick<CommentEntry, 'state'>) => c.state === '끝냄'
export const filterByStatus = (items: CommentEntry[], status: StatusFilter) => items.filter((c) => isDoneRecord(c) === (status === '완료'))
/** 순서 (10/18): 사용자 차례가 맨 위, 나머지는 최근 것이 위 (기록 id가 c-날짜-시각이라 글자 순이 시간 순) */
export const sortRecords = (items: CommentEntry[]) => [...items].sort((a, b) => Number(isUserTurnRecord(b)) - Number(isUserTurnRecord(a)) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
export function recordRoute(rid: string, file: Pick<RecordFile, 'target' | 'source'>, firstPartOf: (target: string) => string | undefined): Route | null {
  if (file.target === 'project') return null
  if (file.target.startsWith('note-') || file.target.startsWith('calc-')) return file.source ? { page: 'part', rid, file: file.source } : null
  if (file.target.startsWith('block-')) return { page: 'block', rid, bid: file.source ?? file.target.slice(6) }
  if (file.target.startsWith('statement-')) return { page: 'statement', rid, sid: file.source ?? file.target.slice(10) }
  if (file.target.startsWith('paper-')) return file.source ? { page: 'doc', rid, name: file.source } : null
  if (file.target.startsWith('topic-')) return { page: 'topic', rid, tid: file.source ?? file.target.slice(6) }
  if (file.target.startsWith('flow-')) return { page: 'flow', rid }
  const part = firstPartOf(file.target)
  return part ? { page: 'part', rid, file: part } : null
}

/** PDF 쪽에 붙은 기록은 원문과 주소를 공유하되 결과 PDF 탭에서 보여 준다. */
export function recordPdfTab(file: Pick<RecordFile, 'target' | 'source'>, manuscriptKeyOf: (target: string) => string | undefined): Tab | null {
  if (file.target.startsWith('block-')) return { k: 'pdf', bid: file.source ?? file.target.slice(6) }
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

/** Newly written or explicitly revealed records must remain visible after a filter was chosen. */
export function filterForActiveRecord(filter: PanelFilter, comments: CommentEntry[], active: string | null): PanelFilter {
  const entry = comments.find((c) => c.id === active)
  return entry && entry.kind !== '하이라이트' && !filterRecords([entry], filter).length ? '전체' : filter
}
/** 고른 기록이 지금 상태 칸에 없으면 그 기록의 상태로 바꿔 보이게 한다 */
export function statusForActiveRecord(status: StatusFilter, comments: CommentEntry[], active: string | null): StatusFilter {
  const entry = comments.find((c) => c.id === active)
  return entry && entry.kind !== '하이라이트' ? (isDoneRecord(entry) ? '완료' : '진행 중') : status
}
