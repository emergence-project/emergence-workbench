// 연구 흐름 (workbench/flow/<id>.yaml): 점 하나 = 생각의 한 걸음. 형식은 docs/repo-format.md §14
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hashOf, isBackupCopy } from './fsutil.js'
import type { Workbench } from './workbench.js'
import { t as tl } from './i18n.js'
import { FLOW_EDGES, FLOW_EVIDENCE, FLOW_KINDS, FLOW_PROGRESS, FLOW_RESULTS, type FlowEvidence, type FlowNode, type FlowScan } from '@rw/core/contract/flow'

export const FLOW_DIR = 'flow'
export const FLOW_FORMAT = 1
const ID = /^[a-z0-9][a-z0-9-]*$/

type Diag = FlowScan['diagnostics'][number]
const str = (v: unknown): string | undefined => typeof v === 'string' ? v.trim() || undefined : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString().slice(0, 10) : undefined
const strs = (v: unknown): string[] => Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : str(v) ? [str(v)!] : []
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.includes(v as T) ? v as T : undefined

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
  if (!topics.length) bad('topics', 'Write at least one topic id in topics; the dot shows on no topic screen.', 'topics에 주제 id를 하나 이상 적으세요. 어느 주제 화면에도 보이지 않습니다.')
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
      checks.push({ at, by, role, ...(str(r.note) && { note: str(r.note) }) })
    }
    evidence.push({ kind: ek, text: str(o.text) ?? '', ...(str(o.title) && { title: str(o.title) }), ...(fileRef && { file: fileRef }), ...(ref && { ref }), checks })
  }
  const theorem = kind === 'finding' && evidence.some((e) => e.kind === 'proof' && e.checks.some((c) => c.role === 'human'))
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
  const out: FlowScan = { nodes: [], diagnostics: [] }
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
