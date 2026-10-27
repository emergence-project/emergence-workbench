// 노트 한 목록 · 노트 머리말(주제·성격·설명·★) · 링크 두 목록 (10/5 "주제와 노트")
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { generateStatus } from './agentStatus.js'
import { listNotes, noteLinks } from './noteList.js'
import { invalidateProjects } from './projectReadCache.js'
import { app, noteHash, R, repo, topicsHash, useSampleApp } from './testkit.js'

useSampleApp()

const wb = (...p: string[]) => path.join(repo, 'workbench', ...p)
// 앱 밖에서 고친 것: 실제 앱은 파일 감시가 프로젝트 읽기 캐시를 비운다
const outside = () => invalidateProjects(app.registry)
const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(wb(rel)), { recursive: true }); fs.writeFileSync(wb(rel), text); outside() }
type Row = { id: string; type: string; file: string; title: string; status: string; resume?: string; kind?: string; kindAuto?: boolean; description?: string; descriptionAuto?: boolean; topics: string[]; star: boolean; hash: string; ms?: string }
const notes = async () => (await app.inject({ method: 'GET', url: `${R}/notes` })).json().notes as Row[]
const row = async (id: string) => (await notes()).find((r) => r.id === id)!
const head = async (file: string, patch: object, baseHash?: string) => app.inject({ method: 'PATCH', url: `${R}/notes/head`, payload: { file, patch, baseHash: baseHash ?? await noteHash(file) } })

describe('예전 기록 읽기', () => {
  it('원고에서 옮긴 연구노트 모양: 연구노트 note.yaml의 summary(접힌 줄)를 설명으로, parts만 있는 주제에는 노트가 들지 않는다. calc/는 성격 계산', async () => {
    write('notes/phase/note.md', '# Map\n\n본문 첫 문단.\n')
    write('notes/phase/note.yaml', 'name: Example map and color table\nfrom: docs/model/main.tex\nsummary: The example planar map, its faces\n  and parameters.\nstate: paused\nresume: 수치 결과\n')
    write('calc/disp/note.md', '# 수치\n\n분산 계산 결과.\n')
    fs.appendFileSync(wb('research.yaml'), 'topics:\n  - id: color-table\n    title: Example color table\n    parts:\n      - docs/model/chapters/02.tex\n')
    outside()
    const phase = await row('phase')
    expect(phase).toMatchObject({ type: 'note', file: 'workbench/notes/phase/note.md', title: 'Example map and color table', status: 'blocked', resume: '수치 결과', description: 'The example planar map, its faces and parameters.', topics: [], star: false })
    expect(phase.kind).toBeUndefined()
    expect(phase.descriptionAuto).toBeUndefined()
    expect(typeof phase.ms).toBe('string')
    expect(await row('disp')).toMatchObject({ type: 'calc', kind: 'calc', kindAuto: true, description: '분산 계산 결과.', descriptionAuto: true })
    // LaTeX 노트(main.tex + note.yaml)도 한 목록에 (2026-10-27 블록 노트에서 옮긴 것)
    expect(await row('kempe-chains')).toMatchObject({ type: 'note', file: 'workbench/notes/kempe-chains/main.tex', format: 'tex', title: 'Kempe 사슬 이용', status: 'in-progress', topics: [] })
  })

  it('note.yaml topics:의 주제에 들고 첫째가 주 주제다. 없는 주제는 뺀다', async () => {
    const y = fs.readFileSync(wb('research.yaml'), 'utf8').replace(/^topics:[\s\S]*$/m, '')
    fs.writeFileSync(wb('research.yaml'), `${y}topics:\n  - id: iso\n    title: Isomorphism theorem\n    parts: []\n  - id: wheels\n    title: Wheels\n    parts: []\n`)
    fs.appendFileSync(wb('notes/kempe-chains/note.yaml'), 'topics: [iso]\n')
    fs.appendFileSync(wb('notes/broken-example/note.yaml'), 'topics: [wheels, gone, iso]\n')
    outside()
    expect((await row('kempe-chains')).topics).toEqual(['iso'])
    expect((await row('broken-example')).topics).toEqual(['wheels', 'iso'])
    const ov = (await app.inject({ method: 'GET', url: `${R}/topics/overview` })).json()
    const iso = ov.topics.find((t: { id: string }) => t.id === 'iso')
    expect(iso).toMatchObject({ notes: 2, byStatus: { 'in-progress': 2, blocked: 0, stopped: 0, solved: 0 }, kinds: [{ kind: null, count: 2 }] })
    expect(iso.updated).toBeGreaterThan(0)
    // 주제 없는 노트 묶음 "노트들": 연구노트·계산 노트
    expect(ov.loose).toMatchObject({ notes: 2, byStatus: { 'in-progress': 1, blocked: 1 } })
    expect(ov.loose.kinds).toEqual([{ kind: 'calc', count: 1 }, { kind: null, count: 1 }])
  })
})

