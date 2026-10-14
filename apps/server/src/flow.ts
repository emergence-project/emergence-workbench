// 연구 흐름 (workbench/flow/<id>.yaml): 점 하나 = 생각의 한 걸음. 형식은 docs/repo-format.md §14
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hashOf, isBackupCopy, localDate, localTime, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'
import { t as tl } from './i18n.js'
import { FLOW_EDGES, FLOW_EVIDENCE, FLOW_KINDS, FLOW_PROGRESS, FLOW_RESULTS, type FlowCheckBody, type FlowEvidence, type FlowLayout, type FlowLayoutBody, type FlowNode, type FlowPatchBody, type FlowScan, type NewFlowBody } from '@rw/core/contract/flow'

export const FLOW_DIR = 'flow'
export const FLOW_FORMAT = 1
const ID = /^[a-z0-9][a-z0-9-]*$/

type Diag = FlowScan['diagnostics'][number]
const str = (v: unknown): string | undefined => typeof v === 'string' ? v.trim() || undefined : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString().slice(0, 10) : undefined
const strs = (v: unknown): string[] => Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : str(v) ? [str(v)!] : []
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.includes(v as T) ? v as T : undefined

/** 그 역할의 마지막 확인 기록이 거둔 것이 아니면 확인됨 */
export const approved = (e: FlowEvidence, role: 'agent' | 'human'): boolean => { const c = e.checks.filter((x) => x.role === role).pop(); return !!c && !c.revoked }

/** 파일 하나를 점으로. 읽을 수 없으면 null (까닭은 diags에) */
export function parseFlowNode(id: string, file: string, content: string, diags: Diag[]): FlowNode | null {
  const bad = (code: string, en: string, ko: string, line = 1) => diags.push({ file, code, line, message: tl(ko, en) })
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
    const checks: FlowEvidence['checks'] = []
    for (const c of Array.isArray(o.checks) ? o.checks : []) {
      const r = c as Record<string, unknown>
      const at = str(r?.at), by = str(r?.by), role = oneOf(['agent', 'human'] as const, r?.role)
      if (!at || !by || !role) { bad('checks', 'Each check needs at, by and role (agent or human).', '확인 기록마다 at, by, role(agent·human)이 있어야 합니다.'); continue }
      checks.push({ at, by, role, ...(str(r.note) && { note: str(r.note) }), ...(r.revoked === true && { revoked: true }) })
    }
    evidence.push({ kind: ek, text: str(o.text) ?? '', ...(str(o.title) && { title: str(o.title) }), ...(fileRef && { file: fileRef }), ...(ref && { ref }), checks })
  }
  const theorem = kind === 'finding' && evidence.some((e) => e.kind === 'proof' && approved(e, 'human'))
  return {
    id, file, hash: hashOf(content), kind, progress, ...(result && { result }), short, title: title ?? short, topics,
    ...(str(y.date) && { date: str(y.date) }), from, fields, ...(y.end === true && { end: true }), evidence,
    sources: strs(y.sources), guesses: strs(y.guesses), theorem,
  }
}

/** 흐름의 점 전부 (날짜·id 순). 없는 점을 가리키는 선은 진단으로 알린다 */
export function scanFlow(wb: Workbench): FlowScan {
  const dir = path.join(wb.root, FLOW_DIR)
  const rel = (n: string) => path.posix.join(path.basename(wb.root), FLOW_DIR, n)
  const out: FlowScan = { nodes: [], diagnostics: [], layout: {} }
  out.layout = readLayout(wb, out.diagnostics)
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
  return out
}

// ---------- 쓰기 (2단계, 10/14): 앱에서 점 만들기·고치기·지우기·사람 승인·자리 ----------

const LAYOUT = 'layout.yaml'
const dirOf = (wb: Workbench) => path.join(wb.root, FLOW_DIR)
const fileOf = (wb: Workbench, id: string) => {
  if (!ID.test(id)) throw new WorkbenchError(400, tl('점 id가 맞지 않습니다', 'Invalid dot id'))
  return path.join(dirOf(wb), `${id}.yaml`)
}
const stamp = (d = new Date()) => `${localDate(d)}T${localTime(d)}`

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

