// 연구 흐름 (workbench/flow/<id>.yaml): 점 하나 = 생각의 한 걸음. 형식은 docs/repo-format.md §14
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hashOf, isBackupCopy, localDate, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'
import { t as tl } from './i18n.js'
import { cardState, claimHash, computeGaps, confirmed, evidenceHash, flowGate, judgmentHash, judgmentQueue, markJudgments, markStale, stepHash } from './flowGaps.js'
import { JUDGE_CAP, commentTargetSlug, stamp as coreStamp } from '@rw/core'
import { CARD_VERDICTS, FINDING_VERDICTS, FLOW_EDGES, FLOW_EVIDENCE, FLOW_KINDS, FLOW_PRIORITY, FLOW_PROGRESS, FLOW_RESULTS, FLOW_VERDICTS, type FlowCheckBody, type FlowJudgeBody, type FlowReviewBody, type FlowSearchReply, type FlowEvidence, type FlowLayout, type FlowLayoutBody, type FlowNode, type FlowPatchBody, type FlowRowMove, type FlowRows, type FlowScan, type NewFlowBody } from '@rw/core/contract/flow'

export const FLOW_DIR = 'flow'
export const FLOW_FORMAT = 1
const ID = /^[a-z0-9][a-z0-9-]*$/

type Diag = FlowScan['diagnostics'][number]
const str = (v: unknown): string | undefined => typeof v === 'string' ? v.trim() || undefined : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString().slice(0, 10) : undefined
const strs = (v: unknown): string[] => Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : str(v) ? [str(v)!] : []
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.includes(v as T) ? v as T : undefined

/** 그 역할의 마지막 확인 기록이 거둔 것도 낡은 것(근거가 바뀜)도 아니면 확인됨 */
export const approved = (e: FlowEvidence, role: 'agent' | 'human'): boolean => confirmed(e, role)

