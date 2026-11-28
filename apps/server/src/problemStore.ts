// 흐름 파일 읽기 · 화면 모양 · 쓰기 도우미 (problems.ts에서 나눔). 규칙과 바꾸기는 problems.ts
import fs from 'node:fs'
import path from 'node:path'
import { stamp } from '@rw/core'
import { PROBLEM_STREAK } from '@rw/core/plugins/flow'
import type { Attempt, AttemptState, Claim, DirectionReport, Problem, ProblemList, ProblemRow, ProblemState, ProblemStop } from '@rw/core/contract/problems'
import { hashOf, writeAtomic } from './fsutil.js'
import { changedSince } from './problemFiles.js'
import { logRefusal } from './problemExceptions.js'
import { basisOf, claimDay, claimStates, claimTree, eligible, targetOf, unconfirmed } from './problemClaims.js'
import { USER, claimHash, dumpAttempt, dumpClaim, dumpProblem, parseAttempt, parseClaim, parseProblem, type RawAttempt, type RawClaim, type RawProblem } from './problemFormat.js'
import { t } from './i18n.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'

export const PROBLEMS_DIR = 'problems'
export const PROBLEM_FILE = 'problem.yaml'
const ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const ATTEMPT_ID = /^[a-z][a-z0-9]{0,11}$/
/** 주장 파일의 이름은 번호다 (시도는 글자로 시작한다) */
const CLAIM_ID = /^[1-9][0-9]{0,3}$/

// ---------- 폴더 하나 ----------

export interface Loaded { id: string; dir: string; text: string; raw: RawProblem; claims: { raw: RawClaim; text: string }[]; attempts: { raw: RawAttempt; text: string }[]; bad: string[] }

export const root = (wb: Workbench) => path.join(wb.root, PROBLEMS_DIR)
function dirOf(wb: Workbench, id: string): string {
  if (!ID.test(id)) throw new WorkbenchError(400, t('흐름 id는 영문 소문자 · 숫자 · 하이픈입니다', 'Flow IDs use lowercase letters, digits and hyphens'))
  return path.join(root(wb), id)
}
const none = () => new WorkbenchError(404, t('없는 흐름입니다', 'No such flow'))

export function load(wb: Workbench, id: string): Loaded {
  const dir = dirOf(wb, id)
  const file = path.join(dir, PROBLEM_FILE)
  if (!fs.existsSync(file)) throw none()
  const text = fs.readFileSync(file, 'utf8')
  const raw = parseProblem(text)
  if (!raw) throw new WorkbenchError(422, t(`흐름 파일을 읽지 못했습니다: ${PROBLEMS_DIR}/${id}/${PROBLEM_FILE}`, `Cannot read the flow file: ${PROBLEMS_DIR}/${id}/${PROBLEM_FILE}`))
  const claims: Loaded['claims'] = []
  const attempts: Loaded['attempts'] = []
  const bad: string[] = []
  for (const f of fs.readdirSync(dir).sort()) {
    if (f === PROBLEM_FILE || !f.endsWith('.yaml') || f.startsWith('.')) continue
    const name = f.slice(0, -5)
    const body = fs.readFileSync(path.join(dir, f), 'utf8')
    const c = CLAIM_ID.test(name) ? parseClaim(name, body) : null
    const a = ATTEMPT_ID.test(name) ? parseAttempt(name, body) : null
    if (c) claims.push({ raw: c, text: body }); else if (a) attempts.push({ raw: a, text: body }); else bad.push(f)
  }
  return { id, dir, text, raw, claims, attempts, bad }
}
export const claimsIn = (l: Loaded) => l.claims.map((x) => x.raw)
export const attemptsIn = (l: Loaded) => l.attempts.map((x) => x.raw)

// ---------- 계산: 순서 · 다음 · 멈춤 ----------

