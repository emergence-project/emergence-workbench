// 흐름과 시도 나무 (workbench/problems/<id>/problem.yaml + <시도>.yaml). 형식은 docs/repo-format.md §16
// 11/11 결정 "흐름을 시도 나무로 · 메시지 관문": 흐름은 사용자가 메시지를 쓰고 시작해야 열리고, 에이전트는 그 아래에 시도 후보를 늘어놓고 하나씩 해 본다.
// 시도의 성립 · 폐기는 작업한 쪽이 아닌 쪽이 판정하고, 폐기 사유는 흐름 머리에 모인다. 한도나 정체에서는 방향 보고를 내고 사용자가 계속 · 좁히기 · 종료를 정한다.
import fs from 'node:fs'
import path from 'node:path'
import { PROBLEM_LIMIT, PROBLEM_LIMIT_STEP, PROBLEM_STREAK, localDate, stamp } from '@rw/core'
import type { Attempt, AttemptReportBody, AttemptState, AttemptVerdictBody, DirectionDecisionBody, DirectionReport, DirectionReportBody, NewAttemptsBody, NewProblemBody, Problem, ProblemCloseBody, ProblemList, ProblemPatchBody, ProblemRow, ProblemState, ProblemStop } from '@rw/core/contract/problems'
import { hashOf, writeAtomic } from './fsutil.js'
import { changedSince, fingerprints, headCommit } from './problemFiles.js'
import { logRefusal } from './problemExceptions.js'
import { USER, basisOf, claimHash, dumpAttempt, dumpProblem, parseAttempt, parseProblem, type RawAttempt, type RawProblem } from './problemFormat.js'
import { t } from './i18n.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'

export { PROBLEM_FORMAT, USER, parseAttempt, parseProblem, type RawAttempt, type RawProblem } from './problemFormat.js'
export const PROBLEMS_DIR = 'problems'
export const PROBLEM_FILE = 'problem.yaml'
const ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const ATTEMPT_ID = /^[a-z][a-z0-9]{0,11}$/

// ---------- 폴더 하나 ----------

interface Loaded { id: string; dir: string; text: string; raw: RawProblem; attempts: { raw: RawAttempt; text: string }[]; bad: string[] }

const root = (wb: Workbench) => path.join(wb.root, PROBLEMS_DIR)
function dirOf(wb: Workbench, id: string): string {
  if (!ID.test(id)) throw new WorkbenchError(400, t('흐름 id는 영문 소문자 · 숫자 · 하이픈입니다', 'Flow IDs use lowercase letters, digits and hyphens'))
  return path.join(root(wb), id)
}
const none = () => new WorkbenchError(404, t('없는 흐름입니다', 'No such flow'))

function load(wb: Workbench, id: string): Loaded {
  const dir = dirOf(wb, id)
  const file = path.join(dir, PROBLEM_FILE)
  if (!fs.existsSync(file)) throw none()
  const text = fs.readFileSync(file, 'utf8')
  const raw = parseProblem(text)
  if (!raw) throw new WorkbenchError(422, t(`흐름 파일을 읽지 못했습니다: ${PROBLEMS_DIR}/${id}/${PROBLEM_FILE}`, `Cannot read the flow file: ${PROBLEMS_DIR}/${id}/${PROBLEM_FILE}`))
  const attempts: Loaded['attempts'] = []
  const bad: string[] = []
  for (const f of fs.readdirSync(dir).sort()) {
    if (f === PROBLEM_FILE || !f.endsWith('.yaml') || f.startsWith('.')) continue
    const aid = f.slice(0, -5)
    const atext = fs.readFileSync(path.join(dir, f), 'utf8')
    const a = ATTEMPT_ID.test(aid) ? parseAttempt(aid, atext) : null
    if (a) attempts.push({ raw: a, text: atext }); else bad.push(f)
  }
  return { id, dir, text, raw, attempts, bad }
}

// ---------- 계산: 나무 순서 · 다음 · 멈춤 ----------

const labelOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)
const rank = (order: string[], a: RawAttempt) => { const i = order.indexOf(a.id); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
const bySeq = (order: string[]) => (a: RawAttempt, b: RawAttempt) => rank(order, a) - rank(order, b) || (a.created ?? '').localeCompare(b.created ?? '') || a.id.localeCompare(b.id)

/** 부모 다음에 자식, 형제는 순서대로. 없는 부모를 가리키면 흐름 바로 아래로 읽는다 */
function tree(p: RawProblem, list: RawAttempt[]): { a: RawAttempt; depth: number }[] {
  const ids = new Set(list.map((a) => a.id))
  const kids = (parent: string | undefined) => list.filter((a) => (a.parent && ids.has(a.parent) && a.parent !== a.id ? a.parent : undefined) === parent).sort(bySeq(p.order))
  const out: { a: RawAttempt; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (parent: string | undefined, depth: number) => { for (const a of kids(parent)) { if (seen.has(a.id)) continue; seen.add(a.id); out.push({ a, depth }); walk(a.id, depth + 1) } }
  walk(undefined, 0)
  // 서로를 부모로 가리키는 고리는 맨 위로
  for (const a of list) if (!seen.has(a.id)) out.push({ a, depth: 0 })
  return out
}

/** 지금 해도 되는 후보: 조상이 모두 진행 · 판정 대기 · 성립 (조상이 후보면 그것부터, 폐기면 그 가지는 닫혔다) */
function eligible(list: RawAttempt[]): RawAttempt[] {
  const by = new Map(list.map((a) => [a.id, a]))
  const live = (a: RawAttempt, hops = 0): boolean => {
    const up = a.parent ? by.get(a.parent) : undefined
    if (!up || hops > 20) return true
    return up.state !== 'candidate' && up.state !== 'dropped' && live(up, hops + 1)
  }
  return list.filter((a) => a.state === 'candidate' && live(a))
}
/** 다음 = 화면의 나무에서 위에서 아래로 처음 만나는, 지금 해도 되는 후보 (보이는 순서가 곧 일하는 순서) */
const nextOf = (p: RawProblem, list: RawAttempt[]): RawAttempt | undefined => { const ok = new Set(eligible(list)); return tree(p, list).map((x) => x.a).find((a) => ok.has(a)) }
const usedOf = (list: RawAttempt[]) => list.filter((a) => a.worker).length
const pending = (p: RawProblem): DirectionReport | undefined => { const r = p.reports.at(-1); return r && !r.decision ? r : undefined }

export function stopOf(p: RawProblem, list: RawAttempt[]): ProblemStop | undefined {
  if (p.state !== 'open') return undefined
  if (pending(p)) return 'decision'
  if (usedOf(list) >= p.limit) return 'limit'
  // 정체는 마지막 결정 뒤의 판정만 센다 (계속하기로 한 뒤 한 번 더 폐기됐다고 곧바로 다시 멈추지 않게)
  const lastDecision = p.reports.filter((r) => r.decision).at(-1)?.decision?.at ?? ''
  const judged = list.filter((a) => a.verdict && a.verdict.at > lastDecision).sort((a, b) => a.verdict!.at.localeCompare(b.verdict!.at))
  if (judged.length >= PROBLEM_STREAK && judged.slice(-PROBLEM_STREAK).every((a) => a.state === 'dropped')) return 'stuck'
  if (list.length > 0 && !eligible(list).length && !list.some((a) => a.state === 'active' || a.state === 'reported')) return 'exhausted'
  return undefined
}

function row(l: Loaded): ProblemRow {
  const list = l.attempts.map((x) => x.raw)
  const count = (s: AttemptState) => list.filter((a) => a.state === s).length
  const next = l.raw.state === 'open' ? nextOf(l.raw, list) : undefined
  const stop = stopOf(l.raw, list)
  return {
    id: l.id, question: l.raw.question, state: l.raw.state, by: l.raw.by, ...(l.raw.created && { created: l.raw.created }), ...(l.raw.source && { source: l.raw.source }),
    limit: l.raw.limit, used: usedOf(list),
    counts: { candidate: count('candidate'), active: count('active'), reported: count('reported'), holds: count('holds'), dropped: count('dropped') },
    ...(next && { next: { id: next.id, label: labelOf(next.id), method: next.method } }), ...(stop && { stop }), waiting: stop === 'decision',
    ...(l.raw.closed?.answer && { answer: l.raw.closed.answer }),
  }
}

function view(l: Loaded, repo: string): Problem {
  const list = l.attempts.map((x) => x.raw)
  const text = new Map(l.attempts.map((x) => [x.raw.id, x.text]))
  const r = row(l)
  const ordered = tree(l.raw, list)
  const inTree = ordered.map((x) => x.a)
  const attempts: Attempt[] = ordered.map(({ a, depth }) => {
    const { extra: _extra, ...known } = a
    // 판정 뒤에 바뀐 파일: 성립한 시도만 본다 (폐기한 시도의 파일은 더 따지지 않는다)
    const changed = a.state === 'holds' && a.verdict?.files ? changedSince(repo, a.verdict.files) : []
    // 판정 뒤에 바뀐 주장: 성립 판정 때 적어 둔 지문과 지금 진술 · 조건이 다르다
    const restated = a.state === 'holds' && !!a.verdict?.claim && a.verdict.claim !== claimHash(a)
    return { ...known, label: labelOf(a.id), hash: hashOf(text.get(a.id) ?? ''), depth, next: r.next?.id === a.id, ...(changed.length && { changed }), ...(restated && { restated }) }
  })
  const { extra: _extra, question: _q, state: _s, by: _b, created: _c, source: _src, limit: _l, ...more } = l.raw
  return {
    ...r, hash: hashOf(l.text), ...more, attempts, basis: { yes: basisOf(inTree, 'yes'), no: basisOf(inTree, 'no') },
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
      for (const f of l.bad) diagnostics.push({ file: `workbench/${PROBLEMS_DIR}/${id}/${f}`, message: t('시도 파일을 읽지 못했습니다 (method가 있어야 하고, 이름은 영문 소문자로 시작하는 영문 · 숫자입니다)', 'Cannot read this attempt file (it needs a method, and the name is lowercase letters and digits starting with a letter)') })
    } catch (e) {
      diagnostics.push({ file: `workbench/${PROBLEMS_DIR}/${id}/${PROBLEM_FILE}`, message: e instanceof Error ? e.message : String(e) })
    }
  }
  problems.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (b.created ?? '').localeCompare(a.created ?? '') || a.id.localeCompare(b.id))
  return { problems, diagnostics }
}