/** 파일 하나를 점으로. 읽을 수 없으면 null (까닭은 diags에) */
export function parseFlowNode(id: string, file: string, content: string, diags: Diag[]): FlowNode | null {
  const bad = (code: string, en: string, ko: string, line = 1) => diags.push({ file, code, line, message: tl(ko, en) })
  const checksOf = (v: unknown): FlowEvidence['checks'] => {
    const out: FlowEvidence['checks'] = []
    for (const c of Array.isArray(v) ? v : []) {
      const r = c as Record<string, unknown>
      const at = str(r?.at), by = str(r?.by), role = oneOf(['agent', 'human'] as const, r?.role)
      if (!at || !by || !role) { bad('checks', 'Each check needs at, by and role (agent or human).', '확인 기록마다 at, by, role(agent·human)이 있어야 합니다.'); continue }
      out.push({ at, by, role, ...(str(r.note) && { note: str(r.note) }), ...(r.revoked === true && { revoked: true }), ...(str(r.hash) && { hash: str(r.hash) }), ...(str(r.claim) && { claim: str(r.claim) }) })
    }
    return out
  }
  const doc = YAML.parseDocument(content, { prettyErrors: false })
  if (doc.errors.length) {
    const e = doc.errors[0]!
    bad('yaml', `Cannot read the YAML: ${e.message}`, `YAML을 읽지 못했습니다: ${e.message}`, e.linePos?.[0]?.line ?? 1)
    return null
  }
  const y = doc.toJS() as Record<string, unknown> | null
  if (!y || typeof y !== 'object' || Array.isArray(y)) { bad('shape', 'The file must be a YAML mapping.', '파일은 YAML 사전이어야 합니다.'); return null }
  if (y.format !== FLOW_FORMAT) bad('format', `Write format: ${FLOW_FORMAT}.`, `format: ${FLOW_FORMAT}을 적으세요.`)
  const kind = oneOf(FLOW_KINDS, y.kind)
  if (!kind) { bad('kind', `kind must be one of ${FLOW_KINDS.join(', ')}.`, `kind는 ${FLOW_KINDS.join(', ')} 가운데 하나입니다.`); return null }
  let progress = oneOf(FLOW_PROGRESS, y.progress)
  if (!progress) { bad('progress', `progress must be one of ${FLOW_PROGRESS.join(', ')}; read as open.`, `progress는 ${FLOW_PROGRESS.join(', ')} 가운데 하나입니다. 미해결로 읽었습니다.`); progress = 'open' }
  let result = oneOf(FLOW_RESULTS, y.result)
  if (y.result != null && !result) bad('result', `result must be one of ${FLOW_RESULTS.join(', ')}.`, `result는 ${FLOW_RESULTS.join(', ')} 가운데 하나입니다.`)
  if (result && progress !== 'done') { bad('result', 'result is only for progress: done; ignored.', 'result는 progress: done일 때만 씁니다. 무시했습니다.'); result = undefined }
  const title = str(y.title)
  const short = str(y.short) ?? title ?? id
  if (!title) bad('title', 'Write a title.', 'title을 적으세요.')
  const topics = strs(y.topics)
  const from: FlowNode['from'] = []
  for (const f of Array.isArray(y.from) ? y.from : []) {
    const o = (f && typeof f === 'object' ? f : { id: f }) as Record<string, unknown>
    const fid = str(o.id)
    if (!fid) { bad('from', 'Each from item needs an id.', 'from 항목마다 id가 있어야 합니다.'); continue }
    const type = oneOf(FLOW_EDGES, o.type) ?? (kind === 'question' ? 'origin' : 'support')
    if (o.type != null && !oneOf(FLOW_EDGES, o.type)) bad('from', `from type must be one of ${FLOW_EDGES.join(', ')}.`, `from의 type은 ${FLOW_EDGES.join(', ')} 가운데 하나입니다.`)
    from.push({ id: fid, type })
  }
  const fields: Record<string, string> = {}
  if (y.fields && typeof y.fields === 'object' && !Array.isArray(y.fields)) for (const [k, v] of Object.entries(y.fields)) { const s = str(v); if (s) fields[k] = s }
  const evidence: FlowEvidence[] = []
  for (const e of Array.isArray(y.evidence) ? y.evidence : []) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const ref = str(o.ref), fileRef = str(o.file)
    const ek = oneOf(FLOW_EVIDENCE, o.kind) ?? (ref ? 'paper' : 'other')
    if ((ref ? 1 : 0) + (fileRef ? 1 : 0) !== 1) bad('evidence', 'Each evidence item points to exactly one of ref or file.', '근거 항목마다 ref와 file 가운데 하나만 적습니다.')
    evidence.push({ kind: ek, text: str(o.text) ?? '', ...(str(o.title) && { title: str(o.title) }), ...(fileRef && { file: fileRef }), ...(ref && { ref }), ...(str(o.section) && { section: str(o.section) }), checks: checksOf(o.checks) })
  }
  const steps: FlowNode['steps'] = []
  for (const st of Array.isArray(y.steps) ? y.steps : []) {
    const o = (st && typeof st === 'object' ? st : { text: st }) as Record<string, unknown>
    const text = str(o.text)
    if (!text) { bad('steps', 'Each step needs text.', '단계마다 text가 있어야 합니다.'); continue }
    steps.push({ text, ...(str(o.uses) && { uses: str(o.uses) }), checks: checksOf(o.checks) })
  }
  let run: FlowNode['run']
  if (y.run && typeof y.run === 'object' && !Array.isArray(y.run)) {
    const o = y.run as Record<string, unknown>
    const params: Record<string, string> = {}
    if (o.params && typeof o.params === 'object' && !Array.isArray(o.params)) for (const [k, v] of Object.entries(o.params)) { const x = str(v) ?? (Array.isArray(v) ? v.map(String).join(', ') : undefined); if (x) params[k] = x }
    run = { ...(str(o.code) && { code: str(o.code) }), ...(str(o.commit) && { commit: str(o.commit) }), ...(Object.keys(params).length && { params }), ...(str(o.output) && { output: str(o.output) }) }
  }
  const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined)
  let start: FlowNode['start']
  const so = rec(y.start)
  if (y.start != null) {
    if (!so || !str(so.at)) bad('start', 'start needs at (when it was written).', 'start(시작 기록)에는 at(적은 때)이 있어야 합니다.')
    else start = { at: str(so.at)!, ...(str(so.by) && { by: str(so.by) }), ...(str(so.query) && { query: str(so.query) }), hits: strs(so.hits), prior: strs(so.prior), ...(str(so.adds) && { adds: str(so.adds) }), ...(str(so.novel) && { novel: str(so.novel) }), ...(str(so.criterion) && { criterion: str(so.criterion) }), ...(str(so.stop) && { stop: str(so.stop) }), ...(so.late === true && { late: true }) }
  }
  let integration: FlowNode['integration']
  const io = rec(y.integration)
  if (y.integration != null) {
    if (!io || !str(io.at) || !(str(io.into) || str(io.skip))) bad('integration', 'integration needs at and either into (the document it was reflected in) or skip (why not).', 'integration(반영 기록)에는 at과, into(반영한 문서)나 skip(반영하지 않은 이유) 가운데 하나가 있어야 합니다.')
    else integration = { at: str(io.at)!, ...(str(io.by) && { by: str(io.by) }), ...(str(io.into) && { into: str(io.into) }), ...(str(io.section) && { section: str(io.section) }), ...(str(io.skip) && { skip: str(io.skip) }) }
  }
  const priority = oneOf(FLOW_PRIORITY, y.priority)
  if (y.priority != null && !priority) bad('priority', `priority must be one of ${FLOW_PRIORITY.join(', ')}.`, `priority는 ${FLOW_PRIORITY.join(', ')} 가운데 하나입니다.`)
  const judgments: FlowNode['judgments'] = []
  for (const j of Array.isArray(y.judgments) ? y.judgments : []) {
    const r = rec(j) ?? {}
    const at = str(r.at), by = str(r.by), verdict = oneOf(FLOW_VERDICTS, r.verdict)
    if (!at || !by || !verdict) { bad('judgments', `Each judgment needs at, by and verdict (${FLOW_VERDICTS.join(', ')}).`, `판단 기록마다 at, by, verdict(${FLOW_VERDICTS.join(', ')})가 있어야 합니다.`); continue }
    if (!verdictFits(kind, verdict)) { bad('judgments', `verdict ${verdict} does not fit a ${kind} dot.`, `verdict ${verdict}는 ${kind} 점에 맞지 않습니다.`); continue }
    judgments.push({ at, by, verdict, ...(str(r.note) && { note: str(r.note) }), ...(str(r.claim) && { claim: str(r.claim) }) })
  }
  let card: FlowNode['card']
  const co = rec(y.card)
  if (y.card != null) {
    if (!co || kind !== 'question') bad('card', 'card is only for question dots and must be a mapping.', 'card(카드)는 질문 점에만, 사전으로 적습니다.')
    else {
      const terms: NonNullable<FlowNode['card']>['terms'] = []
      for (const t of Array.isArray(co.terms) ? co.terms : []) {
        const r: Record<string, unknown> = rec(t) ?? { word: t }
        const word = str(r.word)
        if (!word) { bad('card', 'Each term needs word.', '용어마다 word가 있어야 합니다.'); continue }
        terms.push({ word, ...(str(r.def) && { def: str(r.def) }), ...(str(r.ref) && { ref: str(r.ref) }) })
      }
      const findings = Number.isInteger(co.findings) && (co.findings as number) >= 0 ? co.findings as number : undefined
      if (co.findings != null && findings === undefined) bad('card', 'card findings is a whole number (how many findings to return at most).', 'card의 findings는 돌려받을 명제 수(0 이상 정수)입니다.')
      card = { givens: strs(co.givens), terms, tools: strs(co.tools), ...(str(co.assignee) && { assignee: str(co.assignee) }), ...(findings !== undefined && { findings }) }
    }
  }
  const theorem = kind === 'finding' && evidence.some((e) => e.kind === 'proof' && approved(e, 'human'))
  return {
    id, file, hash: hashOf(content), kind, progress, ...(result && { result }), short, title: title ?? short, topics,
    ...(str(y.date) && { date: str(y.date) }), ...(str(y.ended) && { ended: str(y.ended) }), ...(str(y.by) && { by: str(y.by) }), ...(str(y.task) && { task: str(y.task) }), ...(start && { start }), ...(integration && { integration }), from, fields, ...(y.end === true && { end: true }), evidence,
    ...(run && { run }), steps, ...(str(y.reason) && { reason: str(y.reason) }), ...(str(y.next) && { next: str(y.next) }), ...(priority && { priority }), gaps: [],
    sources: strs(y.sources), guesses: strs(y.guesses), theorem, ...(card && { card }), judgments,
  }
}