/** 점 하나 읽기 (없으면 404) */
export function readFlowNode(wb: Workbench, id: string): FlowNode {
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

const KEY_ORDER = ['format', 'kind', 'progress', 'result', 'short', 'title', 'topics', 'date', 'from', 'fields', 'end', 'evidence', 'sources', 'guesses']

function write(wb: Workbench, id: string, doc: YAML.Document): FlowNode {
  fs.mkdirSync(dirOf(wb), { recursive: true })
  writeAtomic(fileOf(wb, id), doc.toString({ lineWidth: 0 }))
  return readFlowNode(wb, id)
}

/** 새 점. 앞선 점(from)은 있는 점만 받는다 */
export function createFlowNode(wb: Workbench, body: NewFlowBody, now = new Date()): FlowNode {
  const ids = new Set(scanFlow(wb).nodes.map((n) => n.id))
  const missing = (body.from ?? []).find((f) => !ids.has(f.id))
  if (missing) throw new WorkbenchError(400, tl(`앞선 점 ${missing.id}이 없습니다`, `No earlier dot ${missing.id}`))
  const id = newId(wb, body.short, now)
  const y: Record<string, unknown> = { format: FLOW_FORMAT, kind: body.kind, progress: body.progress ?? 'open', short: body.short.trim(), title: body.title?.trim() || body.short.trim(), ...(body.topics?.length && { topics: body.topics }), date: localDate(now) }
  if (body.from?.length) y.from = body.from
  return write(wb, id, new YAML.Document(y))
}

/** 점 고치기: 보낸 칸만 바꾼다. 근거를 고쳐도 같은 ref·file의 확인 기록은 그대로 남는다 */
export function patchFlowNode(wb: Workbench, id: string, body: FlowPatchBody): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, body.baseHash)
  const s = body.set
  if (s.from) {
    const ids = new Set(scanFlow(wb).nodes.map((m) => m.id))
    const bad = s.from.find((f) => f.id === id || !ids.has(f.id))
    if (bad) throw new WorkbenchError(400, tl(`앞선 점 ${bad.id}을 이을 수 없습니다`, `Cannot link earlier dot ${bad.id}`))
  }
  const doc = YAML.parseDocument(fs.readFileSync(fileOf(wb, id), 'utf8'))
  const put = (k: string, v: unknown) => {
    if (v === undefined) return
    if (v === null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v && !Array.isArray(v) && !Object.keys(v).length)) doc.delete(k)
    else doc.set(k, doc.createNode(v))
  }
  for (const k of ['kind', 'progress', 'short', 'title', 'topics', 'date', 'end', 'from'] as const) put(k, s[k])
  if (s.fields) put('fields', Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)))
  const progress = s.progress ?? n.progress
  if (s.result !== undefined || progress !== 'done') put('result', progress === 'done' ? (s.result ?? n.result ?? 'solved') : null)
  else if (progress === 'done' && !n.result) put('result', 'solved')
  if (s.evidence) {
    const key = (e: { ref?: string; file?: string }) => e.ref ? `ref:${e.ref}` : `file:${e.file}`
    const old = new Map(n.evidence.map((e) => [key(e), e.checks]))
    put('evidence', s.evidence.map((e) => {
      const checks = old.get(key(e)) ?? []
      return { kind: e.kind, ...(e.title?.trim() && { title: e.title.trim() }), ...(e.file && { file: e.file }), ...(e.ref && { ref: e.ref }), text: e.text.trim(), ...(checks.length && { checks }) }
    }))
  }
  sortKeys(doc)
  return write(wb, id, doc)
}

/** 아는 칸은 정한 순서로 (모르는 칸은 뒤에 그대로) */
function sortKeys(doc: YAML.Document) {
  const map = doc.contents
  if (!YAML.isMap(map)) return
  const rank = (k: unknown) => { const i = KEY_ORDER.indexOf(String(YAML.isScalar(k) ? k.value : k)); return i < 0 ? KEY_ORDER.length : i }
  map.items.sort((a, b) => rank(a.key) - rank(b.key))
}

/** 사람 승인 또는 거두기: 확인 기록에 한 줄 덧붙인다 */
export function checkFlowEvidence(wb: Workbench, id: string, body: FlowCheckBody, by = 'user', now = new Date()): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, body.baseHash)
  if (!n.evidence[body.ev]) throw new WorkbenchError(400, tl('그 근거가 없습니다', 'No such evidence'))
  const doc = YAML.parseDocument(fs.readFileSync(fileOf(wb, id), 'utf8'))
  const ev = doc.getIn(['evidence', body.ev])
  if (!YAML.isMap(ev)) throw new WorkbenchError(400, tl('그 근거가 없습니다', 'No such evidence'))
  const rec = { at: stamp(now), by, role: 'human', ...(body.note?.trim() && { note: body.note.trim() }), ...(body.revoked && { revoked: true }) }
  const seq = ev.get('checks')
  if (YAML.isSeq(seq)) seq.add(doc.createNode(rec, { flow: true }))
  else ev.set('checks', doc.createNode([rec], { flow: true }))
  return write(wb, id, doc)
}

/** 점 지우기: 파일을 지우고, 이 점을 가리키던 선(다른 점의 from)과 자리를 뺀다 */
export function deleteFlowNode(wb: Workbench, id: string, baseHash: string): { id: string; changed: string[] } {
  const n = readFlowNode(wb, id)
  checkHash(n, baseHash)
  const others = scanFlow(wb).nodes // 지우기 전에 읽는다 (지운 뒤에는 없는 점을 가리키는 선이 빠져 읽힌다)
  fs.rmSync(fileOf(wb, id))
  const changed: string[] = []
  for (const m of others) {
    if (!m.from.some((f) => f.id === id)) continue
    const doc = YAML.parseDocument(fs.readFileSync(fileOf(wb, m.id), 'utf8'))
    const seq = doc.get('from')
    if (!YAML.isSeq(seq)) continue
    seq.items = seq.items.filter((it) => { const v = YAML.isMap(it) ? it.get('id') : YAML.isScalar(it) ? it.value : it; return String(v) !== id })
    if (!seq.items.length) doc.delete('from')
    writeAtomic(fileOf(wb, m.id), doc.toString({ lineWidth: 0 }))
    changed.push(m.id)
  }
  const layout = readLayout(wb)
  if (layout[id]) { delete layout[id]; writeLayout(wb, layout) }
  return { id, changed }
}

function writeLayout(wb: Workbench, layout: FlowLayout) {
  const doc = new YAML.Document({ dots: Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, { c: v.c, r: v.r }])) })
  YAML.visit(doc, { Map(_, node) { if (node.has('c')) node.flow = true } })
  fs.mkdirSync(dirOf(wb), { recursive: true })
  writeAtomic(path.join(dirOf(wb), LAYOUT), '# 흐름 차트에서 손으로 옮긴 자리 (앱이 씀). 점 → 칸 (c 열, r 중심선 기준 줄)\n' + doc.toString({ lineWidth: 0 }))
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