export const readProblem = (wb: Workbench, id: string): Problem => view(load(wb, id), wb.repo)

// ---------- 누가 무엇을 하나 ----------

const isUser = (actor: string) => actor === USER
type Where = { problem?: string; attempt?: string }
/** 규칙으로 막는다: 막은 일을 예외 기록에 남기고(2주 뒤 규칙을 다시 볼 자료) 오류를 던진다. 값이 빠졌거나 그새 바뀐 것 같은 보통 오류에는 쓰지 않는다 */
function refuse(wb: Workbench, actor: string, where: Where, rule: string, status: number, ko: string, en: string): never {
  logRefusal(wb, actor, where, rule, ko)
  throw new WorkbenchError(status, t(ko, en))
}
function userOnly(wb: Workbench, actor: string, problem: string | undefined, ko: string, en: string): void {
  if (!isUser(actor)) refuse(wb, actor, { problem }, 'user-only', 403, `${ko}은(는) 사용자가 앱에서 합니다. 필요하면 기록(add_record)으로 제안하세요.`, `${en} is done by the user in the app. Propose it with a record (add_record) if needed.`)
}
function fresh(l: Loaded, baseHash: string): void {
  const now = hashOf(l.text)
  if (now !== baseHash) throw new ConflictError(t('그새 흐름 파일이 바뀌었습니다. 다시 읽고 고쳐 주세요', 'The flow file changed meanwhile. Read it again and retry'), now)
}
const saveProblem = (l: Loaded, p: RawProblem) => writeAtomic(path.join(l.dir, PROBLEM_FILE), dumpProblem(p))
const saveAttempt = (l: Loaded, a: RawAttempt) => writeAtomic(path.join(l.dir, `${a.id}.yaml`), dumpAttempt(a))
const now = () => stamp('t')

/** 질문에서 id를 만든다 (영문이 없으면 problem, 겹치면 -2 …) */
export function problemSlug(question: string, taken: Set<string>): string {
  const base = question.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'problem'
  let id = base; let n = 1
  while (taken.has(id)) id = `${base}-${++n}`
  return id
}

/** 사용자가 만들면 쓰는 중, 에이전트가 만들면 제안. 에이전트는 메시지와 독자를 쓰지 않는다 */
export function createProblem(wb: Workbench, input: NewProblemBody, actor: string): Problem {
  const agent = !isUser(actor)
  if (agent && !input.source?.trim()) throw new WorkbenchError(400, t('제안에는 출처(source: 논문 · 노트 절 · 시도)가 있어야 합니다', 'A proposal needs a source (paper, note section or attempt)'))
  if (agent && (input.if_yes || input.if_no || input.reader)) refuse(wb, actor, {}, 'user-only', 403, '메시지와 독자는 사용자가 씁니다. 질문과 출처만 제안하세요', 'The message and the reader are written by the user. Propose only the question and its source')
  const d = root(wb)
  const taken = new Set(fs.existsSync(d) ? fs.readdirSync(d) : [])
  const id = problemSlug(input.question, taken)
  const raw: RawProblem = {
    question: input.question, state: agent ? 'proposed' : 'draft', by: actor, created: localDate(), ...(input.source?.trim() && { source: input.source.trim() }),
    ...(input.if_yes?.trim() && { if_yes: input.if_yes.trim() }), ...(input.if_no?.trim() && { if_no: input.if_no.trim() }), ...(input.reader?.trim() && { reader: input.reader.trim() }),
    literature: [], limit: PROBLEM_LIMIT, order: [], reports: [], extra: {},
  }
  writeAtomic(path.join(d, id, PROBLEM_FILE), dumpProblem(raw))
  return readProblem(wb, id)
}

