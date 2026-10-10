import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildBlockMainTex, buildLibraryNoteMainTex, buildSettingTex, markdownToLatex, MD_BODY_PRELUDE, MD_PREAMBLE, parseBlock, parseLatexErrors, parseSynctexEdit, parseSynctexView, type Author, type LatexTemplate, type PdfBox, type SourceSpot } from '@rw/core'
import { placeTemplateFiles } from './latexFiles.js'
import { frontFor, isBodyOnly } from './manuscript.js'
import { writeFigureEmbeds, type FigureEmbedResolver } from './figureEmbeds.js'
import type { Workbench } from './workbench.js'
import { t } from './i18n.js'
import type { CompileResult } from '@rw/core/contract/research'

const run = promisify(execFile)

export type Engine = 'xelatex' | 'lualatex' | 'pdflatex'

export type { CompileResult } from '@rw/core/contract/research'

const COMPILE_TIMEOUT_MS = 120_000
const queues = new Map<string, Promise<unknown>>()

/** 같은 블록의 컴파일은 한 번에 하나씩 차례로 돌린다. */
export interface BlockCompileChoice { template: LatexTemplate; authors?: Author[]; date?: string }

export function compileBlock(wb: Workbench, id: string, engine: Engine = 'xelatex', library?: string, choice?: BlockCompileChoice, figures?: FigureEmbedResolver): Promise<CompileResult> {
  const key = `${wb.root}:${id}`
  const prev = queues.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(() => doCompile(wb, id, engine, library, choice, figures))
  queues.set(key, next)
  return next
}

/**
 * 공유 라이브러리 노트 하나를 PDF로 (라이브러리 서식을 모두 불러와서). 빌드는 앱 설정 폴더 아래에서 해
 * research-library 저장소에는 아무것도 남기지 않는다.
 * template(설정의 LaTeX 서식)을 주면 그 문서 종류로, setting.tex를 빌드 폴더에 만들어 쓴다.
 */
export function compileLibraryNote(library: string, preambles: string[], note: string, buildDir: string, engine: Engine = 'xelatex', bib?: string, template?: LatexTemplate): Promise<CompileResult> {
  const prev = queues.get(buildDir) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(async () => {
    const started = Date.now()
    if (!fs.existsSync(note)) throw new Error(t(`없는 노트: ${note}`, `No such note: ${note}`))
    fs.mkdirSync(buildDir, { recursive: true })
    if (template) fs.writeFileSync(path.join(buildDir, 'setting.tex'), buildSettingTex(template))
    placeTemplateFiles(template, buildDir)
    fs.writeFileSync(path.join(buildDir, 'main.tex'), buildLibraryNoteMainTex({ library, preambles, note, bib, template }))
    // 노트는 짧으니 latexmk가 필요한 만큼(참고문헌 bibtex 포함) 다시 돌게 둔다
    const args = [`-${engine}`, '-interaction=nonstopmode', '-file-line-error', '-f', ...(bib ? ['-bibtex'] : ['-e', '$max_repeat=1']), 'main.tex']
    const logPath = path.join(buildDir, 'main.log')
    const readLog = () => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '')
    let exitCode = await runLatexmk(buildDir, args)
    let log = readLog()
    if (exitCode !== -1 && NEEDS_RERUN.test(log)) {
      exitCode = await runLatexmk(buildDir, args, true)
      log = readLog()
    }
    const problems = parseLatexErrors(log, buildDir).map((p) => ({
      ...p,
      file: p.file.startsWith(library + path.sep) ? path.relative(library, p.file) : p.file,
      inBlock: p.file === note,
    }))
    const pdf = path.join(buildDir, 'main.pdf')
    const hasPdf = isCompletePdf(pdf)
    const fresh = hasPdf && fs.statSync(pdf).mtimeMs >= started - 1000
    const outcome = judgeCompile({ hasPdf, fresh, exitCode, problems })
    return { ok: outcome.ok, durationMs: Date.now() - started, hasPdf, problems: outcome.problems, logTail: log.split('\n').slice(-40).join('\n') }
  })
  queues.set(buildDir, next)
  return next
}

