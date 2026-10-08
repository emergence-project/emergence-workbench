// 노트 내보내기: 노트 하나 또는 고른 노트 여럿을 컴파일되는 LaTeX 폴더 zip으로
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { innerBody } from './noteBody.js'
import { quietTitles } from './noteExport.js'
import { hasLatex, makeRepo, tmp, useSampleApp } from './testkit.js'
import { crc32 } from './zip.js'
import { TIKZ_LIBS } from './figures.js'

useSampleApp()

const PAPER = '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n'
const BODY_A = '\\begin{document}\n\\section{Proof}\\label{sec:proof}\nThe claim \\ADA{check}.\n\\includegraphics[width=1cm]{fig/a}\n\\end{document}\n'
const BODY_B = '\\begin{document}\n\\title{Numerics}\n\\maketitle\n\\section{Numbers}\nSee Sec.~\\ref{sec:proof}.\n\\end{document}\n'

async function setup(name: string, template = 'article') {
  const proj = makeRepo(name)
  const w = (rel: string, text: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
  w('paper.tex', PAPER)
  w('sections/intro.tex', '\\section{Intro}\nHello.\n')
  w('workbench/notes/proof/main.tex', BODY_A)
  w('workbench/notes/proof/note.yaml', 'name: 증명 노트\n')
  // 1×1 PNG
  w('workbench/notes/proof/fig/a.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
  w('workbench/calc/num/main.tex', BODY_B)
  w('workbench/calc/num/note.yaml', 'name: 계산 노트\n')
  w('workbench/macros.tex', '\\newcommand{\\ADA}[1]{(ADA) #1}\n')
  w('workbench/research.yaml', `title: Sample Beta\nsources:\n  manuscript: paper.tex — 논문 원고\nlatex-template: ${template}\n`)
  const a = buildApp({ configDir: path.join(tmp, `config-${name}`) })
  const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
  const R = `/api/researches/${id}`
  const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string; ownHeader?: boolean }[]
  const key = (n: string) => list.find((m) => m.name === n)!.key
  const get = async (keys: string[], au?: string[]) => {
    const res = await a.inject({ method: 'GET', url: `${R}/export?${[...keys.map((k) => `ms=${encodeURIComponent(k)}`), ...(au ?? []).map((x) => `au=${encodeURIComponent(x)}`)].join('&')}` })
    return res
  }
  /** zip을 풀어 둔 폴더 */
  const unzip = (buf: Buffer, to: string) => {
    const dir = path.join(tmp, to)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'x.zip'), buf)
    execFileSync('unzip', ['-q', 'x.zip'], { cwd: dir })
    fs.rmSync(path.join(dir, 'x.zip'))
    return dir
  }
  return { a, proj, key, get, unzip, list, R }
}

const tree = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.relative(dir, path.join(d.parentPath, d.name))).sort()

