import fs from 'node:fs'
import path from 'node:path'
import {
  appendJournalEntry, buildTree, hasBlockHeader, isValidBlockId, parseBlock, parseCardFigureRef, parseJournal, setTodoDone, editJournalEntry, suggestBlockId, updateBlockMeta,
  type BlockFormat, type BlockMeta, type BlockTree, type JournalEntry, type MetaPatch, type NewJournalEntry,
} from '@rw/core'
import YAML from 'yaml'
import { fileCache } from './readCache.js'
import { hashOf, localDate, writeAtomic, writeIfMissing } from './fsutil.js'
import { t } from './i18n.js'

export interface ResearchInfo {
  title: string
  question: string
  started: string
  /** 이 프로젝트가 이미 가진 정본의 위치 (research.yaml의 sources:). 앱과 STATUS.md가 읽는다 */
  sources: ProjectSources
  /** true면 앱이 workbench/STATUS.md를 저절로 다시 쓴다 (research.yaml의 agent-status:) */
  agentStatus: boolean
  /** 프로젝트 전체가 기대는 공유 라이브러리 개념노트 id (research.yaml의 concepts:). 보조 노트 없이도 연결된다 */
  concepts: string[]
  /** 본문만 있는 노트(\documentclass 없음)를 컴파일할 때 붙일 LaTeX 서식 id (research.yaml의 latex-template:). 없으면 앱의 내보내기 기본 서식 */
  latexTemplate?: string
  /** 그 노트들에 함께 붙일 이 연구 전용 기호 파일 (research.yaml의 latex-macros:, 저장소 기준). 없으면 workbench/macros.tex */
  latexMacros?: string
  /** 프로젝트 카드 가운데 그림 (figure:<그림 id> 또는 예전 저장소 기준 경로). 없으면 색만 */
  image?: string
}

/**
 * research.yaml
 *   sources:
 *     canon:                 # 내용의 정본 — 에이전트 안내용 한 줄씩 ("경로 — 설명")
 *       - docs/model/main.tex — 모형 연구 원고
 *     tasks: docs/TASK-QUEUE.md   # 프로젝트 자체 작업 목록 (읽기만, 첫 마크다운 표)
 *     bib: [docs/model/references.bib]              # 없으면 저장소 맨 위 *.bib
 *     materials: [docs/theory/papers]   # workbench/materials/ 말고 더 볼 자료 폴더
 *     reviews: [docs/theory]   # 검토 상태(frontmatter status)를 볼 문서 폴더
 *     manuscript: docs/model/main.tex — 모형 연구노트   # 메인 노트(원고): 앱이 장·부록을 노트로 열고 컴파일
 *     # 메인 노트가 여럿이면 목록으로 (첫째가 기본):
 *     # manuscript:
 *     #   - docs/model/main.tex — 모형 연구노트
 *     #   - docs/development/main.tex — 이론 개발 노트
 * 경로는 저장소 기준. 저장소 밖이나 없는 경로는 무시한다.
 */
export interface ProjectSources {
  canon: { path: string; note: string }[]
  /** 첫째 메인 노트(원고) main .tex와 이름. \input한 장·부록을 앱에서 노트로 연다 */
  manuscript?: { path: string; name: string }
  /**
   * 메인 노트 전부 (research.yaml의 manuscript가 목록이면 여럿, 첫째 = manuscript).
   * 그 뒤에 workbench/notes/<이름>/main.tex(연구노트)와 workbench/calc/<이름>/main.tex(계산 노트)를 저절로 더한다.
   * declared: research.yaml에 적은 것 (첫째만 key ''를 받는다, manuscript.ts msKeyOf)
   */
  manuscripts: { path: string; name: string; kind: NoteKind; declared?: true }[]
  tasks?: string
  bib: string[]
  materials: string[]
  reviews: string[]
}

/**
 * 노트 구분 (10/4 피드백, 모든 프로젝트에 같게): 원고(논문 원문), 연구노트(원고를 복사해 고쳐 쓰는 증명·유도), 계산 노트(수치 계산과 그림).
 * 연구노트·계산 노트는 workbench/notes/, workbench/calc/ 아래 폴더 하나에 main.tex와 note.yaml(name, from)을 둔다
 */