async function doCompile(wb: Workbench, id: string, engine: Engine, library?: string, choice?: BlockCompileChoice, figures?: FigureEmbedResolver): Promise<CompileResult> {
  const started = Date.now()
  const blockFile = wb.blockPath(id)
  if (!fs.existsSync(blockFile)) throw new Error(t(`없는 블록: ${id}`, `No such block: ${id}`))
  const dir = wb.buildDir(id)
  fs.mkdirSync(dir, { recursive: true })
  // Markdown 보조 노트는 빌드 폴더에 LaTeX로 바꾼 본문을 두고 그것을 넣는다 (노트 파일은 그대로)
  const md = blockFile.endsWith('.md')
  const text = fs.readFileSync(blockFile, 'utf8')
  const ownHeader = !md && !isBodyOnly(text)
  if (ownHeader) {
    // 머리가 있는 LaTeX 노트는 연구노트처럼 자체 서식을 따른다. 원본은 빌드 폴더에서 불러오기만 한다.
    const dirs = [path.dirname(blockFile), wb.root, ...(library ? [library] : [])]
    fs.writeFileSync(path.join(dir, 'main.tex'), [
      `\\makeatletter\\def\\input@path{${dirs.map((d) => `{${d}/}`).join('')}}\\makeatother`,
      `\\input{"${blockFile}"}`, '',
    ].join('\n'))
  } else {
    const embeds = md ? figures?.(text, [wb.root, wb.blocksDir, wb.figuresDir, ...(library ? [library] : [])], true, true) : undefined
    if (embeds) writeFigureEmbeds(embeds, dir)
    if (md) fs.writeFileSync(path.join(dir, 'block-body.tex'), `${MD_BODY_PRELUDE}\n${markdownToLatex(text, { figure: embeds?.figure, image: embeds?.image })}`)
    if (choice) {
      fs.writeFileSync(path.join(dir, 'setting.tex'), buildSettingTex(choice.template))
      placeTemplateFiles(choice.template, dir)
    }
    const main = buildBlockMainTex({
      preamble: wb.preamblePath,
      block: md ? path.join(dir, 'block-body.tex') : blockFile,
      figures: wb.figuresDir,
      library,
    }, choice ? {
      template: choice.template,
      front: frontFor(choice.template, choice.authors ?? [], parseBlock(text).meta.title || id, text, 'note', {
        ...(choice.authors && { byline: choice.authors.length > 0 }),
        ...(choice.date !== undefined && { date: choice.date }),
      }),
    } : {})
    const preamble = [
      ...(embeds?.files.some((f) => f.kind === 'png' || f.kind === 'jpg' || f.kind === 'pdf') ? [MD_PREAMBLE] : []),
      ...(embeds?.preamble ? [embeds.preamble] : []),
    ].join('\n')
    fs.writeFileSync(path.join(dir, 'main.tex'), preamble ? main.replace('\n\\begin{document}\n', `\n${preamble}\n\\begin{document}\n`) : main)
  }

  // -f: 오류가 있어도 가능한 만큼 PDF를 만든다 (Overleaf처럼 오류와 PDF를 함께 보여 주기 위해).
  // max_repeat=1: 기본은 한 번만 돌린다(약 3초). 참조 번호가 바뀌었다는 경고가 있을 때만 한 번 더 돌린다.
  const args = [`-${engine}`, '-synctex=1', '-interaction=nonstopmode', '-file-line-error', '-f', '-e', '$max_repeat=1', 'main.tex']
  const logPath = path.join(dir, 'main.log')
  const readLog = () => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '')

  let exitCode = await runLatexmk(dir, args)
  let log = readLog()
  if (exitCode !== -1 && NEEDS_RERUN.test(log)) {
    exitCode = await runLatexmk(dir, args, true)
    log = readLog()
  }
  const problems = parseLatexErrors(log, dir).map((p) => ({
    ...p,
    file: wb.relative(p.file) ?? p.file,
    inBlock: p.file === blockFile,
  }))
  const pdf = pdfPath(wb, id)
  const hasPdf = isCompletePdf(pdf)
  if (!hasPdf && fs.existsSync(pdf)) problems.push({ file: 'main.tex', line: 0, message: t('PDF가 끝까지 만들어지지 않았습니다 (그림 파일을 찾지 못했을 수 있음). 위 오류를 먼저 고치세요.', 'The PDF was not finished (a figure file may be missing). Fix the errors above first.'), inBlock: false })
  const fresh = hasPdf && fs.statSync(pdf).mtimeMs >= started - 1000
  const outcome = judgeCompile({ hasPdf, fresh, exitCode, problems })
  return {
    ok: outcome.ok,
    durationMs: Date.now() - started,
    hasPdf,
    problems: outcome.problems,
    logTail: log.split('\n').slice(-40).join('\n'),
  }
}

