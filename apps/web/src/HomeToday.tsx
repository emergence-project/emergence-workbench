import { daysBetween, type TodayRow } from './homeData'

/** 이만큼 손대지 않으면 카드 이름 옆에 알린다 */
export const IDLE_DAYS = 7

export function idleDays(row: TodayRow, today: string): number | null {
  const d = row.lastActive ? daysBetween(row.lastActive, today) : null
  return d !== null && d >= IDLE_DAYS ? d : null
}