export const labelOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)
const rank = (order: string[], a: RawAttempt) => { const i = order.indexOf(a.id); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
/** 일하는 순서: 사용자가 정한 순서, 그다음 만든 순서 */
const bySeq = (order: string[]) => (a: RawAttempt, b: RawAttempt) => rank(order, a) - rank(order, b) || (a.created ?? '').localeCompare(b.created ?? '') || a.id.localeCompare(b.id)
const inSeq = (p: RawProblem, list: RawAttempt[]) => [...list].sort(bySeq(p.order))

/** 다음 = 일하는 순서에서 처음 만나는, 지금 해도 되는 후보 */
export const nextOf = (p: RawProblem, claims: RawClaim[], list: RawAttempt[]): RawAttempt | undefined => { const ok = new Set(eligible(claims, list)); return inSeq(p, list).find((a) => ok.has(a)) }
/** 한도에 세는 시도: 시작한 것 (지난 일을 나중에 적은 것은 세지 않는다) */
export const usedOf = (list: RawAttempt[]) => list.filter((a) => a.worker && a.origin !== 'past').length
export const pending = (p: RawProblem): DirectionReport | undefined => { const r = p.reports.at(-1); return r && !r.decision ? r : undefined }

export function stopOf(p: RawProblem, claims: RawClaim[], list: RawAttempt[]): ProblemStop | undefined {
  if (p.state !== 'open') return undefined
  if (pending(p)) return 'decision'
  if (usedOf(list) >= p.limit) return 'limit'
  // 정체는 마지막 결정 뒤의 판정만 센다 (계속하기로 한 뒤 한 번 더 폐기됐다고 곧바로 다시 멈추지 않게)
  const lastDecision = p.reports.filter((r) => r.decision).at(-1)?.decision?.at ?? ''
  const judged = list.filter((a) => a.verdict && a.verdict.at > lastDecision && a.origin !== 'past').sort((a, b) => a.verdict!.at.localeCompare(b.verdict!.at))
  if (judged.length >= PROBLEM_STREAK && judged.slice(-PROBLEM_STREAK).every((a) => a.state === 'dropped')) return 'stuck'
  // 후보 없음은 이 흐름에서 해 본 시도만 본다 (지난 일만 적힌 흐름은 아직 시작 전과 같다)
  const live = list.filter((a) => a.origin !== 'past')
  if (live.length > 0 && !eligible(claims, live).length && !live.some((a) => a.state === 'active' || a.state === 'reported')) return 'exhausted'
  return undefined
}

export function row(l: Loaded): ProblemRow {
  const list = attemptsIn(l), claims = claimsIn(l)
  const count = (s: AttemptState) => list.filter((a) => a.state === s).length
  const next = l.raw.state === 'open' ? nextOf(l.raw, claims, list) : undefined
  const stop = stopOf(l.raw, claims, list)
  const confirm = list.filter(unconfirmed).length
  return {
    id: l.id, question: l.raw.question, state: l.raw.state, by: l.raw.by, ...(l.raw.created && { created: l.raw.created }), ...(l.raw.source && { source: l.raw.source }),
    limit: l.raw.limit, used: usedOf(list),
    counts: { candidate: count('candidate'), active: count('active'), reported: count('reported'), holds: count('holds'), dropped: count('dropped') },
    ...(next && { next: { id: next.id, label: labelOf(next.id), method: next.method } }), ...(stop && { stop }), waiting: stop === 'decision',
    ...(l.raw.closed?.answer && { answer: l.raw.closed.answer }), ...(confirm && { confirm }),
  }
}

export function view(l: Loaded, repo: string): Problem {
  const list = inSeq(l.raw, attemptsIn(l)), rawClaims = claimsIn(l)
  const text = new Map([...l.attempts, ...l.claims].map((x) => [x.raw.id, x.text]))
  const r = row(l)
  const attempts: Attempt[] = list.map((a) => {
    const { extra: _extra, claim: _claim, ...known } = a
    const target = targetOf(a, rawClaims)
    // 판정 뒤에 바뀐 파일: 성립한 시도만 본다 (폐기한 시도의 파일은 더 따지지 않는다)
    const changed = a.state === 'holds' && a.verdict?.files ? changedSince(repo, a.verdict.files) : []
    // 판정 뒤에 바뀐 주장: 성립 판정 때 적어 둔 지문과 지금 그 주장의 진술 · 조건이 다르다
    const restated = a.state === 'holds' && !!a.verdict?.claim && !!target && a.verdict.claim !== claimHash(target)
    return { ...known, ...(target && { claim: target.id }), label: labelOf(a.id), hash: hashOf(text.get(a.id) ?? ''), next: r.next?.id === a.id, ...(changed.length && { changed }), ...(restated && { restated }), ...(unconfirmed(a) && { turn: true }) }
  })
  const status = claimStates(rawClaims, list)
  const claims: Claim[] = claimTree(rawClaims, list).map(({ c, depth }) => {
    const { extra: _extra, under: _under, ...known } = c
    const own = attempts.filter((a) => a.claim === c.id)
    const s = status.get(c.id) ?? { state: 'candidate' as const, waiting: false }
    const stale = own.some((a) => a.state === 'holds' && (a.restated || !!a.changed?.length))
    const up = c.under && rawClaims.some((x) => x.id === c.under) ? c.under : undefined
    const day = claimDay(c, rawClaims, list)
    return { ...known, ...(up && { under: up }), hash: hashOf(text.get(c.id) ?? ''), depth, state: s.state, ...(s.waiting && { waiting: true }), ...(stale && { stale: true }), attempts: own.map((a) => a.id),
      ...(day && { when: day }), ...(own.some((a) => a.turn) && { unconfirmed: true }) }
  })
  const { extra: _extra, question: _q, state: _s, by: _b, created: _c, source: _src, limit: _l, ...more } = l.raw
  return {
    ...r, hash: hashOf(l.text), ...more, claims, attempts, basis: { yes: basisOf(rawClaims, list, 'yes'), no: basisOf(rawClaims, list, 'no') },
    lessons: attempts.filter((a) => a.state === 'dropped' && a.lesson).map((a) => ({ id: a.id, label: a.label, lesson: a.lesson!, ...(a.reopen && { reopen: a.reopen }) })),
  }
}

// ---------- 목록 · 하나 ----------

export function listProblemIds(wb: Workbench): string[] {
  const d = root(wb)
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && ID.test(e.name) && fs.existsSync(path.join(d, e.name, PROBLEM_FILE))).map((e) => e.name).sort()
}