describe('머리말 쓰기', () => {
  it('LaTeX 노트: 주제 · 성격 · 설명 · ★를 note.yaml에 쓰고 본문은 바이트 그대로, concepts: 줄도 그대로', async () => {
    const before = fs.readFileSync(wb('notes/kempe-chains/main.tex'), 'utf8')
    const r = await head('workbench/notes/kempe-chains/main.tex', { topics: ['wheels', 'iso'], kind: 'proof', description: '첫 줄\n- 둘째', star: true }, (await row('kempe-chains')).hash)
    expect(r.statusCode).toBe(200)
    expect(r.json().note).toMatchObject({ topics: ['wheels', 'iso'], kind: 'proof', description: '첫 줄\n- 둘째', star: true })
    expect(fs.readFileSync(wb('notes/kempe-chains/main.tex'), 'utf8')).toBe(before)
    expect(YAML.parse(fs.readFileSync(wb('notes/kempe-chains/note.yaml'), 'utf8'))).toMatchObject({ name: 'Kempe 사슬 이용', concepts: ['euler-formula', 'kempe-chain'], topics: ['wheels', 'iso'], kind: 'proof', description: '첫 줄\n- 둘째', star: true })
    // 주제를 모두 빼면 "노트들"
    expect((await head('workbench/notes/kempe-chains/main.tex', { topics: [], star: false })).json().note).toMatchObject({ topics: [], star: false })
  })

  it('연구노트: note.yaml에 쓰고 이름·출처·상태 줄은 그대로, 예전 summary:는 여러 줄 description:으로', async () => {
    const r = await head('workbench/notes/phase/note.md', { topics: ['iso'], kind: 'summary', description: '지도와 색표\n- 고전\n- 조화', star: true })
    expect(r.statusCode).toBe(200)
    const y = YAML.parse(fs.readFileSync(wb('notes/phase/note.yaml'), 'utf8'))
    expect(y).toEqual({ name: 'Example map and color table', from: 'docs/model/main.tex', state: 'paused', resume: '수치 결과', topics: ['iso'], kind: 'summary', description: '지도와 색표\n- 고전\n- 조화', star: true })
    // 원고 화면(예전 카드)도 같은 설명을 읽는다
    const ms = (await app.inject({ method: 'GET', url: `${R}/manuscripts` })).json().find((m: { main: string }) => m.main === 'workbench/notes/phase/note.md')
    expect(ms.summary).toBe('지도와 색표\n- 고전\n- 조화')
    // calc/ 노트의 계산은 처음 값일 뿐: 미분류를 고르면 kind: none으로 적어 미분류로 남는다 (10/5 결정)
    await head('workbench/calc/disp/note.md', { kind: 'proof' })
    const none = (await head('workbench/calc/disp/note.md', { kind: null })).json().note
    expect(none.kind).toBeUndefined()
    expect(none.kindAuto).toBeUndefined()
    expect(YAML.parse(fs.readFileSync(wb('calc/disp/note.yaml'), 'utf8')).kind).toBe('none')
    expect((await head('workbench/calc/disp/note.md', { kind: 'calc' })).json().note).toMatchObject({ kind: 'calc' })
  })

  it('이름 고치기: note.yaml의 name (10/5 노트 이름 고치기)', async () => {
    const r = await head('workbench/notes/phase/note.md', { title: '  예제  모형 ' })
    expect(r.json().note).toMatchObject({ title: '예제 모형' })
    expect(YAML.parse(fs.readFileSync(wb('notes/phase/note.yaml'), 'utf8'))).toMatchObject({ name: '예제 모형', from: 'docs/model/main.tex' })
    const b = await head('workbench/notes/kempe-chains/main.tex', { title: '새 이름' })
    expect(b.json().note).toMatchObject({ title: '새 이름' })
    expect(YAML.parse(fs.readFileSync(wb('notes/kempe-chains/note.yaml'), 'utf8')).name).toBe('새 이름')
    await head('workbench/notes/kempe-chains/main.tex', { title: 'Kempe 사슬 이용' })
    await head('workbench/notes/phase/note.md', { title: 'Example map and color table' })
  })

  it('200자 · 성격 · 없는 주제 · 바뀐 파일은 거절한다', async () => {
    const f = 'workbench/notes/phase/note.md'
    expect((await head(f, { description: '가'.repeat(201) })).statusCode).toBe(400)
    expect((await head(f, { description: `${'가'.repeat(100)}\n${'나'.repeat(100)}` })).statusCode).toBe(200)
    expect((await head(f, { kind: 'poem' })).statusCode).toBe(400)
    expect((await head(f, { topics: ['nope'] })).statusCode).toBe(400)
    expect((await head(f, { name: 'x' })).statusCode).toBe(400)
    expect((await head(f, { title: '  ' })).statusCode).toBe(400)
    expect((await head('workbench/research.yaml', { star: true })).statusCode).toBe(404)
    const stale = await head(f, { star: false }, 'deadbeef')
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe((await row('phase')).hash)
    // 예전 카드 설명 고치기도 200자
    const key = (await row('phase')).ms!
    expect((await app.inject({ method: 'PATCH', url: `${R}/notes/meta?ms=${encodeURIComponent(key)}`, payload: { summary: 'x'.repeat(201) } })).statusCode).toBe(400)
    const saved = await app.inject({ method: 'PATCH', url: `${R}/notes/meta?ms=${encodeURIComponent(key)}`, payload: { state: 'paused', resume: '표를 다시 볼 때', baseHash: (await row('phase')).hash } })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ key, state: 'paused', resume: '표를 다시 볼 때' })
  })
})

