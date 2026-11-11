// 흐름 파일과 시도 파일을 읽고 쓰는 모양 (workbench/problems/<id>/problem.yaml + <시도>.yaml, docs/repo-format.md §16).
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
  limit: number; opened?: string; closed?: { at: string; reason?: string; answer?: FlowAnswer; basis?: string[] }; order: string[]; needs?: 'all'; reports: DirectionReport[]
  /** 앱이 모르는 칸: 그대로 다시 쓴다 (다른 컴퓨터의 새 판이 쓴 칸을 잃지 않게) */
  extra: Record<string, unknown>
}
export interface RawAttempt {
  id: string; method: string; parent?: string; state: AttemptState; by: string; created?: string
  worker?: string; started?: string; did?: string; result?: string
  /** 주장: 판단할 수 있는 한 문장(진술), 그것이 성립하는 조건, 질문의 어느 쪽을 받치나 */
  statement?: string; condition?: string; side?: ClaimSide
  files: string[]; run?: { command?: string; commit?: string }; test?: string; reported?: string
  verdict?: { at: string; by: string; note?: string; check?: string; tested?: 'pass' | 'fail'; files?: Record<string, string>; claim?: string }; lesson?: string; reopen?: string; needs?: 'all'
  /** 사용자의 승인 (흐름을 답과 함께 닫을 때) · 돌려보냄 (수정) */
  accepted?: { at: string; by: string }; returned?: { at: string; by: string; note: string }
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

const PROBLEM_KEYS = ['format', 'question', 'state', 'by', 'created', 'source', 'if_yes', 'if_no', 'reader', 'literature', 'first_test', 'grading', 'limit', 'opened', 'closed', 'order', 'needs', 'reports']
const ATTEMPT_KEYS = ['format', 'method', 'parent', 'state', 'by', 'created', 'worker', 'started', 'did', 'result', 'statement', 'condition', 'side', 'files', 'run', 'test', 'reported', 'verdict', 'lesson', 'reopen', 'needs', 'accepted', 'returned']

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
    order: some(arr(o.order).map(str)), ...(o.needs === 'all' && { needs: 'all' as const }),
    reports: some(arr(o.reports).map(reportOf)), extra: rest(o, PROBLEM_KEYS),
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
  const statement = str(o.statement), side = oneOf(CLAIM_SIDES, o.side)
  const acc = rec(o.accepted), ret = rec(o.returned)
  return {
    id, method, ...(str(o.parent) && { parent: str(o.parent) }), state: oneOf(ATTEMPT_STATES, o.state) ?? 'candidate', by: str(o.by) ?? USER,
    ...(str(o.created) && { created: str(o.created) }), ...(str(o.worker) && { worker: str(o.worker) }), ...(str(o.started) && { started: str(o.started) }),
    ...(str(o.did) && { did: str(o.did) }), ...(str(o.result) && { result: str(o.result) }),
    // 조건과 쪽은 진술에 딸린 칸이다: 진술이 없으면 읽지 않는다
    ...(statement && { statement, ...(str(o.condition) && { condition: str(o.condition) }), ...(side && { side }) }),
    files: some(arr(o.files).map(str)),
    ...((command || commit) && { run: { ...(command && { command }), ...(commit && { commit }) } }), ...(str(o.test) && { test: str(o.test) }),
    ...(str(o.reported) && { reported: str(o.reported) }),
    ...(vat && vby && { verdict: { at: vat, by: vby, ...(str(v.note) && { note: str(v.note) }), ...(str(v.check) && { check: str(v.check) }), ...(tested && { tested }), ...(Object.keys(marks).length && { files: marks }), ...(str(v.claim) && { claim: str(v.claim) }) } }),
    ...(str(o.lesson) && { lesson: str(o.lesson) }), ...(str(o.reopen) && { reopen: str(o.reopen) }), ...(o.needs === 'all' && { needs: 'all' as const }),
    ...(str(acc.at) && str(acc.by) && { accepted: { at: str(acc.at)!, by: str(acc.by)! } }),
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
  ...(p.order.length && { order: p.order }), ...(p.needs && { needs: p.needs }), ...(p.reports.length && { reports: p.reports }), ...p.extra,
})
export const dumpAttempt = (a: RawAttempt) => dump({
  format: PROBLEM_FORMAT, method: a.method, ...(a.parent && { parent: a.parent }), state: a.state, by: a.by, ...(a.created && { created: a.created }),
  ...(a.worker && { worker: a.worker }), ...(a.started && { started: a.started }),
  ...(a.statement && { statement: a.statement, ...(a.condition && { condition: a.condition }), ...(a.side && { side: a.side }) }),
  ...(a.did && { did: a.did }), ...(a.result && { result: a.result }),
  ...(a.files.length && { files: a.files }), ...(a.run && { run: a.run }), ...(a.test && { test: a.test }), ...(a.reported && { reported: a.reported }), ...(a.verdict && { verdict: a.verdict }),
  ...(a.lesson && { lesson: a.lesson }), ...(a.reopen && { reopen: a.reopen }), ...(a.needs && { needs: a.needs }),
  ...(a.accepted && { accepted: a.accepted }), ...(a.returned && { returned: a.returned }), ...a.extra,
})

// ---------- 주장: 지문과 답이 기대는 것 ----------

/** 주장(진술 · 조건)의 지문: 성립 판정 때 적어 두고, 뒤에 글이 바뀌면 알린다 */
export const claimHash = (a: Pick<RawAttempt, 'statement' | 'condition'>): string => hashOf(`${a.statement ?? ''}\n${a.condition ?? ''}`).slice(0, 12)

const SIDE_OF: Record<FlowAnswer, ClaimSide> = { yes: 'for_yes', no: 'for_no' }
/**
 * 그 답으로 닫는다면 답이 기대는 주장: 그 쪽을 받치는 성립한 시도와, 그 위(부모 쪽)의 성립한 시도.
 * 무엇이 사용자에게 가는지는 에이전트가 고르지 않고 나무의 모양으로 정해진다 (11/11). 받은 순서대로 돌려준다
 */
export function basisOf(list: RawAttempt[], answer: FlowAnswer): string[] {
  const by = new Map(list.map((a) => [a.id, a]))
  const held = (a: RawAttempt) => a.state === 'holds' && !!a.statement
  const out = new Set<string>()
  for (const a of list) {
    if (!held(a) || a.side !== SIDE_OF[answer]) continue
    out.add(a.id)
    for (let up = a.parent ? by.get(a.parent) : undefined, hops = 0; up && hops < 20; up = up.parent ? by.get(up.parent) : undefined, hops++) if (held(up)) out.add(up.id)
  }
  return list.filter((a) => out.has(a.id)).map((a) => a.id)
}
