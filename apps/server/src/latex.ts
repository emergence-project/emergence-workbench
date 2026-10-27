import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildLibraryNoteMainTex, buildSettingTex, parseLatexErrors, type LatexTemplate } from '@rw/core'
import { placeTemplateFiles } from './latexFiles.js'
import { t } from './i18n.js'
import type { CompileResult } from '@rw/core/contract/research'

export type Engine = 'xelatex' | 'lualatex' | 'pdflatex'

export type { CompileResult } from '@rw/core/contract/research'

const COMPILE_TIMEOUT_MS = 120_000
const queues = new Map<string, Promise<unknown>>()

/**
 * 공유 라이브러리 노트 하나를 PDF로 (라이브러리 서식을 모두 불러와서). 빌드는 앱 설정 폴더 아래에서 해
 * shared-library 저장소에는 아무것도 남기지 않는다.
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
