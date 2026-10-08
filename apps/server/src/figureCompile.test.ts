import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { TIKZ_LIBS } from './figures.js'
import { pathKeyOf } from './manuscript.js'
import { app, R, repo, tmp, useSampleApp } from './testkit.js'

const fake = vi.hoisted(() => ({ calls: [] as { args: string[]; cwd: string; env: NodeJS.ProcessEnv }[] }))
vi.mock('node:child_process', async () => ({
  ...await vi.importActual<typeof import('node:child_process')>('node:child_process'),
  spawn: vi.fn((_command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
    const child = new EventEmitter() as EventEmitter & { kill(): void }
    child.kill = () => { child.emit('close', -1) }
    fake.calls.push({ args, ...options })
    queueMicrotask(() => {
      const out = args.find((a) => a.startsWith('-outdir='))?.slice(8) ?? options.cwd
      const base = args.find((a) => a.startsWith('-jobname='))?.slice(9) ?? 'main'
      fs.writeFileSync(path.join(out, `${base}.pdf`), '%PDF-1.7\nfigure compile\n%%EOF')
      fs.writeFileSync(path.join(out, `${base}.log`), '')
      fs.writeFileSync(path.join(out, `${base}.fls`), `PWD ${options.cwd}\nINPUT ${args.at(-1)}\n`)
      fs.writeFileSync(path.join(out, `${base}.fdb_latexmk`), '# Fdb version 4\n')
      child.emit('close', 0)
    })
    return child
  }),
}))

useSampleApp()
beforeEach(() => { fake.calls = [] })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/wZkAAAAASUVORK5CYII=', 'base64')
const write = (file: string, data: string | Buffer) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data) }
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8')

