import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { usePaperFetcher } from './paperAdd.js'
import { freshCount, markPapers, readPeoplePapers, refreshPersonPapers, useS2Wait } from './peoplePapers.js'
useS2Wait(async () => undefined)

const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-people-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
afterEach(() => usePaperFetcher(async () => new Response('', { status: 599 })))

const now = Date.parse('2026-10-19T00:00:00Z')
const entry = (id: string, date: string, authors: string[], title = `Paper ${id}`) =>
  `<entry><id>http://arxiv.org/abs/${id}v1</id><published>${date}T10:00:00Z</published><title>${title}</title>${authors.map((a) => `<author><name>${a}</name></author>`).join('')}</entry>`

describe('사람 페이지의 새 논문', () => {
  it('arXiv: 이름 첫 글자까지 맞는 저자의 최근 90일 논문만, 처음 찾은 것은 본 것으로', async () => {
    const urls: string[] = []
    usePaperFetcher(async (url) => {
      urls.push(url)
      return new Response(`<feed>${entry('2610.00001', '2026-10-10', ['Ada E. Example', 'Bea Sample'])}${entry('2610.00002', '2026-10-11', ['Adam Example'])}${entry('2601.00003', '2026-01-02', ['Ada Example'])}${entry('2610.00004', '2026-10-12', ['Zed Example'])}</feed>`)
    })
    const e = await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', aliases: ['A. Example'] }, { now })
    expect(decodeURIComponent(urls[0]!)).toContain('search_query=au:example_a')
    expect(e.source).toBe('arxiv')
    // Adam도 성 · 첫 글자가 같아 걸린다(그래서 "이 사람 아님"과 Semantic Scholar ID가 있다). 90일 밖 · 다른 첫 글자는 빠진다
    expect(e.papers.map((p) => p.arxiv)).toEqual(['2610.00002', '2610.00001'])
    expect(freshCount(e)).toBe(0)
  })

  it('하루 안에는 다시 찾지 않고, 하루가 지나면 새로 나온 논문만 새것이며 숨긴 것은 세지 않는다', async () => {
    let calls = 0
    usePaperFetcher(async () => { calls++; return new Response(`<feed>${entry('2610.00009', '2026-10-19', ['Ada Example'])}${entry('2610.00001', '2026-10-10', ['Ada E. Example'])}</feed>`) })
    await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', aliases: ['A. Example'] }, { now: now + 60_000 })
    expect(calls).toBe(0)
    const e = await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', aliases: ['A. Example'] }, { now: now + 25 * 3600_000 })
    expect(calls).toBe(1)
    expect(freshCount(e)).toBe(1)
    markPapers(dir, 'ada-e-example', { hide: 'arxiv:2610.00009' })
    expect(freshCount(readPeoplePapers(dir)['ada-e-example'])).toBe(0)
  })

  it('Semantic Scholar 저자 ID가 있으면 그 ID로 찾고(찾는 법이 바뀌면 바로), 실패하면 지난 결과를 남긴다', async () => {
    usePaperFetcher(async (url) => {
      expect(url).toContain('/author/12345/papers')
      return Response.json({ data: [
        { paperId: 'p1', title: 'Kempe chains', publicationDate: '2026-10-01', externalIds: { ArXiv: '2610.01234', DOI: '10.1/x' }, authors: [{ name: 'Ada Example' }] },
        { paperId: 'p2', title: 'Old one', publicationDate: '2025-01-01', externalIds: null, authors: [] },
        { paperId: 'p3', title: 'No arXiv', publicationDate: '2026-09-30', externalIds: {}, authors: [{ name: 'Ada Example' }], url: 'https://www.semanticscholar.org/paper/p3' },
      ] })
    })
    const e = await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', s2: '12345' }, { now: now + 26 * 3600_000 })
    expect(e.source).toBe('s2')
    expect(e.papers.map((p) => p.id)).toEqual(['arxiv:2610.01234', 's2:p3'])
    expect(e.papers[0]).toMatchObject({ doi: '10.1/x', url: 'https://arxiv.org/abs/2610.01234' })

    usePaperFetcher(async () => new Response('', { status: 503 }))
    const failed = await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', s2: '12345' }, { now: now + 60 * 3600_000 })
    expect(failed.error).toContain('503')
    expect(failed.papers).toHaveLength(2)
    // 요청이 많음(429)은 두 번 더 해 보고, 그래도 안 되면 한 시간 뒤에 다시 찾는다
    let tries = 0
    usePaperFetcher(async () => { tries++; return new Response('', { status: 429 }) })
    const busy = await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', s2: '12345' }, { now: now + 90 * 3600_000 })
    expect(tries).toBe(3)
    expect(busy.error).toMatch(/요청이 많아|busy/)
    expect(await refreshPersonPapers(dir, 'ada-e-example', { name: 'Ada E. Example', s2: '12345' }, { now: now + 91.5 * 3600_000 })).not.toBe(busy)
  })
})
