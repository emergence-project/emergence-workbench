import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { ConceptIndex } from './conceptIndex.js'

const note = (title: string, o: { subject?: string; aliases?: string[]; related?: string[]; body?: string } = {}) =>
  `---\ntitle: ${title}\n${o.subject ? `subject: ${o.subject}\n` : ''}${o.aliases ? `aliases:\n${o.aliases.map((a) => `  - ${a}\n`).join('')}` : ''}${o.related ? `related:\n${o.related.map((a) => `  - ${a}\n`).join('')}` : ''}---\n# ${title}\n\n## Definition\n\n${o.body ?? 'A sentence that is long enough to count as real prose for this note.'}\n`

describe('개념노트 색인', () => {
  let lib: string
  let ix: ConceptIndex
  const write = (id: string, text: string) => fs.writeFileSync(path.join(lib, 'concepts', `${id}.md`), text)
  beforeAll(() => {
    lib = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-cindex-'))
    fs.mkdirSync(path.join(lib, 'concepts'))
    write('pg', note('Planar graph', { subject: 'Mathematics › GT', aliases: ['plane graph'], body: 'Zero [[Euler formula]] and the [[Kempe recoloring]] and [[Nowhere]]. 정이십면체와 관련.' }))
    write('euler', note('Euler formula', { subject: 'Mathematics › GT', related: ['plane graph'] }))
    write('kempe', note('Kempe recoloring', { subject: 'Mathematics › GT', body: '' }))
    write('dis', note('Discharging method', { subject: 'Mathematics › CO', body: 'Charges. TODO: add phases and more text so it is long enough here.' }))
    write('lone', note('Lonely', {}))
    fs.writeFileSync(path.join(lib, 'concepts', 'pg.memo.md'), '- [ ] memo is not a note\n')
    ix = new ConceptIndex(lib, path.join(lib, '.idx', 'c.sqlite'))
  })
  afterAll(() => { ix.close(); fs.rmSync(lib, { recursive: true, force: true }) })

  it('목록: 빈 노트는 기본으로 숨기고, 거르기·분류·쪽 나누기', () => {
    expect(ix.refresh(true)).toEqual({ read: 5, removed: 0 })
    const all = ix.list({})
    expect(all.items.map((r) => r.id)).toEqual(['dis', 'euler', 'lone', 'pg'])
    expect(ix.list({ showEmpty: true }).total).toBe(5)
    expect(ix.list({ filter: 'unfinished', showEmpty: true }).items.map((r) => r.id)).toEqual(['dis', 'kempe'])
    expect(ix.list({ subject: 'Mathematics › GT' }).items.map((r) => r.id)).toEqual(['euler', 'pg'])
    expect(ix.list({ subject: '' }).items.map((r) => r.id)).toEqual(['lone'])
    expect(ix.list({ limit: 2, offset: 2 })).toMatchObject({ total: 4, items: [{ id: 'lone' }, { id: 'pg' }] })
    expect(ix.subjects({})).toEqual([{ subject: 'Mathematics › CO', count: 1 }, { subject: 'Mathematics › GT', count: 2 }, { subject: '', count: 1 }])
  })

  it('찾기: 이름·다른 이름은 띄어쓰기·대소문자 없이, 본문은 전문 검색 (한글도)', () => {
    expect(ix.list({ q: 'plane' }).items.map((r) => r.id)).toEqual(['pg'])
    expect(ix.list({ q: 'planegraph' }).items[0]!.id).toBe('pg')
    expect(ix.list({ q: '이십면' }).items.map((r) => r.id)).toEqual(['pg'])
    // 이름이 찾는 말로 시작하는 노트가 앞에
    expect(ix.list({ q: 'kempe' }).items.map((r) => r.id)).toEqual(['kempe', 'pg'])
    // 찾기 중에는 빈 노트도 보인다
    expect(ix.list({ q: 'recoloring' }).items.map((r) => r.id)).toContain('kempe')
  })

  it('링크: 나가는 링크, 들어오는 링크(별칭으로 가리켜도), 노트가 없는 이름', () => {
    expect(ix.links('pg')).toMatchObject({ out: [{ id: 'euler' }, { id: 'kempe' }], back: [{ id: 'euler' }], missing: ['Nowhere'] })
    expect(ix.links('kempe').back.map((r) => r.id)).toEqual(['pg'])
    expect(ix.resolve('plane graph')?.id).toBe('pg')
    expect(ix.resolve('Concepts/Kempe recoloring.md#x')?.id).toBe('kempe')
    expect(ix.resolve('Nowhere')).toBeNull()
    expect(ix.rows(['kempe', 'nope', 'pg', 'planargraph']).map((r) => r.id)).toEqual(['kempe', 'pg', 'pg'])
  })

  it('바뀐 파일만 다시 읽고, 지운 파일은 뺀다. 다시 열어도 그대로', () => {
    write('lone', note('Lonely', { subject: 'Misc' }))
    fs.utimesSync(path.join(lib, 'concepts', 'lone.md'), new Date(), new Date(Date.now() + 5000))
    fs.rmSync(path.join(lib, 'concepts', 'dis.md'))
    expect(ix.refresh(true)).toEqual({ read: 1, removed: 1 })
    expect(ix.refresh(true)).toEqual({ read: 0, removed: 0 })
    expect(ix.list({ subject: 'Misc' }).items.map((r) => r.id)).toEqual(['lone'])
    ix.close()
    ix = new ConceptIndex(lib, path.join(lib, '.idx', 'c.sqlite'))
    expect(ix.refresh(true)).toEqual({ read: 0, removed: 0 })
    expect(ix.list({ showEmpty: true }).total).toBe(4)
  })

  it('노트 2만 개: 처음 색인 뒤 목록·찾기·링크가 빠르다', () => {
    const big = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-cindex-big-'))
    try {
      fs.mkdirSync(path.join(big, 'concepts'))
      const N = 20000
      for (let i = 0; i < N; i++) {
        const links = [1, 7, 31].map((d) => `[[Concept ${(i + d) % N}]]`).join(', ')
        fs.writeFileSync(path.join(big, 'concepts', `c${i}.md`), note(`Concept ${i}`, { subject: `Field ${i % 40} › Area ${i % 7}`, body: `Concept number ${i} relates to ${links} with enough prose here.` }))
      }
      const bix = new ConceptIndex(big, path.join(big, '.idx', 'c.sqlite'))
      let t = performance.now()
      expect(bix.refresh(true).read).toBe(N)
      const build = performance.now() - t
      const time = (f: () => unknown) => { const s = performance.now(); f(); return performance.now() - s }
      bix.refresh(true) // 바뀐 것 없음: stat만
      const ms = {
        rescan: time(() => bix.refresh(true)),
        list: time(() => bix.list({ limit: 50 })),
        subjects: time(() => bix.subjects({})),
        search: time(() => bix.list({ q: 'Concept 1234' })),
        fulltext: time(() => bix.list({ q: 'number 19999' })),
        links: time(() => bix.links('c500')),
      }
      expect(bix.links('c500').back.map((r) => r.id).sort()).toEqual(['c469', 'c493', 'c499'])
      console.log(`2만 개 색인 ${Math.round(build)}ms`, Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v)])))
      for (const [k, v] of Object.entries(ms)) expect(v, k).toBeLessThan(k === 'rescan' ? 1000 : 300)
      bix.close()
    } finally { fs.rmSync(big, { recursive: true, force: true }) }
  }, 120_000)
})

