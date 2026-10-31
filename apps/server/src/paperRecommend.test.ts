// 추천 논문 (GET /api/papers/recommend): 기준 고르기, 라이브러리에 있는 것 빼기, 받지 못하면 offline
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { usePaperFetcher } from './paperAdd.js'
import { forgetRecommendations } from './paperRecommend.js'
import { app, tmp, useSampleApp } from './testkit.js'

useSampleApp()
afterEach(() => { usePaperFetcher(async () => new Response('', { status: 599 })); forgetRecommendations() })

function setup(name: string) {
  const lib = path.join(tmp, `${name}-rec-lib`)
  fs.mkdirSync(lib, { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), '@article{have2022,\n  title = {Have},\n  year = {2022},\n  eprint = {0000.00002},\n}\n@article{nodoi,\n  title = {No id},\n  year = {2020},\n}\n')
  app.registry.setLibrary(lib)
}

const RECS = { recommendedPapers: [
  { title: 'Old one', year: 2024, publicationDate: '2024-01-01', authors: [{ name: 'Ada Example' }], externalIds: { ArXiv: '0000.00009' } },
  { title: 'In library', year: 2026, authors: [], externalIds: { ArXiv: '0000.00002' } },
  { title: 'New one', year: 2026, publicationDate: '2026-10-20', venue: 'PRB', authors: [{ name: 'Bea Sample' }], externalIds: { DOI: '10.0000/new' } },
  { title: 'No id', year: 2026, authors: [], externalIds: {} },
] }

describe('추천 논문 (GET /api/papers/recommend)', () => {
  it('번호 있는 논문을 기준으로 묻고, 라이브러리에 있는 것을 빼고 새 것부터', async () => {
    setup('ok')
    let sent: unknown
    usePaperFetcher(async (url, init) => { if (url.includes('recommendations')) { sent = JSON.parse(String(init?.body)); return new Response(JSON.stringify(RECS)) } return new Response('', { status: 404 }) })
    const r = (await app.inject({ method: 'GET', url: '/api/papers/recommend' })).json()
    expect(sent).toEqual({ positivePaperIds: ['ArXiv:0000.00002'], negativePaperIds: [] })
    expect(r).toEqual({ seeds: 1, offline: false, picks: [
      { id: '10.0000/new', title: 'New one', authors: ['Sample'], year: '2026', venue: 'PRB', date: '2026-10-20' },
      { id: '0000.00009', title: 'Old one', authors: ['Example'], year: '2024', date: '2024-01-01' },
    ] })
  })

  it('받지 못하면 offline', async () => {
    setup('off')
    usePaperFetcher(async () => { throw new Error('no network') })
    expect((await app.inject({ method: 'GET', url: '/api/papers/recommend' })).json()).toEqual({ picks: [], seeds: 1, offline: true })
  })
})
