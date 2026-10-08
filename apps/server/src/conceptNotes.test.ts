import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { createConceptMd, listConceptMd, parseMacros, readConceptMemo, readConceptMd, setConceptChecked, setConceptLocked, splitFrontmatter, unfinishedReasons } from './conceptNotes.js'
import { buildKnowledge } from './knowledge.js'
import { listLibraryNotes } from './libraryNotes.js'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/knowledge')

describe('Markdown 개념노트', () => {
  let lib: string
  beforeAll(() => {
    lib = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-concepts-'))
    fs.cpSync(path.join(fixtures, 'library'), lib, { recursive: true })
  })
  afterAll(() => fs.rmSync(lib, { recursive: true, force: true }))

  it('목록: 확인함·확인 뒤 고침·미완성을 본문에서 계산한다', () => {
    const by = Object.fromEntries(listConceptMd(lib).map((n) => [n.id, n]))
    expect(by['planar-graph']).toMatchObject({ checked: 'ok', unfinished: [] })
    expect(by['planar-graph']!.meta.aliases).toEqual(['PG', 'plane graph'])
    expect(by['graph-coloring']).toMatchObject({ checked: 'changed', unfinished: [] })
    expect(by['discharging-method']!.checked).toBe('none')
    expect(by['discharging-method']!.unfinished).toEqual(['빈 절: 성질', 'TODO·작성 중 표시'])
  })

  it('Study에서 만든 개념노트: 본문은 기본 양식, 원문은 옆 메모에 재료로', () => {
    createConceptMd(lib, 'from-study', { title: 'From study', study: { path: 'Concept-Space/X.md', text: 'Original $x$ text.' } })
    const n = readConceptMd(lib, 'from-study')
    expect(n.meta.study).toBe('Concept-Space/X.md')
    expect(n.body).toContain('## Definition')
    expect(n.body).not.toContain('Original')
    expect(readConceptMemo(lib, 'from-study').text).toContain('## Study 원문 (Concept-Space/X.md)\n\nOriginal $x$ text.')
    expect(() => createConceptMd(lib, 'from-study', { title: 'Again' })).toThrow(/이미 있는/)
    fs.rmSync(path.join(lib, 'concepts', 'from-study.md')); fs.rmSync(path.join(lib, 'concepts', 'from-study.memo.md'))
  })

  it('미완성 기준', () => {
    expect(unfinishedReasons('# Title\n\n## 정의\n\n## 예\n')).toEqual(['제목·틀뿐'])
    const long = 'A sentence that is long enough to count as real prose for the note. '
    // 더 깊은 제목만 있는 절은 빈 절이 아니다
    expect(unfinishedReasons(`# T\n## Definition\n${long}\n## A\n### A1\n${long}\n## B\n`)).toEqual(['빈 절: B'])
    // ## Definition 절이 없어도 미완성이 아니다 (10/6: "맨 위에 무엇인지부터"는 README 규칙 4, 기계 판정 아님)
    expect(unfinishedReasons(`# T\n${long}\n`)).toEqual([])
    expect(unfinishedReasons(`# T\n## 정의\n${long}\n`)).toEqual([])
    // 체크하지 않은 할 일 상자는 TODO로 센다. 체크한 것과 코드 블록 안은 세지 않는다
    expect(unfinishedReasons(`# T\n${long}\n- [ ] 예 더하기\n`)).toEqual(['TODO·작성 중 표시'])
    expect(unfinishedReasons(`# T\n${long}\n  * [ ] nested\n`)).toEqual(['TODO·작성 중 표시'])
    expect(unfinishedReasons(`# T\n${long}\n- [x] 끝냄\n`)).toEqual([])
    expect(unfinishedReasons(`# T\n${long}\n\`\`\`\n- [ ] in code\n\`\`\`\n`)).toEqual([])
    // 코드·표시 수식 안의 TODO와 제목은 보지 않는다
    expect(unfinishedReasons(`# T\n## Definition\n${long}\n\`\`\`\n# TODO\n\`\`\`\n$$\nTODO\n$$\n`)).toEqual([])
    expect(unfinishedReasons(`# T\n## Definition\n${long}\n> [!todo] 증명 채우기\n`)).toEqual(['TODO·작성 중 표시'])
  })

  it('확인함·잠금은 머리말만 고치고 본문 바이트는 그대로 둔다', () => {
    const file = path.join(lib, 'concepts', 'discharging-method.md')
    const before = splitFrontmatter(fs.readFileSync(file, 'utf8')).body
    let n = setConceptChecked(lib, 'discharging-method', true, readConceptMd(lib, 'discharging-method').hash)
    expect(n.checked).toBe('ok')
    n = setConceptLocked(lib, 'discharging-method', true, n.hash)
    expect(n.meta.locked).toBe(true)
    const raw = fs.readFileSync(file, 'utf8')
    expect(splitFrontmatter(raw).body).toBe(before)
    expect(raw).toContain('subject: Mathematics › Combinatorics')
    // 본문을 바깥에서 고치면 확인 뒤 고침
    fs.writeFileSync(file, raw.replace('is negative', 'is negative (below zero)'))
    expect(readConceptMd(lib, 'discharging-method').checked).toBe('changed')
    // 끄기
    n = setConceptChecked(lib, 'discharging-method', false, readConceptMd(lib, 'discharging-method').hash)
    n = setConceptLocked(lib, 'discharging-method', false, n.hash)
    expect(n).toMatchObject({ checked: 'none', meta: { locked: false } })
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/checked|locked/)
  })

  it('파일이 바깥에서 바뀌었으면 머리말을 고치지 않는다', () => {
    const old = readConceptMd(lib, 'graph-coloring').hash
    const file = path.join(lib, 'concepts', 'graph-coloring.md')
    fs.appendFileSync(file, '\nMore.\n')
    expect(() => setConceptChecked(lib, 'graph-coloring', true, old)).toThrow(/바뀌어/)
  })

  it('기호 모음: \\newcommand·\\DeclareMathOperator를 KaTeX macros로', () => {
    expect(parseMacros('\\newcommand{\\Kempe}[3]{K^{#1}_{#2#3}} % 주석\n\\DeclareMathOperator*{\\argmax}{arg\\,max}\n\\renewcommand\\Im{\\operatorname{Im}}\n% \\newcommand{\\no}{x}'))
      .toEqual({ '\\Kempe': 'K^{#1}_{#2#3}', '\\argmax': '\\operatorname*{arg\\,max}', '\\Im': '\\operatorname{Im}' })
  })

  it('라이브러리 목록과 지식 색인에 들어간다 (Study 노트와 한 주제로)', () => {
    const notes = listLibraryNotes(lib)
    expect(notes.find((n) => n.id === 'planar-graph')).toMatchObject({ kind: 'concept', format: 'md', status: 'reviewed', checked: 'ok' })
    const k = buildKnowledge({ library: lib, study: path.join(fixtures, 'study'), notes, usedBy: {} })
    const pg = k.topics.find((t) => t.title === 'Planar graph')!
    expect(pg.study).toBeDefined()
    expect(pg.concept).toMatchObject({ id: 'planar-graph', format: 'md', checked: 'ok' })
    expect(pg.links).toContain(k.topics.find((t) => t.title === 'Kempe recoloring')!.key)
    expect(pg.names).toContain('pg')
    expect(k.topics.filter((t) => t.title === 'Planar graph')).toHaveLength(1)
  })
})

