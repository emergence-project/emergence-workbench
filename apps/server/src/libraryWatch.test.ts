import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, READ_ONLY_REQUESTS } from './app.js'
import { LibraryReadIndex } from './libraryReadIndex.js'
import { libraryPart } from './libraryWatch.js'
import { fixture } from './testkit.js'

describe('라이브러리 파일 갈래', () => {
  const lib = path.join(os.tmpdir(), 'lib')
  it('개념노트·참고문헌·분류는 concepts, 그림은 figures, 논문은 papers', () => {
    expect(libraryPart(lib, path.join(lib, 'concepts/a.md'))).toBe('concepts')
    expect(libraryPart(lib, path.join(lib, 'references.bib'))).toBe('concepts')
    expect(libraryPart(lib, path.join(lib, 'subjects.yaml'))).toBe('concepts')
    expect(libraryPart(lib, path.join(lib, 'figures/disk.pdf'))).toBe('figures')
    expect(libraryPart(lib, path.join(lib, 'figures/figures.yaml'))).toBe('figures')
    expect(libraryPart(lib, path.join(lib, 'papers.yaml'))).toBe('papers')
    expect(libraryPart(lib, path.join(lib, 'papers/x.tex'))).toBe('papers')
  })
  it('숨김 파일, .git, 서식, 라이브러리 밖은 알리지 않는다', () => {
    expect(libraryPart(lib, path.join(lib, '.git/index'))).toBeNull()
    expect(libraryPart(lib, path.join(lib, 'concepts/.a.md.swp'))).toBeNull()
    expect(libraryPart(lib, path.join(lib, 'preamble/macros.tex'))).toBeNull()
    expect(libraryPart(lib, path.join(lib, 'README.md'))).toBeNull()
    expect(libraryPart(lib, path.join(os.tmpdir(), 'other/concepts/a.md'))).toBeNull()
  })
})

