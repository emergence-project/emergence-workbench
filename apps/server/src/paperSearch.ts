import type { PaperDriveHit, PaperSearch, PaperWebHit } from '@rw/core/contract/papers'
import fs from 'node:fs'
import path from 'node:path'
import { idInPdf, paperFetch, parseArxivFeed, readHead } from './paperAdd.js'
import { idKeys, libraryKeys, s2Hit, type S2Paper } from './paperIds.js'
import { cloudOf, detex, libraryBibEntries, readPapersYaml } from './papers.js'
import type { Registry } from './registry.js'

/**
 * 논문 찾기의 바깥 결과 (10/31 시안 1절). 라이브러리 안 결과는 화면이 목록에서 바로 거른다.
 * - PDF 폴더(Google Drive · iCloud)에 있지만 라이브러리에 없는 PDF: 파일 이름이 찾는 낱말을 모두 품은 것, 첫 부분에서 arXiv 번호 · DOI를 읽는다
 * - 인터넷: arXiv · Semantic Scholar · Crossref를 함께 묻고, 라이브러리에 이미 있거나 서로 겹치는 것은 뺀다 (arXiv 번호 · DOI 어느 쪽이 겹쳐도, paperIds.ts)
 */

const DRIVE_MAX = 5
const WEB_EACH = 5
const WEB_TIMEOUT = 8_000

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
const wordsOf = (q: string) => norm(q).split(/[^a-z0-9가-힣.]+/).filter((w) => w.length > 1)
/** 인터넷 결과 하나와 겹침을 볼 열쇠 (화면에는 hit만 간다) */
type Found = { hit: PaperWebHit; keys: string[] }

/** PDF 폴더에서 라이브러리에 없는 PDF (이미 <키>.pdf이거나 papers.yaml pdf:로 이어진 파일은 뺀다) */
export function driveHits(registry: Registry, q: string): PaperDriveHit[] {
  const ws = wordsOf(q)
  const lib = registry.libraryPath
  if (!ws.length || !lib) return []
  const keys = new Set(libraryBibEntries(lib).map((e) => `${e.key.toLowerCase()}.pdf`))
  const linked = new Set(Object.values(readPapersYaml(lib)).map((m) => m.pdf).filter((p): p is string => !!p).map((p) => norm(path.basename(p))))
  const out: PaperDriveHit[] = []
  for (const folder of registry.pdfFolders) {
    let names: string[] = []
    try { names = fs.readdirSync(folder) } catch { continue }
    for (const name of names.sort()) {
      if (out.length >= DRIVE_MAX) return out
      const lower = name.toLowerCase()
      if (!lower.endsWith('.pdf') || name.startsWith('.') || keys.has(lower) || linked.has(norm(name))) continue
      const hay = norm(name).replace(/[_\-]+/g, ' ')
      if (!ws.every((w) => hay.includes(w))) continue
      const file = path.join(folder, name)
      let id: string | undefined
      try { const found = idInPdf(name, readHead(file)); if (found) id = 'arxiv' in found ? found.arxiv : found.doi } catch { /* 읽지 못하면 번호 없이 */ }
      out.push({ file, name, folder: path.basename(folder), cloud: cloudOf(folder), ...(id && { id }) })
    }
  }
  return out
}

/** 시간 한도가 있는 바깥 요청 (늦으면 그 곳만 빈 결과) */
async function within<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try { return await Promise.race([work, new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('timeout')), WEB_TIMEOUT) })]) } finally { clearTimeout(timer) }
}

async function fromArxiv(q: string): Promise<Found[]> {
  const query = wordsOf(q).map((w) => `all:${w}`).join(' AND ')
  const res = await paperFetch(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&max_results=${WEB_EACH}`)
  if (!res.ok) throw new Error(`arXiv ${res.status}`)
  return parseArxivFeed(await res.text()).map((c) => ({ hit: { source: 'arxiv', id: c.eprint, title: c.title, authors: c.authors, ...(c.year && { year: c.year }) }, keys: idKeys(c.eprint, c.doi) }))
}

async function fromS2(q: string): Promise<Found[]> {
  const res = await paperFetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${WEB_EACH}&fields=title,authors,year,venue,externalIds`)
  if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`)
  const body: { data?: S2Paper[] } = await res.json()
  return (body.data ?? []).flatMap((p) => {
    const h = s2Hit(p)
    return h ? [{ hit: { source: 's2', id: h.id, title: h.title, authors: h.authors, ...(h.year && { year: h.year }), ...(h.venue && { venue: h.venue }) }, keys: h.keys }] : []
  })
}

interface CrossrefItem { DOI?: string; title?: string[]; author?: { family?: string; name?: string }[]; issued?: { 'date-parts'?: number[][] }; 'container-title'?: string[] }
async function fromCrossref(q: string): Promise<Found[]> {
  const res = await paperFetch(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${WEB_EACH}&select=DOI,title,author,issued,container-title`)
  if (!res.ok) throw new Error(`Crossref ${res.status}`)
  const body: { message?: { items?: CrossrefItem[] } } = await res.json()
  return (body.message?.items ?? []).flatMap((x) => {
    const title = x.title?.[0]
    if (!x.DOI || !title) return []
    const year = x.issued?.['date-parts']?.[0]?.[0]
    const venue = x['container-title']?.[0]
    return [{ hit: { source: 'crossref', id: x.DOI, title: detex(title), authors: (x.author ?? []).map((a) => a.family ?? a.name ?? '').filter(Boolean),
      ...(year && { year: String(year) }), ...(venue && { venue }) }, keys: idKeys(x.DOI) }]
  })
}

/** 인터넷 결과: 셋을 함께 묻고, 라이브러리에 있는 것과 겹치는 것을 뺀다. 모두 실패하면 offline */
export async function webHits(registry: Registry, q: string): Promise<{ web: PaperWebHit[]; offline: boolean }> {
  if (!wordsOf(q).length) return { web: [], offline: false }
  const got = await Promise.allSettled([fromArxiv, fromS2, fromCrossref].map((f) => within(f(q))))
  const seen = libraryKeys(libraryBibEntries(registry.libraryPath ?? undefined))
  const web: PaperWebHit[] = []
  for (const r of got) {
    if (r.status !== 'fulfilled') continue
    for (const { hit, keys } of r.value) {
      if (keys.some((k) => seen.has(k))) continue
      for (const k of keys) seen.add(k)
      web.push(hit)
    }
  }
  return { web, offline: got.every((r) => r.status === 'rejected') }
}

export async function searchPapers(registry: Registry, q: string): Promise<PaperSearch> {
  const drive = driveHits(registry, q)
  const { web, offline } = await webHits(registry, q)
  return { drive, web, offline }
}
