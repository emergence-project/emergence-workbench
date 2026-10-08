import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildFrontMatter, buildSettingTex, isBodyOnly, markdownToLatex, MD_PREAMBLE, parseLatexErrors, type Author, parseSynctexEdit, parseSynctexView, type LatexTemplate, type PdfBox } from '@rw/core'
import { hashOf, writeAtomic } from './fsutil.js'
import { hasFrontMatter, hasMaketitle, needsBodyOnly, NOTE_MACROS } from './noteBody.js'
import { isCompletePdf, type CompileResult, type Engine } from './latex.js'
import { LATEX_FILES_DIR, placeTemplateFiles, SHARED_MACROS } from './latexFiles.js'
import { beginInputs, fileStamp, finishInputs, inputsChanged, recordedInputs, type PdfState, type ShownPdf, type SuccessfulInputs } from './manuscriptFreshness.js'
import { bibliographyLines, noteBibFiles } from './noteBib.js'
import { writeFigureEmbeds, type FigureEmbedResolver } from './figureEmbeds.js'
import { readNoteMeta, type NoteMeta } from './noteMeta.js'
import { isMarkdownNote, WorkbenchError, type NoteKind, type SaveResult, type Workbench } from './workbench.js'
import { t } from './i18n.js'

/**
 * 원고: 프로젝트가 이미 가진 LaTeX 원고(research.yaml의 sources.manuscript, 예: docs/model/main.tex).
 * - main.tex에서 \begin{document} 뒤에 \input·\include한 파일을 순서대로 장·부록으로 본다 (\appendix 뒤는 부록)
 * - 장 파일을 앱에서 읽고 고친다 (블록과 같은 해시 확인)
 * - 컴파일은 원고 폴더에서 그대로 하되 결과물은 workbench/.build/manuscript/에만 둔다. 프로젝트의 공식 출력물은 건드리지 않는다
 */
export interface ManuscriptPart {
  /** 장을 가리키는 이름. 장 파일이면 file, 한 파일 원고의 절이면 "file#라벨" (라벨이 없으면 "file#제목") */
  id: string
  /** 저장소 기준 경로 */
  file: string
  title: string
  appendix: boolean
  /** 한 파일 원고의 절: 그 \\section이 있는 줄 (1부터) */
  line?: number
}
/** key: 메인 노트를 가리키는 이름 — research.yaml에 적은 첫째 원고는 '', 나머지(연구노트·계산 노트 포함)는 main 파일 경로에서 (빌드 폴더·코멘트 대상·주소에 쓴다) */
export interface ManuscriptInfo extends NoteMeta {
  key: string; main: string; name: string; kind: NoteKind; parts: ManuscriptPart[]; hasPdf: boolean
  pdfState?: PdfState['pdfState']
  lastSuccessAt?: string
  lastCompile?: PdfState['lastCompile']
  /** 연구노트·계산 노트인데 머리나 제목·저자 줄이 남아 있음 (화면이 "본문만 남기기"를 보인다) */
  needsBodyOnly?: boolean
  /** 컴파일·내보내기 때 앱이 저자 줄을 붙이는 원고 (본문만 있고 \\author가 없는 원고) */
  addsAuthors?: boolean
  /** 머리(\\documentclass)가 있어 내보내기가 파일을 그대로 묶는 노트 (서식·저자·날짜를 고를 수 없다) */
  ownHeader?: boolean
  /** 본문 형식: 'md' = Markdown + KaTeX(note.md, 10/4 결정), 없으면 LaTeX */
  format?: 'md'
}

const run = promisify(execFile)
const COMPILE_TIMEOUT_MS = 300_000

/** 경로에서 만든 key (이름을 바꾸거나 노트를 더해도 그대로) */
export const pathKeyOf = (msPath: string) => msPath.replace(/\.(tex|md)$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '-').slice(-120)

/**
 * 메인 노트 key: research.yaml에 적은 첫째 원고는 '' (예전 빌드 폴더·코멘트 파일을 그대로 쓰게), 나머지는 경로에서.
 * 연구노트·계산 노트는 적지 않아도 목록에 들지만 늘 경로 key다: 이름순으로 첫째를 ''로 두면 이름을 바꾸거나 노트를 더할 때
 * '' (주 노트 · PDF · 코멘트)가 다른 노트로 옮겨 간다 (10/5 검토)
 */
export const msKeyOf = (m: { path: string; declared?: true }, index: number) => (index === 0 && m.declared ? '' : pathKeyOf(m.path))

export function manuscriptKeys(wb: Workbench): string[] {
  return wb.readResearch().sources.manuscripts.map((m, i) => msKeyOf(m, i))
}

/** 메인 노트 key의 종류 (없는 key는 원고로 본다) */
export function manuscriptKind(wb: Workbench, key = ''): NoteKind {
  const list = wb.readResearch().sources.manuscripts
  return list.find((m, n) => msKeyOf(m, n) === key)?.kind ?? 'paper'
}

