import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** stamp: 해시를 잰 때의 파일 상태 (fileStamp). 같으면 다시 읽지 않는다. 10/5 전 기록에는 없다 */
export interface InputHash { file: string; hash: string | null; stamp?: string }
export interface SuccessfulInputs {
  at: string
  inputs: InputHash[]
  contextHash: string
  complete: boolean
  changedDuringCompile: boolean
}
export interface PdfState {
  hasPdf: boolean
  pdfState: 'missing' | 'current' | 'stale' | 'unknown'
  lastSuccessAt?: string
  lastCompile?: { at: string; ok: boolean }
  /** 지금 보이는 PDF를 만든 컴파일 시각과, 그 컴파일에 오류가 있었는지 (10/5 사용자: 오류가 나도 PDF는 그대로 보여 주고 오류임을 알린다) */
  pdfAt?: string
  pdfErrors?: boolean
}
/** 지금 빌드 폴더에 있는 PDF를 만든 컴파일의 입력. ok: 그 컴파일이 오류 없이 끝났는지 */
export interface ShownPdf extends SuccessfulInputs { ok: boolean }

const SKIP_DIRS = new Set(['.git', '.build', '.conda', '.venv', 'venv', 'node_modules', '__pycache__', '.cache', '.mypy_cache', '.pytest_cache', '.tox', '.nox', '.next', 'site-packages', '.lake'])
const MAX_FILES = 30_000
const inside = (dir: string, file: string) => file === dir || file.startsWith(dir + path.sep)

/** Include ctime and inode so atomic replacements and restored mtimes are detected. */
export function fileStamp(file: string): string | null {
  try {
    const s = fs.statSync(file, { bigint: true })
    return s.isFile() ? `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}` : null
  } catch { return null }
}
export function fileHash(file: string): string | null {
  try { return createHash('sha256').update(fs.readFileSync(file)).digest('hex') } catch { return null }
}

/** Inventory metadata, not file contents. Only actual compile inputs are hashed later. */
export function beginInputs(repo: string, explicit: string[] = []): Map<string, string | null> {
  const found = new Map<string, string | null>()
  const visit = (dir: string) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (found.size >= MAX_FILES) return
      const file = path.join(dir, e.name)
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) visit(file) }
      // Do not follow directory symlinks or index whole environments outside the repository.
      else if (e.isFile() || e.isSymbolicLink()) found.set(file, fileStamp(file))
    }
  }
  visit(repo)
  for (const file of explicit) found.set(file, fileStamp(file))
  return found
}

const SYSTEM_ROOTS = ['/usr/local/texlive', '/usr/share/texlive', '/usr/share/texmf', '/var/lib/texmf', '/etc/texmf', '/System/Library/Fonts', '/Library/Fonts', '/usr/share/fonts']
const systemInput = (file: string) => SYSTEM_ROOTS.some((dir) => inside(dir, file))

/** Recorder files describe actual inputs; the chapter parser is deliberately not reused. */
export function recordedInputs(dir: string, out: string, base: string): { files: string[]; complete: boolean } {
  const files = new Set<string>()
  let complete = true
  const add = (name: string, cwd = dir) => {
    let file = path.resolve(cwd, name)
    // latexmk may express generated files relative to its output directory.
    if (!path.isAbsolute(name) && !fs.existsSync(file) && fs.existsSync(path.resolve(out, name))) file = path.resolve(out, name)
    if (!inside(out, file) && !systemInput(file)) files.add(file)
  }
  try {
    const lines = fs.readFileSync(path.join(out, `${base}.fls`), 'utf8').split('\n')
    const cwd = lines.find((l) => l.startsWith('PWD '))?.slice(4).trim() || dir
    if (!lines.some((l) => l.startsWith('INPUT '))) complete = false
    for (const line of lines) if (line.startsWith('INPUT ')) add(line.slice(6).trim(), cwd)
  } catch { complete = false }
  try {
    const lines = fs.readFileSync(path.join(out, `${base}.fdb_latexmk`), 'utf8').split('\n')
    if (lines[0]?.trim() !== '# Fdb version 4') complete = false
    else {
      let inputs = false
      for (const line of lines) {
        if (line.startsWith('[')) { inputs = true; continue }
        if (/^\s+\(/.test(line)) { inputs = false; continue }
        if (!inputs) continue
        const m = /^\s+"((?:[^"\\]|\\.)+)"\s+[-\d.]+\s+[-\d]+\s+\S+\s+"((?:[^"\\]|\\.)*)"/.exec(line)
        // Nonempty producer names refer to outputs of other latexmk rules.
        if (m && !m[2]) add(m[1]!.replace(/\\(["\\])/g, '$1'))
        else if (!m && /^\s+"/.test(line)) complete = false
      }
    }
  } catch { complete = false }
  return { files: [...files].sort(), complete }
}

export function finishInputs(start: Map<string, string | null>, files: string[]): { inputs: InputHash[]; complete: boolean; changed: boolean } {
  let complete = true
  let changed = false
  const inputs = [...new Set(files)].sort().map((file) => {
    const before = fileStamp(file)
    if (!start.has(file)) complete = false
    else if (start.get(file) !== before) changed = true
    const hash = fileHash(file)
    const after = fileStamp(file)
    if (after !== before) changed = true
    if (before !== null && hash === null) complete = false
    return { file, hash, ...(after !== null && after === before && { stamp: after }) }
  })
  return { inputs, complete, changed }
}

// PDF 탭이 몇 초마다 묻는다: 파일 상태가 기록 그대로면 해시를 다시 재지 않고, 바뀐 파일은 상태별로 한 번만 잰다
// (10/5 리뷰: 그림 40개·80MB 원고에서 한 번에 85ms, 그동안 서버의 다른 요청도 멈췄다)
const hashCache = new Map<string, string | null>()
function hashNow(file: string, stamp: string | null): string | null {
  if (stamp === null) return fileHash(file)
  const key = `${file}\n${stamp}`
  if (hashCache.has(key)) return hashCache.get(key)!
  const hash = fileHash(file)
  // 재는 사이에 바뀌었으면 기억하지 않는다
  if (fileStamp(file) === stamp) {
    if (hashCache.size >= 5000) hashCache.clear()
    hashCache.set(key, hash)
  }
  return hash
}

export function inputsChanged(saved: SuccessfulInputs, contextHash?: string): boolean {
  return saved.changedDuringCompile || (contextHash !== undefined && saved.contextHash !== contextHash)
    || saved.inputs.some(({ file, hash, stamp }) => {
      const now = fileStamp(file)
      return !(stamp !== undefined && now === stamp) && hashNow(file, now) !== hash
    })
}
