import { parseBib, type BibEntry } from './materials.js'

/**
 * 개념노트의 출처와 연결은 본문 글로 두지 않는다 (2026-10-04 사용자 결정).
 * - 출처(논문·외부 문헌): 머리말 `sources:`에 references.bib의 키만. 화면과 PDF 참고문헌은 bib에서 만든다.
 * - 이 개념을 쓰는 다른 개념: 적지 않는다. 다른 노트의 [[링크]]에서 앱이 계산한다.
 * - 관련 개념(이 노트가 가리키는 것): 본문 [[링크]] 또는 머리말 `related:`.
 * 여기에는 Study 노트를 옮길 때 그런 절을 본문에서 떼어 내는 도구를 둔다.
 */
export type PulledKind = 'sources' | 'usedBy' | 'related'

const KIND_OF: [PulledKind, RegExp][] = [
  ['sources', /^((external |further )?references?|sources?|source-refs|bibliography|citations?|further reading|readings?|papers?|literature|출처|참고\s?문헌|참고\s?자료|참고|문헌|논문)$/i],
  ['usedBy', /^(used (in|by)|backlinks?|referenced (in|by)|linked from|(이 개념을\s)?(쓰는|사용하는|사용되는|쓰이는)\s?(곳|개념|노트)|사용처|역링크)$/i],
  ['related', /^(related( concepts?| notes?| topics?)?|see also|links?|concept[- ]space|관련( 개념| 노트| 주제)?|연관( 개념)?|함께 보기|같이 보기)$/i],
]

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/

