import type { LibraryKind, LibraryNote, StudyNote } from '@rw/core/contract/library'
import fs from 'node:fs'
import { fileCache } from './readCache.js'
import path from 'node:path'
import { parseBlock, parseList, stripFrontMatter } from '@rw/core'
import { hashOf, localDate, writeAtomic, isInside } from './fsutil.js'
import { WorkbenchError, assertRealInside, type SaveResult } from './workbench.js'
import { conceptMdExists, createConceptMd, EMPTY_NOTE, listConceptMd, splitFrontmatter } from './conceptNotes.js'
import YAML from 'yaml'
import { t } from './i18n.js'

/**
 * 공유 라이브러리의 노트.
 * - 개념노트 concepts/<id>.tex — 교과서 수준, 프로젝트와 무관. 정의 → 핵심 성질·정리 → 유도 스케치 → 예 → 출처.
 *   status: draft(에이전트·사용자가 씀) → reviewed(사용자 물리·수학 검토)
 * - 문헌노트 papers/<인용 키>.md — 논문 하나의 요약·핵심 주장·방법·질문. 여러 프로젝트가 함께 본다.
 *   11/5 피드백(10/31 23:39 진행)부터 새 문헌노트는 Markdown(YAML 머리말). 옛 papers/<키>.tex도 그대로 읽고, 같은 키의 .md가 있으면 .md를 쓴다
 * 머리말 형식은 블록과 같다. 프로젝트의 작업노트는 머리말 concepts: [id, …]로 개념노트에 기댄다.
 */
// 응답 모양은 API 계약(@rw/core/contract/library)에 있다
export type { LibraryKind, LibraryNote, StudyNote } from '@rw/core/contract/library'
const DIR: Record<LibraryKind, string> = { concept: 'concepts', paper: 'papers' }
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/


/** 머리말과 \section·\subsection 줄, 주석을 빼고 남는 글이 거의 없으면 빈 노트 */
export function isEmptyNote(content: string): boolean {
  const { bodyStart } = parseBlock(content)
  const text = content.slice(bodyStart).split('\n')
    .filter((l) => !/^\s*%/.test(l) && !/^\s*\\(?:sub)*section\*?\{/.test(l))
    .join(' ').replace(/\s+/g, ' ').trim()
  return text.length < 40
}

const texNote = fileCache((content, file, st) => {
  const { meta } = parseBlock(content)
  const x = meta.extra
  return { id: meta.id ?? path.basename(file, '.tex'), title: meta.title ?? path.basename(file, '.tex'), status: meta.status ?? 'draft',
    empty: isEmptyNote(content), study: x.study, authors: x.authors, year: x.year, eprint: x.eprint, mtime: st.mtimeMs, hash: hashOf(content) }
})

/** Markdown 문헌노트 (papers/<키>.md): 머리말 title · status · authors · year · eprint */
const mdPaper = fileCache((content, file, st) => {
  const { fm, body } = splitFrontmatter(content)
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)
  const id = path.basename(file, '.md')
  const rest = body.split('\n').filter((l) => !/^\s*#/.test(l)).join(' ').replace(/\s+/g, ' ').trim()
  return { id, title: str(fm.title) ?? id, status: str(fm.status) ?? 'draft', empty: rest.length < 40,
    authors: str(fm.authors), year: str(fm.year), eprint: str(fm.eprint), mtime: st.mtimeMs, hash: hashOf(content), format: 'md' as const }
})

export function listLibraryNotes(lib: string | undefined, indexed?: LibraryNote[]): LibraryNote[] {
  if (!lib) return []
  const md: LibraryNote[] = indexed ?? listConceptMd(lib).map((n) => ({
    kind: 'concept', id: n.id, title: n.meta.title, status: n.checked === 'ok' ? 'reviewed' : 'draft',
    empty: n.unfinished.includes(EMPTY_NOTE), study: n.meta.study, mtime: n.mtime, hash: n.hash,
    format: 'md', unfinished: n.unfinished, checked: n.checked, locked: n.meta.locked,
  }))
  const mdIds = new Set(md.map((n) => n.id))
  return [...md, ...(['concept', 'paper'] as const).flatMap((kind) => {
    const dir = path.join(lib, DIR[kind])
    if (!fs.existsSync(dir)) return []
    // concepts/macros.tex는 기호 모음이지 노트가 아니다
    const names = fs.readdirSync(dir)
    const paperMd = kind === 'paper' ? names.filter((f) => f.endsWith('.md')).sort().map((f) => ({ kind, ...mdPaper(path.join(dir, f)) })).filter((n) => ID.test(n.id)) : []
    const paperMdIds = new Set(paperMd.map((n) => n.id))
    const tex = names.filter((f) => f.endsWith('.tex') && !(kind === 'concept' && f === 'macros.tex')).sort().map((f) => {
      const file = path.join(dir, f)
      return { kind, ...texNote(file) }
    }).filter((n) => !(kind === 'concept' && mdIds.has(n.id)) && !(kind === 'paper' && paperMdIds.has(n.id)))
    return [...paperMd, ...tex]
  })].sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'concept' ? -1 : 1))
}

