import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { acceptedSubjects, readSubjects, readYamlHash } from './subjects.js'
import { fileCache } from './readCache.js'
import { writeAtomic } from './fsutil.js'
import { isSafeKey, listMaterials, parseBib, type BibEntry } from './materials.js'
import type { Registry } from './registry.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'
import { frontMatter } from '@rw/core'

/**
 * 논문 라이브러리 (planning/proposal-2026-10-05-libraries.md §2, §5).
 * - 논문 정보는 research-library/references.bib 하나. 앱은 읽기만 한다(새 항목 더하기는 2단계).
 * - 관련 프로젝트는 research-library/papers.yaml에 bib 키별로 적는다. 프로젝트 bib에 같은 키가 있으면 저절로 이어진다.
 * - PDF는 설정의 PDF 폴더(여러 개, iCloud·Google Drive 가능)에서 <bib 키>.pdf로 찾는다. papers.yaml의 pdf:가 있으면 그 경로.
 *   클라우드에만 있는 파일(iCloud의 .<이름>.icloud 자리 표시, File Provider의 내용 없는 파일)은 "클라우드"로 보인다.
 */

export const PAPERS_FILE = 'papers.yaml'
export const LIBRARY_BIB = 'references.bib'
export const PAPER_COMMENTS_DIR = 'comments'

/**
 * 논문 코멘트: 코멘트 하나가 파일 하나, research-library/comments/<키>/<id>.md (Markdown + YAML 머리말, 제안 §3의 10/5 사용자 결정).
 * 여기서는 수를 세는 데 필요한 머리말(kind, state)만 읽는다.
 */
function paperComments(lib: string, key: string): { kind?: string; state?: string }[] {
  const dir = path.join(lib, PAPER_COMMENTS_DIR, key)
  if (!isSafeKey(key) || !fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.')).map((f) => {
    return cachedComment(path.join(dir, f))
  })
}

const cachedComment = fileCache((text): { kind?: string; state?: string } => {
  const f = frontMatter(text)
  try { const y = f ? YAML.parse(f.yaml) as Record<string, unknown> : {}; return { kind: String(y?.kind ?? ''), state: String(y?.state ?? '') } } catch { return {} }
})

export type PaperKind = 'paper' | 'book'
export type PdfWhere = 'local' | 'cloud' | 'none'

export interface PaperRow {
  key: string
  subjects?: string[]
  subjectsHash?: string
  /** bib 항목 종류 (article, book, misc …) */
  type: string
  /** 책인지 논문인지: bib 항목 종류에서 */
  kind: PaperKind
  title: string
  /** 성만, 나온 순서대로 */
  authors: string[]
  year?: string
  /** 저널, 책 이름(booktitle), 또는 출판사 */
  venue?: string
  eprint?: string
  doi?: string
  /** 관련 프로젝트 id: papers.yaml에 적은 것과 프로젝트 bib에서 저절로 이어진 것 */
  projects: string[]
  /** 그중 프로젝트 bib에서 저절로 이어진 것 (화면에서 뺄 수 없음) */
  autoProjects: string[]
  pdf: { where: PdfWhere; file?: string }
  /** research-library/comments/<키>/의 코멘트·질문 수 */
  comments: number
  /** 그중 답을 기다리는 질문 수 */
  waiting: number
  /** 답이 왔고 아직 끝내지 않은 질문 수 (사용자 차례) */
  answered: number
  /** 더한 순서: references.bib에서 몇 번째 항목인지 (앱은 새 논문을 끝에 덧붙인다, 0부터) */
  added: number
  /** 이 맥에서 마지막으로 연 때 (ms) */
  opened?: number
  /** 문헌노트가 있으면 그 id */
  note?: string
}

export interface PaperProject { id: string; title: string }

const BOOK_TYPES = new Set(['book', 'inbook', 'incollection', 'booklet'])

const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', n: 'ń', c: 'ć', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', S: 'Ś', Z: 'Ź', C: 'Ć' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', N: 'Ñ' },
  c: { c: 'ç', C: 'Ç' },
  v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž' },
}

