import { readSubjects, acceptedSubjects, subjectLabel } from './subjects.js'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { fileCache } from './readCache.js'
import type { LibraryNote } from './libraryNotes.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'
import { frontMatter, stripFrontMatter } from '@rw/core'

/**
 * 지식 — 저장 위치(Study · 개념노트 · 문헌노트 · Topic Review)를 가리지 않고 주제 하나로 모은 색인. 모두 읽기만 한다.
 * - 주제는 이름으로 맞춘다: Study 노트 제목, 개념노트(머리말 study:가 있으면 그 Study 노트, 없으면 제목),
 *   Topic Review(제목·aliases·파일 이름). 이름은 소문자로, 영숫자·한글만 남겨 비교한다.
 * - 연결: A가 [[B]]를 링크하면 B는 A의 전제(links), A는 B에서 이어지는 개념(linkedBy). Study와 Topic Review의 링크.
 * - 문헌노트는 인용으로 주제에 붙는다: 개념노트의 \cite{키}, Topic Review의 [@키]. 어디에도 안 붙으면 문헌노트 하나가 주제 하나.
 * - 상태: 개념노트가 있으면 그 status, 없고 Topic Review가 있으면 draft, Study에만 있으면 study, 문헌노트뿐이면 paper.
 */

export type KnowledgeStatus = 'study' | 'draft' | 'reviewed' | 'paper'
export interface KnowledgeUse { rid: string; project: string; note?: string; noteTitle?: string }
export interface KnowledgeTopic {
  key: string
  title: string
  /** Study 분류 (Concept-Space 아래 폴더, 앞 두 단계). Study에 없으면 '' */
  subject: string
  status: KnowledgeStatus
  study?: { path: string; size: number }
  concept?: { id: string; status: string; empty: boolean; format?: 'md'; unfinished?: string[]; checked?: 'none' | 'ok' | 'changed'; locked?: boolean }
  review?: { path: string; title: string }
  /** 이 주제에 붙은 문헌노트 id */
  papers: string[]
  /** 이 주제를 쓰는 프로젝트 작업노트 (개념노트의 쓰는 곳) */
  uses: KnowledgeUse[]
  /** 전제 — 이 주제가 링크하는 주제 key */
  links: string[]
  /** 이어지는 개념 — 이 주제를 링크하는 주제 key */
  linkedBy: string[]
  /** Study·Topic Review의 첫 문단 (초점 보기의 한 줄 설명) */
  summary?: string
  /** 이 주제로 이어지는 이름들의 topicKey (본문의 [[링크]]를 화면에서 주제로 옮길 때) */
  names: string[]
}

/** 이름 → 비교용 key: 악센트·대소문자·기호를 뺀다. 한글은 NFKD에서 자모로 풀리므로 NFC로 다시 묶는다 */
export function topicKey(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')
}

const WIKILINK = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g
/** 본문의 [[링크]] 대상 이름 (그림 embed는 뺀다) */
export function wikiTargets(text: string): string[] {
  const out: string[] = []
  for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(WIKILINK)) {
    if (m[0].startsWith('!')) continue
    const t = m[1]!.trim().split('/').pop()!.replace(/\.md$/, '')
    if (t) out.push(t)
  }
  return out
}

/** 본문 첫 문단 (머리·콜아웃·수식·목록이 아닌 줄), 길면 자른다 */
export function firstParagraph(text: string): string | undefined {
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim()
    if (!p || /^(#|>|\$\$|```|[-*+] |\d+\.|\||!\[)/.test(p)) continue
    const s = p.replace(/\s+/g, ' ').replace(/!?\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, t: string, a?: string) => (a ?? t).trim()).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[@[^\]]+\]/g, '').trim()
    if (s.length < 20) continue
    return s.length > 220 ? `${s.slice(0, 217)}…` : s
  }
  return undefined
}

