// 논문 · 그림 첫 화면 (라이브러리 L2): GET /api/papers/brief · /api/figures/brief
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { useTikzRunner } from './figures.js'
import { cloudOf } from './papers.js'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()
afterEach(() => useTikzRunner(null))

const BIB = `@article{old2001, title = {Old}, author = {A, B}, year = {2001}, eprint = {0101.0001}}
@book{book2010, title = {Book}, author = {C, D}, year = {2010}}
@article{new2024, title = {New}, author = {E, F}, year = {2024}}
`

describe('논문 첫 화면 (GET /api/papers/brief)', () => {
  it('세는 조건이 목록의 거르기와 같고, 최근 더한 것은 bib 끝부터', async () => {
    const lib = path.join(tmp, 'brief-papers')
    fs.mkdirSync(path.join(lib, 'comments', 'new2024'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'references.bib'), BIB)
    fs.writeFileSync(path.join(lib, 'comments', 'new2024', 'q-1.md'), '---\nid: q-1\nkind: 질문\nstate: 답함\n---\nwhy?\n\n> claude: because\n')
    fs.writeFileSync(path.join(lib, 'comments', 'new2024', 'q-2.md'), '---\nid: q-2\nkind: 질문\nstate: 끝냄\n---\nok\n')
    app.registry.setLibrary(lib)
    // 예제 연구 bib에 있는 키는 그 프로젝트에 묶인다
    fs.writeFileSync(path.join(repo, 'refs.bib'), '@article{book2010, title={B}, year={2010}}\n')

    const b = (await app.inject({ method: 'GET', url: '/api/papers/brief?recent=2' })).json()
    expect(b.total).toBe(3)
    expect(b.recent.map((p: { key: string }) => p.key)).toEqual(['new2024', 'book2010'])
    expect(b.check).toEqual({ noFolder: true, answered: 1 })
    expect(b.stats).toEqual({ noPdf: 3, arxiv: 1, unlinked: 2, papers: 2, books: 1 })

    const pdfs = path.join(tmp, 'brief-pdfs')
    fs.mkdirSync(pdfs, { recursive: true })
    fs.writeFileSync(path.join(pdfs, 'old2001.pdf'), '%PDF-1.4 x')
    await app.inject({ method: 'PUT', url: '/api/papers/folders', payload: { folders: [pdfs] } })
    const c = (await app.inject({ method: 'GET', url: '/api/papers/brief' })).json()
    expect(c.check.noFolder).toBe(false)
    expect(c.stats).toMatchObject({ noPdf: 2, arxiv: 0 })
    expect(c.folders).toEqual([{ path: pdfs, cloud: 'local' }])
  })

  it('PDF 폴더가 어느 클라우드인지 이름으로 안다', () => {
    expect(cloudOf('/Users/a/Library/Mobile Documents/com~apple~CloudDocs/Papers')).toBe('icloud')
    expect(cloudOf('/Users/a/Library/CloudStorage/GoogleDrive-a@b.c/My Drive/Papers')).toBe('drive')
    expect(cloudOf('/Users/a/Papers')).toBe('local')
  })
})

describe('그림 첫 화면 (GET /api/figures/brief)', () => {
  it('원본 종류 · 쓰는 노트 없음 · 그림으로 못 바꾼 tikz를 센다', async () => {
    const lib = path.join(tmp, 'brief-figs')
    fs.mkdirSync(path.join(lib, 'figures'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'references.bib'), '')
    app.registry.setLibrary(lib)
    const own = path.join(repo, 'workbench', 'figures')
    fs.mkdirSync(own, { recursive: true })
    fs.writeFileSync(path.join(lib, 'figures', 'bad.tikz'), '\\draw (0,0) -- (1,1);\n')
    fs.writeFileSync(path.join(lib, 'figures', 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    fs.writeFileSync(path.join(own, 'photo.png'), 'x')
    const later = new Date(Date.now() + 60_000)
    fs.utimesSync(path.join(own, 'photo.png'), later, later)
    fs.mkdirSync(path.join(repo, 'workbench', 'notes', 'fig'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'workbench', 'notes', 'fig', 'note.md'), '![[a]]\n')

    let b = (await app.inject({ method: 'GET', url: '/api/figures/brief' })).json()
    expect(b.total).toBe(3)
    expect(b.recent[0].id).toBe('sample-research/photo.png')
    expect(b.stats).toEqual({ tikz: 1, svg: 1, photo: 1, pdf: 0, unused: 2 })
    expect(b.store).toEqual({ library: 2, projects: 1, inProjects: 1 })
    // 아직 바꿔 보지 않은 tikz는 "못 바꾼" 것이 아니다
    expect(b.check.broken).toBe(0)

    useTikzRunner(async () => { throw new Error('no TeX') })
    const res = await app.inject({ method: 'GET', url: `/api/figures/file?id=${encodeURIComponent('library/bad.tikz')}` })
    expect(res.statusCode).toBe(422)
    b = (await app.inject({ method: 'GET', url: '/api/figures/brief' })).json()
    expect(b.check.broken).toBe(1)
    const list = (await app.inject({ method: 'GET', url: '/api/figures' })).json()
    expect(list.figures.find((f: { id: string }) => f.id === 'library/bad.tikz').broken).toBe(true)

    // 바꾸는 데 성공하면 표시가 사라진다
    useTikzRunner(async (cmd, _args, cwd) => { if (cmd === 'dvisvgm') fs.writeFileSync(path.join(cwd, 'fig.svg'), '<svg/>') })
    expect((await app.inject({ method: 'GET', url: `/api/figures/file?id=${encodeURIComponent('library/bad.tikz')}` })).statusCode).toBe(200)
    b = (await app.inject({ method: 'GET', url: '/api/figures/brief' })).json()
    expect(b.check.broken).toBe(0)
  })
})
