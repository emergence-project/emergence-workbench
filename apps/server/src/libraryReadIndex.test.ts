import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { LibraryReadIndex } from './libraryReadIndex.js'
import { listLibraryNotes } from './libraryNotes.js'
import { buildKnowledge } from './knowledge.js'
import { libraryUsage } from './libraryUsage.js'
import { REFRESH_MS } from './readCache.js'
import { fixture } from './testkit.js'

let tmp: string, lib: string, repo: string
let app: ReturnType<typeof buildApp>
let clock = 0
const prose = 'This is a complete paragraph long enough to count as actual content in this concept note.'
const write = (rel: string, text: string) => {
  const f = path.join(lib, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text)
  return f
}
const note = (id: string, title = id, body = prose) => write(`concepts/${id}.md`, `---\ntitle: ${title}\nsubject: Mathematics\naliases: [Alias ${id}]\nsources: [paper]\n---\n# ${title}\n\n${body}\n`)
const refresh = () => { clock += REFRESH_MS + 10 }
const get = async (url: string) => {
  const res = await app.inject(url)
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-scale-'))
  lib = path.join(tmp, 'library'); repo = path.join(tmp, 'sample-research')
  fs.mkdirSync(lib)
  fs.cpSync(fixture, repo, { recursive: true, filter: (f) => !f.includes('.build') })
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
  const config = path.join(tmp, 'config'); fs.mkdirSync(config)
  fs.writeFileSync(path.join(config, 'config.yaml'), `library: ${lib}\nstudy: ${tmp}/study\nreviews: ${tmp}/reviews\nresearches: []\n`)
  app = buildApp({ configDir: config, sandbox: true })
  await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })
  clock = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(async () => { vi.restoreAllMocks(); await app.close(); fs.rmSync(tmp, { recursive: true, force: true }) })