function msOf(wb: Workbench, key = ''): { repo: string; main: string; dir: string; name: string; kind: NoteKind; key: string } {
  const list = wb.readResearch().sources.manuscripts
  const i = list.findIndex((m, n) => msKeyOf(m, n) === key)
  if (i < 0) throw new WorkbenchError(404, key ? t(`이 프로젝트에 그런 메인 노트가 없음: ${key}`, `This project has no such main note: ${key}`) : t('이 프로젝트에는 원고(research.yaml sources.manuscript)가 없음', 'This project has no manuscript (research.yaml sources.manuscript)'))
  const repo = path.dirname(wb.root)
  const main = path.join(repo, list[i]!.path)
  return { repo, main, dir: path.dirname(main), name: list[i]!.name, kind: list[i]!.kind, key }
}

export const buildDirOf = (wb: Workbench, key = '') => path.join(wb.root, '.build', key ? `manuscript-${key}` : 'manuscript')
export const manuscriptPdf = (wb: Workbench, key = '') => path.join(buildDirOf(wb, key), `${path.basename(msOf(wb, key).main).replace(/\.(tex|md)$/, '')}.pdf`)

// Keep the last visible result available while latexmk overwrites its output files.
const heldPdfs = new Map<string, Buffer | null>()
export function manuscriptPdfBytes(wb: Workbench, key = ''): Buffer | null {
  const file = manuscriptPdf(wb, key)
  if (heldPdfs.has(file)) return heldPdfs.get(file) ?? null
  return isCompletePdf(file) ? fs.readFileSync(file) : null
}
const hasManuscriptPdf = (wb: Workbench, key = '') => {
  const file = manuscriptPdf(wb, key)
  return heldPdfs.has(file) ? heldPdfs.get(file) !== null : isCompletePdf(file)
}

/**
 * Markdown 노트의 절: ## 제목마다 (# 하나도). 코드 블록·수식 블록 안은 건너뛴다.
 * 노트 자체는 한 파일이라 장 대신 절로 본다 (한 파일 원고와 같게)
 */
export function markdownSections(text: string, file: string): ManuscriptPart[] {
  const out: ManuscriptPart[] = []
  let fence = false
  let math = false
  let appendix = false
  const lines = text.split('\n')
  // 맨 위 머리말은 건너뛴다
  let i = 0
  if (/^---\s*$/.test(lines[0] ?? '')) { const end = lines.findIndex((l, n) => n > 0 && /^---\s*$/.test(l)); if (end > 0) i = end + 1 }
  for (; i < lines.length; i++) {
    const l = lines[i]!
    if (/^\s*(```|~~~)/.test(l)) fence = !fence
    const t = l.trim()
    if (!fence && t.startsWith('$$') && !(t.length > 4 && t.endsWith('$$'))) math = !math
    if (fence || math) continue
    // 줄 하나뿐인 \appendix 뒤는 부록, 제목 끝의 \label{…}은 이름에서 뺀다
    if (t === '\\appendix') { appendix = true; continue }
    const h = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(l)
    if (h) out.push({ id: `${file}#${h[2]!.trim()}`, file, title: h[2]!.replace(/\\label\{[^{}]*\}/g, '').replace(/[*_`]/g, '').trim(), appendix, line: i + 1 })
  }
  return out
}

/** "\section{Y phase \label{x}}" → "Y phase". 첫 \chapter·\section 제목, 없으면 파일 이름 */
function titleOf(text: string, file: string): string {
  const m = /^[^%\n]*\\(?:chapter|section)\*?\s*(?:\[[^\]]*\])?\s*\{/m.exec(text)
  if (!m) return path.basename(file, '.tex')
  let i = m.index + m[0].length
  let depth = 1
  const start = i
  for (; i < text.length && depth > 0; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth-- }
  return text.slice(start, i - 1).replace(/\\label\{[^}]*\}/g, '').replace(/\\(?:emph|textbf|textit)\{([^}]*)\}/g, '$1').replace(/\s+/g, ' ').trim() || path.basename(file, '.tex')
}

/**
 * 장 파일로 나뉘지 않은 원고(한 파일 논문): 본문의 \section마다 한 장으로 본다. 파일은 나누지 않는다.
 * \section*(감사의 글 등)는 뺀다. \appendix 뒤는 부록.
 */
