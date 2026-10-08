import type { CommentEntry, RecordFile } from './api/comments'
import type { Route } from './router'
import type { Tab } from './Workspace'

export type RecordFilter = '전체' | '메모' | '할 일' | '질문'
export const recordKind = (c: Pick<CommentEntry, 'kind'>) => c.kind === '코멘트' ? '메모' : c.kind
export const filterRecords = (items: CommentEntry[], filter: RecordFilter) => items.filter((c) => c.kind !== '하이라이트' && (filter === '전체' || recordKind(c) === filter))
/** Count source records actually classified, excluding changed or removed entries and newly split items. */
export function classifiedRecordCount(before: CommentEntry[], after: CommentEntry[]): number {
  const current = new Map(after.map((c) => [c.id, c]))
  return before.filter((c) => {
    const next = current.get(c.id)
    return c.unsorted && next && !next.unsorted && next.body === c.body
  }).length
}
export const recordDate = (id: string) => {
  const match = /^c-(\d{4})(\d{2})(\d{2})-/.exec(id)
  return match ? `${Number(match[2])}/${Number(match[3])}` : ''
}
export function recordRoute(rid: string, file: Pick<RecordFile, 'target' | 'source'>, firstPartOf: (target: string) => string | undefined): Route | null {
  if (file.target === 'project') return null
  if (file.target.startsWith('note-') || file.target.startsWith('calc-')) return file.source ? { page: 'part', rid, file: file.source } : null
  if (file.target.startsWith('block-')) return { page: 'block', rid, bid: file.source ?? file.target.slice(6) }
  if (file.target.startsWith('statement-')) return { page: 'statement', rid, sid: file.source ?? file.target.slice(10) }
  if (file.target.startsWith('paper-')) return file.source ? { page: 'doc', rid, name: file.source } : null
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
export function filterForActiveRecord(filter: RecordFilter, comments: CommentEntry[], active: string | null): RecordFilter {
  const entry = comments.find((c) => c.id === active)
  return entry && entry.kind !== '하이라이트' && !filterRecords([entry], filter).length ? '전체' : filter
}
