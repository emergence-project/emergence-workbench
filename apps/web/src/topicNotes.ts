// 주제 화면의 노트 고르기 · 순서 (순수 함수, Topics.tsx TopicPage)
import type { BlockStatus } from '@rw/core'
import type { NoteRow } from './api'
import { LOOSE_TOPIC_ID } from './noteKinds'
import { t } from './i18n'

/** 주제 화면의 노트 정렬 (10/5 시안): 최근 작업 · 상태 · 이름. ★는 어느 정렬에서도 앞 */
export type NoteSort = 'recent' | 'status' | 'name'
export const SORTS: { id: NoteSort; label: string }[] = [{ id: 'recent', label: t('최근 작업', 'Recent') }, { id: 'status', label: t('상태', 'Status') }, { id: 'name', label: t('이름', 'Name') }]
export const STATUS_ORDER: BlockStatus[] = ['in-progress', 'blocked', 'solved', 'stopped']
export const isClosed = (s: BlockStatus) => s === 'solved' || s === 'stopped'

/** 노트 카드 순서: ★ 먼저, 그다음 고른 정렬 */
export function sortNotes(list: NoteRow[], sort: NoteSort): NoteRow[] {
  const by = (a: NoteRow, b: NoteRow) => sort === 'name' ? a.title.localeCompare(b.title, 'ko')
    : sort === 'status' ? STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.mtime - a.mtime
      : b.mtime - a.mtime
  return [...list].sort((a, b) => Number(b.star) - Number(a.star) || by(a, b))
}

/** 이 주제의 노트 (여러 주제에 든 노트는 든 모든 주제에). "노트들"이면 주제 없는 노트 */
export function notesOfTopic(tid: string, notes: NoteRow[], topicIds: string[]): NoteRow[] {
  if (tid === LOOSE_TOPIC_ID) return notes.filter((n) => !n.topics.some((t) => topicIds.includes(t)))
  return notes.filter((n) => n.topics.includes(tid))
}

/** 첫 화면 주제 카드 정렬 (10/5 시안 "주제 카드"): 최근 작업 · 상태 · 이름. ★는 어느 정렬에서도 앞 */
export interface TopicSortable { title: string; star: boolean; updated?: number; byStatus: Partial<Record<BlockStatus, number>> }
/** 주제의 상태 순위: 가장 앞선 상태(진행 → 멈춤 → 해결 → 폐기)의 노트가 있는 것부터, 노트가 없으면 맨 뒤 */
const topicRank = (t: TopicSortable) => { const i = STATUS_ORDER.findIndex((s) => (t.byStatus[s] ?? 0) > 0); return i < 0 ? STATUS_ORDER.length : i }
export function sortTopics<T extends TopicSortable>(list: T[], sort: NoteSort): T[] {
  const recent = (a: T, b: T) => (b.updated ?? 0) - (a.updated ?? 0)
  const by = (a: T, b: T) => sort === 'name' ? a.title.localeCompare(b.title, 'ko')
    : sort === 'status' ? topicRank(a) - topicRank(b) || recent(a, b)
      : recent(a, b)
  return [...list].sort((a, b) => Number(b.star) - Number(a.star) || by(a, b))
}

/** 첫 화면 "노트" 섹션 (10/5 두 번째 논의): 최근 손댄 노트의 기간과 정렬 */
export type NotePeriod = 'today' | 'week' | 'all'
export const PERIODS: { id: NotePeriod; label: string }[] = [{ id: 'today', label: t('오늘', 'Today') }, { id: 'week', label: t('이번 주', 'This week') }, { id: 'all', label: t('전체', 'All') }]
export type RecentSort = 'recent' | 'name'
export const RECENT_SORTS: { id: RecentSort; label: string }[] = [{ id: 'recent', label: t('최신순', 'Newest') }, { id: 'name', label: t('이름', 'Name') }]

/** 기간의 시작 시각: 오늘 0시, 이번 주 월요일 0시 (이 컴퓨터 시간대) */
export function periodStart(period: NotePeriod, now = new Date()): number {
  if (period === 'all') return 0
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
export const notesInPeriod = (notes: NoteRow[], period: NotePeriod, now = new Date()) => {
  const from = periodStart(period, now)
  return notes.filter((n) => n.mtime >= from)
}
/** 최근 손댄 노트 순서: ★ 먼저, 그다음 최신순 또는 이름 */
export const sortRecent = (list: NoteRow[], sort: RecentSort) => sortNotes(list, sort === 'name' ? 'name' : 'recent')

/** 폭 W인 카드 격자(카드 폭 card, 사이 gap)에 한 줄에 들어가는 카드 수 (적어도 1) */
export const gridColumns = (W: number, card = 184, gap = 14) => Math.max(1, Math.floor((W + gap) / (card + gap)))