export function sectionsOf(text: string, file: string): ManuscriptPart[] {
  const lines = text.split('\n')
  const begin = lines.findIndex((l) => /\\begin\{document\}/.test(l.replace(/(^|[^\\])%.*$/, '$1')))
  const out: ManuscriptPart[] = []
  let appendix = false
  for (let i = Math.max(0, begin); i < lines.length; i++) {
    const code = lines[i]!.replace(/(^|[^\\])%.*$/, '$1')
    if (/\\appendix\b/.test(code)) appendix = true
    if (!/\\section\s*(\[[^\]]*\])?\s*\{/.test(code)) continue
    // 제목이나 \label이 다음 줄로 넘어갈 수 있어 한 줄 더 읽는다
    const next = (lines[i + 1] ?? '').replace(/(^|[^\\])%.*$/, '$1')
    const open = (code.match(/\{/g) ?? []).length > (code.match(/\}/g) ?? []).length
    const title = titleOf(open ? `${code} ${next}` : code, file).replace(/\\texorpdfstring\{((?:[^{}]|\{[^{}]*\})*)\}\{[^}]*\}/g, '$1')
    const label = (/\\label\{([^}]*)\}/.exec(code) ?? /^\s*\\label\{([^}]*)\}/.exec(next))?.[1]?.trim()
    out.push({ id: `${file}#${label || title}`, file, title, appendix, line: i + 1 })
  }
  return out
}

export function manuscriptInfo(wb: Workbench, key = ''): ManuscriptInfo {
  const { repo, main, dir, name, kind } = msOf(wb, key)
  const text = fs.readFileSync(main, 'utf8')
  if (isMarkdownNote(main)) {
    const rel = path.relative(repo, main)
    return { key, main: rel, name, kind, format: 'md', parts: markdownSections(text, rel), hasPdf: hasManuscriptPdf(wb, key), ...(kind !== 'paper' && readNoteMeta(main, text)) }
  }
  const body = text.slice(Math.max(0, text.indexOf('\\begin{document}')))
  const parts: ManuscriptPart[] = []
  let appendix = false
  for (const line of body.split('\n')) {
    const code = line.replace(/(^|[^\\])%.*$/, '$1')
    if (/\\appendix\b/.test(code)) appendix = true
    const m = /\\(?:input|include)\s*\{([^}]+)\}/.exec(code)
    if (!m) continue
    const rel = m[1]!.trim().endsWith('.tex') ? m[1]!.trim() : `${m[1]!.trim()}.tex`
    const abs = path.resolve(dir, rel)
    if (!abs.startsWith(repo + path.sep) || !fs.existsSync(abs)) continue
    const file = path.relative(repo, abs)
    parts.push({ id: file, file, title: titleOf(fs.readFileSync(abs, 'utf8'), abs), appendix })
  }
  if (parts.length === 0) parts.push(...sectionsOf(text, path.relative(repo, main)))
  return { key, main: path.relative(repo, main), name, kind, parts, hasPdf: hasManuscriptPdf(wb, key), ...(kind !== 'paper' && readNoteMeta(main, text, () => { const f = parts[0]?.file; return f && path.join(repo, f) !== main ? fs.readFileSync(path.join(repo, f), 'utf8') : undefined })), ...(kind !== 'paper' && needsBodyOnly(text) && { needsBodyOnly: true }), ...(kind === 'paper' && isBodyOnly(text) && !hasFrontMatter(text) && { addsAuthors: true }), ...(!isBodyOnly(text) && { ownHeader: true }) }
}

/** 메인 노트 전부. 읽지 못한 것(main .tex가 없어진 것 등)은 뺀다 */
export function allManuscripts(wb: Workbench): ManuscriptInfo[] {
  return manuscriptKeys(wb).flatMap((k) => { try { return [manuscriptInfo(wb, k)] } catch { return [] } })
}

/** 어느 메인 노트에 속한 파일만 (main.tex와 \input한 장·부록). 그 밖은 거절 */
function partOf(wb: Workbench, file: string): { abs: string; key: string } {
  const hit = allManuscripts(wb).find((info) => file === info.main || info.parts.some((p) => p.file === file))
  if (!hit) throw new WorkbenchError(400, t(`원고에 속한 파일이 아님: ${file}`, `Not a file of the manuscript: ${file}`))
  return { abs: path.join(path.dirname(wb.root), file), key: hit.key }
}
const partFile = (wb: Workbench, file: string) => partOf(wb, file).abs

/** Markdown 노트가 부르는 그림 (노트 폴더 안의 그림·PDF만). 읽기 화면의 ![](파일)이 쓴다 */
export const NOTE_ASSET = /\.(png|jpe?g|gif|svg|webp|pdf)$/i
export function noteAsset(wb: Workbench, file: string, name: string): string {
  const { abs } = partOf(wb, file)
  const dir = path.dirname(abs)
  const target = path.resolve(dir, name)
  if (!target.startsWith(dir + path.sep) || !NOTE_ASSET.test(target)) throw new WorkbenchError(400, t(`노트 폴더 안의 그림이 아님: ${name}`, `Not a figure in the note folder: ${name}`))
  const real = fs.existsSync(target) ? fs.realpathSync(target) : ''
  if (!real || !real.startsWith(fs.realpathSync(dir) + path.sep) || !fs.statSync(real).isFile()) throw new WorkbenchError(404, t(`그림이 없음: ${name}`, `No such figure: ${name}`))
  return real
}

