import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { app, repo, useSampleApp } from './testkit.js'

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

describe('분야 이름표 새 분류로 읽기 (research-library#6)', () => {
  it('옛 이름은 새 분류 이름으로, 겹치면 하나로, 모르는 이름은 그대로', async () => {
    const { renameTags } = await import('./routes/network.js')
    expect(renameTags(['Quantum Many-Body Theory', 'Condensed Matter', 'Anyons', 'Quantum Information'])).toEqual(['Quantum Many-Body', 'Anyons', 'Quantum Information Theory'])
  })
})
