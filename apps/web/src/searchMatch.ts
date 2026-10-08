/**
 * 전역 검색의 찾기: 찾는 말을 띄어쓰기로 나눠 모두 들어 있는 것만, 이름이 그 말로 시작하면 앞에.
 * 대소문자와 악센트는 가리지 않는다.
 */
export const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** 점수가 낮을수록 앞. 맞지 않으면 null. 0: 이름이 찾는 말로 시작, 1: 이름에 있음, 2: 다른 글(다른 이름·파일·프로젝트)에만 있음 */
export function matchScore(q: string, title: string, also = ''): number | null {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const t = fold(title)
  const all = `${t} ${fold(also)}`
  if (!words.every((w) => all.includes(w))) return null
  const whole = fold(q).trim()
  if (t.startsWith(whole)) return 0
  if (words.every((w) => t.includes(w))) return 1
  return 2
}

/** 맞는 것만 점수 순으로 (같은 점수는 원래 순서), 앞에서 limit개 */
export function rank<T>(items: T[], q: string, text: (x: T) => [string, string?], limit: number): T[] {
  const scored: { x: T; s: number; i: number }[] = []
  items.forEach((x, i) => {
    const [title, also] = text(x)
    const s = matchScore(q, title, also)
    if (s !== null) scored.push({ x, s, i })
  })
  return scored.sort((a, b) => a.s - b.s || a.i - b.i).slice(0, limit).map((r) => r.x)
}