export function libraryNoteFile(lib: string | undefined, kind: string, id: string): string {
  if (!lib) throw new WorkbenchError(404, t('공유 라이브러리가 설정되지 않았음', 'No shared library is set'))
  if (kind !== 'concept' && kind !== 'paper') throw new WorkbenchError(400, t(`종류는 concept·paper: ${kind}`, `Kind must be concept or paper: ${kind}`))
  if (!ID.test(id)) throw new WorkbenchError(400, t(`id가 올바르지 않음: ${id}`, `Invalid id: ${id}`))
  // 문헌노트: .md가 있으면 .md, 옛 .tex만 있으면 .tex, 둘 다 없으면 새로 만들 .md
  if (kind === 'paper') {
    const md = path.join(lib, DIR.paper, `${id}.md`)
    const tex = path.join(lib, DIR.paper, `${id}.tex`)
    return fs.existsSync(md) || !fs.existsSync(tex) ? md : tex
  }
  return path.join(lib, DIR[kind], `${id}.tex`)
}

export function readLibraryNote(lib: string | undefined, kind: string, id: string): { content: string; hash: string } {
  const file = libraryNoteFile(lib, kind, id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`노트가 없음: ${kind}/${id}`, `No such note: ${kind}/${id}`))
  const content = fs.readFileSync(file, 'utf8')
  return { content, hash: hashOf(content) }
}

export function writeLibraryNote(lib: string | undefined, kind: string, id: string, content: string, baseHash: string): SaveResult {
  const file = libraryNoteFile(lib, kind, id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`노트가 없음: ${kind}/${id}`, `No such note: ${kind}/${id}`))
  const current = hashOf(fs.readFileSync(file, 'utf8'))
  if (current !== baseHash) return { ok: false, currentHash: current }
  writeAtomic(file, content)
  return { ok: true, content, hash: hashOf(content) }
}

/** 제목 → id: 소문자, 영숫자와 -만. 한글뿐이면 날짜 기반 */
export function slugOf(title: string): string {
  const s = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return s || `concept-${localDate().replace(/-/g, '')}`
}

