// 연구 흐름 (workbench/flow/<id>.yaml): 점 하나 = 생각의 한 걸음. 형식은 docs/repo-format.md §14
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hashOf, isBackupCopy, localDate, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'
import { t as tl } from './i18n.js'
import { commentTargetSlug, stamp as coreStamp } from '@rw/core'
import { FLOW_EDGES, FLOW_EVIDENCE, FLOW_KINDS, FLOW_PROGRESS, FLOW_RESULTS, type FlowCheckBody, type FlowEvidence, type FlowLayout, type FlowLayoutBody, type FlowNode, type FlowPatchBody, type FlowRows, type FlowScan, type NewFlowBody } from '@rw/core/contract/flow'

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

/** 보이는 줄 (rows: { top, bottom }, 중심선 기준). 없거나 틀리면 null = 앱의 기본 */
export function readRows(wb: Workbench): FlowRows | null {
  let y: unknown
  try { y = YAML.parse(fs.readFileSync(path.join(dirOf(wb), LAYOUT), 'utf8')) } catch { return null }
  const v = (y as { rows?: { top?: unknown; bottom?: unknown } } | null)?.rows
  const top = v?.top, bottom = v?.bottom
  return Number.isInteger(top) && Number.isInteger(bottom) && (top as number) <= 0 && (bottom as number) >= 0 ? { top: top as number, bottom: bottom as number } : null
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
  const original = fs.readFileSync(fileOf(wb, id), 'utf8')
  const doc = YAML.parseDocument(original)
  // 보낸 칸만, 그것도 값이 바뀐 곳만 고친다: 화면은 모든 칸을 보내므로 그대로 두면 고치지 않은 칸의 모양까지 바뀐다 (10/20 점검)
  const put = (k: string, v: unknown) => {
    if (v === undefined) return
    if (v === null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v && !Array.isArray(v) && !Object.keys(v).length)) { doc.delete(k); return }
    const map = doc.contents
    if (!YAML.isMap(map)) { doc.set(k, doc.createNode(v)); return }
    const pair = map.items.find((p) => String(YAML.isScalar(p.key) ? p.key.value : p.key) === k)
    if (pair) { pair.value = reuseNode(doc, pair.value, v) as typeof pair.value; return }
    // 새 칸은 정한 순서의 자리에 (있는 칸의 순서는 건드리지 않는다)
    const rank = (x: unknown) => { const i = KEY_ORDER.indexOf(String(YAML.isScalar(x) ? x.value : x)); return i < 0 ? KEY_ORDER.length : i }
    const at = map.items.findIndex((p) => rank(p.key) > rank(k))
    const node = doc.createPair(k, v) as (typeof map.items)[number]
    if (at < 0) map.items.push(node); else map.items.splice(at, 0, node)
  }
  for (const k of ['kind', 'progress', 'short', 'title', 'topics', 'date', 'end', 'from'] as const) put(k, s[k])
  if (s.fields) put('fields', Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)))
  const progress = s.progress ?? n.progress
  if (s.result !== undefined || progress !== 'done') put('result', progress === 'done' ? (s.result ?? n.result ?? 'solved') : null)
  else if (progress === 'done' && !n.result) put('result', 'solved')
  if (s.evidence) {
    // 같은 종류 · 같은 ref/file의 근거가 둘 이상이면 순서대로 짝짓는다 (한 Map에 겹쳐 두면 뒤 근거의 확인 기록이 앞 근거로 복사돼, 승인 안 된 증명이 승인된 것으로 바뀐다)
    const key = (e: { kind: string; ref?: string; file?: string }) => `${e.kind}|${e.ref ? `ref:${e.ref}` : `file:${e.file}`}`
    const old = new Map<string, FlowEvidence['checks'][]>()
    for (const e of n.evidence) old.set(key(e), [...(old.get(key(e)) ?? []), e.checks])
    put('evidence', s.evidence.map((e) => {
      const checks = old.get(key(e))?.shift() ?? []
      return { kind: e.kind, ...(e.title?.trim() && { title: e.title.trim() }), ...(e.file && { file: e.file }), ...(e.ref && { ref: e.ref }), text: e.text.trim(), ...(checks.length && { checks }) }
    }))
  }
  return write(wb, id, doc, original)
}

/** 사람 승인 또는 거두기: 확인 기록에 한 줄 덧붙인다 */
export function checkFlowEvidence(wb: Workbench, id: string, body: FlowCheckBody, by = 'user', now = new Date()): FlowNode {
  const n = readFlowNode(wb, id)
  checkHash(n, body.baseHash)
  if (!n.evidence[body.ev]) throw new WorkbenchError(400, tl('그 근거가 없습니다', 'No such evidence'))
  const original = fs.readFileSync(fileOf(wb, id), 'utf8')
  const doc = YAML.parseDocument(original)
  // 읽을 때(parse)는 사전이 아닌 항목을 건너뛰고 번호를 매기므로, 파일에서도 사전 항목만 세어 같은 근거를 고른다
  const list = doc.get('evidence')
  const ev = YAML.isSeq(list) ? list.items.filter((x) => YAML.isMap(x))[body.ev] : undefined
  if (!YAML.isMap(ev)) throw new WorkbenchError(400, tl('그 근거가 없습니다', 'No such evidence'))
  const rec = { at: stamp(now), by, role: 'human', ...(body.note?.trim() && { note: body.note.trim() }), ...(body.revoked && { revoked: true }) }
  const seq = ev.get('checks')
  if (YAML.isSeq(seq)) seq.add(doc.createNode(rec, { flow: true }))
  else ev.set('checks', doc.createNode([rec], { flow: true }))
  return write(wb, id, doc, original)
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
  const doc = new YAML.Document({ ...(rows && { rows }), dots: Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, { c: v.c, r: v.r }])) })
  YAML.visit(doc, { Map(_, node) { if (node.has('c') || node.has('top')) node.flow = true } })
  fs.mkdirSync(dirOf(wb), { recursive: true })
  writeAtomic(path.join(dirOf(wb), LAYOUT), '# 흐름 차트에서 손으로 옮긴 자리 (앱이 씀). rows: 보이는 줄 (중심선 기준 맨 위·맨 아래), dots: 점 → 칸 (c 열, r 중심선 기준 줄)\n' + doc.toString({ lineWidth: 0 }))
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

/** 보이는 줄 정하기 (＋ 줄 · ×). 점이 있는 줄은 늘 보이므로 여기서는 범위만 적는다 */
export function setFlowRows(wb: Workbench, rows: FlowRows): FlowRows {
  writeLayout(wb, readLayout(wb), rows)
  return readRows(wb) ?? rows
}
