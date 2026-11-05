import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { usePaperFetcher } from './paperAdd.js'
import { readOpened } from './papers.js'
import { app, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const ATOM = `<feed><entry><id>http://arxiv.org/abs/0000.00001v2</id><title>Discharging Rules</title>
<summary>  We prove &amp; check
  a rule.</summary><author><name>Ada E. Example</name></author><arxiv:doi>10.0000/x</arxiv:doi></entry></feed>`
const CROSSREF = { message: { title: ['Graph <i>Theory</i>'], author: [{ family: 'Reader', given: 'Rita' }], abstract: '<jats:title>Abstract</jats:title><jats:p>Short abstract.</jats:p>' } }

afterEach(() => usePaperFetcher(async () => new Response('', { status: 599 })))

describe('넣기 전에 읽기 (11/5)', () => {
  it('arXiv는 초록과 PDF를 주고 라이브러리에는 쓰지 않는다', async () => {
    const lib = path.join(tmp, 'peek-lib')
    fs.mkdirSync(lib, { recursive: true })
    fs.writeFileSync(path.join(lib, 'references.bib'), '@article{old2020,\n  title = {Old},\n}\n')
    app.registry.setLibrary(lib)
    usePaperFetcher(async (url) => (url.includes('export.arxiv.org') ? new Response(ATOM) : url.includes('arxiv.org/pdf/') ? new Response('%PDF-1.5 fake') : new Response('', { status: 404 })))
    const r = await app.inject({ method: 'GET', url: '/api/papers/peek?id=arXiv:0000.00001' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ arxiv: '0000.00001', title: 'Discharging Rules', authors: ['Ada E. Example'], abstract: 'We prove & check a rule.', doi: '10.0000/x', offline: false })
    const pdf = await app.inject({ method: 'GET', url: '/api/papers/peek/pdf?id=0000.00001' })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(fs.readFileSync(path.join(lib, 'references.bib'), 'utf8')).not.toContain('0000.00001')
  })
  it('DOI는 Crossref 초록, PDF는 주지 않는다', async () => {
    usePaperFetcher(async (url) => (url.includes('api.crossref.org') ? new Response(JSON.stringify(CROSSREF)) : new Response('', { status: 404 })))
    const r = await app.inject({ method: 'GET', url: `/api/papers/peek?id=${encodeURIComponent('10.0000/graph')}` })
    expect(r.json()).toEqual({ doi: '10.0000/graph', title: 'Graph Theory', authors: ['Rita Reader'], abstract: 'Short abstract.', offline: false })
    expect((await app.inject({ method: 'GET', url: '/api/papers/peek/pdf?id=10.0000/graph' })).statusCode).toBe(404)
  })
  it('바깥에 닿지 않으면 offline, 번호가 아니면 400', async () => {
    usePaperFetcher(async () => { throw new Error('down') })
    expect((await app.inject({ method: 'GET', url: '/api/papers/peek?id=0000.00001' })).json()).toEqual({ arxiv: '0000.00001', authors: [], offline: true })
    expect((await app.inject({ method: 'GET', url: '/api/papers/peek?id=nothing' })).statusCode).toBe(400)
  })
})

describe('정보 칸에서 본 논문 (11/5)', () => {
  it('라이브러리 논문이면 연 때를 적고, 없는 키는 404', async () => {
    const lib = path.join(tmp, 'opened-lib')
    fs.mkdirSync(lib, { recursive: true })
    fs.writeFileSync(path.join(lib, 'references.bib'), '@article{seen2020,\n  title = {Seen},\n}\n')
    app.registry.setLibrary(lib)
    const r = await app.inject({ method: 'POST', url: '/api/papers/seen2020/opened', payload: {} })
    expect(r.json()).toEqual({ ok: true })
    expect(readOpened(app.registry.configDir).seen2020).toBeGreaterThan(0)
    expect((await app.inject({ method: 'POST', url: '/api/papers/nobody/opened', payload: {} })).statusCode).toBe(404)
  })
})
