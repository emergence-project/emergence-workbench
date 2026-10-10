import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { detex, findPdf, FolderListing, lastNames, pdfWhere, useCloudDownloader } from './papers.js'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const BIB = `@article{exampleDischarging2022,
  title = {Discharging Rules for Planar Graphs of Minimum Degree Five},
  author = {Example, Ada E. and Sample, Bea and Tester, Theo and Mock, Vera V.},
  journal = {Journal of Example Combinatorics},
  year = {2022},
  eprint = {0000.00001},
}
@book{readerGraph2010,
  title = {Graph Theory: A First Course},
  author = {Reader, Rita and Writer, Will},
  publisher = {Example University Press},
  year = {2010},
}
@article{doeStructure2004,
  title = {Structure of Graphs},
  author = {Doe, Jane and Lorem, D{\\'e}nes},
  journal = {Journal of Example Mathematics},
  year = {2004},
}
`

function setup(): { lib: string; pdfs: string } {
  const lib = path.join(tmp, 'papers-lib')
  const pdfs = path.join(tmp, 'papers-pdf')
  fs.mkdirSync(lib, { recursive: true })
  fs.mkdirSync(pdfs, { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), BIB)
  app.registry.setLibrary(lib)
  return { lib, pdfs }
}

describe('papers', () => {
  it('reads bib names and kinds', () => {
    expect(detex("Lorem, D{\\'e}nes")).toBe('Lorem, Dénes')
    expect(detex('{\\v{S}}niady')).toBe('Šniady')
    expect(lastNames('Example, Ada E. and Bea Sample and others')).toEqual(['Example', 'Sample'])
  })

  it('tells a cloud-only iCloud file from a local one', () => {
    const dir = path.join(tmp, 'where')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'a.pdf'), '%PDF-1.4 x')
    fs.writeFileSync(path.join(dir, '.b.pdf.icloud'), '')
    expect(pdfWhere(path.join(dir, 'a.pdf'))).toBe('local')
    expect(pdfWhere(path.join(dir, 'b.pdf'))).toBe('cloud')
    expect(pdfWhere(path.join(dir, 'c.pdf'))).toBe('none')
  })

  it('lists library papers with kind, venue, projects and PDF place', async () => {
    const { lib, pdfs } = setup()
    // 예제 연구의 bib에 있는 키는 그 프로젝트에 저절로 이어진다
    fs.writeFileSync(path.join(repo, 'refs.bib'), '@article{doeStructure2004, title={S}, year={2004}}\n')
    fs.writeFileSync(path.join(pdfs, 'exampleDischarging2022.pdf'), '%PDF-1.4 test')
    fs.mkdirSync(path.join(lib, 'comments', 'exampleDischarging2022'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'comments', 'exampleDischarging2022', 'c-1.md'), '---\nid: c-1\nkind: 코멘트\n---\nhi\n')
    fs.writeFileSync(path.join(lib, 'comments', 'exampleDischarging2022', 'c-2.md'), '---\nid: c-2\nkind: 질문\nstate: 대기\npage: 2\n---\nwhy?\n')
    expect((await app.inject({ method: 'PUT', url: '/api/papers/folders', payload: { folders: [pdfs] } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/papers/folders' })).json()).toEqual({ folders: [{ path: pdfs, exists: true, cloud: 'local' }] })

    const res = (await app.inject({ method: 'GET', url: '/api/papers' })).json()
    const byKey = Object.fromEntries(res.papers.map((p: { key: string }) => [p.key, p]))
    expect(byKey.exampleDischarging2022).toMatchObject({ kind: 'paper', authors: ['Example', 'Sample', 'Tester', 'Mock'], venue: 'Journal of Example Combinatorics', eprint: '0000.00001', pdf: { where: 'local' }, comments: 2, waiting: 1 })
    expect(byKey.readerGraph2010).toMatchObject({ kind: 'book', venue: 'Example University Press', pdf: { where: 'none' } })
    expect(byKey.doeStructure2004).toMatchObject({ authors: ['Doe', 'Lorem'], projects: ['sample-research'], autoProjects: ['sample-research'] })
    expect(res.projects).toEqual([{ id: 'sample-research', title: expect.any(String) }])
  })

  it('stores related projects in papers.yaml and serves the PDF', async () => {
    const { lib } = setup()
    const put = await app.inject({ method: 'PUT', url: '/api/papers/exampleDischarging2022/projects', payload: { projects: ['sample-research'] } })
    expect(put.statusCode).toBe(200)
    expect(YAML.parse(fs.readFileSync(path.join(lib, 'papers.yaml'), 'utf8'))).toEqual({ exampleDischarging2022: { projects: ['sample-research'] } })
    expect((await app.inject({ method: 'PUT', url: '/api/papers/exampleDischarging2022/projects', payload: { projects: ['nope'] } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: '/api/papers/missingKey/projects', payload: { projects: [] } })).statusCode).toBe(404)

    const pdf = await app.inject({ method: 'GET', url: '/api/papers/exampleDischarging2022/pdf' })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    const listed = (await app.inject({ method: 'GET', url: '/api/papers' })).json()
    expect(listed.papers.find((p: { key: string }) => p.key === 'exampleDischarging2022').opened).toBeGreaterThan(0)
    expect((await app.inject({ method: 'GET', url: '/api/papers/readerGraph2010/pdf' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/papers/..%2Fx/pdf' })).statusCode).toBe(404)
  })

  it('rejects PDF folders that do not exist', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/papers/folders', payload: { folders: ['/no/such/dir'] } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: '/api/papers/folders', payload: { folders: ['relative'] } })).statusCode).toBe(400)
  })
})

describe('papers.yaml 지키기 (10/5 검토)', () => {
  it('관련 프로젝트를 바꿔도 다른 논문·다른 칸·주석은 그대로 둔다', async () => {
    const { lib } = setup()
    const file = path.join(lib, 'papers.yaml')
    fs.writeFileSync(file, '# 내 메모\nexampleDischarging2022: {projects: [old], tags: [important], read: true}\nreaderGraph2010:\n  note: keep me\n')
    const put = await app.inject({ method: 'PUT', url: '/api/papers/exampleDischarging2022/projects', payload: { projects: ['sample-research'] } })
    expect(put.statusCode).toBe(200)
    const text = fs.readFileSync(file, 'utf8')
    expect(text.startsWith('# 내 메모\n')).toBe(true)
    expect(YAML.parse(text)).toEqual({
      exampleDischarging2022: { projects: ['sample-research'], tags: ['important'], read: true },
      readerGraph2010: { note: 'keep me' },
    })
    // 빼면 projects 칸만 지운다
    await app.inject({ method: 'PUT', url: '/api/papers/exampleDischarging2022/projects', payload: { projects: [] } })
    expect(YAML.parse(fs.readFileSync(file, 'utf8')).exampleDischarging2022).toEqual({ tags: ['important'], read: true })
    // '키:'처럼 값이 빈 항목에도 쓴다
    fs.writeFileSync(file, 'readerGraph2010:\n')
    expect((await app.inject({ method: 'PUT', url: '/api/papers/readerGraph2010/projects', payload: { projects: ['sample-research'] } })).statusCode).toBe(200)
    expect(YAML.parse(fs.readFileSync(file, 'utf8'))).toEqual({ readerGraph2010: { projects: ['sample-research'] } })
    // 읽지 못하는 파일은 고치지 않는다
    fs.writeFileSync(file, 'exampleDischarging2022: [\n')
    expect((await app.inject({ method: 'PUT', url: '/api/papers/exampleDischarging2022/projects', payload: { projects: [] } })).statusCode).toBeGreaterThanOrEqual(400)
    expect(fs.readFileSync(file, 'utf8')).toBe('exampleDischarging2022: [\n')
  })
})

describe('iCloud에만 있는 PDF (10/5 검토)', () => {
  it('열면 받기 시작하고 503, 열었다고 적지 않는다', async () => {
    const { lib, pdfs } = setup()
    fs.rmSync(path.join(lib, 'papers.yaml'), { force: true })
    app.registry.setPdfFolders([pdfs])
    for (const f of fs.readdirSync(pdfs)) fs.rmSync(path.join(pdfs, f))
    fs.writeFileSync(path.join(pdfs, '.readerGraph2010.pdf.icloud'), 'placeholder')
    fs.rmSync(path.join(app.registry.configDir, 'papers-opened.json'), { force: true })
    const asked: string[] = []
    useCloudDownloader((f) => asked.push(f))
    const listed = (await app.inject({ method: 'GET', url: '/api/papers' })).json()
    expect(listed.papers.find((p: { key: string }) => p.key === 'readerGraph2010').pdf.where).toBe('cloud')
    const r = await app.inject({ method: 'GET', url: '/api/papers/readerGraph2010/pdf' })
    expect(r.statusCode).toBe(503)
    expect(asked).toEqual([path.join(pdfs, 'readerGraph2010.pdf')])
    const after = (await app.inject({ method: 'GET', url: '/api/papers' })).json()
    expect(after.papers.find((p: { key: string }) => p.key === 'readerGraph2010').opened).toBeUndefined()
  })
})


describe('findPdf folder listing', () => {
  it('finds the same files with and without the listing', () => {
    const a = path.join(tmp, 'listing-a'), b = path.join(tmp, 'listing-b')
    fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true })
    fs.writeFileSync(path.join(a, 'k1.pdf'), 'x')
    fs.writeFileSync(path.join(b, '.k2.pdf.icloud'), '')
    fs.writeFileSync(path.join(b, 'k3.pdf'), 'x')
    const dirs = [a, path.join(tmp, 'listing-none'), b]
    const listing = new FolderListing()
    for (const key of ['k1', 'k2', 'k3', 'k4']) expect(findPdf(key, undefined, dirs, [], listing)).toBe(findPdf(key, undefined, dirs, []))
    expect(findPdf('k2', undefined, dirs, [], listing)).toBe(path.join(b, 'k2.pdf'))
    expect(findPdf('k4', undefined, dirs, [], listing)).toBeUndefined()
  })
})