/** 진행 → 쓰는 중 → 제안 → 종료 차례, 같은 상태는 새것부터 */
const STATE_ORDER: Record<ProblemState, number> = { open: 0, draft: 1, proposed: 2, closed: 3 }
export function scanProblems(wb: Workbench): ProblemList {
  const problems: ProblemRow[] = []
  const diagnostics: ProblemList['diagnostics'] = []
  for (const id of listProblemIds(wb)) {
    try {
      const l = load(wb, id)
      problems.push(row(l))
      for (const f of l.bad) diagnostics.push({ file: `workbench/${PROBLEMS_DIR}/${id}/${f}`, message: t('주장 · 시도 파일을 읽지 못했습니다 (주장은 이름이 번호이고 statement가, 시도는 이름이 영문 소문자로 시작하고 method가 있어야 합니다)', 'Cannot read this claim or attempt file (a claim is named by a number and needs a statement; an attempt starts with a lowercase letter and needs a method)') })
      // 없는 주장을 가리키는 파일: 읽기는 질문 바로 아래로 읽지만, 손으로 쓴 번호가 틀린 것이니 알린다
      const known = new Set(l.claims.map((x) => x.raw.id))
      const at = (name: string) => `workbench/${PROBLEMS_DIR}/${id}/${name}.yaml`
      for (const { raw: a } of l.attempts) if (a.claim && !known.has(a.claim)) diagnostics.push({ file: at(a.id), message: t(`없는 주장을 겨눕니다 (claim: ${a.claim}). 질문을 겨눈 시도로 읽습니다`, `Aims at a claim that does not exist (claim: ${a.claim}). Read as aiming at the question`) })
      for (const { raw: c } of l.claims) if (c.under && !known.has(c.under)) diagnostics.push({ file: at(c.id), message: t(`없는 주장 아래에 있습니다 (under: ${c.under}). 질문 바로 아래의 주장으로 읽습니다`, `Sits under a claim that does not exist (under: ${c.under}). Read as a claim right under the question`) })
    } catch (e) {
      diagnostics.push({ file: `workbench/${PROBLEMS_DIR}/${id}/${PROBLEM_FILE}`, message: e instanceof Error ? e.message : String(e) })
    }
  }
  problems.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (b.created ?? '').localeCompare(a.created ?? '') || a.id.localeCompare(b.id))
  return { problems, diagnostics }
}

export const readProblem = (wb: Workbench, id: string): Problem => view(load(wb, id), wb.repo)

// ---------- 누가 무엇을 하나 ----------

export const isUser = (actor: string) => actor === USER
type Where = { problem?: string; attempt?: string }
/** 규칙으로 막는다: 막은 일을 예외 기록에 남기고(2주 뒤 규칙을 다시 볼 자료) 오류를 던진다. 값이 빠졌거나 그새 바뀐 것 같은 보통 오류에는 쓰지 않는다 */
export function refuse(wb: Workbench, actor: string, where: Where, rule: string, status: number, ko: string, en: string): never {
  logRefusal(wb, actor, where, rule, ko)
  throw new WorkbenchError(status, t(ko, en))
}
export function userOnly(wb: Workbench, actor: string, problem: string | undefined, ko: string, en: string): void {
  if (!isUser(actor)) refuse(wb, actor, { problem }, 'user-only', 403, `${ko}은(는) 사용자가 앱에서 합니다. 필요하면 기록(add_record)으로 제안하세요.`, `${en} is done by the user in the app. Propose it with a record (add_record) if needed.`)
}
export function fresh(l: Loaded, baseHash: string): void {
  const now = hashOf(l.text)
  if (now !== baseHash) throw new ConflictError(t('그새 흐름 파일이 바뀌었습니다. 다시 읽고 고쳐 주세요', 'The flow file changed meanwhile. Read it again and retry'), now)
}
export const saveProblem = (l: Loaded, p: RawProblem) => writeAtomic(path.join(l.dir, PROBLEM_FILE), dumpProblem(p))
export const saveAttempt = (l: Loaded, a: RawAttempt) => writeAtomic(path.join(l.dir, `${a.id}.yaml`), dumpAttempt(a))
export const saveClaim = (l: Loaded, c: RawClaim) => writeAtomic(path.join(l.dir, `${c.id}.yaml`), dumpClaim(c))
export const now = () => stamp('t')