/** 판단의 말이 점 종류에 맞나: 발견은 승인 · 수정 · 기각, 질문(카드)은 시작 · 수정 · 종료 */
export const verdictFits = (kind: FlowNode['kind'], v: string): boolean =>
  kind === 'finding' ? (FINDING_VERDICTS as readonly string[]).includes(v) : kind === 'question' ? (CARD_VERDICTS as readonly string[]).includes(v) : false

/** 흐름의 점 전부 (날짜·id 순). 없는 점을 가리키는 선은 진단으로 알린다 */
export function scanFlow(wb: Workbench): FlowScan {
  const dir = path.join(wb.root, FLOW_DIR)
  const rel = (n: string) => path.posix.join(path.basename(wb.root), FLOW_DIR, n)
  const out: FlowScan = { nodes: [], diagnostics: [], layout: {}, rows: null }
  out.layout = readLayout(wb, out.diagnostics)
  out.rows = readRows(wb)
  let names: string[]
  try { names = fs.readdirSync(dir) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') out.diagnostics.push({ file: rel(''), code: 'read', line: 1, message: tl(`폴더를 읽지 못했습니다: ${(e as Error).message}`, `Could not read the folder: ${(e as Error).message}`) })
    return out
  }
  for (const n of names.sort()) {
    if (!n.endsWith('.yaml') || n.startsWith('.') || n === 'layout.yaml') continue
    const id = n.slice(0, -5), file = rel(n)
    if (isBackupCopy(n)) { out.diagnostics.push({ file, code: 'filename', line: 1, message: tl('백업 동기화가 남긴 GitHub 쪽 사본입니다. 원본과 견주어 합친 뒤 이 파일을 지우세요.', 'A GitHub-side copy left by backup sync. Compare it with the original, merge, then delete this file.') }); continue }
    if (!ID.test(id)) { out.diagnostics.push({ file, code: 'filename', line: 1, message: tl('파일 이름은 영문 소문자·숫자·-로 적으세요.', 'Name the file with lowercase letters, digits and -.') }); continue }
    const p = path.join(dir, n)
    try {
      if (!fs.lstatSync(p).isFile()) { out.diagnostics.push({ file, code: 'read', line: 1, message: tl('일반 파일이 아닙니다. 링크·폴더는 읽지 않습니다.', 'Not a regular file. Links and folders are not read.') }); continue }
      const node = parseFlowNode(id, file, fs.readFileSync(p, 'utf8'), out.diagnostics)
      if (node) out.nodes.push(node)
    } catch (e) { out.diagnostics.push({ file, code: 'read', line: 1, message: tl(`파일을 읽지 못했습니다: ${(e as Error).message}`, `Could not read the file: ${(e as Error).message}`) }) }
  }
  const ids = new Set(out.nodes.map((n) => n.id))
  for (const n of out.nodes) {
    const missing = n.from.filter((f) => !ids.has(f.id) || f.id === n.id)
    for (const f of missing) out.diagnostics.push({ file: n.file, code: 'from', line: 1, message: tl(`from의 ${f.id}: 그런 점이 없습니다. 선을 그리지 않았습니다.`, `from ${f.id}: no such dot. The line is not drawn.`) })
    if (missing.length) n.from = n.from.filter((f) => !missing.includes(f))
  }
  out.nodes.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))
  for (const n of out.nodes) {
    markStale(wb.repo, n)
    // 승인한 뒤 증명이 바뀌면 정리가 아니다
    n.theorem = n.kind === 'finding' && n.evidence.some((e) => e.kind === 'proof' && approved(e, 'human'))
    const v = markJudgments(n)
    if (v) n.verdict = v; else delete n.verdict
  }
  computeGaps(wb.repo, out.nodes)
  return out
}

// ---------- 쓰기 (2단계, 10/14): 앱에서 점 만들기·고치기·지우기·사람 승인·자리 ----------

const LAYOUT = 'layout.yaml'
const dirOf = (wb: Workbench) => path.join(wb.root, FLOW_DIR)
const fileOf = (wb: Workbench, id: string) => {
  if (!ID.test(id)) throw new WorkbenchError(400, tl('점 id가 맞지 않습니다', 'Invalid dot id'))
  return path.join(dirOf(wb), `${id}.yaml`)
}
const stamp = (d = new Date()) => coreStamp('t', d)

/** 손으로 옮긴 자리. 틀린 칸은 진단으로 알리고 빼고 읽는다 */
export function readLayout(wb: Workbench, diags: Diag[] = []): FlowLayout {
  const p = path.join(dirOf(wb), LAYOUT)
  let y: unknown
  try { y = YAML.parse(fs.readFileSync(p, 'utf8')) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') diags.push({ file: path.posix.join(path.basename(wb.root), FLOW_DIR, LAYOUT), code: 'layout', line: 1, message: tl(`자리 파일을 읽지 못했습니다: ${(e as Error).message}`, `Could not read the layout file: ${(e as Error).message}`) })
    return {}
  }
  const out: FlowLayout = {}
  const take = (cells: unknown) => {
    if (!cells || typeof cells !== 'object') return
    for (const [id, v] of Object.entries(cells as Record<string, unknown>)) {
      const c = (v as { c?: unknown })?.c, r = (v as { r?: unknown })?.r
      if (!out[id] && Number.isInteger(c) && (c as number) >= 0 && Number.isInteger(r)) out[id] = { c: c as number, r: r as number }
    }
  }
  const o = y as { dots?: unknown; topics?: unknown } | null
  take(o?.dots)
  // 10/14 오전의 주제별 자리 (topics: 주제 → 점 → 칸)도 읽는다. 다음에 쓸 때 dots로 옮겨진다
  if (o?.topics && typeof o.topics === 'object') for (const cells of Object.values(o.topics as Record<string, unknown>)) take(cells)
  return out
}