async function setupFigureExport(name: string) {
  const ctx = await setup(name)
  const { a, proj } = ctx
  const lib = path.join(tmp, `${name}-library`)
  fs.mkdirSync(path.join(lib, 'figures'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), '')
  a.registry.setLibrary(lib)
  const own = path.join(proj, 'workbench/figures')
  fs.mkdirSync(own, { recursive: true })
  const png = fs.readFileSync(path.join(proj, 'workbench/notes/proof/fig/a.png'))
  const originals = {
    'bare.tikz': Buffer.from('\\draw (0,0) -- (1,1);\r\n'),
    'clash.tex': Buffer.from('\\begin{tikzpicture}\n\\draw (0,0) circle (0.2);\n\\end{tikzpicture}\n'),
    'picture.png': png,
    'vector.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>\n'),
  }
  for (const f of ['bare.tikz', 'clash.tex'] as const) fs.writeFileSync(path.join(own, f), originals[f])
  for (const f of ['picture.png', 'vector.svg'] as const) fs.writeFileSync(path.join(lib, 'figures', f), originals[f])
  fs.writeFileSync(path.join(own, 'figures.yaml'), 'bare.tikz: {name: Project drawing}\nclash.tex: {name: Shared name}\n')
  fs.writeFileSync(path.join(lib, 'figures/figures.yaml'), 'clash.tex: {name: Shared name}\npicture.png: {name: Shared picture}\n')
  fs.writeFileSync(path.join(lib, 'figures/clash.tex'), '\\draw (0,0) -- (9,9);\n')
  fs.writeFileSync(path.join(lib, 'figures/local.png'), Buffer.from('library version must lose'))
  fs.writeFileSync(path.join(lib, 'figures/full.tex'), '\\documentclass{standalone}\n\\begin{document}Full\\end{document}\n')
  const source = '## Figures\r\n\r\n![[Project drawing|300]]\r\n\r\n![[Shared picture]]\r\n\r\n![[vector.svg]]\r\n\r\n![[Shared name]]\r\n\r\n![[local.png]]\r\n\r\n![[full]]\r\n'
  fs.writeFileSync(path.join(proj, 'workbench/notes/proof/note.md'), source)
  fs.writeFileSync(path.join(proj, 'workbench/calc/num/note.md'), source)
  fs.writeFileSync(path.join(proj, 'workbench/blocks/figure-aux.md'), `---\r\nid: figure-aux\r\ntitle: Figure aux\r\n---\r\n${source}`)
  for (const dir of ['notes/proof', 'calc/num', 'blocks']) fs.writeFileSync(path.join(proj, 'workbench', dir, 'local.png'), png)
  const list = (await a.inject({ method: 'GET', url: `${ctx.R}/manuscripts` })).json() as { key: string; name: string }[]
  const key = (title: string) => list.find((m) => m.name === title)!.key
  const snapshot = () => [proj, lib].map((dir) => Object.fromEntries(tree(dir).map((f) => [f, fs.readFileSync(path.join(dir, f)).toString('base64')])))
  const exportTo = async (kind: 'one' | 'many' | 'block', suffix: string) => {
    const res = kind === 'block'
      ? await a.inject({ method: 'GET', url: `${ctx.R}/export?block=figure-aux` })
      : await ctx.get(kind === 'one' ? [key('증명 노트')] : [key('증명 노트'), key('계산 노트')])
    expect(res.statusCode).toBe(200)
    const dir = ctx.unzip(res.rawPayload, `${name}-${suffix}`)
    return path.join(dir, fs.readdirSync(dir)[0]!)
  }
  return { ...ctx, lib, originals, snapshot, exportTo, scope: ctx.R.split('/').at(-1)! }
}

