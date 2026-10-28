import { todoDue, type JournalEntry } from '@rw/core'
import type { CommentEntry, RecordFile } from './api/comments'
import { isTalkKind, isUserTurnRecord, recordKind } from './recordsPanelHelpers'
import { t } from './i18n'
import { recordDay } from './format'
import { kindLabel, type RecordFilter } from './recordLabels'

export type { RecordFilter } from './recordLabels'

/** 작업 탭과 기록 탭의 필터 (10/7 작업 탭: 판단 · 맡긴 일을 앞에 더함) */
export const WORK_FILTERS = ['판단', '맡긴 일', '전체', '할 일', '메모', '질문', '지시'] as const
export type WorkFilter = typeof WORK_FILTERS[number]
/** 기록 › 모두의 종류: 전체 · 메모 · 할 일 · 질문 · 지시 · 맡긴 일 (10/15 지시를 더함, 10/21 작업 탭을 합쳐 맡긴 일도, 10/22 12:09 전체: 노트마다 적은 기록을 종류 없이 한 목록에). work는 옛 작업 탭에 저장된 값을 읽을 때만 */
export type WorkSection = 'work' | 'records'
export const SECTION_FILTERS: Record<WorkSection, readonly WorkFilter[]> = { work: ['판단', '맡긴 일'], records: ['전체', '메모', '할 일', '질문', '지시', '맡긴 일'] }
/** 필터의 화면 이름 (값은 한국어 그대로 저장한다) */
export const WORK_FILTER_LABEL = Object.fromEntries(WORK_FILTERS.map((f) => [f, kindLabel(f)])) as Record<WorkFilter, string>
export const isRecordFilter = (f: WorkFilter): f is RecordFilter => f === '할 일' || f === '메모' || f === '질문' || f === '지시'
export const WORK_FILTER_KEY: Record<WorkSection, string> = { work: 'rw-work-filter', records: 'rw-records-filter' }