const AGENT_FIELDS = ['literature', 'first_test', 'grading']
const clean = (v: string | undefined) => v?.trim() || undefined

export function patchProblem(wb: Workbench, id: string, body: ProblemPatchBody, actor: string): Problem {
  const l = load(wb, id)
  fresh(l, body.baseHash)
  const set = body.set
  const touched = Object.entries(set).filter(([, v]) => v !== undefined).map(([k]) => k)
  if (!isUser(actor) && touched.some((k) => !AGENT_FIELDS.includes(k))) userOnly(wb, actor, id, '질문 · 메시지 · 독자 · 한도 · 순서', 'The question, message, reader, limit and order')
  if (l.raw.state === 'closed') throw new WorkbenchError(409, t('종료한 흐름은 고치지 않습니다', 'A closed flow is not edited'))
  const p: RawProblem = { ...l.raw }
  if (set.question !== undefined) p.question = set.question
  const put = (k: 'if_yes' | 'if_no' | 'reader' | 'first_test' | 'grading') => { if (set[k] !== undefined) { const v = clean(set[k]); if (v) p[k] = v; else delete p[k] } }
  put('if_yes'); put('if_no'); put('reader'); put('first_test'); put('grading')
  if (p.state === 'open' && (!p.if_yes || !p.if_no || !p.reader)) throw new WorkbenchError(400, t('시작한 흐름의 메시지(예 · 아니오)와 독자는 비울 수 없습니다', 'An open flow keeps its message (yes and no) and its reader'))
  if (set.literature) {
    const old = new Map(l.raw.literature.map((x) => [`${x.ref}\n${x.fact}`, x]))
    p.literature = set.literature.map((x) => old.get(`${x.ref}\n${x.fact}`) ?? { ...x, by: actor, at: now() })
  }
  if (set.limit !== undefined) p.limit = set.limit
  if (set.order) {
    const ids = new Set(l.attempts.map((x) => x.raw.id))
    const unknown = set.order.find((x) => !ids.has(x))
    if (unknown) throw new WorkbenchError(400, t(`없는 시도입니다: ${unknown}`, `No such attempt: ${unknown}`))
    p.order = [...new Set(set.order)]
  }
  if (set.needs) { if (set.needs === 'all') p.needs = 'all'; else delete p.needs }
  saveProblem(l, p)
  return readProblem(wb, id)
}

/** 시작: 사용자만. 메시지(예 · 아니오)와 독자가 있어야 한다 (메시지 관문) */
export function openProblem(wb: Workbench, id: string, baseHash: string, actor: string): Problem {
  userOnly(wb, actor, id, '흐름 시작', 'Opening a flow')
  const l = load(wb, id)
  fresh(l, baseHash)
  if (l.raw.state === 'open') return view(l, wb.repo)
  if (l.raw.state === 'closed') throw new WorkbenchError(409, t('종료한 흐름입니다', 'This flow is closed'))
  const missing = [!l.raw.if_yes && t('답이 예일 때의 한 문장', 'the sentence if the answer is yes'), !l.raw.if_no && t('답이 아니오일 때의 한 문장', 'the sentence if the answer is no'), !l.raw.reader && t('독자', 'the reader')].filter((x): x is string => !!x)
  if (missing.length) throw new WorkbenchError(400, t(`시작하려면 다음을 적어 주세요: ${missing.join(' · ')}`, `To start, write: ${missing.join(', ')}`))
  saveProblem(l, { ...l.raw, state: 'open', opened: now() })
  return readProblem(wb, id)
}

/**
 * 종료: 사용자만. 답 없이 닫으면 사유가 있어야 한다.
 * 답(예 · 아니오)과 함께 닫으면 그 답이 기대는 주장(basis)마다 승인 · 수정 · 기각을 받는다: 승인은 그 시도에 남고, 수정은 진행으로 돌려보내고, 기각은 폐기한다.
 * 모두 승인일 때만 닫힌다. 결정을 기다리는 방향 보고가 있으면 그 결정(종료)으로 함께 적는다
 */