describe('링크 두 목록과 STATUS.md', () => {
  it('쓰는 개념노트(본문 순서, 그 뒤 머리말 concepts:)와 이 노트를 [[링크]]로 인용한 노트(최근 고친 순)', async () => {
    write('notes/phase/note.md', '# Map\n\n[[Kempe 사슬 이용]]과 [[조건부 상호정보]]를 쓴다. [[kempe-chains|다시]]\n')
    write('calc/disp/note.md', '# 수치\n\n[[Kempe 사슬 이용#절]] 결과.\n')
    const t = Date.now() / 1000
    fs.utimesSync(wb('notes/phase/note.md'), t - 100, t - 100)
    const links = (await app.inject({ method: 'GET', url: `${R}/notes/links?file=${encodeURIComponent('workbench/notes/kempe-chains/main.tex')}` })).json()
    expect(links.concepts).toEqual([{ id: 'euler-formula', title: 'euler-formula' }, { id: 'kempe-chain', title: 'kempe-chain' }])
    expect(links.bodyConcepts).toEqual([])
    expect(links.citedBy.map((n: { id: string }) => n.id)).toEqual(['disp', 'phase'])
    // 라이브러리가 없으면 개념노트를 찾지 못한 이름으로 (노트 이름은 빼고)
    const phase = (await app.inject({ method: 'GET', url: `${R}/notes/links?file=${encodeURIComponent('workbench/notes/phase/note.md')}` })).json()
    expect(phase.missing).toEqual(['조건부 상호정보'])
    expect(phase.bodyConcepts).toEqual([])
    expect(phase.citedBy).toEqual([])
    expect((await app.inject({ method: 'GET', url: `${R}/notes/links?file=x` })).statusCode).toBe(404)
  })

  it.each([
    { scope: '본문 전용', body: '[[body-only]] [[body-only]]', head: [], bodyIds: ['body-only'], allIds: ['body-only'] },
    { scope: '머리말 전용', body: '본문', head: ['head-only'], bodyIds: [], allIds: ['head-only'] },
    { scope: '양쪽 중복', body: '[[shared]] [[body-only]] [[shared]]', head: ['head-only', 'shared'], bodyIds: ['shared', 'body-only'], allIds: ['shared', 'body-only', 'head-only'] },
  ])('개념노트 범위를 구분한다: $scope', ({ body, head, bodyIds, allIds }) => {
    const file = 'notes/concept-scopes/main.tex'
    const content = `${body}\n`
    const concept = (id: string) => ({ id, title: `Concept ${id}` })
    write('notes/concept-scopes/note.yaml', `name: Concept scopes\nconcepts: [${head.join(', ')}]\n`)
    write(file, content)
    try {
      const links = noteLinks(app.registry.get('sample-research'), `workbench/${file}`, {
        resolve: (name) => ['body-only', 'head-only', 'shared'].includes(name) ? concept(name) : null,
        rows: (ids) => ids.map(concept),
      })
      expect(links.bodyConcepts).toEqual(bodyIds.map(concept))
      expect(links.concepts).toEqual(allIds.map(concept))
      expect(fs.readFileSync(wb(file), 'utf8')).toBe(content)
    } finally { fs.rmSync(wb('notes/concept-scopes'), { recursive: true }); outside() }
  })

  it('STATUS.md에 주제마다 이름·설명 첫 줄·상태별 노트 수와 "노트들"을 적는다', async () => {
    await app.inject({ method: 'PATCH', url: `${R}/topics/wheels`, payload: { description: '- 바퀴 규칙\n- 둘째 줄', star: true, baseHash: await topicsHash() } })
    const { registry } = app
    const md = await generateStatus(registry.get('sample-research'))
    expect(md).toContain('## 주제 2')
    expect(md).toContain('- ★ **Wheels** (`wheels`) — 진행 1 — 바퀴 규칙')
    expect(md).toMatch(/- \*\*Isomorphism theorem\*\* \(`iso`\) — 진행 1 · 멈춤 1\n/)
    expect(md).toMatch(/- \*\*노트들\*\* \(주제 없음\) — 진행 \d/)
  })
})