describe('노트 내보내기', () => {
  it.each(['one', 'many', 'block'] as const)('%s: 그림 라이브러리 원본·우선순위·변환 안내를 담고 원문은 보존한다', async (kind) => {
    const { a, originals, snapshot, exportTo, scope } = await setupFigureExport(`export-figures-${kind}`)
    try {
      const before = snapshot()
      const root = await exportTo(kind, 'zip')
      const main = fs.readFileSync(path.join(root, 'main.tex'), 'utf8')
      const bodies = kind === 'many'
        ? ['notes/note/body.tex', 'notes/note-2/body.tex'].map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
        : [main]
      expect(main).toContain('\\usepackage{tikz}')
      expect(main).toContain(`\\usetikzlibrary{${TIKZ_LIBS}}`)
      for (const body of bodies) {
        expect(body).toContain(`\\begin{tikzpicture}\n\\input{figure-library/${scope}/bare.tikz}\n\\end{tikzpicture}`)
        expect(body).toContain(`\\begin{center}\n\\input{figure-library/${scope}/clash.tex}\n\\end{center}`)
        expect(body).toContain('\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{figure-library/library/picture.png}\n\\end{center}')
        expect(body).toContain('\\includegraphics[width=0.8\\linewidth]{local.png}')
        expect(body).toContain('\\fbox{\\texttt{vector.svg}}')
        expect(body).toContain('\\fbox{\\texttt{full}}')
      }
      for (const [file, bytes] of Object.entries(originals)) {
        const target = `figure-library/${file.endsWith('.png') || file.endsWith('.svg') ? 'library' : scope}/${file}`
        expect(fs.readFileSync(path.join(root, target))).toEqual(bytes)
        expect(tree(root).filter((f) => f === target)).toHaveLength(1)
      }
      for (const file of ['clash.tex', 'local.png', 'full.tex']) expect(tree(root)).not.toContain(`figure-library/library/${file}`)
      const readme = fs.readFileSync(path.join(root, 'README.txt'), 'utf8')
      expect(readme).toContain('SVG는 LaTeX에 바로 넣을 수 없어 이름 상자로 두었습니다. PDF로 바꿔 넣으세요: figure-library/library/vector.svg')
      expect(readme).toContain('\\documentclass')
      expect(readme).toContain('figure-library/library/full.tex')
      expect(snapshot()).toEqual(before)
    } finally { await a.close() }
  })

  it.skipIf(!hasLatex)('TikZ·PNG가 있는 단일·여러·보조 Markdown 노트 zip이 그대로 PDF로 컴파일된다', async () => {
    const { a, snapshot, exportTo } = await setupFigureExport('export-figures-build')
    try {
      const before = snapshot()
      for (const kind of ['one', 'many', 'block'] as const) {
        const root = await exportTo(kind, kind)
        execFileSync('latexmk', ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { cwd: root, stdio: 'pipe' })
        expect(fs.statSync(path.join(root, 'main.pdf')).size).toBeGreaterThan(0)
      }
      expect(snapshot()).toEqual(before)
    } finally { await a.close() }
  }, 180_000)

  it('crc32는 표준 값', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('본문만 남기기와 제목 줄 빼기', () => {
    expect(innerBody(BODY_A)).toBe('\\section{Proof}\\label{sec:proof}\nThe claim \\ADA{check}.\n\\includegraphics[width=1cm]{fig/a}\n')
    expect(innerBody('% \\begin{document}\nplain\n')).toBe('% \\begin{document}\nplain\n')
    expect(quietTitles('\\title{X}\n\\maketitle\n\\title{open\nrest}')).toBe('% (모아 내보내기에서 뺌) \\title{X}\n% (모아 내보내기에서 뺌) \\maketitle\n\\title{open\nrest}')
  })

  it('머리가 있는 노트 하나: 쓰이는 파일을 그대로 묶는다', async () => {
    const { a, key, get, unzip } = await setup('export-full')
    const res = await get([key('논문 원고')])
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/zip')
    expect(String(res.headers['content-disposition'])).toContain(`filename*=UTF-8''${encodeURIComponent('논문 원고.zip')}`)
    const dir = unzip(res.rawPayload, 'full')
    const root = path.join(dir, 'note')
    expect(tree(root)).toEqual(['README.txt', 'paper.tex', 'sections/intro.tex'])
    expect(fs.readFileSync(path.join(root, 'paper.tex'), 'utf8')).toBe(PAPER)
    await a.close()
  })

  it('본문만 있는 노트 하나: 서식의 머리·기호·제목을 붙인 main.tex, 노트 폴더는 그대로', async () => {
    const { a, proj, key, get, unzip } = await setup('export-body')
    const res = await get([key('증명 노트')])
    expect(res.statusCode).toBe(200)
    const root = path.join(unzip(res.rawPayload, 'body'), 'note')
    expect(tree(root)).toEqual(['README.txt', 'fig/a.png', 'macros.tex', 'main.tex', 'setting.tex'])
    const main = fs.readFileSync(path.join(root, 'main.tex'), 'utf8')
    const at = (s: string) => main.indexOf(s)
    expect(at('\\documentclass')).toBeGreaterThan(0)
    expect(at('\\input{setting}')).toBeLessThan(at('\\input{macros}'))
    expect(at('\\input{macros}')).toBeLessThan(at('\\begin{document}'))
    // 연구노트는 저자·소속 없이 노트 이름만 작게 두고 바로 본문 (10/4 16:53 사용자)
    expect(main).not.toContain('\\title{')
    expect(main).not.toContain('\\author')
    expect(at('{\\centering\\large\\bfseries 증명 노트\\par}')).toBeGreaterThan(at('\\begin{document}'))
    expect(at('\\section{Proof}')).toBeGreaterThan(at('\\bfseries 증명 노트'))
    expect(main.match(/\\begin\{document\}/g)).toHaveLength(1)
    expect(fs.readFileSync(path.join(proj, 'workbench/notes/proof/main.tex'), 'utf8')).toBe(BODY_A)
    // 본문에 \maketitle이 있으면 제목을 더 넣지 않는다
    const b = fs.readFileSync(path.join(unzip((await get([key('계산 노트')])).rawPayload, 'body-b'), 'note/main.tex'), 'utf8')
    expect(b.match(/\\maketitle/g)).toHaveLength(1)
    expect(b).toContain('\\title{Numerics}')
    await a.close()
  })

  it('여러 노트: main.tex 하나에 고른 순서대로 \\subimport, 파일은 notes/<폴더>/ 아래', async () => {
    const { a, key, get, unzip } = await setup('export-many')
    const res = await get([key('증명 노트'), key('계산 노트'), key('논문 원고')])
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-disposition'])).toContain(encodeURIComponent('Sample Beta 노트 3개.zip'))
    const root = path.join(unzip(res.rawPayload, 'many'), 'sample-beta-notes')
    expect(tree(root)).toEqual(['README.txt', 'macros.tex', 'main.tex', 'notes/note-2/body.tex', 'notes/note-3/body.tex', 'notes/note-3/sections/intro.tex', 'notes/note/body.tex', 'notes/note/fig/a.png', 'setting.tex'])
    const main = fs.readFileSync(path.join(root, 'main.tex'), 'utf8')
    expect(main).toContain('\\usepackage{import}')
    expect(main.indexOf('\\subimport{notes/note/}{body}')).toBeLessThan(main.indexOf('\\subimport{notes/note-2/}{body}'))
    expect(main.indexOf('\\subimport{notes/note-2/}{body}')).toBeLessThan(main.indexOf('\\subimport{notes/note-3/}{body}'))
    const b = fs.readFileSync(path.join(root, 'notes/note-2/body.tex'), 'utf8')
    expect(b).toContain('% (모아 내보내기에서 뺌) \\maketitle')
    expect(b).not.toContain('\\begin{document}')
    // 머리가 있던 원고는 머리를 빼고 본문만
    expect(fs.readFileSync(path.join(root, 'notes/note-3/body.tex'), 'utf8')).not.toContain('\\documentclass')
    // 논문 원고가 섞이면 저자를 붙이고, 연구·계산 노트만 모으면 저자 없이 바로 본문
    expect(main).toContain('\\author')
    const notesOnly = fs.readFileSync(path.join(unzip((await get([key('증명 노트'), key('계산 노트')])).rawPayload, 'notes-only'), 'sample-beta-notes/main.tex'), 'utf8')
    expect(notesOnly).not.toContain('\\author')
    expect(notesOnly).not.toContain('\\title{')
    expect(notesOnly.indexOf('\\begin{document}')).toBeLessThan(notesOnly.indexOf('\\subimport{notes/note/}{body}'))
    expect((await get([])).statusCode).toBe(400)
    expect((await get(['nope'])).statusCode).toBe(404)
    await a.close()
  })

  it('저자는 내보내기에서 고른 사람만 고른 차례로 (10/4 17:06), 고르지 않으면 설정 차례 그대로', async () => {
    const { a, key, get, unzip } = await setup('export-authors')
    await a.inject({ method: 'PUT', url: '/api/authors', payload: { authors: [{ name: 'Ann A', affiliations: ['X'] }, { name: 'Bo B', affiliations: ['Y'] }, { name: 'Cy C', affiliations: ['Z'] }] } })
    const keys = [key('증명 노트'), key('논문 원고')]
    const main = async (au: string[] | undefined, to: string) => fs.readFileSync(path.join(unzip((await get(keys, au)).rawPayload, to), 'sample-beta-notes/main.tex'), 'utf8')
    const names = (t: string) => ['Ann A', 'Bo B', 'Cy C'].filter((n) => t.includes(n)).sort((x, y) => t.indexOf(x) - t.indexOf(y))
    expect(names(await main(undefined, 'au-default'))).toEqual(['Ann A', 'Bo B', 'Cy C'])
    expect(names(await main(['Cy C', 'Ann A'], 'au-picked'))).toEqual(['Cy C', 'Ann A'])
    // 저자 목록에 없는 사람은 네트워킹에서 찾아 소속 없이 넣는다
    await a.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [{ name: 'Dee D', aliases: ['D. D'] }] } })
    const withPerson = await main(['D. D', 'Ann A', 'Nobody'], 'au-person')
    expect(withPerson.indexOf('Dee D')).toBeGreaterThan(0)
    expect(withPerson.indexOf('Dee D')).toBeLessThan(withPerson.indexOf('Ann A'))
    expect(withPerson).not.toContain('Nobody')
    expect(names(await main([''], 'au-none'))).toEqual([])
    await a.close()
  })

  it('내보내기 상자에서 고른 서식·저자·날짜 (10/4 반려 "옵션으로 선택하게하자")', async () => {
    const { a, key, unzip, list, R } = await setup('export-options')
    await a.inject({ method: 'PUT', url: '/api/authors', payload: { authors: [{ name: 'Ann A', affiliations: ['X'] }, { name: 'Bo B', affiliations: ['Y'] }] } })
    // 상자의 서식 목록과 프로젝트 서식 (research.yaml의 latex-template:)
    const opts = (await a.inject({ method: 'GET', url: `${R}/export/options` })).json() as { template: string; templates: { id: string; name: string; kind: string }[] }
    expect(opts.template).toBe('article')
    expect(opts.templates.map((t) => t.id)).toEqual(expect.arrayContaining(['article', 'prb']))
    // 머리가 있어 그대로 묶는 노트는 화면에 알린다
    expect(list.find((m) => m.name === '논문 원고')).toMatchObject({ ownHeader: true })
    expect(list.find((m) => m.name === '증명 노트')).not.toHaveProperty('ownHeader')
    const main = async (keys: string[], q: string, to: string) => {
      const res = await a.inject({ method: 'GET', url: `${R}/export?${keys.map((k) => `ms=${encodeURIComponent(k)}`).join('&')}&${q}` })
      expect(res.statusCode).toBe(200)
      const dir = unzip(res.rawPayload, to)
      const root = path.join(dir, fs.readdirSync(dir)[0]!)
      return { tex: fs.readFileSync(path.join(root, 'main.tex'), 'utf8'), readme: fs.readFileSync(path.join(root, 'README.txt'), 'utf8') }
    }
    // 서식: 고른 서식의 머리
    const prb = await main([key('증명 노트')], 'tpl=prb', 'opt-prb')
    expect(prb.tex).toContain('revtex')
    expect(prb.tex).toContain('서식 "')
    expect((await a.inject({ method: 'GET', url: `${R}/export?ms=${encodeURIComponent(key('증명 노트'))}&tpl=nope` })).statusCode).toBe(404)
    // 연구노트에 저자를 넣으면 제목·저자 줄을 두고, 날짜를 고르지 않았으면 \date{}
    const withAu = await main([key('증명 노트')], 'au=Bo%20B&au=Ann%20A&date=none', 'opt-au')
    expect(withAu.tex).toContain('\\title{증명 노트}')
    expect(withAu.tex.indexOf('Bo B')).toBeLessThan(withAu.tex.indexOf('Ann A'))
    expect(withAu.tex).toContain('\\date{}')
    expect(withAu.tex).toContain('\\maketitle')
    expect(withAu.tex).not.toContain('\\let\\maketitle\\relax')
    expect(withAu.readme).toContain('저자: Bo B, Ann A')
    // 저자 없이 날짜만: 노트 이름 아래 날짜 한 줄
    const dated = await main([key('증명 노트')], 'au=&date=2026-10-04', 'opt-date')
    expect(dated.tex).not.toContain('\\author')
    expect(dated.tex).toContain('{\\centering\\large\\bfseries 증명 노트\\par}{\\centering\\small 2026-10-04\\par}\\bigskip')
    // 여러 노트: 원고가 섞이면 고른 날짜, 저자를 빼도 제목 줄은 둔다
    const many = [key('증명 노트'), key('논문 원고')]
    const none = await main(many, 'au=&date=none', 'opt-many-none')
    expect(none.tex).not.toContain('\\author')
    expect(none.tex).toContain('\\date{}')
    expect(none.tex).toContain('\\maketitle')
    expect((await main(many, 'date=today', 'opt-many-today')).tex).toContain('\\date{\\today}')
    // 연구·계산 노트만 모아도 저자를 넣으면 제목·저자 줄, 날짜만이면 맨 위에 날짜 한 줄
    const notes = [key('증명 노트'), key('계산 노트')]
    expect((await main(notes, 'au=Ann%20A', 'opt-notes-au')).tex).toContain('Ann A')
    const notesDated = (await main(notes, 'date=2026-01-02', 'opt-notes-date')).tex
    expect(notesDated).not.toContain('\\author')
    expect(notesDated).toContain('{\\centering\\small 2026-01-02\\par}\\bigskip')
    expect((await a.inject({ method: 'GET', url: `${R}/export?ms=${encodeURIComponent(key('증명 노트'))}&date=tomorrow` })).statusCode).toBe(400)
    await a.close()
  })

  it('Markdown 보조 노트: 같은 서식·저자·날짜로 그림·참고문헌을 묶고 원문과 기록은 그대로', async () => {
    const { a, proj, R, unzip } = await setup('export-block-md')
    const blocks = path.join(proj, 'workbench/blocks')
    const source = '---\r\nid: aux-md\r\ntitle: 보조 노트\r\nstatus: in-progress\r\n---\r\n## 목표\r\n\r\n$E = 1$ [@aux2026].\r\n\r\n![그림](aux.png)\r\n\r\n```tex\r\n\\documentclass{article}\r\n```\r\n'
    fs.writeFileSync(path.join(blocks, 'aux-md.md'), source)
    fs.copyFileSync(path.join(proj, 'workbench/notes/proof/fig/a.png'), path.join(blocks, 'aux.png'))
    fs.writeFileSync(path.join(blocks, 'refs.bib'), '@article{aux2026, title={Auxiliary note}, author={Ann A}, year={2026}}\n')
    fs.mkdirSync(path.join(proj, 'workbench/comments'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'workbench/comments/block-aux-md.md'), '메모와 하이라이트는 원래 자리에 둡니다.\n')
    await a.inject({ method: 'PUT', url: '/api/authors', payload: { authors: [{ name: 'Ann A', affiliations: ['X'] }] } })
    const snapshot = () => Object.fromEntries(tree(proj).map((f) => [f, fs.readFileSync(path.join(proj, f)).toString('base64')]))
    const before = snapshot()
    const res = await a.inject({ method: 'GET', url: `${R}/export?block=aux-md&tpl=prb&au=Ann%20A&date=2026-10-06` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/zip')
    expect(String(res.headers['content-disposition'])).toContain(encodeURIComponent('보조 노트.zip'))
    const root = path.join(unzip(res.rawPayload, 'block-md'), 'note')
    const main = fs.readFileSync(path.join(root, 'main.tex'), 'utf8')
    expect(main).toContain('revtex')
    expect(main).toContain('\\title{보조 노트}')
    expect(main).toContain('Ann A')
    expect(main).toContain('\\date{2026-10-06}')
    expect(main).toContain('\\section{목표}')
    expect(main).toContain('\\begin{verbatim}')
    expect(main).toContain('\\bibliography{block-files/blocks/refs}')
    expect(main).not.toContain('status: in-progress')
    expect(tree(root)).toEqual(expect.arrayContaining(['main.tex', 'setting.tex', 'block-files/blocks/aux.png', 'block-files/blocks/refs.bib', 'block-files/preamble.tex']))
    expect(tree(root)).not.toContain('aux-md.md')
    expect(snapshot()).toEqual(before)
    await a.close()
  })

  it('LaTeX 보조 노트: 본문은 감싸고 자체 머리가 있으면 그대로 묶는다', async () => {
    const { a, proj, R, unzip } = await setup('export-block-tex')
    const blocks = path.join(proj, 'workbench/blocks')
    fs.mkdirSync(path.join(blocks, 'sections'), { recursive: true })
    const body = '% ---\n% id: aux-tex\n% title: Aux tex\n% ---\n\\section{Auxiliary}\\input{sections/aux}\n'
    const part = 'The claim \\ADA{check}.\n'
    fs.writeFileSync(path.join(blocks, 'aux-tex.tex'), body)
    fs.writeFileSync(path.join(blocks, 'sections/aux.tex'), part)
    const get = () => a.inject({ method: 'GET', url: `${R}/export?block=aux-tex` })
    const res = await get()
    expect(res.statusCode).toBe(200)
    const root = path.join(unzip(res.rawPayload, 'block-tex'), 'aux-tex')
    const main = fs.readFileSync(path.join(root, 'main.tex'), 'utf8')
    expect(main).toContain('\\documentclass')
    expect(main).toContain(body)
    expect(main).not.toContain('\\author')
    expect(fs.readFileSync(path.join(root, 'block-files/blocks/sections/aux.tex'), 'utf8')).toBe(part)
    expect(fs.readFileSync(path.join(blocks, 'aux-tex.tex'), 'utf8')).toBe(body)

    const full = `% ---\n% title: Aux tex\n% ---\n${PAPER.replace('sections/intro', 'sections/aux')}`
    fs.writeFileSync(path.join(blocks, 'aux-tex.tex'), full)
    const own = path.join(unzip((await get()).rawPayload, 'block-tex-own'), 'aux-tex')
    expect(fs.readFileSync(path.join(own, 'aux-tex.tex'), 'utf8')).toBe(full)
    expect(tree(own)).toEqual(['README.txt', 'aux-tex.tex', 'sections/aux.tex'])
    expect(fs.readFileSync(path.join(blocks, 'aux-tex.tex'), 'utf8')).toBe(full)
    await a.close()
  })

  it('보조 노트 내보내기는 없는 대상·잘못된 id·바깥 링크·섞인 대상을 거절한다', async () => {
    const { a, proj, R, key, unzip } = await setup('export-block-invalid')
    const get = (q: string) => a.inject({ method: 'GET', url: `${R}/export?${q}` })
    expect((await get('block=missing')).statusCode).toBe(404)
    expect((await get('block=..%2Foutside')).statusCode).toBe(400)
    expect((await get('block=')).statusCode).toBe(400)
    expect((await get('block=one&block=two')).statusCode).toBe(400)
    expect((await get(`block=one&ms=${encodeURIComponent(key('증명 노트'))}`)).statusCode).toBe(400)
    const outside = path.join(tmp, 'outside-block.md')
    fs.writeFileSync(outside, '원본 그대로\n')
    fs.symlinkSync(outside, path.join(proj, 'workbench/blocks/outside.md'))
    expect((await get('block=outside')).statusCode).toBe(403)
    fs.symlinkSync(outside, path.join(proj, 'workbench/blocks/linked.tex'))
    fs.writeFileSync(path.join(proj, 'workbench/blocks/safe.tex'), '\\input{linked}\n')
    const safe = await get('block=safe')
    expect(safe.statusCode).toBe(200)
    const root = path.join(unzip(safe.rawPayload, 'block-safe'), 'safe')
    expect(tree(root)).not.toContain('block-files/blocks/linked.tex')
    expect(fs.readFileSync(path.join(root, 'README.txt'), 'utf8')).toContain('blocks/linked.tex')
    expect(fs.readFileSync(outside, 'utf8')).toBe('원본 그대로\n')
    await a.close()
  })

  it.skipIf(!hasLatex).each(['md', 'tex'])('보조 노트 %s: 공통 머리·기호·그림을 포함한 zip은 그대로 컴파일된다', async (format) => {
    const { a, proj, R, unzip } = await setup(`export-block-build-${format}`)
    const wb = path.join(proj, 'workbench')
    fs.writeFileSync(path.join(wb, 'preamble.tex'), '\\usepackage{graphicx}\n\\input{aux-macros}\n')
    fs.writeFileSync(path.join(wb, 'aux-macros.tex'), '\\newcommand{\\BlockMacro}{1}\n')
    fs.mkdirSync(path.join(wb, 'figures'), { recursive: true })
    fs.copyFileSync(path.join(wb, 'notes/proof/fig/a.png'), path.join(wb, 'figures/aux.png'))
    const source = format === 'md'
      ? '---\nid: aux-build\ntitle: Aux build\n---\n## Result\n\n$E = \\BlockMacro$\n\n![Figure](aux.png)\n'
      : '% ---\n% id: aux-build\n% title: Aux build\n% ---\n\\section{Result}\n\\BlockMacro\n\\includegraphics[width=1cm]{aux}\n'
    const file = path.join(wb, `blocks/aux-build.${format}`)
    fs.writeFileSync(file, source)
    const before = tree(wb)
    const res = await a.inject({ method: 'GET', url: `${R}/export?block=aux-build&tpl=article&au=&date=none` })
    expect(res.statusCode).toBe(200)
    const root = path.join(unzip(res.rawPayload, `block-build-${format}`), 'aux-build')
    expect(tree(root)).toEqual(expect.arrayContaining(['block-files/preamble.tex', 'block-files/aux-macros.tex', 'block-files/figures/aux.png']))
    execFileSync('latexmk', ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { cwd: root, stdio: 'ignore' })
    expect(fs.existsSync(path.join(root, 'main.pdf'))).toBe(true)
    expect(tree(wb)).toEqual(before)
    expect(fs.readFileSync(file, 'utf8')).toBe(source)
    await a.close()
  })

  it.skipIf(!hasLatex).each(['article', 'prb', 'research-note'])('%s 서식: 내보낸 폴더는 그대로 컴파일된다 (노트 하나, 여러 노트)', async (template) => {
    const { a, key, get, unzip } = await setup(`export-tex-${template}`, template)
    for (const [name, keys] of [['one', [key('증명 노트')]], ['many', [key('증명 노트'), key('계산 노트'), key('논문 원고')]], ['notes', [key('증명 노트'), key('계산 노트')]]] as const) {
      const dir = unzip((await get([...keys])).rawPayload, `tex-${template}-${name}`)
      const root = path.join(dir, fs.readdirSync(dir)[0]!)
      execFileSync('latexmk', ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { cwd: root, stdio: 'ignore' })
      expect(fs.existsSync(path.join(root, 'main.pdf'))).toBe(true)
    }
    await a.close()
  }, 180_000)
})