const tex = (s: string) => s.replace(/([#%&$_{}])/g, '\\$1')

/**
 * 새 개념노트 — 기본은 Markdown 기본 양식(conceptNotes.ts CONCEPT_TEMPLATE, 10/4 개념노트 재설계).
 * format: 'tex'는 옛 LaTeX 개념노트 (구조만 있는 draft, Study 원문은 아래 주석으로).
 */
export function createConcept(lib: string | undefined, input: { title: string; study?: { path: string; text: string }; format?: 'md' | 'tex'; subject?: string; body?: string; fm?: Record<string, unknown> }): { id: string } {
  const title = input.title.replace(/\s+/g, ' ').trim()
  if (!title) throw new WorkbenchError(400, t('제목이 필요함', 'A title is required'))
  let id = slugOf(title)
  for (let n = 2; fs.existsSync(libraryNoteFile(lib, 'concept', id)) || conceptMdExists(lib, id); n++) id = `${slugOf(title)}-${n}`
  if (input.format !== 'tex') return createConceptMd(lib, id, { title, study: input.study, subject: input.subject, body: input.body, fm: input.fm })
  const lines = [
    '% ---', `% id: ${id}`, `% title: ${title}`, '% status: draft', `% created: ${localDate()}`,
    ...(input.study ? [`% study: ${input.study.path}`] : []), '% ---',
    `\\section{${tex(title)}}`, '',
    '\\subsection*{정의}', '', '\\subsection*{핵심 성질·정리}', '', '\\subsection*{유도 스케치}', '', '\\subsection*{예}', '', '\\subsection*{출처}', '',
  ]
  if (input.study) {
    lines.push('% ---- Study 원문 (변환 전 재료 — LaTeX로 옮긴 뒤 지운다) ----', ...input.study.text.split('\n').map((l) => `% ${l}`), '')
  }
  const file = libraryNoteFile(lib, 'concept', id)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, lines.join('\n'))
  return { id }
}

/** 새 문헌노트 — bib 항목에서. 인용 키가 id. Markdown(papers/<키>.md)으로 만들고, 같은 키의 .md · .tex가 있으면 그대로 둔다 */
export const PAPER_TEMPLATE = ['## 요약', '', '## 핵심 주장', '', '## 방법', '', '## 질문·열린 문제', ''].join('\n')
export function createPaper(lib: string | undefined, e: { key: string; title?: string; author?: string; year?: string; eprint?: string }): { id: string; created: boolean } {
  const file = libraryNoteFile(lib, 'paper', e.key)
  if (fs.existsSync(file)) return { id: e.key, created: false }
  const title = (e.title ?? e.key).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
  const fields = { title, status: 'draft', ...(e.author && { authors: e.author.replace(/\s+/g, ' ') }), ...(e.year && { year: e.year }), ...(e.eprint && { eprint: e.eprint }), created: localDate() }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, `---\n${YAML.stringify(fields).trimEnd()}\n---\n# ${title}\n\n${PAPER_TEMPLATE}`)
  return { id: e.key, created: true }
}

/** 작업노트 머리말의 concepts: [...] */
export function conceptsOf(content: string): string[] {
  const v = parseBlock(content).meta.extra.concepts
  return v ? parseList(v) : []
}

// ---------- Study (Obsidian vault, 읽기만) ----------

const STUDY_SPACE = 'Concept-Space'

export function listStudy(study: string | undefined): StudyNote[] {
  if (!study) return []
  const root = path.join(study, STUDY_SPACE)
  if (!fs.existsSync(root)) return []
  const out: StudyNote[] = []
  const walk = (dir: string) => {
    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith('.') || n.startsWith('_')) continue
      const p = path.join(dir, n)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else if (n.endsWith('.md')) {
        const rel = path.relative(study, p)
        out.push({ path: rel, title: n.slice(0, -3), subject: rel.split(path.sep).slice(1, -1).join(' › '), size: st.size })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** Study 노트 하나 (Concept-Space 안만). frontmatter는 떼고 본문만 */
export function readStudy(study: string | undefined, rel: string): { title: string; text: string } {
  if (!study) throw new WorkbenchError(404, t('Study 폴더가 없음', 'No Study folder'))
  const abs = path.resolve(study, rel)
  if (!isInside(path.join(study, STUDY_SPACE), abs) || !abs.endsWith('.md') || !fs.existsSync(abs)) throw new WorkbenchError(400, t(`Concept-Space의 노트가 아님: ${rel}`, `Not a note in Concept-Space: ${rel}`))
  // 링크를 따라간 실제 파일도 Concept-Space 안이어야 한다 (보안 검토 L1)
  const raw = fs.readFileSync(assertRealInside(path.join(study, STUDY_SPACE), abs, t(`Concept-Space의 노트가 아님: ${rel}`, `Not a note in Concept-Space: ${rel}`)), 'utf8')
  const text = stripFrontMatter(raw).trim()
  return { title: path.basename(abs, '.md'), text }
}

/** Obsidian 그림(![[이름.png]])을 vault 어디에 있든 이름으로 찾는다. 그림 확장자만, 숨김·_ 폴더는 건너뜀 */
const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i
const assetIndex = new Map<string, Map<string, string>>()
export function findStudyAsset(study: string | undefined, name: string): string | null {
  if (!study || !IMAGE.test(name) || name.includes('/') || name.includes('..')) return null
  const build = () => {
    const idx = new Map<string, string>()
    const walk = (dir: string) => {
      for (const n of fs.readdirSync(dir)) {
        if (n.startsWith('.') || n.startsWith('_')) continue
        const p = path.join(dir, n)
        // 폴더 링크는 따라가지 않는다(vault 밖으로 나가거나 돌고 돈다)
        const st = fs.lstatSync(p)
        if (st.isDirectory()) walk(p)
        else if (IMAGE.test(n) && !idx.has(n)) idx.set(n, p)
      }
    }
    walk(study)
    assetIndex.set(study, idx)
    return idx
  }
  const found = (assetIndex.get(study) ?? build()).get(name) ?? build().get(name)
  // 그림 이름의 링크가 vault 밖을 가리키면 내보내지 않는다 (보안 검토 L1)
  try { return found ? assertRealInside(study, found, '') : null } catch { return null }
}