export function closeProblem(wb: Workbench, id: string, body: ProblemCloseBody, actor: string): Problem {
  userOnly(wb, actor, id, '흐름 종료', 'Closing a flow')
  const l = load(wb, id)
  fresh(l, body.baseHash)
  if (l.raw.state !== 'open') throw new WorkbenchError(409, t('진행 중인 흐름만 종료합니다', 'Only an open flow is closed'))
  const at = now(), reason = clean(body.reason)
  const shut = (closed: NonNullable<RawProblem['closed']>) => {
    const r = pending(l.raw)
    const reports = r ? [...l.raw.reports.slice(0, -1), { ...r, decision: { at, verdict: 'close' as const, ...(reason && { note: reason }) } }] : l.raw.reports
    saveProblem(l, { ...l.raw, state: 'closed', closed, reports })
    return readProblem(wb, id)
  }
  if (!body.answer) {
    if (!reason) throw new WorkbenchError(400, t('답 없이 종료하려면 종료 사유를 적어 주세요', 'To close without an answer, write the reason'))
    return shut({ at, reason })
  }
  const list = tree(l.raw, l.attempts.map((x) => x.raw)).map((x) => x.a)
  const ids = basisOf(list, body.answer)
  if (!ids.length) refuse(wb, actor, { problem: id }, 'no-basis', 409, '이 답을 받치는 성립한 주장이 없습니다. 답 없이 종료하거나 시도를 더 합니다', 'No held claim supports this answer. Close without an answer, or run more attempts')
  const reviews = new Map((body.reviews ?? []).map((r) => [r.id.toLowerCase(), r]))
  const missing = ids.filter((x) => !reviews.has(x))
  if (missing.length) throw new WorkbenchError(400, t(`답이 기대는 주장마다 승인 · 수정 · 기각을 골라 주세요: ${missing.map(labelOf).join(', ')}`, `Choose approve, send back or reject for each claim the answer rests on: ${missing.map(labelOf).join(', ')}`))
  const noNote = ids.filter((x) => reviews.get(x)!.verdict !== 'approve' && !clean(reviews.get(x)!.note))
  if (noNote.length) throw new WorkbenchError(400, t(`수정 · 기각에는 이유를 적어 주세요: ${noNote.map(labelOf).join(', ')}`, `Send back and reject need a reason: ${noNote.map(labelOf).join(', ')}`))
  for (const aid of ids) {
    const a = attemptOf(l, aid), r = reviews.get(aid)!, note = clean(r.note) ?? ''
    if (r.verdict === 'approve') saveAttempt(l, { ...a, accepted: { at, by: actor } })
    else if (r.verdict === 'return') {
      // 수정: 판정을 걷고 진행으로. 보고한 글은 남아 작업한 쪽이 고쳐 다시 보고한다
      const { verdict: _v, accepted: _a, reported: _r, ...base } = a
      saveAttempt(l, { ...base, state: 'active', returned: { at, by: actor, note } })
    } else {
      const { accepted: _a, ...base } = a
      saveAttempt(l, { ...base, state: 'dropped', verdict: { at, by: actor, note }, lesson: a.lesson ?? note })
    }
  }
  if (ids.some((x) => reviews.get(x)!.verdict !== 'approve')) return readProblem(wb, id)
  return shut({ at, answer: body.answer, ...(reason && { reason }), basis: ids })
}

/** 시작하지 않은 흐름(제안 · 쓰는 중)을 지운다: problems/.trash/로 옮긴다 */
export function removeProblem(wb: Workbench, id: string, baseHash: string, actor: string): void {
  userOnly(wb, actor, id, '흐름 삭제', 'Removing a flow')
  const l = load(wb, id)
  fresh(l, baseHash)
  if (l.raw.state === 'open' || l.raw.state === 'closed') throw new WorkbenchError(409, t('시작한 흐름은 지우지 않고 종료합니다', 'A started flow is closed, not removed'))
  const trash = path.join(root(wb), '.trash')
  fs.mkdirSync(trash, { recursive: true })
  fs.renameSync(l.dir, path.join(trash, `${id}-${stamp('compact')}`))
}

// ---------- 시도 ----------

function needOpen(wb: Workbench, actor: string, l: Loaded): void {
  if (l.raw.state !== 'open') refuse(wb, actor, { problem: l.id }, 'not-open', 409, '사용자가 시작한 흐름에서만 일합니다. 이 흐름은 아직 시작 전이거나 종료했습니다', 'Work only on a flow the user has opened. This one is not open')
}
function attemptOf(l: Loaded, aid: string): RawAttempt {
  const a = l.attempts.find((x) => x.raw.id === aid)?.raw
  if (!a) throw new WorkbenchError(404, t(`없는 시도입니다: ${aid}`, `No such attempt: ${aid}`))
  return a
}