/** 보이는 줄 (rows: { top, bottom, names }, 중심선 기준). 없거나 틀리면 null = 앱의 기본 */
export function readRows(wb: Workbench): FlowRows | null {
  let y: unknown
  try { y = YAML.parse(fs.readFileSync(path.join(dirOf(wb), LAYOUT), 'utf8')) } catch { return null }
  const v = (y as { rows?: { top?: unknown; bottom?: unknown; names?: unknown } } | null)?.rows
  const top = v?.top, bottom = v?.bottom
  if (!(Number.isInteger(top) && Number.isInteger(bottom) && (top as number) <= 0 && (bottom as number) >= 0)) return null
  const names = rowNames(v?.names)
  return { top: top as number, bottom: bottom as number, ...(names && { names }) }
}

/** 줄 이름: 정수 줄 → 빈칸이 아닌 글. 없으면 undefined */
function rowNames(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, name] of Object.entries(v as Record<string, unknown>)) {
    const r = Number(k)
    if (Number.isInteger(r) && typeof name === 'string' && name.trim()) out[String(r)] = name.trim()
  }
  return Object.keys(out).length ? out : undefined
}

/** 점 하나 읽기 (없으면 404). 빈틈은 흐름 전부를 보고 계산한다 */
export function readFlowNode(wb: Workbench, id: string): FlowNode {
  const n = readFlowFile(wb, id)
  const scanned = scanFlow(wb).nodes.find((m) => m.id === id)
  return scanned && scanned.hash === n.hash ? scanned : n
}

function readFlowFile(wb: Workbench, id: string): FlowNode {
  const p = fileOf(wb, id)
  let content: string
  try { content = fs.readFileSync(p, 'utf8') } catch { throw new WorkbenchError(404, tl(`점 ${id}이 없습니다`, `No dot ${id}`)) }
  const diags: Diag[] = []
  const n = parseFlowNode(id, path.posix.join(path.basename(wb.root), FLOW_DIR, `${id}.yaml`), content, diags)
  if (!n) throw new WorkbenchError(422, diags[0]?.message ?? tl('점 파일을 읽지 못했습니다', 'Could not read the dot file'))
  return n
}

const checkHash = (n: FlowNode, baseHash: string) => {
  if (n.hash !== baseHash) throw new ConflictError(tl('그새 파일이 바뀌었습니다. 다시 읽은 뒤 고치세요', 'The file changed in the meantime. Read it again, then edit'), n.hash)
}

/** 짧은 제목에서 파일 이름: 영문·숫자만 남기고, 없으면 날짜. 겹치면 -2, -3 … */
function newId(wb: Workbench, short: string, now: Date): string {
  const base = short.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `step-${localDate(now)}`
  let id = base, i = 2
  while (fs.existsSync(path.join(dirOf(wb), `${id}.yaml`))) id = `${base}-${i++}`
  return id
}

const KEY_ORDER = ['format', 'kind', 'progress', 'result', 'short', 'title', 'topics', 'date', 'ended', 'by', 'task', 'start', 'from', 'fields', 'run', 'steps', 'reason', 'next', 'priority', 'end', 'integration', 'card', 'evidence', 'judgments', 'sources', 'guesses']

/**
 * 글로 쓰기: 원래 파일의 목록 들여쓰기를 따른다. 사람 · 파이썬이 쓴 파일은 "key:\n- a"(들여쓰지 않음)가 많고,
 * yaml 라이브러리 기본은 "key:\n  - a"라 고치지 않은 줄까지 바뀌었다 (10/20 점검: 바꾸지 않고 저장해도 150개 중 145개가 바뀜)
 */
export function flowYamlText(doc: YAML.Document, original = ''): string {
  return doc.toString({ lineWidth: 0, indentSeq: seqIndented(original) })
}

/** 원래 글의 첫 블록 목록이 키보다 들여써졌는가 (글 안의 "…:\n- " 줄에 속지 않게 파싱한 위치로 잰다). 목록이 없으면 라이브러리 기본(들여씀) */
function seqIndented(original: string): boolean {
  if (!original) return true
  const column = (at: number) => at - (original.lastIndexOf('\n', at - 1) + 1)
  let indented: boolean | undefined
  try {
    YAML.visit(YAML.parseDocument(original), {
      Pair(_, pair) {
        if (!YAML.isSeq(pair.value) || pair.value.flow || !YAML.isNode(pair.key) || !pair.key.range || !pair.value.range) return
        indented = column(pair.value.range[0]) > column(pair.key.range[0])
        return YAML.visit.BREAK
      },
    })
  } catch { /* 읽지 못하면 기본 */ }
  return indented ?? true
}

function write(wb: Workbench, id: string, doc: YAML.Document, original = ''): FlowNode {
  fs.mkdirSync(dirOf(wb), { recursive: true })
  writeAtomic(fileOf(wb, id), flowYamlText(doc, original))
  return readFlowNode(wb, id)
}

/** 키 순서와 상관없이 같은 값인가 */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))

/**
 * 원래 노드를 되도록 그대로 두고 새 값으로 맞춘다: 같은 값이면 그 노드(따옴표 · 주석 · 모양까지), 글자 하나면 값만,
 * 사전은 칸마다(원래 순서, 없어진 칸은 빼고 새 칸은 뒤에), 목록은 자리마다 같은 식으로. 그 밖에는 새 노드
 */