describe('앱 밖에서 바꾼 라이브러리·sources 알림', () => {
  let tmp: string, lib: string, repo: string, config: string
  let app: ReturnType<typeof buildApp>
  const events: { type: string; part?: string; file?: string; research?: string | null }[] = []
  const settle = () => new Promise((r) => setTimeout(r, 400)) // chokidar가 준비될 때까지

  beforeEach(async () => {
    events.length = 0
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-libwatch-'))
    lib = path.join(tmp, 'library'); repo = path.join(tmp, 'sample-research'); config = path.join(tmp, 'config')
    fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'concepts/alpha.md'), '---\ntitle: Alpha\n---\n# Alpha\n\nfirst body\n')
    fs.cpSync(fixture, repo, { recursive: true, filter: (f) => !f.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'TASKS.md'), '| 일 | 상태 |\n| --- | --- |\n| 하나 | 진행 |\n')
    fs.appendFileSync(path.join(repo, 'workbench/research.yaml'), '\nsources:\n  tasks: TASKS.md\n')
    fs.mkdirSync(config)
    fs.writeFileSync(path.join(config, 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    // 감시는 등록된 연구가 있을 때 시작하므로, 먼저 등록하고 감시를 켠 앱을 다시 띄운다
    const setup = buildApp({ configDir: config, sandbox: true })
    await setup.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
    await setup.close()
    app = buildApp({ configDir: config, sandbox: true, watch: true })
    await app.ready()
    const ws = await app.injectWS('/api/events', { headers: { host: '127.0.0.1:5174' } })
    ws.on('message', (data: Buffer) => events.push(JSON.parse(String(data))))
    await settle()
  })
  afterEach(async () => { vi.restoreAllMocks(); await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

  it('개념노트를 밖에서 고치면 알림이 가고 다시 읽은 본문이 새 것이다', async () => {
    expect((await app.inject('/api/concepts/alpha')).json().body).toContain('first body')
    fs.writeFileSync(path.join(lib, 'concepts/alpha.md'), '---\ntitle: Alpha\n---\n# Alpha\n\nsecond body\n')
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'library', research: null, part: 'concepts', file: 'concepts/alpha.md' }), { timeout: 5000 })
    expect((await app.inject('/api/concepts/alpha')).json().body).toContain('second body')
  })

  it('없던 figures/ 폴더를 만들고 그림을 넣어도 알리고 그림 캐시만 비운다', async () => {
    const figures = vi.spyOn(LibraryReadIndex.prototype, 'invalidateFigures')
    const all = vi.spyOn(LibraryReadIndex.prototype, 'invalidate')
    fs.mkdirSync(path.join(lib, 'figures'))
    fs.writeFileSync(path.join(lib, 'figures/disk.pdf'), '%PDF-1.4\n')
    await vi.waitFor(() => expect(events.some((e) => e.type === 'library' && e.part === 'figures' && e.file === 'figures/disk.pdf')).toBe(true), { timeout: 5000 })
    expect(figures).toHaveBeenCalled()
    expect(all).not.toHaveBeenCalled()
  })

  it('설정에서 라이브러리를 바꾸면 새 폴더를 보고 예전 폴더는 보지 않는다', async () => {
    const lib2 = path.join(tmp, 'library2')
    fs.mkdirSync(path.join(lib2, 'concepts'), { recursive: true })
    app.registry.setLibrary(lib2)
    await settle()
    fs.writeFileSync(path.join(lib, 'concepts/old.md'), '---\ntitle: Old\n---\n')
    fs.writeFileSync(path.join(lib2, 'concepts/new.md'), '---\ntitle: New\n---\n')
    await vi.waitFor(() => expect(events.some((e) => e.file === 'concepts/new.md')).toBe(true), { timeout: 5000 })
    await settle()
    expect(events.some((e) => e.file === 'concepts/old.md')).toBe(false)
  })

  it('research.yaml sources의 작업 목록이 바뀌면 그 프로젝트에 알린다', async () => {
    const rid = app.registry.ids()[0]!
    fs.writeFileSync(path.join(repo, 'TASKS.md'), '| 일 | 상태 |\n| --- | --- |\n| 하나 | 끝 |\n')
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'sources', research: rid }), { timeout: 5000 })
  })
})

describe('자료를 쓰지 않는 요청', () => {
  it('목록의 경로는 모두 실제로 있는 쓰기 경로다 (이름이 바뀌어 목록이 헛돌지 않게)', async () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-readonly-'))
    fs.writeFileSync(path.join(tmp, 'config.yaml'), 'researches: []\n')
    const app = buildApp({ configDir: tmp, sandbox: true, feedbackDir: path.join(tmp, 'feedback') })
    await app.ready()
    try {
      for (const key of READ_ONLY_REQUESTS) {
        const [method, url] = key.split(' ') as [string, string]
        expect(app.hasRoute({ method: method as 'POST', url }), key).toBe(true)
      }
    }
    finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) }
  })

  it('검사 요청 뒤에는 라이브러리 캐시를 비우지 않고, 쓰기 요청 뒤에는 비운다', async () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-readonly-'))
    const repo = path.join(tmp, 'sample-research')
    fs.cpSync(fixture, repo, { recursive: true, filter: (f) => !f.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config.yaml'), 'researches: []\n')
    const app = buildApp({ configDir: tmp, sandbox: true })
    try {
      await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
      const rid = app.registry.ids()[0]!
      const invalidate = vi.spyOn(LibraryReadIndex.prototype, 'invalidate')
      await app.inject({ method: 'POST', url: '/api/researches/inspect', payload: { path: repo } })
      expect(invalidate).not.toHaveBeenCalled()
      await app.inject({ method: 'POST', url: `/api/researches/${rid}/journal`, payload: { kind: 'memo', text: '메모' } })
      expect(invalidate).toHaveBeenCalled()
    } finally { vi.restoreAllMocks(); await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) }
  })
})
