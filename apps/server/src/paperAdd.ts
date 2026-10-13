import type { PaperAdded as AddResult, ArxivCandidate, ArxivCandidates } from '@rw/core/contract/papers'
import fs from 'node:fs'
import path from 'node:path'
import { writeAtomic } from './fsutil.js'
import { LIBRARY_BIB, isSafeKey, libraryBibEntries } from './papers.js'
import type { Registry } from './registry.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 논문 더하기: arXiv 번호나 DOI, 또는 PDF 하나.
 * - arXiv는 export.arxiv.org, DOI는 Crossref에서 정보를 받아 shared-library/references.bib 끝에 항목 하나를 덧붙인다.
 * - 키는 Better BibTeX 기본 모양(첫 저자 성 소문자 + 제목 첫 낱말 + 연도, 예: exampleDischarging2022). 겹치면 a, b …를 붙인다.
 * - arXiv 논문은 첫 PDF 폴더에 <키>.pdf로 PDF도 받는다. 올린 PDF는 같은 이름으로 그 폴더에 둔다.
 * - 이미 bib에 있는 논문(같은 arXiv 번호나 DOI)이면 새로 쓰지 않고 그 키를 돌려준다.
 */

export type PaperId = { arxiv: string } | { doi: string }

export interface FoundPaper {
  type: 'article' | 'book' | 'incollection' | 'misc'
  title: string
  /** [성, 이름] */
  authors: [string, string][]
  year?: string
  journal?: string
  booktitle?: string
  publisher?: string
  doi?: string
  eprint?: string
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
let fetcher: Fetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
/** 테스트가 바깥 연결 대신 쓴다 */
export function usePaperFetcher(f: Fetcher): void { fetcher = f }

const AGENT = { 'user-agent': 'Emergence Workbench paper library (https://github.com/emergence-project/emergence-workbench)' }

/** 붙여 넣은 글에서 arXiv 번호나 DOI를 읽는다 (주소째 붙여 넣어도 된다) */
export function parsePaperId(raw: string): PaperId | null {
  const s = raw.trim()
  const doi = /(?:doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[^\s"<>]+)/i.exec(s)
  // arXiv의 DOI(10.48550/arXiv.0000.00001)는 arXiv 번호로 본다
  const viaDoi = doi && /^10\.48550\/arxiv\.(.+)$/i.exec(doi[1]!)
  if (viaDoi) return { arxiv: viaDoi[1]!.replace(/v\d+$/, '') }
  const ax = /(?:arxiv(?:\.org\/(?:abs|pdf)\/|:)\s*)?(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\b/i.exec(s)
    ?? /(?:arxiv(?:\.org\/(?:abs|pdf)\/|:)\s*)([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i.exec(s)
  if (ax && (!doi || ax.index < doi.index)) return { arxiv: ax[1]! }
  if (doi) return { doi: doi[1]!.replace(/[.,;)]+$/, '') }
  return null
}

const xmlText = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** "Ada E. Example" → ["Example", "Ada E."] (성이 앞에 오는 이름은 arXiv가 주지 않는다) */
function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return [parts[0]!, '']
  // van, de, von 같은 앞붙이는 성에 붙인다
  let i = parts.length - 1
  while (i > 1 && /^(van|von|de|der|den|da|di|le|la|du|del)$/i.test(parts[i - 1]!)) i--
  return [parts.slice(i).join(' '), parts.slice(0, i).join(' ')]
}

export async function fetchArxiv(id: string): Promise<FoundPaper> {
  const res = await fetcher(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { headers: AGENT })
  if (!res.ok) throw new WorkbenchError(502, t(`arXiv에서 정보를 받지 못했습니다 (${res.status})`, `Could not get details from arXiv (${res.status})`))
  const xml = await res.text()
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1]
  const title = entry && /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]
  if (!entry || !title || /<id>[^<]*api\/errors/.test(entry)) throw new WorkbenchError(404, t(`arXiv에 없는 번호: ${id}`, `Number not on arXiv: ${id}`))
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => splitName(xmlText(m[1]!)))
  const doi = /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/.exec(entry)?.[1]
  const ref = /<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/.exec(entry)?.[1]
  // 실린 해가 있으면 그것 (Better BibTeX도 출판 연도를 쓴다), 없으면 arXiv에 처음 올린 해
  const year = (ref && /\((\d{4})\)\s*$/.exec(xmlText(ref))?.[1]) ?? /<published>(\d{4})/.exec(entry)?.[1]
  return {
    type: ref || doi ? 'article' : 'misc', title: xmlText(title), authors, eprint: id,
    ...(year && { year }), ...(doi && { doi: xmlText(doi) }), ...(ref && { journal: xmlText(ref).replace(/\s*\(\d{4}\)\s*$/, '') }),
  }
}

export async function fetchDoi(doi: string): Promise<FoundPaper> {
  const res = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: AGENT })
  if (res.status === 404) throw new WorkbenchError(404, t(`Crossref에 없는 DOI: ${doi}`, `DOI not on Crossref: ${doi}`))
  if (!res.ok) throw new WorkbenchError(502, t(`Crossref에서 정보를 받지 못했습니다 (${res.status})`, `Could not get details from Crossref (${res.status})`))
  const m = ((await res.json()) as { message?: Record<string, unknown> }).message ?? {}
  const first = (v: unknown) => (Array.isArray(v) ? (v[0] as string | undefined) : undefined)
  const title = first(m.title)
  if (!title) throw new WorkbenchError(404, t(`DOI의 제목을 알 수 없습니다: ${doi}`, `Could not find the title for the DOI: ${doi}`))
  const people = (Array.isArray(m.author) ? m.author : Array.isArray(m.editor) ? m.editor : []) as { family?: string; given?: string; name?: string }[]
  const authors = people.map((a): [string, string] => (a.family ? [a.family, a.given ?? ''] : splitName(a.name ?? '')))
  const parts = (m.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]
  const year = parts?.[0] ? String(parts[0]) : undefined
  const kind = String(m.type ?? '')
  const container = first(m['container-title'])
  const publisher = typeof m.publisher === 'string' ? m.publisher : undefined
  const clean = (s: string) => xmlText(s.replace(/<[^>]+>/g, ''))
  if (kind === 'book' || kind === 'monograph' || kind === 'edited-book') return { type: 'book', title: clean(title), authors, doi, ...(year && { year }), ...(publisher && { publisher }) }
  if (kind === 'book-chapter' || kind === 'book-section') return { type: 'incollection', title: clean(title), authors, doi, ...(year && { year }), ...(container && { booktitle: clean(container) }), ...(publisher && { publisher }) }
  return { type: 'article', title: clean(title), authors, doi, ...(year && { year }), ...(container && { journal: clean(container) }) }
}

