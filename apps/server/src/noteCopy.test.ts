import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('연구노트·계산 노트 (원고 복사, 빈 노트)', () => {
  it.skipIf(process.platform !== 'darwin').each([
    { file: 'figure.png', refs: '\\includegraphics{figure}\n\\includegraphics{Figure}\n' },
    { file: 'part.tex', refs: '\\input{part}\n\\input{Part}\n' },
  ].map((c, i) => ({ ...c, caseId: i })))('맥에서 같은 $file의 여러 대소문자 참조는 한 번만 복사한다', async ({ file, refs, caseId }) => {
    const proj = makeRepo(`copy-dependency-alias-${caseId}`)
    const bytes = file.endsWith('.tex') ? Buffer.from('Included body\r\n') : Buffer.from([0, 127, 255])
    fs.writeFileSync(path.join(proj, file), bytes)
    fs.writeFileSync(path.join(proj, 'paper.tex'), `\\begin{document}\n${refs}\\end{document}\n`)
    fs.writeFileSync(path.join(proj, 'workbench/research.yaml'), 'title: Dependency alias\nsources:\n  manuscript: paper.tex — 논문 원고\n')
    const a = buildApp({ configDir: path.join(tmp, `config-copy-dependency-alias-${caseId}`) })
    try {
      const { id } = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json()
      const res = await a.inject({ method: 'POST', url: `/api/researches/${id}/notes`, payload: { kind: 'note', name: 'Dependency alias', from: '' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ copied: 2, skipped: [] })
      const dest = path.join(proj, 'workbench/notes/dependency-alias')
      expect(fs.readdirSync(dest).filter((f) => f.toLowerCase() === file)).toHaveLength(1)
      expect(fs.readFileSync(path.join(dest, file))).toEqual(bytes)
      expect(fs.readFileSync(path.join(proj, file))).toEqual(bytes)
      expect(fs.readFileSync(path.join(dest, 'main.tex'), 'utf8')).toContain(refs)
    } finally { await a.close() }
  })

  it.skipIf(process.platform !== 'darwin')('맥에서 대소문자만 다른 bib 참조가 같은 원본이면 한 번만 복사한다', async () => {
    const proj = makeRepo('copy-bib-alias')
    const paper = '\\begin{document}\n\\bibliography{Refs}\n\\end{document}\n'
    fs.writeFileSync(path.join(proj, 'paper.tex'), paper)
    fs.writeFileSync(path.join(proj, 'refs.bib'), '@article{ref, title={Original}}\n')
    fs.writeFileSync(path.join(proj, 'workbench/research.yaml'), 'title: Bib alias\nsources:\n  manuscript: paper.tex — 논문 원고\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-copy-bib-alias') })
    try {
      const { id } = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json()
      const before = fs.readFileSync(path.join(proj, 'refs.bib'))
      const res = await a.inject({ method: 'POST', url: `/api/researches/${id}/notes`, payload: { kind: 'note', name: 'Bib alias', from: '' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ copied: 2, skipped: [] })
      const dest = path.join(proj, 'workbench/notes/bib-alias')
      expect(fs.readdirSync(dest).filter((f) => f.toLowerCase().endsWith('.bib'))).toHaveLength(1)
      expect(fs.readFileSync(path.join(dest, 'Refs.bib'))).toEqual(before)
      expect(fs.readFileSync(path.join(proj, 'refs.bib'))).toEqual(before)
      expect(fs.readFileSync(path.join(proj, 'paper.tex'), 'utf8')).toBe(paper)
    } finally { await a.close() }
  })

  it.each(['main.tex', 'note.yaml', '.'].map((file, i) => ({ file, caseId: i })))('프로젝트 기호 경로가 새 노트의 $file과 겹치면 만들기 전에 멈춘다', async ({ file, caseId }) => {
    const proj = makeRepo(`copy-project-macros-${caseId}`)
    const own = path.join('workbench/notes/collision', file)
    fs.writeFileSync(path.join(proj, 'paper.tex'), '\\documentclass[prb]{revtex4-2}\n\\providecommand{\\copyMarker}{original}\n\\begin{document}\nOriginal body\n\\end{document}\n')
    fs.writeFileSync(path.join(proj, 'workbench/research.yaml'), `title: Project macros\nlatex-macros: ${own}\nsources:\n  manuscript: paper.tex — 논문 원고\n`)
    const a = buildApp({ configDir: path.join(tmp, `config-copy-project-macros-${caseId}`) })
    try {
      const { id } = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json()
      expect(fs.existsSync(path.join(proj, own))).toBe(false)
      const before = snapshot(proj)
      const res = await a.inject({ method: 'POST', url: `/api/researches/${id}/notes`, payload: { kind: 'note', name: 'Collision', from: '' } })
      expect(res.statusCode).toBe(409)
      expect(res.json().error).toContain('프로젝트 기호')
      expect(snapshot(proj)).toEqual(before)
    } finally { await a.close() }
  })

  it.each([
    { label: 'main.tex', file: 'main.tex' },
    { label: 'main.tex (new macros)', file: 'main.tex', existingMacros: false },
    { label: 'Main.tex', file: 'Main.tex' },
    { label: 'main.tex/part.tex', file: 'main.tex/part.tex' },
    { label: 'note.yaml', file: 'note.yaml' },
    { label: 'note.yaml/part.tex', file: 'note.yaml/part.tex' },
    { label: 'note-macros.tex', file: 'note-macros.tex', style: true },
    { label: 'note-macros.tex/part.tex', file: 'note-macros.tex/part.tex', style: true },
  ].map((c, i) => ({ ...c, caseId: i })))('복사 대상 $label이 생성 파일과 겹치면 쓰기 전에 멈춘다', async ({ file, style, existingMacros, caseId }) => {
    const proj = makeRepo(`copy-collision-${caseId}`)
    const w = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true })
      fs.writeFileSync(path.join(proj, rel), text)
    }
    // 머리의 기호와 서식도 복사 때 프로젝트 파일을 바꿀 수 있으므로 함께 보존을 확인한다.
    w('paper.tex', `\\documentclass[prb]{revtex4-2}\n\\newcommand{\\copyMarker}{original}\n${style ? '\\usepackage{copy-style}\n' : ''}\\begin{document}\nEntry body\n\\input{${file}}\n\\end{document}\n`)
    w(file, 'Included body\n')
    if (style) w('copy-style.sty', '% original style\n')
    if (existingMacros !== false) w('workbench/macros.tex', '% existing project macros\n')
    else fs.rmSync(path.join(proj, 'workbench/macros.tex'), { force: true })
    w('workbench/research.yaml', 'title: Collision\nsources:\n  manuscript: paper.tex — 논문 원고\n')
    const a = buildApp({ configDir: path.join(tmp, `config-${path.basename(proj)}`) })
    try {
      const { id } = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json()
      const before = snapshot(proj)
      const res = await a.inject({ method: 'POST', url: `/api/researches/${id}/notes`, payload: { kind: 'note', name: 'Collision', from: '' } })
      expect(res.statusCode).toBe(409)
      expect(res.json().error).toContain(file)
      expect(snapshot(proj)).toEqual(before)
      expect(fs.existsSync(path.join(proj, 'workbench/notes/collision'))).toBe(false)
    } finally { await a.close() }
  })

  it.each([
    { entry: 'main.tex', part: 'parts/main.tex' },
    { entry: 'Main.tex', part: 'parts/main.tex' },
    { entry: 'paper.tex', part: 'parts/main.tex' },
    { entry: 'paper.tex', part: 'note-macros.tex' },
  ].map((c, i) => ({ ...c, caseId: i })))('진입 파일 $entry와 포함 파일 $part는 각각 보존해 복사한다', async ({ entry, part, caseId }) => {
    const proj = makeRepo(`copy-safe-${caseId}`)
    fs.mkdirSync(path.dirname(path.join(proj, part)), { recursive: true })
    const paper = `\\begin{document}\n\nEntry body\n\\input{${part.replace(/\.tex$/, '')}}\n\n\\end{document}\n`
    fs.writeFileSync(path.join(proj, entry), paper)
    fs.writeFileSync(path.join(proj, part), 'Included body\r\n')
    fs.writeFileSync(path.join(proj, 'refs.bib'), '@article{ref, title={Original}}\n')
    fs.writeFileSync(path.join(proj, 'workbench/research.yaml'), `title: Safe copy\nsources:\n  manuscript: ${entry} — 논문 원고\n`)
    const a = buildApp({ configDir: path.join(tmp, `config-${path.basename(proj)}`) })
    try {
      const { id } = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json()
      const res = await a.inject({ method: 'POST', url: `/api/researches/${id}/notes`, payload: { kind: 'calc', name: 'Safe copy', from: '' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ path: 'workbench/calc/safe-copy/main.tex', copied: 3, skipped: [] })
      const dest = path.join(proj, 'workbench/calc/safe-copy')
      expect(fs.readFileSync(path.join(dest, 'main.tex'), 'utf8')).toBe(paper)
      for (const f of [part, 'refs.bib']) expect(fs.readFileSync(path.join(dest, f))).toEqual(fs.readFileSync(path.join(proj, f)))
      expect(fs.readFileSync(path.join(proj, entry), 'utf8')).toBe(paper)
      const notes = (await a.inject({ method: 'GET', url: `/api/researches/${id}/notes` })).json().notes
      expect(notes).toContainEqual(expect.objectContaining({ file: 'workbench/calc/safe-copy/main.tex' }))
    } finally { await a.close() }
  })

  it('원고를 복사하면 부르는 파일까지 workbench/notes/ 아래로 옮겨 연구노트가 되고, 원고는 그대로다', async () => {
    const proj = makeRepo('note-kinds')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    const paper = '\\documentclass{mypaper}\n\\usepackage{mymacros,amsmath}\n% \\input{commented}\n\\begin{document}\n\\input{sections/intro}\n\\includegraphics[width=1cm]{fig/a}\n\\bibliography{refs}\n\\end{document}\n'
    w('PRB.tex', paper)
    w('sections/intro.tex', '\\section{Intro}\n\\input{sections/detail.tex}\n')
    w('sections/detail.tex', 'detail\n')
    w('fig/a.pdf', 'pdf')
    w('refs.bib', '@article{k, title={T}}\n')
    w('mymacros.sty', '% macros\n')
    w('mypaper.cls', '% class\n')
    w('unrelated.tex', 'x\n')
    w('workbench/research.yaml', 'title: N\nsources:\n  manuscript: PRB.tex — 논문 원고\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-note-kinds') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const R = `/api/researches/${id}`

    const made = await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'note', name: 'Beta 증명 노트', from: '' } })
    expect(made.statusCode).toBe(200)
    const dir = path.join(proj, 'workbench/notes/beta')
    expect(made.json()).toMatchObject({ path: 'workbench/notes/beta/main.tex', kind: 'note', skipped: [] })
    // 본문만 가져오고 (머리는 앱의 서식이 붙인다), 원고 폴더의 .sty는 note-macros.tex에서 부른다
    expect(fs.readFileSync(path.join(dir, 'main.tex'), 'utf8')).toBe('\\begin{document}\n\n\\input{sections/intro}\n\\includegraphics[width=1cm]{fig/a}\n\\bibliography{refs}\n\n\\end{document}\n')
    expect(fs.readFileSync(path.join(dir, 'note-macros.tex'), 'utf8')).toContain('\\usepackage{mymacros}')
    for (const f of ['sections/intro.tex', 'sections/detail.tex', 'fig/a.pdf', 'refs.bib', 'mymacros.sty', 'mypaper.cls']) expect(fs.existsSync(path.join(dir, f))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'unrelated.tex'))).toBe(false)
    expect(fs.readFileSync(path.join(proj, 'PRB.tex'), 'utf8')).toBe(paper)

    const blank = (await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'calc', name: 'Conformal ratio numerics' } })).json()
    // 빈 노트는 Markdown + KaTeX (10/4 결정)
    expect(blank.path).toBe('workbench/calc/conformal-ratio-numerics/note.md')
    expect(fs.readFileSync(path.join(proj, blank.path), 'utf8')).toBe('## 목표\n\n## 방법\n\n## 결과\n\n')

    const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json()
    expect(list.map((m: { name: string; kind: string }) => [m.name, m.kind])).toEqual([['논문 원고', 'paper'], ['Beta 증명 노트', 'note'], ['Conformal ratio numerics', 'calc']])
    expect(list[1].parts.map((p: { file: string }) => p.file)).toEqual(['workbench/notes/beta/sections/intro.tex'])
    expect(list[2]).toMatchObject({ format: 'md', main: blank.path, parts: [{ title: '목표', line: 1 }, { title: '방법', line: 3 }, { title: '결과', line: 5 }] })
    // 같은 이름이면 폴더 이름에 -2
    expect((await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'note', name: 'Beta 증명 노트' } })).json().path).toBe('workbench/notes/beta-2/note.md')
    expect((await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'x', name: 'y' } })).statusCode).toBe(400)
    expect((await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'note', name: '' } })).statusCode).toBe(400)
    expect((await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'note', name: 'z', from: 'nope' } })).statusCode).toBe(404)
    // 원고는 본문만 남기기도 하지 않는다 (원고는 그대로 둔다)
    expect((await a.inject({ method: 'POST', url: `${R}/manuscript/body-only?ms=` })).statusCode).toBe(400)
    await a.close()
  })
})

/** 오류가 나기 전 파일뿐 아니라 새로 생긴 폴더도 없어야 한다. */
function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name), rel = path.relative(root, abs)
      if (e.isDirectory()) { files[rel + '/'] = ''; walk(abs) }
      else files[rel] = fs.readFileSync(abs).toString('base64')
    }
  }
  walk(root)
  return files
}
