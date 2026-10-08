import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { embedNames, tikzDocument, useTikzRunner } from './figures.js'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()
afterEach(() => useTikzRunner(null))

function setup(name: string): { lib: string; own: string } {
  const lib = path.join(tmp, `fig-lib-${name}`)
  fs.mkdirSync(path.join(lib, 'figures'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), '')
  app.registry.setLibrary(lib)
  const own = path.join(repo, 'workbench', 'figures')
  fs.mkdirSync(own, { recursive: true })
  return { lib, own }
}

const TIKZ = '\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}\n'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'

describe('figures', () => {
  it('reads ![[name]] embeds and wraps bare tikz', () => {
    expect(embedNames('a ![[고리 지도 (원판)]] b ![[x.svg|300]] ![[y#z]] [[not]]')).toEqual(['고리 지도 (원판)', 'x.svg', 'y'])
    // 그림 문단의 대상도 (노트 폴더에 그 파일이 있으면 뺀다)
    const dir = fs.mkdtempSync(path.join(tmp, 'embed-names-'))
    fs.writeFileSync(path.join(dir, 'local.png'), '')
    expect(embedNames('![원판 \\label{fig: d}](disk)\n\n![](local.png)\n\n글 ![x](inline) 끝', dir)).toEqual(['disk'])
    fs.rmSync(dir, { recursive: true, force: true })
    expect(tikzDocument('\\draw (0,0) -- (1,1);')).toContain('\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}')
    expect(tikzDocument(TIKZ)).toContain('\\documentclass[tikz')
    expect(tikzDocument('\\documentclass{standalone}x')).toBe('\\documentclass{standalone}x')
  })

  it('lists shared and project figures with the notes that use them', async () => {
    const { lib, own } = setup('list')
    fs.writeFileSync(path.join(lib, 'figures', 'ring-map.tex'), TIKZ)
    fs.writeFileSync(path.join(lib, 'figures', FIG_META), YAML.stringify({ 'ring-map.tex': { name: '고리 지도', description: '나라 B와 둘러싼 고리 C' } }))
    fs.writeFileSync(path.join(lib, 'figures', 'notes.txt'), 'not a figure')
    fs.writeFileSync(path.join(own, 'wheel.svg'), SVG)
    fs.mkdirSync(path.join(own, 'topics'), { recursive: true })
    fs.writeFileSync(path.join(own, 'topics', 't.png'), 'x')
    fs.mkdirSync(path.join(repo, 'workbench', 'notes', 'disk'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'workbench', 'notes', 'disk', 'note.yaml'), 'name: 원판 노트\n')
    fs.writeFileSync(path.join(repo, 'workbench', 'notes', 'disk', 'note.md'), '## 그림\n\n![[고리 지도]] ![[wheel]] ![[wheel.svg]] ![[없는 그림]]\n')
    const md = { file: 'workbench/notes/disk/note.md', title: '원판 노트' }

    const res = (await app.inject({ method: 'GET', url: '/api/figures' })).json()
    expect(res.figures.map((f: { id: string }) => f.id)).toEqual(['library/ring-map.tex', 'sample-research/wheel.svg'])
    const [a, p] = res.figures
    expect(a).toMatchObject({ scope: 'library', name: '고리 지도', kind: 'tikz', description: '나라 B와 둘러싼 고리 C', path: `${path.basename(lib)}/figures/ring-map.tex` })
    expect(a.uses).toEqual([expect.objectContaining({ rid: 'sample-research', file: md.file, title: md.title })])
    // 같은 노트가 두 번 불러도 하나로 센다
    expect(p).toMatchObject({ scope: 'sample-research', name: 'wheel', kind: 'svg' })
    expect(p.uses).toHaveLength(1)
  })

  it('serves files, resolves embeds project-first, and draws tikz through the cache', async () => {
    const { lib, own } = setup('serve')
    fs.writeFileSync(path.join(lib, 'figures', 'disk.svg'), SVG.replace('r="4"', 'r="3"'))
    fs.writeFileSync(path.join(own, 'disk.svg'), SVG)
    fs.writeFileSync(path.join(lib, 'figures', 'a0.tikz'), TIKZ)

    const svg = await app.inject({ method: 'GET', url: '/api/figures/file?id=library%2Fdisk.svg' })
    expect(svg.headers['content-type']).toBe('image/svg+xml')
    expect(svg.body).toContain('r="3"')
    const projectFirst = await app.inject({ method: 'GET', url: '/api/figures/embed?name=disk&rid=sample-research' })
    expect(projectFirst.headers.location).toBe('/api/figures/file?id=sample-research%2Fdisk.svg')
    const shared = await app.inject({ method: 'GET', url: '/api/figures/embed?name=disk' })
    expect(shared.headers.location).toBe('/api/figures/file?id=library%2Fdisk.svg')
    expect((await app.inject({ method: 'GET', url: '/api/figures/embed?name=nope' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/figures/file?id=library%2F..%2Fsecret.svg' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/figures/file?id=nope%2Fdisk.svg' })).statusCode).toBe(404)

    let runs = 0
    useTikzRunner(async (cmd, _args, cwd) => {
      runs++
      if (cmd === 'dvisvgm') fs.writeFileSync(path.join(cwd, 'fig.svg'), SVG.replace('circle', 'rect'))
    })
    const t1 = await app.inject({ method: 'GET', url: '/api/figures/file?id=library%2Fa0.tikz' })
    expect(t1.statusCode).toBe(200)
    expect(t1.body).toContain('<rect')
    await app.inject({ method: 'GET', url: '/api/figures/file?id=library%2Fa0.tikz' })
    expect(runs).toBe(2)
    expect((await app.inject({ method: 'GET', url: '/api/figures/file?id=library%2Fa0.tikz&source=1' })).body).toBe(TIKZ)

    fs.writeFileSync(path.join(lib, 'figures', 'bad.tikz'), '\\draw (0,0) -- ;')
    useTikzRunner(async (cmd) => { if (cmd === 'latex') throw Object.assign(new Error('spawn latex ENOENT'), { code: 'ENOENT' }) })
    const bad = await app.inject({ method: 'GET', url: '/api/figures/file?id=library%2Fbad.tikz' })
    expect(bad.statusCode).toBe(422)
    expect(bad.json().error).toContain('TeX')
  })

  it('adds dropped figures and edits the name and description', async () => {
    const { lib } = setup('add')
    const up = await app.inject({ method: 'PUT', url: '/api/figures/upload?scope=library&name=ring.svg', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(SVG) })
    expect(up.json()).toEqual({ id: 'library/ring.svg' })
    expect(fs.readFileSync(path.join(lib, 'figures', 'ring.svg'), 'utf8')).toBe(SVG)
    // 대소문자만 다른 이름도 겹친다 (맥 파일 시스템)
    expect((await app.inject({ method: 'PUT', url: '/api/figures/upload?scope=library&name=Ring.svg', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(SVG) })).statusCode).toBe(409)
    expect((await app.inject({ method: 'PUT', url: '/api/figures/upload?scope=library&name=x.exe', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('x') })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: '/api/figures/upload?scope=nope&name=y.svg', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(SVG) })).statusCode).toBe(400)

    const meta = path.join(lib, 'figures', FIG_META)
    expect((await app.inject({ method: 'PATCH', url: '/api/figures/meta', payload: { id: 'library/ring.svg', name: '고리  영역', description: '바깥 고리' } })).statusCode).toBe(200)
    expect(YAML.parse(fs.readFileSync(meta, 'utf8'))).toEqual({ 'ring.svg': { name: '고리 영역', description: '바깥 고리' } })
    expect((await app.inject({ method: 'PATCH', url: '/api/figures/meta', payload: { id: 'library/ring.svg', name: 'a|b' } })).statusCode).toBe(400)
    await app.inject({ method: 'PATCH', url: '/api/figures/meta', payload: { id: 'library/ring.svg', name: 'ring', description: '' } })
    expect(fs.existsSync(meta)).toBe(false)
  })
})

