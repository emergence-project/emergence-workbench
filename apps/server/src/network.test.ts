import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('네트워킹 (사람과 노트 참고 문헌의 논문)', () => {
  it('저자와 소속의 사람이 저절로 들어오고, 사람 페이지에 그 사람이 저자인 bib 항목이 보인다', async () => {
    fs.writeFileSync(path.join(repo, 'refs.bib'), [
      '@article{ex2022, title = {Discharging rules}, author = {Collaborator, Ben and Sample, Bea}, year = {2022}, eprint = {0000.00001}}',
      '@article{other, title = {Something else}, author = {Example, Eve-Ann}, year = {2020}}',
      '',
    ].join('\n'))
    const list = (await app.inject({ method: 'GET', url: '/api/network' })).json()
    expect(list.people.map((p: { id: string }) => p.id)).toContain('ben-collaborator')

    const ben = (await app.inject({ method: 'GET', url: '/api/network/people/ben-collaborator' })).json()
    expect(ben.person.author).toBe(true)
    expect(ben.papers.map((p: { key: string }) => p.key)).toEqual(['ex2022'])
    expect(ben.papers[0].where[0].rid).toBe('sample-research')
  })

  it('사람을 더하고 빼면 앱 설정에 남는다', async () => {
    const put = await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [{ name: 'Bea Sample' }] } })
    expect(put.statusCode).toBe(200)
    const bea = (await app.inject({ method: 'GET', url: '/api/network/people/bea-sample' })).json()
    expect(bea.person.added).toBe(true)
    expect(bea.papers.map((p: { key: string }) => p.key)).toEqual(['ex2022'])

    await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [] } })
    expect((await app.inject({ method: 'GET', url: '/api/network/people/bea-sample' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: 'x' } })).statusCode).toBe(400)
  })

  it('등록 추천은 bib에서 아는 것(편 수, 다른 이름, 최근 논문, 있는 곳)만 주고, 사람 페이지는 함께 쓴 사람을 준다', async () => {
    fs.writeFileSync(path.join(repo, 'refs.bib'), [
      '@article{a, title = {First}, author = {Tester, Theo and Collaborator, Ben}, year = {2019}}',
      '@article{b, title = {Second}, author = {Tester, T. and Sample, Bea}, year = {2021}}',
      '',
    ].join('\n'))
    const { suggestions } = (await app.inject({ method: 'GET', url: '/api/network/suggestions' })).json()
    const kato = suggestions.find((s: { name: string }) => s.name === 'Theo Tester')
    expect(kato).toMatchObject({ count: 2, aliases: ['T. Tester'], latest: { title: 'Second', year: '2021' }, where: ['예제 연구 — 5색 정리 재유도'] })

    await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [{ name: 'Theo Tester', affiliations: ['Example University'], email: 'k@x.jp' }] } })
    const page = (await app.inject({ method: 'GET', url: '/api/network/people/theo-tester' })).json()
    expect(page.person).toMatchObject({ affiliations: ['Example University'], orgs: ['Example University'], email: 'k@x.jp' })
    expect(page.coauthors).toEqual([{ id: 'ben-collaborator', name: 'Ben Collaborator', count: 1 }])
  })
})

describe('분야 이름표 새 분류로 읽기', () => {
  it('옛 이름은 새 분류 이름으로, 겹치면 하나로, 모르는 이름은 그대로', async () => {
    const { renameTags } = await import('./routes/network.js')
    expect(renameTags(['Quantum Many-Body Theory', 'Condensed Matter', 'Anyons', 'Quantum Information'])).toEqual(['Quantum Many-Body', 'Anyons', 'Quantum Information Theory'])
  })

  it('사람 페이지 (10/19): 사진을 넣고 빼고, 찾지 않는 모드의 새 논문은 저장된 것만, 나오는 곳에 이름이 든 기록', async () => {
    fs.writeFileSync(path.join(repo, 'refs.bib'), '@article{ex2022, title = {Discharging rules}, author = {Collaborator, Ben and Sample, Bea}, year = {2022}, eprint = {0000.00001}}\n')
    await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [{ name: 'Bea Sample', s2: '777' }] } })
    const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')
    const put = await app.inject({ method: 'PUT', url: '/api/network/people/bea-sample/photo', payload: { data: png } })
    expect(put.statusCode).toBe(200)
    const bea = put.json().people.find((p: { id: string }) => p.id === 'bea-sample')
    expect(bea).toMatchObject({ s2: '777', photo: expect.any(Number) })
    const img = await app.inject({ method: 'GET', url: '/api/network/people/bea-sample/photo' })
    expect(img.headers['content-type']).toBe('image/png')
    expect((await app.inject({ method: 'PUT', url: '/api/network/people/bea-sample/photo', payload: { data: 'data:text/html;base64,AA==' } })).statusCode).toBe(400)
    await app.inject({ method: 'DELETE', url: '/api/network/people/bea-sample/photo' })
    expect((await app.inject({ method: 'GET', url: '/api/network/people/bea-sample/photo' })).statusCode).toBe(404)

    // 테스트 앱은 바깥에 묻지 않는다: 저장된 것(people-papers.json)만 돌려준다
    fs.writeFileSync(path.join(tmp, 'config', 'people-papers.json'), JSON.stringify({ 'bea-sample': { at: 1, source: 's2', key: 's2:777', seen: ['arxiv:1'], hidden: ['arxiv:3'], papers: [
      { id: 'arxiv:2', title: 'New one', date: '2026-10-10', authors: ['Bea Sample'], arxiv: '2610.2', url: 'https://arxiv.org/abs/2610.2' },
      { id: 'arxiv:1', title: 'Discharging rules', date: '2026-10-01', authors: ['Bea Sample'], arxiv: '0000.00001', url: 'https://arxiv.org/abs/0000.00001' },
      { id: 'arxiv:3', title: 'Namesake', date: '2026-10-02', authors: ['B. Sample'], url: 'https://arxiv.org/abs/3' },
    ] } }))
    const np = (await app.inject({ method: 'GET', url: '/api/network/people/bea-sample/new-papers' })).json()
    expect(np).toMatchObject({ live: false, source: 's2', hidden: 1 })
    expect(np.papers.map((p: { id: string; fresh: boolean; inLibrary: boolean }) => [p.id, p.fresh, p.inLibrary])).toEqual([['arxiv:2', true, false], ['arxiv:1', false, true]])
    expect((await app.inject({ method: 'GET', url: '/api/network' })).json().people.find((p: { id: string }) => p.id === 'bea-sample').newPapers).toBe(1)
    await app.inject({ method: 'POST', url: '/api/network/people/bea-sample/new-papers/seen' })
    expect((await app.inject({ method: 'GET', url: '/api/network' })).json().people.find((p: { id: string }) => p.id === 'bea-sample').newPapers).toBeUndefined()

    await app.inject({ method: 'POST', url: '/api/researches/sample-research/comments/project', payload: { kind: '메모', title: 'p', text: 'Bea Sample에게 그림 물어보기' } })
    const page = (await app.inject({ method: 'GET', url: '/api/network/people/bea-sample' })).json()
    const here = page.appears.find((a: { rid: string }) => a.rid === 'sample-research')
    expect(here.papers).toBeGreaterThan(0)
    expect(here.records.map((r: { text: string }) => r.text)).toContain('Bea Sample에게 그림 물어보기')
    await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [] } })
  })
})