describe('개념노트 API', () => {
  let tmp: string
  let app: ReturnType<typeof buildApp>
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-concepts-api-'))
    const lib = path.join(tmp, 'library')
    fs.cpSync(path.join(fixtures, 'library'), lib, { recursive: true })
    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    app = buildApp({ configDir: path.join(tmp, 'config') })
  })
  afterAll(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

  it('새 개념노트는 기본 양식의 Markdown (Definition · Properties · Proof · Examples)', async () => {
    const c = (await app.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: 'Kempe recoloring' } })).json()
    expect(c.id).toBe('kempe-recoloring')
    const n = (await app.inject({ url: `/api/concepts/${c.id}` })).json()
    expect(n.meta.title).toBe('Kempe recoloring')
    expect(n.body).toBe('# Kempe recoloring\n\n## Definition\n\n## Properties\n\n1. \n\n**Proof.** ∎\n\n## Examples\n')
    expect(n.unfinished).toEqual(['제목·틀뿐'])
    expect((await app.inject({ url: `/api/concepts/${c.id}/memo` })).json().exists).toBe(false)
    // 같은 제목이면 -2
    expect((await app.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: 'Kempe recoloring' } })).json().id).toBe('kempe-recoloring-2')
  })

  it('읽기, 기호 모음, 확인함', async () => {
    const r = await app.inject({ url: '/api/concepts/planar-graph' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ id: 'planar-graph', checked: 'ok' })
    const m = await app.inject({ url: '/api/concepts/macros' })
    expect(m.json().macros['\\Kempe']).toBe('K^{#1}_{#2#3}')
    const off = await app.inject({ method: 'POST', url: '/api/concepts/planar-graph/checked', payload: { on: false, baseHash: r.json().hash } })
    expect(off.json().checked).toBe('none')
    const stale = await app.inject({ method: 'POST', url: '/api/concepts/planar-graph/checked', payload: { on: true, baseHash: r.json().hash } })
    expect(stale.statusCode).toBe(409)
    // 사용자 확인 고르기: 검토 예정 ↔ 확인함은 하나만 남는다
    const todo = (await app.inject({ method: 'POST', url: '/api/concepts/planar-graph/review', payload: { choice: 'todo', baseHash: off.json().hash } })).json()
    expect(todo).toMatchObject({ checked: 'none', meta: { review: 'todo' } })
    const ok = (await app.inject({ method: 'POST', url: '/api/concepts/planar-graph/review', payload: { choice: 'ok', baseHash: todo.hash } })).json()
    expect(ok.checked).toBe('ok')
    expect(ok.meta.review).toBeUndefined()
    expect((await app.inject({ method: 'POST', url: '/api/concepts/planar-graph/review', payload: { choice: 'yes', baseHash: ok.hash } })).statusCode).toBe(400)
    expect((await app.inject({ url: '/api/concepts/..%2Fsecret' })).statusCode).toBe(400)
    // 출처: 머리말 sources + 본문 [@키]를 references.bib에서
    const s = (await app.inject({ url: '/api/concepts/planar-graph/sources' })).json()
    expect(s.cited).toEqual(['ipsumListColoringPlanar2015'])
    expect(s.sources.map((e: { key: string; year?: string }) => [e.key, e.year])).toEqual([['ipsumListColoringPlanar2015', '2015'], ['doeStructurePlanar2004', '2004']])
  })

  it('본문 고치기: 머리말 글자는 그대로, 잠긴 노트·바깥에서 바뀐 파일은 고치지 않는다', async () => {
    const lib = path.join(tmp, 'library')
    const file = path.join(lib, 'concepts/discharging-method.md')
    const before = fs.readFileSync(file, 'utf8')
    const fmText = before.slice(0, before.indexOf('---', 3) + 4)
    const n = (await app.inject({ url: '/api/concepts/discharging-method' })).json()
    const put = await app.inject({ method: 'PUT', url: '/api/concepts/discharging-method', payload: { body: '# Discharging method\r\n\nNew body text.', baseHash: n.hash } })
    expect(put.statusCode).toBe(200)
    const raw = fs.readFileSync(file, 'utf8')
    expect(raw.startsWith(fmText)).toBe(true)
    expect(raw.endsWith('# Discharging method\r\n\nNew body text.')).toBe(true)
    expect((await app.inject({ method: 'PUT', url: '/api/concepts/discharging-method', payload: { body: 'x', baseHash: n.hash } })).statusCode).toBe(409)
    const locked = (await app.inject({ method: 'POST', url: '/api/concepts/discharging-method/locked', payload: { on: true, baseHash: put.json().hash } })).json()
    expect((await app.inject({ method: 'PUT', url: '/api/concepts/discharging-method', payload: { body: 'x', baseHash: locked.hash } })).statusCode).toBe(423)
    expect((await app.inject({ method: 'PUT', url: '/api/concepts/discharging-method', payload: { body: locked.body, baseHash: locked.hash } })).statusCode).toBe(423)
    fs.writeFileSync(file, before)
  })

  it.each([
    ['crlf', '---\r\ntitle: Preserve CRLF\r\n---\r\n## Definition\r\n\r\nKeep both lines.\r\n'],
    ['no-final-newline', '---\ntitle: Preserve ending\n---\nKeep this final character.'],
    ['multiple-final-newlines', '---\ntitle: Preserve blank lines\n---\nKeep blank lines.\n\n\n'],
    ['empty-body', '---\ntitle: Empty body\n---\n'],
    ['single-final-newline', '---\ntitle: Preserve mtime\n---\nAlready normalized.\n'],
  ])('preserves unchanged concept bytes (%s), hash and mtime while rejecting a stale hash', async (name, raw) => {
    const id = `preserve-${name}`
    const file = path.join(tmp, 'library/concepts', `${id}.md`)
    const original = Buffer.from(raw!, 'utf8')
    fs.writeFileSync(file, original)
    // A fixed old mtime makes any unnecessary write observable without waiting.
    const timestamp = new Date('2001-01-01T00:00:00.000Z')
    fs.utimesSync(file, timestamp, timestamp)
    const beforeStat = fs.statSync(file)
    const url = `/api/concepts/${id}`
    const read = (await app.inject({ url })).json()
    const stale = await app.inject({ method: 'PUT', url, payload: { body: read.body, baseHash: 'stale' } })
    expect(stale.statusCode).toBe(409)
    expect(fs.readFileSync(file)).toEqual(original)
    const saved = await app.inject({ method: 'PUT', url, payload: { body: read.body, baseHash: read.hash } })
    expect(saved.statusCode).toBe(200)
    expect(fs.readFileSync(file)).toEqual(original)
    expect(saved.json().hash).toBe(read.hash)
    expect(saved.json().body).toBe(read.body)
    expect(fs.statSync(file).mtimeMs).toBe(beforeStat.mtimeMs)
  })

  it('메모: 본문 밖 파일에 쓰고, 비우면 지운다. 노트 목록에는 들어가지 않는다', async () => {
    const lib = path.join(tmp, 'library')
    const empty = (await app.inject({ url: '/api/concepts/planar-graph/memo' })).json()
    expect(empty).toMatchObject({ text: '', exists: false })
    const body = fs.readFileSync(path.join(lib, 'concepts/planar-graph.md'), 'utf8')
    const put = await app.inject({ method: 'PUT', url: '/api/concepts/planar-graph/memo', payload: { text: '- [ ] Kempe 바꾸기 증명 붙이기\n열린 질문', baseHash: empty.hash } })
    expect(put.json()).toMatchObject({ text: '- [ ] Kempe 바꾸기 증명 붙이기\n열린 질문\n', exists: true })
    expect(fs.readFileSync(path.join(lib, 'concepts/planar-graph.memo.md'), 'utf8')).toBe('- [ ] Kempe 바꾸기 증명 붙이기\n열린 질문\n')
    // 본문은 그대로, 노트 목록·라이브러리 목록에 메모 파일이 따로 나오지 않는다
    expect(fs.readFileSync(path.join(lib, 'concepts/planar-graph.md'), 'utf8')).toBe(body)
    expect(listConceptMd(lib).map((n) => n.id)).not.toContain('planar-graph.memo')
    // 바깥에서 바뀐 메모는 덮지 않는다
    const stale = await app.inject({ method: 'PUT', url: '/api/concepts/planar-graph/memo', payload: { text: 'x', baseHash: empty.hash } })
    expect(stale.statusCode).toBe(409)
    const cleared = await app.inject({ method: 'PUT', url: '/api/concepts/planar-graph/memo', payload: { text: '  ', baseHash: put.json().hash } })
    expect(cleared.json().exists).toBe(false)
    expect(fs.existsSync(path.join(lib, 'concepts/planar-graph.memo.md'))).toBe(false)
    expect((await app.inject({ url: '/api/concepts/nope/memo' })).statusCode).toBe(404)
  })
})
