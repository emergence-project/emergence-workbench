// 흐름 · 주장 · 시도 파일을 읽고 쓰는 모양 (workbench/problems/<id>/problem.yaml + <주장 번호>.yaml + <시도 글자>.yaml, docs/repo-format.md §16).
// 규칙(누가 무엇을 하나)은 problems.ts, 여기는 파일 ↔ 값만: 너그럽게 읽고(모르는 칸은 남긴다), 정한 칸 순서로 쓴다.
import YAML from 'yaml'
import { ATTEMPT_STATES, CLAIM_SIDES, DIRECTION_VERDICTS, FLOW_ANSWERS, PROBLEM_LIMIT, PROBLEM_STATES, REPORT_WHYS, TEST_RESULTS } from '@rw/core'
import type { AttemptState, ClaimSide, DirectionReport, FlowAnswer, Literature, ProblemState } from '@rw/core/contract/problems'
import { hashOf } from './fsutil.js'

export const PROBLEM_FORMAT = 1
/** 화면에서 한 일의 이름 (에이전트는 MCP가 붙이는 x-rw-agent의 이름) */
export const USER = 'user'

export interface RawProblem {
  question: string; state: ProblemState; by: string; created?: string; source?: string
  if_yes?: string; if_no?: string; reader?: string; literature: Literature[]; first_test?: string; grading?: string
  limit: number; opened?: string; closed?: { at: string; reason?: string; answer?: FlowAnswer; basis?: string[] }; order: string[]; reports: DirectionReport[]
  /** 앱이 모르는 칸: 그대로 다시 쓴다 (다른 컴퓨터의 새 판이 쓴 칸을 잃지 않게) */
  extra: Record<string, unknown>
}
/** 주장 파일 (<번호>.yaml): 판단할 수 있는 한 문장. 상태는 적지 않는다 (근거에서 계산한다) */
export interface RawClaim {
  id: string; statement: string; condition?: string
  /** 위 주장 (이 주장은 그 근거다) · 질문의 어느 쪽을 받치나 (질문 바로 아래만) · 이 주장을 내놓은 시도 */
  under?: string; side?: ClaimSide; by: string; created?: string; from?: string
  /** 사용자의 승인 (흐름을 답과 함께 닫을 때) · 기각 */
  accepted?: { at: string; by: string }; rejected?: { at: string; by: string; note: string }
  extra: Record<string, unknown>
}
/** 시도 파일 (<글자>.yaml): 주장(claim, 없으면 질문)을 겨눈 방법 하나와 해 본 결과 */
export interface RawAttempt {
  id: string; method: string; claim?: string; state: AttemptState; by: string; created?: string
  worker?: string; started?: string; did?: string; result?: string
  files: string[]; run?: { command?: string; commit?: string }; test?: string; reported?: string
  verdict?: { at: string; by: string; note?: string; check?: string; tested?: 'pass' | 'fail'; files?: Record<string, string>; claim?: string }; lesson?: string; reopen?: string
  /** 사용자가 돌려보냄 (수정) */
  returned?: { at: string; by: string; note: string }
  /** 한 날 (YYYY-MM-DD) · past = 지난 일을 나중에 적음 */
  when?: string; origin?: 'past'
  extra: Record<string, unknown>
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? Object.fromEntries(Object.entries(v)) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() || undefined : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString().slice(0, 16) : undefined)
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find((x) => x === v)
const some = <T>(xs: (T | undefined)[]): T[] => xs.filter((x): x is T => x !== undefined)
const rest = (o: Record<string, unknown>, known: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !known.includes(k)))
/** 답: yes · no. YAML 1.1로 읽는 도구가 참 · 거짓으로 바꿔 쓴 것도 읽는다 */
const answerOf = (v: unknown): FlowAnswer | undefined => (v === true ? 'yes' : v === false ? 'no' : oneOf(FLOW_ANSWERS, v))

const PROBLEM_KEYS = ['format', 'question', 'state', 'by', 'created', 'source', 'if_yes', 'if_no', 'reader', 'literature', 'first_test', 'grading', 'limit', 'opened', 'closed', 'order', 'reports']
const CLAIM_KEYS = ['format', 'statement', 'condition', 'under', 'side', 'by', 'created', 'from', 'accepted', 'rejected']
const ATTEMPT_KEYS = ['format', 'method', 'claim', 'state', 'by', 'created', 'when', 'origin', 'worker', 'started', 'did', 'result', 'files', 'run', 'test', 'reported', 'verdict', 'lesson', 'reopen', 'returned']

