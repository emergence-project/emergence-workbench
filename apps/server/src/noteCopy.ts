import fs from 'node:fs'
import path from 'node:path'
import type { Author, LatexSetup, LatexTemplate } from '@rw/core'
import YAML from 'yaml'
import { isOutside, writeAtomic } from './fsutil.js'
import { allManuscripts } from './manuscript.js'
import { expandHeadInputs, NOTE_MACROS, needsBodyOnly, noteMacrosText, toBodyOnly } from './noteBody.js'
import { NOTE_DIRS, NOTE_MD, WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'
import { editResearchYaml } from './researchYaml.js'

/**
 * 연구노트·계산 노트 만들기 (10/4 피드백 "논문 원문 말고, 복사해서 내가 변형하려고 해").
 * - 원고에서 복사: main .tex와 그것이 부르는 파일(\input·\include, 그림, bib, 같은 폴더의 .sty·.cls)을
 *   workbench/notes/<폴더>/ 아래 같은 상대 경로로 복사하고, main은 main.tex라는 이름으로 둔다. 원고는 건드리지 않는다.
 * - 빈 노트: Markdown + KaTeX 노트 note.md를 만든다 (10/4 결정. 원고에서 복사한 노트는 아직 LaTeX).
 * 이름과 출처는 note.yaml(name, from)에 적는다.
 */

const MAX_FILES = 400

/** 새 Markdown 노트의 첫 글: 절은 ## 제목 (연구노트는 목표부터, 계산 노트는 목표·방법·결과) */
export const NOTE_TEMPLATE = {
  note: '## 목표\n\n',
  calc: '## 목표\n\n## 방법\n\n## 결과\n\n',
} as const
const GRAPHIC_EXT = ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps']

/** 주석을 뺀 글에서 이 파일이 부르는 파일 (main 폴더 기준 상대 경로, 확장자를 붙여 찾은 것) */
function referencedFiles(tex: string, baseDir: string, searchDirs: string[] = [], graphicsDirs: string[] = []): string[] {
  const code = tex.replace(/(^|[^\\])%.*$/gm, '$1')
  const out: string[] = []
  const hit = (name: string, exts: string[], dirs = searchDirs) => {
    for (const dir of [baseDir, ...dirs]) for (const ext of exts) {
      const abs = path.resolve(dir, name.trim() + ext)
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) { out.push(path.relative(baseDir, abs)); return }
    }
  }
  for (const m of code.matchAll(/\\(?:input|include|subfile)\s*\{([^}]+)\}/g)) hit(m[1]!, ['', '.tex'])
  for (const m of code.matchAll(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) hit(m[1]!, GRAPHIC_EXT, [...graphicsDirs, ...searchDirs])
  for (const m of code.matchAll(/\\(?:bibliography|addbibresource)\s*\{([^}]+)\}/g)) for (const b of m[1]!.split(',')) hit(b, ['', '.bib'])
  for (const m of code.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) for (const b of m[1]!.split(',')) hit(b, ['.sty'])
  for (const m of code.matchAll(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) hit(m[1]!, ['.cls'])
  return out
}

/**
 * main에서 시작해 부르는 .tex를 따라가며 쓰이는 파일을 모은다 (main 폴더 기준 상대 경로, main 자신 포함).
 * main 폴더 밖은 모으지 않고 skipped로 알린다.
 */
export function collectTexFiles(mainAbs: string, options: { baseDir?: string; searchDirs?: string[]; graphicsDirs?: string[] } = {}): { files: Set<string>; skipped: string[] } {
  const baseDir = options.baseDir ?? path.dirname(mainAbs)
  const todo = [path.relative(baseDir, mainAbs)]
  const files = new Set<string>()
  const skipped: string[] = []
  while (todo.length && files.size < MAX_FILES) {
    const rel = todo.shift()!
    if (files.has(rel)) continue
    const abs = path.join(baseDir, rel)
    const realRel = path.relative(fs.realpathSync(baseDir), fs.realpathSync(abs))
    if (isOutside(rel) || isOutside(realRel)) { skipped.push(rel); continue }
    files.add(rel)
    if (/\.(?:tex|sty|cls)$/.test(rel)) todo.push(...referencedFiles(fs.readFileSync(abs, 'utf8'), baseDir, options.searchDirs, options.graphicsDirs))
  }
  return { files, skipped }
}

/** 폴더 이름: 이름에서 영문·숫자만, 겹치면 -2, -3 … */
export const slugOf = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'note'