const FIG_META = 'figures.yaml'

describe('figures.yaml 지키기 (10/5 검토)', () => {
  it('끊긴 심볼릭 링크가 있어도 그림 목록을 준다', async () => {
    const { lib } = setup('dangling')
    fs.writeFileSync(path.join(lib, 'figures', 'ok.svg'), SVG)
    fs.symlinkSync(path.join(lib, 'nowhere.svg'), path.join(lib, 'figures', 'gone.svg'))
    const r = await app.inject({ method: 'GET', url: '/api/figures' })
    expect(r.statusCode).toBe(200)
    expect(r.json().figures.map((f: { id: string }) => f.id)).toContain('library/ok.svg')
  })

  const patch = (payload: object) => app.inject({ method: 'PATCH', url: '/api/figures/meta', payload })

  it('읽지 못하는 figures.yaml은 고치지도 지우지도 않는다', async () => {
    const { lib } = setup('meta-bad')
    for (const f of ['a.svg', 'b.svg']) fs.writeFileSync(path.join(lib, 'figures', f), SVG)
    const meta = path.join(lib, 'figures', FIG_META)
    const bad = 'a.svg: {name: A}\nb.svg:\n  description: ratio: 1:2\n'
    fs.writeFileSync(meta, bad)
    expect((await patch({ id: 'library/b.svg', name: 'Beta2' })).statusCode).toBe(422)
    expect((await patch({ id: 'library/b.svg', name: '' })).statusCode).toBe(422)
    expect(fs.readFileSync(meta, 'utf8')).toBe(bad)
    // 이름만 적은 항목(글 하나)도 고치지 않는다
    fs.writeFileSync(meta, 'a.svg: A\n')
    expect((await patch({ id: 'library/a.svg', description: 'x' })).statusCode).toBe(422)
    expect(fs.readFileSync(meta, 'utf8')).toBe('a.svg: A\n')
  })

  it('한 그림을 고치면 다른 그림의 항목·모르는 칸·주석은 그대로 둔다', async () => {
    const { lib } = setup('meta-keep')
    for (const f of ['a.svg', 'b.svg']) fs.writeFileSync(path.join(lib, 'figures', f), SVG)
    const meta = path.join(lib, 'figures', FIG_META)
    fs.writeFileSync(meta, '# 손으로 적은 주석\na.svg: {name: A, source: Fig. 2}\nb.svg:\n  name: B\n')
    expect((await patch({ id: 'library/b.svg', name: 'b' })).statusCode).toBe(200)
    const text = fs.readFileSync(meta, 'utf8')
    expect(text.startsWith('# 손으로 적은 주석\n')).toBe(true)
    expect(YAML.parse(text)).toEqual({ 'a.svg': { name: 'A', source: 'Fig. 2' } })
    // 'b.svg:'처럼 값이 빈 항목에도 쓴다
    fs.writeFileSync(meta, 'a.svg: {name: A}\nb.svg:\n')
    expect((await patch({ id: 'library/b.svg', name: 'Beta' })).statusCode).toBe(200)
    expect(YAML.parse(fs.readFileSync(meta, 'utf8'))).toEqual({ 'a.svg': { name: 'A' }, 'b.svg': { name: 'Beta' } })
  })
})
