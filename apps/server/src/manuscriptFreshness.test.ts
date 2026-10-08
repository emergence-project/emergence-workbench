import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_TEMPLATES } from '@rw/core'
import { buildDirOf, compileManuscript, lastCompile, manuscriptEdit, manuscriptPdfBytes, manuscriptPdfState, manuscriptView, pathKeyOf, type ManuscriptCompileOptions } from './manuscript.js'
import { beginInputs, finishInputs, recordedInputs } from './manuscriptFreshness.js'
import { Workbench } from './workbench.js'
import { buildApp } from './app.js'

const fake = vi.hoisted(() => ({ run: undefined as undefined | ((args: string[], cwd: string) => number | Promise<number>) }))
vi.mock('node:child_process', async () => ({
  ...await vi.importActual<typeof import('node:child_process')>('node:child_process'),
  spawn: vi.fn((_command: string, args: string[], options: { cwd: string }) => {
    const child = new EventEmitter() as EventEmitter & { kill(): void }
    child.kill = () => child.emit('close', -1) as unknown as void
    queueMicrotask(() => { Promise.resolve().then(() => fake.run!(args, options.cwd)).then((code) => child.emit('close', code), (e) => child.emit('error', e)) })
    return child
  }),
}))

let root: string
let repo: string
let wb: Workbench
const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const source = (rel: string, text: string) => write(path.join(repo, rel), text)
const options = (): ManuscriptCompileOptions => ({ engine: 'pdflatex', authors: [], shared: null, pick: {} })
const compile = (read = options, key = '') => {
  const o = read()
  return compileManuscript(wb, o.engine, key, o.template, o.authors, o.shared, o.pick, read)
}
function outputs(args: string[], cwd: string, inputs = ['main.tex', 'chapters/a.tex', 'macros.tex'], bibs = ['refs.bib']) {
  const out = args.find((a) => a.startsWith('-outdir='))!.slice(8)
  const base = args.find((a) => a.startsWith('-jobname='))!.slice(9)
  write(path.join(out, `${base}.pdf`), '%PDF-1.7\nnew result\n%%EOF')
  write(path.join(out, `${base}.synctex.gz`), 'new synctex')
  write(path.join(out, `${base}.log`), '')
  write(path.join(out, `${base}.fls`), [`PWD ${cwd}`, ...inputs.map((f) => `INPUT ${f}`), `INPUT ${path.join(out, 'generated.aux')}`].join('\n'))
  write(path.join(out, `${base}.fdb_latexmk`), ['# Fdb version 4', '["bibtex"] 0 "main.aux" "main.bbl" "main" 0 0', ...bibs.map((f) => `  "${f}" 0 1 01234567890123456789012345678901 ""`), '  (generated)', '  "main.bbl"'].join('\n'))
  return out
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-pdf-state-'))
  repo = path.join(root, 'repo')
  source('workbench/research.yaml', 'title: Test\nsources:\n  manuscript: main.tex\n  bib: [refs.bib]\n')
  source('main.tex', '\\documentclass{article}\n\\input{macros}\n\\begin{document}\n\\input{chapters/a}\n\\bibliography{refs}\n\\end{document}\n')
  source('chapters/a.tex', '\\section{A}\nA\n')
  source('macros.tex', '\\newcommand{\\A}{A}\n')
  source('refs.bib', '@article{a,title={A}}\n')
  wb = new Workbench(path.join(repo, 'workbench'))
  fake.run = (args, cwd) => { outputs(args, cwd); return 0 }
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

describe('manuscript PDF freshness', () => {
  it('marks the first successful compile current and detects main, nested input, bib and macro edits', async () => {
    expect(manuscriptPdfState(wb)).toMatchObject({ hasPdf: false, pdfState: 'missing' })
    const result = await compile()
    expect(result).toMatchObject({ ok: true, hasPdf: true, pdfState: 'current', lastCompile: { ok: true } })
    expect(result.lastSuccessAt).toMatch(/\.\d{3}Z$/)
    expect(lastCompile(wb)?.lastSuccess?.inputs.map((i) => i.file)).not.toContain(path.join(buildDirOf(wb), 'generated.aux'))
    for (const file of ['main.tex', 'chapters/a.tex', 'refs.bib', 'macros.tex']) {
      const abs = path.join(repo, file)
      const original = fs.readFileSync(abs)
      fs.appendFileSync(abs, '% change\n')
      expect(manuscriptPdfState(wb, '', options()).pdfState).toBe('stale')
      fs.writeFileSync(abs, original)
      expect(manuscriptPdfState(wb, '', options()).pdfState).toBe('current')
    }
    expect(manuscriptPdfState(new Workbench(wb.root), '', options()).lastSuccessAt).toBe(result.lastSuccessAt)
  })

  it('recognizes the Ubuntu TeX system configuration without ignoring user texmf inputs', async () => {
    source('etc/texmf/user.tex', 'User definitions')
    fake.run = (args, cwd) => {
      outputs(args, cwd, ['main.tex', 'etc/texmf/user.tex', '/etc/texmf/web2c/texmf.cnf'])
      return 0
    }
    expect(await compile()).toMatchObject({ ok: true, pdfState: 'current' })
    expect(lastCompile(wb)?.lastSuccess?.inputs.map((i) => i.file)).toContain(path.join(repo, 'etc/texmf/user.tex'))
    source('etc/texmf/user.tex', 'Changed definitions')
    expect(manuscriptPdfState(wb, '', options()).pdfState).toBe('stale')
  })

  it('detects a source replacement during compilation even when its mtime is restored', async () => {
    fake.run = (args, cwd) => {
      const file = path.join(repo, 'chapters/a.tex')
      const old = fs.statSync(file)
      write(`${file}.new`, '\\section{A}\nB\n')
      fs.renameSync(`${file}.new`, file)
      fs.utimesSync(file, old.atime, old.mtime)
      outputs(args, cwd)
      return 0
    }
    expect(await compile()).toMatchObject({ ok: true, pdfState: 'stale' })
    expect(lastCompile(wb)?.lastSuccess?.changedDuringCompile).toBe(true)
  })

  it('answers repeated state checks without rereading unchanged inputs, and still sees edits that keep size and mtime (10/5 review)', async () => {
    await compile()
    const chapter = path.join(repo, 'chapters/a.tex')
    const reads = vi.spyOn(fs, 'readFileSync')
    const inputReads = () => reads.mock.calls.filter(([f]) => String(f) === chapter).length
    for (let i = 0; i < 3; i++) expect(manuscriptPdfState(wb, '', options())).toMatchObject({ pdfState: 'current' })
    expect(inputReads()).toBe(0)
    // Touching without changing bytes reads once, then is remembered
    const later = new Date(Date.now() + 60_000)
    fs.utimesSync(chapter, later, later)
    expect(manuscriptPdfState(wb, '', options())).toMatchObject({ pdfState: 'current' })
    expect(manuscriptPdfState(wb, '', options())).toMatchObject({ pdfState: 'current' })
    expect(inputReads()).toBe(1)
    // Same size, mtime put back: ctime still changes, so the edit is found
    const st = fs.statSync(chapter)
    fs.writeFileSync(chapter, '\\section{A}\nB\n')
    fs.utimesSync(chapter, st.atime, st.mtime)
    expect(manuscriptPdfState(wb, '', options())).toMatchObject({ pdfState: 'stale' })
    reads.mockRestore()
  })

  it('marks a reused PDF stale when the first manuscript changes to a different main with the same basename', async () => {
    expect(await compile()).toMatchObject({ pdfState: 'current' })
    source('new/main.tex', '\\documentclass{article}\n\\begin{document}\nDifferent manuscript.\n\\end{document}\n')
    source('workbench/research.yaml', 'title: Test\nsources:\n  manuscript: new/main.tex\n  bib: [refs.bib]\n')
    expect(manuscriptPdfState(wb, '', options())).toMatchObject({ hasPdf: true, pdfState: 'stale' })
  })

  it('shows a PDF produced by a compile with errors and marks it as such (10/5: errors are shown as they are)', async () => {
    const first = await compile()
    const pdf = path.join(buildDirOf(wb), 'main.pdf')
    const sync = pdf.replace('.pdf', '.synctex.gz')
    const before = fs.readFileSync(pdf)
    fake.run = async (args, cwd) => {
      outputs(args, cwd)
      write(pdf, '%PDF-1.7\nresult with errors\n%%EOF')
      write(sync, 'error mapping')
      // While compiling, the previous PDF stays visible and SyncTeX waits
      expect(manuscriptPdfBytes(wb)).toEqual(before)
      expect(await manuscriptView(wb, 'chapters/a.tex', 1)).toEqual([])
      expect(await manuscriptEdit(wb, 1, 0, 0)).toBeNull()
      return 12
    }
    const failed = await compile()
    expect(failed).toMatchObject({ ok: false, hasPdf: true, pdfState: 'current', pdfErrors: true, lastSuccessAt: first.lastSuccessAt, lastCompile: { ok: false } })
    expect(failed.pdfAt).not.toBe(first.pdfAt)
    expect(fs.readFileSync(pdf, 'utf8')).toContain('result with errors')
    expect(fs.readFileSync(sync, 'utf8')).toBe('error mapping')
    // The next clean compile clears the mark
    fake.run = (args, cwd) => { outputs(args, cwd); return 0 }
    const fixed = await compile()
    expect(fixed).toMatchObject({ ok: true, pdfState: 'current' })
    expect(fixed.pdfErrors).toBeUndefined()
  })

  it('restores the previous PDF and SyncTeX when a failed compile leaves no new complete PDF', async () => {
    const first = await compile()
    const pdf = path.join(buildDirOf(wb), 'main.pdf')
    const sync = pdf.replace('.pdf', '.synctex.gz')
    const before = fs.readFileSync(pdf)
    fake.run = (args, cwd) => { outputs(args, cwd); write(pdf, '%PDF-1.7\ncut off'); write(sync, 'partial mapping'); return 12 }
    const failed = await compile()
    expect(failed).toMatchObject({ ok: false, hasPdf: true, pdfAt: first.pdfAt, lastCompile: { ok: false } })
    expect(failed.pdfErrors).toBeUndefined()
    expect(fs.readFileSync(pdf)).toEqual(before)
    expect(fs.readFileSync(sync, 'utf8')).toBe('new synctex')
  })

  it('treats an untouched old PDF as not produced by a failed compile', async () => {
    const first = await compile()
    const pdf = path.join(buildDirOf(wb), 'main.pdf')
    const before = fs.readFileSync(pdf)
    fake.run = () => 1
    expect(await compile()).toMatchObject({ ok: false, hasPdf: true, pdfAt: first.pdfAt })
    expect(fs.readFileSync(pdf)).toEqual(before)
  })

  it('shows a complete PDF from a failed first compile with the error mark, and nothing when it is incomplete', async () => {
    fake.run = (args, cwd) => { outputs(args, cwd); return 1 }
    expect(await compile()).toMatchObject({ ok: false, hasPdf: true, pdfErrors: true })
    expect(manuscriptPdfBytes(wb)).not.toBeNull()
    fs.rmSync(buildDirOf(wb), { recursive: true, force: true })
    fake.run = (args, cwd) => { const out = outputs(args, cwd); write(path.join(out, 'main.pdf'), '%PDF-1.7\ncut off'); return 1 }
    expect(await compile()).toMatchObject({ ok: false, hasPdf: false, pdfState: 'missing' })
    expect(manuscriptPdfBytes(wb)).toBeNull()
  })

  it('forces unknown and stale inputs to rebuild, but permits a verified unchanged no-op', async () => {
    const forced: boolean[] = []
    fake.run = (args, cwd) => { forced.push(args.includes('-g')); outputs(args, cwd); return 0 }
    await compile()
    await compile()
    fs.appendFileSync(path.join(repo, 'macros.tex'), '% changed')
    await compile()
    expect(forced).toEqual([true, false, true])
  })

  it('preserves the last result if the compiler cannot start', async () => {
    await compile()
    const before = manuscriptPdfBytes(wb)
    fake.run = () => { throw new Error('spawn failed') }
    expect(await compile()).toMatchObject({ ok: false, hasPdf: true })
    expect(manuscriptPdfBytes(wb)).toEqual(before)
  })

  it('restores both outputs when writing compile metadata throws', async () => {
    const first = await compile()
    const pdf = path.join(buildDirOf(wb), 'main.pdf')
    const before = fs.readFileSync(pdf)
    fake.run = (args, cwd) => { outputs(args, cwd); write(pdf, '%PDF-1.7\nchanged\n%%EOF'); write(pdf.replace('.pdf', '.synctex.gz'), 'changed'); return 0 }
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).endsWith('/result.json')) throw new Error('metadata is not writable')
      return rename(from, to)
    })
    await expect(compile()).rejects.toThrow('metadata is not writable')
    expect(manuscriptPdfBytes(wb)).toEqual(before)
    expect(fs.readFileSync(pdf.replace('.pdf', '.synctex.gz'), 'utf8')).toBe('new synctex')
    expect(manuscriptPdfState(wb).lastSuccessAt).toBe(first.lastSuccessAt)
  })

  it('keeps legacy PDFs unknown without inventing a success time', () => {
    write(path.join(buildDirOf(wb), 'main.pdf'), '%PDF-1.7\n%%EOF')
    expect(manuscriptPdfState(wb)).toEqual({ hasPdf: true, pdfState: 'unknown' })
  })

  it('compares shared macros and settings actually injected into the wrapper', async () => {
    source('main.tex', '\\begin{document}\nA\n\\end{document}\n')
    let shared: string | null = '\\providecommand{\\X}{A}'
    let template = { ...BUILTIN_TEMPLATES[0]! }
    const read = (): ManuscriptCompileOptions => ({ ...options(), shared, template })
    expect(await compile(read)).toMatchObject({ pdfState: 'current' })
    shared = '\\providecommand{\\X}{B}'
    expect(manuscriptPdfState(wb, '', read()).pdfState).toBe('stale')
    shared = '\\providecommand{\\X}{A}'
    template = { ...template, settingExtra: '\\newcommand{\\Y}{Y}' }
    expect(manuscriptPdfState(wb, '', read()).pdfState).toBe('stale')
    fake.run = (args, cwd) => { outputs(args, cwd); shared = null; return 0 }
    expect(await compile(read)).toMatchObject({ ok: true, pdfState: 'stale' })
  })

  it('detects a newly created local bibliography that changes Markdown bibliography selection', async () => {
    source('workbench/research.yaml', 'title: Test\nsources:\n  bib: [refs.bib]\n')
    source('workbench/notes/test/note.md', '# Note\n[@a]\n')
    // 연구노트는 적지 않아도 메인 노트지만 key는 경로에서 ('' 아님)
    const key = pathKeyOf('workbench/notes/test/note.md')
    fake.run = (args, cwd) => { outputs(args, cwd, [path.join(buildDirOf(wb, key), 'rw-note-body.tex')], [path.join(repo, 'refs.bib')]); return 0 }
    const read = (): ManuscriptCompileOptions => ({ ...options(), template: BUILTIN_TEMPLATES[0]! })
    expect(await compile(read, key)).toMatchObject({ pdfState: 'current' })
    source('workbench/notes/test/local.bib', '@article{b,title={B}}')
    expect(manuscriptPdfState(wb, key, read()).pdfState).toBe('stale')
  })

  it('returns freshness through the manuscript API using the same compile choices', async () => {
    source('.git/HEAD', 'ref: refs/heads/main\n')
    source('main.tex', '\\begin{document}\nA\n\\end{document}\n')
    const configDir = path.join(root, 'config')
    const empty = path.join(root, 'empty')
    fs.mkdirSync(empty)
    write(path.join(configDir, 'config.yaml'), `study: ${empty}\nreviews: ${empty}\n`)
    const app = buildApp({ configDir, watch: false })
    try {
      const register = await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
      const url = `/api/researches/${register.json().id}/manuscript`
      expect((await app.inject({ method: 'POST', url: `${url}/compile?tpl=article&au=&date=none` })).json()).toMatchObject({ ok: true, pdfState: 'current' })
      expect((await app.inject({ method: 'GET', url: `${url}?tpl=article&au=&date=none` })).json()).toMatchObject({ pdfState: 'current', lastCompile: { ok: true } })
      expect((await app.inject({ method: 'GET', url: `${url}?tpl=article&au=&date=2026-10-04` })).json()).toMatchObject({ pdfState: 'stale' })
      const original = (await app.inject({ method: 'GET', url: `${url}/pdf` })).rawPayload
      fake.run = async (args, cwd) => {
        outputs(args, cwd)
        write(path.join(buildDirOf(wb), 'main.pdf'), 'partial')
        expect((await app.inject({ method: 'GET', url: `${url}/pdf` })).rawPayload).toEqual(original)
        return 1
      }
      expect((await app.inject({ method: 'POST', url: `${url}/compile?tpl=article&au=&date=none` })).json().ok).toBe(false)
      expect((await app.inject({ method: 'GET', url: `${url}/pdf` })).rawPayload).toEqual(original)
    } finally { await app.close() }
  })
})

describe('recorder input boundaries', () => {
  it('does not treat user texmf files as system packages or silently accept malformed records', () => {
    source('custom/texmf/input.tex', 'A')
    source('.conda/env/ignored.tex', 'ignored')
    const out = buildDirOf(wb)
    write(path.join(out, 'main.fls'), `PWD ${repo}\nINPUT custom/texmf/input.tex\nINPUT /usr/local/texlive/2025/texmf-dist/package.sty\nINPUT /usr/share/fonts/font.ttf\n`)
    write(path.join(out, 'main.fdb_latexmk'), '# Fdb version 4\n["pdflatex"]\n  "unparsed input" invalid record\n')
    expect(recordedInputs(repo, out, 'main')).toEqual({ files: [path.join(repo, 'custom/texmf/input.tex')], complete: false })
    const start = beginInputs(repo)
    expect(start.has(path.join(repo, '.conda/env/ignored.tex'))).toBe(false)
    expect(finishInputs(start, [path.join(root, 'outside.tex')]).complete).toBe(false)
  })
})