export type NoteKind = 'paper' | 'note' | 'calc'
export const NOTE_DIRS = { note: 'notes', calc: 'calc' } as const
/** 노트 폴더의 본문 파일: Markdown이 먼저 (둘 다 있으면 note.md를 연다) */
export const NOTE_MD = 'note.md'
export const NOTE_MAINS = [NOTE_MD, 'main.tex'] as const
export const isMarkdownNote = (file: string) => file.endsWith('.md')

export interface BlockFile {
  id: string
  /** 'md' = Markdown + KaTeX (blocks/<id>.md), 'tex' = 예전 LaTeX */
  format: BlockFormat
  meta: BlockMeta
  hash: string
  /** 파일 마지막 수정 시각 (ms) */
  mtime: number
  /** 파일 전체 (머리말 포함) */
  content: string
}

export type SaveResult = { ok: true; content: string; hash: string } | { ok: false; currentHash: string }

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/

const readResearchYaml = fileCache((text) => YAML.parse(text) ?? {})

/**
 * 연구 저장소 하나의 workbench/ 폴더. 이 폴더 밖의 파일은 읽지도 쓰지도 않는다.
 * 파일 형식은 planning/v0-implementation-plan.md §2가 정본이다.
 */
export class Workbench {
  readonly root: string

  constructor(root: string) {
    this.root = fs.realpathSync(root)
  }

  get blocksDir() { return path.join(this.root, 'blocks') }
  get figuresDir() { return path.join(this.root, 'figures') }
  get logDir() { return path.join(this.root, 'log') }
  get preamblePath() { return path.join(this.root, 'preamble.tex') }
  get researchPath() { return path.join(this.root, 'research.yaml') }
  buildDir(id: string) { return path.join(this.root, '.build', this.checkId(id)) }
  /**
   * 보조 노트 파일: blocks/<id>.md (10/4 결정, Markdown + KaTeX), 아직 바꾸지 않은 것은 blocks/<id>.tex.
   * 둘 다 없으면 새로 만들 .md 경로
   */
  blockPath(id: string) {
    const base = path.join(this.blocksDir, this.checkId(id))
    return fs.existsSync(`${base}.md`) || !fs.existsSync(`${base}.tex`) ? `${base}.md` : `${base}.tex`
  }
  blockFormat(id: string): BlockFormat { return this.blockPath(id).endsWith('.md') ? 'md' : 'tex' }

  /** workbench 기준 상대 경로. 밖이면 null. */
  relative(absPath: string): string | null {
    const rel = path.relative(this.root, absPath)
    return rel.startsWith('..') || path.isAbsolute(rel) ? null : rel
  }

  // ---------- 연구 ----------

  readResearch(): ResearchInfo {
    const raw = fs.existsSync(this.researchPath) ? readResearchYaml(this.researchPath) : {}
    const image = parseCardFigureRef(raw.image) ? String(raw.image)
      : /\.(svg|png|jpe?g|webp|gif)$/i.test(String(raw.image)) ? this.repoPath(raw.image) : null
    return {
      title: String(raw.title ?? path.basename(path.dirname(this.root))),
      question: String(raw.question ?? ''),
      started: raw.started ? String(raw.started) : '',
      sources: this.readSources(raw.sources),
      agentStatus: raw['agent-status'] === true,
      ...(this.repoPath(raw['latex-macros']) && { latexMacros: this.repoPath(raw['latex-macros'])! }),
      ...(typeof raw['latex-template'] === 'string' && raw['latex-template'].trim() && { latexTemplate: raw['latex-template'].trim() }),
      ...(image && { image }),
      concepts: (Array.isArray(raw.concepts) ? raw.concepts : raw.concepts == null ? [] : [raw.concepts]).map((x: unknown) => String(x).trim()).filter(Boolean),
    }
  }