export function kindOfHeading(text: string): PulledKind | null {
  const t = text.replace(/[*_`:：]/g, '').replace(/\s*\(.*\)\s*$/, '').trim()
  return KIND_OF.find(([, re]) => re.test(t))?.[0] ?? null
}

export interface PulledSection {
  kind: PulledKind
  heading: string
  /** 떼어 낸 출처 항목 (출처 절과 그 아래 출처 소제목) */
  refs: SourceRef[]
  /** 떼어 낸 [[링크]] (관련 개념·Concept-space 소제목, 출처 목록 속 링크만 있는 항목) */
  links: string[]
  /** 떼어 내지 못해 본문에 남긴 이유 (있으면 절 전체를 그대로 둠) */
  kept?: string
}

const LIST = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/
const CITE_SIGNAL = /https?:\/\/|\bdoi\b|10\.\d{4,9}\/|arxiv|\b(1[89]|20)\d{2}\b|\[\[|\bet al\b|\*[^*]+\*|\b_[^_]+_\b|"[^"]+"|“|\bPhys\.|\bRev\.|\bJ\.|\bPress\b|\bUniv|\bed\.|\bvol\.|\bpp?\.\s*\d/i

/** 출처 목록의 한 항목이 인용으로 보이는지. 수식·긴 글·문장 조각이면 아니다 */
export function looksLikeCitation(t: string): boolean {
  if (t.length > 400 || /^>/.test(t)) return false
  // 수식이 섞인 글은 주소가 붙은 인용(논문 제목 속 수식)일 때만
  if (/\$/.test(t)) return /https?:\/\/|10\.\d{4,9}\/|arxiv/i.test(t)
  if (CITE_SIGNAL.test(t)) return true
  // 신호가 없으면: 소문자로 시작하거나, 문장 조각(접속어·쌍점으로 끝남, is/are)이면 본문 글
  return !(/^[a-z]/.test(t) || /(\b(with|and|or|of|the|that|which|to)|:)$/i.test(t) || /\s(is|are|was|were)\s/.test(t))
}

/** "Further reference", "Reference:" 같은 이름표 줄, "[]" 같은 빈 항목 */
const isLabel = (t: string) => !t.replace(/[\[\]()\-*_:.\s]/g, '') || (/^(further |external )?(references?|sources?|referemce|출처|참고)\s*:?$/i.test(t))

/**
 * 출처·쓰는 개념·관련 개념 절 하나를 읽는다. 목록 항목과 알려진 소제목(External reference, Concept-space …)만 먹고,
 * 처음 나오는 보통 문단·콜아웃·모르는 소제목에서 멈춘다 (그 뒤는 본문 — 제목만 "Reference"인 본문이 많다).
 * 먹은 항목 중 하나라도 인용·링크로 보이지 않으면 절 전체를 본문에 남긴다 (원고를 잃지 않게).
 */
export function readSection(kind: PulledKind, lines: string[]): { refs: SourceRef[]; links: string[]; rest: string[]; kept?: string } {
  const refs: SourceRef[] = []
  const links: string[] = []
  let mode: PulledKind = kind
  let item: string[] | null = null
  let bad: string | undefined
  const flush = () => {
    if (!item) return
    const t = item.join(' ').replace(/\s+/g, ' ').trim()
    item = null
    if (!t || isLabel(t)) return
    const only = linksOnly(t)
    if (only) { if (mode !== 'usedBy') links.push(...only); return }
    if (mode !== 'sources') { bad ??= `링크가 아닌 글: ${t.slice(0, 60)}`; return }
    if (!looksLikeCitation(t)) { bad ??= `인용으로 보이지 않는 글: ${t.slice(0, 60)}`; return }
    refs.push(...sourceRefs(`- ${t}`))
  }
  let i = 0
  for (; i < lines.length; i++) {
    const l = lines[i]!
    if (!l.trim()) continue
    const h = HEADING.exec(l)
    if (h) {
      const k = kindOfHeading(h[2]!)
      if (!k) break
      flush(); mode = k; continue
    }
    const li = LIST.exec(l)
    // 목록 항목 (중첩 항목도 따로 하나씩 본다)
    if (li && (li[1]!.length < 2 || item)) { flush(); item = [li[2]!]; continue }
    // 들여 쓴 보통 줄은 앞 항목에 이어 붙인다
    if (item && /^\s+\S/.test(l)) { item.push(l.trim()); continue }
    break
  }
  flush()
  // 끝의 빈 줄은 버리고 나머지는 본문
  const rest = lines.slice(i)
  if (bad) return { refs: [], links: [], rest: lines, kept: bad }
  // 목록으로 시작하지 않는 절(바로 글)은 손대지 않는다
  if (i === lines.findIndex((l) => l.trim()) && i >= 0) return { refs: [], links: [], rest: lines, kept: '목록이 아닌 글' }
  return { refs, links: [...new Set(links)], rest }
}

/**
 * 출처·쓰는 개념·관련 개념 절을 본문에서 떼어 낸다 (readSection). 코드 블록 안의 제목은 보지 않는다.
 * 떼지 못한 절(kept)은 제목까지 그대로 남는다.
 */
export function pullSections(body: string): { body: string; sections: PulledSection[] } {
  const lines = body.split('\n')
  const keep: string[] = []
  const sections: PulledSection[] = []
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (/^\s*(```|~~~)/.test(l)) inCode = !inCode
    const h = !inCode ? HEADING.exec(l) : null
    const kind = h ? kindOfHeading(h[2]!) : null
    if (!h || !kind) { keep.push(l); continue }
    const level = h[1]!.length
    let j = i + 1
    let code = false
    for (; j < lines.length; j++) {
      if (/^\s*(```|~~~)/.test(lines[j]!)) code = !code
      const n = !code ? HEADING.exec(lines[j]!) : null
      if (n && n[1]!.length <= level) break
    }
    const r = readSection(kind, lines.slice(i + 1, j))
    sections.push({ kind, heading: h[2]!.trim(), refs: r.refs, links: r.links, ...(r.kept && { kept: r.kept }) })
    if (r.kept) keep.push(l)
    keep.push(...r.rest)
    i = j - 1
  }
  if (!sections.some((x) => !x.kept)) return { body, sections }
  const out = keep.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s*$/, '\n')
  return { body: out, sections }
}

/** 링크만 있는 절인지 ([[…]], 목록 기호, 쉼표, 화살표 말고 다른 글이 없음) */
export function linksOnly(text: string): string[] | null {
  const links = [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!.split('/').pop()!.trim())
  const rest = text.replace(/\[\[[^\]]*\]\]/g, '').replace(/[-*+•·,;→←↔|>\s\d.()]/g, '')
  return rest ? null : [...new Set(links)]
}

// ---------- 출처 한 줄 읽기 ----------

export interface SourceRef {
  /** 원래 줄 (목록 기호 뺌) */
  text: string
  key?: string
  arxiv?: string
  doi?: string
}

const ARXIV_NEW = /(?:arxiv[:\s]*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?/i
const ARXIV_OLD = /(?:arxiv[:\s]*|arxiv\.org\/(?:abs|pdf)\/)([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i
const ARXIV_OLD_BARE = /\b((?:quant-ph|hep-th|hep-ph|hep-lat|cond-mat|math-ph|gr-qc|nucl-th|astro-ph|nlin|physics|math|cs)(?:\.[A-Za-z-]+)?\/\d{7})(?:v\d+)?/
const ARXIV_BARE = /(?:^|[\s(\[])(\d{4}\.\d{4,5})(?:v\d+)?(?=$|[\s)\],.;])/
const DOI = /\b(10\.\d{4,9}\/[^\s"<>)\]]+)/i

/** 출처 절의 글을 한 항목씩 (목록 한 줄 = 한 항목; 목록이 아니면 빈 줄로 나눈 덩어리) */
export function sourceRefs(text: string): SourceRef[] {
  const items = /^\s*([-*+]|\d+[.)])\s+/m.test(text)
    ? text.split(/\n(?=\s*(?:[-*+]|\d+[.)])\s+)/)
    : text.split(/\n\s*\n/)
  const out: SourceRef[] = []
  for (const raw of items) {
    const t = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim()
    if (!t) continue
    const key = /\[@([^\]\s;,]+)/.exec(t)?.[1] ?? /\\cite[a-z]*\{([^},]+)/.exec(t)?.[1]
    const arxiv = (ARXIV_NEW.exec(t) ?? ARXIV_OLD.exec(t) ?? ARXIV_OLD_BARE.exec(t) ?? ARXIV_BARE.exec(t))?.[1]
    const doi = DOI.exec(t)?.[1]?.replace(/[.,;]+$/, '')
    out.push({ text: t, ...(key && { key }), ...(arxiv && { arxiv }), ...(doi && { doi }) })
  }
  return out
}

// ---------- references.bib ----------

export interface BibIndex { keys: Set<string>; byDoi: Map<string, string>; byArxiv: Map<string, string> }

export function bibIndex(bib: string): BibIndex {
  const entries = parseBib(bib)
  const idx: BibIndex = { keys: new Set(entries.map((e) => e.key)), byDoi: new Map(), byArxiv: new Map() }
  for (const e of entries) {
    if (e.doi) idx.byDoi.set(e.doi.toLowerCase(), e.key)
    if (e.eprint) idx.byArxiv.set(e.eprint.replace(/v\d+$/, ''), e.key)
  }
  return idx
}

/** bib에 이미 있는 항목의 키 (키·DOI·arXiv 번호로 찾음) */
export function findInBib(r: SourceRef, idx: BibIndex): string | undefined {
  if (r.key && idx.keys.has(r.key)) return r.key
  if (r.doi && idx.byDoi.has(r.doi.toLowerCase())) return idx.byDoi.get(r.doi.toLowerCase())
  if (r.arxiv && idx.byArxiv.has(r.arxiv)) return idx.byArxiv.get(r.arxiv)
  return undefined
}

/**
 * 글로만 적힌 출처를 bib의 책(@book) 항목과 맞춘다: 저자(엮은이) 성이 모두 글에 있거나(한 글자 틀림까지, "Reeder" → Reader),
 * 글이 거의 책 제목뿐이면 ("RW, Graph theory: A first course"). 제목이 다른 글 제목 속에 들어 있기만 한 것
 * ("Discharging Rules: A Journey from Euler to …")은 맞추지 않는다. 논문은 제목이 겹치기 쉬워 책만 본다.
 */
export function findBookByText(text: string, entries: BibEntry[]): string | undefined {
  const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const t = fold(refCore(text))
  const words = t.split(/[^a-z]+/).filter(Boolean)
  const near = (a: string, b: string) => {
    if (a === b) return true
    if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false
    // 한 글자 바꿈·넣음·뺌
    let i = 0
    while (i < a.length && a[i] === b[i]) i++
    return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)
  }
  for (const e of entries) {
    if (e.type !== 'book') continue
    const families = (e.author ?? e.editor ?? '').split(/\s+and\s+/).map((a) => fold(a.includes(',') ? a.split(',')[0]! : a.trim().split(/\s+/).pop()!).split(/\s+/).pop()!.replace(/[^a-z]/g, '')).filter(Boolean)
    const title = fold(e.title ?? '').replace(/[^a-z0-9]+/g, ' ').trim()
    if (families.length && families.every((f) => words.some((w) => near(w, f)))) return e.key
    // 제목으로는 글이 거의 제목뿐일 때만: 괄호·링크 주소를 빼고 제목 밖 낱말이 두 개까지
    const bare = t.replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
    if (title.split(' ').length >= 3 && ` ${bare} `.includes(` ${title} `) && bare.split(' ').length - title.split(' ').length <= 2) return e.key
  }
  return undefined
}

export interface NewBib { key: string; title: string; authors: string[]; year: string; journal?: string; volume?: string; pages?: string; doi?: string; arxiv?: string }

const STOP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'from', 'with', 'by', 'at', 'is', 'are'])
const ascii = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '')

/** Zotero(Better BibTeX) 형식의 키: 성 + 제목 첫 낱말 + 연도. 이미 있으면 a, b, … */
export function bibKeyOf(e: Omit<NewBib, 'key'>, taken: Set<string>): string {
  const family = ascii((e.authors[0] ?? 'anon').split(',')[0]!.trim().split(/\s+/).pop()!).toLowerCase() || 'anon'
  const word = e.title.split(/\s+/).map((w) => ascii(w)).find((w) => w && !STOP.has(w.toLowerCase())) ?? ''
  const base = `${family}${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}${e.year}`
  let key = base
  for (let i = 0; taken.has(key); i++) key = `${base}${String.fromCharCode(97 + i)}`
  taken.add(key)
  return key
}

const field = (k: string, v?: string) => (v ? `  ${k} = {${v.replace(/[{}]/g, '')}},\n` : '')

export function bibText(e: NewBib): string {
  const type = e.journal ? 'article' : 'misc'
  return `@${type}{${e.key},\n${field('title', e.title)}${field('author', e.authors.join(' and '))}${field('journal', e.journal)}${field('volume', e.volume)}${field('pages', e.pages)}${field('year', e.year)}${field('doi', e.doi)}${e.arxiv ? `${field('eprint', e.arxiv)}  archiveprefix = {arXiv},\n` : ''}}\n`
}

// ---------- 문헌 정보 받기 (맥에서 옮길 때만, 읽기만 하는 요청) ----------

/** 받아 온 제목의 MathML·HTML 태그와 끝 별표를 뺀다 ("Liquid <mml:…>He<sup>4</sup>…" → "Liquid He4") */
export const plainTitle = (t: string) => t.replace(/<mml:math[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').replace(/\*+$/, '').trim()

const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]!.replace(/\s+/g, ' ').trim())

export async function fetchArxiv(id: string, get: typeof fetch = fetch): Promise<Omit<NewBib, 'key'> | null> {
  const r = await get(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`)
  if (!r.ok) return null
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(await r.text())?.[1]
  if (!entry) return null
  const title = tag(entry, 'title')[0]
  if (!title || /^error$/i.test(title)) return null
  const authors = tag(entry, 'name').map((n) => { const p = n.split(' '); return p.length > 1 ? `${p.pop()}, ${p.join(' ')}` : n })
  const doi = tag(entry, 'arxiv:doi')[0]
  const journal = tag(entry, 'arxiv:journal_ref')[0]
  return { title: plainTitle(title), authors, year: (tag(entry, 'published')[0] ?? '').slice(0, 4), arxiv: id, ...(doi && { doi }), ...(journal && { journal }) }
}

export async function fetchDoi(doi: string, get: typeof fetch = fetch): Promise<Omit<NewBib, 'key'> | null> {
  const r = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
  if (!r.ok) return null
  const m = ((await r.json()) as { message?: Record<string, unknown> }).message
  if (!m) return null
  const title = (m.title as string[] | undefined)?.[0]
  if (!title) return null
  const authors = ((m.author as { family?: string; given?: string }[] | undefined) ?? []).filter((a) => a.family).map((a) => (a.given ? `${a.family}, ${a.given}` : a.family!))
  const parts = ((m.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]) ?? []
  return {
    title: plainTitle(title), authors, year: parts[0] ? String(parts[0]) : '', doi,
    ...((m['container-title'] as string[] | undefined)?.[0] && { journal: (m['container-title'] as string[])[0] }),
    ...(m.volume ? { volume: String(m.volume) } : {}),
    ...(m.page ? { pages: String(m.page) } : m['article-number'] ? { pages: String(m['article-number']) } : {}),
  }
}

/** 인용 글의 알맹이: 링크 표시, `[needs-verify]` 같은 표시, 꾸밈, 끝의 "— 설명"을 뺀다 */
export function refCore(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`[^`]*`/g, '').replace(/\s[—–]\s.*$/, '').replace(/[*_"“”]/g, '').replace(/\s+/g, ' ').replace(/[\s.,;-]+$/, '').trim()
}

/**
 * 같은 문헌인지 견주는 지문: 첫 저자 성 + 연도 (연도가 없으면 알맹이 글 전체, 소문자).
 * "L. N. Cobb, J. Ex. Math. 104, 1189 (1956)"와 "L. N. Cobb, \"Bound …\", … (1956). `[needs-verify]`"는 같은 지문.
 */
export function refFingerprint(text: string): string {
  const core = refCore(text)
  const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const year = /\b(1[89]\d{2}|20\d{2})\b/.exec(core)?.[1]
  // 첫 저자 성: 첫 쉼표 앞 이름의 마지막 낱말 ("L. N. Cobb" → cobb, "Reader, R." → reader)
  const first = core.split(/,|\band\b|&/)[0]!.trim()
  const family = /\./.test(first) || first.split(/\s+/).length > 1 ? first.split(/\s+/).pop()! : first
  return year && family ? `${fold(family).replace(/[^a-z]/g, '')}:${year}` : fold(core)
}

/**
 * 번호 없이 글로만 적힌 출처를 Crossref 서지 검색으로 찾는다 ("J. Ex. Math. 104, 1189 (1956)").
 * 잘못 맞추지 않게 글 속 연도와 첫 저자 성이 결과와 같을 때만 받아들인다. 보고서에는 "글에서 찾음 — 확인 필요"로 따로 보인다.
 */
export async function fetchByText(text: string, get: typeof fetch = fetch): Promise<Omit<NewBib, 'key'> | null> {
  const year = /\b(1[89]\d{2}|20\d{2})\b/.exec(text)?.[1]
  if (!year) return null
  const q = refCore(text).slice(0, 300)
  const r = await get(`https://api.crossref.org/works?rows=1&query.bibliographic=${encodeURIComponent(q)}`)
  if (!r.ok) return null
  const m = ((await r.json()) as { message?: { items?: Record<string, unknown>[] } }).message?.items?.[0]
  const doi = typeof m?.DOI === 'string' ? m.DOI : undefined
  if (!m || !doi) return null
  const parts = ((m.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]) ?? []
  const family = ((m.author as { family?: string }[] | undefined) ?? [])[0]?.family
  const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (String(parts[0] ?? '') !== year || !family || !fold(text).includes(fold(family))) return null
  return fetchDoi(doi, async () => new Response(JSON.stringify({ message: m })))
}

/** 개념노트 화면에 보일 출처: 머리말 sources와 본문 [@키]를 bib에서 찾아서. 없는 키는 missing */
export function conceptSources(keys: string[], bib: string | null): (BibEntry | { key: string; missing: true })[] {
  const entries = bib ? parseBib(bib) : []
  return [...new Set(keys)].map((k) => entries.find((e) => e.key === k) ?? { key: k, missing: true as const })
}
