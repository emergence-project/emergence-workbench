import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { buildApp } from './app.js'
import { bodyHash } from './conceptNotes.js'
import { draftPrompt } from './learn.js'
import { REFRESH_MS } from './readCache.js'

// 읽기 캐시는 REFRESH_MS(1초)마다 파일을 다시 본다. 기다리지 않고 시계만 앞으로 돌린다
let skew = 0
const realNow = Date.now.bind(Date)
vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
const later = () => { skew += REFRESH_MS + 10 }

const sample = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/sample-research')
const LONG = 'A sentence that is long enough to count as real prose for this note.'

describe('지식 첫 화면 (GET /api/concepts/brief)', () => {
  let tmp: string
  let lib: string
  let repo: string
  let app: ReturnType<typeof buildApp>
  const note = (id: string, fm: Record<string, unknown>, body: string, mtime: number) => {
    const file = path.join(lib, 'concepts', `${id}.md`)
    fs.writeFileSync(file, `---\n${YAML.stringify(fm)}---\n${body}`)
    fs.utimesSync(file, mtime, mtime)
  }

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-brief-'))
    lib = path.join(tmp, 'library')
    fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
    const t = 1_700_000_000
    // 프로젝트가 본문 [[Alpha]]로 쓴다. Alpha → Beta(전제 한 단계) → Gamma(두 단계, 연구가 쓰는 노트가 아님)
    note('alpha', { title: 'Alpha', sources: ['k1'] }, `# Alpha\n\n${LONG} Uses [[Beta]] and [[Ghost]].\n`, t + 1)
    const betaBody = `# Beta\n\n${LONG} Built on [[Gamma]] [@k2].\n`
    note('beta', { title: 'Beta', checked: { at: '2026-10-01', hash: bodyHash('old body') } }, betaBody, t + 5)
    note('gamma', { title: 'Gamma' }, `# Gamma\n\n${LONG}\n`, t + 3)
    // research.yaml concepts:로 프로젝트 전체가 쓰고, 확인함
    const deltaBody = `# Delta\n\n${LONG} [@k3]\n`
    note('delta', { title: 'Delta', aliases: ['D'], checked: { at: '2026-10-02', hash: bodyHash(deltaBody) } }, deltaBody, t + 2)
    // 빈 노트 · 빈 절 · 할 일 상자
    note('empty', { title: 'Empty' }, '# Empty\n\n## Definition\n', t + 4)
    note('sect', { title: 'Sect', sources: ['k4'] }, `# Sect\n\n## Definition\n\n${LONG}\n\n## Examples\n`, t)
    note('todo', { title: 'Todo' }, `# Todo\n\n${LONG}\n\n- [ ] add an example\n`, t + 6)
    fs.writeFileSync(path.join(lib, 'concepts', 'todo.memo.md'), '- [ ] memo only\n')
    // 공부할 것: 초안이 다 된 것(todo, 확인 전) 하나, 확인한 것(delta) 하나, 기다리는 것 하나
    fs.writeFileSync(path.join(lib, 'to-learn.yaml'), YAML.stringify({ items: [
      { id: 'l-1', term: 'todo thing', at: '2026-10-05 10:00', concept: 'todo' },
      { id: 'l-2', term: 'delta thing', at: '2026-10-05 10:01', concept: 'delta' },
      { id: 'l-3', term: 'waiting', at: '2026-10-05 10:02' },
    ] }))

    repo = path.join(tmp, 'sample-research')
    fs.cpSync(sample, repo, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    const ry = path.join(repo, 'workbench', 'research.yaml')
    fs.writeFileSync(ry, `${fs.readFileSync(ry, 'utf8').trimEnd()}\nconcepts: [delta]\n`)
    // 프로젝트 노트 이름([[kempe-chains]])은 개념노트로 보지 않는다
    fs.writeFileSync(path.join(repo, 'workbench', 'blocks', 'uses-alpha.md'), `---\nid: uses-alpha\ntitle: Uses alpha\nstatus: in-progress\n---\nSee [[Alpha]] and [[kempe-chains]].\n`)

    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    app = buildApp({ configDir: path.join(tmp, 'config') })
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).statusCode).toBe(200)
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('최근 고친 순 · 점검 · 통계를 색인에서 센다', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/concepts/brief?recent=3' })
    expect(res.statusCode).toBe(200)
    const b = res.json()
    expect(b.total).toBe(7)
    expect(b.recent.map((r: { id: string }) => r.id)).toEqual(['todo', 'beta', 'empty'])
    expect(b.recent[0]).toMatchObject({ id: 'todo', title: 'Todo', subject: '' })
    expect(typeof b.recent[0].mtime).toBe('number')
    // 연구가 쓰는 노트 = alpha(본문 링크) · delta(research.yaml) + 전제 한 단계 beta. gamma(두 단계)는 아님
    expect(b.check.used).toBe(3)
    expect(b.check.unchecked).toEqual({ count: 1, ids: ['alpha'] })
    expect(b.check.changedAfterCheck).toEqual({ count: 1, ids: ['beta'] })
    expect(b.check.draftsToReview).toEqual({ count: 1, ids: ['l-1'], concepts: ['todo'] })
    expect(b.stats.empty).toEqual({ count: 1, ids: ['empty'] })
    expect(b.stats.emptySection).toEqual({ count: 1, ids: ['sect'] })
    expect(b.stats.todo).toEqual({ count: 1, ids: ['todo'] })
    expect(b.stats.brokenLink).toEqual({ count: 1, ids: ['alpha'] })
    // 출처: 머리말 sources(alpha · sect)나 본문 [@키](beta · delta)가 있으면 있음. 빈 노트는 세지 않는다
    expect(b.stats.noSource).toEqual({ count: 2, ids: ['gamma', 'todo'] })
  })

  it('노트가 바뀌면 다음 요청에 반영된다 (확인 뒤 바뀜, 끊긴 링크가 이어짐)', async () => {
    note('ghost', { title: 'Ghost' }, `# Ghost\n\n${LONG} [@k5]\n`, 1_700_000_100)
    const delta = path.join(lib, 'concepts', 'delta.md')
    fs.writeFileSync(delta, fs.readFileSync(delta, 'utf8').replace('[@k3]', '[@k3] More.'))
    later()
    const b = (await app.inject({ method: 'GET', url: '/api/concepts/brief' })).json()
    expect(b.stats.brokenLink.count).toBe(0)
    expect(b.check.changedAfterCheck.ids).toEqual(['beta', 'delta'])
    // 방금 고친 delta가 맨 위, ghost(옛 시각)는 그 뒤 어딘가
    expect(b.recent[0].id).toBe('delta')
    expect(b.total).toBe(8)
  })

  it('bib에 없는 인용 키: references.bib가 생기거나 바뀌면 다시 센다', async () => {
    // bib가 없으면 대 볼 것이 없어 세지 않는다 (위 첫 요청)
    const bib = path.join(lib, 'references.bib')
    fs.writeFileSync(bib, ['k1', 'k2', 'k3'].map((k) => `@article{${k},\n  title = {T ${k}},\n  year = {2022}\n}\n`).join('\n'))
    later()
    let b = (await app.inject({ method: 'GET', url: '/api/concepts/brief' })).json()
    // sect는 머리말 sources: [k4], ghost는 본문 [@k5]
    expect(b.stats.unknownCite).toEqual({ count: 2, ids: ['ghost', 'sect'] })
    const list = (await app.inject({ method: 'GET', url: '/api/concepts/list?issue=unknownCite&showEmpty=1' })).json()
    expect(list.items.map((i: { id: string }) => i.id)).toEqual(['ghost', 'sect'])
    fs.appendFileSync(bib, '\n@book{k4,\n  title = {T k4}\n}\n')
    later()
    b = (await app.inject({ method: 'GET', url: '/api/concepts/brief' })).json()
    expect(b.stats.unknownCite).toEqual({ count: 1, ids: ['ghost'] })
  })

  it('본문 찾기: 모든 낱말이 든 노트와, 맞은 줄 · 그 줄의 절 제목', async () => {
    const j = (await app.inject({ method: 'GET', url: '/api/concepts/search?q=prose%20examples' })).json()
    expect(j.items.map((i: { id: string }) => i.id)).toEqual(['sect'])
    expect(j.items[0].hits).toEqual([
      { line: 5, heading: 'Definition', text: LONG },
      { line: 7, heading: 'Examples', text: '## Examples' },
    ])
    // 세 글자보다 짧은 낱말도 글자로 확인한다
    expect((await app.inject({ method: 'GET', url: '/api/concepts/search?q=D' })).json().items.length).toBeGreaterThan(0)
    expect((await app.inject({ method: 'GET', url: '/api/concepts/search?q=nowhere-at-all' })).json().items).toEqual([])
  })

  it('개념노트 규칙: README의 개념노트 절만', async () => {
    fs.writeFileSync(path.join(lib, 'README.md'), '# lib\n\n## preamble/\n\nfmt\n\n## concepts/ — notes\n\nRule 1.\n\n## references.bib\n\nbib\n')
    const j = (await app.inject({ method: 'GET', url: '/api/concepts/rules' })).json()
    expect(j.rules).toEqual({ file: 'README.md', text: '## concepts/ — notes\n\nRule 1.' })
  })

  it('GET /api 목록에 있다', async () => {
    const api = (await app.inject({ method: 'GET', url: '/api' })).json()
    expect(api.start.some((s: { url: string }) => s.url === '/api/concepts/brief')).toBe(true)
    expect(api.routes.some((r: { url: string }) => r.url === '/api/concepts/brief')).toBe(true)
  })
})

describe('개념노트 초안 프롬프트', () => {
  it('라이브러리 README의 개념노트 규칙을 먼저 읽게 하고, 출력 형식은 그대로', () => {
    const p = draftPrompt({ id: 'l-1', term: 'Kempe swap', at: '2026-10-06 10:00' }, ['Mathematics › GT'])
    expect(p).toContain('README.md의 "concepts/ — 개념노트" 절(규칙 1–4와 형식)')
    expect(p.indexOf('README.md')).toBeLessThan(p.indexOf('EXISTS:'))
    expect(p).not.toContain('## Definition (꼭)')
    for (const s of ['TITLE:', 'SUBJECT:', '---', '=== MEMO ===', 'references.bib에 있는 키만', '지어내지 않습니다', 'Mathematics › GT']) expect(p).toContain(s)
  })
})
