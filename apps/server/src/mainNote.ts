import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { writeAtomic } from './fsutil.js'
import { WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'
import { editResearchYaml, researchHash } from './researchYaml.js'

/**
 * 메인 노트 정하기: 프로젝트의 원고 main .tex를 research.yaml의 sources.manuscript에 적는다.
 * - 후보는 저장소 안에서 \documentclass가 있는 .tex, 또는 머리 없이 \begin{document}부터 쓴 본문만 있는 노트 (빌드·보관·의존 폴더는 건너뜀)
 * - research.yaml은 주석과 순서를 그대로 둔 채 그 한 줄만 더한다. 이미 있으면 목록으로 바꿔 뒤에 더한다 (있던 것은 그대로, 첫째가 기본)
 * - 읽은 뒤 바깥에서 바뀌었으면 쓰지 않는다 (baseHash)
 */

const SKIP_DIRS = new Set(['.git', 'node_modules', '.build', 'build', 'dist', 'output', 'archive', 'legacy', '.venv', 'venv', '__pycache__'])
const MAX_DEPTH = 5
const MAX_SCAN = 300
const MAX_CANDIDATES = 40

export interface MainNoteCandidate { path: string; title: string }

export function mainNoteCandidates(wb: Workbench): { candidates: MainNoteCandidate[]; hash: string } {
  const repo = wb.repo
  const out: MainNoteCandidate[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_SCAN) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_SCAN) return
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.') && abs !== wb.root) walk(abs, depth + 1)
      } else if (e.isFile() && e.name.endsWith('.tex')) {
        const head = readHead(abs)
        if (/^[^%\n]*\\(?:documentclass|begin\{document\})/m.test(head)) out.push({ path: path.relative(repo, abs), title: titleOf(head) })
      }
    }
  }
  walk(repo, 0)
  const chosen = new Set(wb.readResearch().sources.manuscripts.map((m) => m.path))
  const fresh = out.filter((c) => !chosen.has(c.path))
  // 정본(sources.canon)에 적힌 것 → main.tex → 얕은 것 순
  const canon = new Set(wb.readResearch().sources.canon.map((c) => c.path))
  const rank = (c: MainNoteCandidate) => (canon.has(c.path) ? 0 : 2) + (path.basename(c.path) === 'main.tex' ? 0 : 1)
  fresh.sort((a, b) => rank(a) - rank(b) || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
  return { candidates: fresh.slice(0, MAX_CANDIDATES), hash: researchHash(wb) }
}

export function setMainNote(wb: Workbench, input: { path: unknown; name: unknown; baseHash: unknown }): { ok: true } | { ok: false; currentHash: string } {
  const repo = wb.repo
  if (typeof input.path !== 'string' || !/\.tex$/.test(input.path)) throw new WorkbenchError(400, t('path(.tex)가 필요함', 'path (.tex) is required'))
  const rel = path.normalize(input.path.trim())
  const abs = path.resolve(repo, rel)
  if (!abs.startsWith(repo + path.sep) || !fs.existsSync(abs)) throw new WorkbenchError(400, t('저장소 안에 없는 파일', 'The file is not in the repository'))
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : ''
  if (/[—]|\s-\s/.test(name)) throw new WorkbenchError(400, t('이름에 " — "나 " - "를 쓸 수 없음', 'The name cannot contain " — " or " - "'))

  const current = researchHash(wb)
  if (input.baseHash !== current) return { ok: false, currentHash: current }
  const text = fs.existsSync(wb.researchPath) ? fs.readFileSync(wb.researchPath, 'utf8') : ''
  const before = YAML.parseDocument(text)
  if (before.errors.length) throw new WorkbenchError(409, t('research.yaml을 읽지 못해 고치지 않음', 'Could not read research.yaml, so nothing was changed'))
  const relPath = path.relative(repo, abs)
  if (wb.readResearch().sources.manuscripts.some((m) => m.path === relPath)) throw new WorkbenchError(409, t(`이미 메인 노트임: ${relPath}`, `Already a main note: ${relPath}`))
  const had = before.toJS()?.sources?.manuscript as unknown
  const value = `${relPath}${name ? ` — ${name}` : ''}`
  const next = had == null ? insertManuscript(text, before.get('sources') != null, value) : appendManuscript(text, value)
  // 한 줄만 더했는지 확인: manuscript가 (있던 것 + 새 것)으로 읽히고, 나머지는 그대로
  const after = YAML.parseDocument(next)
  const rest = (d: YAML.Document) => { const j = (d.toJS() ?? {}) as Record<string, unknown>; const src = { ...((j.sources ?? {}) as object) } as Record<string, unknown>; delete src.manuscript; return JSON.stringify({ ...j, sources: src }) }
  const want = had == null ? value : [...(Array.isArray(had) ? had : [had]), value]
  if (next === text || after.errors.length || JSON.stringify(after.toJS()?.sources?.manuscript) !== JSON.stringify(want) || rest(after) !== rest(before)) {
    throw new WorkbenchError(409, t('research.yaml의 sources 모양이 달라 손대지 않음 — sources.manuscript에 직접 적어 주세요', 'sources in research.yaml has an unexpected shape, so it was left alone. Add it to sources.manuscript yourself'))
  }
  writeAtomic(wb.researchPath, next)
  return { ok: true }
}

/**
 * research.yaml 글자를 거의 그대로 두고 manuscript 한 줄만 넣는다 (주석·순서·줄 모양 유지).
 * sources: 블록이 있으면 그 바로 아래에, 없으면 파일 끝에 sources: 블록을 새로.
 */