function reuseNode(doc: YAML.Document, old: unknown, value: unknown): unknown {
  const plain = YAML.isNode(old) ? old.toJSON() : old
  if (old !== undefined && canon(plain) === canon(value)) return old
  if (YAML.isScalar(old) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
    // 따옴표 모양은 두되, 글이 따옴표 없이는 다른 값으로 읽히면(예: 'yes', '2026-08-01' 같은 글) 라이브러리가 고르게 둔다
    old.value = value
    return old
  }
  if (YAML.isMap(old) && value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>
    // 빈 목록 · 빈 사전 칸(예: checks: [])은 없는 것과 뜻이 같다: 새 값에 없어도 지우지 않는다
    const empty = (n: unknown) => (YAML.isSeq(n) || YAML.isMap(n)) && n.items.length === 0
    for (const pair of [...old.items]) {
      const k = String(YAML.isScalar(pair.key) ? pair.key.value : pair.key)
      if (!(k in v)) { if (!empty(pair.value)) old.delete(pair.key) }
      else pair.value = reuseNode(doc, pair.value, v[k]) as typeof pair.value
    }
    for (const [k, x] of Object.entries(v)) if (!old.has(k)) old.set(k, doc.createNode(x))
    return old
  }
  if (YAML.isSeq(old) && Array.isArray(value)) {
    old.items = value.map((x, i) => (i < old.items.length ? reuseNode(doc, old.items[i], x) : doc.createNode(x))) as typeof old.items
    return old
  }
  return doc.createNode(value)
}

/** 칸 하나를 값으로: 있던 칸은 모양을 되도록 두고, 새 칸은 정한 순서의 자리에 (있는 칸의 순서는 건드리지 않는다) */
function setKey(doc: YAML.Document, k: string, v: unknown): void {
  const map = doc.contents
  if (!YAML.isMap(map)) { doc.set(k, doc.createNode(v)); return }
  const pair = map.items.find((p) => String(YAML.isScalar(p.key) ? p.key.value : p.key) === k)
  if (pair) { pair.value = reuseNode(doc, pair.value, v) as typeof pair.value; return }
  const rank = (x: unknown) => { const i = KEY_ORDER.indexOf(String(YAML.isScalar(x) ? x.value : x)); return i < 0 ? KEY_ORDER.length : i }
  const at = map.items.findIndex((p) => rank(p.key) > rank(k))
  const node = doc.createPair(k, v) as (typeof map.items)[number]
  if (at < 0) map.items.push(node); else map.items.splice(at, 0, node)
}

/** 시작 · 반영 기록 쓰기 (10/23, agent:start · agent:integrate): 그 칸 하나만 바꾼다 */
export function setFlowRecord(wb: Workbench, id: string, key: 'start' | 'integration', value: Record<string, unknown>, baseHash: string): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, baseHash)
  const original = fs.readFileSync(fileOf(wb, id), 'utf8')
  const doc = YAML.parseDocument(original)
  setKey(doc, key, Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length && key !== 'start'))))
  return write(wb, id, doc, original)
}

/** 카드 아래 일을 막는 까닭 (시작한 카드가 아니면). 막지 않으면 null */
export function cardBlock(card: FlowNode, byId: Map<string, FlowNode>): string | null {
  const st = cardState(card, byId)
  if (st === 'waiting') return tl(`카드 「${card.short}」의 사전 연구가 아직 승인되지 않았습니다`, `The prior work of card "${card.short}" is not approved yet`)
  if (st === 'ready') return tl(`카드 「${card.short}」를 사용자가 아직 시작하지 않았습니다`, `The user has not started card "${card.short}" yet`)
  if (st === 'ended') return tl(`카드 「${card.short}」는 종료되었습니다`, `Card "${card.short}" has ended`)
  return null
}

/** 대기열이 찼을 때의 말 */
export const queueFull = (n: number) => tl(`판단 대기 명제가 ${n}/${JUDGE_CAP}로 찼습니다. 사용자가 판단할 때까지 새 명제를 내지 않습니다. 낸 명제를 고치거나 반례를 확인하는 일은 됩니다`,
  `The judgment queue is full (${n}/${JUDGE_CAP}). Do not add findings until the user judges; revising submitted findings or checking counterexamples is fine`)

/** 새 점. 앞선 점(from)은 있는 점만 받는다. 에이전트의 점은 판단 설계(10/23)의 상한과 카드 시작을 따른다 */
export function createFlowNode(wb: Workbench, body: NewFlowBody, now = new Date()): FlowNode {
  const nodes = scanFlow(wb).nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const missing = (body.from ?? []).find((f) => !byId.has(f.id))
  if (missing) throw new WorkbenchError(400, tl(`앞선 점 ${missing.id}이 없습니다`, `No earlier dot ${missing.id}`))
  if (body.by?.trim() && body.by.trim() !== 'user') {
    const queued = judgmentQueue(nodes).length
    if (body.kind === 'finding' && queued >= JUDGE_CAP) throw new WorkbenchError(400, queueFull(queued))
    const block = body.kind === 'question' ? null : (body.from ?? []).map((f) => cardBlock(byId.get(f.id)!, byId)).find(Boolean)
    if (block) throw new WorkbenchError(400, tl(`${block}. 시작한 카드 아래에서만 일을 엽니다`, `${block}. Open work only under a started card`))
  }
  const id = newId(wb, body.short, now)
  const y: Record<string, unknown> = { format: FLOW_FORMAT, kind: body.kind, progress: body.progress ?? 'open', short: body.short.trim(), title: body.title?.trim() || body.short.trim(), ...(body.topics?.length && { topics: body.topics }), date: localDate(now), by: body.by?.trim() || 'user', ...(body.task?.trim() && { task: body.task.trim() }) }
  if (body.from?.length) y.from = body.from
  return write(wb, id, new YAML.Document(y))
}

