import type { FeedbackItem } from './contract/feedback.js'

/**
 * 실수에서 배우기 (2026-10-16 사용자 "실험적으로 도입해보자"): 반려된 처리를 다시 처리하는 에이전트가
 * status.yaml revised에 까닭(miss)과 한 줄 교훈(lesson)을 적고, 여기서 최근 것을 센다.
 * pnpm agent:feedback이 처음에 보이므로 다음 세션의 에이전트가 같은 실수를 되풀이하지 않게 한다.
 * 규칙으로 만들지는 사용자가 정한다 (같은 까닭이 RULE_AT번 넘게 쌓이면 규칙을 제안하라고만 알린다).
 */
/** 반려된 까닭 (status.yaml revised의 miss). 앞의 셋이 에이전트의 실수, 새 요구 · 논의는 실수가 아니다 */
export const FEEDBACK_MISSES = ['답 불분명', '덜 고침', '잘못 읽음', '새 요구', '논의'] as const
export type FeedbackMiss = (typeof FEEDBACK_MISSES)[number]
export const MISTAKES: readonly FeedbackMiss[] = ['답 불분명', '덜 고침', '잘못 읽음']
export const LESSON_DAYS = 30
export const RULE_AT = 3
/** 까닭을 적기 시작한 날: 그 전의 다시 처리는 "까닭 없음"으로 세지 않는다 */
export const MISS_SINCE = '2026-10-16'

export interface FeedbackLessons {
  days: number
  /** 기간 안에 반려를 다시 처리한 수와 까닭별 수 (FEEDBACK_MISSES 순서, 0은 뺀다). 진행을 처리한 것은 세지 않는다 */
  reworks: number
  counts: { miss: FeedbackMiss; n: number }[]
  /** 까닭을 적지 않은 다시 처리 (MISS_SINCE 뒤) */
  unlabeled: number
  /** 최근 반려, 새것부터: 실수 까닭이면 에이전트의 교훈, 까닭이 없으면 사용자가 돌려보낸 말. 새 요구 · 논의는 뺀다 */
  lessons: { at: string; key: string; miss?: FeedbackMiss; lesson?: string; said?: string }[]
  /** 기간 안에 RULE_AT번 넘게 쌓인 실수 까닭 */
  ruleCandidates: { miss: FeedbackMiss; n: number }[]
}

const dayMs = 86_400_000

export function feedbackLessons(items: Pick<FeedbackItem, 'key' | 'status' | 'review'>[], now = Date.now(), days = LESSON_DAYS, maxLessons = 3): FeedbackLessons {
  const from = now - days * dayMs
  const count = new Map<FeedbackMiss, number>()
  const lessons: FeedbackLessons['lessons'] = []
  let reworks = 0, unlabeled = 0
  for (const e of items) {
    // 사용자의 답 (reviews.yaml): revised의 at이 그 처리를 돌려보낸 답의 시각이다
    const said = new Map<string, { verdict: string; note?: string }>()
    for (const v of [...(e.review?.history ?? []), ...(e.review ? [e.review] : [])]) said.set(v.at, v)
    for (const r of e.status?.revised ?? []) {
      const t = Date.parse(r.at)
      if (!Number.isFinite(t) || t < from || t > now + dayMs) continue
      if (said.get(r.at)?.verdict !== '반려') continue
      reworks++
      const note = said.get(r.at)?.note?.trim()
      if (!r.miss) {
        if (r.at >= MISS_SINCE) unlabeled++
        if (note) lessons.push({ at: r.at, key: e.key, said: note })
        continue
      }
      count.set(r.miss, (count.get(r.miss) ?? 0) + 1)
      if (MISTAKES.includes(r.miss)) lessons.push({ at: r.at, key: e.key, miss: r.miss, ...(r.lesson && { lesson: r.lesson }), ...(note && { said: note }) })
    }
  }
  lessons.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  // 합친 항목은 같은 반려가 여러 기록에 남는다: 같은 말은 한 번만
  const seen = new Set<string>()
  const unique = lessons.filter((x) => { const k = x.lesson ?? x.said ?? x.at; if (seen.has(k)) return false; seen.add(k); return true })
  const counts = FEEDBACK_MISSES.filter((m) => count.get(m)).map((miss) => ({ miss, n: count.get(miss)! }))
  return {
    days, reworks, counts, unlabeled,
    lessons: unique.slice(0, maxLessons),
    ruleCandidates: counts.filter((c) => MISTAKES.includes(c.miss) && c.n >= RULE_AT),
  }
}

/** pnpm agent:feedback의 절 (한국어: 처리 기록과 같은 말). 다시 처리한 반려가 없으면 빈 글 */
export function feedbackLessonsText(l: FeedbackLessons): string {
  if (!l.reworks) return ''
  const clip = (s: string, n = 110) => { const x = s.replace(/\s+/g, ' '); return x.length > n ? `${x.slice(0, n - 1)}…` : x }
  const out = [`## 최근 ${l.days}일 돌려받은 까닭 (다시 처리한 반려 ${l.reworks})`, '']
  out.push(`- ${l.counts.map((c) => `${c.miss} ${c.n}`).join(' · ') || '까닭을 적은 것 없음'}${l.unlabeled ? ` · 까닭 없음 ${l.unlabeled}` : ''}`)
  for (const x of l.lessons) {
    out.push(x.lesson ? `- 교훈 (${x.miss}): ${clip(x.lesson)}` : x.miss ? `- ${x.miss} (교훈 없음): 사용자 "${clip(x.said ?? '', 80)}"` : `- 사용자가 돌려보낸 말: "${clip(x.said ?? '', 90)}"`)
  }
  for (const c of l.ruleCandidates) out.push(`- 규칙 후보: "${c.miss}" ${c.n}번 — 같은 실수를 막는 규칙 한 문장을 사용자에게 제안한다(정하는 것은 사용자)`)
  out.push('', '> 반려를 다시 처리할 때 그 revised에 `miss`(답 불분명 · 덜 고침 · 잘못 읽음 · 새 요구 · 논의)와 `lesson`(다음엔 이렇게, 한 줄)을 적는다.', '')
  return out.join('\n')
}