function insertManuscript(text: string, hasSources: boolean, value: string): string {
  const scalar = yamlScalar(value)
  const lines = text.split('\n')
  if (!hasSources) {
    const body = text.length && !text.endsWith('\n') ? `${text}\n` : text
    return `${body}sources:\n  manuscript: ${scalar}\n`
  }
  const at = lines.findIndex((l) => /^sources:\s*(#.*)?$/.test(l))
  if (at < 0) return text
  const child = lines.slice(at + 1).find((l) => l.trim() && !l.trim().startsWith('#'))
  const indent = child && /^\s+/.test(child) ? child.match(/^\s+/)![0] : '  '
  lines.splice(at + 1, 0, `${indent}manuscript: ${scalar}`)
  return lines.join('\n')
}

/**
 * 이미 있는 manuscript에 하나 더: 한 줄이면 목록으로 바꾸고(있던 값은 글자 그대로 첫 항목), 목록이면 끝에 한 항목.
 * [a, b] 같은 한 줄 목록이나 알아보지 못한 모양이면 원문을 그대로 돌려준다 (호출한 쪽이 거절)
 */
function appendManuscript(text: string, value: string): string {
  const scalar = yamlScalar(value)
  const lines = text.split('\n')
  const at = lines.findIndex((l) => /^sources:\s*(#.*)?$/.test(l))
  if (at < 0) return text
  let end = at + 1
  while (end < lines.length && (!lines[end]!.trim() || /^\s/.test(lines[end]!) || lines[end]!.trim().startsWith('#'))) end++
  const i = lines.findIndex((l, n) => n > at && n < end && /^\s+manuscript:/.test(l))
  if (i < 0) return text
  const indent = lines[i]!.match(/^\s+/)![0]
  const raw = lines[i]!.slice(indent.length + 'manuscript:'.length).trim()
  if (raw && !raw.startsWith('#')) {
    if (/^[[{|>&*!]/.test(raw)) return text
    lines.splice(i, 1, `${indent}manuscript:`, `${indent}  - ${raw}`, `${indent}  - ${scalar}`)
    return lines.join('\n')
  }
  // 블록 목록: 항목은 더 깊거나 같은 깊이의 "- "
  let last = -1
  let itemIndent = `${indent}  `
  for (let n = i + 1; n < end; n++) {
    const l = lines[n]!
    if (!l.trim() || l.trim().startsWith('#')) continue
    const ind = l.match(/^\s*/)![0]
    if (ind.length > indent.length || (ind.length === indent.length && l.trim().startsWith('- '))) {
      if (l.trim().startsWith('- ') && last < 0) itemIndent = ind
      last = n
    } else break
  }
  if (last < 0) return text
  lines.splice(last + 1, 0, `${itemIndent}- ${scalar}`)
  return lines.join('\n')
}

const yamlScalar = (value: string) => (/^[^\s"'{[&*!|>%@`#-][^#]*$/.test(value) && !/:\s/.test(value) ? value : JSON.stringify(value))

export { researchHash }

function readHead(file: string): string {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(16384)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    return buf.subarray(0, n).toString('utf8')
  } finally { fs.closeSync(fd) }
}

function titleOf(head: string): string {
  const m = head.match(/\\title\s*(?:\[[^\]]*\])?\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/)
  return m ? m[1]!.replace(/\\\\/g, ' ').replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim() : ''
}

/**
 * 원고를 목록에서 빼기 (10/4 18:05 "쪼개서 연구노트로 만든 원고를 없애고 싶다"):
 * research.yaml의 sources.manuscript에서 그 항목만 지운다. 원고 파일은 그대로 두고, "＋ 메인 노트 더하기"로 다시 넣을 수 있다.
 */
export function unsetMainNote(wb: Workbench, input: { path: unknown }): { ok: true } {
  if (typeof input.path !== 'string' || !input.path.trim()) throw new WorkbenchError(400, t('path가 필요함', 'path is required'))
  const rel = path.normalize(input.path.trim())
  // manuscript 밖은 그대로인지 확인
  const rest = (s: string) => { const j = (YAML.parse(s) ?? {}) as Record<string, unknown>; const src = { ...((j.sources ?? {}) as object) } as Record<string, unknown>; delete src.manuscript; return JSON.stringify({ ...j, sources: src }) }
  editResearchYaml(wb, (doc, text) => {
    const pathOf = (v: unknown) => (typeof v === 'string' ? path.normalize(v.split(/\s+—\s+/)[0]!.trim()) : '')
    const node = doc.getIn(['sources', 'manuscript'], true)
    if (YAML.isSeq(node)) {
      const i = node.items.findIndex((it) => pathOf(YAML.isScalar(it) ? it.value : it) === rel)
      if (i < 0) throw new WorkbenchError(404, t(`메인 노트 목록에 없음: ${rel}`, `Not in the main note list: ${rel}`))
      node.items.splice(i, 1)
      if (!node.items.length) doc.deleteIn(['sources', 'manuscript'])
    } else if (YAML.isScalar(node) && pathOf(node.value) === rel) {
      doc.deleteIn(['sources', 'manuscript'])
    } else throw new WorkbenchError(404, t(`메인 노트 목록에 없음: ${rel}`, `Not in the main note list: ${rel}`))
    if (rest(doc.toString({ lineWidth: 0 })) !== rest(text)) throw new WorkbenchError(409, t('research.yaml의 다른 곳이 바뀔 것 같아 손대지 않음', 'Other parts of research.yaml would change, so it was left alone'))
  }, { lineWidth: 0 })
  return { ok: true }
}