/** 점 고치기: 보낸 칸만 바꾼다. 근거를 고쳐도 같은 ref·file의 확인 기록은 그대로 남는다 */
export function patchFlowNode(wb: Workbench, id: string, body: FlowPatchBody, now = new Date()): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, body.baseHash)
  const s = body.set
  if (s.from) {
    const ids = new Set(scanFlow(wb).nodes.map((m) => m.id))
    const bad = s.from.find((f) => f.id === id || !ids.has(f.id))
    if (bad) throw new WorkbenchError(400, tl(`앞선 점 ${bad.id}을 이을 수 없습니다`, `Cannot link earlier dot ${bad.id}`))
  }
  const original = fs.readFileSync(fileOf(wb, id), 'utf8')
  const doc = YAML.parseDocument(original)
  // 보낸 칸만, 그것도 값이 바뀐 곳만 고친다: 화면은 모든 칸을 보내므로 그대로 두면 고치지 않은 칸의 모양까지 바뀐다 (10/20 점검)
  const put = (k: string, v: unknown) => {
    if (v === undefined) return
    if (v === null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v && !Array.isArray(v) && !Object.keys(v).length)) { doc.delete(k); return }
    setKey(doc, k, v)
  }
  for (const k of ['kind', 'progress', 'short', 'title', 'topics', 'end', 'from', 'priority', 'task'] as const) put(k, s[k])
  // 시작일은 앱이 적는다: 날짜가 없던 옛 점은 처음 고칠 때 한 번 (10/21)
  if (!n.date) put('date', localDate(now))
  for (const k of ['reason', 'next'] as const) if (s[k] !== undefined) put(k, s[k]!.trim())
  if (s.run !== undefined) {
    const r = s.run && Object.fromEntries(Object.entries({ ...s.run, params: s.run.params && Object.fromEntries(Object.entries(s.run.params).map(([k, v]) => [k.trim(), v.trim()]).filter(([k, v]) => k && v)) })
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v && (typeof v !== 'object' || Object.keys(v).length)))
    put('run', r)
  }
  if (s.steps) {
    // 확인 기록은 같은 자리의 단계에 남는다. 글이 바뀌면 그 확인은 hash로 낡은 것이 된다
    put('steps', s.steps.map((st, i) => ({ text: st.text.trim(), ...(st.uses?.trim() && { uses: st.uses.trim() }), ...(n.steps[i]?.checks.length && { checks: n.steps[i]!.checks }) })))
  }
  if (s.fields) put('fields', Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)))
  const progress = s.progress ?? n.progress
  // 끝난 날: 끝남으로 넘어갈 때 적고, 다시 열면 지운다 (10/21)
  if (progress === 'done' && (n.progress !== 'done' || !n.ended)) put('ended', localDate(now))
  else if (progress !== 'done' && n.ended) put('ended', null)
  if (s.result !== undefined || progress !== 'done') put('result', progress === 'done' ? (s.result ?? n.result ?? 'solved') : null)
  else if (progress === 'done' && !n.result) put('result', 'solved')
  if (s.evidence) {
    // 같은 종류 · 같은 ref/file의 근거가 둘 이상이면 순서대로 짝짓는다 (한 Map에 겹쳐 두면 뒤 근거의 확인 기록이 앞 근거로 복사돼, 승인 안 된 증명이 승인된 것으로 바뀐다)
    const key = (e: { kind: string; ref?: string; file?: string }) => `${e.kind}|${e.ref ? `ref:${e.ref}` : `file:${e.file}`}`
    const old = new Map<string, FlowEvidence['checks'][]>()
    for (const e of n.evidence) old.set(key(e), [...(old.get(key(e)) ?? []), e.checks])
    put('evidence', s.evidence.map((e) => {
      const checks = old.get(key(e))?.shift() ?? []
      return { kind: e.kind, ...(e.title?.trim() && { title: e.title.trim() }), ...(e.file && { file: e.file }), ...(e.ref && { ref: e.ref }), ...(e.section?.trim() && { section: e.section.trim() }), text: e.text.trim(), ...(checks.length && { checks }) }
    }))
  }
  if (body.gate) {
    const after = parseFlowNode(id, n.file, flowYamlText(doc, original), [])
    if (after) {
      after.steps.forEach((x, i) => { x.checks = n.steps[i]?.checks ?? [] })
      const miss = flowGate(after, n)
      if (miss.length) throw new WorkbenchError(422, tl(`끝내기 전에 채울 칸: ${miss.join(' · ')}`, `Fill these before finishing: ${miss.join(' · ')}`))
    }
  }
  return write(wb, id, doc, original)
}

/** 사람 승인 또는 거두기: 확인 기록에 한 줄 덧붙인다 */
export function checkFlowEvidence(wb: Workbench, id: string, body: FlowCheckBody, by = 'user', now = new Date(), role: 'human' | 'agent' = 'human'): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, body.baseHash)
  const isStep = body.step !== undefined
  const idx = (isStep ? body.step : body.ev)!
  const none = () => new WorkbenchError(400, isStep ? tl('그 단계가 없습니다', 'No such step') : tl('그 근거가 없습니다', 'No such evidence'))
  const item = isStep ? n.steps[idx] : n.evidence[idx]
  if (!item) throw none()
  // 확인한 내용의 해시: 단계는 글 · 쓰는 것, 근거는 절(없으면 파일). 논문은 없음
  const ev = !isStep ? n.evidence[idx]! : undefined
  const h = isStep ? stepHash(n.steps[idx]!) : ev?.file ? evidenceHash(wb.repo, ev.file, ev.section) : undefined
  const hash = h && h !== 'missing' && h !== 'no-section' ? h : undefined
  const original = fs.readFileSync(fileOf(wb, id), 'utf8')
  const doc = YAML.parseDocument(original)
  // 읽을 때(parse)는 사전이 아닌 항목을 건너뛰고 번호를 매기므로, 파일에서도 사전 항목만 세어 같은 근거를 고른다 (단계는 글 하나로 적은 것도 센다)
  const list = doc.get(isStep ? 'steps' : 'evidence')
  let target = YAML.isSeq(list) ? (isStep ? list.items : list.items.filter((x) => YAML.isMap(x)))[idx] : undefined
  if (isStep && YAML.isSeq(list) && YAML.isScalar(target)) { const m = doc.createNode({ text: String(target.value) }); list.items[idx] = m; target = m }
  if (!YAML.isMap(target)) throw none()
  const map = target
  // 발견은 근거와 함께 진술 · 조건에도 묶는다 (10/23): 확인한 뒤 진술을 넓히면 그 확인은 낡는다
  const claim = n.kind === 'finding' && !isStep && !body.revoked ? claimHash(n) : undefined
  const rec = { at: stamp(now), by, role, ...(body.note?.trim() && { note: body.note.trim() }), ...(body.revoked && { revoked: true }), ...(hash && !body.revoked && { hash }), ...(claim && { claim }) }
  const seq = map.get('checks')
  if (YAML.isSeq(seq)) seq.add(doc.createNode(rec, { flow: true }))
  else map.set('checks', doc.createNode([rec], { flow: true }))
  return write(wb, id, doc, original)
}

