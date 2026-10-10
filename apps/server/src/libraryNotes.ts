import fs from 'node:fs'
import { fileCache } from './readCache.js'
import path from 'node:path'
import { parseBlock, parseList, stripFrontMatter } from '@rw/core'
import { hashOf, localDate, writeAtomic } from './fsutil.js'
import { WorkbenchError, type SaveResult } from './workbench.js'
import { conceptMdExists, createConceptMd, EMPTY_NOTE, listConceptMd, type CheckState } from './conceptNotes.js'
import { t } from './i18n.js'

/**
 * 공유 라이브러리(research-library)의 노트.
 * - 개념노트 concepts/<id>.tex — 교과서 수준, 프로젝트와 무관. 정의 → 핵심 성질·정리 → 유도 스케치 → 예 → 출처.
 *   status: draft(에이전트·사용자가 씀) → reviewed(사용자 물리·수학 검토)
 * - 문헌노트 papers/<인용 키>.tex — 논문 하나의 요약·핵심 주장·방법·질문. 여러 프로젝트가 함께 본다
 * 머리말 형식은 블록과 같다. 프로젝트의 작업노트는 머리말 concepts: [id, …]로 개념노트에 기댄다.
 */
export type LibraryKind = 'concept' | 'paper'
const DIR: Record<LibraryKind, string> = { concept: 'concepts', paper: 'papers' }
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface LibraryNote {
  kind: LibraryKind
  id: string
  title: string
  status: string
  /** 구조만 있고 내용이 없는 노트 (정리할 대상) */
  empty: boolean
  /** 개념노트를 가져온 Study 노트 (vault 기준 경로) */
  study?: string
  /** 문헌노트: 저자·연도·arXiv */
  authors?: string
  year?: string
  eprint?: string
  mtime: number
  hash: string
  /** 개념노트의 형식. md는 Markdown 개념노트(conceptNotes.ts), 없으면 LaTeX */
  format?: 'md'
  /** md: 미완성인 이유 · 확인함 상태 · 고치기 잠금 */
  unfinished?: string[]
  checked?: CheckState
  locked?: boolean
}

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
    return fs.readdirSync(dir).filter((f) => f.endsWith('.tex') && !(kind === 'concept' && f === 'macros.tex')).sort().map((f) => {
      const file = path.join(dir, f)
      return { kind, ...texNote(file) }
    }).filter((n) => !(kind === 'concept' && mdIds.has(n.id)))
  })].sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'concept' ? -1 : 1))
}

export function libraryNoteFile(lib: string | undefined, kind: string, id: string): string {
  if (!lib) throw new WorkbenchError(404, t('공유 라이브러리가 설정되지 않았음', 'No shared library is set'))
  if (kind !== 'concept' && kind !== 'paper') throw new WorkbenchError(400, t(`종류는 concept·paper: ${kind}`, `Kind must be concept or paper: ${kind}`))
  if (!ID.test(id)) throw new WorkbenchError(400, t(`id가 올바르지 않음: ${id}`, `Invalid id: ${id}`))
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

/** 새 문헌노트 — bib 항목에서. 인용 키가 id */
export function createPaper(lib: string | undefined, e: { key: string; title?: string; author?: string; year?: string; eprint?: string }): { id: string; created: boolean } {
  const file = libraryNoteFile(lib, 'paper', e.key)
  if (fs.existsSync(file)) return { id: e.key, created: false }
  const lines = [
    '% ---', `% id: ${e.key}`, `% title: ${(e.title ?? e.key).replace(/\s+/g, ' ')}`, '% status: draft',
    ...(e.author ? [`% authors: ${e.author.replace(/\s+/g, ' ')}`] : []), ...(e.year ? [`% year: ${e.year}`] : []), ...(e.eprint ? [`% eprint: ${e.eprint}`] : []),
    `% created: ${localDate()}`, '% ---',
    `\\section{${tex(e.title ?? e.key)}}`, '',
    '\\subsection*{요약}', '', '\\subsection*{핵심 주장}', '', '\\subsection*{방법}', '', '\\subsection*{질문·열린 문제}', '',
  ]
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, lines.join('\n'))
  return { id: e.key, created: true }
}

/** 작업노트 머리말의 concepts: [...] */
export function conceptsOf(content: string): string[] {
  const v = parseBlock(content).meta.extra.concepts
  return v ? parseList(v) : []
}

// ---------- Study (Obsidian vault, 읽기만) ----------

export interface StudyNote { path: string; title: string; subject: string; size: number }
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
  if (!abs.startsWith(path.join(study, STUDY_SPACE) + path.sep) || !abs.endsWith('.md') || !fs.existsSync(abs)) throw new WorkbenchError(400, t(`Concept-Space의 노트가 아님: ${rel}`, `Not a note in Concept-Space: ${rel}`))
  const raw = fs.readFileSync(abs, 'utf8')
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
        const st = fs.statSync(p)
        if (st.isDirectory()) walk(p)
        else if (IMAGE.test(n) && !idx.has(n)) idx.set(n, p)
      }
    }
    walk(study)
    assetIndex.set(study, idx)
    return idx
  }
  return (assetIndex.get(study) ?? build()).get(name) ?? build().get(name) ?? null
}