function literatureOf(v: unknown): Literature | undefined {
  const r = rec(v)
  const ref = str(r.ref), fact = str(r.fact)
  return ref && fact ? { ref, fact, ...(str(r.by) && { by: str(r.by) }), ...(str(r.at) && { at: str(r.at) }) } : undefined
}
function reportOf(v: unknown): DirectionReport | undefined {
  const r = rec(v)
  const at = str(r.at), by = str(r.by)
  if (!at || !by) return undefined
  const d = rec(r.decision)
  const verdict = oneOf(DIRECTION_VERDICTS, d.verdict), dat = str(d.at)
  return {
    at, by, why: oneOf(REPORT_WHYS, r.why) ?? 'asked',
    ...(str(r.for_yes) && { for_yes: str(r.for_yes) }), ...(str(r.for_no) && { for_no: str(r.for_no) }), ...(str(r.neither) && { neither: str(r.neither) }),
    ...(verdict && dat && { decision: { at: dat, verdict, ...(str(d.note) && { note: str(d.note) }), ...(typeof d.limit === 'number' && { limit: d.limit }) } }),
  }
}

/** 사람이 고친 파일도 읽는다: 모르는 값은 기본값으로. 읽지 못하면 null */
export function parseProblem(text: string): RawProblem | null {
  let data: unknown
  try { data = YAML.parse(text) } catch { return null }
  const o = rec(data)
  const question = str(o.question)
  if (!question) return null
  const closed = rec(o.closed)
  const answer = answerOf(closed.answer), basis = some(arr(closed.basis).map(str))
  const limit = typeof o.limit === 'number' && o.limit >= 1 ? Math.floor(o.limit) : PROBLEM_LIMIT
  return {
    question, state: oneOf(PROBLEM_STATES, o.state) ?? 'draft', by: str(o.by) ?? USER,
    ...(str(o.created) && { created: str(o.created) }), ...(str(o.source) && { source: str(o.source) }),
    ...(str(o.if_yes) && { if_yes: str(o.if_yes) }), ...(str(o.if_no) && { if_no: str(o.if_no) }), ...(str(o.reader) && { reader: str(o.reader) }),
    literature: some(arr(o.literature).map(literatureOf)),
    ...(str(o.first_test) && { first_test: str(o.first_test) }), ...(str(o.grading) && { grading: str(o.grading) }),
    limit, ...(str(o.opened) && { opened: str(o.opened) }),
    ...(str(closed.at) && { closed: { at: str(closed.at)!, ...(str(closed.reason) && { reason: str(closed.reason) }), ...(answer && { answer }), ...(basis.length && { basis }) } }),
    order: some(arr(o.order).map(str)),
    reports: some(arr(o.reports).map(reportOf)), extra: rest(o, PROBLEM_KEYS),
  }
}

export function parseClaim(id: string, text: string): RawClaim | null {
  let data: unknown
  try { data = YAML.parse(text) } catch { return null }
  const o = rec(data)
  const statement = str(o.statement)
  if (!statement) return null
  const side = oneOf(CLAIM_SIDES, o.side), under = str(o.under)
  const acc = rec(o.accepted), rej = rec(o.rejected)
  return {
    id, statement, ...(str(o.condition) && { condition: str(o.condition) }), ...(under && under !== id && { under }), ...(side && { side }),
    by: str(o.by) ?? USER, ...(str(o.created) && { created: str(o.created) }), ...(str(o.from) && { from: str(o.from) }),
    ...(str(acc.at) && str(acc.by) && { accepted: { at: str(acc.at)!, by: str(acc.by)! } }),
    ...(str(rej.at) && str(rej.by) && { rejected: { at: str(rej.at)!, by: str(rej.by)!, note: str(rej.note) ?? '' } }),
    extra: rest(o, CLAIM_KEYS),
  }
}