export function readPart(wb: Workbench, file: string): { content: string; hash: string } {
  const content = fs.readFileSync(partFile(wb, file), 'utf8')
  return { content, hash: hashOf(content) }
}

export function writePart(wb: Workbench, file: string, content: string, baseHash: string): SaveResult {
  const abs = partFile(wb, file)
  const current = hashOf(fs.readFileSync(abs, 'utf8'))
  if (current !== baseHash) return { ok: false, currentHash: current }
  writeAtomic(abs, content)
  return { ok: true, content, hash: hashOf(content) }
}

const queues = new Map<string, Promise<unknown>>()

const WRAP_FILE = 'rw-wrap-main.tex'
/** Markdown 노트를 LaTeX로 바꾼 본문 (빌드 폴더에만) */
const MD_BODY_FILE = 'rw-note-body.tex'

/** \documentclass가 없는 노트: 본문만 두고 머리는 앱의 LaTeX 서식이 붙인다 (10/4 사용자 "본문만 남기고, 컴파일러가 처리하도록") */
export { isBodyOnly } from '@rw/core'

/**
 * 본문만 있는 노트를 감싸는 main: 서식의 문서 종류 줄 → 공통 줄(\input{setting}) → 프로젝트 기호(workbench/macros.tex) →
 * pdftitle(노트 이름) → 노트 본문(\input). 빌드 폴더에 같은 이름으로 두고 원고 폴더에서 컴파일하므로 그림·\input 경로는 원래대로 풀린다.
 */
