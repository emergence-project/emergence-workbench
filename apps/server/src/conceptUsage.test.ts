// 개념노트의 쓰는 곳과 인용 문헌 (10/4 16:59 피드백)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { sameWork } from './conceptUsage.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/knowledge')

describe('개념노트 쓰는 곳과 인용', () => {
  it('같은 문헌: 키, arXiv 번호(버전 무시), DOI, 제목', () => {
    const a = { key: 'a', type: 'article', source: '', eprint: '0000.00003', doi: '10.1/X', title: 'Planar Conditional Kempe Coloring' }
    expect(sameWork(a, { key: 'b', type: 'article', source: '', eprint: 'arXiv:0000.00003v2' })).toBe(true)
    expect(sameWork(a, { key: 'b', type: 'article', source: '', doi: 'https://doi.org/10.1/x' })).toBe(true)
    expect(sameWork(a, { key: 'b', type: 'article', source: '', title: 'Planar {C}onditional kempe coloring' })).toBe(true)
    expect(sameWork(a, { key: 'b', type: 'article', source: '', eprint: '0000.00002' })).toBe(false)
  })

  it('쓰는 프로젝트마다 개념노트의 출처를 그 프로젝트 bib도 갖고 있는지 (다른 키여도)', async () => {
    const lib = path.join(tmp, 'usage-library')
    fs.cpSync(path.join(fixtures, 'library'), lib, { recursive: true })
    const proj = makeRepo('usage-project')
    const yaml = path.join(proj, 'workbench', 'research.yaml')
    fs.writeFileSync(yaml, fs.readFileSync(yaml, 'utf8') + '\nconcepts: [planar-graph]\n')
    fs.writeFileSync(path.join(proj, 'refs.bib'), '@article{FR15,\n  title = {List coloring of planar graphs and approximate Kempe chains},\n  eprint = {0000.00003v3},\n}\n')
    fs.mkdirSync(path.join(tmp, 'config-usage'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config-usage', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    const m = buildApp({ configDir: path.join(tmp, 'config-usage') })
    try {
      const id = (await m.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
      const { uses } = (await m.inject({ url: '/api/concepts/planar-graph/usage' })).json()
      expect(uses).toEqual([expect.objectContaining({
        rid: id, linked: true, notes: [],
        cites: [{ key: 'ipsumListColoringPlanar2015', projectKey: 'FR15' }, { key: 'doeStructurePlanar2004' }],
      })])
      expect((await m.inject({ url: '/api/concepts/discharging-method/usage' })).json().uses).toEqual([])
    } finally { await m.close() }
  })
})