function frontmatter(raw: string): Record<string, unknown> {
  const f = frontMatter(raw)
  if (!f) return {}
  try { const v = YAML.parse(f.yaml); return v && typeof v === 'object' ? v as Record<string, unknown> : {} } catch { return {} }
}

// 파일을 바뀔 때만 다시 읽는다 (Study는 노트가 수백 개)
const strList = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((a): a is string => typeof a === 'string' && !!a.trim())

export interface Parsed { mtime: number; size: number; links: string[]; cites: string[]; summary?: string; fm: Record<string, unknown> }
export function parseKnowledgeMarkdown(raw: string, mtime: number, size: number, fm = frontmatter(raw)): Parsed {
  const body = stripFrontMatter(raw)
  return { mtime, size, links: wikiTargets(body), fm, summary: firstParagraph(body),
    cites: [...body.matchAll(/\[@([^\]]+)\]/g)].flatMap((m) => m[1]!.split(/[;,]\s*@?/).map((k) => k.trim().replace(/^@/, ''))).filter(Boolean) }
}
const parseMd = fileCache((raw, _file, st) => parseKnowledgeMarkdown(raw, st.mtimeMs, st.size))

const STUDY_SPACE = 'Concept-Space'

/** Concept-Space의 .md (숨김·_ 폴더 제외) */
function studyFiles(study: string): string[] {
  const root = path.join(study, STUDY_SPACE)
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith('.') || n.startsWith('_')) continue
      const p = path.join(dir, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (n.endsWith('.md')) out.push(p)
    }
  }
  walk(root)
  return out.sort()
}

/** Topic Review 파일: <slug>.md 또는 <slug>/index.md, <묶음>/<slug>.md. 맨 위 index.md(목록 페이지)는 뺀다 */
function reviewFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const walk = (d: string, depth: number) => {
    for (const n of fs.readdirSync(d)) {
      if (n.startsWith('.') || n.startsWith('_')) continue
      const p = path.join(d, n)
      if (fs.statSync(p).isDirectory()) { if (depth < 2) walk(p, depth + 1) } else if (n.endsWith('.md') && !(depth === 0 && n === 'index.md')) out.push(p)
    }
  }
  walk(dir, 0)
  return out.sort()
}
const reviewSlug = (dir: string, file: string) => {
  const rel = path.relative(dir, file).split(path.sep)
  const last = rel.pop()!
  return last === 'index.md' ? rel.pop() ?? 'index' : last.slice(0, -3)
}

/** 개념노트 본문의 \cite{a,b} 키 */
const cachedTexCites = fileCache((raw) => {
  const t = raw.split('\n').filter((l) => !/^\s*%/.test(l)).join('\n')
  return [...t.matchAll(/\\(?:no)?cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)].flatMap((m) => m[1]!.split(',').map((k) => k.trim())).filter(Boolean)
})
function texCites(file: string): string[] { try { return cachedTexCites(file) } catch { return [] } }

export interface KnowledgeSources {
  library?: string
  markdown?: Map<string, Parsed>
  study?: string
  reviews?: string
  notes: LibraryNote[]
  usedBy: Record<string, KnowledgeUse[]>
}