/**
 * 사람 판단 (10/23 "판단 설계"): 판단 기록에 한 줄 덧붙인다. 발견은 승인 · 수정 · 기각, 카드가 있는 질문은 시작 · 수정 · 종료.
 * 판단한 내용(발견의 진술 · 조건, 카드의 질문 · 완료 조건)의 해시를 claim으로 적어, 뒤에 바뀌면 그 판단이 낡는다
 */
export function judgeFlow(wb: Workbench, id: string, body: FlowJudgeBody, by = 'user', now = new Date()): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, body.baseHash)
  if (n.kind === 'question' && !n.card) throw new WorkbenchError(400, tl('카드가 아닌 질문은 판단하지 않습니다', 'Only a question with a card is judged'))
  if (!verdictFits(n.kind, body.verdict)) throw new WorkbenchError(400, tl(`${n.kind} 점에는 ${body.verdict} 판단을 쓸 수 없습니다`, `A ${n.kind} dot cannot take the verdict ${body.verdict}`))
  if (body.verdict === 'start') {
    // 판단 전 사전 연구로는 시작하지 않는다 (10/23)
    const byId = new Map(scanFlow(wb).nodes.map((x) => [x.id, x]))
    const open = n.card!.givens.filter((g) => byId.get(g)?.verdict !== 'approve')
    if (open.length) throw new WorkbenchError(400, tl(`사전 연구가 아직 승인되지 않았습니다: ${open.join(', ')}. 먼저 판단하세요`, `Prior work is not approved yet: ${open.join(', ')}. Judge it first`))
  }
  const original = fs.readFileSync(fileOf(wb, id), 'utf8')
  const doc = YAML.parseDocument(original)
  const rec = { at: stamp(now), by, verdict: body.verdict, ...(body.note?.trim() && { note: body.note.trim() }), claim: judgmentHash(n) }
  const seq = doc.get('judgments')
  if (YAML.isSeq(seq)) seq.add(doc.createNode(rec, { flow: true }))
  else {
    setKey(doc, 'judgments', [rec])
    const added = doc.get('judgments')
    if (YAML.isSeq(added) && YAML.isMap(added.items[0])) added.items[0].flow = true
  }
  return write(wb, id, doc, original)
}

/** 에이전트 검토 (MCP flow_review): role agent로 덧붙인다. 사람 승인은 앱에서만 */
export function reviewFlow(wb: Workbench, id: string, body: FlowReviewBody, now = new Date()): FlowNode {
  const { by, ...rest } = body
  return checkFlowEvidence(wb, id, rest, by, now, 'agent')
}

/** 지난 시도 찾기: 낱말이 짧은 제목 · 제목 · 설명 · 매개변수 · 이유에 몇 번 걸리나. 많이 걸린 것부터 10개 */
export function searchFlow(wb: Workbench, q: string, limit = 10): FlowSearchReply {
  const words = q.toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length >= 2)
  if (!words.length) return { rows: [] }
  const rows: FlowSearchReply['rows'] = []
  for (const n of scanFlow(wb).nodes) {
    const hay = [n.id, n.short, n.title, ...Object.values(n.fields), ...Object.entries(n.run?.params ?? {}).map(([k, v]) => `${k} ${v}`), n.run?.code ?? '', n.reason ?? '', n.next ?? ''].join(' ').toLowerCase()
    const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0)
    if (!score) continue
    const state = n.theorem ? 'theorem' : n.progress === 'done' ? (n.result ?? 'solved') : n.progress
    const clip = (s?: string) => s && (s.length > 200 ? `${s.slice(0, 199)}…` : s)
    rows.push({ id: n.id, kind: n.kind, state, short: n.short, title: n.title, ...(n.date && { date: n.date }), ...(n.run?.params && { params: n.run.params }), ...(n.fields.result && { result: clip(n.fields.result) }), ...(n.reason && { reason: clip(n.reason) }), score })
  }
  rows.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? ''))
  return { rows: rows.slice(0, limit) }
}

/** 지운 점과 그 점의 기록을 두는 곳 (flow/.trash/). 앱은 읽지 않고, 되살릴 때는 손으로 옮긴다 */
export const FLOW_TRASH = '.trash'

/**
 * 점 지우기: 이 점을 가리키던 선(다른 점의 from)과 자리를 빼고, 점 파일과 그 점의 기록(comments/flow-<id>.md)은
 * flow/.trash/로 옮긴다 (10/17 사용자 결정 "옮김": 기록 탭 · STATUS에 없는 점의 기록이 남지 않게, 노트 지우기처럼 되살릴 수 있게)
 */
