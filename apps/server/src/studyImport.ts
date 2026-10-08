import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { listConceptMd, splitFrontmatter, unfinishedReasons } from './conceptNotes.js'
import { findStudyAsset, listLibraryNotes, slugOf } from './libraryNotes.js'
import { topicKey } from './knowledge.js'
import { hashOf, localDate, writeAtomic } from './fsutil.js'
import { parseBib } from './materials.js'
import { bibIndex, bibKeyOf, bibText, fetchArxiv, fetchByText, fetchDoi, findBookByText, findInBib, linksOnly, pullSections, refFingerprint, sourceRefs, type NewBib, type SourceRef } from './conceptSources.js'

/**
 * Study(Obsidian)의 Concept-Space 개념 노트를 research-library/concepts/<id>.md로 한 번에 옮긴다 (개념노트 재설계 2단계).
 * - Study는 읽기만 한다. 본문은 그대로 옮기고, 머리말만 새로 쓴다 (title·aliases·subject·study, 원래 머리말의 다른 키는 그대로).
 * - 단, 출처·쓰는 개념·관련 개념 절은 본문에서 떼어 낸다 (conceptSources.ts): 출처는 references.bib 키로 머리말 sources:에,
 *   관련 개념 링크는 머리말 related:에, 쓰는 개념 목록은 버린다(앱이 계산). 키로 못 바꾼 출처 글은 sources_unsorted:에 두고 보고한다.
 * - 본문의 ![[그림]]은 vault에서 찾아 concepts/attachments/로 복사한다 (이름이 같고 내용이 다르면 옮기지 않고 보고).
 * - 이미 같은 Study 노트에서 옮긴 개념노트가 있으면 건너뛴다 (다시 돌려도 안전).
 * - 이름(별칭 포함)이 겹치는 노트는 옮기되 "겹침"으로 보고한다 (개념 하나에 노트 하나 — 합칠지는 사용자가 정한다).
 * - 단, Study 안에서 제목이 같은 노트(폴더 사본 등)는 하나로 합친다: 가장 긴 노트를 남기고, 다른 노트의 글이 그 안에 없으면 끝에 붙인다.
 * - 책·강의의 장·절 노트(개념 하나가 아니라 장 하나)는 나중에 교재 노트와 함께 옮기므로 건너뛴다 (2026-10-04 사용자 결정).
 * plan()은 아무것도 쓰지 않고 할 일만 계산한다. apply()가 plan대로 쓴다.
 */
export interface ImportItem {
  study: string
  id: string
  title: string
  subject: string
  aliases: string[]
  /** 이미 옮겨서 건너뜀 */
  skip?: string
  unfinished: string[]
  images: string[]
  missingImages: string[]
  /** attachments/에 같은 이름의 다른 그림이 있음 */
  imageClash: string[]
  /** 같은 이름으로 이어지는 다른 노트 */
  sameName: string[]
  /** 새 머리말 */
  meta: Record<string, unknown>
  body: string
  /** 떼어 낸 절 제목들 */
  pulled: string[]
  /** references.bib 키 (이미 있거나 새로 만들 것) */
  sources: string[]
  /** arXiv·DOI는 있는데 bib에 없는 출처 (resolveSources가 받아서 sources로 옮김) */
  toFetch: SourceRef[]
  /** 키로 못 바꾼 출처 글 */
  unsorted: string[]
  /** 글로 남은 출처마다 같은 문헌의 다른 꼴 (서지 검색에서 차례로 시도) */
  unsortedAlts?: Record<string, string[]>
  /** 글에서 Crossref 서지 검색으로 찾아 맞춘 것 (확인 필요) */
  guessed: { key: string; text: string }[]
  related: string[]
  /** 링크 말고 다른 글이 있어서 떼지 않은 관련·쓰는 개념 절 */
  keptSections: string[]
}