describe('노트 머리말 지키기 (10/5 검토)', () => {
  it('설명은 20줄까지', async () => {
    write('notes/long-head/note.md', '본문\n')
    write('notes/long-head/note.yaml', 'name: 긴 설명\nstate: paused\n')
    expect((await head('workbench/notes/long-head/note.md', { description: Array(21).fill('a').join('\n') })).statusCode).toBe(400)
    expect((await head('workbench/notes/long-head/note.md', { description: Array(15).fill('a').join('\n') })).statusCode).toBe(200)
    expect(await row('long-head')).toMatchObject({ title: '긴 설명', status: 'blocked' })
    fs.rmSync(wb('notes/long-head'), { recursive: true })
    outside()
  })
})

describe('노트 읽기 캐시 (점검 10번)', () => {
  it('바뀌지 않은 프로젝트의 목록·개괄·연결 조회는 노트 본문과 note.yaml을 다시 읽지 않고, 고친 뒤에는 새로 읽는다', async () => {
    write('notes/cached/note.md', '# 캐시\n\n첫 본문.\n')
    write('notes/cached/note.yaml', 'name: 캐시 노트\n')
    const reads = vi.spyOn(fs, 'readFileSync')
    const noteReads = () => reads.mock.calls.filter(([f]) => typeof f === 'string' && f.includes(`${path.sep}cached${path.sep}`)).length
    try {
      await notes()
      const first = noteReads()
      expect(first).toBeGreaterThan(0)
      await notes()
      await app.inject({ method: 'GET', url: `${R}/topics/overview` })
      await app.inject({ method: 'GET', url: `${R}/notes/links?file=${encodeURIComponent('workbench/notes/cached/note.md')}` })
      expect(noteReads()).toBe(first)
      const r = await head('workbench/notes/cached/note.md', { description: '고친 설명' })
      expect(r.json().note.description).toBe('고친 설명')
      expect((await row('cached')).description).toBe('고친 설명')
    } finally { reads.mockRestore() }
  })
})