/**
 * 컴파일 성공 판단.
 * - latexmk의 실패 코드만으로는 판단하지 않는다: 한 번만 돌리게(max_repeat=1) 했기 때문에, 첫 컴파일처럼
 *   .aux가 바뀌기만 해도 "최대 횟수에 도달"이라며 실패 코드를 낸다. 대신 LaTeX 오류가 없고 새 PDF를 썼는지를 본다.
 * - 원고와 불러오는 파일이 그대로면 latexmk는 다시 돌리지 않고 정상(0)으로 끝난다("All targets are up-to-date").
 *   이때 있는 PDF가 곧 최신이므로 성공이다.
 */
export function judgeCompile(r: { hasPdf: boolean; fresh: boolean; exitCode: number; problems: CompileResult['problems'] }): { ok: boolean; problems: CompileResult['problems'] } {
  const upToDate = r.hasPdf && !r.fresh && r.exitCode === 0
  if (r.fresh || upToDate || r.problems.length > 0) return { ok: r.problems.length === 0, problems: r.problems }
  const message = r.exitCode === -1 ? t('latexmk를 실행하지 못했습니다.', 'Could not run latexmk.') : t('PDF를 새로 만들지 못했습니다. 로그를 확인하세요.', 'Could not build a new PDF. Check the log.')
  return { ok: false, problems: [{ file: 'main.tex', line: 0, message, inBlock: false }] }
}

/**
 * PDF가 끝까지 쓰였는지 (끝부분에 %%EOF). 그림을 못 찾는 등으로 xdvipdfmx가 도중에 멈추면
 * 색인 없는 반쪽 PDF가 남는데, 화면이 그것을 띄우면 "Invalid PDF structure"가 된다.
 */
export function isCompletePdf(file: string): boolean {
  if (!fs.existsSync(file)) return false
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const n = Math.min(size, 2048)
    const buf = Buffer.alloc(n)
    fs.readSync(fd, buf, 0, n, size - n)
    return buf.toString('latin1').includes('%%EOF')
  } finally { fs.closeSync(fd) }
}

const NEEDS_RERUN = /Rerun to get (?:cross-references|citations) right|Label\(s\) may have changed/

export function runLatexmk(dir: string, args: string[], force = false): Promise<number> {
  return new Promise<number>((resolve) => {
    // force: 원고가 그대로여도 latexmk가 건너뛰지 않게 한다 (-g)
    // -norc: 빌드 폴더는 앱이 만드는 곳이다. 받은(clone) 저장소가 거기에 넣어 둔 latexmkrc(Perl 코드)를 읽지 않는다
    const child = spawn('latexmk', ['-norc', ...(force ? ['-g'] : []), ...args], {
      cwd: dir,
      env: { ...process.env, max_print_line: '10000' },
      stdio: 'ignore',
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), COMPILE_TIMEOUT_MS)
    child.on('close', (code) => { clearTimeout(timer); resolve(code ?? -1) })
    child.on('error', () => { clearTimeout(timer); resolve(-1) })
  })
}

export function pdfPath(wb: Workbench, id: string): string {
  return path.join(wb.buildDir(id), 'main.pdf')
}

/** 원고 줄 → PDF 영역 */
export async function synctexView(wb: Workbench, id: string, line: number): Promise<PdfBox[]> {
  const pdf = pdfPath(wb, id)
  if (!fs.existsSync(pdf)) return []
  const { stdout } = await run('synctex', ['view', '-i', `${line}:0:${wb.blockPath(id)}`, '-o', pdf], { cwd: wb.buildDir(id) })
  return parseSynctexView(stdout)
}

/** PDF 위치 → 원고 줄. 블록 밖(틀·서식)이면 inBlock=false */
export async function synctexEdit(wb: Workbench, id: string, page: number, x: number, y: number): Promise<(SourceSpot & { inBlock: boolean }) | null> {
  const pdf = pdfPath(wb, id)
  if (!fs.existsSync(pdf)) return null
  const { stdout } = await run('synctex', ['edit', '-o', `${page}:${x}:${y}:${pdf}`], { cwd: wb.buildDir(id) })
  const spot = parseSynctexEdit(stdout)
  if (!spot) return null
  const abs = path.isAbsolute(spot.file) ? spot.file : path.join(wb.buildDir(id), spot.file)
  const inBlock = fs.existsSync(abs) && fs.realpathSync(abs) === fs.realpathSync(wb.blockPath(id))
  return { file: wb.relative(abs) ?? abs, line: spot.line, inBlock }
}