const STOP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'from', 'with', 'by', 'at', 'is', 'are', 'via', 'as'])
const ascii = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]/g, '')

/** Better BibTeX 기본 키 모양: 첫 저자 성(소문자) + 제목 첫 낱말(첫 글자 대문자) + 연도 */
export function paperKey(p: FoundPaper, taken: Set<string>): string {
  const last = ascii(p.authors[0]?.[0] ?? '').toLowerCase() || 'anon'
  const word = p.title.replace(/\$[^$]*\$/g, ' ').split(/[^\p{L}\p{N}]+/u).map(ascii).find((w) => w && !STOP.has(w.toLowerCase())) ?? ''
  const base = `${last}${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}${p.year ?? ''}`
  if (!taken.has(base)) return base
  for (let i = 0; i < 26; i++) { const k = base + String.fromCharCode(97 + i); if (!taken.has(k)) return k }
  return `${base}-${Date.now()}`
}

/** 짝이 맞는 { }는 두고 (\mathbb{Z} 등), 짝 없는 것만 뺀다: bib 항목이 깨지지 않게 */
export function balanceBraces(v: string): string {
  const drop = new Set<number>()
  const open: number[] = []
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\') { i++; continue }
    if (v[i] === '{') open.push(i)
    else if (v[i] === '}') { if (open.length) open.pop(); else drop.add(i) }
  }
  for (const i of open) drop.add(i)
  return [...v].filter((_, i) => !drop.has(i)).join('')
}

