import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { adoptOtherMe, otherPdfFolders } from './meSync.js'
import { Registry } from './registry.js'

// 11/20 피드백 22:30: 맥북에 적은 이름 · 소속이 맥미니 · 새 컴퓨터로 오지 않았다. 내 정보는 더 늦게 고친 컴퓨터를 따른다
const tmps: string[] = []
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

const ME = { name: 'Ada Researcher', affiliations: ['Sample Institute'] }
const ID = { name: 'Ada Researcher', email: 'ada@example.com' }

function setup(mine: Record<string, unknown>, theirs: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-me-'))
  tmps.push(root)
  const config = path.join(root, 'config')
  fs.mkdirSync(config)
  fs.writeFileSync(path.join(config, 'config.yaml'), YAML.stringify({ researches: [], authors: [], ...mine }))
  const personal = path.join(root, 'personal')
  fs.mkdirSync(path.join(personal, '_settings', 'MacBook'), { recursive: true })
  fs.writeFileSync(path.join(personal, '_settings', 'MacBook', 'config.yaml'), YAML.stringify({ researches: [], ...theirs }))
  return { root, config, personal, registry: new Registry(config) }
}

describe('내 정보 맞추기', () => {
  it('예전 설정끼리는 비어 있는 칸만 채운다', () => {
    const { registry, personal, config } = setup({}, { authors: [ME], gitIdentity: ID })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual(['authors', 'gitIdentity'])
    expect(registry.authors).toEqual([ME])
    // 다시 켜도 남는다 (커밋 이름은 예전에 설정을 다시 읽을 때 빠졌다)
    const again = new Registry(config)
    expect(again.gitIdentity).toEqual(ID)
    expect(again.authors).toEqual([ME])
  })

  it('적어 둔 값은 고친 때가 없는 다른 컴퓨터 것으로 바꾸지 않는다', () => {
    const { registry, personal } = setup({ authors: [{ name: 'Me Here' }] }, { authors: [ME] })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual([])
    expect(registry.authors).toEqual([{ name: 'Me Here', affiliations: [] }])
  })

  it('더 늦게 고친 컴퓨터의 내 정보를 따르고, 이 컴퓨터에서 고치면 그것이 새것이 된다', () => {
    const { registry, personal } = setup({ authors: [{ name: 'Old' }], meAt: '2026-11-19T10:00:00.000Z' }, { authors: [ME], gitIdentity: ID, meAt: '2026-11-19T12:00:00.000Z' })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual(['authors', 'gitIdentity'])
    expect(registry.meAt).toBe('2026-11-19T12:00:00.000Z')
    registry.setAuthors([{ name: 'Newer' }])
    expect(Date.parse(registry.meAt!)).toBeGreaterThan(Date.parse('2026-11-19T12:00:00.000Z'))
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual([])
    expect(registry.authors).toEqual([{ name: 'Newer', affiliations: [] }])
  })

  it('다른 컴퓨터의 PDF 폴더 가운데 이 컴퓨터에도 있고 아직 없는 것만 보인다', () => {
    const { root, personal } = setup({}, {})
    const here = path.join(root, 'Papers')
    fs.mkdirSync(here)
    fs.writeFileSync(path.join(personal, '_settings', 'MacBook', 'config.yaml'), YAML.stringify({ pdfFolders: [here, '/nowhere/Papers'] }))
    expect(otherPdfFolders(personal, [], undefined, 'Macmini')).toEqual([here])
    expect(otherPdfFolders(personal, [here], undefined, 'Macmini')).toEqual([])
  })

  it('PDF 폴더를 하나도 적지 않으면 라이브러리 안의 pdfs를 쓴다', () => {
    const { root, config } = setup({}, {})
    // 맥의 임시 폴더는 /var → /private/var 링크라, 실제 경로로 맞춰 비교한다
    const lib = path.join(fs.realpathSync(root), 'library')
    fs.mkdirSync(lib)
    fs.writeFileSync(path.join(config, 'config.yaml'), YAML.stringify({ researches: [], library: lib }))
    const registry = new Registry(config)
    expect(registry.pdfFoldersSet).toEqual([path.join(lib, 'pdfs')])
    expect(registry.pdfFolders).toEqual([path.join(lib, 'pdfs')])
    expect(fs.existsSync(path.join(lib, 'pdfs'))).toBe(true)
  })
})

// 11/20 피드백 02:28 진행: 네트워킹에 등록한 사람이 다른 맥에서 보이지 않았다(「사람들 0」)
describe('네트워킹 사람 목록 맞추기', () => {
  const A = { name: 'Ada E. Example' }, B = { name: 'Gus Grey' }, C = { name: 'Cy Sample' }

  it('예전 설정끼리는 서로의 목록을 합친다', () => {
    const { registry, personal, config } = setup({ people: [C] }, { people: [A, B] })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual(['people'])
    expect(registry.people.map((p) => p.name)).toEqual(['Cy Sample', 'Ada E. Example', 'Gus Grey'])
    expect(new Registry(config).people).toHaveLength(3)
  })

  it('더 늦게 고친 컴퓨터의 목록을 통째로 따르고(지운 사람도), 이 컴퓨터에서 고치면 그것이 새것이 된다', () => {
    const { registry, personal } = setup({ people: [A, B], peopleAt: '2026-11-19T10:00:00Z' }, { people: [A], peopleAt: '2026-11-19T12:00:00Z' })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual(['people'])
    expect(registry.people).toEqual([A])
    expect(registry.peopleAt).toBe('2026-11-19T12:00:00Z')
    registry.setPeople([A, C])
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual([])
    expect(registry.people).toEqual([A, C])
  })

  it('고친 때를 적은 적 없는 컴퓨터는 처음 따를 때 자기에게만 있던 사람을 남긴다', () => {
    const { registry, personal } = setup({ people: [C] }, { people: [A], peopleAt: '2026-11-20T01:00:00Z' })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual(['people'])
    expect(registry.people.map((p) => p.name)).toEqual(['Ada E. Example', 'Cy Sample'])
    // 이 컴퓨터에만 있던 사람을 더했으니 고친 때가 그쪽보다 늦어야 한다: 같으면 그쪽이 합친 목록을 받지 않고, 다음에 그쪽을 통째로 따를 때 Cy가 지워진다
    expect(Date.parse(registry.peopleAt!)).toBeGreaterThan(Date.parse('2026-11-20T01:00:00Z'))
  })

  it('내 정보와 사람 목록은 고친 때가 따로다', () => {
    const { registry, personal } = setup({ authors: [{ name: 'Me Here' }], meAt: '2026-11-20T02:00:00Z' }, { authors: [ME], meAt: '2026-11-19T00:00:00Z', people: [A], peopleAt: '2026-11-20T01:00:00Z' })
    expect(adoptOtherMe(registry, personal, 'Macmini')).toEqual(['people'])
    expect(registry.authors.map((a) => a.name)).toEqual(['Me Here'])
  })
})