export function wrapBodyOnly(o: { template: LatexTemplate; noteFile: string; title: string; macros?: string; noteMacros?: boolean; shared?: boolean; front?: string[] }): string {
  const preamble = o.template.preamble.trim()
  const title = o.title.replace(/[\\{}%#&$^_~]/g, ' ').replace(/\s+/g, ' ').trim()
  const q = (f: string) => (/\s/.test(f) ? `"${f}"` : f)
  return [
    `% research-workspace가 만든 파일: 서식 "${o.template.name}"으로 본문만 있는 노트를 감싼다. 고치지 말 것.`,
    o.template.documentClass,
    ...(preamble ? [preamble] : []),
    ...(o.macros ? [`\\input{${q(o.macros)}}`] : []),
    ...(o.noteMacros ? [`\\input{${NOTE_MACROS}}`] : []),
    // 공통 기호는 마지막: \\providecommand라 앞의 프로젝트·노트 기호가 앞선다
    ...(o.shared ? [`\\input{${SHARED_MACROS.replace(/\.tex$/, '')}}`] : []),
    ...(title ? [`\\AtBeginDocument{\\ifdefined\\hypersetup\\hypersetup{pdftitle={${title}}}\\fi}`] : []),
    // 제목·저자는 노트에 두지 않고 앱이 붙인다 (\\begin{document}이 끝난 뒤, 본문의 초록·\\maketitle 앞).
    // \\AtBeginDocument 안에서는 revtex의 \\author가 깨져서 begindocument/end 고리에 둔다
    ...(o.front?.length ? ['\\AddToHook{begindocument/end}{%', ...o.front, '}'] : []),
    `\\input{${q(o.noteFile)}}`,
    '',
  ].join('\n')
}

/**
 * 본문만 있는 노트에 앱이 붙일 앞머리: 본문이 제목·저자를 스스로 정하지 않으면 제목(노트 이름)·저자·날짜,
 * 본문에 \\maketitle도 없으면 그것까지. 발표 서식은 붙이지 않는다.
 * 연구노트·계산 노트는 저자·소속·초록 없이 노트 이름만 작게 두고 바로 본문으로 간다
 * (10/4 16:53 사용자 "연구 노트에서는 기본은 저자, 소속, 초록 없이 본론으로 바로가는게 좋을 것 같아").
 * 본문에 남은 \\maketitle과 초록은 아무것도 찍지 않게 한다.
 */
// o.byline: 제목·저자 줄을 둘지 (빼면 원고만), o.date: \\date{}에 넣을 글 (빼면 원고는 \\today, 노트는 없음). 내보내기에서 고른다 (10/4)
export function frontFor(template: LatexTemplate, authors: Author[], title: string, body: string, kind: NoteKind = 'paper', o: { byline?: boolean; date?: string } = {}): string[] {
  if (template.kind === 'slides' || hasFrontMatter(body)) return []
  const date = o.date ?? (kind === 'paper' ? '\\today' : '')
  if (!(o.byline ?? kind === 'paper')) return [NO_TITLE_BLOCK, ...(title ? [noteHeading(title, date)] : [])]
  return [...buildFrontMatter({ setup: template, authors, title, date }), ...(hasMaketitle(body) ? [] : ['\\maketitle'])]
}

/** 연구노트에서 본문에 남은 \\maketitle과 초록(abstract)을 찍지 않게 하는 줄 */
export const NO_TITLE_BLOCK = '\\let\\maketitle\\relax\\DeclareDocumentEnvironment{abstract}{+b}{}{}'

/** 연구노트 맨 위에 두는 작은 제목 (저자·날짜 없이) */
export const noteHeading = (title: string, date = '') => `{\\centering\\large\\bfseries ${title.replace(/[\\{}%#&$^_~]/g, ' ').replace(/\s+/g, ' ').trim()}\\par}${date ? `{\\centering\\small ${date}\\par}` : ''}\\bigskip`

/** 원고 전체 컴파일. 같은 원고는 한 번에 하나씩. template: 본문만 있는 노트에 붙일 서식, authors: 그 앞머리의 저자 */
// pick: 컴파일 설정에서 고른 저자(차례대로)와 날짜 (10/4 20:56 "기본값을 정해두고, 원할 때 변경"). 빼면 원고는 authors 모두·\\today, 노트는 저자·날짜 없이
export interface ManuscriptCompileOptions {
  engine: Engine
  template?: LatexTemplate
  authors: Author[]
  shared: string | null
  pick: { authors?: Author[]; date?: string }
  figures?: FigureEmbedResolver
}

function compileInputs(wb: Workbench, key: string, o: ManuscriptCompileOptions) {
  const { repo, main, dir, name, kind } = msOf(wb, key)
  const text = fs.readFileSync(main, 'utf8')
  const magic = /%\s*!TeX\s+program\s*=\s*(\w+)/i.exec(text.slice(0, 500))?.[1]?.toLowerCase()
  const engine = (['xelatex', 'lualatex', 'pdflatex'] as const).find((e) => e === magic) ?? o.engine
  const wrapped = !!o.template && (isMarkdownNote(main) || isBodyOnly(text))
  const own = wb.readResearch().latexMacros
  const macros = own ? path.join(repo, own) : path.join(wb.root, 'macros.tex')
  const noteMacros = path.join(dir, NOTE_MACROS)
  const figures = wrapped && isMarkdownNote(main) ? o.figures?.(text, [dir], true, true) : undefined
  const body = wrapped && isMarkdownNote(main) ? markdownToLatex(text, { figure: figures?.figure, image: figures?.image }) : ''
  const bibs = body ? noteBibFiles(wb, main, body) : []
  const files = [main, ...(wrapped ? [macros, noteMacros, ...bibs, ...(figures?.inputs ?? []), ...(o.template?.files ?? []).filter((f) => path.basename(f) === f).map((f) => path.join(LATEX_FILES_DIR, f))] : [])]
  const hash = hashOf(JSON.stringify({ main, dir, engine, ...(wrapped && {
    name, kind, template: o.template, shared: o.shared, bibs, macros,
    ...(figures && { figures: { body, preamble: figures.preamble, files: figures.files.map(({ name, abs }) => ({ name, abs })) } }),
    front: frontFor(o.template!, o.pick.authors ?? o.authors, name, text, kind, {
      ...(o.pick.authors && { byline: kind === 'paper' || o.pick.authors.length > 0 }),
      ...(o.pick.date !== undefined && { date: o.pick.date }),
    }),
  }) }))
  return { files, hash, figures }
}

export function manuscriptPdfState(wb: Workbench, key = '', options?: ManuscriptCompileOptions): PdfState {
  const hasPdf = hasManuscriptPdf(wb, key)
  const last = lastCompile(wb, key)
  const success = last?.lastSuccess
  const shown = shownPdfOf(last)
  const times = { ...(last && { lastCompile: { at: last.at, ok: last.ok } }), ...(success && { lastSuccessAt: success.at }) }
  if (!hasPdf) return { hasPdf, pdfState: 'missing', ...times }
  if (!shown) return { hasPdf, pdfState: 'unknown', ...times }
  const pdf = { pdfAt: shown.at, ...(!shown.ok && { pdfErrors: true }) }
  try {
    const changed = inputsChanged(shown, options ? compileInputs(wb, key, options).hash : undefined)
    return { hasPdf, pdfState: changed ? 'stale' : shown.complete ? 'current' : 'unknown', ...times, ...pdf }
  } catch { return { hasPdf, pdfState: 'unknown', ...times, ...pdf } }
}

/** 지금 PDF의 기록. 10/5 전의 result.json에는 성공한 것(lastSuccess)만 있다 */
const shownPdfOf = (last: LastCompile | null): ShownPdf | undefined =>
  last?.lastPdf ?? (last?.lastSuccess && { ...last.lastSuccess, ok: true })

export function compileManuscript(wb: Workbench, engine: Engine, key = '', template?: LatexTemplate, authors: Author[] = [], shared: string | null = null, pick: { authors?: Author[]; date?: string } = {}, current?: () => ManuscriptCompileOptions): Promise<CompileResult & PdfState> {
  msOf(wb, key)
  const q = `${wb.root}\n${key}`
  const readOptions = current ?? (() => ({ engine, template, authors, shared, pick }))
  const next = (queues.get(q) ?? Promise.resolve()).catch(() => undefined).then(() => doCompile(wb, key, readOptions))
  queues.set(q, next)
  return next
}

async function doCompile(wb: Workbench, key: string, readOptions: () => ManuscriptCompileOptions): Promise<CompileResult & PdfState> {
  const started = Date.now()
  const options = readOptions()
  const { engine: fallback, template, authors, shared, pick } = options
  const { repo, main, dir, name, kind } = msOf(wb, key)
  const out = buildDirOf(wb, key)
  fs.mkdirSync(out, { recursive: true })
  const previous = lastCompile(wb, key)
  const explicit = compileInputs(wb, key, options)
  const startInputs = beginInputs(repo, [...explicit.files, ...(previous?.lastSuccess?.inputs.map((i) => i.file) ?? [])])
  const pdfFile = manuscriptPdf(wb, key)
  const held = manuscriptPdfBytes(wb, key)
  const savedOutputs = new Map<string, Buffer | null>([[pdfFile, held]])
  for (const ext of ['synctex.gz', 'synctex']) {
    const file = pdfFile.replace(/\.pdf$/, `.${ext}`)
    savedOutputs.set(file, held && fs.existsSync(file) ? fs.readFileSync(file) : null)
  }
  heldPdfs.set(pdfFile, held)
  const pdfBefore = fileStamp(pdfFile)
  let accepted = false
  let result: CompileResult
  try {
    const text = fs.readFileSync(main, 'utf8')
    // 원고 첫 줄의 "% !TeX program = xelatex"을 따른다
    const magic = /%\s*!TeX\s+program\s*=\s*(\w+)/i.exec(text.slice(0, 500))?.[1]?.toLowerCase()
    const engine = (['xelatex', 'lualatex', 'pdflatex'] as const).find((e) => e === magic) ?? fallback
    const base = path.basename(main).replace(/\.(tex|md)$/, '')
    const md = isMarkdownNote(main)
    // 본문만 있는 노트: 빌드 폴더에 감싸는 main과 setting.tex를 만들어 그것을 컴파일한다 (노트 폴더에는 아무것도 쓰지 않는다)
    // 감싸는 main은 다른 이름(WRAP_FILE)으로 두고 -jobname으로 PDF 이름을 노트와 같게 한다.
    // (TeX는 \input 파일을 빌드 폴더에서 먼저 찾아서, 같은 이름이면 노트 대신 감싸는 main을 다시 부른다)
    let target = path.basename(main)
    if (md && !template) throw new WorkbenchError(400, t('Markdown 노트는 LaTeX 서식으로 감싸 컴파일합니다. 설정 › LaTeX 서식을 확인하세요', 'Markdown notes are compiled inside a LaTeX template. Check Settings › LaTeX templates'))
    if (template && (md || isBodyOnly(text))) {
      const own = wb.readResearch().latexMacros
      const macros = own ? path.join(repo, own) : path.join(wb.root, 'macros.tex')
      fs.writeFileSync(path.join(out, 'setting.tex'), buildSettingTex(template))
      placeTemplateFiles(template, out)
      if (shared) fs.writeFileSync(path.join(out, SHARED_MACROS), shared)
      target = path.join(out, WRAP_FILE)
      // Markdown 노트: 빌드 폴더에 LaTeX로 바꾼 본문을 두고 그것을 부른다 (노트 파일은 그대로)
      // 본문만 있는 LaTeX 노트처럼 \begin{document} … \end{document}로 감싼다 (감싸는 main은 그 앞까지만 둔다)
      // 인용이 있으면 노트 폴더(없으면 프로젝트)의 .bib로 참고문헌 목록을 붙인다. 노트 폴더 것은 이름만, 밖의 것은 절대 경로
      if (md) {
        if (explicit.figures) writeFigureEmbeds(explicit.figures, out)
        const body = markdownToLatex(text, { figure: explicit.figures?.figure, image: explicit.figures?.image })
        const bibs = noteBibFiles(wb, main, body).map((f) => (path.dirname(f) === dir ? path.basename(f) : f).replace(/\.bib$/, ''))
        fs.writeFileSync(path.join(out, MD_BODY_FILE), ['\\begin{document}', body, ...bibliographyLines(template, bibs), '\\end{document}', ''].join('\n'))
      }
      fs.writeFileSync(target, wrapBodyOnly({
        template: md ? { ...template, preamble: [template.preamble.trim(), MD_PREAMBLE, explicit.figures?.preamble].filter(Boolean).join('\n') } : template,
        noteFile: md ? MD_BODY_FILE : path.basename(main), title: name, front: frontFor(template, pick.authors ?? authors, name, text, kind, {
          // 내보내기와 같게: 원고는 늘 제목 줄, 노트는 저자를 골랐을 때만
          ...(pick.authors && { byline: kind === 'paper' || pick.authors.length > 0 }),
          ...(pick.date !== undefined && { date: pick.date }),
        }),
        noteMacros: fs.existsSync(path.join(dir, NOTE_MACROS)), shared: !!shared, ...(fs.existsSync(macros) && { macros: path.relative(dir, macros) }),
      }))
    }
    // 지난 컴파일이 실패했으면 다시 돌게 한다(-g). 파일이 그대로면 latexmk는 돌지 않고 지난 오류만 다시 알려,
    // 원고 밖(패키지 설치, 글꼴 등)을 고친 뒤에도 같은 오류가 남는다 (10/4 13:48 피드백: 0.3초 만에 10/1의 오류를 다시 보여 줌)
    const lastFailed = previous?.ok === false
    const sourceChanged = !previous?.lastSuccess?.complete || inputsChanged(previous.lastSuccess, explicit.hash)
    // -norc: 원고 폴더는 받은(clone) 저장소 안이다. 거기 둔 latexmkrc(Perl 코드)를 ▶ 한 번에 돌리지 않는다 (미리보기 컴파일 runLatexmk와 같게)
    // '-'로 시작하는 파일 이름은 latexmk가 옵션으로 읽으므로 컴파일하지 않는다
    if (target.startsWith('-')) throw new WorkbenchError(400, t(`'-'로 시작하는 파일 이름은 컴파일하지 않습니다: ${target}`, `Files whose name starts with '-' are not compiled: ${target}`))
    const args = ['-norc', ...(lastFailed || sourceChanged ? ['-g'] : []), `-${engine}`, '-recorder', '-synctex=1', '-interaction=nonstopmode', '-file-line-error', '-f', `-outdir=${out}`, `-jobname=${base}`, target]
    const code = await new Promise<number>((resolve) => {
      // 원고 폴더에서 돌려 \input·그림 경로가 원래대로 풀리게 하고, bibtex가 원고 폴더의 .bib를 찾게 한다.
      // 빌드 폴더를 앞에 두어 감싸는 main의 \input{setting}이 빌드 폴더의 setting.tex를 찾는다
      const child = spawn('latexmk', args, { cwd: dir, env: { ...process.env, max_print_line: '10000', BIBINPUTS: `${dir}:`, TEXINPUTS: target === path.basename(main) ? `${dir}:` : `${out}:${dir}:` }, stdio: 'ignore' })
      const timer = setTimeout(() => child.kill('SIGKILL'), COMPILE_TIMEOUT_MS)
      child.on('close', (c) => { clearTimeout(timer); resolve(c ?? -1) })
      child.on('error', () => { clearTimeout(timer); resolve(-1) })
    })
    const logFile = path.join(out, `${base}.log`)
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
    const problems = parseLatexErrors(log, dir).map((p) => {
      const abs = path.isAbsolute(p.file) ? p.file : path.resolve(dir, p.file)
      return { ...p, file: abs.startsWith(repo + path.sep) ? path.relative(repo, abs) : p.file, inBlock: false }
    })
    const pdf = path.join(out, `${base}.pdf`)
    const hasPdf = isCompletePdf(pdf)
    if (!hasPdf && fs.existsSync(pdf)) problems.unshift({ file: path.relative(repo, main), line: 0, message: t('PDF가 끝까지 만들어지지 않았습니다 (그림 파일을 찾지 못했을 수 있음). 아래 오류를 먼저 고치세요.', 'The PDF was not finished (a figure file may be missing). Fix the errors below first.'), inBlock: false })
    const ok = code === 0 && hasPdf && problems.length === 0
    if (!ok && problems.length === 0) problems.push({ file: path.relative(repo, main), line: 0, message: code === -1 ? t('latexmk를 실행하지 못했습니다.', 'Could not run latexmk.') : t('PDF를 새로 만들지 못했습니다. 로그를 확인하세요.', 'Could not make a new PDF. Check the log.'), inBlock: false })
    result = { ok, durationMs: Date.now() - started, hasPdf, problems, logTail: log.split('\n').slice(-40).join('\n') }
    const at = new Date().toISOString()
    // 오류가 있어도 이번에 끝까지 만든 PDF는 그대로 보여 준다 (10/5 사용자 "오류가 나면 오류가 나는대로 보여줘").
    // 이번에 새로 쓰지 못했거나 덜 만든 PDF만 버리고 이전 PDF를 되돌린다
    const produced = hasPdf && fileStamp(pdf) !== pdfBefore
    let lastSuccess = previous?.lastSuccess
    let lastPdf = shownPdfOf(previous)
    if (ok || produced) {
      const recorded = recordedInputs(dir, out, base)
      const finished = finishInputs(startInputs, [...explicit.files, ...recorded.files])
      const inputs: SuccessfulInputs = { at, inputs: finished.inputs, contextHash: explicit.hash, complete: recorded.complete && finished.complete,
        changedDuringCompile: finished.changed || compileInputs(wb, key, readOptions()).hash !== explicit.hash }
      if (ok) lastSuccess = inputs
      lastPdf = { ...inputs, ok }
    }
    writeAtomic(path.join(out, 'result.json'), JSON.stringify({ at, ok, durationMs: result.durationMs, problems: problems.slice(0, 20), ...(lastSuccess && { lastSuccess }), ...(lastPdf && { lastPdf }) }, null, 1))
    accepted = ok || produced
  } finally {
    let restoreError: unknown
    if (!accepted) for (const [file, bytes] of savedOutputs) {
      try {
        if (bytes === null) fs.rmSync(file, { force: true })
        else if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) fs.writeFileSync(file, bytes)
      } catch (e) { restoreError ??= e }
    }
    // A failed restoration must never expose a partially overwritten PDF or mapping.
    if (restoreError) throw restoreError
    heldPdfs.delete(pdfFile)
  }
  return { ...result, ...manuscriptPdfState(wb, key, readOptions()) }
}

export interface LastCompile { at: string; ok: boolean; durationMs: number; problems: { file: string; line: number; message: string }[]; lastSuccess?: SuccessfulInputs; lastPdf?: ShownPdf }
export function lastCompile(wb: Workbench, key = ''): LastCompile | null {
  const f = path.join(buildDirOf(wb, key), 'result.json')
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) as LastCompile : null } catch { return null }
}