/** bib 글의 흔한 TeX 꾸밈(\'e, \"o, \v{s} …)을 글자로 바꾸고 남은 \명령은 뺀다 */
export function detex(s: string): string {
  return s
    .replace(/\\([`'"^~]|[cv](?=\s|\{))\s*\{?\s*([A-Za-z])\}?/g, (all, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? ch)
    .replace(/\\(ss|o|O|l|L|ae|AE|aa|AA)\b\s*/g, (_a, c: string) => ({ ss: 'ß', o: 'ø', O: 'Ø', l: 'ł', L: 'Ł', ae: 'æ', AE: 'Æ', aa: 'å', AA: 'Å' } as Record<string, string>)[c] ?? c)
    .replace(/\\&/g, '&')
    .replace(/\\[a-zA-Z]+\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Example, Ada E. and Sample, Bea" 또는 "Ada E. Example and Bea Sample" → 성 목록 */
export function lastNames(author: string | undefined): string[] {
  if (!author) return []
  return detex(author).split(/\s+and\s+/).map((a) => a.trim()).filter((a) => a && a.toLowerCase() !== 'others').map((a) => {
    if (a.includes(',')) return a.split(',')[0]!.trim()
    const parts = a.split(/\s+/)
    return parts[parts.length - 1] ?? a
  })
}

/** iCloud는 받지 않은 파일을 .<이름>.icloud로 두고, File Provider(Google Drive 등)는 크기는 있지만 디스크 블록이 없는 파일로 둔다 */
export function pdfWhere(file: string): PdfWhere {
  try {
    const st = fs.statSync(file)
    if (!st.isFile()) return 'none'
    return st.size > 0 && st.blocks === 0 ? 'cloud' : 'local'
  } catch {
    const placeholder = path.join(path.dirname(file), `.${path.basename(file)}.icloud`)
    return fs.existsSync(placeholder) ? 'cloud' : 'none'
  }
}

interface PaperMeta { subjects?: unknown; projects?: string[]; pdf?: string }

export function readPapersYaml(lib: string): Record<string, PaperMeta> {
  const file = path.join(lib, PAPERS_FILE)
  if (!fs.existsSync(file)) return {}
  return cachedPapersYaml(file)
}
const cachedPapersYaml = fileCache((text): Record<string, PaperMeta> => {
  let raw: unknown
  try { raw = YAML.parse(text) } catch (e) { throw new WorkbenchError(500, t(`papers.yaml을 읽지 못했습니다: ${(e as Error).message}`, `Could not read papers.yaml: ${(e as Error).message}`)) }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, PaperMeta> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const m = v as { projects?: unknown; pdf?: unknown; subjects?: unknown }
    out[k] = {
      subjects: m.subjects,
      ...(Array.isArray(m.projects) && { projects: m.projects.filter((p): p is string => typeof p === 'string') }),
      ...(typeof m.pdf === 'string' && m.pdf && { pdf: m.pdf }),
    }
  }
  return out
})

const PAPERS_HEAD = '# 논문 라이브러리: bib 키마다 관련 프로젝트(projects)와 PDF 위치(pdf). 연구 작업대 앱이 고친다.\n# 프로젝트 bib에 같은 키가 있는 논문은 여기 적지 않아도 그 프로젝트에 이어진다.\n'

/** 라이브러리 bib의 항목들. bib가 없으면 빈 목록 */
const cachedBib = fileCache((raw) => parseBib(raw, LIBRARY_BIB))
export function libraryBibEntries(lib: string | undefined): BibEntry[] {
  if (!lib) return []
  const file = path.join(lib, LIBRARY_BIB)
  return fs.existsSync(file) ? cachedBib(file) : []
}

/** 연 때를 이 맥의 앱 설정 폴더에 둔다 (기기마다 다르므로 라이브러리 저장소에 두지 않는다) */
const openedFile = (configDir: string) => path.join(configDir, 'papers-opened.json')
export function readOpened(configDir: string): Record<string, number> {
  try {
    const raw = JSON.parse(fs.readFileSync(openedFile(configDir), 'utf8')) as unknown
    return raw && typeof raw === 'object' ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'number')) as Record<string, number> : {}
  } catch { return {} }
}
export function markOpened(configDir: string, key: string, now = Date.now()): void {
  const all = readOpened(configDir)
  all[key] = now
  writeAtomic(openedFile(configDir), JSON.stringify(all))
}

/** bib 키로 쓸 수 있는 이름인지 (파일·폴더 이름으로도 쓰므로 좁게) */
export { isSafeKey }

/** PDF 파일 경로: papers.yaml의 pdf:(절대 경로이거나 PDF 폴더 기준), 없으면 PDF 폴더들의 <키>.pdf, 그다음 프로젝트 자료 폴더의 <키>.pdf */
export function findPdf(key: string, meta: PaperMeta | undefined, folders: string[], projectDirs: string[], listing?: FolderListing): string | undefined {
  const candidates: string[] = []
  if (meta?.pdf) {
    if (path.isAbsolute(meta.pdf)) candidates.push(meta.pdf)
    else for (const f of folders) candidates.push(path.join(f, meta.pdf))
  }
  // <키>.pdf는 폴더 목록에 이름(또는 iCloud 자리표시)이 없으면 건너뛴다. 목록은 걸러 내기만 하고 판정은 pdfWhere
  const name = `${key}.pdf`
  for (const d of [...folders, ...projectDirs]) if (listing?.has(d, name) ?? true) candidates.push(path.join(d, name))
  return candidates.find((c) => pdfWhere(c) !== 'none')
}

/** 한 번 읽은 폴더 목록 (목록 한 번에 쓰고 버린다). 대소문자는 구분하지 않는다(맥 파일 시스템). 못 읽은 폴더는 모름(undefined) */
export class FolderListing {
  private dirs = new Map<string, Set<string> | undefined>()
  has(dir: string, name: string): boolean | undefined {
    if (!this.dirs.has(dir)) {
      let names: Set<string> | undefined
      try { names = new Set(fs.readdirSync(dir).map((n) => n.toLowerCase())) } catch (e) { names = (e as NodeJS.ErrnoException).code === 'ENOENT' ? new Set() : undefined }
      this.dirs.set(dir, names)
    }
    const names = this.dirs.get(dir)
    if (!names) return undefined
    const n = name.toLowerCase()
    return names.has(n) || names.has(`.${n}.icloud`)
  }
}

function projectBibKeys(registry: Registry): { id: string; title: string; keys: Set<string>; materials: string }[] {
  return registry.list().filter((r) => r.available).flatMap((r) => {
    try {
      const wb = registry.get(r.id)
      const m = listMaterials(wb.root, wb.readResearch().sources)
      return [{ id: r.id, title: r.title, keys: new Set(m.bib.map((e) => e.key)), materials: m.dir }]
    } catch { return [] }
  })
}

export function listPapers(registry: Registry): { library: string | null; folders: string[]; projects: PaperProject[]; papers: PaperRow[] } {
  const lib = registry.libraryPath
  const folders = registry.pdfFolders
  const projects = projectBibKeys(registry)
  if (!lib) return { library: null, folders, projects: projects.map(({ id, title }) => ({ id, title })), papers: [] }
  const tree = readSubjects(lib)
  const subjectsHash = readYamlHash(path.join(lib, PAPERS_FILE))
  const meta = readPapersYaml(lib)
  const opened = readOpened(registry.configDir)
  const notesDir = path.join(lib, 'papers')
  const notes = new Set(fs.existsSync(notesDir) ? fs.readdirSync(notesDir) : [])
  const known = new Set(projects.map((p) => p.id))
  const listing = new FolderListing()
  const papers = libraryBibEntries(lib).map((e, added): PaperRow => {
    const m = meta[e.key]
    const autoProjects = projects.filter((p) => p.keys.has(e.key)).map((p) => p.id)
    const manual = (m?.projects ?? []).filter((p) => known.has(p))
    const file = findPdf(e.key, m, folders, projects.map((p) => p.materials), listing)
    const cf = paperComments(lib, e.key)
    const note = notes.has(`${e.key}.tex`) || notes.has(`${e.key}.md`)
    const venue = e.journal ?? e.booktitle ?? e.publisher
    return {
      subjects: acceptedSubjects(tree, m?.subjects), subjectsHash,
      key: e.key, type: e.type, kind: BOOK_TYPES.has(e.type) ? 'book' : 'paper',
      title: detex(e.title ?? e.key), authors: lastNames(e.author ?? e.editor),
      ...(e.year && { year: e.year }), ...(venue && { venue: detex(venue) }), ...(e.eprint && { eprint: e.eprint }), ...(e.doi && { doi: e.doi }),
      projects: [...new Set([...manual, ...autoProjects])], autoProjects,
      pdf: file ? { where: pdfWhere(file), file } : { where: 'none' },
      comments: cf.filter((c) => c.kind !== '하이라이트').length, waiting: cf.filter((c) => c.kind === '질문' && c.state === '대기').length,
      answered: cf.filter((c) => c.kind === '질문' && c.state === '답함').length, added,
      ...(opened[e.key] && { opened: opened[e.key] }),
      ...(note && { note: e.key }),
    }
  })
  return { library: lib, folders, projects: projects.map(({ id, title }) => ({ id, title })), papers }
}

// ---------- 논문 첫 화면 (라이브러리 L2, requirements §8.1 "라이브러리 첫 화면") ----------

export type CloudKind = 'icloud' | 'drive' | 'local'
/** PDF 폴더가 어느 클라우드인지 (맥의 폴더 이름으로) */
export function cloudOf(dir: string): CloudKind {
  if (/Mobile Documents|com~apple~CloudDocs|iCloud/i.test(dir)) return 'icloud'
  if (/GoogleDrive|Google Drive|CloudStorage\/Google/i.test(dir)) return 'drive'
  return 'local'
}

export interface PaperBrief {
  /** 라이브러리가 설정되어 있는지 */
  library: boolean
  total: number
  /** 최근 더한 논문 (references.bib 끝에서부터) */
  recent: PaperRow[]
  projects: PaperProject[]
  /** 점검 (사용자 차례): PDF 폴더가 하나도 없음, 답이 온 질문 수 */
  check: { noFolder: boolean; answered: number }
  /** 통계 */
  stats: { noPdf: number; arxiv: number; unlinked: number; papers: number; books: number; unclassified?: number }
  /** PDF 폴더 (설정 › 논문 PDF 폴더) */
  folders: { path: string; cloud: CloudKind }[]
}

/** 화면의 거르기와 같은 조건으로 센다 (PapersPage.tsx FILTERS) */
export function paperBrief(list: ReturnType<typeof listPapers>, recent = 8): PaperBrief {
  const p = list.papers
  const count = (t: (x: PaperRow) => boolean) => p.filter(t).length
  return {
    library: !!list.library,
    total: p.length,
    recent: [...p].sort((a, b) => b.added - a.added).slice(0, recent),
    projects: list.projects,
    check: { noFolder: !!list.library && list.folders.length === 0, answered: p.reduce((n, x) => n + x.answered, 0) },
    stats: {
      ...(readSubjects(list.library ?? undefined).enabled && { unclassified: count((x) => !x.subjects?.length) }),
      noPdf: count((x) => x.pdf.where === 'none'), arxiv: count((x) => x.pdf.where === 'none' && !!x.eprint),
      unlinked: count((x) => x.projects.length === 0), papers: count((x) => x.kind === 'paper'), books: count((x) => x.kind === 'book'),
    },
    folders: list.folders.map((f) => ({ path: f, cloud: cloudOf(f) })),
  }
}

/** 논문 하나의 관련 프로젝트(손으로 적은 것)를 바꾼다. 프로젝트 bib에서 저절로 이어진 것은 여기서 빼지 못한다 */
export function setPaperProjects(registry: Registry, key: string, projects: unknown): string[] {
  const lib = registry.libraryPath
  if (!lib) throw new WorkbenchError(400, t('공유 라이브러리가 설정되지 않았습니다', 'No shared library is set'))
  if (!isSafeKey(key) || !libraryBibEntries(lib).some((e) => e.key === key)) throw new WorkbenchError(404, t(`references.bib에 없는 키: ${key}`, `Key not in references.bib: ${key}`))
  if (!Array.isArray(projects) || projects.some((p) => typeof p !== 'string')) throw new WorkbenchError(400, t('projects는 프로젝트 id 목록이어야 합니다', 'projects must be a list of project ids'))
  const ids = new Set(registry.list().map((r) => r.id))
  const unknown = (projects as string[]).filter((p) => !ids.has(p))
  if (unknown.length) throw new WorkbenchError(400, t(`없는 프로젝트: ${unknown.join(', ')}`, `Unknown projects: ${unknown.join(', ')}`))
  // 이 논문의 projects:만 그 자리에서 고친다. 다른 논문·다른 칸(사람·에이전트가 적은 것)과 주석은 그대로 둔다
  const file = path.join(lib, PAPERS_FILE)
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const doc = text.trim() ? YAML.parseDocument(text) : YAML.parseDocument(PAPERS_HEAD)
  if (doc.errors.length) throw new WorkbenchError(422, t(`papers.yaml을 읽지 못해 고치지 않았습니다: ${doc.errors[0]!.message}`, `Could not read papers.yaml, so nothing was changed: ${doc.errors[0]!.message}`))
  if (doc.contents != null && !YAML.isMap(doc.contents)) throw new WorkbenchError(422, t('papers.yaml이 \'키: {projects, pdf}\' 꼴이 아니어서 고치지 않았습니다', 'papers.yaml is not in the form \'key: {projects, pdf}\', so nothing was changed'))
  // 예전 앱이 빈 파일에 쓴 '{}'는 줄마다 적는 모양으로 바꾼다
  if (YAML.isMap(doc.contents) && doc.contents.flow && !doc.contents.items.length) doc.contents.flow = false
  const entry = doc.get(key, true)
  // '키:'처럼 값이 빈 항목은 없는 것으로 본다
  if (YAML.isScalar(entry) && entry.value == null) doc.delete(key)
  else if (entry != null && !YAML.isMap(entry)) throw new WorkbenchError(422, t(`papers.yaml의 ${key} 항목이 {projects, pdf} 꼴이 아니어서 고치지 않았습니다`, `The ${key} entry in papers.yaml is not in the form {projects, pdf}, so nothing was changed`))
  const next = [...new Set(projects as string[])]
  if (next.length) doc.setIn([key, 'projects'], doc.createNode(next, { flow: true }))
  else if (doc.hasIn([key, 'projects'])) doc.deleteIn([key, 'projects'])
  const left = doc.get(key, true)
  if (YAML.isMap(left) && !left.items.length) doc.delete(key)
  const out = doc.toString({ flowCollectionPadding: false, lineWidth: 0 })
  if (out !== text) writeAtomic(file, out)
  return next
}

/** iCloud가 받지 않은 파일(.<이름>.icloud)을 받기 시작한다 (맥의 brctl). 기다리지 않는다 */
let downloader = (file: string) => {
  if (process.platform !== 'darwin') return
  try { spawn('brctl', ['download', file], { stdio: 'ignore', detached: true }).on('error', () => undefined).unref() } catch { /* 받지 못하면 Finder에서 받는다 */ }
}
/** 테스트가 brctl 대신 쓴다 */
export function useCloudDownloader(f: (file: string) => void): void { downloader = f }

/** 열 PDF 파일. 없으면 404, iCloud에만 있으면 받기 시작하고 503 (열었다고 적지 않는다) */
export function paperPdfFile(registry: Registry, key: string): string {
  const lib = registry.libraryPath
  if (!lib || !isSafeKey(key)) throw new WorkbenchError(404, t('논문이 없습니다', 'No such paper'))
  if (!libraryBibEntries(lib).some((e) => e.key === key)) throw new WorkbenchError(404, t(`references.bib에 없는 키: ${key}`, `Key not in references.bib: ${key}`))
  const file = findPdf(key, readPapersYaml(lib)[key], registry.pdfFolders, projectBibKeys(registry).map((p) => p.materials))
  if (!file) throw new WorkbenchError(404, t(`${key}의 PDF가 PDF 폴더에 없습니다`, `No PDF for ${key} in the PDF folders`))
  if (!fs.existsSync(file)) {
    downloader(file)
    throw new WorkbenchError(503, t(`${path.basename(file)}는 iCloud에만 있어 이 맥으로 받기 시작했습니다. 잠시 뒤 다시 열어 주세요`, `${path.basename(file)} is only in iCloud, so it is now downloading to this Mac. Open it again in a moment`))
  }
  return file
}