export function deleteFlowNode(wb: Workbench, id: string, baseHash: string, now = new Date()): { id: string; changed: string[]; trashed: string[] } {
  const n = readFlowNode(wb, id)
  checkHash(n, baseHash)
  const others = scanFlow(wb).nodes // 지우기 전에 읽는다 (지운 뒤에는 없는 점을 가리키는 선이 빠져 읽힌다)
  const trash = path.join(dirOf(wb), FLOW_TRASH)
  const tag = `${id}-${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}`
  fs.mkdirSync(trash, { recursive: true })
  const trashed: string[] = []
  const move = (from: string, name: string) => {
    if (!fs.existsSync(from)) return
    const to = path.join(trash, name)
    fs.renameSync(from, to)
    trashed.push(path.posix.join(path.basename(wb.root), path.relative(wb.root, to).split(path.sep).join('/')))
  }
  move(fileOf(wb, id), `${tag}.yaml`)
  move(path.join(wb.root, 'comments', `flow-${commentTargetSlug(id)}.md`), `${tag}.comments.md`)
  const changed: string[] = []
  for (const m of others) {
    if (!m.from.some((f) => f.id === id)) continue
    const original = fs.readFileSync(fileOf(wb, m.id), 'utf8')
    const doc = YAML.parseDocument(original)
    const seq = doc.get('from')
    if (!YAML.isSeq(seq)) continue
    seq.items = seq.items.filter((it) => { const v = YAML.isMap(it) ? it.get('id') : YAML.isScalar(it) ? it.value : it; return String(v) !== id })
    if (!seq.items.length) doc.delete('from')
    writeAtomic(fileOf(wb, m.id), flowYamlText(doc, original))
    changed.push(m.id)
  }
  const layout = readLayout(wb)
  if (layout[id]) { delete layout[id]; writeLayout(wb, layout) }
  return { id, changed, trashed }
}

function writeLayout(wb: Workbench, layout: FlowLayout, rows: FlowRows | null = readRows(wb)) {
  const names = rowNames(rows?.names)
  const doc = new YAML.Document({ ...(rows && { rows: { top: rows.top, bottom: rows.bottom, ...(names && { names: new Map(Object.entries(names).map(([k, v]) => [Number(k), v] as const).sort((a, b) => a[0] - b[0])) }) } }), dots: Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, { c: v.c, r: v.r }])) })
  YAML.visit(doc, { Map(_, node) { if (node.has('c') || (node.has('top') && !node.has('names'))) node.flow = true } })
  fs.mkdirSync(dirOf(wb), { recursive: true })
  writeAtomic(path.join(dirOf(wb), LAYOUT), '# 흐름 차트에서 손으로 옮긴 자리 (앱이 씀). rows: 보이는 줄 (중심선 기준 맨 위·맨 아래)과 줄 이름(names), dots: 점 → 칸 (c 열, r 중심선 기준 줄)\n' + doc.toString({ lineWidth: 0 }))
}

/** 점 하나의 자리 정하기·풀기 (쓰기 바로 전에 다시 읽어 그 칸만 바꾼다) */
export function setFlowLayout(wb: Workbench, body: FlowLayoutBody): FlowLayout {
  readFlowNode(wb, body.id)
  const layout = readLayout(wb)
  const cells = layout
  if (body.at) {
    // 그 칸에 다른 점이 손으로 놓여 있으면 자리를 바꾼다
    const prev = cells[body.id]
    const other = Object.entries(cells).find(([k, v]) => k !== body.id && v.c === body.at!.c && v.r === body.at!.r)
    if (other) { if (prev) cells[other[0]] = prev; else delete cells[other[0]] }
    cells[body.id] = body.at
  } else delete cells[body.id]
  writeLayout(wb, layout)
  return readLayout(wb)
}

/**
 * 보이는 줄과 줄 이름 정하기 (＋ 줄 · × · 연필). 점이 있는 줄은 늘 보이므로 여기서는 범위만 적는다.
 * names를 보내지 않으면 있던 이름을 두고, 범위 밖으로 나간 줄의 이름은 뺀다
 */
export function setFlowRows(wb: Workbench, rows: FlowRows): FlowRows {
  const layout = readLayout(wb)
  const used = new Set(Object.values(layout).map((v) => v.r))
  const names = Object.fromEntries(Object.entries(rows.names ?? readRows(wb)?.names ?? {}).filter(([k]) => { const r = Number(k); return (r >= rows.top && r <= rows.bottom) || used.has(r) }))
  writeLayout(wb, layout, { top: rows.top, bottom: rows.bottom, names })
  return readRows(wb) ?? { top: rows.top, bottom: rows.bottom }
}

/**
 * 줄 옮기기 (10/20 사용자: ▶나 줄 이름을 끌어): from 줄을 to 자리로 옮기고 그 사이 줄은 한 칸씩 민다.
 * 점의 자리는 화면이 계산하므로 지금 자리(cells)를 받아 옮긴 뒤 자리로 적는다(손으로 놓은 자리가 된다). 줄 이름도 함께 옮긴다
 */
export function moveFlowRow(wb: Workbench, body: FlowRowMove): { rows: FlowRows; layout: FlowLayout } {
  const { from, to } = body
  const shift = (r: number) => r === from ? to : from < to && r > from && r <= to ? r - 1 : from > to && r >= to && r < from ? r + 1 : r
  const layout = readLayout(wb)
  const known = new Set(scanFlow(wb).nodes.map((n) => n.id))
  for (const [id, v] of Object.entries(body.cells)) if (known.has(id)) layout[id] = { c: v.c, r: v.r }
  for (const v of Object.values(layout)) v.r = shift(v.r)
  const old = readRows(wb)
  const rs = Object.values(layout).map((v) => v.r)
  const top = Math.min(0, old?.top ?? 0, to, ...rs), bottom = Math.max(0, old?.bottom ?? 0, to, ...rs)
  const names = Object.fromEntries(Object.entries(old?.names ?? {}).map(([k, v]) => [String(shift(Number(k))), v]))
  writeLayout(wb, layout, { top, bottom, names })
  return { rows: readRows(wb) ?? { top, bottom }, layout: readLayout(wb) }
}
