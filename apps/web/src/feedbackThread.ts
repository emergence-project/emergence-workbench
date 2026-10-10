import type { FeedbackItem, FeedbackVerdict } from './api'

/** 다시 처리하게 하는 답: 수정(자료 값 반려)과 진행(10/9) */
const sendsBack = (v: FeedbackVerdict | string) => v === '반려' || v === '진행'

/**
 * 처리와 승인·반려를 댓글처럼 시각순으로 (10/4 18:11 "반려한 지적을 댓글처럼 볼 수 있게").
 * status.yaml에는 마지막 처리(note·commit)만 있으므로, 다시 처리했으면(rework = 그 반려의 at) 그 글은 그 반려 뒤에 놓고
 * 첫 처리는 글 없이 남긴다. 반려 뒤에 다시 처리가 아직이면 끝에 "다시 처리 대기"를 붙인다.
 * revised가 있으면(10/8~) 처리마다 그때의 글이 남는다.
 */
export type ThreadStep =
  | { who: 'Claude'; kind: '처리' | '다시 처리'; note?: string; commit?: string; changes?: ThreadChange[]; at?: string; by?: string }
  | { who: '나'; kind: FeedbackVerdict | '코멘트'; at: string; note?: string; edited?: string }
  | { who: 'Claude'; kind: '답'; at: string; note: string; by?: string }
  | { who: 'Claude'; kind: '대기' }

/** 다시 처리하며 고친 칸 (10/8 11:28 대화 형식): "이해한 요구 고침: 예전 → 지금". 빈 배열이면 둘 다 그대로 */
export interface ThreadChange { field: 'understood' | 'cause'; from: string; to: string }

type Handling = { understood?: string; cause?: string; note?: string; commit?: string; handled_at?: string; by?: string }
const meta = (h: Handling) => ({ ...(h.handled_at && { at: h.handled_at }), ...(h.by && { by: h.by }) })
const FIELDS = ['understood', 'cause'] as const

const changesOf = (before: Handling, after: Handling): ThreadChange[] =>
  FIELDS.filter((f) => (before[f] ?? '') !== (after[f] ?? '')).map((f) => ({ field: f, from: before[f] ?? '', to: after[f] ?? '' }))

export function feedbackThread(e: Pick<FeedbackItem, 'status' | 'review'>): ThreadStep[] {
  const st = e.status
  if (!st) return []
  const verdicts = e.review ? [...(e.review.history ?? []), e.review] : []
  if (st.revised?.length) return revisedThread(st, verdicts)
  const reworkAt = st.rework && verdicts.some((v) => sendsBack(v.verdict) && v.at === st.rework) ? st.rework : undefined
  const out: ThreadStep[] = [reworkAt ? { who: 'Claude', kind: '처리' } : { who: 'Claude', kind: '처리', ...(st.note && { note: st.note }), ...(st.commit && { commit: st.commit }), ...meta(st) }]
  let placed = false
  for (const v of verdicts) {
    out.push(mine(v))
    if (!placed && sendsBack(v.verdict) && v.at === reworkAt) {
      placed = true
      out.push({ who: 'Claude', kind: '다시 처리', ...(st.note && { note: st.note }), ...(st.commit && { commit: st.commit }), ...meta(st) })
    }
  }
  const last = verdicts.at(-1)
  if (last && sendsBack(last.verdict) && last.at !== reworkAt) out.push({ who: 'Claude', kind: '대기' })
  return out
}

/**
 * revised(다시 처리하기 전의 처리들)가 있으면 처리마다 그 글을 보인다: revised[k]는 revised[k].at의 반려가 되돌려 보낸 처리,
 * 지금 칸(understood · cause · note · commit)이 마지막 처리. 다시 처리마다 앞 처리와 달라진 칸을 붙인다.
 */
type Verdict = { verdict: FeedbackVerdict; at: string; note?: string; edited?: string }
const mine = (v: Verdict): ThreadStep => ({ who: '나', kind: v.verdict, at: v.at, ...(v.note && { note: v.note }), ...(v.edited && { edited: v.edited }) })
const handlingsOf = (st: NonNullable<FeedbackItem['status']>): Handling[] =>
  [...(st.revised ?? []), { understood: st.understood, cause: st.cause, note: st.note, commit: st.commit, handled_at: st.handled_at, by: st.by }]

