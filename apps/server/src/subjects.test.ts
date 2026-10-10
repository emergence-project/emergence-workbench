import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { app, repo, tmp, useSampleApp } from './testkit.js'
import { bodyHash } from './conceptNotes.js'
import { hashOf } from './fsutil.js'
import { ConceptIndex } from './conceptIndex.js'

useSampleApp()
let lib: string
const body = '\r\n# Alpha\r\n\r\nA sufficiently long mathematical definition with $x^2$ and [[Beta]].  \r\n'
const tree = { math: { name: 'Math' }, 'math/graph': { name: 'Graph Theory' }, 'math/graph/coloring': { name: 'Coloring' }, math2: { name: 'Other mathematics' }, cs: { name: 'Computer Science' }, 'cs/ml': { name: 'Machine Learning' } }
const writeNote = (id: string, fm: Record<string, unknown>) => fs.writeFileSync(path.join(lib, 'concepts', `${id}.md`), `---\n${YAML.stringify({ title: id, ...fm })}---\n${body}`)
const get = async (url: string) => { const r = await app.inject({ url }); expect(r.statusCode, r.body).toBe(200); return r.json() }
const put = (url: string, payload: Record<string, unknown>, method: 'PUT' | 'POST' | 'PATCH' = 'PUT') => app.inject({ method, url, payload })
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(tmp, 'subjects-'))
  fs.mkdirSync(path.join(lib, 'concepts'))
  fs.mkdirSync(path.join(lib, 'figures'))
  writeNote('alpha', { subject: 'Math › Graph', subjects: ['math/graph', 'cs/ml'], checked: { at: '2026-10-07', hash: bodyHash(body) }, study: 'Concept-Space/Alpha.md' })
  writeNote('beta', { subject: 'Math › Graph', subjects: ['math/graph/coloring', 'math/graph'] })
  writeNote('study', { subject: 'Math › Graph › Deep › Fourth', subjects: ['old-domain'], domains: ['Math'], topics: ['topic'], tags: ['tag'], 'frontmatter-version': 2 })
  writeNote('mixed', { subjects: ['cs/ml', 'old-domain'] })
  writeNote('other', { subjects: ['math2'] })
  fs.writeFileSync(path.join(lib, 'figures', 'one.svg'), '<svg/>')
  fs.writeFileSync(path.join(lib, 'figures', 'two.svg'), '<svg/>')
  fs.writeFileSync(path.join(lib, 'figures', 'figures.yaml'), 'one.svg:\n  name: One\n  subjects: [math/graph]\n')
  fs.writeFileSync(path.join(lib, 'references.bib'), '@article{one, title={Paper One}}\n@article{two, title={Paper Two}}\n')
  fs.writeFileSync(path.join(lib, 'papers.yaml'), '# keep me\none:\n  pdf: /nonexistent/one.pdf\n  subjects: [cs/ml, math/graph]\n')
  app.registry.setLibrary(lib)
})
const enable = () => fs.writeFileSync(path.join(lib, 'subjects.yaml'), YAML.stringify(tree))
const longValue = 'A long existing value with spaces that must remain on its original line when updating library classification metadata without changing unrelated content.'

