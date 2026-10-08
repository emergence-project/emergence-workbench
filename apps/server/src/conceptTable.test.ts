import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { ConceptIndex, ISSUE_SQL, type ConceptIssue, type ConceptSort, type ConceptTableRow } from './conceptIndex.js'
import { bodyHash } from './conceptNotes.js'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()
const LONG = 'A sentence with enough actual prose to pass the forty character empty note threshold.'
let lib: string
let index: ConceptIndex
let originals: Map<string, Buffer>
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)
const list = async (query = '') => {
  const response = await app.inject({ url: `/api/concepts/list?${query}` })
  expect(response.statusCode).toBe(200)
  return response.json<{ total: number; items: ConceptTableRow[] }>()
}
beforeAll(async () => {
  lib = path.join(tmp, 'table-library')
  fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
  let tick = 1_700_000_000
  const note = (id: string, extra: Record<string, unknown> = {}, body = LONG) => {
    const file = path.join(lib, 'concepts', `${id}.md`)
    fs.writeFileSync(file, `---\n${YAML.stringify({ title: id, ...extra })}---\n${body}`)
    fs.utimesSync(file, tick, tick++)
  }
  note('alpha', { subject: 'Mathematics', sources: ['k1', 'k1', 'k2'], aliases: ['A'] }, `${LONG} [@k1] [@k3] [@k3] [[Beta]] [[Beta]] [[Ghost]]`)
  note('beta', { subject: 'Mathematics › GT', checked: { at: '2026-10-01', hash: bodyHash('old') }, sources: ['k1'] }, `${LONG} [[Gamma]]`)
  note('gamma', { subject: 'Mathematics › GT › Coloring', sources: ['k1'] }, LONG)
  note('delta', { subject: 'Mathematics2', checked: { at: '2026-10-01', hash: bodyHash(LONG) }, sources: ['k1'] })
  note('empty', { subject: 'Mathematics › Empty' }, '# Empty\n')
  note('empty-todo', {}, '# Empty todo\nTODO [[Ghost]]')
  note('section', { subject: 'Mathematics › GT' }, `${LONG}\n## Empty section\n`)
  note('todo', {}, `${LONG}\n- [ ] write example\n`)
  note('literal', { subject: 'A_% › Child' })
  note('unrelated', { subject: 'ABC › Child' })
  // 50개 경계 너머에서도 전체 정렬을 유지하는지 본다.
  for (let i = 0; i < 55; i++) note(`paging-${String(i).padStart(2, '0')}`, { subject: 'Paging', sources: ['k1'] })
  fs.writeFileSync(path.join(lib, 'to-learn.yaml'), YAML.stringify({ items: [
    { id: 'draft-1', term: 'To do', at: '2026-10-06', concept: 'todo' },
    { id: 'draft-2', term: 'Same note', at: '2026-10-06', concept: 'todo' },
    { id: 'draft-empty', term: 'Empty', at: '2026-10-06', concept: 'empty' },
    { id: 'done', term: 'Delta', at: '2026-10-06', concept: 'delta' },
  ] }))
  fs.writeFileSync(path.join(repo, 'workbench/blocks/table-uses.md'), `---\nid: table-uses\ntitle: Uses\nstatus: in-progress\nconcepts: [delta, empty]\n---\n[[A]] [[Alpha]]\n`)
  app.registry.setLibrary(lib)
  index = new ConceptIndex(lib)
  index.refresh(true)
  originals = new Map(fs.readdirSync(path.join(lib, 'concepts')).map((name) => [name, fs.readFileSync(path.join(lib, 'concepts', name))]))
})
afterAll(() => { index?.close() })