function fixture(id: string, block = false) {
  const own = path.join(repo, 'workbench/figures')
  const lib = path.join(tmp, `compile-library-${id}`)
  const shared = path.join(lib, 'figures')
  const note = path.join(repo, block ? `workbench/blocks/${id}.md` : `workbench/notes/${id}/note.md`)
  const diagram = `${id}-diagram`
  const photoName = `${id}-shared-photo`
  const content = `---\nid: ${id}\ntitle: Figure note\n---\n![[${diagram}]]\n\n![[${photoName}]]\n\n![[scope-clash]]\n\n![[vector]]\n\n![[full-document]]\n\n![[local.png]]\n\n![[unknown-name]]\n`
  write(note, content)
  write(path.join(path.dirname(note), 'local.png'), PNG)
  const originals = new Map<string, Buffer>([
    [path.join(own, `${id}.tikz`), Buffer.from('\\draw (0,0) -- (1,1);\n')],
    [path.join(own, `${id}-clash.png`), PNG],
    [path.join(shared, 'photo.png'), PNG],
    [path.join(shared, 'clash.png'), Buffer.from('shared clash')],
    [path.join(shared, 'local.png'), Buffer.from('library shadow')],
    [path.join(shared, 'vector.svg'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    [path.join(shared, 'full.tex'), Buffer.from('\\documentclass{article}\n\\begin{document}Full\\end{document}\n')],
  ])
  for (const [file, bytes] of originals) write(file, bytes)
  write(path.join(own, 'figures.yaml'), YAML.stringify({ [`${id}.tikz`]: { name: diagram }, [`${id}-clash.png`]: { name: 'scope-clash' } }))
  write(path.join(shared, 'figures.yaml'), YAML.stringify({ 'photo.png': { name: photoName }, 'clash.png': { name: 'scope-clash' }, 'full.tex': { name: 'full-document' } }))
  app.registry.setLibrary(lib)
  const key = pathKeyOf(path.relative(repo, note))
  const out = path.join(repo, 'workbench/.build', block ? id : `manuscript-${key}`)
  return { note, content, originals, own, shared, out, key, diagram, photoName }
}

function assertBuilt(f: ReturnType<typeof fixture>, id: string, bodyFile: string, mainFile: string) {
  const body = read(f.out, bodyFile)
  const main = read(f.out, mainFile)
  expect(body).toContain(`\\begin{tikzpicture}\n\\input{figure-library/sample-research/${id}.tikz}\n\\end{tikzpicture}`)
  expect(body).toContain('\\includegraphics[width=0.8\\linewidth]{figure-library/library/photo.png}')
  expect(body).toContain(`\\includegraphics[width=0.8\\linewidth]{figure-library/sample-research/${id}-clash.png}`)
  expect(body).toContain('\\fbox{\\texttt{vector}}')
  expect(body).toContain('\\fbox{\\texttt{full-document}}')
  expect(body).toContain('\\includegraphics[width=0.8\\linewidth]{local.png}')
  expect(body).toContain('\\includegraphics[width=0.8\\linewidth]{unknown-name}')
  expect(main).toContain('\\usepackage{tikz}')
  expect(main).toContain(`\\usetikzlibrary{${TIKZ_LIBS}}`)
  const bodyStart = main.includes('\\begin{document}') ? main.indexOf('\\begin{document}') : main.indexOf(`\\input{${bodyFile}}`)
  expect(main.indexOf('\\usepackage{tikz}')).toBeLessThan(bodyStart)
  for (const [source, bytes] of f.originals) {
    expect(fs.readFileSync(source)).toEqual(bytes)
    const scope = source.startsWith(f.own + path.sep) ? 'sample-research' : 'library'
    const dest = path.join(f.out, 'figure-library', scope, path.basename(source))
    if (scope === 'sample-research' || path.basename(source) === 'photo.png') expect(fs.readFileSync(dest)).toEqual(bytes)
    else expect(fs.existsSync(dest)).toBe(false)
  }
  expect(fs.readFileSync(f.note, 'utf8')).toBe(f.content)
  expect(fs.existsSync(path.join(path.dirname(f.note), 'figure-library'))).toBe(false)
  expect(fs.existsSync(path.join(f.own, 'figure-library'))).toBe(false)
  expect(fs.existsSync(path.join(f.shared, 'figure-library'))).toBe(false)
}

describe('Markdown 그림 라이브러리 컴파일 준비', () => {
  it('메인 노트의 원본을 빌드 폴더에만 두고 latexmk의 검색 경로에 연결한다', async () => {
    const id = 'figure-main'
    const f = fixture(id)
    const url = `${R}/manuscript/compile?ms=${f.key}&tpl=article`
    const result = await app.inject({ method: 'POST', url })
    expect(result.statusCode).toBe(200)
    expect(result.json()).toMatchObject({ ok: true, pdfState: 'current' })
    assertBuilt(f, id, 'rw-note-body.tex', 'rw-wrap-main.tex')
    expect(fake.calls.at(-1)?.cwd).toBe(path.dirname(f.note))
    expect(fake.calls.at(-1)?.env.TEXINPUTS).toBe(`${f.out}:${path.dirname(f.note)}:`)
    // 원고 폴더(받은 저장소)의 latexmkrc는 읽지 않는다
    expect(fake.calls.at(-1)?.args[0]).toBe('-norc')
  })

  it.each(['', '?tpl=article'])('보조 노트도 기본·선택 서식에서 같은 원본을 쓴다 (%s)', async (query) => {
    const id = query ? 'figure-block-picked' : 'figure-block-default'
    const f = fixture(id, true)
    const result = await app.inject({ method: 'POST', url: `${R}/blocks/${id}/compile${query}` })
    expect(result.statusCode).toBe(200)
    expect(result.json()).toMatchObject({ ok: true, hasPdf: true })
    assertBuilt(f, id, 'block-body.tex', 'main.tex')
    expect(fake.calls.at(-1)?.cwd).toBe(f.out)
  })

  it('그림 패키지가 없는 보조 노트 서식에도 PNG 원본을 넣을 준비를 한다', async () => {
    const id = 'figure-block-png'
    const f = fixture(id, true)
    write(f.note, `![[${f.photoName}]]\n`)
    const preamble = path.join(repo, 'workbench/preamble.tex')
    const before = fs.readFileSync(preamble)
    try {
      write(preamble, '\\usepackage{amsmath}\n')
      const result = await app.inject({ method: 'POST', url: `${R}/blocks/${id}/compile` })
      expect(result.json()).toMatchObject({ ok: true, hasPdf: true })
      const main = read(f.out, 'main.tex')
      expect(main).toContain('\\@ifpackageloaded{graphicx}{}{\\usepackage{graphicx}}')
      expect(main.indexOf('\\usepackage{graphicx}')).toBeLessThan(main.indexOf('\\begin{document}'))
      expect(main).not.toContain('\\usepackage{tikz}')
      expect(read(f.out, 'block-body.tex')).toContain('\\includegraphics[width=0.8\\linewidth]{figure-library/library/photo.png}')
      expect(fs.readFileSync(path.join(f.out, 'figure-library/library/photo.png'))).toEqual(PNG)
      expect(fs.readFileSync(f.note, 'utf8')).toBe(`![[${f.photoName}]]\n`)
      expect(fs.readFileSync(preamble, 'utf8')).toBe('\\usepackage{amsmath}\n')
    } finally { write(preamble, before) }
  })

  it.each([false, true])('확장자를 생략한 노트 첨부 파일도 라이브러리보다 먼저 쓴다 (보조 노트: %s)', async (block) => {
    const id = block ? 'figure-block-local-stem' : 'figure-main-local-stem'
    const f = fixture(id, block)
    write(f.note, `![[${f.photoName}]]\n`)
    write(path.join(path.dirname(f.note), `${f.photoName}.png`), PNG)
    const url = block ? `${R}/blocks/${id}/compile` : `${R}/manuscript/compile?ms=${f.key}&tpl=article`
    expect((await app.inject({ method: 'POST', url })).json().ok).toBe(true)
    expect(read(f.out, block ? 'block-body.tex' : 'rw-note-body.tex')).toContain(`\\includegraphics[width=0.8\\linewidth]{${f.photoName}}`)
    expect(fs.existsSync(path.join(f.out, 'figure-library/library/photo.png'))).toBe(false)
  })

  it.each([false, true])('생성 그림 경로와 겹치는 노트 첨부 파일도 원래 파일을 가리킨다 (보조 노트: %s)', async (block) => {
    const id = block ? 'figure-block-collision' : 'figure-main-collision'
    const f = fixture(id, block)
    const local = path.join(path.dirname(f.note), 'figure-library/library/photo.png')
    write(local, Buffer.from('local figure'))
    write(f.note, `![[figure-library/library/photo.png]]\n\n![[${f.photoName}]]\n`)
    const url = block ? `${R}/blocks/${id}/compile` : `${R}/manuscript/compile?ms=${f.key}&tpl=article`
    expect((await app.inject({ method: 'POST', url })).json().ok).toBe(true)
    const body = read(f.out, block ? 'block-body.tex' : 'rw-note-body.tex')
    expect(body).toContain(`\\includegraphics[width=0.8\\linewidth]{${local}}`)
    expect(body).toContain('\\includegraphics[width=0.8\\linewidth]{figure-library/library/photo.png}')
    expect(fs.readFileSync(local, 'utf8')).toBe('local figure')
    expect(fs.readFileSync(path.join(f.out, 'figure-library/library/photo.png'))).toEqual(PNG)
  })

  it('복사된 그림의 원본 수정과 이름 해석 변경을 PDF 최신 상태에 반영한다', async () => {
    const f = fixture('figure-freshness')
    const url = `${R}/manuscript?ms=${f.key}&tpl=article`
    const compileUrl = `${R}/manuscript/compile?ms=${f.key}&tpl=article`
    const state = async () => (await app.inject({ method: 'GET', url })).json().pdfState
    expect((await app.inject({ method: 'POST', url: compileUrl })).json().pdfState).toBe('current')
    write(path.join(f.shared, 'photo.png'), Buffer.concat([PNG, Buffer.from('changed')]))
    expect(await state()).toBe('stale')
    write(path.join(f.shared, 'photo.png'), PNG)
    expect(await state()).toBe('current')
    // 노트 옆에 같은 이름의 파일을 만들면 라이브러리 대신 그 파일을 쓰므로 다시 컴파일해야 한다.
    write(path.join(path.dirname(f.note), f.diagram), PNG)
    expect(await state()).toBe('stale')
  })
})