/** 부모가 글자로 끝나면 숫자, 숫자로 끝나면 글자를 붙인다: a · b · c › c1 · c2 › c1a */
export function nextAttemptId(parent: string | undefined, taken: Set<string>): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  if (!parent) {
    for (const c of letters) if (!taken.has(c)) return c
    for (const c of letters) for (const d of letters) if (!taken.has(c + d)) return c + d
  } else if (/[a-z]$/.test(parent)) {
    for (let n = 1; n < 100; n++) if (!taken.has(`${parent}${n}`)) return `${parent}${n}`
  } else {
    for (const c of letters) if (!taken.has(parent + c)) return parent + c
  }
  throw new WorkbenchError(400, t('이 가지에는 시도를 더 둘 수 없습니다', 'This branch cannot hold more attempts'))
}

/** 후보를 늘어놓는다 (사용자도 에이전트도). 상태는 후보 */
export function addAttempts(wb: Workbench, id: string, body: NewAttemptsBody, actor: string): Problem {
  const l = load(wb, id)
  needOpen(wb, actor, l)
  const taken = new Set(l.attempts.map((x) => x.raw.id))
  for (const item of body.attempts) {
    if (item.parent && !taken.has(item.parent)) throw new WorkbenchError(400, t(`없는 시도 아래에는 둘 수 없습니다: ${item.parent}`, `No such parent attempt: ${item.parent}`))
    const aid = nextAttemptId(item.parent, taken)
    if (!ATTEMPT_ID.test(aid)) throw new WorkbenchError(400, t('나무가 너무 깊습니다', 'The tree is too deep'))
    taken.add(aid)
    saveAttempt(l, { id: aid, method: item.method, ...(item.parent && { parent: item.parent }), state: 'candidate', by: actor, created: now(), files: [], ...(item.needs && { needs: item.needs }), extra: {} })
  }
  return readProblem(wb, id)
}

const STOP_TEXT: Record<ProblemStop, [string, string]> = {
  decision: ['방향 보고가 사용자의 결정을 기다립니다. 결정이 날 때까지 새 시도를 시작하지 않습니다', 'A direction report is waiting for the user\'s decision. No new attempt starts until then'],
  limit: ['시도 한도에 닿았습니다. 다음 시도 대신 방향 보고를 내세요 (direction_report)', 'The attempt limit is reached. File a direction report instead of the next attempt (direction_report)'],
  stuck: [`폐기가 ${PROBLEM_STREAK}번 이어졌습니다. 다음 시도 대신 방향 보고를 내세요 (direction_report)`, `${PROBLEM_STREAK} attempts in a row were dropped. File a direction report instead of the next attempt (direction_report)`],
  exhausted: ['남은 후보가 없습니다. 후보를 더 늘어놓거나 방향 보고를 내세요', 'No candidates are left. List more candidates or file a direction report'],
}

/** 후보를 진행으로. 작업한 쪽을 적는다 (판정은 이 이름이 아닌 쪽만) */
export function startAttempt(wb: Workbench, id: string, aid: string, actor: string): Problem {
  const l = load(wb, id)
  needOpen(wb, actor, l)
  const list = l.attempts.map((x) => x.raw)
  const a = attemptOf(l, aid)
  if (a.state !== 'candidate') throw new WorkbenchError(409, t('후보만 시작합니다', 'Only a candidate is started'))
  const stop = stopOf(l.raw, list)
  if (stop) throw new WorkbenchError(409, t(STOP_TEXT[stop][0], STOP_TEXT[stop][1]))
  const ok = eligible(list)
  if (!ok.includes(a)) throw new WorkbenchError(409, t('이 후보의 위 가지가 아직 후보이거나 폐기됐습니다', 'A branch above this candidate is still a candidate or was dropped'))
  // 사용자가 순서를 정했으면 에이전트는 그 순서의 다음 후보부터
  const next = nextOf(l.raw, list)
  if (!isUser(actor) && l.raw.order.length && next && next.id !== aid) refuse(wb, actor, { problem: id, attempt: aid }, 'order', 409, `사용자가 정한 순서의 다음 후보는 ${labelOf(next.id)}입니다: ${next.method}`, `The next candidate in the user's order is ${labelOf(next.id)}: ${next.method}`)
  saveAttempt(l, { ...a, state: 'active', worker: actor, started: now() })
  return readProblem(wb, id)
}