/** LaTeX에서 특수한 글자(% & # _)를 수식($…$) 밖에서 \로 막는다. 이미 막힌 것은 그대로 */
export function escapeTex(v: string): string {
  return v.split(/(\$[^$]*\$)/).map((part, i) => (i % 2 ? part.replace(/(?<!\\)%/g, '\\%') : part.replace(/(?<!\\)([%&#_])/g, '\\$1'))).join('')
}

/** 글 칸: 짝 맞춘 { }와 LaTeX 특수 글자 막기. doi·eprint는 그대로 적는 칸이라 { }만 뺀다 */
const field = (name: string, v: string | undefined) => {
  if (!v) return ''
  const value = name === 'doi' || name === 'eprint' ? v.replace(/[{}]/g, '') : escapeTex(balanceBraces(v))
  return `  ${name} = {${value}},\n`
}

export function bibEntryText(key: string, p: FoundPaper): string {
  const authors = p.authors.map(([f, g]) => (g ? `${f}, ${g}` : f)).join(' and ')
  return `@${p.type}{${key},\n${field('title', p.title)}${field('author', authors)}${field('journal', p.journal)}${field('booktitle', p.booktitle)}${field('publisher', p.publisher)}${field('year', p.year)}${field('doi', p.doi)}${p.eprint ? `${field('eprint', p.eprint)}  archiveprefix = {arXiv},\n` : ''}}\n`
}

const sameId = (id: PaperId) => (e: { eprint?: string; doi?: string }) =>
  'arxiv' in id ? e.eprint?.replace(/v\d+$/, '') === id.arxiv : e.doi?.toLowerCase() === id.doi.toLowerCase()

export type { AddResult }

function libOf(registry: Registry): string {
  const lib = registry.libraryPath
  if (!lib) throw new WorkbenchError(400, t('공유 라이브러리가 설정되지 않았습니다 (설정 › 공유 라이브러리)', 'No shared library is set (Settings › Shared library)'))
  return lib
}

/** 정보를 받아 bib에 덧붙인다. 이미 있으면 그 키 */
async function ensureEntry(lib: string, id: PaperId): Promise<{ key: string; existed: boolean; found?: FoundPaper }> {
  const had = libraryBibEntries(lib).find(sameId(id))
  if (had) return { key: had.key, existed: true }
  const found = 'arxiv' in id ? await fetchArxiv(id.arxiv) : await fetchDoi(id.doi)
  // 받는 동안 다른 더하기(두 번 누름, PDF 여럿)가 bib에 썼을 수 있으니 다시 읽는다. 여기부터 쓰기까지는 기다림이 없어 끼어들 수 없다
  const before = libraryBibEntries(lib)
  const again = before.find(sameId(id))
  if (again) return { key: again.key, existed: true }
  // DOI로 받았는데 bib에 같은 DOI가 arXiv 쪽에서 들어와 있을 수 있다
  const twin = found.doi ? before.find((e) => e.doi?.toLowerCase() === found.doi!.toLowerCase()) : undefined
  if (twin) return { key: twin.key, existed: true }
  const key = paperKey(found, new Set(before.map((e) => e.key)))
  if (!isSafeKey(key)) throw new WorkbenchError(400, t(`키를 만들지 못했습니다: ${key}`, `Could not make a key: ${key}`))
  const old = readLibraryBib(lib)
  writeLibraryBib(lib, `${old}${old && !old.endsWith('\n') ? '\n' : ''}${old ? '\n' : ''}${bibEntryText(key, found)}`)
  return { key, existed: false, found }
}

const isBibLink = (real: string) => real.toLowerCase().endsWith('.bib')
function readLibraryBib(lib: string): string {
  const file = path.join(lib, LIBRARY_BIB)
  try {
    if (fs.lstatSync(file).isSymbolicLink() && !isBibLink(fs.realpathSync(file))) throw new WorkbenchError(409, t(`${LIBRARY_BIB}가 .bib가 아닌 파일로 가는 링크라 쓰지 않았습니다`, `Not written: ${LIBRARY_BIB} is a link to a file that is not .bib`))
  } catch (e) { if (e instanceof WorkbenchError) throw e /* 없는 파일·끊긴 링크: 그 자리에 쓴다 */ }
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}
/** references.bib가 Zotero 자동 내보내기 같은 .bib 파일로 가는 링크면 링크를 두고 그 파일에 쓴다 (.bib가 아닌 곳은 따라가지 않는다) */
function writeLibraryBib(lib: string, text: string): void {
  writeAtomic(path.join(lib, LIBRARY_BIB), text, { followLink: isBibLink })
}

/** arXiv 번호나 DOI로 더한다. arXiv면 PDF도 첫 PDF 폴더에 받는다 */
export async function addPaper(registry: Registry, raw: unknown): Promise<AddResult> {
  const id = typeof raw === 'string' ? parsePaperId(raw) : null
  if (!id) throw new WorkbenchError(400, t('arXiv 번호(예: 0000.00001)나 DOI(예: 10.1103/…)를 적어 주세요', 'Enter an arXiv number (for example 0000.00001) or a DOI (for example 10.1103/…)'))
  const lib = libOf(registry)
  const { key, existed } = await ensureEntry(lib, id)
  const folder = registry.pdfFolders[0]
  if (!('arxiv' in id) || !folder) return { key, existed }
  const target = path.join(folder, `${key}.pdf`)
  if (fs.existsSync(target)) return { key, existed, pdf: target }
  try {
    const res = await fetcher(`https://arxiv.org/pdf/${id.arxiv}`, { headers: AGENT })
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!res.ok || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(t(`arXiv PDF를 받지 못했습니다 (${res.status})`, `Could not download the arXiv PDF (${res.status})`))
    writeAtomic(target, bytes)
    return { key, existed, pdf: target }
  } catch (e) {
    return { key, existed, pdfError: (e as Error).message }
  }
}

/** PDF 안이나 파일 이름에서 arXiv 번호·DOI를 찾는다 (압축되지 않은 첫 부분만 본다) */
export function idInPdf(name: string, bytes: Buffer): PaperId | null {
  const byName = parsePaperId(name.replace(/_/g, '/'))
  if (byName) return byName
  const head = bytes.subarray(0, 400_000).toString('latin1')
  const ax = /arXiv:\s*(\d{4}\.\d{4,5})/.exec(head)
  if (ax) return { arxiv: ax[1]! }
  const doi = /(?:doi\.org\/|doi:\s*|\/DOI\s*\()\s*(10\.\d{4,9}\/[^\s)"<>]+)/i.exec(head)
  return doi ? { doi: doi[1]!.replace(/[.,;]+$/, '') } : null
}

/** 끌어다 놓은 PDF를 더한다: 번호를 찾아 bib에 넣고, 첫 PDF 폴더에 <키>.pdf로 둔다 */
export async function addPaperPdf(registry: Registry, name: unknown, bytes: unknown, given?: unknown): Promise<AddResult> {
  if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new WorkbenchError(400, t('PDF 파일이 아닙니다', 'Not a PDF file'))
  const folder = registry.pdfFolders[0]
  if (!folder) throw new WorkbenchError(400, t('먼저 설정 › 논문 PDF 폴더를 정해 주세요', 'Choose Settings › Paper PDF folder first'))
  const id = (typeof given === 'string' && given.trim() ? parsePaperId(given) : null) ?? idInPdf(typeof name === 'string' ? name : '', bytes)
  if (!id) throw new WorkbenchError(422, t('PDF에서 arXiv 번호나 DOI를 찾지 못했습니다. 번호를 함께 적어 주세요', 'Could not find an arXiv number or DOI in the PDF. Enter the number too'))
  const lib = libOf(registry)
  const { key, existed } = await ensureEntry(lib, id)
  const target = path.join(folder, `${key}.pdf`)
  // 이미 있는 PDF(iCloud에만 있는 것 포함)는 덮어쓰지 않는다: 다른 판이면 그렇다고 알린다
  const placeholder = path.join(folder, `.${key}.pdf.icloud`)
  if (fs.existsSync(target) || fs.existsSync(placeholder)) {
    const same = fs.existsSync(target) && fs.statSync(target).size === bytes.length && fs.readFileSync(target).equals(bytes)
    return { key, existed, pdf: target, ...(!same && { pdfError: t(`PDF 폴더에 이미 ${key}.pdf가 있어 올린 파일은 두지 않았습니다`, `The uploaded file was not kept: ${key}.pdf is already in the PDF folder`) }) }
  }
  writeAtomic(target, bytes)
  return { key, existed, pdf: target }
}

// ---------- arXiv 찾기 (10/11 12:46): DOI로 더한 논문에 arXiv 판이 있으면 번호를 찾아 사용자가 고른 것만 bib에 적는다 ----------

const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/
/** 비교용: 수식·괄호·기호를 빼고 소문자 낱말만 */
const words = (s: string) => s.replace(/\$[^$]*\$/g, ' ').replace(/\\[a-zA-Z]+/g, ' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w))

/** 두 제목이 얼마나 같은 낱말을 쓰는지 (0–1) */
export function titleOverlap(a: string, b: string): number {
  const x = new Set(words(a)); const y = new Set(words(b))
  if (!x.size || !y.size) return 0
  let same = 0
  for (const w of x) if (y.has(w)) same++
  return same / Math.max(x.size, y.size)
}

function parseArxivFeed(xml: string): ArxivCandidate[] {
  const out: ArxivCandidate[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1]!
    const id = /<id>\s*https?:\/\/arxiv\.org\/abs\/([^<\s]+?)(?:v\d+)?\s*<\/id>/.exec(entry)?.[1]
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]
    if (!id || !title) continue
    const doi = /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/.exec(entry)?.[1]
    const year = /<published>(\d{4})/.exec(entry)?.[1]
    out.push({
      eprint: id, title: xmlText(title), authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => splitName(xmlText(a[1]!))[0]),
      ...(year && { year }), ...(doi && { doi: xmlText(doi) }), match: 'title',
    })
  }
  return out
}

/** 라이브러리 bib의 한 논문에 맞는 arXiv 판 후보: 제목 낱말 + 첫 저자 성으로 찾고, DOI가 같은 것을 앞에 둔다 */
export async function findArxiv(registry: Registry, key: string): Promise<ArxivCandidates> {
  const lib = libOf(registry)
  const e = libraryBibEntries(lib).find((x) => x.key === key)
  if (!e) throw new WorkbenchError(404, t(`references.bib에 없는 키: ${key}`, `Key not in references.bib: ${key}`))
  if (!e.title) return { candidates: [] }
  const ws = [...new Set(words(e.title))].slice(0, 8)
  const last = ascii(e.author?.split(/\s+and\s+/)[0]?.split(',')[0]?.trim().split(/\s+/).pop() ?? '')
  if (!ws.length) return { candidates: [] }
  const q = [...ws.map((w) => `ti:${w}`), ...(last ? [`au:${last}`] : [])].join(' AND ')
  const res = await fetcher(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&max_results=10`, { headers: AGENT })
  if (!res.ok) throw new WorkbenchError(502, t(`arXiv에서 찾지 못했습니다 (${res.status})`, `Could not search arXiv (${res.status})`))
  const doi = e.doi?.toLowerCase()
  const candidates = parseArxivFeed(await res.text())
    .map((c) => ({ c: doi && c.doi?.toLowerCase() === doi ? { ...c, match: 'doi' as const } : c, score: titleOverlap(e.title!, c.title) }))
    .filter(({ c, score }) => c.match === 'doi' || score >= 0.5)
    .sort((a, b) => Number(b.c.match === 'doi') - Number(a.c.match === 'doi') || b.score - a.score)
    .slice(0, 5)
    .map(({ c }) => c)
  return { candidates }
}

/** 고른 arXiv 번호를 그 논문의 bib 항목에 적는다 (eprint · archiveprefix). 다른 칸과 글은 그대로 둔다 */
export function setEprint(registry: Registry, key: string, raw: string): { key: string; eprint: string } {
  const eprint = raw.trim().replace(/v\d+$/, '')
  if (!ARXIV_ID.test(eprint)) throw new WorkbenchError(400, t(`arXiv 번호 모양이 아닙니다: ${raw}`, `Not an arXiv number: ${raw}`))
  const lib = libOf(registry)
  const entries = libraryBibEntries(lib)
  const e = entries.find((x) => x.key === key)
  if (!e) throw new WorkbenchError(404, t(`references.bib에 없는 키: ${key}`, `Key not in references.bib: ${key}`))
  if (e.eprint) throw new WorkbenchError(409, t(`이미 arXiv 번호가 있습니다: ${e.eprint}`, `Already has an arXiv number: ${e.eprint}`))
  const twin = entries.find((x) => x.eprint?.replace(/v\d+$/, '') === eprint)
  if (twin) throw new WorkbenchError(409, t(`이 번호는 이미 다른 논문(${twin.key})에 있습니다`, `This number is already on another paper (${twin.key})`))
  const text = readLibraryBib(lib)
  const next = withField(text, key, `  eprint = {${eprint}},\n  archiveprefix = {arXiv},\n`)
  if (next === null) throw new WorkbenchError(409, t(`references.bib에서 ${key} 항목의 끝을 찾지 못했습니다`, `Could not find the end of the ${key} entry in references.bib`))
  writeLibraryBib(lib, next)
  return { key, eprint }
}

/** bib 글에서 키 항목의 닫는 괄호 앞에 칸을 넣는다. 항목을 못 찾으면 null */
export function withField(text: string, key: string, fields: string): string | null {
  const head = new RegExp(`@\\w+\\s*\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,`, 'g')
  const m = head.exec(text)
  if (!m) return null
  let depth = 1
  let i = head.lastIndex
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) break
  }
  if (depth !== 0) return null
  const body = text.slice(0, i).replace(/\s*$/, '')
  return `${body}${body.endsWith(',') ? '' : ','}\n${fields}${text.slice(i)}`
}