describe('L5 classification API and index', () => {
  it('omits empty suggestion reasons while keeping positive usage counts', async () => {
    enable()
    const { suggestions } = await get('/api/subjects')
    expect(suggestions.find((s: { id: string }) => s.id === 'math/graph').reason).toBe('노트 2개에서 고름')
    expect(suggestions.find((s: { id: string }) => s.id === 'cs').reason).toBe('')
  })
  it('keeps every recent sample figure when the subjects fixture is overlaid', async () => {
    const fixtures = path.resolve(import.meta.dirname, '../../../fixtures')
    fs.rmSync(path.join(lib, 'figures'), { recursive: true })
    fs.cpSync(path.join(fixtures, 'sandbox-figures/library'), path.join(lib, 'figures'), { recursive: true })
    fs.cpSync(path.join(fixtures, 'sandbox-figures/project'), path.join(repo, 'workbench/figures'), { recursive: true })
    try {
      const legacy = await get('/api/figures/brief?recent=12')
      fs.cpSync(path.join(fixtures, 'subjects/library'), lib, { recursive: true })
      // Refresh derived caches after the external fixture overlay.
      app.registry.setLibrary(lib)
      const classified = await get('/api/figures/brief?recent=12')
      expect(legacy.recent).toHaveLength(5)
      expect(classified.recent.map((f: { id: string }) => f.id).sort()).toEqual(legacy.recent.map((f: { id: string }) => f.id).sort())
      expect(classified.stats.unclassified).toBe(4)
    } finally {
      fs.rmSync(path.join(repo, 'workbench/figures'), { recursive: true })
    }
  })
  it.each([
    ['figures/figures.yaml', 'one.svg', '/api/figures/subjects', { id: 'library/one.svg' }],
    ['papers.yaml', 'one', '/api/papers/one/subjects', {}],
  ] as const)('preserves the long description line in %s when setting subjects', async (file, key, url, extra) => {
    enable()
    const raw = `# Keep existing metadata\n${key}:\n  description: ${longValue}\n  subjects: [math/graph]\n`
    fs.writeFileSync(path.join(lib, file), raw)
    const response = await put(url, { ...extra, subjects: ['cs/ml'], baseHash: hashOf(raw) })
    expect(response.statusCode, response.body).toBe(200)
    expect(fs.readFileSync(path.join(lib, file))).toEqual(Buffer.from(raw.replace('  subjects: [math/graph]\n', '  subjects:\n    - cs/ml\n')))
  })
  it('preserves legacy paths until the tree appears, then filters secondary IDs and deduplicates descendants', async () => {
    expect((await get('/api/subjects')).enabled).toBe(false)
    expect((await get('/api/concepts/list?subjectPrefix=Math&showEmpty=1')).total).toBe(3)
    enable()
    expect((await get('/api/concepts/list?subjectPrefix=math&showEmpty=1')).items.map((n: { id: string }) => n.id)).toEqual(['alpha', 'beta'])
    expect((await get('/api/concepts/list?subjectPrefix=cs&showEmpty=1')).items.map((n: { id: string }) => n.id)).toEqual(['alpha'])
    expect((await get('/api/concepts/list?subjectPrefix=&showEmpty=1')).items.map((n: { id: string }) => n.id)).toEqual(['mixed', 'study'])
    const s = await get('/api/subjects?note=alpha')
    expect(s.items.find((s: { id: string }) => s.id === 'math')).toMatchObject({ notes: 2, figures: 1, papers: 1 })
    expect(s.suggestions[0].reason).toBe('연결된 노트 1개')
    expect((await get('/api/subjects')).suggestions[0]).toMatchObject({ id: 'math/graph', reason: '노트 2개에서 고름' })
    const counts = await get('/api/concepts/subjects?showEmpty=1')
    expect(counts.subjects.find((s: { subject: string }) => s.subject === 'math')).toMatchObject({ count: 2, name: 'Math', model: 'ids' })
    fs.rmSync(path.join(lib, 'subjects.yaml'))
    expect((await get('/api/concepts/list?subjectPrefix=Math&showEmpty=1')).total).toBe(3)
  })
  it('renames only subjects.yaml; checks hashes, depth, uniqueness and parent', async () => {
    enable()
    const before = fs.readFileSync(path.join(lib, 'concepts/alpha.md'))
    const s = await get('/api/subjects')
    expect((await put('/api/subjects', { id: 'math/graph', name: '그래프 이론', baseHash: s.hash }, 'PATCH')).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(lib, 'concepts/alpha.md'))).toEqual(before)
    expect((await get('/api/concepts/list?subjectPrefix=math%2Fgraph')).items[0].subject).toContain('그래프 이론')
    expect((await get(`/api/concepts/list?q=${encodeURIComponent('그래프 이론')}`)).total).toBe(2)
    const knowledge = await get('/api/knowledge')
    expect(knowledge.topics.find((n: { title: string }) => n.title === 'alpha').subject).toContain('그래프 이론')
    expect((await put('/api/subjects', { id: 'math', name: 'Changed', baseHash: s.hash }, 'PATCH')).statusCode).toBe(409)
    const fresh = await get('/api/subjects')
    for (const [parent, slug, status] of [['math/graph/coloring', 'fourth', 400], ['missing', 'new', 400], ['math', 'graph', 409], ['math', 'a/b', 400]] as const) {
      expect((await put('/api/subjects', { parent, slug, name: 'New', baseHash: fresh.hash }, 'POST')).statusCode).toBe(status)
    }
    expect((await put('/api/subjects', { parent: 'math', slug: 'topology', name: 'Topology', baseHash: fresh.hash }, 'POST')).statusCode).toBe(200)
  })
  it('patches subjects without changing body, checked state, other YAML keys or order; rejects stale writes', async () => {
    enable()
    const note = await get('/api/concepts/alpha')
    for (const subjects of [['unknown'], ['cs/ml', 'cs/ml'], ['cs', 'cs/ml', 'math', 'math/graph'], 'cs/ml']) {
      expect((await put('/api/concepts/alpha/subjects', { subjects, baseHash: note.hash })).statusCode).toBe(400)
    }
    const saved = await put('/api/concepts/alpha/subjects', { subjects: ['cs/ml', 'math/graph'], baseHash: note.hash })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ body, checked: 'ok', meta: { subjects: ['cs/ml', 'math/graph'], study: note.meta.study, checked: note.meta.checked } })
    expect((await put('/api/concepts/alpha/subjects', { subjects: [], baseHash: note.hash })).statusCode).toBe(409)
    expect((await put('/api/concepts/alpha/subjects', { subjects: [], baseHash: saved.json().hash })).statusCode).toBe(200)
    const figureList = await get('/api/figures')
    const fig = figureList.figures.find((f: { id: string }) => f.id === 'library/one.svg')
    expect((await put('/api/figures/subjects', { id: fig.id, subjects: ['cs/ml'], baseHash: fig.subjectsHash })).statusCode).toBe(200)
    expect((await get('/api/figures?subjectPrefix=cs')).figures).toHaveLength(1)
    expect((await get('/api/figures/brief?subjectPrefix=cs')).total).toBe(1)
    expect((await get('/api/figures/brief')).stats.unclassified).toBe(1)
    expect(YAML.parse(fs.readFileSync(path.join(lib, 'figures/figures.yaml'), 'utf8'))['one.svg'].name).toBe('One')
    expect((await put('/api/figures/subjects', { id: fig.id, subjects: ['unknown'], baseHash: fig.subjectsHash })).statusCode).toBe(400)
    expect((await put('/api/figures/subjects', { id: fig.id, subjects: [], baseHash: fig.subjectsHash })).statusCode).toBe(409)
    const papers = await get('/api/papers')
    expect((await put('/api/papers/one/subjects', { subjects: ['math/graph'], baseHash: papers.papers[0].subjectsHash })).statusCode).toBe(200)
    expect((await put('/api/papers/one/subjects', { subjects: [], baseHash: papers.papers[0].subjectsHash })).statusCode).toBe(409)
    expect((await get('/api/papers?subjectPrefix=math')).papers).toHaveLength(1)
    expect((await get('/api/papers/brief')).stats.unclassified).toBe(1)
    expect(fs.readFileSync(path.join(lib, 'papers.yaml'), 'utf8')).toContain('# keep me')
    expect(YAML.parse(fs.readFileSync(path.join(lib, 'papers.yaml'), 'utf8')).one.pdf).toBe('/nonexistent/one.pdf')
  })
  it('persists the ordered subject index and notices tree changes after reopening', () => {
    enable()
    const db = path.join(tmp, 'index.sqlite')
    const ix = new ConceptIndex(lib, db); ix.refresh(); ix.close()
    const again = new ConceptIndex(lib, db)
    expect(again.refresh().read).toBe(0)
    expect(again.list({ subjectPrefix: 'cs' }).total).toBe(1)
    again.close()
    fs.rmSync(db)
  })
})
