import { RESEARCH_TARGET, todoDue, type JournalEntry } from '@rw/core'
import type { ResearchListItem, ResearchSummary } from './api'
import { localDate } from './format'
import { t } from './i18n'

/** 홈이 연구마다 읽어 두는 것: 개괄 요약과 최근 1년 일지 */
export interface Loaded { summary: ResearchSummary; entries: JournalEntry[] }

/** 일지는 최근 것부터 온다. 할 일은 먼저 적은 것이 위로 오게 뒤집는다 (계획 순서) */
export const oldestFirst = (todos: JournalEntry[]) => [...todos].reverse()

/** 화면에 따로 날짜가 보이므로 글 앞의 "10/20까지 —"를 뗀다 */
const DUE_PREFIX = /^\s*(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2})(?:까지)?\s*[—–:·-]?\s*/
export const stripDue = (text: string) => text.replace(DUE_PREFIX, '') || text

const DAY = 86_400_000
/** YYYY-MM-DD 두 날짜 사이 날 수 (b - a) */
export function daysBetween(a: string, b: string): number {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.round((t(b) - t(a)) / DAY)
}
export const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

/** 한 일 달력의 요일 머리: 주는 일요일에 시작한다 (10/5 10:56 "일요일이 월요일 앞에") */
export const WEEK_DAYS = [t('일', 'Sun'), t('월', 'Mon'), t('화', 'Tue'), t('수', 'Wed'), t('목', 'Thu'), t('금', 'Fri'), t('토', 'Sat')] as const
/** date가 든 주의 첫날(일요일), 그날 0시 */
export function weekStartOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}

/** 할 일 하나: 일지의 [ ] 줄. 마감은 글 앞 날짜에서 */
export interface OpenTodo { key: string; entry: JournalEntry; due: string | null; text: string; where: string | null }
/** 그다음: 진행 중인 가지 끝 작업노트의 "다음 할 일", 또는 재개 조건이 적힌 막힌 작업노트 */
export interface NextStep { key: string; bid: string; title: string; text: string; blocked: boolean }

export interface TodayRow {
  r: ResearchListItem
  todos: OpenTodo[]
  next: NextStep[]
  /** 마지막으로 손댄 날 (블록 수정·일지 기록 중 가장 최근) */
  lastActive: string | null
}

export function todayRow(r: ResearchListItem, l: Loaded): TodayRow {
  const byId = new Map(l.summary.blocks.map((b) => [b.id, b]))
  const open = oldestFirst(l.entries.filter((e) => e.kind === 'todo' && !e.done)).map((entry) => {
    const due = todoDue(entry.text, entry.date)
    return {
      key: `${entry.date}-${entry.index}`, entry, due, text: due ? stripDue(entry.text) : entry.text,
      where: entry.target === RESEARCH_TARGET ? null : byId.get(entry.target)?.title ?? entry.target.split('/').pop()!,
    }
  })
  // 마감이 있는 것을 가까운 순으로 먼저, 나머지는 적은 순서대로
  const todos = [...open.filter((t) => t.due).sort((a, b) => a.due!.localeCompare(b.due!)), ...open.filter((t) => !t.due)]
  const next: NextStep[] = [
    ...l.summary.tree.frontier.flatMap((id) => {
      const b = byId.get(id)
      return b?.next ? [{ key: `n-${id}`, bid: id, title: b.title ?? id, text: b.next, blocked: false }] : []
    }),
    ...l.summary.blocks.filter((b) => b.status === 'blocked' && b.resumeCondition).map((b) => ({
      key: `b-${b.id}`, bid: b.id, title: b.title ?? b.id, text: b.resumeCondition!, blocked: true,
    })),
  ]
  const blockDays = l.summary.blocks.map((b) => localDate(new Date(b.mtime)))
  const lastActive = [...blockDays, ...l.entries.map((e) => e.date)].sort().pop() ?? null
  return { r, todos, next, lastActive }
}

/** 표의 줄 순서: 할 일이 있는 줄 → 가까운 마감 → 최근에 손댄 순. 할 일도 그다음도 없는 줄은 맨 아래 */
export function sortRows(rows: TodayRow[]): TodayRow[] {
  const empty = (x: TodayRow) => x.todos.length === 0 && x.next.length === 0
  const firstDue = (x: TodayRow) => x.todos.find((t) => t.due)?.due ?? '9999'
  return [...rows].sort((a, b) =>
    Number(empty(a)) - Number(empty(b)) || firstDue(a).localeCompare(firstDue(b)) || (b.lastActive ?? '').localeCompare(a.lastActive ?? ''))
}