function folderFor(dir: string, name: string): string {
  const base = slugOf(name)
  let slug = base
  for (let n = 2; fs.existsSync(path.join(dir, slug)); n++) slug = `${base}-${n}`
  return slug
}

export interface CreatedNote { path: string; name: string; kind: 'note' | 'calc'; copied: number; skipped: string[] }

interface CopyTarget { source: string; target: string }
const foldedPath = (file: string) => path.normalize(file).normalize('NFC').toLowerCase()
function sameSourceFile(a: string, b: string): boolean {
  const left = fs.statSync(a), right = fs.statSync(b)
  return left.dev === right.dev && left.ino === right.ino
}

/** main 이름 변경·생성 파일을 포함한 출력 전체를, 첫 쓰기 전에 검사한다. */
function checkCopyTargets(targets: CopyTarget[], dest: string): void {
  const files = new Map<string, CopyTarget>()
  const collision = (a: CopyTarget, b: CopyTarget): never => {
    throw new WorkbenchError(409, t(`노트 복사 경로가 겹칩니다: ${a.source} → ${a.target}, ${b.source} → ${b.target}. 겹친 파일 이름·참조 또는 프로젝트 기호 경로를 고친 뒤 다시 복사하세요.`, `Note copy paths overlap: ${a.source} → ${a.target}, ${b.source} → ${b.target}. Fix the overlapping file names, references, or project macro paths, then copy again.`))
  }
  for (const item of targets) {
    // 맥의 대소문자·유니코드 표기 차이도 같은 출력 경로로 본다.
    const key = foldedPath(path.resolve(dest, item.target))
    const previous = files.get(key)
    if (previous) collision(previous, item)
    files.set(key, item)
  }
  for (const [key, item] of files) {
    for (let parent = path.dirname(key); parent !== path.dirname(parent); parent = path.dirname(parent)) {
      const previous = files.get(parent)
      if (previous) collision(previous, item)
    }
  }
}