/**
 * 유도 노트의 "% 근거: docs/model/chapters/10-discussion.tex, 09-phase.tex" 줄에서 원고 장을 찾는다.
 * 경로 전체나 파일 이름만 적어도 원고의 장·부록 파일과 맞춘다. 한 파일 원고는 "PRB.tex#라벨"이나 "PRB.tex#절 제목"으로 절을 가리킨다.
 * 돌려주는 값은 장의 id다.
 */
export function groundsOf(content: string, parts: ManuscriptPart[]): string[] {
  const out: string[] = []
  const add = (id: string) => { if (!out.includes(id)) out.push(id) }
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase()
  // Markdown 보조 노트는 머리말의 grounds: 줄
  for (const m of content.matchAll(/^(?:%\s*근거|grounds):\s*(.+)$/gm)) {
    for (const ref of m[1]!.split(/[,;]/)) {
      // "PRB.tex#라벨" 또는 "PRB.tex#절 제목": 한 파일 원고의 절
      const sec = /([\w./-]+\.tex)\s*#\s*(.+)$/.exec(ref.trim())
      if (sec) {
        const want = norm(sec[2]!)
        const hit = parts.find((p) => p.line && (p.file === sec[1] || p.file.endsWith(`/${sec[1]}`)) && (norm(p.id.slice(p.file.length + 1)) === want || norm(p.title) === want))
        if (hit) add(hit.id)
        continue
      }
      for (const tok of ref.match(/[\w./-]+\.tex/g) ?? []) {
        const hit = parts.find((p) => !p.line && (p.file === tok || p.file.endsWith(`/${tok}`)))
        if (hit) add(hit.id)
      }
    }
  }
  return out
}

