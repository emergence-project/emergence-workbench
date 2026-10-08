import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { splitFrontmatter } from './conceptNotes.js'
import { applyProposal, planSubjects, proposalMarkdown, writeProposal } from './subjectMigration.js'

const root = path.resolve(import.meta.dirname, '../../..')
let tmp: string, lib: string, mapFile: string
const makeMapping = () => ({
  tree: { graphs: { name: 'Graphs' }, 'graphs/theory': { name: 'Theory' }, 'graphs/theory/coloring': { name: 'Coloring' }, many: { name: 'Combinatorics' }, math: { name: 'Math' }, 'math/optimization': { name: 'Optimization' }, cs: { name: 'CS' }, 'cs/ml': { name: 'ML' } },
  paths: { 'Mathematics › Graph Theory': 'graphs/theory', 'Mathematics › Combinatorics': 'many' } as Record<string, string>,
  notes: {} as Record<string, string[]>,
  tags: { graphs: 'graphs', gt: 'graphs/theory', coloring: 'graphs/theory/coloring', math: 'math', optimization: 'math/optimization', cs: 'cs', ml: 'cs/ml', many: 'many' } as Record<string, string>,
})
let mapping: ReturnType<typeof makeMapping>
const saveMap = () => fs.writeFileSync(mapFile, YAML.stringify(mapping))
const plan = () => { saveMap(); return planSubjects(lib, mapFile) }
const note = (file: string, fm: Record<string, unknown>, body = '\r\n# Fixture 한글\r\n\r\n$x^2$  \r\n') => fs.writeFileSync(path.join(lib, 'concepts', file), `---\n${YAML.stringify(fm)}---\n${body}`)
const find = (p: ReturnType<typeof plan>, file: string) => p.notes.find((n) => n.file === `concepts/${file}`)!
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-subject-map-'))
  lib = path.join(tmp, 'library')
  fs.cpSync(path.join(root, 'fixtures/knowledge/library'), lib, { recursive: true })
  mapFile = path.join(tmp, 'mapping.yaml')
  mapping = makeMapping()
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('hand-made subject mapping', () => {
  it('uses the exact tree and paths, normalizing whitespace around separators only', () => {
    mapping.paths = { ' Mathematics  ›  Graph Theory ': 'graphs/theory', 'Mathematics›Combinatorics': 'many' }
    note('spaced.md', { subject: ' Mathematics› Graph Theory  ' })
    const p = plan()
    expect(YAML.parse(p.subjectsYaml)).toEqual(mapping.tree)
    expect(find(p, 'spaced.md')).toMatchObject({ subjects: ['graphs/theory'], primaryFrom: 'path', secondaryFrom: [] })
    expect(find(p, 'discharging-method.md').subjects).toEqual(['many'])
    note('case.md', { subject: 'mathematics › Graph Theory' })
    expect(plan).toThrow('mathematics › Graph Theory')
  })
  it('honors ordered overrides including empty lists, without adding secondary tags', () => {
    mapping.notes = { 'graph-coloring.md': ['math', 'cs'], 'discharging-method.md': [] }
    delete mapping.paths['Mathematics › Combinatorics']
    note('discharging-method.md', { subject: 'Unmapped', subjects: ['math'], domains: ['ml'] })
    note('graph-coloring.md', { subject: 'Unmapped too', subjects: ['many'] })
    const p = plan()
    expect(find(p, 'graph-coloring.md')).toMatchObject({ subjects: ['math', 'cs'], primaryFrom: 'note', secondaryFrom: [] })
    expect(find(p, 'discharging-method.md')).toMatchObject({ subjects: [], primaryFrom: 'note', secondaryFrom: [] })
  })
  it('keeps the primary first, skips ancestors and unknown tags, replaces secondaries with descendants even at capacity', () => {
    note('tags.md', { subject: 'Mathematics › Graph Theory', subjects: ['unknown', 'graphs', 'gt', 'math', 'cs'], domains: ['optimization', 'math', 'ml', 'cs', 'many', 'optimization'] })
    expect(find(plan(), 'tags.md')).toMatchObject({ subjects: ['graphs/theory', 'math/optimization', 'cs/ml'], secondaryFrom: ['optimization', 'ml'] })
  })
  it('refines the primary in place and processes subjects before domains', () => {
    note('tags.md', { subject: 'Mathematics › Graph Theory', subjects: ['coloring', 'ml'], domains: ['many', 'graphs', 'gt'] })
    expect(find(plan(), 'tags.md')).toMatchObject({ subjects: ['graphs/theory/coloring', 'cs/ml', 'many'], secondaryFrom: ['coloring', 'ml', 'many'] })
  })
  it('replaces mathematics with optimization as primary and records both mapped tags', () => {
    Object.assign(mapping.tree, {
      mathematics: { name: 'Mathematics' },
      'mathematics/optimization': { name: 'Optimization' },
      'machine-learning': { name: 'Machine Learning' },
    })
    mapping.paths.Mathematics = 'mathematics'
    mapping.tags.optimization = 'mathematics/optimization'
    mapping.tags['machine-learning'] = 'machine-learning'
    note('optimization.md', { subject: 'Mathematics', subjects: ['optimization', 'machine-learning'] })
    expect(find(plan(), 'optimization.md')).toMatchObject({
      subjects: ['mathematics/optimization', 'machine-learning'],
      primaryFrom: 'path',
      secondaryFrom: ['optimization', 'machine-learning'],
    })
  })
  it('lists all missing paths and unknown override files before writing any output', () => {
    mapping.paths = {}
    mapping.notes = { 'absent.md': [] }
    saveMap()
    const out = path.join(tmp, 'proposal')
    let message = ''
    try { writeProposal(lib, out, mapFile) } catch (error) { message = (error as Error).message }
    expect(message).toContain('Mathematics › Graph Theory')
    expect(message).toContain('Mathematics › Combinatorics')
    expect(message).toContain('absent.md')
    expect(fs.existsSync(out)).toBe(false)
  })
  it('requires a mapping unless every note using the missing path is overridden', () => {
    delete mapping.paths['Mathematics › Graph Theory']
    mapping.notes['graph-coloring.md'] = []
    expect(plan).toThrow('Mathematics › Graph Theory')
    mapping.notes['planar-graph.md'] = ['graphs']
    expect(plan().notes).toHaveLength(3)
  })
  it.each(['paths', 'notes', 'tags'] as const)('rejects unknown IDs even in unused %s entries', (section) => {
    if (section === 'notes') mapping.notes['graph-coloring.md'] = ['missing']
    else mapping[section].unused = 'missing'
    expect(plan).toThrow('없는 분류 ID')
  })
  it('validates tree depth, parents, duplicate paths and override lists', () => {
    const tree = mapping.tree as Record<string, { name: string }>
    tree['graphs/theory/coloring/fourth'] = { name: 'Fourth' }
    expect(plan).toThrow('올바르지 않은 분류')
    delete tree['graphs/theory/coloring/fourth']
    tree['missing/child'] = { name: 'Orphan' }
    expect(plan).toThrow('상위 분류가 없습니다')
    delete tree['missing/child']
    mapping.paths['Mathematics›Graph Theory'] = 'graphs'
    expect(plan).toThrow('중복된 대응표 경로')
    delete mapping.paths['Mathematics›Graph Theory']
    mapping.notes['graph-coloring.md'] = ['math', 'math']
    expect(plan).toThrow('중복 없이')
    mapping.notes['graph-coloring.md'] = ['math', 'cs', 'many', 'graphs']
    expect(plan).toThrow('0–3개')
  })
  it('summarizes distinct subtree counts and exceptions, with the full table collapsed last', () => {
    mapping.notes['discharging-method.md'] = []
    note('tags.md', { subject: 'Mathematics › Graph Theory', subjects: ['coloring'] })
    const md = proposalMarkdown(plan())
    expect(md).toContain('| Graphs | graphs | 0 | 3 |')
    const exceptions = md.split('## 별도 확인할 노트')[1]!.split('## 그림·논문')[0]!
    expect(exceptions).toContain('discharging-method.md')
    expect(exceptions).toContain('tags.md')
    expect(exceptions).not.toContain('graph-coloring.md')
    expect(exceptions).not.toContain('planar-graph.md')
    expect(md.split('<details>')[1]).toContain('graph-coloring.md')
    expect(md.trim().endsWith('</details>')).toBe(true)
  })
  it('applies only frontmatter, preserves body bytes and metadata, and both apply and planning reruns make no changes', () => {
    mapping.notes['discharging-method.md'] = []
    note('tags.md', { title: 'Fixture', subject: 'Mathematics › Graph Theory', subjects: ['math'], domains: ['ml'], topics: ['old'], tags: ['old'], 'frontmatter-version': 2, study: 'Keep/path.md', checked: { at: '2026-10-07', hash: 'stale' }, custom: 'keep' })
    const p = plan()
    const before = new Map(p.notes.map((n) => [n.file, splitFrontmatter(fs.readFileSync(path.join(lib, n.file), 'utf8'))]))
    const memo = fs.readFileSync(path.join(lib, 'concepts/graph-coloring.memo.md'))
    expect(() => applyProposal(p, path.join(tmp, '.sandbox'))).toThrow('--i-have-user-approval')
    expect(applyProposal(p, tmp).applied).toHaveLength(4)
    for (const n of p.notes) {
      const after = splitFrontmatter(fs.readFileSync(path.join(lib, n.file), 'utf8'))
      expect(Buffer.from(after.body)).toEqual(Buffer.from(before.get(n.file)!.body))
      const kept = { ...before.get(n.file)!.fm }
      for (const key of ['subject', 'subjects', 'domains', 'topics', 'tags', 'frontmatter-version']) delete kept[key]
      expect(after.fm).toEqual({ ...kept, subjects: n.subjects })
    }
    expect(fs.readFileSync(path.join(lib, 'concepts/graph-coloring.memo.md'))).toEqual(memo)
    const bytes = p.notes.map((n) => fs.readFileSync(path.join(lib, n.file)))
    expect(applyProposal(p, tmp)).toMatchObject({ applied: [], skipped: [], unchanged: p.notes.map((n) => n.file) })
    expect(applyProposal(plan(), tmp).applied).toEqual([])
    expect(p.notes.map((n) => fs.readFileSync(path.join(lib, n.file)))).toEqual(bytes)
  })
  it('keeps hash guards in mapping mode', () => {
    const p = plan()
    fs.appendFileSync(path.join(lib, 'concepts/discharging-method.md'), '\nExternal edit\n')
    expect(applyProposal(p, tmp).skipped).toEqual([{ file: 'concepts/discharging-method.md', reason: '계획 뒤 해시 바뀜' }])
    fs.appendFileSync(path.join(lib, 'subjects.yaml'), '\n# External tree edit\n')
    expect(() => applyProposal(p, tmp)).toThrow('subjects.yaml이 바뀌어')
  })
  it('supports the CLI map option and fails a missing map argument instead of auto-slugging', () => {
    saveMap()
    const args = [path.join(root, 'scripts/subjects/plan.mjs'), '--library', lib, '--out', path.join(tmp, 'proposal')]
    execFileSync(process.execPath, [...args, '--map', mapFile], { cwd: root })
    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'proposal/proposal.json'), 'utf8')).mapped).toBe(true)
    const invalid = spawnSync(process.execPath, [...args, '--map'], { cwd: root, encoding: 'utf8' })
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toContain('--map에는 대응표 YAML 경로가 필요합니다')
    expect(planSubjects(lib)).not.toHaveProperty('mapped')
    expect(planSubjects(lib).notes[0]).not.toHaveProperty('primaryFrom')
  })
})
