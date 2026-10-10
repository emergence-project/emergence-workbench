import { isBlockStatus, STATUS_LABEL, type BlockStatus } from '@rw/core'
import type { ProjectColor } from '@rw/core/contract/research'
import { t } from './i18n'


export function statusOf(s: string | undefined): BlockStatus {
  return isBlockStatus(s) ? s : 'in-progress'
}

export function statusLabel(s: string | undefined): string {
  return STATUS_LABEL[statusOf(s)]
}

/** "방금", "10분 전", "3시간 전", "어제", "9/27" */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('방금', 'just now')
  if (min < 60) return t(`${min}분 전`, `${min} min ago`)
  const d = new Date(ms)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return t(`${Math.floor(min / 60)}시간 전`, `${Math.floor(min / 60)} h ago`)
  const yesterday = new Date(now - 86_400_000)
  if (d.toDateString() === yesterday.toDateString()) return t('어제', 'yesterday')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 일지 날짜(YYYY-MM-DD)와 시각을 "오늘 14:20", "어제 09:05", "9/27" 식으로 */
export function journalWhen(date: string, time: string, now = new Date()): string {
  const today = localDate(now)
  const yesterday = localDate(new Date(now.getTime() - 86_400_000))
  if (date === today) return t(`오늘 ${time}`, `today ${time}`)
  if (date === yesterday) return t(`어제 ${time}`, `yesterday ${time}`)
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 왼쪽 띠의 프로젝트 버튼 글자: 단어 머리글자 두 개 (alpha-project → AP), 한글이면 첫 글자 */
export function initials(title: string): string {
  const words = title.replace(/[—–:(].*$/, '').split(/[\s\-_]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (/^[가-힣]/.test(words[0]!)) return words[0]!.slice(0, 1)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)).toUpperCase()
}

/** 프로젝트 색 (research 계약의 PROJECT_COLORS). 상태 색(진행·막힘·해결)과 겹치지 않는 것만. 주황은 "사용자 차례"와 헷갈려 뺐다 (10/10 12:56) */
export const PROJECT_COLOR_HEX: Record<ProjectColor, string> = { indigo: '#4f46e5', violet: '#7c3aed', cyan: '#0e7490', pink: '#be185d', teal: '#0f766e', purple: '#9333ea', slate: '#475569' } // 디자인 예외: 프로젝트 아바타 색은 데이터 (design-system.md 색 표)
export const PROJECT_COLOR_LABEL: Record<ProjectColor, string> = { indigo: t('남색', 'Indigo'), violet: t('보라', 'Violet'), cyan: t('청록', 'Cyan'), pink: t('자홍', 'Pink'), teal: t('초록', 'Teal'), purple: t('연보라', 'Purple'), slate: t('회청', 'Slate') }
const ORDER = Object.keys(PROJECT_COLOR_HEX) as ProjectColor[]
const preferred = (id: string): ProjectColor => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ORDER[h % ORDER.length]!
}
let assigned = new Map<string, ProjectColor>()
/**
 * 프로젝트 목록을 받을 때마다 색을 다시 정한다 (App이 부른다). 고른 색은 그대로, 자동은 id에서 정한 색이되
 * 다른 프로젝트가 이미 쓰는 색이면 다음 색으로 (일곱 색이 다 쓰였으면 겹친다). 자동은 id 순서로 정해 목록 순서를 바꿔도 색이 그대로다.
 */
export function setProjectColors(list: { id: string; color?: ProjectColor }[]): void {
  const next = new Map<string, ProjectColor>()
  const taken = new Set<ProjectColor>()
  for (const r of list) if (r.color) { next.set(r.id, r.color); taken.add(r.color) }
  for (const r of [...list].filter((x) => !x.color).sort((a, b) => a.id.localeCompare(b.id))) {
    const start = ORDER.indexOf(preferred(r.id))
    const free = ORDER.map((_, i) => ORDER[(start + i) % ORDER.length]!).find((c) => !taken.has(c))
    const c = free ?? preferred(r.id)
    next.set(r.id, c); taken.add(c)
  }
  assigned = next
}
/** 그 프로젝트의 색 (setProjectColors 전이면 id에서 정한 색) */
export function projectColor(id: string, chosen?: ProjectColor | null): string {
  return PROJECT_COLOR_HEX[chosen ?? assigned.get(id) ?? preferred(id)]
}
/** 자동이면 무슨 색이 될지 (고치기 창의 "자동" 점): 이 프로젝트의 고른 색을 뺀 목록으로 다시 정한 색 */
export function autoProjectColor(id: string, list: { id: string; color?: ProjectColor }[]): string {
  const saved = assigned
  setProjectColors(list.map((r) => (r.id === id ? { id: r.id } : r)))
  const c = projectColor(id)
  assigned = saved
  return c
}