function revisedThread(st: NonNullable<FeedbackItem['status']>, verdicts: Verdict[]): ThreadStep[] {
  const revised = st.revised!
  const handlings = handlingsOf(st)
  const step = (k: number): ThreadStep => {
    const h = handlings[k]!
    return { who: 'Claude', kind: k ? '다시 처리' : '처리', ...(h.note && { note: h.note }), ...(h.commit && { commit: h.commit }), ...(k > 0 && { changes: changesOf(handlings[k - 1]!, h) }), ...meta(h) }
  }
  const out: ThreadStep[] = [step(0)]
  let next = 1
  for (const v of verdicts) {
    out.push(mine(v))
    if (next < handlings.length && sendsBack(v.verdict) && v.at === revised[next - 1]!.at) out.push(step(next++))
  }
  // 기록이 어긋나도(반려 기록이 없는 다시 처리) 처리 글은 잃지 않는다
  while (next < handlings.length) out.push(step(next++))
  const last = out.at(-1)
  if (last?.who === '나' && sendsBack(last.kind)) out.push({ who: 'Claude', kind: '대기' })
  return out
}

/**
 * 긴 대화는 마지막 주고받음(내 코멘트와 그 뒤 Claude의 처리)만 펼친다 (10/8 11:28).
 * 앞에 내 코멘트가 하나도 없으면 접지 않는다. folded는 접을 앞부분의 처리 수
 */
export function splitThread(steps: ThreadStep[]): { earlier: ThreadStep[]; latest: ThreadStep[]; folded: number } {
  const lastMe = steps.map((s) => s.who).lastIndexOf('나')
  if (lastMe < 0 || !steps.slice(0, lastMe).some((s) => s.who === '나')) return { earlier: [], latest: steps, folded: 0 }
  const earlier = steps.slice(0, lastMe)
  return { earlier, latest: steps.slice(lastMe), folded: earlier.filter((s) => s.who === 'Claude').length }
}

/**
 * 고칠 수 있는 내 글 (10/9 11:18 "클로드가 답변한 멘트는 고칠 수 없게, 답을 달기 전에만"): Claude의 처리 · 답보다 앞선 내 글은 잠근다.
 * 돌려주는 값은 잠기는 글의 끝(이 번호보다 앞의 글은 고칠 수 없다). "다시 처리 대기"는 답으로 치지 않는다.
 */
export const lockedBefore = (steps: ThreadStep[]): number =>
  steps.map((s) => s.who === 'Claude' && s.kind !== '대기').lastIndexOf(true)

/** 다시 처리해서 사용자가 새 답을 승인·반려할 차례: 최신이 반려이고 Claude가 그 반려를 다시 처리했다 */
export const reworked = (e: Pick<FeedbackItem, 'status' | 'review'>) =>
  !!e.review && sendsBack(e.review.verdict) && !!e.status?.rework && e.status.rework === e.review.at

/**
 * 대화 (10/8 시안): 처리 · 승인 · 수정 요청에 코멘트(reviews.yaml comments)와 그 답(status.yaml replies)을 시각순으로 끼운다.
 * 시각이 없는 처리는 바로 앞 글의 시각에 둔다. "다시 처리 대기"는 늘 끝.
 */
export function feedbackConversation(e: Pick<FeedbackItem, 'status' | 'review' | 'comments'>): ThreadStep[] {
  const base = feedbackThread(e)
  const waiting = base.filter((s) => s.kind === '대기')
  const extra: ThreadStep[] = [
    ...(e.comments ?? []).map((c): ThreadStep => ({ who: '나', kind: '코멘트', at: c.at, note: c.note, ...(c.edited && { edited: c.edited }) })),
    ...(e.status?.replies ?? []).map((r): ThreadStep => ({ who: 'Claude', kind: '답', at: r.at, note: r.note, ...(r.by && { by: r.by }) })),
  ]
  if (!extra.length) return base
  let last = ''
  const keyed = base.filter((s) => s.kind !== '대기').map((s, i) => {
    const at = 'at' in s && s.at ? s.at : last
    last = at
    return { s, at, i }
  })
  const all = [...keyed, ...extra.map((s, j) => ({ s, at: (s as { at: string }).at, i: keyed.length + j }))]
  all.sort((a, b) => a.at.localeCompare(b.at) || a.i - b.i)
  return [...all.map((x) => x.s), ...waiting]
}

/** 요약 칸의 세 줄 (이해한 요구 · 원인 · 처리)과 각 글이 마지막으로 바뀐 처리의 시각 (handled_at이 없으면 시각 없음) */
export interface SummaryRow { field: 'understood' | 'cause' | 'note'; text: string; at?: string }
export function summaryRows(st: NonNullable<FeedbackItem['status']>): SummaryRow[] {
  const hs = handlingsOf(st)
  const cur = hs.at(-1)!
  return (['understood', 'cause', 'note'] as const).flatMap((f) => {
    const text = cur[f]
    if (!text) return []
    let k = hs.length - 1
    while (k > 0 && (hs[k - 1]![f] ?? '') === text) k--
    const at = hs[k]!.handled_at
    return [{ field: f, text, ...(at && { at }) }]
  })
}