  /** 저장소 안의 실제 경로만 남긴다 */
  private repoPath(p: unknown): string | null {
    if (typeof p !== 'string' || !p.trim()) return null
    const repo = path.dirname(this.root)
    const rel = path.normalize(p.trim()).replace(/\/$/, '')
    const abs = path.resolve(repo, rel)
    if (abs !== repo && !abs.startsWith(repo + path.sep)) return null
    return fs.existsSync(abs) ? path.relative(repo, abs) : null
  }

  /** 저장소 기준 경로가 workbench/notes/ 또는 workbench/calc/ 안이면 그 구분, 아니면 원고 */
  private kindOf(repoRel: string): NoteKind {
    const wbRel = path.relative(path.basename(this.root), repoRel).split(path.sep)
    if (wbRel[0] === NOTE_DIRS.note) return 'note'
    if (wbRel[0] === NOTE_DIRS.calc) return 'calc'
    return 'paper'
  }

  /**
   * workbench/notes/*\/note.md(또는 예전 main.tex), workbench/calc/*\/ 같음. 이름은 note.yaml의 name, 없으면 폴더 이름.
   * 10/4 결정: 연구노트·계산 노트는 Markdown + KaTeX(note.md). 아직 바꾸지 않은 LaTeX 노트(main.tex)도 그대로 연다
   */
  ownNotes(): { path: string; name: string; kind: NoteKind }[] {
    const repo = path.dirname(this.root)
    return (['note', 'calc'] as const).flatMap((kind) => {
      const dir = path.join(this.root, NOTE_DIRS[kind])
      if (!fs.existsSync(dir)) return []
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .flatMap((e) => {
          const main = NOTE_MAINS.find((f) => fs.existsSync(path.join(dir, e.name, f)))
          if (!main) return []
          let name = e.name
          try { const y = readResearchYaml(path.join(dir, e.name, 'note.yaml')); if (typeof y?.name === 'string' && y.name.trim()) name = y.name.trim() } catch { /* 이름 파일이 없으면 폴더 이름 */ }
          return [{ path: path.relative(repo, path.join(dir, e.name, main)), name, kind }]
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  private readSources(raw: unknown): ProjectSources {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const list = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => this.repoPath(x)).filter((x): x is string => !!x)
    const canon = (Array.isArray(r.canon) ? r.canon : []).flatMap((line) => {
      if (typeof line !== 'string') return []
      const [p, ...rest] = line.split(/\s+[—-]\s+/)
      const ok = this.repoPath(p)
      return ok ? [{ path: ok, note: rest.join(' — ') }] : []
    })
    const declared: ProjectSources['manuscripts'] = (Array.isArray(r.manuscript) ? r.manuscript : [r.manuscript]).flatMap((line) => {
      if (typeof line !== 'string') return []
      const ms = line.split(/\s+[—-]\s+/)
      const msPath = ms[0] && /\.tex$/.test(ms[0]) ? this.repoPath(ms[0]) : null
      return msPath ? [{ path: msPath, name: ms.slice(1).join(' — ') || path.basename(path.dirname(msPath)), kind: this.kindOf(msPath), declared: true as const }] : []
    })
    const manuscripts = [...declared, ...this.ownNotes()].filter((m, i, all) => all.findIndex((x) => x.path === m.path) === i)
    return {
      canon, tasks: this.repoPath(r.tasks) ?? undefined, bib: list(r.bib), materials: list(r.materials), reviews: list(r.reviews),
      ...(manuscripts[0] && { manuscript: manuscripts[0] }), manuscripts,
    }
  }

  // ---------- 블록 ----------

  listBlocks(): BlockFile[] {
    if (!fs.existsSync(this.blocksDir)) return []
    const ids = new Set(fs.readdirSync(this.blocksDir).flatMap((f) => { const m = /^(.+)\.(tex|md)$/.exec(f); return m && isValidBlockId(m[1]!) ? [m[1]!] : [] }))
    return [...ids].sort()
      .flatMap((id) => {
        try {
          const { content, hash } = this.readBlock(id)
          const mtime = fs.statSync(this.blockPath(id)).mtimeMs
          return [{ id, format: this.blockFormat(id), meta: parseBlock(content).meta, hash, mtime, content }]
        } catch {
          return [] // 밖을 가리키는 링크 등은 목록에서 뺀다
        }
      })
  }

  tree(blocks = this.listBlocks()): BlockTree {
    return buildTree(blocks)
  }

  readBlock(id: string): { content: string; hash: string } {
    const file = this.safeExisting(this.blockPath(id))
    const content = fs.readFileSync(file, 'utf8')
    return { content, hash: hashOf(content) }
  }

  /** 사용자가 읽은 뒤 파일이 바뀌었으면(에이전트·다른 편집기) 덮어쓰지 않는다. */
  writeBlock(id: string, content: string, baseHash: string): SaveResult {
    const file = this.safeExisting(this.blockPath(id))
    const current = hashOf(fs.readFileSync(file, 'utf8'))
    if (current !== baseHash) return { ok: false, currentHash: current }
    writeAtomic(file, content)
    return { ok: true, content, hash: hashOf(content) }
  }

  /** 읽은 보조 노트 파일 하나만 지운다. 기록·연결·컴파일 결과는 보존한다. */
  deleteBlock(id: string, baseHash: string): { ok: true } | { ok: false; currentHash: string } {
    if (typeof baseHash !== 'string' || !baseHash) throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    const file = this.blockPath(id)
    const real = this.safeExisting(file)
    if (fs.realpathSync(this.blocksDir) !== this.blocksDir) throw new WorkbenchError(403, t('blocks 폴더가 링크라 지우지 않았습니다', 'Not deleted: the blocks folder is a link'))
    const current = hashOf(fs.readFileSync(real, 'utf8'))
    if (current !== baseHash) return { ok: false, currentHash: current }
    const other = file.endsWith('.md') ? file.slice(0, -3) + '.tex' : file.slice(0, -4) + '.md'
    if (fs.existsSync(other)) throw new WorkbenchError(409, t('같은 이름의 Markdown과 LaTeX 파일이 모두 있어 지우지 않았습니다', 'Not deleted: both a Markdown and a LaTeX file have this name'))
    // 내부 링크라도 가리키는 다른 파일은 지우지 않고 blocks/ 안의 링크만 지운다.
    fs.unlinkSync(file)
    return { ok: true }
  }

  /** 머리말만 고친다. baseHash를 주면 그 뒤로 바뀐 파일은 고치지 않는다. */
  patchMeta(id: string, patch: MetaPatch, baseHash?: string): SaveResult & { before?: BlockMeta } {
    const { content, hash } = this.readBlock(id)
    if (baseHash && baseHash !== hash) return { ok: false, currentHash: hash }
    const next = updateBlockMeta(content, patch, this.blockFormat(id))
    const before = parseBlock(content).meta
    if (next === content) return { ok: true, content, hash, before }
    // 머리말이 길어져 다시 찾지 못하게 되면 쓰지 않는다 (다음 저장 때 머리말이 하나 더 생긴다)
    if (!hasBlockHeader(next)) throw new WorkbenchError(422, t('머리말이 너무 길어져 저장하지 않았습니다. 설명을 줄여 주세요', 'Not saved: the header got too long. Shorten the description'))
    writeAtomic(this.safeExisting(this.blockPath(id)), next)
    return { ok: true, content: next, hash: hashOf(next), before }
  }

  createBlock(input: { title: string; id?: string; parent?: string; alternativeOf?: string; now?: Date }): string {
    const title = input.title.trim()
    if (!title) throw new WorkbenchError(400, t('제목이 필요함', 'A title is required'))
    const existing = this.listBlocks().map((b) => b.id)
    const id = input.id ?? suggestBlockId(title, existing, input.now)
    if (!isValidBlockId(id)) throw new WorkbenchError(400, t(`잘못된 블록 id: ${id}`, `Invalid block id: ${id}`))
    if (existing.includes(id) || fs.existsSync(this.blockPath(id)) || fs.existsSync(path.join(this.blocksDir, `${id}.tex`))) throw new WorkbenchError(409, t(`이미 있는 블록: ${id}`, `Block already exists: ${id}`))
    for (const ref of [input.parent, input.alternativeOf]) {
      if (ref && !existing.includes(ref)) throw new WorkbenchError(400, t(`없는 블록: ${ref}`, `No such block: ${ref}`))
    }
    // 새 보조 노트는 Markdown (제목은 머리말에만 두고 본문에 다시 쓰지 않는다)
    const content = updateBlockMeta('\n', {
      id,
      title,
      status: 'in-progress',
      parent: input.parent ?? null,
      alternatives: input.alternativeOf ? [input.alternativeOf] : null,
      created: localDate(input.now),
    }, 'md')
    fs.mkdirSync(this.blocksDir, { recursive: true })
    const file = this.blockPath(id)
    fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' }) // 이미 있으면 실패
    return id
  }

  // ---------- 일지 ----------

  journalDates(): string[] {
    if (!fs.existsSync(this.logDir)) return []
    return fs.readdirSync(this.logDir).flatMap((f) => DATE_FILE.exec(f)?.[1] ?? []).sort().reverse()
  }

  readJournal(date: string): JournalEntry[] {
    const file = this.journalPath(date)
    return fs.existsSync(file) ? parseJournal(fs.readFileSync(file, 'utf8'), date) : []
  }

  /** 최근 기록부터. days: 가장 최근 일지 파일 몇 개를 읽을지 */
  recentJournal(days = 30): JournalEntry[] {
    return this.journalDates().slice(0, days).flatMap((d) => this.readJournal(d).reverse())
  }

  appendJournal(entry: NewJournalEntry): JournalEntry {
    const file = this.journalPath(entry.date)
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    const after = appendJournalEntry(before, entry)
    writeAtomic(file, after)
    const entries = parseJournal(after, entry.date)
    return entries[entries.length - 1]!
  }

  /** was: 화면이 본 할 일 글 — 그새 줄이 끼어들어 번호가 밀렸으면 다른 할 일을 체크하지 않게 */
  setTodo(date: string, index: number, done: boolean, was: string): JournalEntry {
    const file = this.safeExisting(this.journalPath(date))
    const before = fs.readFileSync(file, 'utf8')
    if (parseJournal(before, date)[index]?.text !== was) throw new WorkbenchError(409, t('그새 일지가 바뀌었습니다. 다시 열어 주세요.', 'The journal changed in the meantime. Open it again.'))
    let after: string
    try {
      after = setTodoDone(before, index, done)
    } catch (e) {
      throw new WorkbenchError(400, (e as Error).message)
    }
    writeAtomic(file, after)
    const entry = parseJournal(after, date)[index]
    if (!entry) throw new WorkbenchError(404, t('기록을 찾지 못함', 'Entry not found'))
    return entry
  }

  /** 메모·할 일 글 고치기(text) 또는 지우기(null). was: 화면이 본 글 — 그새 파일이 바뀌어 다른 기록을 건드리지 않게 */
  editJournal(date: string, index: number, was: string, text: string | null): JournalEntry | null {
    const file = this.safeExisting(this.journalPath(date))
    const before = fs.readFileSync(file, 'utf8')
    if (parseJournal(before, date)[index]?.text !== was) throw new WorkbenchError(409, t('그새 일지가 바뀌었습니다. 다시 열어 주세요.', 'The journal changed in the meantime. Open it again.'))
    let after: string
    try {
      after = editJournalEntry(before, index, text)
    } catch (e) {
      throw new WorkbenchError(400, (e as Error).message)
    }
    writeAtomic(file, after)
    return text === null ? null : parseJournal(after, date)[index] ?? null
  }

  private journalPath(date: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new WorkbenchError(400, t(`잘못된 날짜: ${date}`, `Invalid date: ${date}`))
    return path.join(this.logDir, `${date}.md`)
  }

  // ---------- 안전 ----------

  private checkId(id: string): string {
    if (!isValidBlockId(id)) throw new WorkbenchError(400, t(`잘못된 블록 id: ${id}`, `Invalid block id: ${id}`))
    return id
  }

  /** 심볼릭 링크를 따라간 실제 경로도 workbench 안인지 확인한다. */
  private safeExisting(file: string): string {
    if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`없는 파일: ${this.relative(file) ?? file}`, `No such file: ${this.relative(file) ?? file}`))
    const real = fs.realpathSync(file)
    if (this.relative(real) === null) throw new WorkbenchError(403, t('workbench 밖을 가리키는 파일', 'The file points outside workbench'))
    return real
  }

  // ---------- 새 workbench ----------

  /** 연구 저장소 안에 workbench/를 만든다. 이미 있는 파일은 건드리지 않는다. */
  static scaffold(root: string, info: { title: string; question?: string; now?: Date; preamble?: PreambleChoice }): void {
    fs.mkdirSync(path.join(root, 'blocks'), { recursive: true })
    writeIfMissing(path.join(root, 'research.yaml'), YAML.stringify({
      title: info.title,
      question: info.question ?? '',
      started: localDate(info.now),
    }))
    writeIfMissing(path.join(root, 'preamble.tex'), info.preamble ? composePreamble(info.preamble) : DEFAULT_PREAMBLE)
    writeIfMissing(path.join(root, '.gitignore'), '.build/\n')
    writeIfMissing(path.join(root, 'figures', '.gitkeep'), '')
    writeIfMissing(path.join(root, 'log', '.gitkeep'), '')
  }
}

/** 새 workbench 서식에서 불러올 파일들. 모두 \\input에 그대로 쓰는 경로다 */
export interface PreambleChoice {
  /** 라이브러리의 맨 앞 서식 (예: preamble/base.tex) */
  first: string[]
  /** 이 연구 저장소의 서식, workbench 기준 (예: ../statements/preamble.tex) */
  repo: string[]
  /** 라이브러리의 뒤쪽 서식 — 기호·환경은 없을 때만 만든다 */
  last: string[]
}

/**
 * 순서: 라이브러리 기본 패키지 → 연구 저장소 서식 → 라이브러리 기호·환경.
 * 라이브러리 기호는 \providecommand, 환경은 "없을 때만" 만들어서 연구 전용 표기가 이긴다.
 */
export function composePreamble(c: PreambleChoice): string {
  const lines = ['% 이 연구의 공통 서식과 매크로. 모든 블록 컴파일에 쓰인다.', '% 순서가 중요하다: 기본 패키지 → 이 저장소의 서식 → 라이브러리 기호(이미 정의된 것은 건드리지 않음).', '']
  if (c.first.length) lines.push('% 공유 라이브러리 (research-library) — 기본', ...c.first.map((f) => `\\input{${f}}`), '')
  if (c.repo.length) lines.push('% 이 연구 저장소의 서식', ...c.repo.map((f) => `\\input{${f}}`), '')
  if (c.last.length) lines.push('% 공유 라이브러리 — 기호·환경', ...c.last.map((f) => `\\input{${f}}`), '')
  lines.push('% 이 연구에서만 쓰는 기호는 아래에 적는다.', '')
  return lines.join('\n')
}

/** 제목을 \\section{} 안에 넣을 수 있게 한다. $수식$은 살리고 LaTeX를 깨는 문자만 막는다. */

export const DEFAULT_PREAMBLE = `% 이 연구의 공통 서식과 매크로. 모든 블록 컴파일에 쓰인다.
\\usepackage[a4paper,margin=25mm]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{kotex}
% macOS 기본 한글 글꼴. 다른 글꼴을 쓰려면 이름을 바꾼다.
\\setmainhangulfont{AppleMyungjo}
\\setsanshangulfont{Apple SD Gothic Neo}
`

export class WorkbenchError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** 고치는 API는 읽을 때 받은 hash를 꼭 받는다: 없으면 그새 바깥(에이전트)에서 고친 것을 모르고 덮을 수 있다 */
export function requireHash(baseHash: unknown, what = t('읽을 때 받은 hash', 'the hash you got when reading')): string {
  if (typeof baseHash !== 'string' || !baseHash) throw new WorkbenchError(400, t(`baseHash(${what})가 필요함`, `baseHash (${what}) is required`))
  return baseHash
}
