import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { fileCache } from './readCache.js'
import path from 'node:path'
import { WorkbenchError, type ProjectSources } from './workbench.js'
import { t } from './i18n.js'

/**
 * 프로젝트 자료: 읽을 논문(저장소 맨 위 *.bib)과 받아 둔 파일(workbench/materials/).
 * - 논문 PDF는 arXiv 번호(eprint)가 있으면 앱이 받아 materials/<인용 키>.pdf로 둔다.
 * - 발표자료·그림 등 다른 파일은 사용자가 materials/에 넣는다. PDF는 앱 안에서 보고, 그 밖(pptx·key 등)은 맥 앱으로 연다.
 * - materials/ 안에 자기 자신까지 무시하는 .gitignore를 두어 연구 저장소 git에 아무것도 나타나지 않게 한다. 저장소의 다른 파일은 건드리지 않는다.
 */
export interface BibEntry {
  key: string
  type: string
  title?: string
  author?: string
  /** 엮은이 (책) */
  editor?: string
  year?: string
  eprint?: string
  doi?: string
  journal?: string
  /** 책의 한 장이 실린 책 이름, 학회 발표집 이름 */
  booktitle?: string
  publisher?: string
  /** 받아 둔 PDF가 있으면 materials/ 안 파일 이름 */
  file?: string
  /** 어느 .bib 파일에서 왔는지 */
  source: string
}

export interface MaterialFile {
  /** workbench/materials/의 파일은 이름만, sources.materials 폴더의 파일은 저장소 기준 경로 */
  name: string
  size: number
  mtime: number
  kind: 'pdf' | 'slides' | 'image' | 'other'
  /** 이 파일이 어느 논문(인용 키)의 PDF인지 */
  bibKey?: string
}

export const MATERIALS_DIR = 'materials'
const MAX_DOWNLOAD = 60 * 1024 * 1024

/** 아주 단순한 BibTeX 읽기: @type{key, field = {…} | "…" | 숫자, …}. 중괄호 안의 중괄호를 센다 */
export function parseBib(text: string, source = ''): BibEntry[] {
  const out: BibEntry[] = []
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const type = m[1]!.toLowerCase()
    if (type === 'comment' || type === 'string' || type === 'preamble') continue
    const entry: BibEntry = { key: m[2]!, type, source }
    let i = re.lastIndex
    let depth = 1
    // 항목 끝(바깥 중괄호)까지 필드를 읽는다
    while (i < text.length && depth > 0) {
      const f = /\s*,?\s*(\w+)\s*=\s*/y
      f.lastIndex = i
      const fm = f.exec(text)
      if (!fm) {
        if (text[i] === '}') { depth = 0; i++; break }
        i++
        continue
      }
      i = f.lastIndex
      let value = ''
      if (text[i] === '{') {
        let d = 0
        const start = i
        for (; i < text.length; i++) {
          if (text[i] === '{') d++
          else if (text[i] === '}' && --d === 0) { i++; break }
        }
        value = text.slice(start + 1, i - 1)
      } else if (text[i] === '"') {
        const end = text.indexOf('"', i + 1)
        value = text.slice(i + 1, end < 0 ? text.length : end)
        i = end < 0 ? text.length : end + 1
      } else {
        const vm = /[^,}\s]+/y
        vm.lastIndex = i
        value = vm.exec(text)?.[0] ?? ''
        i = vm.lastIndex || i + 1
      }
      const name = fm[1]!.toLowerCase()
      const clean = value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
      if (name === 'title' || name === 'author' || name === 'editor' || name === 'year' || name === 'eprint' || name === 'doi' || name === 'journal' || name === 'booktitle' || name === 'publisher') entry[name] = clean
    }
    re.lastIndex = i
    out.push(entry)
  }
  return out
}

const kindOf = (name: string): MaterialFile['kind'] => {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.pptx' || ext === '.ppt' || ext === '.key' || ext === '.odp') return 'slides'
  if (/^\.(png|jpe?g|gif|svg|webp)$/.test(ext)) return 'image'
  return 'other'
}

export function materialsDir(wbRoot: string): string { return path.join(wbRoot, MATERIALS_DIR) }

/** materials/를 만들고, 받은 파일이 연구 저장소 git에 들어가지 않게 자체 .gitignore를 둔다 */
export function ensureMaterialsDir(wbRoot: string): string {
  const dir = materialsDir(wbRoot)
  fs.mkdirSync(dir, { recursive: true })
  const ignore = path.join(dir, '.gitignore')
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '# 연구 작업대: 받은 논문·자료는 git에 넣지 않는다 (용량). 이 파일까지 무시해 저장소 git status에 나타나지 않는다. 목록의 정본은 refs.bib\n*\n')
  return dir
}

const NO_SOURCES: ProjectSources = { canon: [], bib: [], materials: [], reviews: [], manuscripts: [] }

function filesIn(dir: string, nameOf: (file: string) => string): MaterialFile[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => !n.startsWith('.')).flatMap((n) => {
    const st = fs.statSync(path.join(dir, n))
    return st.isFile() ? [{ name: nameOf(n), size: st.size, mtime: st.mtimeMs, kind: kindOf(n) }] : []
  })
}