describe('개념노트 색인: 한글 이름의 [[링크]]', () => {
  it('한글 제목·다른 이름으로 링크가 이어지고, 옛 색인(버전 4)은 다시 만든다', () => {
    const lib = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-cindex-ko-'))
    fs.mkdirSync(path.join(lib, 'concepts'))
    const write = (id: string, text: string) => fs.writeFileSync(path.join(lib, 'concepts', `${id}.md`), text)
    write('bp', note('오일러 지표', { aliases: ['오일러 특성수'], body: '[[그래프 색칠]]와 [[없는 개념]]을 쓴다. 한 문장을 더 써서 충분히 길게 한다.' }))
    write('ee', note('그래프 색칠', { body: '[[오일러 특성수]]에서 쓴다. 한 문장을 더 써서 충분히 길게 한다.' }))
    const dbFile = path.join(lib, '.idx', 'c.sqlite')
    // 고치기 전 버전의 빈 색인이 남아 있어도
    fs.mkdirSync(path.dirname(dbFile))
    new DatabaseSync(dbFile).exec('CREATE TABLE notes (id TEXT); PRAGMA user_version = 4;')
    const ix = new ConceptIndex(lib, dbFile)
    try {
      expect(ix.resolve('오일러 지표')?.id).toBe('bp')
      expect(ix.resolve('오일러 특성수')?.id).toBe('bp')
      expect(ix.links('bp')).toMatchObject({ out: [{ id: 'ee' }], back: [{ id: 'ee' }], missing: ['없는 개념'] })
      expect(ix.rows(['오일러지표']).map((r) => r.id)).toEqual(['bp'])
    } finally {
      ix.close()
      fs.rmSync(lib, { recursive: true, force: true })
    }
  })
})

