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
  it('번호 있는 논문마다 따로 묻고, 라이브러리에 있는 것을 빼고 가까운 순서 그대로', async () => {
    setup('ok')
    const asked: string[] = []
    usePaperFetcher(async (url) => { if (url.includes('recommendations')) { asked.push(url); return new Response(JSON.stringify(RECS)) } return new Response('', { status: 404 }) })
    const r = (await app.inject({ method: 'GET', url: '/api/papers/recommend' })).json()
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('/papers/forpaper/ArXiv:0000.00002?from=recent')
    expect(r).toEqual({ seeds: 1, offline: false, picks: [
      { id: '0000.00009', title: 'Old one', authors: ['Example'], year: '2024', date: '2024-01-01' },
      { id: '10.0000/new', title: 'New one', authors: ['Sample'], year: '2026', venue: 'PRB', date: '2026-10-20' },
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

  it('기준마다 받은 것을 가까운 순서대로 번갈아 고르고, 겹치는 것은 한 번만 · 모르는 기준(404)은 건너뛴다', async () => {
    usePaperFetcher(async (url) => url.includes('0000.00001') ? recs({ ArXiv: '0000.00011' }, { ArXiv: '0000.00012' }, { ArXiv: '0000.00013' })
      : url.includes('0000.00002') ? recs({ ArXiv: '0000.00021' }, { ArXiv: '0000.00011' })
      : new Response('', { status: 404 }))
    const r = await recommendPapers([row('a', { eprint: '0000.00001' }, 0, 3), row('b', { eprint: '0000.00002' }, 0, 2), row('c', { eprint: '0000.00003' }, 0, 1)])
    expect(r.picks.map((p) => p.id)).toEqual(['0000.00011', '0000.00021', '0000.00012', '0000.00013'])
    expect(r.offline).toBe(false)
  })

  it('기준의 순서만 바뀌면 다시 묻지 않고, 받지 못한 것은 몇 분 동안 기억한다', async () => {
    let calls = 0
    usePaperFetcher(async () => { calls++; return new Response('', { status: 429 }) })
    const a = row('a', { eprint: '0000.00001' }, 0, 2), b = row('b', { eprint: '0000.00002' }, 1, 1)
    const swapped = [{ ...a, opened: 1 }, { ...b, opened: 2 }]
    const t0 = 1_000_000
    expect(await recommendPapers([a, b], t0)).toEqual({ picks: [], seeds: 2, offline: true, status: 429 })
    expect(await recommendPapers(swapped, t0 + 60_000)).toEqual({ picks: [], seeds: 2, offline: true, status: 429 })
    expect(calls).toBe(2)
    usePaperFetcher(async () => { calls++; return recs({ ArXiv: '0000.00003' }) })
    expect((await recommendPapers([a, b], t0 + 5 * 60_000 + 1)).picks.map((p) => p.id)).toEqual(['0000.00003'])
    expect((await recommendPapers(swapped, t0 + 3_600_000)).picks.map((p) => p.id)).toEqual(['0000.00003'])
    expect(calls).toBe(4)
  })

  it('일부 기준만 받지 못했으면 받은 것을 보이되 몇 분 뒤 다시 묻는다 (한도에 걸린 반쪽 답을 6시간 붙들지 않게)', async () => {
    let calls = 0
    usePaperFetcher(async (url) => { calls++; return url.includes('0000.00007') ? new Response('', { status: 404 }) : new Response('', { status: 429 }) })
    const a = row('a', { eprint: '0000.00007' }, 0, 2), b = row('b', { eprint: '0000.00008' }, 1, 1)
    const t0 = 2_000_000
    expect(await recommendPapers([a, b], t0)).toMatchObject({ picks: [], offline: false })
    usePaperFetcher(async (url) => { calls++; return url.includes('0000.00007') ? new Response('', { status: 404 }) : recs({ ArXiv: '0000.00009' }) })
    expect((await recommendPapers([a, b], t0 + 60_000)).picks).toEqual([])
    expect(calls).toBe(2)
    expect((await recommendPapers([a, b], t0 + 5 * 60_000 + 1)).picks.map((p) => p.id)).toEqual(['0000.00009'])
    expect(calls).toBe(4)
  })
})

describe('추천 논문: 관심 분야 (분류에서 고르기)', () => {
  const tagged = (key: string, eprint: string, subjects: string[], opened: number): PaperRow => ({ ...row(key, { eprint }, 0, opened), subjects })
  it('고른 분야마다 그 분류(하위 포함)의 논문을 번갈아 기준으로 삼고, 추천에 어느 분야인지 붙인다', async () => {
    usePaperFetcher(async (url) => url.includes('0000.00001') ? recs({ ArXiv: '0000.00011' }, { ArXiv: '0000.00012' })
      : url.includes('0000.00003') ? recs({ ArXiv: '0000.00031' })
      : recs({ ArXiv: '0000.00099' }))
    const papers = [tagged('a', '0000.00001', ['math/graph'], 3), tagged('b', '0000.00002', ['phys'], 2), tagged('c', '0000.00003', ['cs/ml'], 1)]
    const interests = { chosen: ['math', 'cs'], choices: [], hash: '' }
    const r = await recommendPapers(papers, 0, interests)
    expect(r.seeds).toBe(2)
    expect(r.picks.map((p) => [p.id, p.from])).toEqual([['0000.00011', 'math'], ['0000.00031', 'cs'], ['0000.00012', 'math']])
    expect(r.interests).toBe(interests)
  })

  it('분류 나무가 있으면 recommend.yaml에 고른 것을 적고, 나무에 없는 분류는 받지 않는다', async () => {
    setup('interests')
    const lib = app.registry.libraryPath!
    fs.writeFileSync(path.join(lib, 'subjects.yaml'), 'math:\n  name: Mathematics\nmath/graph:\n  name: Graph Theory\ncs:\n  name: Computer Science\n')
    usePaperFetcher(async () => new Response('', { status: 404 }))
    const before = (await app.inject({ method: 'GET', url: '/api/papers/recommend' })).json()
    expect(before.interests.chosen).toEqual([])
    expect(before.interests.choices).toEqual([{ id: 'math', name: 'Mathematics' }, { id: 'cs', name: 'Computer Science' }])
    expect((await app.inject({ method: 'PUT', url: '/api/papers/interests', payload: { interests: ['nope'], baseHash: before.interests.hash } })).statusCode).toBe(400)
    const saved = (await app.inject({ method: 'PUT', url: '/api/papers/interests', payload: { interests: ['math/graph'], baseHash: before.interests.hash } })).json()
    expect(saved.chosen).toEqual(['math/graph'])
    expect(saved.choices.at(-1)).toEqual({ id: 'math/graph', name: 'Mathematics › Graph Theory' })
    expect(fs.readFileSync(path.join(lib, 'recommend.yaml'), 'utf8')).toBe('interests:\n  - math/graph\n')
    // 옛 해시로는 고치지 않는다 (다른 맥이 먼저 바꿨을 때)
    expect((await app.inject({ method: 'PUT', url: '/api/papers/interests', payload: { interests: [], baseHash: before.interests.hash } })).statusCode).toBe(409)
  })
})
