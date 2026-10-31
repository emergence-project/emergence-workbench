// 논문 찾기의 바깥 결과 (GET /api/papers/search)와 PDF 폴더의 PDF 더하기 (POST /api/papers/file)
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { usePaperFetcher } from './paperAdd.js'
import { readPapersYaml } from './papers.js'
import { app, tmp, useSampleApp } from './testkit.js'

useSampleApp()
afterEach(() => usePaperFetcher(async () => new Response('', { status: 599 })))

const ATOM = `<?xml version="1.0"?><feed>
<entry><id>http://arxiv.org/abs/0000.00001v2</id><published>2021-10-13T17:59:59Z</published><title>Planar Graphs</title><author><name>Ada Example</name></author></entry>
<entry><id>http://arxiv.org/abs/0000.00002v1</id><published>2022-01-01T00:00:00Z</published><title>Have It Already</title><author><name>Bea Sample</name></author></entry>
</feed>`
const S2 = { data: [
  { title: 'Planar Graphs', year: 2021, authors: [{ name: 'Ada Example' }], externalIds: { ArXiv: '0000.00001' } },
  { title: 'Other Graphs', year: 2019, venue: 'J. Ex.', authors: [{ name: 'Cy Person' }], externalIds: { DOI: '10.0000/other' } },
] }
const CROSSREF = { message: { items: [{ DOI: '10.0000/OTHER', title: ['Other Graphs'], author: [{ family: 'Person' }], issued: { 'date-parts': [[2019]] } }] } }

function setup(name: string) {
  const lib = path.join(tmp, `${name}-lib`)
  const pdfs = path.join(tmp, `${name}-pdf`)
  fs.mkdirSync(lib, { recursive: true })
  fs.mkdirSync(pdfs, { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), '@article{have2022,\n  title = {Have},\n  year = {2022},\n  eprint = {0000.00002},\n}\n')
  app.registry.setLibrary(lib)
  app.registry.setPdfFolders([pdfs])
  return { lib, pdfs }
}

describe('논문 찾기 (GET /api/papers/search)', () => {
  it('인터넷 결과는 셋을 합치고 라이브러리에 있는 것 · 겹치는 것을 뺀다', async () => {
    setup('web')
    usePaperFetcher(async (url) => {
      if (url.includes('export.arxiv.org')) return new Response(ATOM)
      if (url.includes('semanticscholar')) return new Response(JSON.stringify(S2))
      if (url.includes('crossref')) return new Response(JSON.stringify(CROSSREF))
      return new Response('', { status: 404 })
    })
    const r = (await app.inject({ method: 'GET', url: '/api/papers/search?q=planar graphs' })).json()
    expect(r.offline).toBe(false)
    expect(r.web.map((w: { source: string; id: string }) => `${w.source}:${w.id}`)).toEqual(['arxiv:0000.00001', 's2:10.0000/other'])
  })

  it('모두 실패하면 offline', async () => {
    setup('off')
    usePaperFetcher(async () => { throw new Error('no network') })
    const r = (await app.inject({ method: 'GET', url: '/api/papers/search?q=graphs' })).json()
    expect(r).toEqual({ drive: [], web: [], offline: true })
  })

  it('PDF 폴더에서 라이브러리에 없고 이름이 맞는 PDF만, 번호도 읽는다', async () => {
    const { pdfs } = setup('drive')
    fs.writeFileSync(path.join(pdfs, 'have2022.pdf'), '%PDF-1.4 graphs')
    fs.writeFileSync(path.join(pdfs, 'Planar_Graphs notes.pdf'), '%PDF-1.4 arXiv:0000.00003v1')
    fs.writeFileSync(path.join(pdfs, 'unrelated.pdf'), '%PDF-1.4')
    const r = (await app.inject({ method: 'GET', url: '/api/papers/search?q=planar graphs' })).json()
    expect(r.drive).toEqual([{ file: path.join(pdfs, 'Planar_Graphs notes.pdf'), name: 'Planar_Graphs notes.pdf', folder: path.basename(pdfs), cloud: 'local', id: '0000.00003' }])
  })
})

describe('PDF 폴더의 PDF 더하기 (POST /api/papers/file)', () => {
  it('bib에 더하고 파일은 그대로 둔 채 papers.yaml pdf:로 잇는다', async () => {
    const { lib, pdfs } = setup('file')
    usePaperFetcher(async (url) => url.includes('export.arxiv.org') ? new Response(ATOM.replace('0000.00002v1', 'x')) : new Response('', { status: 404 }))
    const file = path.join(pdfs, 'sub', 'my scan.pdf')
    fs.mkdirSync(path.dirname(file))
    fs.writeFileSync(file, '%PDF-1.4 arXiv:0000.00001')
    const res = await app.inject({ method: 'POST', url: '/api/papers/file', payload: { file } })
    expect(res.statusCode).toBe(200)
    const { key, existed } = res.json()
    expect(existed).toBe(false)
    expect(readPapersYaml(lib)[key]?.pdf).toBe('sub/my scan.pdf')
    expect(fs.existsSync(file)).toBe(true)
    const list = (await app.inject({ method: 'GET', url: '/api/papers' })).json()
    expect(list.papers.find((p: { key: string }) => p.key === key).pdf).not.toBe('none')
  })

  it('PDF 폴더 밖 파일은 거절한다', async () => {
    setup('outside')
    const file = path.join(tmp, 'elsewhere.pdf')
    fs.writeFileSync(file, '%PDF-1.4 arXiv:0000.00001')
    expect((await app.inject({ method: 'POST', url: '/api/papers/file', payload: { file } })).statusCode).toBe(400)
  })
})
