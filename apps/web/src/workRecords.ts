import { todoDue, type JournalEntry } from '@rw/core'
import type { CommentEntry, RecordFile } from './api/comments'
import { recordKind } from './recordsPanelHelpers'
import { t } from './i18n'

/** 작업 탭과 기록 탭의 필터 (10/7 작업 탭: 판단 · 맡긴 일을 앞에 더함) */
export const WORK_FILTERS = ['판단', '맡긴 일', '할 일', '메모', '질문', '지시'] as const
export type WorkFilter = typeof WORK_FILTERS[number]
/** 작업 탭은 판단 · 맡긴 일, 기록 탭은 메모 · 할 일 · 질문 · 지시 (10/15 사용자 결정: 기록을 따로 된 탭으로, 에이전트가 하고 답하는 지시를 더함) */
export type WorkSection = 'work' | 'records'
export const SECTION_FILTERS: Record<WorkSection, readonly WorkFilter[]> = { work: ['판단', '맡긴 일'], records: ['메모', '할 일', '질문', '지시'] }
/** 필터의 화면 이름 (값은 한국어 그대로 저장한다) */
export const WORK_FILTER_LABEL: Record<WorkFilter, string> = {
  판단: t('판단', 'To decide'), '맡긴 일': t('맡긴 일', 'Delegated'), '할 일': t('할 일', 'To-do'), 메모: t('메모', 'Memo'), 질문: t('질문', 'Question'), 지시: t('지시', 'Instruction'),
}
/** 아래 입력란으로 적는 기록의 필터 */
export type RecordFilter = Exclude<WorkFilter, '판단' | '맡긴 일'>
export const isRecordFilter = (f: WorkFilter): f is RecordFilter => f === '할 일' || f === '메모' || f === '질문' || f === '지시'
export const WORK_FILTER_KEY: Record<WorkSection, string> = { work: 'rw-work-filter', records: 'rw-records-filter' }

/** 기록 탭을 그 필터로 연다 (10/14 13:33 제안: 오른쪽 사이드바 기록의 "모두 보기"). 이미 열린 기록 탭도 바뀐다 */
export const WORK_FILTER_EVENT = 'rw-records-filter'
export function chooseRecordFilter(f: RecordFilter) {
  try { localStorage.setItem(WORK_FILTER_KEY.records, f) } catch { /* 저장할 수 없어도 열린 기록 탭은 바뀐다. */ }
  window.dispatchEvent(new CustomEvent(WORK_FILTER_EVENT, { detail: f }))
}

/** 첫 화면 작업 패널의 할 일을 누르면 작업 탭의 할 일에서 그 항목을 보인다 (10/7 15:31 수정 요청) */
export const TODO_FOCUS_EVENT = 'rw-work-todo-focus'
let pendingTodo: string | null = null
/** 할 일 하나를 가리키는 이름: 기록 대상/기록 id (2026-10-16 할 일의 정본은 기록 파일) */
export const todoKey = (todo: { target: string; id: string }) => `${todo.target}/${todo.id}`
export function focusTodo(key: string) {
  pendingTodo = key
  try { localStorage.setItem(WORK_FILTER_KEY.records, '할 일') } catch { /* 저장할 수 없어도 이번 열기에는 보인다. */ }
  window.dispatchEvent(new Event(TODO_FOCUS_EVENT))
}
/** 읽기만 한다 (렌더 중에 불려도 같은 값). 항목을 보인 뒤 clearTodoFocus로 지운다. */
export const peekTodoFocus = (): string | null => pendingTodo
export function clearTodoFocus(key: string) { if (pendingTodo === key) pendingTodo = null }

/** 그 탭의 필터가 아니면 그 탭의 첫 필터 (작업은 판단, 기록은 메모) */
export function parseWorkFilter(value: string | null, section: WorkSection = 'work'): WorkFilter {
  const filters = SECTION_FILTERS[section]
  return filters.find((filter) => filter === value) ?? filters[0]!
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

/** 할 일은 마감이 이른 것부터, 마감이 없으면 먼저 적은 것부터 (계획 순서, 서버 openTodos와 같은 차례) */
function byDue(items: WorkRecordItem[]): WorkRecordItem[] {
  const due = (item: WorkRecordItem) => item.kind === 'record' ? todoDue(item.entry.body.trim() || item.entry.quote?.trim() || '', recordDay(item.entry.id)) ?? '9999' : '9999'
  return [...items].sort((a, b) => due(a).localeCompare(due(b)) || writtenAt(a).stamp.localeCompare(writtenAt(b).stamp) || writtenAt(a).order - writtenAt(b).order)
}
const recordDay = (id: string) => { const m = /^c-(\d{4})(\d{2})(\d{2})-/.exec(id); return m ? `${m[1]}-${m[2]}-${m[3]}` : '' }

function newestFirst(items: WorkRecordItem[]): WorkRecordItem[] {
  return items.map((item) => ({ item, ...writtenAt(item) })).sort((a, b) =>
    b.stamp.localeCompare(a.stamp)
    // 두 파일 사이의 같은 시각은 실제 순서를 알 수 없다. 기록을 먼저 두고 각 파일의 적힌 순서를 쓴다.
    || Number(b.item.kind === 'record') - Number(a.item.kind === 'record')
    || b.order - a.order,
  ).map(({ item }) => item)
}

/**
 * 프로젝트 기록과 예전 일지 메모를 함께, 그다음 노트별로 모은다. 각 묶음 안에서는 최근 것이 먼저다.
 * 할 일은 끝내지 않은 것만 (끝내면 작업 일지에 완료로 남는다)
 */
export function workRecordGroups(files: RecordFile[], journal: JournalEntry[], filter: RecordFilter): WorkRecordGroup[] {
  const project: WorkRecordGroup = { target: 'project', title: t('이 프로젝트', 'This project'), items: [] }
  const notes: WorkRecordGroup[] = []
  const order = filter === '할 일' ? byDue : newestFirst
  for (const file of files) {
    const items: WorkRecordItem[] = file.comments.filter((entry) => recordKind(entry) === filter && !(filter === '할 일' && entry.state === '끝냄')).map((entry) => ({ kind: 'record', file, entry }))
    if (file.target === 'project') project.items.push(...items)
    else if (items.length) notes.push({ target: file.target, title: file.title, items: order(items) })
  }
  if (filter === '메모') {
    project.items.push(...journal.filter((entry) => entry.kind === 'memo').map((entry): WorkRecordItem => ({ kind: 'journal', entry })))
  }
  return project.items.length ? [{ ...project, items: order(project.items) }, ...notes] : notes
}