export function parseAttempt(id: string, text: string): RawAttempt | null {
  let data: unknown
  try { data = YAML.parse(text) } catch { return null }
  const o = rec(data)
  const method = str(o.method)
  if (!method) return null
  const v = rec(o.verdict)
  const vat = str(v.at), vby = str(v.by)
  const run = rec(o.run), command = str(run.command), commit = str(run.commit)
  const tested = oneOf(TEST_RESULTS, v.tested)
  const marks = Object.fromEntries(Object.entries(rec(v.files)).flatMap(([f, h]) => { const s = str(h); return s ? [[f, s]] : [] }))
  const ret = rec(o.returned)
  return {
    id, method, ...(str(o.claim) && { claim: str(o.claim) }), state: oneOf(ATTEMPT_STATES, o.state) ?? 'candidate', by: str(o.by) ?? USER,
    ...(str(o.created) && { created: str(o.created) }), ...(str(o.when) && { when: str(o.when)!.slice(0, 10) }), ...(o.origin === 'past' && { origin: 'past' as const }),
    ...(str(o.worker) && { worker: str(o.worker) }), ...(str(o.started) && { started: str(o.started) }),
    ...(str(o.did) && { did: str(o.did) }), ...(str(o.result) && { result: str(o.result) }),
    files: some(arr(o.files).map(str)),
    ...((command || commit) && { run: { ...(command && { command }), ...(commit && { commit }) } }), ...(str(o.test) && { test: str(o.test) }),
    ...(str(o.reported) && { reported: str(o.reported) }),
    ...(vat && vby && { verdict: { at: vat, by: vby, ...(str(v.note) && { note: str(v.note) }), ...(str(v.check) && { check: str(v.check) }), ...(tested && { tested }), ...(Object.keys(marks).length && { files: marks }), ...(str(v.claim) && { claim: str(v.claim) }) } }),
    ...(str(o.lesson) && { lesson: str(o.lesson) }), ...(str(o.reopen) && { reopen: str(o.reopen) }),
    ...(str(ret.at) && str(ret.by) && str(ret.note) && { returned: { at: str(ret.at)!, by: str(ret.by)!, note: str(ret.note)! } }),
    extra: rest(o, ATTEMPT_KEYS),
  }
}

const dump = (v: Record<string, unknown>) => YAML.stringify(v, { lineWidth: 0 })
/** 기본값(빈 목록 · 기본 한도)은 적지 않는다. 사람이 읽기 쉽게 칸 순서를 지킨다 */
export const dumpProblem = (p: RawProblem) => dump({
  format: PROBLEM_FORMAT, question: p.question, state: p.state, by: p.by, ...(p.created && { created: p.created }), ...(p.source && { source: p.source }),
  ...(p.if_yes && { if_yes: p.if_yes }), ...(p.if_no && { if_no: p.if_no }), ...(p.reader && { reader: p.reader }),
  ...(p.literature.length && { literature: p.literature }), ...(p.first_test && { first_test: p.first_test }), ...(p.grading && { grading: p.grading }),
  ...(p.limit !== PROBLEM_LIMIT && { limit: p.limit }), ...(p.opened && { opened: p.opened }), ...(p.closed && { closed: p.closed }),
  ...(p.order.length && { order: p.order }), ...(p.reports.length && { reports: p.reports }), ...p.extra,
})
export const dumpClaim = (c: RawClaim) => dump({
  format: PROBLEM_FORMAT, statement: c.statement, ...(c.condition && { condition: c.condition }), ...(c.under && { under: c.under }), ...(c.side && { side: c.side }),
  by: c.by, ...(c.created && { created: c.created }), ...(c.from && { from: c.from }),
  ...(c.accepted && { accepted: c.accepted }), ...(c.rejected && { rejected: c.rejected }), ...c.extra,
})
export const dumpAttempt = (a: RawAttempt) => dump({
  format: PROBLEM_FORMAT, method: a.method, ...(a.claim && { claim: a.claim }), state: a.state, by: a.by, ...(a.created && { created: a.created }),
  ...(a.when && { when: a.when }), ...(a.origin && { origin: a.origin }), ...(a.worker && { worker: a.worker }), ...(a.started && { started: a.started }),
  ...(a.did && { did: a.did }), ...(a.result && { result: a.result }),
  ...(a.files.length && { files: a.files }), ...(a.run && { run: a.run }), ...(a.test && { test: a.test }), ...(a.reported && { reported: a.reported }), ...(a.verdict && { verdict: a.verdict }),
  ...(a.lesson && { lesson: a.lesson }), ...(a.reopen && { reopen: a.reopen }), ...(a.returned && { returned: a.returned }), ...a.extra,
})

/** 주장(진술 · 조건)의 지문: 성립 판정 때 적어 두고, 뒤에 글이 바뀌면 알린다 */
export const claimHash = (c: Pick<RawClaim, 'statement' | 'condition'>): string => hashOf(`${c.statement ?? ''}\n${c.condition ?? ''}`).slice(0, 12)