export function createNote(wb: Workbench, input: { kind?: unknown; name?: unknown; from?: unknown }, _latex: { setup: LatexSetup; authors: Author[] }, templates: LatexTemplate[] = []): CreatedNote {
  const kind = input.kind === 'calc' ? 'calc' : input.kind === 'note' ? 'note' : null
  if (!kind) throw new WorkbenchError(400, t('kind는 note 또는 calc', 'kind must be note or calc'))
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  if (!name) throw new WorkbenchError(400, t('노트 이름이 필요함', 'A note name is required'))
  const repo = wb.repo
  const parent = path.join(wb.root, NOTE_DIRS[kind])
  const dest = path.join(parent, folderFor(parent, name))
  const skipped: string[] = []
  let copied = 0

  if (typeof input.from === 'string') {
    const src = allManuscripts(wb).find((m) => m.key === input.from)
    if (!src) throw new WorkbenchError(404, t(`그런 원고가 없음: ${input.from}`, `No such manuscript: ${input.from}`))
    const mainAbs = path.join(repo, src.main)
    const baseDir = path.dirname(mainAbs)
    const { files: seen, skipped: out } = collectTexFiles(mainAbs)
    skipped.push(...out)
    const entry = path.basename(mainAbs)
    const copies: CopyTarget[] = []
    const dependencies = new Map<string, CopyTarget>()
    for (const rel of seen) {
      const item = { source: rel, target: rel === entry ? 'main.tex' : rel }
      const key = foldedPath(item.target), previous = dependencies.get(key)
      // 같은 의존 파일을 여러 대소문자 이름으로 부를 수 있다. 진입 파일의 이름 변경은 별도로 검사한다.
      if (previous && rel !== entry && previous.source !== entry &&
        sameSourceFile(path.join(baseDir, rel), path.join(baseDir, previous.source))) continue
      copies.push(item); dependencies.set(key, item)
    }
    // 같은 폴더의 .bib는 \bibliography 없이 \cite만 써도 빌드에 쓰이니 함께 둔다.
    const collected = new Map([...seen].map((rel) => [foldedPath(rel), rel]))
    const bibs = fs.readdirSync(baseDir).filter((f) => {
      if (!f.endsWith('.bib') || seen.has(f)) return false
      const alias = collected.get(foldedPath(f))
      if (!alias) return true
      return !sameSourceFile(path.join(baseDir, alias), path.join(baseDir, f))
    })
    const hasStyles = [...seen].some((f) => f.endsWith('.sty') && !f.includes('/'))
    const macroFiles = new Set([projectMacrosFile(wb)])
    // 지금 없는 지정 경로도 복사 뒤에는 유효해질 수 있다. 본문·생성 정보와 겹치면 먼저 멈춘다.
    const declared = YAML.parseDocument(fs.readFileSync(wb.researchPath, 'utf8')).get('latex-macros')
    if (typeof declared === 'string' && declared.trim()) {
      const abs = path.resolve(repo, declared.trim())
      if (abs.startsWith(repo + path.sep)) macroFiles.add(abs)
    }
    checkCopyTargets([...copies, ...bibs.map((f) => ({ source: f, target: f })),
      ...[...macroFiles].map((f) => ({ source: t('프로젝트 기호', 'project macros'), target: path.relative(dest, f) })),
      { source: t('노트 정보', 'note info'), target: 'note.yaml' },
      ...(hasStyles ? [{ source: t('노트 기호', 'note macros'), target: NOTE_MACROS }] : [])], dest)
    fs.mkdirSync(dest, { recursive: true })
    for (const { source: rel, target } of copies) {
      fs.mkdirSync(path.dirname(path.join(dest, target)), { recursive: true })
      if (rel === entry) {
        // 본문만 가져온다: 머리는 앱의 서식이, 제목·저자는 앱이 붙인다 (10/4 15:41·15:56 피드백)
        const text = fs.readFileSync(path.join(baseDir, rel), 'utf8')
        const r = toBodyOnly(text)
        writeAtomic(path.join(dest, 'main.tex'), r.text)
        placeHead(wb, dest, src.main, text, [...seen], r.macros, templates)
      } else fs.copyFileSync(path.join(baseDir, rel), path.join(dest, target))
      copied++
    }
    for (const f of bibs) { fs.copyFileSync(path.join(baseDir, f), path.join(dest, f)); copied++ }
    writeAtomic(path.join(dest, 'note.yaml'), YAML.stringify({ name, from: src.main }))
  } else {
    // 빈 노트는 Markdown + KaTeX (10/4 결정: 연구노트·계산 노트는 개념노트와 같은 형식, PDF는 내보낼 때 프로젝트 서식으로)
    fs.mkdirSync(dest, { recursive: true })
    writeAtomic(path.join(dest, NOTE_MD), NOTE_TEMPLATE[kind])
    writeAtomic(path.join(dest, 'note.yaml'), YAML.stringify({ name }))
    return { path: path.relative(repo, path.join(dest, NOTE_MD)), name, kind, copied: 1, skipped }
  }
  return { path: path.relative(repo, path.join(dest, 'main.tex')), name, kind, copied, skipped }
}

/** 프로젝트 기호 파일: research.yaml의 latex-macros:, 없으면 workbench/macros.tex */
const projectMacrosFile = (wb: Workbench) => {
  const own = wb.readResearch().latexMacros
  return own ? path.join(wb.repo, own) : path.join(wb.root, 'macros.tex')
}

/** 이미 정의된 이름(\ADA 등)과 같은 줄은 빼고 기호 파일 끝에 더한다. 더한 줄 수 */
function appendLines(file: string, from: string, lines: string[]): number {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const nameOf = (l: string) => /\\(?:providecommand|newcommand|renewcommand|DeclareMathOperator)\*?\s*\{?(\\[A-Za-z@]+)/.exec(l)?.[1] ?? /\\def\s*(\\[A-Za-z@]+)/.exec(l)?.[1] ?? /\\newtheorem\*?\{([A-Za-z]+)\}/.exec(l)?.[1]
  const has = (l: string) => before.includes(l.trim()) || (nameOf(l) !== undefined && new RegExp(`(?:\\{|\\\\def\\s*)${nameOf(l)!.replace(/\\/g, '\\\\')}[}\\[{#\\s]`).test(before))
  const add = lines.filter((l) => !has(l))
  if (!add.length) return 0
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, before ? `${before.replace(/\s+$/, '')}\n${add.join('\n')}\n` : noteMacrosText(from, add))
  return add.length
}

/**
 * 떼어 낸 머리를 놓을 곳 (10/4 15:56 "프로젝트에서 설정한 라이브러리에 맞춰서 자동으로 컴파일하게 하고, 문서에는 두지마"):
 * - 이 노트만의 정의(\ADA 등)는 프로젝트 기호 파일로 (노트마다 따로 두지 않는다)
 * - 노트 폴더의 .sty는 그 노트의 note-macros.tex에서 부른다
 * - research.yaml에 서식이 아직 없으면 뗀 \documentclass에 맞는 서식을 적는다 (revtex4-2 + prb → PRB 서식)
 */