describe('library L4 incremental reads', () => {
  it('preserves full responses and only rereads changed notes, including legacy TeX and deletions', async () => {
    const a = note('alpha', 'Alpha', `${prose} [[Beta]] ![[disk]]`)
    const b = note('beta', 'Beta')
    const legacy = write('concepts/old.tex', '% ---\n% id: old\n% title: Old\n% ---\nLegacy prose long enough to be a complete concept note.\n')
    write('papers/paper.tex', '% ---\n% id: paper\n% title: Paper\n% ---\n')
    const before = fs.readFileSync(a, 'utf8')
    const notes = listLibraryNotes(lib)
    const usedBy = libraryUsage(app.registry, notes)
    expect((await get('/api/library')).notes).toEqual(JSON.parse(JSON.stringify(notes)))
    expect(await get('/api/knowledge')).toEqual(JSON.parse(JSON.stringify(buildKnowledge({ library: lib, notes, usedBy }))))
    const read = vi.spyOn(fs, 'readFileSync')
    await get('/api/library'); await get('/api/knowledge')
    refresh()
    await get('/api/library'); await get('/api/knowledge')
    expect(read.mock.calls.filter(([f]) => [a, b, legacy].includes(String(f)))).toHaveLength(0)
    note('alpha', 'Renamed alpha', `${prose} [[Beta]]`)
    refresh()
    expect((await get('/api/library')).notes.find((n: { id: string }) => n.id === 'alpha').title).toBe('Renamed alpha')
    expect((await get('/api/knowledge')).topics.some((t: { title: string }) => t.title === 'Renamed alpha')).toBe(true)
    expect(read.mock.calls.filter(([f]) => String(f) === a)).toHaveLength(1)
    expect(read.mock.calls.filter(([f]) => String(f) === b)).toHaveLength(0)
    fs.renameSync(b, path.join(lib, 'concepts/gamma.md')); fs.unlinkSync(legacy)
    refresh()
    expect((await get('/api/library')).notes.map((n: { id: string }) => n.id)).toEqual(['alpha', 'gamma', 'paper'])
    // Reads never rewrote body/frontmatter.
    expect(fs.readFileSync(path.join(lib, 'concepts/gamma.md'), 'utf8')).toContain('title: Beta')
    expect(before).toContain('![[disk]]')
  })

  it('refreshes figure names, embeds, additions/deletions, and project-first resolution', async () => {
    const n = note('alpha', 'Alpha', `${prose} ![[disk]] ![[disk.svg]]`)
    write('figures/disk.svg', '<svg/>')
    const block = path.join(repo, 'workbench/blocks/uses.md')
    fs.writeFileSync(block, '---\nid: uses\ntitle: Uses\n---\n![[disk]]\n')
    expect((await get('/api/figures')).figures[0].uses).toHaveLength(2)
    expect((await get('/api/figures/brief')).stats.unused).toBe(0)
    const read = vi.spyOn(fs, 'readFileSync')
    refresh(); await get('/api/figures/brief')
    expect(read.mock.calls.filter(([f]) => String(f) === n)).toHaveLength(0)
    fs.mkdirSync(path.join(repo, 'workbench/figures'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'workbench/figures/disk.svg'), '<svg/>')
    write('figures/figures.yaml', 'disk.svg: {name: Renamed, description: Changed outside}\n')
    note('alpha', 'Alpha', prose)
    refresh()
    const figures = (await get('/api/figures')).figures
    expect(figures.find((f: { scope: string }) => f.scope === 'library')).toMatchObject({ name: 'Renamed', description: 'Changed outside', uses: [] })
    expect(figures.find((f: { scope: string }) => f.scope === 'sample-research').uses).toHaveLength(1)
    expect((await get('/api/figures/brief')).stats.unused).toBe(1)
    fs.unlinkSync(path.join(lib, 'figures/disk.svg')); fs.unlinkSync(block)
    refresh()
    expect((await get('/api/figures/brief')).total).toBe(1)
    expect((await get('/api/figures')).figures[0].uses).toEqual([])
  })

  it('refreshes bib, comments, project bib, PDF placeholders and absolute PDF paths in both paper APIs', async () => {
    const bib = write('references.bib', '@article{paper,title={Before},eprint={1234.56789}}\n')
    const comment = write('comments/paper/q.md', '---\nkind: 질문\nstate: 대기\n---\nWhy?\n')
    const pdf = path.join(tmp, 'outside.pdf')
    write('papers.yaml', `paper: {pdf: ${pdf}}\n`)
    expect((await get('/api/papers/brief')).stats).toMatchObject({ noPdf: 1, unlinked: 1 })
    const read = vi.spyOn(fs, 'readFileSync')
    refresh(); await get('/api/papers/brief')
    expect(read.mock.calls.filter(([f]) => [bib, comment].includes(String(f)))).toHaveLength(0)
    write('references.bib', '@article{paper,title={After},eprint={1234.56789}}\n@book{book,title={Book}}\n')
    write('comments/paper/q.md', '---\nkind: 질문\nstate: 답함\n---\nAnswer\n')
    fs.writeFileSync(path.join(repo, 'refs.bib'), '@article{paper,title={Project entry}}\n')
    fs.writeFileSync(path.join(tmp, '.outside.pdf.icloud'), '')
    refresh()
    const brief = await get('/api/papers/brief')
    expect(brief).toMatchObject({ total: 2, check: { answered: 1 }, stats: { papers: 1, books: 1, noPdf: 1, unlinked: 1 } })
    expect((await get('/api/papers')).papers[0]).toMatchObject({ title: 'After', pdf: { where: 'cloud' }, autoProjects: ['sample-research'] })
    fs.unlinkSync(path.join(tmp, '.outside.pdf.icloud')); fs.writeFileSync(pdf, '%PDF-1.4 local')
    fs.unlinkSync(comment); refresh()
    expect((await get('/api/papers')).papers[0]).toMatchObject({ pdf: { where: 'local' }, comments: 0 })
    expect((await get('/api/papers/brief')).check.answered).toBe(0)
  })

  it('refreshes direct project references and alias resolution without rereading unchanged project notes', async () => {
    note('alpha', 'Alpha'); note('beta', 'Beta')
    const file = path.join(repo, 'workbench/blocks/direct.md')
    fs.writeFileSync(file, '---\nid: direct\ntitle: Direct\n---\n[[Alias alpha]]\n')
    const rows = () => get('/api/concepts/list?limit=50')
    expect((await rows()).items.find((n: { id: string }) => n.id === 'alpha').projects).toHaveLength(1)
    const read = vi.spyOn(fs, 'readFileSync')
    refresh(); await rows(); await get('/api/concepts/brief')
    expect(read.mock.calls.filter(([f]) => String(f) === file)).toHaveLength(0)
    fs.writeFileSync(file, '---\nid: direct\ntitle: Direct\n---\n[[Alias beta]]\n')
    refresh()
    const changed = (await rows()).items
    expect(changed.find((n: { id: string }) => n.id === 'alpha').projects).toEqual([])
    expect(changed.find((n: { id: string }) => n.id === 'beta').projects).toHaveLength(1)
    expect((await get('/api/concepts/brief')).check.unchecked.ids).toEqual(['beta'])
    fs.unlinkSync(file); refresh()
    expect((await get('/api/concepts/brief')).check.used).toBe(0)
    // Changing library switches SQLite and response caches without waiting for their TTL.
    const next = path.join(tmp, 'next'); fs.mkdirSync(next)
    app.registry.setLibrary(next)
    expect((await get('/api/library')).notes).toEqual([])
    expect((await get('/api/concepts/list')).total).toBe(0)
  })

  it('invalidates cached project usage when the existing file watcher reports an outside edit', async () => {
    vi.restoreAllMocks()
    note('alpha', 'Alpha'); note('beta', 'Beta')
    const file = path.join(repo, 'workbench/blocks/watched.md')
    fs.writeFileSync(file, '---\nid: watched\ntitle: Watched\n---\n[[Alpha]]\n')
    await app.close()
    app = buildApp({ configDir: path.join(tmp, 'config'), sandbox: true, watch: true })
    expect((await get('/api/concepts/brief')).check.unchecked.ids).toEqual(['alpha'])
    await new Promise((r) => setTimeout(r, 250))
    const invalidated = vi.spyOn(LibraryReadIndex.prototype, 'invalidate')
    fs.writeFileSync(file, '---\nid: watched\ntitle: Watched\n---\n[[Beta]]\n')
    await vi.waitFor(() => expect(invalidated).toHaveBeenCalled(), { timeout: 5000 })
    expect((await get('/api/concepts/brief')).check.unchecked.ids).toEqual(['beta'])
  })

  it('shares cold indexing across concurrent requests and lets unrelated requests finish meanwhile', async () => {
    for (let i = 0; i < 150; i++) note(`n-${i}`, `Note ${i}`)
    let done = false
    const first = get('/api/library').then((x) => { done = true; return x })
    const second = get('/api/concepts/list?limit=50')
    await get('/api')
    expect(done).toBe(false)
    expect((await first).notes).toHaveLength(150)
    expect((await second).total).toBe(150)
  })
})
