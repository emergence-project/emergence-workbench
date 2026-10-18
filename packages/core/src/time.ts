// 현지 시각의 날짜·시각 문자열 (서버와 화면이 함께 쓴다, 10/18 한 곳으로 모음).
// 저장되는 모양은 갈래마다 다르다. 모양을 바꾸면 이미 쓴 파일을 읽는 코드가 어긋나니 그대로 둔다.

const two = (n: number) => String(n).padStart(2, '0')

/** 현지 날짜 YYYY-MM-DD */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** 현지 시각 HH:MM */
export function localTime(d = new Date()): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/**
 * 시각 도장. 갈래마다 저장된 모양:
 * - `space` `YYYY-MM-DD HH:MM`: 맡긴 일(tasks), 배운 말(learn)의 at
 * - `t` `YYYY-MM-DDTHH:MM`: 흐름 점의 판정, 피드백 답·코멘트
 * - `compact` `YYYYMMDD-HHMM`: 기록 id(`c-…`)·배운 말 id(`l-…`)의 몸
 */
export type StampKind = 'space' | 't' | 'compact'
export function stamp(kind: StampKind, d = new Date()): string {
  const date = localDate(d)
  const time = localTime(d)
  if (kind === 'space') return `${date} ${time}`
  if (kind === 't') return `${date}T${time}`
  return compactStamp(date, time)
}

/** 이미 있는 YYYY-MM-DD와 HH:MM(일지 항목 등)을 `YYYYMMDD-HHMM`으로. time을 빼면 `YYYYMMDD-` (id 앞부분 찾기) */
export function compactStamp(date: string, time?: string): string {
  return `${date.replace(/-/g, '')}-${time === undefined ? '' : time.replace(':', '')}`
}