/** 작업한 쪽의 보고: 진행 → 판정 대기. 성립 · 폐기는 여기서 정해지지 않는다 */
export function reportAttempt(wb: Workbench, id: string, aid: string, body: AttemptReportBody, actor: string): Problem {
  const l = load(wb, id)
  needOpen(wb, actor, l)
  const a = attemptOf(l, aid)
  if (a.state !== 'active') throw new WorkbenchError(409, t('진행 중인 시도만 보고합니다 (먼저 시작하세요)', 'Only a working attempt is reported (start it first)'))
  if (!isUser(actor) && a.worker && a.worker !== actor) refuse(wb, actor, { problem: id, attempt: aid }, 'not-yours', 403, `이 시도는 ${a.worker}가 맡았습니다`, `This attempt belongs to ${a.worker}`)
  // 주장: 진술 한 문장과 그것이 질문의 어느 쪽을 받치는지. 실패한 길처럼 내놓을 주장이 없으면 비워 두고 폐기 사유를 적는다
  const statement = clean(body.statement), condition = clean(body.condition)
  if (statement && !body.side) throw new WorkbenchError(400, t('주장에는 질문의 어느 쪽을 받치는지 적어 주세요 (side: for_yes 예 · for_no 아니오 · neither 어느 쪽도 아님)', 'A claim needs the side of the question it supports (side: for_yes, for_no or neither)'))
  if (!statement && (condition || body.side)) throw new WorkbenchError(400, t('조건과 쪽은 진술(statement)과 함께 적습니다', 'A condition and a side come with a statement'))
  // 실행: 명령을 적었거나 파일이 있으면 보고할 때의 커밋을 함께 남긴다 (직접 준 커밋이 앞선다)
  const files = body.files?.map((f) => f.trim()).filter(Boolean) ?? a.files
  const command = clean(body.run?.command), commit = clean(body.run?.commit) ?? (command || files.length ? headCommit(wb.repo) : undefined)
  const { run: _run, test: _test, statement: _s, condition: _c, side: _side, ...base } = a
  saveAttempt(l, { ...base, state: 'reported', did: body.did, result: body.result, files, reported: now(),
    ...(statement && { statement, ...(condition && { condition }), ...(body.side && { side: body.side }) }),
    ...((command || commit) && { run: { ...(command && { command }), ...(commit && { commit }) } }), ...(clean(body.test) && { test: clean(body.test) }),
    ...(clean(body.lesson) && { lesson: clean(body.lesson) }), ...(clean(body.reopen) && { reopen: clean(body.reopen) }) })
  return readProblem(wb, id)
}

/** 판정: 작업한 쪽이 아닌 쪽이 원자료로. 성립은 교차 검증이, 폐기는 폐기 사유가 있어야 한다 */
export function verdictAttempt(wb: Workbench, id: string, aid: string, body: AttemptVerdictBody, actor: string): Problem {
  const l = load(wb, id)
  needOpen(wb, actor, l)
  const a = attemptOf(l, aid)
  if (a.state === 'holds' || a.state === 'dropped') throw new WorkbenchError(409, t('이미 판정한 시도입니다', 'This attempt already has a verdict'))
  const untried = a.state === 'candidate'
  if (a.state !== 'reported') {
    // 해 보지 않은 후보 · 진행 중인 시도를 닫는 것은 사용자만 (폐기)
    if (!isUser(actor) || body.result !== 'dropped') throw new WorkbenchError(409, t('보고가 있는 시도(판정 대기)만 판정합니다', 'Only a reported attempt (awaiting verdict) gets a verdict'))
  }
  const here = { problem: id, attempt: aid }
  if (a.worker && a.worker === actor) refuse(wb, actor, here, 'self-verdict', 403, '작업한 쪽은 판정하지 않습니다. 다른 에이전트나 사용자가 원자료로 판정합니다', 'The one who did the work does not give the verdict. Another agent or the user judges from the raw data')
  // 성립 = 이 시도의 진술이 이 시도의 근거에서 따라 나온다. 진술이 없으면 성립이라고 할 것이 없다
  if (body.result === 'holds' && !a.statement) refuse(wb, actor, here, 'no-claim', 409, '진술이 없는 시도는 성립으로 판정하지 못합니다. 작업한 쪽이 판단할 수 있는 한 문장(statement)을 적어 다시 보고하거나, 폐기합니다', 'An attempt without a statement cannot hold. The worker reports again with one judgeable sentence (statement), or it is dropped')
  const check = clean(body.check), lesson = clean(body.lesson) ?? a.lesson, reopen = clean(body.reopen) ?? a.reopen
  if (body.result === 'holds' && !check) throw new WorkbenchError(400, t('성립에는 교차 검증(check: 다른 크기 · 다른 매개변수 · 독립 구현 · 극한 가운데 무엇을 했나)이 있어야 합니다', 'A holds verdict needs a check outside the fitted condition (check: another size, other parameters, an independent implementation or a limit)'))
  // 검사 명령이 있는 시도: 다시 돌려 실패했으면 성립이 아니고, 에이전트는 돌린 결과(통과)가 있어야 성립을 준다. 사용자는 돌리지 않고도 정할 수 있다
  if (body.result === 'holds' && body.tested === 'fail') throw new WorkbenchError(400, t('검사가 실패했으면 성립이 아닙니다. 폐기하거나, 고친 뒤 다시 보고받습니다', 'A failed test is not a holds verdict. Drop it, or have it reported again after a fix'))
  if (body.result === 'holds' && a.test && !isUser(actor) && body.tested !== 'pass') refuse(wb, actor, here, 'test-not-run', 400, `이 시도에는 검사 명령이 있습니다. 다시 돌려 보고 결과를 적습니다 (tested: pass): ${a.test}`, `This attempt has a test command. Rerun it and record the result (tested: pass): ${a.test}`)
  if (body.result === 'dropped' && !untried && !lesson) throw new WorkbenchError(400, t('폐기에는 폐기 사유 한 줄(lesson)이 있어야 합니다', 'A dropped verdict needs a one-line lesson (lesson)'))
  const { lesson: _l, reopen: _r, returned: _ret, ...base } = a
  // 성립이면 그때의 파일 지문을 남긴다: 뒤에 파일이 바뀌면 화면과 이어받기 요약이 알린다
  const marks = body.result === 'holds' ? fingerprints(wb.repo, a.files) : {}
  saveAttempt(l, { ...base, state: body.result, verdict: { at: now(), by: actor, note: body.note, ...(check && { check }), ...(body.tested && { tested: body.tested }), ...(Object.keys(marks).length && { files: marks }), ...(body.result === 'holds' && { claim: claimHash(a) }) },
    ...(body.result === 'dropped' && lesson && { lesson }), ...(body.result === 'dropped' && reopen && { reopen }) })
  return readProblem(wb, id)
}

