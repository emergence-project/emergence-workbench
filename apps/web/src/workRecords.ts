import type { JournalEntry } from '@rw/core'
import type { CommentEntry, RecordFile } from './api/comments'
import { recordKind } from './recordsPanelHelpers'
import { t } from './i18n'

/** 작업 탭의 필터 (10/7 작업 탭: 판단 · 맡긴 일을 앞에 더함). 처음 열면 판단 */
export const WORK_FILTERS = ['판단', '맡긴 일', '할 일', '메모', '질문'] as const
export type WorkFilter = typeof WORK_FILTERS[number]
/** 필터의 화면 이름 (값은 한국어 그대로 저장한다) */
export const WORK_FILTER_LABEL: Record<WorkFilter, string> = {
  판단: t('판단', 'To decide'), '맡긴 일': t('맡긴 일', 'Delegated'), '할 일': t('할 일', 'To-do'), 메모: t('메모', 'Memo'), 질문: t('질문', 'Question'),
}
/** 아래 입력란으로 적는 기록의 필터 */
export type RecordFilter = Exclude<WorkFilter, '판단' | '맡긴 일'>
export const isRecordFilter = (f: WorkFilter): f is RecordFilter => f === '할 일' || f === '메모' || f === '질문'
export const WORK_FILTER_KEY = 'rw-work-filter'

/** 첫 화면 작업 패널의 할 일을 누르면 작업 탭의 할 일에서 그 항목을 보인다 (10/7 15:31 수정 요청) */
export const TODO_FOCUS_EVENT = 'rw-work-todo-focus'
let pendingTodo: string | null = null
export const todoKey = (entry: { date: string; index: number }) => `${entry.date}-${entry.index}`
export function focusTodo(key: string) {
  pendingTodo = key
  try { localStorage.setItem(WORK_FILTER_KEY, '할 일') } catch { /* 저장할 수 없어도 이번 열기에는 보인다. */ }
  window.dispatchEvent(new Event(TODO_FOCUS_EVENT))
}
/** 읽기만 한다 (렌더 중에 불려도 같은 값). 항목을 보인 뒤 clearTodoFocus로 지운다. */
export const peekTodoFocus = (): string | null => pendingTodo
export function clearTodoFocus(key: string) { if (pendingTodo === key) pendingTodo = null }

export function parseWorkFilter(value: string | null): WorkFilter {
  return WORK_FILTERS.find((filter) => filter === value) ?? '판단'
}

export type WorkRecordItem =
  | { kind: 'record'; file: RecordFile; entry: CommentEntry }
  | { kind: 'journal'; entry: JournalEntry }

export interface WorkRecordGroup {
  target: string
  title: string
  items: WorkRecordItem[]
}

function writtenAt(item: WorkRecordItem): { stamp: string; order: number } {
  if (item.kind === 'journal') {
    const { date, time, index } = item.entry
    return { stamp: `${date.replace(/-/g, '')}${time.padStart(5, '0').replace(':', '')}00`, order: index }
  }
  // 기존 시분 ID와 시분초 ID를 함께 읽고, 같은 시각의 숫자 꼬리는 숫자로 비교한다.
  const match = /^c-(\d{8})-(\d{4}(?:\d{2})?)(?:-(\d+))?$/.exec(item.entry.id)
  return match ? { stamp: `${match[1]}${match[2]!.padEnd(6, '0')}`, order: Number(match[3] ?? 1) } : { stamp: '', order: 0 }
}

function newestFirst(items: WorkRecordItem[]): WorkRecordItem[] {
  return items.map((item) => ({ item, ...writtenAt(item) })).sort((a, b) =>
    b.stamp.localeCompare(a.stamp)
    // 두 파일 사이의 같은 시각은 실제 순서를 알 수 없다. 기록을 먼저 두고 각 파일의 적힌 순서를 쓴다.
    || Number(b.item.kind === 'record') - Number(a.item.kind === 'record')
    || b.order - a.order,
  ).map(({ item }) => item)
}

/** 프로젝트 기록과 예전 일지 메모를 함께, 그다음 노트별로 모은다. 각 묶음 안에서는 최근 것이 먼저다. */
export function workRecordGroups(files: RecordFile[], journal: JournalEntry[], filter: Exclude<RecordFilter, '할 일'>): WorkRecordGroup[] {
  const project: WorkRecordGroup = { target: 'project', title: t('이 프로젝트', 'This project'), items: [] }
  const notes: WorkRecordGroup[] = []
  for (const file of files) {
    const items: WorkRecordItem[] = file.comments.filter((entry) => recordKind(entry) === filter).map((entry) => ({ kind: 'record', file, entry }))
    if (file.target === 'project') project.items.push(...items)
    else if (items.length) notes.push({ target: file.target, title: file.title, items: newestFirst(items) })
  }
  if (filter === '메모') {
    project.items.push(...journal.filter((entry) => entry.kind === 'memo').map((entry): WorkRecordItem => ({ kind: 'journal', entry })))
  }
  return project.items.length ? [{ ...project, items: newestFirst(project.items) }, ...notes] : notes
}