export function contentOf(it: ImportItem): string {
  const meta = { ...it.meta }
  if (it.sources.length) meta.sources = it.sources
  if (it.related.length) meta.related = it.related
  if (it.unsorted.length) meta.sources_unsorted = it.unsorted
  return `---\n${YAML.stringify(meta).replace(/\n*$/, '\n')}---\n${it.body}`
}

const SPACE = 'Concept-Space'
const IMAGE_EMBED = /!\[\[([^\]|#]+?\.(?:png|jpe?g|gif|svg|webp))(?:\|[^\]]*)?\]\]/gi

function studyFiles(study: string): string[] {
  const root = path.join(study, SPACE)
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const n of fs.readdirSync(dir).sort()) {
      if (n.startsWith('.') || n.startsWith('_')) continue
      const p = path.join(dir, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (n.endsWith('.md')) out.push(p)
    }
  }
  walk(root)
  return out
}

/** 개념이 아닌 노트: 목차·장 머리·날짜·이름 없음·지도. 개념노트로 옮기지 않는다 (--include-index로 옮김) */
export function indexLike(title: string, body: string): string | null {
  if (/^(contents\b|table of contents|목차|untitled|무제|map|index|\d{4}-\d{2}-\d{2})$|^(contents|목차)\b/i.test(title.trim())) return title
  const text = body.replace(/^#.*$/gm, '').trim()
  if (text && linksOnly(text)?.length) return '링크 목록뿐'
  return null
}

/** 책·강의의 장·절 노트: 제목이 장 번호로 시작하거나 교재·강의 폴더 안에 있다 */
export function chapterLike(title: string, rel: string): boolean {
  return /^(sec\.?\s*\d|chap(ter)?\.?\s*\d|\d+(\.\d+)*\.?\s|tutorial\s*\d)/i.test(title) || /(^|\/)(textbooks?|lectures?|courses?)\//i.test(rel)
}

// 사본끼리 견줄 글: 머리말을 빼고, 띄어쓰기와 문장부호(. , ; : ! ?) 차이만 무시한다 (수식 기호는 그대로 견줌)
const plainText = (s: string) => s.replace(/^---[\s\S]*?---/, '').toLowerCase().replace(/[.,;:!?]/g, ' ').replace(/\s+/g, ' ').trim()

export function planStudyImport(study: string, lib: string, opts: { includeIndex?: boolean; includeChapters?: boolean } = {}): ImportItem[] {
  const bibFile = path.join(lib, 'references.bib')
  const bibSource = fs.existsSync(bibFile) ? fs.readFileSync(bibFile, 'utf8') : ''
  const bib = bibIndex(bibSource)
  const books = parseBib(bibSource).filter((e) => e.type === 'book')
  const existing = listConceptMd(lib)
  // 이미 옮긴 Study 경로: study와, 합친 사본의 경로 study_also
  const alsoOf = (id: string) => { const v = splitFrontmatter(fs.readFileSync(path.join(lib, 'concepts', `${id}.md`), 'utf8')).fm.study_also; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] }
  const done = new Map(existing.flatMap((n) => [...(n.meta.study ? [n.meta.study] : []), ...alsoOf(n.id)].map((st) => [st, n.id] as const)))
  const taken = new Set([...existing.map((n) => n.id), ...(fs.existsSync(path.join(lib, 'concepts')) ? fs.readdirSync(path.join(lib, 'concepts')).filter((f) => f.endsWith('.tex')).map((f) => f.slice(0, -4)) : [])])
  const items: ImportItem[] = []
  for (const file of studyFiles(study)) {
    const rel = path.relative(study, file).split(path.sep).join('/')
    const title = path.basename(file, '.md')
    const raw = fs.readFileSync(file, 'utf8')
    const { fm, body: original } = splitFrontmatter(raw)
    // 출처·쓰는 개념·관련 개념 절 떼어 내기 (떼지 못한 절은 본문에 그대로)
    const { body, sections } = pullSections(original)
    const pulled = sections.filter((x) => !x.kept).map((x) => x.heading)
    const keptSections = sections.filter((x) => x.kept).map((x) => `${x.heading} (${x.kept})`)
    const refs: SourceRef[] = sections.flatMap((x) => x.refs)
    const related: string[] = [...new Set(sections.flatMap((x) => x.links))]
    // 원래 머리말의 source-refs (Study 노트 169개가 씀): 링크면 관련 개념, 아니면 출처
    for (const t of (Array.isArray(fm['source-refs']) ? fm['source-refs'] : typeof fm['source-refs'] === 'string' ? [fm['source-refs']] : []).filter((x): x is string => typeof x === 'string' && !!x.trim())) {
      const only = linksOnly(t)
      if (only) related.push(...only.filter((l) => !related.includes(l)))
      else refs.push(...sourceRefs(`- ${t}`))
    }
    const sources: string[] = []
    const toFetch: SourceRef[] = []
    const unsorted: string[] = []
    // 같은 노트 안에서 같은 문헌(지문이 같은 것)은 하나만: 키·arXiv·DOI가 있는 쪽, 아니면 긴 글을 남긴다
    // 다른 꼴은 버리지 않고 alts로 두어, 받아 올 때 차례로 시도한다 (맞추기 쉬운 꼴이 따로 있을 수 있다)
    const byPrint = new Map<string, SourceRef>()
    const variants = new Map<string, string[]>()
    for (const r of refs) {
      const k = refFingerprint(r.text)
      variants.set(k, [...(variants.get(k) ?? []), r.text])
      const had = byPrint.get(k)
      const score = (x: SourceRef) => (x.key || x.arxiv || x.doi ? 1000 : 0) + x.text.length
      if (!had || score(r) > score(had)) byPrint.set(k, r)
    }
    const unsortedAlts: Record<string, string[]> = {}
    const guessed: { key: string; text: string }[] = []
    for (const r of byPrint.values()) {
      const key = findInBib(r, bib)
      const book = !key && !r.arxiv && !r.doi ? findBookByText(r.text, books) : undefined
      if (key) sources.push(key)
      else if (book) { sources.push(book); guessed.push({ key: book, text: r.text }) }
      else if (r.arxiv || r.doi) toFetch.push(r)
      else if (!unsorted.includes(r.text)) {
        unsorted.push(r.text)
        const alts = (variants.get(refFingerprint(r.text)) ?? []).filter((t) => t !== r.text)
        if (alts.length) unsortedAlts[r.text] = [...new Set(alts)]
      }
    }
    const aliases = Array.isArray(fm.aliases) ? fm.aliases.filter((a): a is string => typeof a === 'string' && !!a.trim()) : typeof fm.aliases === 'string' ? [fm.aliases] : []
    const subject = rel.split('/').slice(1, -1).join(' › ')
    const images = [...new Set([...body.matchAll(IMAGE_EMBED)].map((m) => m[1]!.trim().split('/').pop()!))]
    const missingImages = images.filter((n) => !findStudyAsset(study, n))
    const imageClash = images.filter((n) => {
      const dest = path.join(lib, 'concepts', 'attachments', n)
      const src = findStudyAsset(study, n)
      return !!src && fs.existsSync(dest) && hashOf(fs.readFileSync(dest, 'latin1')) !== hashOf(fs.readFileSync(src, 'latin1'))
    })
    const prev = done.get(rel)
    let id = prev ?? slugOf(title)
    if (!prev) {
      const base = id
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
      taken.add(id)
    }
    // 머리말: 앱이 쓰는 키를 앞에, 원래 Obsidian 머리말의 다른 키(tags 등)는 그대로 뒤에
    const rest = Object.fromEntries(Object.entries(fm).filter(([k]) => !['title', 'aliases', 'subject', 'study', 'sources', 'related', 'sources_unsorted', 'source-refs'].includes(k)))
    const meta = { title, ...(aliases.length && { aliases }), ...(subject && { subject }), study: rel, imported: localDate(), ...rest }
    const index = !opts.includeIndex && indexLike(title, body)
    const chapter = !opts.includeChapters && chapterLike(title, rel)
    items.push({ study: rel, id, title, subject, aliases, ...(prev ? { skip: `이미 옮김 (${prev})` } : index ? { skip: `목차·날짜·빈 이름 노트로 보여 건너뜀 (${index})` } : chapter ? { skip: CHAPTER_SKIP } : {}), unfinished: unfinishedReasons(body), images, missingImages, imageClash, sameName: [], meta, body, pulled, sources: [...new Set(sources)], toFetch, unsorted, ...(Object.keys(unsortedAlts).length && { unsortedAlts }), guessed, related, keptSections })
  }
  mergeSameTitle(items)
  // 이름 겹침: 제목·별칭의 비교용 이름이 같은 노트끼리. 같은 제목끼리도 잡게 id로 비교하고, 이미 있는 개념노트(.md·.tex) 포함
  const byName = new Map<string, Map<string, string>>()
  const add = (name: string, id: string, label: string) => { const k = topicKey(name); if (!k) return; const m = byName.get(k) ?? new Map<string, string>(); m.set(id, label); byName.set(k, m) }
  for (const n of listLibraryNotes(lib).filter((x) => x.kind === 'concept')) {
    const md = existing.find((e) => e.id === n.id)
    for (const a of [n.title, ...(md?.meta.aliases ?? [])]) add(a, `lib:${n.id}`, `${n.title} (라이브러리 concepts/${n.id}.${n.format === 'md' ? 'md' : 'tex'})`)
  }
  for (const it of items) if (!it.skip) for (const a of [it.title, ...it.aliases]) add(a, it.id, `${it.title} (Study ${it.study})`)
  for (const it of items) {
    if (it.skip) continue
    const others = new Set<string>()
    for (const a of [it.title, ...it.aliases]) for (const [id, label] of byName.get(topicKey(a)) ?? []) if (id !== it.id) others.add(label)
    it.sameName = [...others]
  }
  return items
}

export const CHAPTER_SKIP = '책·강의의 장·절 노트 — 나중에 교재 노트와 함께 옮김 (--include-chapters로 지금 옮김)'

/**
 * Study 안에서 제목이 같은 노트(폴더 사본 등)를 하나로: 가장 긴 노트를 남긴다. 다른 노트의 글이 남긴 노트 안에 다 있으면 버리고,
 * 아니면 남긴 노트 끝에 "다른 사본에서" 절로 붙인다 (글을 잃지 않게). 출처·관련 개념·별칭도 모은다. 머리말 study_also에 다른 경로를 둔다.
 */
function mergeSameTitle(items: ImportItem[]): void {
  const groups = new Map<string, ImportItem[]>()
  for (const it of items) if (!it.skip) { const k = topicKey(it.title); if (k) groups.set(k, [...(groups.get(k) ?? []), it]) }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const keep = [...group].sort((a, b) => plainText(b.body).length - plainText(a.body).length)[0]!
    // 남는 노트가 번호 없는 id를 갖게 (처음 노트의 id와 바꿈)
    if (keep !== group[0]) [keep.id, group[0]!.id] = [group[0]!.id, keep.id]
    const also: string[] = []
    for (const it of group) {
      if (it === keep) continue
      also.push(it.study)
      const other = plainText(it.body)
      if (other && !plainText(keep.body).includes(other)) keep.body = `${keep.body.replace(/\s*$/, '\n')}\n## 다른 사본에서 (Study ${it.study})\n\n${it.body.trim()}\n`
      for (const k of it.sources) if (!keep.sources.includes(k)) keep.sources.push(k)
      for (const r of it.toFetch) if (!keep.toFetch.some((x) => x.text === r.text)) keep.toFetch.push(r)
      for (const t of it.unsorted) if (!keep.unsorted.includes(t)) { keep.unsorted.push(t); if (it.unsortedAlts?.[t]) keep.unsortedAlts = { ...keep.unsortedAlts, [t]: it.unsortedAlts[t]! } }
      for (const l of it.related) if (!keep.related.includes(l)) keep.related.push(l)
      for (const a of it.aliases) if (!keep.aliases.includes(a)) keep.aliases.push(a)
      for (const n of it.images) if (!keep.images.includes(n)) keep.images.push(n)
      keep.missingImages.push(...it.missingImages.filter((n) => !keep.missingImages.includes(n)))
      keep.imageClash.push(...it.imageClash.filter((n) => !keep.imageClash.includes(n)))
      keep.guessed.push(...it.guessed)
      keep.keptSections.push(...it.keptSections)
      it.skip = `같은 제목의 노트와 합침 (concepts/${keep.id}.md)`
    }
    if (keep.aliases.length) keep.meta.aliases = keep.aliases
    keep.meta.study_also = also
    keep.unfinished = unfinishedReasons(keep.body)
  }
}

/**
 * arXiv 번호·DOI만 있고 bib에 없는 출처를 받아 새 bib 항목으로 만든다 (읽기만 하는 요청).
 * 같은 문헌은 한 번만 받는다. 받지 못한 것은 출처 글(unsorted)로 남긴다. 아무것도 쓰지 않는다 — 쓰는 것은 applyStudyImport.
 */
export async function resolveSources(lib: string, items: ImportItem[], get: typeof fetch = fetch): Promise<NewBib[]> {
  const bibFile = path.join(lib, 'references.bib')
  const taken = bibIndex(fs.existsSync(bibFile) ? fs.readFileSync(bibFile, 'utf8') : '').keys
  const got = new Map<string, NewBib | null>()
  const tried = new Set<string>()
  const made: NewBib[] = []
  for (const it of items) {
    if (it.skip) continue
    for (const r of it.toFetch) {
      const id = r.arxiv ? `arxiv:${r.arxiv}` : `doi:${r.doi!.toLowerCase()}`
      if (!got.has(id)) {
        let e: Omit<NewBib, 'key'> | null = null
        try { e = r.arxiv ? await fetchArxiv(r.arxiv, get) : await fetchDoi(r.doi!, get) } catch { e = null }
        // 이미 받은 다른 쪽(DOI ↔ arXiv)과 같은 문헌이면 그 키
        const same = e && made.find((m) => (e!.doi && m.doi?.toLowerCase() === e!.doi.toLowerCase()) || (e!.arxiv && m.arxiv === e!.arxiv))
        const entry = same ?? (e ? { ...e, key: bibKeyOf(e, taken) } : null)
        if (entry && !same) made.push(entry)
        got.set(id, entry)
      }
      const entry = got.get(id)
      if (entry) { if (!it.sources.includes(entry.key)) it.sources.push(entry.key) } else it.unsorted.push(r.text)
    }
    it.toFetch = []
    // 글로만 적힌 출처: 연도가 있으면 서지 검색으로 찾아 본다 (연도·첫 저자가 맞을 때만)
    const left: string[] = []
    for (const t of it.unsorted) {
      // 다른 노트에서 이미 맞춘 같은 문헌(지문이 같은 것)이면 그 키
      const id = `text:${refFingerprint(t)}`
      // 맞춘 것은 지문으로, 못 맞춘 것은 글 그대로 기억한다 (같은 문헌의 다른 꼴은 다시 찾아 본다)
      if (!got.get(id) && !tried.has(t)) {
        tried.add(t)
        let e: Omit<NewBib, 'key'> | null = null
        for (const form of [t, ...(it.unsortedAlts?.[t] ?? [])]) {
          try { e = await fetchByText(form, get) } catch { e = null }
          if (e) break
        }
        const known = e?.doi ? bibIndex(fs.existsSync(bibFile) ? fs.readFileSync(bibFile, 'utf8') : '').byDoi.get(e.doi.toLowerCase()) : undefined
        const same = e && made.find((m) => !!e!.doi && m.doi?.toLowerCase() === e!.doi.toLowerCase())
        const entry = known ? { ...e!, key: known } : same ?? (e ? { ...e, key: bibKeyOf(e, taken) } : null)
        if (entry && !same && !known) made.push(entry)
        if (entry) got.set(id, entry)
      }
      const entry = got.get(id)
      if (entry) { if (!it.sources.includes(entry.key)) it.sources.push(entry.key); it.guessed.push({ key: entry.key, text: t }) } else left.push(t)
    }
    it.unsorted = left
  }
  return made
}

/** plan대로 쓴다: concepts/<id>.md, 그림, references.bib 끝에 새 항목. 이미 있는 파일은 덮지 않는다 */
export function applyStudyImport(study: string, lib: string, items: ImportItem[], newBib: NewBib[] = []): { written: string[]; images: string[]; bib: number } {
  const written: string[] = []
  const images: string[] = []
  const bibFile = path.join(lib, 'references.bib')
  const old = fs.existsSync(bibFile) ? fs.readFileSync(bibFile, 'utf8') : ''
  const have = bibIndex(old).keys
  const add = newBib.filter((e) => !have.has(e.key))
  if (add.length) writeAtomic(bibFile, `${old.replace(/\s*$/, '\n')}\n% Study 개념 노트를 옮기며 arXiv·DOI로 받은 항목 (${localDate()})\n${add.map(bibText).join('\n')}`)
  for (const it of items) {
    if (it.skip) continue
    const file = path.join(lib, 'concepts', `${it.id}.md`)
    if (fs.existsSync(file)) continue
    writeAtomic(file, contentOf(it))
    written.push(it.id)
    for (const n of it.images) {
      if (it.missingImages.includes(n) || it.imageClash.includes(n)) continue
      const dest = path.join(lib, 'concepts', 'attachments', n)
      if (fs.existsSync(dest)) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(findStudyAsset(study, n)!, dest)
      images.push(n)
    }
  }
  return { written, images, bib: add.length }
}

/** 사람이 읽는 보고서 (Markdown) */
export function importReport(items: ImportItem[], newBib: NewBib[] = []): string {
  const todo = items.filter((i) => !i.skip)
  const withSources = todo.filter((i) => i.sources.length)
  const unsorted = todo.filter((i) => i.unsorted.length || i.toFetch.length)
  const kept = todo.filter((i) => i.keptSections.length)
  const indexSkipped = items.filter((i) => i.skip?.startsWith('목차'))
  const guessed = todo.filter((i) => i.guessed.length)
  // 책·강의의 장·절 노트로 보이는 것 (개념 하나가 아니라 장 하나) — 옮길지 사용자가 정한다
  const chapters = items.filter((i) => i.skip === CHAPTER_SKIP)
  const merged = items.filter((i) => i.skip?.startsWith('같은 제목'))
  const empty = todo.filter((i) => i.unfinished.includes('제목·틀뿐'))
  const partial = todo.filter((i) => i.unfinished.length && !i.unfinished.includes('제목·틀뿐'))
  const dup = todo.filter((i) => i.sameName.length)
  const missing = todo.filter((i) => i.missingImages.length || i.imageClash.length)
  const subjects = new Map<string, number>()
  for (const i of todo) subjects.set(i.subject || '분류 없음', (subjects.get(i.subject || '분류 없음') ?? 0) + 1)
  const lines = [
    `# Study 개념 노트 옮기기 — 미리 보기 (${localDate()})`, '',
    `- 옮길 노트 ${todo.length}개 (건너뜀 ${items.length - todo.length}개: 이미 옮김 ${items.length - todo.length - indexSkipped.length - chapters.length - merged.length} · 목차·지도·날짜 노트 ${indexSkipped.length} · 장·절 노트 ${chapters.length} · 같은 제목이라 합침 ${merged.length})`,
    `- 다 쓴 노트 ${todo.length - empty.length - partial.length} · 일부 미완성 ${partial.length} · 빈 노트(제목·틀뿐) ${empty.length}`,
    `- 그림 ${new Set(todo.flatMap((i) => i.images)).size}개 복사 (찾지 못함·이름 충돌 ${missing.length}개 노트)`,
    `- 이름이 겹치는 노트 ${dup.length}개 (개념 하나에 노트 하나 — 합칠지 정해 주세요)`,
    `- 출처: bib 키로 바꾼 노트 ${withSources.length}개 (새 bib 항목 ${newBib.length}개, 그중 글에서 찾아 맞춘 것이 있는 노트 ${guessed.length}개) · 글로만 남은 출처가 있는 노트 ${unsorted.length}개`,
    `- 본문에서 뗀 절 ${todo.reduce((n, i) => n + i.pulled.length, 0)}개 (출처·쓰는 개념·관련 개념) · 원고를 잃지 않게 떼지 않은 절이 있는 노트 ${kept.length}개`, '',
    '## 분류별', '', ...[...subjects].sort().map(([s, n]) => `- ${s}: ${n}`), '',
  ]
  if (dup.length) lines.push('## 이름이 겹치는 노트', '', ...dup.map((i) => `- ${i.title} ↔ ${i.sameName.join(', ')}`), '')
  if (missing.length) lines.push('## 그림 문제', '', ...missing.map((i) => `- ${i.title}: ${[...i.missingImages.map((n) => `${n} (찾지 못함)`), ...i.imageClash.map((n) => `${n} (같은 이름의 다른 그림이 이미 있음)`)].join(', ')}`), '')
  if (newBib.length) lines.push('## 새 bib 항목 (references.bib 끝에 붙임)', '', ...newBib.map((e) => `- \`${e.key}\` ${e.authors.slice(0, 3).map((a) => a.split(',')[0]).join(', ')}${e.authors.length > 3 ? ' et al.' : ''}, ${e.title} (${e.year})${e.arxiv ? ` arXiv:${e.arxiv}` : ''}${e.doi ? ` doi:${e.doi}` : ''}`), '')
  if (unsorted.length) lines.push('## 글로만 남은 출처 (키로 바꾸지 못함 — 머리말 sources_unsorted에 둠)', '', ...unsorted.flatMap((i) => [`- **${i.title}**`, ...[...i.unsorted, ...i.toFetch.map((r) => `${r.text} (받기 전)`)].map((t) => `  - ${t}`)]), '')
  if (guessed.length) lines.push('## 글에서 찾아 맞춘 출처 (서지 검색은 연도·첫 저자가 맞은 것만, 책은 저자나 제목으로 — 확인 필요)', '', ...guessed.flatMap((i) => [`- **${i.title}**`, ...i.guessed.map((g) => `  - \`${g.key}\` ← ${g.text}`)]), '')
  if (kept.length) lines.push('## 떼지 않은 절 (본문 글이 섞여 있어 그대로 둠)', '', ...kept.map((i) => `- ${i.title}: ${i.keptSections.join(', ')}`), '')
  if (merged.length) lines.push('## 같은 제목이라 합친 노트', '', ...merged.map((i) => `- ${i.title} (Study ${i.study}) → ${i.skip!.replace(/^.*\((.*)\)$/, '$1')}`), '')
  if (chapters.length) lines.push('## 나중에 옮길 책·강의의 장·절 노트', '', ...chapters.map((i) => `- ${i.title} (${i.subject})`), '')
  if (indexSkipped.length) lines.push('## 건너뛴 목차·지도·날짜 노트 (--include-index로 옮김)', '', ...indexSkipped.map((i) => `- ${i.title} (Study ${i.study})`), '')
  lines.push('## 전체 목록', '', '| 노트 | 파일 | 분류 | 상태 |', '| --- | --- | --- | --- |',
    ...items.map((i) => `| ${i.title} | ${i.skip ? '—' : `concepts/${i.id}.md`} | ${i.subject} | ${i.skip ?? (i.unfinished.length ? `미완성: ${i.unfinished.join(' · ')}` : '다 씀')} |`), '')
  return lines.join('\n')
}