/** 기록 탭을 그 필터로 연다 (10/14 13:33 제안: 오른쪽 사이드바 기록의 "모두 보기"). 이미 열린 기록 탭도 바뀐다 */
export const WORK_FILTER_EVENT = 'rw-records-filter'
export function chooseRecordFilter(f: RecordFilter | '전체') {
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

/** 그 탭의 필터가 아니면 그 탭의 첫 필터 (작업은 판단, 기록은 전체) */
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

/** 전체에 넣는 기록: 하이라이트는 노트 위의 칠로 보이므로 뺀다 (오른쪽 사이드바 전체와 같음) */
const keptInAll = (entry: CommentEntry) => entry.kind !== '하이라이트'

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
 * 할 일은 끝내지 않은 것만 (끝내면 작업 일지에 완료로 남는다). 전체는 종류와 상태를 가리지 않고 모두 (하이라이트만 빼고, 오른쪽 사이드바 전체와 같게)
 */
export function workRecordGroups(files: RecordFile[], journal: JournalEntry[], filter: RecordFilter | '전체'): WorkRecordGroup[] {
  const project: WorkRecordGroup = { target: 'project', title: t('이 프로젝트', 'This project'), items: [] }
  const notes: WorkRecordGroup[] = []
  const order = filter === '할 일' ? byDue : newestFirst
  for (const file of files) {
    const items: WorkRecordItem[] = file.comments.filter((entry) => filter === '전체' ? keptInAll(entry) : recordKind(entry) === filter && !(filter === '할 일' && entry.state === '끝냄')).map((entry) => ({ kind: 'record', file, entry }))
    if (file.target === 'project') project.items.push(...items)
    else if (items.length) notes.push({ target: file.target, title: file.title, items: order(items) })
  }
  if (filter === '메모' || filter === '전체') {
    project.items.push(...journal.filter((entry) => entry.kind === 'memo').map((entry): WorkRecordItem => ({ kind: 'journal', entry })))
  }
  return project.items.length ? [{ ...project, items: order(project.items) }, ...notes] : notes
}

/**
 * 기록 화면의 보기 (10/21 사용자 결정 "작업 탭을 기록 안으로"): 내 차례 · 에이전트 차례 · 모두.
 * 원본은 그대로(기록 = workbench/comments, 맡긴 일 = workbench/tasks)이고 화면만 합친다
 */
export const RECORD_VIEWS = ['mine', 'agent', 'all'] as const
export type RecordView = typeof RECORD_VIEWS[number]

export interface FlatRecord { file: RecordFile; entry: CommentEntry }

const flatRecords = (files: RecordFile[], keep: (entry: CommentEntry) => boolean): FlatRecord[] =>
  files.flatMap((file) => file.comments.filter(keep).map((entry) => ({ file, entry })))
const oldestFirst = (items: FlatRecord[]) => [...items].sort((a, b) => writtenAt({ kind: 'record', ...a }).stamp.localeCompare(writtenAt({ kind: 'record', ...b }).stamp))

/** 내 차례의 기록: 에이전트가 물은 질문 · 지시가 대기 (오래 기다린 것부터) */
export const userTurnRecords = (files: RecordFile[]) => oldestFirst(flatRecords(files, isUserTurnRecord))
/** 에이전트 차례의 기록: 사용자가 쓴 질문 · 지시가 대기 (오래 기다린 것부터) */
export const agentTurnRecords = (files: RecordFile[]) => oldestFirst(flatRecords(files, (e) => isTalkKind(recordKind(e)) && !e.by && e.state === '대기'))
/** 남은 할 일 (마감이 이른 것부터, 서버 openTodos와 같은 차례) */
export const openTodoRecords = (files: RecordFile[]): FlatRecord[] =>
  byDue(flatRecords(files, (e) => recordKind(e) === '할 일' && e.state !== '끝냄').map((r): WorkRecordItem => ({ kind: 'record', ...r })))
    .flatMap((item) => item.kind === 'record' ? [{ file: item.file, entry: item.entry }] : [])
/** 접힌 줄에 보일 한 줄: 글의 첫 줄, 글이 없으면 인용 */
export const recordLine = (entry: Pick<CommentEntry, 'body' | 'quote'>) => (entry.body.trim() || entry.quote?.trim() || '').split('\n')[0]!.trim()

/** 기록이 달린 곳의 갈래 (10/22 12:09 안 C, 10/28: 노트만이 아니라 프로젝트 · 주제 · 원고 · 흐름 점에도 달린다) */
export const PLACE_KINDS = ['project', 'topic', 'note', 'manuscript', 'flow', 'other'] as const
export type PlaceKind = typeof PLACE_KINDS[number]
export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  project: t('프로젝트', 'Project'), topic: t('주제', 'Topics'), note: t('노트', 'Notes'),
  manuscript: t('원고', 'Manuscript'), flow: t('흐름 점', 'Flow dots'), other: t('그 밖', 'Other'),
}
export function placeKind(target: string): PlaceKind {
  if (target === 'project') return 'project'
  if (target.startsWith('topic-')) return 'topic'
  if (target.startsWith('note-') || target.startsWith('calc-')) return 'note'
  if (target.startsWith('flow-')) return 'flow'
  if (target.startsWith('statement-') || target.startsWith('paper-')) return 'other'
  // manuscript, manuscript-<원고>, 원고의 장(장 id)
  return 'manuscript'
}

export interface RecordPlace { target: string; title: string; kind: PlaceKind; count: number; turn: number; latest: string }

/**
 * 기록 › 모두의 왼쪽 목록: 기록이 있는 곳만, 갈래 차례(프로젝트 · 주제 · 노트 · 원고 · 흐름 점 · 그 밖)로 묶고
 * 갈래 안에서는 최근에 기록이 생긴 곳이 위로. turn = 그곳의 내 차례(에이전트가 물은 질문 · 지시가 대기) 수
 */
export function recordPlaces(groups: WorkRecordGroup[]): RecordPlace[] {
  const places = groups.map((g): RecordPlace => ({
    target: g.target, title: g.title, kind: placeKind(g.target), count: g.items.length,
    turn: g.items.filter((item) => item.kind === 'record' && isUserTurnRecord(item.entry)).length,
    latest: g.items.reduce((max, item) => { const s = writtenAt(item).stamp; return s > max ? s : max }, ''),
  }))
  const rank = (k: PlaceKind) => PLACE_KINDS.indexOf(k)
  return places.sort((a, b) => rank(a.kind) - rank(b.kind) || b.latest.localeCompare(a.latest) || a.title.localeCompare(b.title))
}