/** 한 일 달력의 기록 하나 */
export interface DoneEvent { key: string; kind: 'done' | 'memo' | 'status' | 'edit'; text: string; time: string }
export interface DayGroup { rid: string; title: string; color: number; events: DoneEvent[] }

/** 연구마다 정해진 색 번호 (등록 순서) */
export const colorOf = (researches: ResearchListItem[], rid: string) => Math.max(0, researches.findIndex((r) => r.id === rid)) % 6

/**
 * 날짜별 한 일: 일지의 완료·메모·상태 기록과 블록 마지막 수정.
 * 블록은 마지막 수정 시각만 알 수 있으므로 그날 하루에만 "수정"으로 올라간다.
 */
export function doneByDay(researches: ResearchListItem[], loaded: Record<string, Loaded | Error>): Map<string, DayGroup[]> {
  const out = new Map<string, DayGroup[]>()
  const push = (date: string, r: ResearchListItem, ev: DoneEvent) => {
    const groups = out.get(date) ?? []
    let g = groups.find((x) => x.rid === r.id)
    if (!g) { g = { rid: r.id, title: r.title, color: colorOf(researches, r.id), events: [] }; groups.push(g) }
    g.events.push(ev)
    out.set(date, groups)
  }
  for (const r of researches) {
    const l = loaded[r.id]
    if (!l || l instanceof Error) continue
    for (const e of l.entries) {
      if (e.kind === 'todo') continue
      const first = e.text.split('\n').find((x) => x.trim()) ?? ''
      push(e.date, r, { key: `${e.date}-${e.index}`, kind: e.kind, text: e.kind === 'done' ? stripDue(first) : first, time: e.time })
    }
    for (const b of l.summary.blocks) {
      const d = new Date(b.mtime)
      push(localDate(d), r, { key: `edit-${b.id}`, kind: 'edit', text: t(`${b.title ?? b.id} 수정`, `Edited ${b.title ?? b.id}`), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })
    }
  }
  for (const groups of out.values()) for (const g of groups) g.events.sort((a, b) => a.time.localeCompare(b.time))
  return out
}

/** 마감: 끝내지 않은 할 일의 글 앞 날짜 */
export interface Deadline { key: string; due: string; text: string; rid: string; title: string; color: number }
export function deadlines(researches: ResearchListItem[], loaded: Record<string, Loaded | Error>): Deadline[] {
  return researches.flatMap((r) => {
    const l = loaded[r.id]
    if (!l || l instanceof Error) return []
    return l.entries.filter((e) => e.kind === 'todo' && !e.done).flatMap((e) => {
      const due = todoDue(e.text, e.date)
      return due ? [{ key: `${r.id}-${e.date}-${e.index}`, due, text: stripDue(e.text), rid: r.id, title: r.title, color: colorOf(researches, r.id) }] : []
    })
  })
}

const KIND_MARK: Record<DoneEvent['kind'], string> = { done: '✓', edit: '✎', memo: '·', status: '⇄' }
export const markOf = (k: DoneEvent['kind']) => KIND_MARK[k]

/** 브리핑 복사: 고른 날들의 한 일을 연구별로 묶어 글로 */
export function briefing(days: string[], byDay: Map<string, DayGroup[]>): string {
  const per = new Map<string, string[]>()
  for (const d of days) {
    for (const g of byDay.get(d) ?? []) {
      const lines = per.get(g.title) ?? []
      for (const e of g.events) lines.push(`${shortDate(d)} ${markOf(e.kind)} ${e.text}`)
      per.set(g.title, lines)
    }
  }
  if (per.size === 0) return ''
  const range = days.length > 1 ? `${shortDate(days[0]!)}–${shortDate(days[days.length - 1]!)}` : shortDate(days[0]!)
  return [t(`한 일 (${range})`, `Done (${range})`), ...[...per].map(([t, lines]) => `\n${t}\n${lines.map((l) => `- ${l}`).join('\n')}`)].join('\n')
}