export function buildKnowledge(src: KnowledgeSources): { topics: KnowledgeTopic[]; study: boolean; reviews: boolean } {
  const tree = readSubjects(src.library)
  const byKey = new Map<string, KnowledgeTopic>()
  /** 이름(별칭 포함) → 주제 key */
  const alias = new Map<string, string>()
  const rawLinks = new Map<string, string[]>()
  const rawCites = new Map<string, string[]>()
  const topic = (key: string, title: string): KnowledgeTopic => {
    let t = byKey.get(key)
    if (!t) { t = { key, title, subject: '', status: 'study', papers: [], uses: [], links: [], linkedBy: [], names: [] }; byKey.set(key, t); alias.set(key, key) }
    return t
  }
  const push = <T>(m: Map<string, T[]>, k: string, v: T[]) => { if (v.length) m.set(k, [...(m.get(k) ?? []), ...v]) }

  // 1. Study
  if (src.study) {
    for (const file of studyFiles(src.study)) {
      const title = path.basename(file, '.md')
      const key = topicKey(title)
      if (!key) continue
      const p = parseMd(file)
      const rel = path.relative(src.study, file)
      const t = topic(key, title)
      t.study = { path: rel, size: p.size }
      t.subject = rel.split(path.sep).slice(1, -1).slice(0, 2).join(' › ')
      t.summary ??= p.summary
      for (const a of Array.isArray(p.fm.aliases) ? p.fm.aliases : []) if (typeof a === 'string' && topicKey(a)) alias.set(topicKey(a), key)
      push(rawLinks, key, p.links)
    }
  }

  // 2. Topic Review (Emergence, 읽기만)
  if (src.reviews) {
    for (const file of reviewFiles(src.reviews)) {
      const p = parseMd(file)
      const slug = reviewSlug(src.reviews, file)
      const title = typeof p.fm.title === 'string' ? p.fm.title : slug
      const names = [title, slug, ...(Array.isArray(p.fm.aliases) ? p.fm.aliases.filter((a): a is string => typeof a === 'string').map((a) => a.split('/').pop()!) : [])]
      const key = names.map((n) => alias.get(topicKey(n))).find(Boolean) ?? topicKey(slug)
      if (!key) continue
      const t = topic(key, byKey.get(key)?.title ?? title)
      t.review = { path: path.relative(src.reviews, file), title }
      t.summary ??= typeof p.fm.description === 'string' ? p.fm.description : p.summary
      for (const n of names) if (topicKey(n) && !alias.has(topicKey(n))) alias.set(topicKey(n), key)
      push(rawLinks, key, p.links)
      push(rawCites, key, p.cites)
    }
  }

  // 3. 개념노트 (Markdown 개념노트는 머리말의 별칭·분류와 본문의 [[링크]]·[@인용]도 쓴다)
  const conceptNames = new Map<KnowledgeTopic, string[]>()
  for (const n of src.notes.filter((x) => x.kind === 'concept')) {
    const md = n.format === 'md' && src.library ? (src.markdown ? src.markdown.get(n.id) ?? null : parseMd(path.join(src.library, 'concepts', `${n.id}.md`))) : null
    const aliases = md && Array.isArray(md.fm.aliases) ? md.fm.aliases.filter((a): a is string => typeof a === 'string') : []
    const fromStudy = n.study ? topicKey(path.basename(n.study, '.md')) : ''
    const key = (fromStudy && byKey.has(fromStudy) ? fromStudy : [n.title, ...aliases].map((x) => alias.get(topicKey(x))).find(Boolean)) ?? (topicKey(n.title) || `concept-${n.id}`)
    const t = topic(key, byKey.get(key)?.title ?? n.title)
    if (t.concept) continue // 같은 주제에 개념노트가 둘이면 먼저 것 (목록에는 남지 않음 — 드묾)
    t.concept = { id: n.id, status: n.status, empty: n.empty, ...(md && { format: 'md' as const, unfinished: n.unfinished ?? [], checked: n.checked ?? 'none', locked: !!n.locked }) }
    conceptNames.set(t, [n.title, ...aliases])
    t.uses.push(...(src.usedBy[`concept:${n.id}`] ?? []))
    if (md) {
      t.title = n.title
      if (tree.enabled) { const id = acceptedSubjects(tree, md.fm.subjects)[0]; t.subject = id ? subjectLabel(tree, id) : '' }
      else if (!t.subject && typeof md.fm.subject === 'string') t.subject = md.fm.subject
      t.summary = md.summary ?? t.summary
      for (const a of aliases) if (topicKey(a) && !alias.has(topicKey(a))) alias.set(topicKey(a), key)
      // 머리말의 related(관련 개념)·sources(출처 bib 키)도 본문 링크·인용과 같게 센다
      push(rawLinks, key, [...md.links, ...strList(md.fm.related).map((r) => r.replace(/^\[\[|\]\]$/g, ''))])
      push(rawCites, key, [...md.cites, ...strList(md.fm.sources)])
    } else if (src.library) push(rawCites, key, texCites(path.join(src.library, 'concepts', `${n.id}.tex`)))
  }

  // 다른 개념노트가 뒤에 읽혀도 그 주제를 흡수하지 않도록 모두 붙인 뒤 병합한다.
  // 여러 개념이 같은 Study 이름을 쓰면 주제 key 순으로 결정한다. Topic Review는 그대로 둔다.
  for (const [t, names] of [...conceptNames].sort(([a], [b]) => a.key.localeCompare(b.key))) {
    for (const name of names) {
      const k = topicKey(name)
      const old = byKey.get(k) ?? byKey.get(alias.get(k) ?? '')
      if (!old || old === t || !old.study || old.concept || old.review) continue
      for (const entries of [rawLinks, rawCites]) {
        push(entries, t.key, entries.get(old.key) ?? [])
        entries.delete(old.key)
      }
      for (const [a, key] of alias) if (key === old.key) alias.set(a, t.key)
      alias.set(old.key, t.key)
      byKey.delete(old.key)
    }
  }

  // 4. 문헌노트 — 인용으로 붙이고, 안 붙은 것은 따로
  const paperIds = new Set(src.notes.filter((x) => x.kind === 'paper').map((x) => x.id))
  const attached = new Set<string>()
  for (const [key, cites] of rawCites) {
    const t = byKey.get(key)!
    for (const c of new Set(cites)) if (paperIds.has(c)) { t.papers.push(c); attached.add(c) }
  }
  for (const n of src.notes.filter((x) => x.kind === 'paper' && !attached.has(x.id))) {
    const t = topic(`paper:${n.id}`, n.title)
    t.papers.push(n.id)
    t.uses.push(...(src.usedBy[`paper:${n.id}`] ?? []))
  }

  // 5. 링크 → 전제·이어짐 (있는 주제끼리만, 자기 자신 제외)
  for (const [from, targets] of rawLinks) {
    const t = byKey.get(from)!
    for (const name of targets) {
      const to = alias.get(topicKey(name))
      if (!to || to === from || t.links.includes(to)) continue
      t.links.push(to)
      byKey.get(to)!.linkedBy.push(from)
    }
  }

  for (const [name, key] of alias) byKey.get(key)!.names.push(name)
  for (const t of byKey.values()) {
    t.status = t.concept ? (t.concept.status === 'reviewed' ? 'reviewed' : 'draft') : t.review ? 'draft' : t.study ? 'study' : 'paper'
  }
  const topics = [...byKey.values()].sort((a, b) => (a.subject || '￿').localeCompare(b.subject || '￿') || a.title.localeCompare(b.title))
  return { topics, study: !!src.study, reviews: !!src.reviews && fs.existsSync(src.reviews) }
}

/** Topic Review 하나 (그 폴더 안의 .md만). frontmatter는 떼고 본문만 */
export function readReview(dir: string | undefined, rel: string): { title: string; text: string } {
  if (!dir) throw new WorkbenchError(404, t('Topic Review 폴더가 없음', 'No Topic Review folder'))
  const abs = path.resolve(dir, rel)
  if (!abs.startsWith(path.resolve(dir) + path.sep) || !abs.endsWith('.md') || !fs.existsSync(abs)) throw new WorkbenchError(400, t(`Topic Review가 아님: ${rel}`, `Not a Topic Review: ${rel}`))
  const raw = fs.readFileSync(abs, 'utf8')
  const fm = frontmatter(raw)
  return { title: typeof fm.title === 'string' ? fm.title : path.basename(abs, '.md'), text: stripFrontMatter(raw).trim() }
}
