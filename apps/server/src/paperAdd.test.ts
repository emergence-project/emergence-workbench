import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bibEntryText, escapeTex, idInPdf, paperKey, parsePaperId, usePaperFetcher } from './paperAdd.js'
import { app, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const ATOM = `<?xml version="1.0"?><feed><entry>
<id>http://arxiv.org/abs/0000.00001v2</id><published>2021-10-13T17:59:59Z</published>
<title>Discharging Rules for Planar Graphs
  of Minimum Degree Five</title>
<author><name>Ada E. Example</name></author><author><name>Bea Sample</name></author>
<arxiv:doi>10.0000/example.2022.001</arxiv:doi>
<arxiv:journal_ref>J. Example Comb. 128, 176402 (2022)</arxiv:journal_ref>
</entry></feed>`
const CROSSREF = { message: { type: 'book', title: ['Graph Theory: A First Course'], author: [{ family: 'Reader', given: 'Rita' }, { family: 'Writer', given: 'Will' }], issued: { 'date-parts': [[2010, 12]] }, publisher: 'Example University Press' } }

function fake(calls: string[]) {
  usePaperFetcher(async (url) => {
    calls.push(url)
    if (url.includes('export.arxiv.org')) return new Response(ATOM)
    if (url.includes('arxiv.org/pdf/')) return new Response('%PDF-1.5 fake')
    if (url.includes('api.crossref.org')) return new Response(JSON.stringify(CROSSREF))
    return new Response('', { status: 404 })
  })
}
afterEach(() => usePaperFetcher(async () => new Response('', { status: 599 })))

function setup(name: string) {
  const lib = path.join(tmp, `${name}-lib`)
  const pdfs = path.join(tmp, `${name}-pdf`)
  fs.mkdirSync(lib, { recursive: true })
  fs.mkdirSync(pdfs, { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), '@article{old2020,\n  title = {Old},\n  year = {2020},\n}\n')
  app.registry.setLibrary(lib)
  app.registry.setPdfFolders([pdfs])
  return { lib, pdfs }
}

describe('adding papers', () => {
  it('reads arXiv numbers and DOIs, also from links', () => {
    expect(parsePaperId('0000.00001')).toEqual({ arxiv: '0000.00001' })
    expect(parsePaperId('https://arxiv.org/abs/0000.00001v2')).toEqual({ arxiv: '0000.00001' })
    expect(parsePaperId('arXiv:math/0000002')).toEqual({ arxiv: 'math/0000002' })
    expect(parsePaperId('https://doi.org/10.0000/example.2022.001')).toEqual({ doi: '10.0000/example.2022.001' })
    expect(parsePaperId('10.48550/arXiv.0000.00001')).toEqual({ arxiv: '0000.00001' })
    expect(parsePaperId('hello')).toBeNull()
    expect(idInPdf('paper.pdf', Buffer.from('%PDF-1.4 ... arXiv:0000.00004v1 [math.CO]'))).toEqual({ arxiv: '0000.00004' })
  })

  it('makes Better BibTeX style keys that do not clash', () => {
    const p = { type: 'article' as const, title: 'The Discharging Rules', authors: [['Example', 'Ada'] as [string, string]], year: '2022' }
    expect(paperKey(p, new Set())).toBe('exampleDischarging2022')
    expect(paperKey(p, new Set(['exampleDischarging2022']))).toBe('exampleDischarging2022a')
    expect(paperKey({ ...p, authors: [['Šniady', 'P.']] }, new Set())).toBe('sniadyDischarging2022')
    expect(bibEntryText('k', { ...p, eprint: '1.2' })).toBe('@article{k,\n  title = {The Discharging Rules},\n  author = {Example, Ada},\n  year = {2022},\n  eprint = {1.2},\n  archiveprefix = {arXiv},\n}\n')
  })

  it('adds an arXiv paper to the bib and fetches its PDF; a second add finds it', async () => {
    const { lib, pdfs } = setup('arxiv')
    const calls: string[] = []
    fake(calls)
    const res = await app.inject({ method: 'POST', url: '/api/papers', payload: { id: 'arXiv:0000.00001' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ key: 'exampleDischarging2022', existed: false })
    const bib = fs.readFileSync(path.join(lib, 'references.bib'), 'utf8')
    expect(bib.startsWith('@article{old2020')).toBe(true)
    expect(bib).toContain('@article{exampleDischarging2022,\n  title = {Discharging Rules for Planar Graphs of Minimum Degree Five},\n  author = {Example, Ada E. and Sample, Bea},\n  journal = {J. Example Comb. 128, 176402},')
    expect(fs.readFileSync(path.join(pdfs, 'exampleDischarging2022.pdf'), 'utf8')).toBe('%PDF-1.5 fake')
    const again = await app.inject({ method: 'POST', url: '/api/papers', payload: { id: '10.0000/example.2022.001' } })
    expect(again.json()).toMatchObject({ key: 'exampleDischarging2022', existed: true })
    expect((await app.inject({ method: 'POST', url: '/api/papers', payload: { id: 'nonsense' } })).statusCode).toBe(400)
  })

  it('adds a book by DOI and a dropped PDF', async () => {
    const { lib, pdfs } = setup('book')
    fake([])
    expect((await app.inject({ method: 'POST', url: '/api/papers', payload: { id: '10.0000/example.book.2010' } })).json()).toMatchObject({ key: 'readerGraph2010' })
    expect(fs.readFileSync(path.join(lib, 'references.bib'), 'utf8')).toContain('@book{readerGraph2010,')
    const up = await app.inject({ method: 'PUT', url: '/api/papers/upload?name=0000.00001v2.pdf', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('%PDF-1.4 dropped') })
    expect(up.json()).toMatchObject({ key: 'exampleDischarging2022', existed: false })
    expect(fs.readFileSync(path.join(pdfs, 'exampleDischarging2022.pdf'), 'utf8')).toBe('%PDF-1.4 dropped')
    const unknown = await app.inject({ method: 'PUT', url: '/api/papers/upload?name=scan.pdf', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('%PDF-1.4 nothing') })
    expect(unknown.statusCode).toBe(422)
  })
})

describe('bib 지키기 (10/5 검토)', () => {
  it('한꺼번에 더해도 같은 논문·같은 키를 두 번 쓰지 않는다', async () => {
    const { lib } = setup('race')
    // 받는 동안 다른 더하기가 끼어들게 응답을 늦춘다
    usePaperFetcher(async (url) => {
      await new Promise((r) => setTimeout(r, 20))
      return url.includes('export.arxiv.org') ? new Response(ATOM) : new Response('%PDF-1.5 fake')
    })
    const add = (id: string) => app.inject({ method: 'POST', url: '/api/papers', payload: { id } })
    const res = await Promise.all([add('0000.00001'), add('0000.00001'), add('arXiv:0000.00001')])
    expect(res.map((r) => r.json().key)).toEqual(['exampleDischarging2022', 'exampleDischarging2022', 'exampleDischarging2022'])
    expect(res.filter((r) => !r.json().existed)).toHaveLength(1)
    const bib = fs.readFileSync(path.join(lib, 'references.bib'), 'utf8')
    expect(bib.match(/@article\{exampleDischarging2022,/g)).toHaveLength(1)
  })

  it('짝 맞는 { }와 수식은 두고, % & # _는 막는다 (LaTeX 컴파일이 깨지지 않게)', () => {
    expect(escapeTex('50% & #1 a_b $x_2 \\% y$ \\& ok')).toBe('50\\% \\& \\#1 a\\_b $x_2 \\% y$ \\& ok')
    const p = { type: 'misc' as const, title: 'Planar $\\mathbb{Z}_2$ order 50% & more }', authors: [['Example', 'A'] as [string, string]], doi: '10.1/a_b' }
    expect(bibEntryText('k', p)).toBe('@misc{k,\n  title = {Planar $\\mathbb{Z}_2$ order 50\\% \\& more },\n  author = {Example, A},\n  doi = {10.1/a_b},\n}\n')
  })

  it('references.bib가 심볼릭 링크(Zotero 자동 내보내기 등)면 링크를 두고 가리키는 파일에 쓴다', async () => {
    const { lib } = setup('link')
    fake([])
    const real = path.join(tmp, 'link-zotero-export.bib')
    fs.renameSync(path.join(lib, 'references.bib'), real)
    fs.symlinkSync(real, path.join(lib, 'references.bib'))
    expect((await app.inject({ method: 'POST', url: '/api/papers', payload: { id: '0000.00001' } })).json()).toMatchObject({ existed: false })
    expect(fs.lstatSync(path.join(lib, 'references.bib')).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(real, 'utf8')).toContain('@article{exampleDischarging2022,')
  })

  it('PDF 폴더에 이미 같은 키의 다른 PDF가 있으면 덮어쓰지 않고 알린다', async () => {
    const { pdfs } = setup('reup')
    fake([])
    fs.writeFileSync(path.join(pdfs, 'exampleDischarging2022.pdf'), '%PDF-1.4 my annotated copy')
    const put = (body: string) => app.inject({ method: 'PUT', url: '/api/papers/upload?name=0000.00001v2.pdf', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(body) })
    const r = (await put('%PDF-1.4 another version')).json()
    expect(r.pdfError).toMatch(/이미 exampleDischarging2022\.pdf/)
    expect(fs.readFileSync(path.join(pdfs, 'exampleDischarging2022.pdf'), 'utf8')).toBe('%PDF-1.4 my annotated copy')
    expect((await put('%PDF-1.4 my annotated copy')).json().pdfError).toBeUndefined()
  })

  it('references.bib가 .bib가 아닌 파일로 가는 링크면 쓰지 않는다 (저장소 밖 파일을 고치지 않게)', async () => {
    const { lib } = setup('badlink')
    fake([])
    const outside = path.join(tmp, 'badlink-zshrc')
    fs.writeFileSync(outside, 'export PATH=x\n')
    fs.rmSync(path.join(lib, 'references.bib'))
    fs.symlinkSync(outside, path.join(lib, 'references.bib'))
    expect((await app.inject({ method: 'POST', url: '/api/papers', payload: { id: '0000.00001' } })).statusCode).toBe(409)
    expect(fs.readFileSync(outside, 'utf8')).toBe('export PATH=x\n')
    expect(fs.lstatSync(path.join(lib, 'references.bib')).isSymbolicLink()).toBe(true)
  })
})