describe('지식 표: 색인 위의 거르기 · 정렬 · 페이지', () => {
  it('분류 자신과 자손만 포함하고 빈 분류·%·_도 문자 그대로 읽는다', async () => {
    expect(ids((await list(`subjectPrefix=${encodeURIComponent('Mathematics')}`)).items)).toEqual(['alpha', 'beta', 'gamma', 'section'])
    expect(ids((await list(`subjectPrefix=${encodeURIComponent('Mathematics › GT')}`)).items)).toEqual(['beta', 'gamma', 'section'])
    expect(ids((await list(`subjectPrefix=${encodeURIComponent('A_%')}`)).items)).toEqual(['literal'])
    expect(ids((await list('subjectPrefix=')).items)).toEqual(['todo'])
    expect(ids((await list(`subject=${encodeURIComponent('Mathematics › GT')}`)).items)).toEqual(['beta', 'section'])
  })

  it.each(Object.keys(ISSUE_SQL) as ConceptIssue[])('%s 필터와 각 행의 이상은 issues()와 정확히 같다', async (issue) => {
    const expected = index.issues()[issue]
    expect(ids((await list(`issue=${issue}&showEmpty=1`)).items)).toEqual(expected)
    const all = (await list('showEmpty=1&limit=500')).items
    expect(ids(all.filter((r) => r.issues.includes(issue)))).toEqual(expected)
  })

  it.each(['unchecked', 'changedAfterCheck', 'draftsToReview'] as const)('%s는 brief의 같은 개념노트 집합이다 (빈 노트 포함)', async (check) => {
    const brief = (await app.inject({ url: '/api/concepts/brief' })).json()
    const expected = check === 'draftsToReview' ? brief.check[check].concepts : brief.check[check].ids
    expect(ids((await list(`check=${check}&showEmpty=1`)).items).sort()).toEqual([...expected].sort())
    expect(expected.length).toBeGreaterThan(0)
  })

  it('출처·링크는 중복 없이 세고, 프로젝트는 전제 홉을 포함하지 않는다', async () => {
    const rows = Object.fromEntries((await list('showEmpty=1&limit=500')).items.map((r) => [r.id, r]))
    expect(rows.alpha).toMatchObject({ sources: 3, links: 2, subject: 'Mathematics', issues: ['brokenLink'] })
    expect(rows.alpha!.projects).toHaveLength(1)
    expect(rows.delta!.projects).toEqual(rows.alpha!.projects)
    expect(rows.beta!.projects).toEqual([])
    const brief = (await app.inject({ url: '/api/concepts/brief' })).json()
    expect(brief.check.changedAfterCheck.ids).toContain('beta')
    expect(brief.check.unchecked.ids).not.toContain('gamma')
  })

  it.each(['subject', 'sources', 'links', 'issues', 'projects', 'aliases', 'checked'] as ConceptSort[])('%s 정렬은 어느 방향에서도 빈 값을 뒤에 둔다', async (sort) => {
    const empty = (r: ConceptTableRow) => sort === 'subject' ? !r.subject : sort === 'checked' ? r.checked === 'none'
      : sort === 'sources' || sort === 'links' ? r[sort] === 0 : (r[sort as 'issues' | 'projects' | 'aliases']).length === 0
    for (const dir of ['asc', 'desc']) {
      const rows = (await list(`sort=${sort}&dir=${dir}&showEmpty=1&limit=500`)).items
      const first = rows.findIndex(empty)
      expect(first).toBeGreaterThan(0)
      expect(rows.slice(first).every(empty)).toBe(true)
    }
  })

  it('숫자·날짜·제목을 방향대로 정렬하고, 프로젝트 임시 표는 다음 요청에 남지 않는다', async () => {
    for (const sort of ['sources', 'links', 'issues', 'projects', 'mtime'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const rows = (await list(`sort=${sort}&dir=${dir}&showEmpty=1&limit=500`)).items
        const values = rows.map((r) => Array.isArray(r[sort]) ? (r[sort] as string[]).length : r[sort] as number).filter(Boolean)
        expect(values).toEqual([...values].sort((a, b) => dir === 'asc' ? a - b : b - a))
      }
    }
    const titles = ids((await list('sort=title&dir=desc&showEmpty=1&limit=500')).items)
    expect(titles).toEqual([...titles].sort().reverse())
    expect(index.list({ ids: ['alpha'], projects: { alpha: ['A', 'B'] } }).items[0]!.projects).toHaveLength(2)
    expect(index.list({ ids: ['alpha'] }).items[0]!.projects).toEqual([])
  })

  it('50개씩 읽어도 total은 전체 수이고 순서·중복·빠진 행이 없다', async () => {
    const first = await list('subjectPrefix=Paging&sort=mtime&dir=desc')
    const second = await list('subjectPrefix=Paging&sort=mtime&dir=desc&offset=50')
    expect(first.total).toBe(55)
    expect(first.items).toHaveLength(50)
    expect(second.total).toBe(55)
    expect(second.items).toHaveLength(5)
    expect(ids([...first.items, ...second.items])).toEqual(Array.from({ length: 55 }, (_, i) => `paging-${String(54 - i).padStart(2, '0')}`))
    expect((await list('subjectPrefix=Paging&offset=100')).items).toEqual([])
  })

  it('ids가 빈 집합이면 0개, 점검과 함께 주면 교집합, 큰 집합도 SQLite 인자 한도를 넘지 않는다', async () => {
    expect(await list('ids=')).toEqual({ total: 0, items: [] })
    expect(ids((await list('ids=alpha,beta&check=unchecked')).items)).toEqual(['alpha'])
    expect(index.list({ ids: Array.from({ length: 40_000 }, (_, i) => `missing-${i}`) }).total).toBe(0)
  })

  it('모든 읽기가 끝나도 원본 노트 바이트를 바꾸지 않는다', () => {
    for (const [name, bytes] of originals) expect(fs.readFileSync(path.join(lib, 'concepts', name))).toEqual(bytes)
  })
})