// ---------- 방향 보고와 결정 ----------

/** 사실만: 지금까지의 결과가 메시지의 예 · 아니오 문장을 지지하는가, 어느 쪽과도 무관한가 */
export function directionReport(wb: Workbench, id: string, body: DirectionReportBody, actor: string): Problem {
  const l = load(wb, id)
  needOpen(wb, actor, l)
  if (pending(l.raw)) throw new WorkbenchError(409, t('이미 결정을 기다리는 방향 보고가 있습니다', 'A direction report is already waiting for a decision'))
  const for_yes = clean(body.for_yes), for_no = clean(body.for_no), neither = clean(body.neither)
  if (!for_yes && !for_no && !neither) throw new WorkbenchError(400, t('예를 지지하는 사실, 아니오를 지지하는 사실, 어느 쪽과도 무관한 것 가운데 하나는 적어 주세요', 'Write at least one of: facts for yes, facts for no, facts for neither'))
  const stop = stopOf(l.raw, l.attempts.map((x) => x.raw))
  const why = stop && stop !== 'decision' ? stop : 'asked'
  saveProblem(l, { ...l.raw, reports: [...l.raw.reports, { at: now(), by: actor, why, ...(for_yes && { for_yes }), ...(for_no && { for_no }), ...(neither && { neither }) }] })
  return readProblem(wb, id)
}

/** 계속 · 좁히기는 한도를 올리고, 종료는 흐름을 닫는다. 사용자만 */
export function decideDirection(wb: Workbench, id: string, body: DirectionDecisionBody, actor: string): Problem {
  userOnly(wb, actor, id, '계속 · 좁히기 · 종료의 결정', 'Deciding to continue, narrow or close')
  const l = load(wb, id)
  fresh(l, body.baseHash)
  const r = pending(l.raw)
  if (!r) throw new WorkbenchError(409, t('결정을 기다리는 방향 보고가 없습니다', 'No direction report is waiting for a decision'))
  const at = now(), note = clean(body.note)
  const used = usedOf(l.attempts.map((x) => x.raw))
  const limit = body.verdict === 'close' ? undefined : body.limit ?? Math.max(l.raw.limit, used) + PROBLEM_LIMIT_STEP
  if (limit !== undefined && limit <= used) throw new WorkbenchError(400, t(`한도는 이미 쓴 수(${used})보다 커야 합니다`, `The limit must be above the attempts already used (${used})`))
  const reports = [...l.raw.reports.slice(0, -1), { ...r, decision: { at, verdict: body.verdict, ...(note && { note }), ...(limit !== undefined && { limit }) } }]
  saveProblem(l, { ...l.raw, reports, ...(limit !== undefined && { limit }), ...(body.verdict === 'close' && { state: 'closed' as const, closed: { at, ...(note && { reason: note }) } }) })
  return readProblem(wb, id)
}
