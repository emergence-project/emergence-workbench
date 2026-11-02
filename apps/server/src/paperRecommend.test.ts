// 추천 논문 (GET /api/papers/recommend): 기준 고르기, 라이브러리에 있는 것 빼기, 받지 못하면 offline
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PaperRow } from '@rw/core/contract/papers'
import { usePaperFetcher } from './paperAdd.js'
import { forgetRecommendations, recommendPapers } from './paperRecommend.js'
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

const row = (key: string, ids: { eprint?: string; doi?: string }, added: number, opened?: number): PaperRow => ({
  key, subjects: [], subjectsHash: '', type: 'article', kind: 'paper', title: key, authors: [], projects: [], autoProjects: [],
  pdf: { where: 'none' }, comments: 0, waiting: 0, answered: 0, added, ...ids, ...(opened && { opened }),
})
const recs = (...ids: { ArXiv?: string; DOI?: string }[]) => new Response(JSON.stringify({ recommendedPapers: ids.map((externalIds, i) => ({ title: `P${i}`, year: 2026, authors: [], externalIds })) }))

describe('추천 논문: 같은 논문 · 다시 묻기', () => {
  it('arXiv 판과 저널 판은 한 논문: 라이브러리에 DOI만 있어도 그 논문의 arXiv 판은 추천하지 않는다', async () => {
    usePaperFetcher(async () => recs({ ArXiv: '0000.00010', DOI: '10.0000/HAVE' }, { ArXiv: '0000.00011' }))
    expect((await recommendPapers([row('twin', { doi: '10.0000/have' }, 0)])).picks.map((p) => p.id)).toEqual(['0000.00011'])
  })

  it('기준의 순서만 바뀌면 다시 묻지 않고, 받지 못한 것은 몇 분 동안 기억한다', async () => {
    let calls = 0
    usePaperFetcher(async () => { calls++; return new Response('', { status: 429 }) })
    const a = row('a', { eprint: '0000.00001' }, 0, 2), b = row('b', { eprint: '0000.00002' }, 1, 1)
    const swapped = [{ ...a, opened: 1 }, { ...b, opened: 2 }]
    const t0 = 1_000_000
    expect(await recommendPapers([a, b], t0)).toEqual({ picks: [], seeds: 2, offline: true, status: 429 })
    expect(await recommendPapers(swapped, t0 + 60_000)).toEqual({ picks: [], seeds: 2, offline: true, status: 429 })
    expect(calls).toBe(1)
    usePaperFetcher(async () => { calls++; return recs({ ArXiv: '0000.00003' }) })
    expect((await recommendPapers([a, b], t0 + 5 * 60_000 + 1)).picks.map((p) => p.id)).toEqual(['0000.00003'])
    expect((await recommendPapers(swapped, t0 + 3_600_000)).picks.map((p) => p.id)).toEqual(['0000.00003'])
    expect(calls).toBe(2)
  })
})