describe('개념노트 색인 API', () => {
  let tmp: string
  let app: ReturnType<typeof buildApp>
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-cindex-api-'))
    const lib = path.join(tmp, 'library')
    fs.cpSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/knowledge/library'), lib, { recursive: true })
    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    app = buildApp({ configDir: path.join(tmp, 'config') })
  })
  afterAll(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

  it('목록·분류·줄·링크', async () => {
    const l = (await app.inject({ url: '/api/concepts/list?filter=all&showEmpty=1' })).json()
    expect(l.items.map((r: { id: string }) => r.id)).toEqual(['discharging-method', 'graph-coloring', 'planar-graph'])
    expect((await app.inject({ url: '/api/concepts/list?q=PG' })).json().items[0].id).toBe('planar-graph')
    expect((await app.inject({ url: '/api/concepts/subjects?showEmpty=1' })).json().subjects).toEqual([{ subject: 'Mathematics › Combinatorics', count: 1 }, { subject: 'Mathematics › Graph Theory', count: 2 }])
    expect((await app.inject({ url: '/api/concepts/rows?ids=discharging-method' })).json().items[0].title).toBe('Discharging method')
    expect((await app.inject({ url: '/api/concepts/resolve?name=Discharging%20method' })).json().note.id).toBe('discharging-method')
    expect((await app.inject({ url: '/api/concepts/resolve?name=nothing-here' })).json().note).toBeNull()
    const links = (await app.inject({ url: '/api/concepts/planar-graph/links' })).json()
    expect(links.missing).toEqual(expect.arrayContaining(['Euler formula', 'Kempe recoloring']))
    expect(fs.readdirSync(path.join(tmp, 'config', 'index')).filter((f) => f.endsWith('.sqlite'))).toHaveLength(1)
  })

  it('편집기의 [@ 찾기: references.bib에서 키·제목·저자·연도로', async () => {
    const all = (await app.inject({ url: '/api/concepts/bib' })).json().items
    expect(all.map((e: { key: string }) => e.key)).toEqual(['doeStructurePlanar2004', 'ipsumListColoringPlanar2015'])
    expect((await app.inject({ url: '/api/concepts/bib?q=ipsum' })).json().items.map((e: { key: string }) => e.key)).toEqual(['ipsumListColoringPlanar2015'])
    // 저자와 제목 낱말을 띄어 써도 찾는다 (순서 무관)
    const keys = async (q: string) => (await app.inject({ url: `/api/concepts/bib?q=${encodeURIComponent(q)}` })).json().items.map((e: { key: string }) => e.key)
    expect(await keys('list ipsum')).toEqual(['ipsumListColoringPlanar2015'])
    expect(await keys('doe structure')).toEqual(['doeStructurePlanar2004'])
    expect(await keys('2015')).toEqual(['ipsumListColoringPlanar2015'])
    expect(await keys('list 2015 ipsum')).toEqual(['ipsumListColoringPlanar2015'])
    expect(await keys('2004 ipsum')).toEqual([])
    expect(await keys('doe ipsum')).toEqual([])
    // 키에 연도가 없어도 year 필드로 찾는다.
    fs.appendFileSync(path.join(tmp, 'library', 'references.bib'), '\n@article{yearless-key, author = {Example, Ada}, title = {Coloring structure}, year = {1998}}\n')
    expect(await keys('1998')).toEqual(['yearless-key'])
    expect(await keys('structure 1998 example')).toEqual(['yearless-key'])
  })
})