const cachedBib = fileCache((raw) => parseBib(raw))
export function listMaterials(wbRoot: string, sources: ProjectSources = NO_SOURCES): { bib: BibEntry[]; files: MaterialFile[]; dir: string } {
  const repo = path.dirname(wbRoot)
  const dir = materialsDir(wbRoot)
  const files: MaterialFile[] = [
    ...filesIn(dir, (n) => n),
    ...sources.materials.flatMap((d) => filesIn(path.join(repo, d), (n) => `${d}/${n}`)),
  ]
  // bib: research.yaml의 sources.bib, 없으면 저장소 맨 위 *.bib
  const bibFiles = sources.bib.length ? sources.bib : fs.readdirSync(repo).filter((n) => n.endsWith('.bib')).sort()
  const bib = bibFiles.flatMap((n) => cachedBib(path.join(repo, n)).map((e) => ({ ...e, source: n })))
  for (const e of bib) {
    const f = files.find((x) => x.name === `${e.key}.pdf`)
    if (f) { e.file = f.name; f.bibKey = e.key }
  }
  return { bib, files: files.sort((a, b) => b.mtime - a.mtime), dir }
}

/** 자료 파일 경로. workbench/materials/의 이름이거나, sources.materials 폴더 바로 아래 파일의 저장소 기준 경로만 받는다 */
export function materialPath(wbRoot: string, name: string, sources: ProjectSources = NO_SOURCES): string {
  if (!name || name.startsWith('.') || name.includes('..') || path.basename(name).startsWith('.')) throw new WorkbenchError(400, t('파일 이름이 올바르지 않음', 'Invalid file name'))
  const base = name.includes('/') ? path.dirname(name) : null
  if (base !== null && !sources.materials.includes(base)) throw new WorkbenchError(400, t('자료 폴더 밖의 파일', 'File outside the materials folders'))
  const file = base !== null ? path.join(path.dirname(wbRoot), name) : path.join(materialsDir(wbRoot), name)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`자료가 없음: ${name}`, `No such material: ${name}`))
  return file
}

export const contentTypeOf = (name: string): string => ({
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
} as Record<string, string>)[path.extname(name).toLowerCase()] ?? 'application/octet-stream'

/** arXiv 번호가 있는 논문의 PDF를 받아 materials/<키>.pdf로 둔다 */
export async function fetchArxiv(wbRoot: string, key: string, fetchImpl: typeof fetch = fetch, sources: ProjectSources = NO_SOURCES): Promise<MaterialFile> {
  const entry = listMaterials(wbRoot, sources).bib.find((e) => e.key === key)
  if (!entry) throw new WorkbenchError(404, t(`bib에 없는 키: ${key}`, `Key not in bib: ${key}`))
  if (!entry.eprint) throw new WorkbenchError(400, t(`${key}에는 arXiv 번호(eprint)가 없습니다`, `${key} has no arXiv number (eprint)`))
  if (!/^[\w.\-/]+$/.test(entry.eprint)) throw new WorkbenchError(400, t(`arXiv 번호가 올바르지 않음: ${entry.eprint}`, `Invalid arXiv number: ${entry.eprint}`))
  const res = await fetchImpl(`https://arxiv.org/pdf/${entry.eprint}`, { signal: AbortSignal.timeout(60_000), redirect: 'follow' })
  if (!res.ok) throw new WorkbenchError(502, t(`arXiv에서 받지 못했습니다 (${res.status})`, `Could not download from arXiv (${res.status})`))
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_DOWNLOAD) throw new WorkbenchError(502, t('PDF가 너무 큽니다', 'The PDF is too large'))
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new WorkbenchError(502, t('arXiv가 PDF가 아닌 응답을 주었습니다', 'arXiv did not return a PDF'))
  const dir = ensureMaterialsDir(wbRoot)
  const name = `${key}.pdf`
  const tmp = path.join(dir, `.${name}.part`)
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, path.join(dir, name))
  const st = fs.statSync(path.join(dir, name))
  return { name, size: st.size, mtime: st.mtimeMs, kind: 'pdf', bibKey: key }
}

/** 맥 앱으로 열기 (발표자료 등 브라우저가 못 그리는 파일). 맥이 아니면 거절 */
/** Finder에서 그 파일을 고른 채로 폴더를 연다 (맥) */
export function revealInFinder(file: string): Promise<void> {
  if (process.platform !== 'darwin') return Promise.reject(new WorkbenchError(501, t('맥에서만 Finder로 볼 수 있습니다', 'Showing in Finder works only on a Mac')))
  return new Promise((resolve, reject) => execFile('open', ['-R', file], (e) => (e ? reject(new WorkbenchError(500, e.message)) : resolve())))
}

/** 시스템 앱으로 여는 파일 종류: 문서·그림·글만. 받은(clone) 저장소의 .command·.app·스크립트는 열지(실행하지) 않는다 */
export const OPENABLE = /\.(pdf|key|pages|numbers|pptx?|docx?|xlsx?|png|jpe?g|gif|svg|webp|tiff?|eps|ai|txt|md|csv|tex|bib)$/i

export function openWithSystem(file: string): Promise<void> {
  if (!OPENABLE.test(file)) return Promise.reject(new WorkbenchError(415, t(`이 종류의 파일은 앱에서 열지 않습니다: ${path.basename(file)}`, `The app does not open this kind of file: ${path.basename(file)}`)))
  if (process.platform !== 'darwin') return Promise.reject(new WorkbenchError(501, t('맥에서만 열 수 있습니다', 'Opening works only on a Mac')))
  return new Promise((resolve, reject) => execFile('open', [file], (e) => (e ? reject(new WorkbenchError(500, e.message)) : resolve())))
}
