import { isBlockStatus, STATUS_LABEL, type BlockStatus } from '@rw/core'
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

/** 프로젝트마다 고정된 색 (id에서). 상태 색(진행·막힘·해결)과 겹치지 않는 것만 */
const PROJECT_COLORS = ['#4f46e5', '#7c3aed', '#0e7490', '#be185d', '#0f766e', '#9333ea', '#475569', '#b45309'] // 디자인 예외: 프로젝트 아바타 색은 데이터 (design-system.md 색 표)
export function projectColor(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PROJECT_COLORS[h % PROJECT_COLORS.length]!
}
