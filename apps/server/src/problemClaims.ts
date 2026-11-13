// 주장의 나무와 상태 (11/13 결정 "점 = 주장, 시도는 근거"). 파일에서 읽은 값만으로 계산한다: 규칙(누가 무엇을 하나)은 problems.ts.
// 주장은 상태를 파일에 적지 않는다. 근거(이 주장을 겨눈 시도와 이 아래의 주장)에서 읽을 때마다 계산하므로, 근거가 바뀌면 주장의 상태도 따라 바뀐다.
import type { AttemptState, ClaimSide, FlowAnswer } from '@rw/core/contract/problems'
import type { RawAttempt, RawClaim } from './problemFormat.js'

export interface ClaimNode { c: RawClaim; depth: number }
export interface ClaimStatus { state: AttemptState; waiting: boolean }

const num = (id: string) => Number(id) || 0
/** 위 주장: 없는 주장이나 자기를 가리키면 질문 바로 아래로 읽는다 */
const upOf = (c: RawClaim, ids: Set<string>) => (c.under && c.under !== c.id && ids.has(c.under) ? c.under : undefined)

/** 위 주장 다음에 그 근거 주장, 형제는 번호 순. 서로를 가리키는 고리는 맨 위로 */
export function claimTree(claims: RawClaim[]): ClaimNode[] {
  const ids = new Set(claims.map((c) => c.id))
  const kids = (up: string | undefined) => claims.filter((c) => upOf(c, ids) === up).sort((a, b) => num(a.id) - num(b.id))
  const out: ClaimNode[] = []
  const seen = new Set<string>()
  const walk = (up: string | undefined, depth: number) => { for (const c of kids(up)) { if (seen.has(c.id)) continue; seen.add(c.id); out.push({ c, depth }); walk(c.id, depth + 1) } }
  walk(undefined, 0)
  for (const c of claims) if (!seen.has(c.id)) out.push({ c, depth: 0 })
  return out
}

/** 시도가 겨눈 주장 (없는 주장을 가리키면 질문을 겨눈 것으로 읽는다) */
export const targetOf = (a: RawAttempt, claims: RawClaim[]): RawClaim | undefined => (a.claim ? claims.find((c) => c.id === a.claim) : undefined)
/** 그 주장을 겨눈 시도들. id가 없으면 질문을 바로 겨눈 시도 */
export const attemptsOf = (id: string | undefined, claims: RawClaim[], attempts: RawAttempt[]): RawAttempt[] => attempts.filter((a) => targetOf(a, claims)?.id === id)

/**
 * 주장마다의 상태.
 * 성립 = 성립한 시도가 하나 있고, 폐기되지 않은 아래 주장이 모두 성립 (아래 주장이 남았으면 진행 + waiting).
 * 판정 대기 = 보고한 시도가 판정을 기다린다. 진행 = 시도 중이거나 아래 주장에서 일이 진행 중이다.
 * 폐기 = 사용자가 기각했거나, 해 본 시도가 모두 폐기됐다. 후보 = 그 밖 (아직 해 본 것이 없다)
 */
export function claimStates(claims: RawClaim[], attempts: RawAttempt[]): Map<string, ClaimStatus> {
  const ids = new Set(claims.map((c) => c.id))
  const out = new Map<string, ClaimStatus>()
  const of = (c: RawClaim, hops: number): ClaimStatus => {
    const done = out.get(c.id)
    if (done) return done
    const put = (state: AttemptState, waiting = false) => { const s = { state, waiting }; out.set(c.id, s); return s }
    if (c.rejected) return put('dropped')
    if (hops > 20) return put('candidate')
    const own = attemptsOf(c.id, claims, attempts)
    const subs = claims.filter((x) => upOf(x, ids) === c.id).map((x) => of(x, hops + 1)).filter((s) => s.state !== 'dropped')
    const held = own.some((a) => a.state === 'holds')
    if (held && subs.every((s) => s.state === 'holds')) return put('holds')
    if (held) return put('active', true)
    if (own.some((a) => a.state === 'reported')) return put('reported')
    if (own.some((a) => a.state === 'active') || subs.some((s) => s.state !== 'candidate')) return put('active')
    if (own.length > 0 && own.every((a) => a.state === 'dropped')) return put('dropped')
    return put('candidate')
  }
  for (const c of claims) of(c, 0)
  return out
}

/** 지금 해도 되는 후보: 겨눈 주장과 그 위 주장이 기각되지 않았다 */
export function eligible(claims: RawClaim[], attempts: RawAttempt[]): RawAttempt[] {
  const by = new Map(claims.map((c) => [c.id, c]))
  const open = (c: RawClaim | undefined, hops = 0): boolean => !c || hops > 20 || (!c.rejected && open(c.under && c.under !== c.id ? by.get(c.under) : undefined, hops + 1))
  return attempts.filter((a) => a.state === 'candidate' && open(targetOf(a, claims)))
}

const SIDE_OF: Record<FlowAnswer, ClaimSide> = { yes: 'for_yes', no: 'for_no' }
/**
 * 그 답으로 닫는다면 답이 기대는 주장: 그 쪽을 받치는 성립한 주장(질문 바로 아래)과, 그 아래의 성립한 근거 주장 전부. 나무 순서로 돌려준다.
 * 무엇이 사용자에게 가는지는 에이전트가 고르지 않고 나무의 모양으로 정해진다 (11/11)
 */
export function basisOf(claims: RawClaim[], attempts: RawAttempt[], answer: FlowAnswer): string[] {
  const state = claimStates(claims, attempts)
  const out: string[] = []
  for (const { c, depth } of claimTree(claims)) {
    if (state.get(c.id)?.state !== 'holds') continue
    if (depth === 0 ? c.side === SIDE_OF[answer] : !!c.under && out.includes(c.under)) out.push(c.id)
  }
  return out
}