/** 장 파일의 줄 → PDF 영역 */
export async function manuscriptView(wb: Workbench, file: string, line: number): Promise<PdfBox[]> {
  const { abs, key } = partOf(wb, file)
  const pdf = manuscriptPdf(wb, key)
  if (heldPdfs.has(pdf)) return []
  // Markdown 노트는 PDF가 바꾼 글에서 나와 줄이 맞지 않는다
  if (!isCompletePdf(pdf) || isMarkdownNote(abs)) return []
  const { stdout } = await run('synctex', ['view', '-i', `${line}:0:${abs}`, '-o', pdf], { cwd: msOf(wb, key).dir })
  return parseSynctexView(stdout)
}

/** PDF 위치 → 장 파일과 줄 (저장소 기준). 원고 밖(서식 등)이면 null */
export async function manuscriptEdit(wb: Workbench, page: number, x: number, y: number, key = ''): Promise<{ file: string; line: number } | null> {
  const pdf = manuscriptPdf(wb, key)
  if (heldPdfs.has(pdf)) return null
  if (!isCompletePdf(pdf)) return null
  const { repo, dir } = msOf(wb, key)
  const { stdout } = await run('synctex', ['edit', '-o', `${page}:${x}:${y}:${pdf}`], { cwd: dir })
  const spot = parseSynctexEdit(stdout)
  if (!spot) return null
  const abs = fs.realpathSync(path.isAbsolute(spot.file) ? spot.file : path.resolve(dir, spot.file))
  const rel = path.relative(fs.realpathSync(repo), abs)
  const info = manuscriptInfo(wb, key)
  if (info.format === 'md') return null
  return rel === info.main || info.parts.some((p) => p.file === rel) ? { file: rel, line: spot.line } : null
}