function placeHead(wb: Workbench, noteDir: string, from: string, text: string, files: string[], macros: string[], templates: LatexTemplate[]): { macros: number; template?: string } {
  const sty = files.filter((f) => f.endsWith('.sty') && !f.includes('/')).map((f) => `\\usepackage{${f.replace(/\.sty$/, '')}}`)
  let n = appendLines(projectMacrosFile(wb), from, macros)
  if (sty.length) n += appendLines(path.join(noteDir, NOTE_MACROS), from, sty)
  if (wb.readResearch().latexTemplate) return { macros: n }
  const id = guessTemplate(text, templates)
  if (!id) return { macros: n }
  editResearchYaml(wb, (doc) => { doc.set('latex-template', id) })
  return { macros: n, template: id }
}

/** 뗀 머리의 \documentclass에 맞는 서식: 문서 종류가 같고, 옵션(prb·prl 등)이 겹치는 것이 많은 서식 */
export function guessTemplate(text: string, templates: LatexTemplate[]): string | undefined {
  const parse = (line: string) => {
    const m = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(line.replace(/(^|[^\\])%.*$/gm, '$1'))
    return m ? { cls: m[2]!.trim(), opts: new Set((m[1] ?? '').split(',').map((o) => o.trim()).filter(Boolean)) } : null
  }
  const own = parse(text)
  if (!own) return undefined
  let best: { id: string; score: number } | undefined
  for (const t of templates) {
    const p = parse(t.documentClass)
    if (!p || p.cls !== own.cls) continue
    const score = [...p.opts].filter((o) => own.opts.has(o)).length
    if (!best || score > best.score) best = { id: t.id, score }
  }
  return best?.id
}

/**
 * 이미 있는 연구노트·계산 노트를 본문만 남긴 노트로 (노트 화면의 "본문만 남기기", 10/4 15:41·15:56 피드백).
 * 머리와 제목·저자 줄을 떼고, 머리의 정의는 프로젝트 기호 파일로 옮긴다. 원고(paper)는 고치지 않는다.
 */
export function makeBodyOnly(wb: Workbench, key: string, templates: LatexTemplate[] = []): { path: string; removedHead: boolean; removedFront: number; macros: number; template?: string } {
  const m = allManuscripts(wb).find((x) => x.key === key)
  if (!m) throw new WorkbenchError(404, t(`그런 노트가 없음: ${key}`, `No such note: ${key}`))
  if (m.kind === 'paper') throw new WorkbenchError(400, t('원고는 고치지 않습니다. 연구노트·계산 노트만 본문만 남길 수 있습니다', 'Manuscripts are not changed. Only research notes and calculation notes can be reduced to the body'))
  const abs = path.join(wb.repo, m.main)
  const own = fs.readFileSync(abs, 'utf8')
  if (!needsBodyOnly(own)) return { path: m.main, removedHead: false, removedFront: 0, macros: 0 }
  // 머리를 옆 파일(setting.tex 등)로 빼 둔 노트: 그 파일을 펼쳐 정의와 문서 종류를 함께 옮기고, 다 옮긴 뒤 그 파일은 지운다
  const dir = path.dirname(abs)
  const files = [...collectTexFiles(abs).files]
  const { text, files: expanded } = expandHeadInputs(own, (rel) => {
    const f = path.join(dir, rel)
    return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null
  })
  const r = toBodyOnly(text)
  const placed = r.removedHead ? placeHead(wb, dir, m.main, text, files, r.macros, templates) : { macros: 0 }
  writeAtomic(abs, r.text)
  for (const rel of expanded) fs.rmSync(path.join(dir, rel), { force: true })
  return { path: m.main, removedHead: r.removedHead, removedFront: r.removedFront, ...placed }
}

/** 머리나 제목 줄이 남은 연구노트·계산 노트 전부 (연구노트 화면의 "모두 본문만 남기기") */
export function makeAllBodyOnly(wb: Workbench, templates: LatexTemplate[] = []): { notes: number; template?: string } {
  let template: string | undefined
  const keys = allManuscripts(wb).filter((m) => m.needsBodyOnly).map((m) => m.key)
  for (const k of keys) template = makeBodyOnly(wb, k, templates).template ?? template
  return { notes: keys.length, ...(template && { template }) }
}
