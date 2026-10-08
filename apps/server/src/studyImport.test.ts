import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listConceptMd, splitFrontmatter } from './conceptNotes.js'
import { applyStudyImport, contentOf, importReport, planStudyImport, resolveSources } from './studyImport.js'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/knowledge')

describe('Study 개념 노트 옮기기', () => {
  let tmp: string, study: string, lib: string
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-import-'))
    study = path.join(tmp, 'study'); lib = path.join(tmp, 'library')
    fs.cpSync(path.join(fixtures, 'study'), study, { recursive: true })
    fs.cpSync(path.join(fixtures, 'library'), lib, { recursive: true })
    // 그림 하나와 그것을 쓰는 노트, 별칭이 겹치는 노트
    fs.mkdirSync(path.join(study, 'Attachments'))
    fs.writeFileSync(path.join(study, 'Attachments', 'tee.png'), 'png-bytes')
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Graph Theory/Brooks theorem.md'),
      '---\naliases: [BT]\ntags: [coloring]\n---\nBrooks says $\\chi(G) \\le \\Delta(G)$ for every connected graph that is not complete or an odd cycle.\n\n![[tee.png|300]]\n![[lost.png]]\n')
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Graph Theory/plane graph.md'), 'Short.\n')
    // 같은 제목의 노트 두 개(다른 폴더), 지도 노트
    for (const d of ['Computer Science/A', 'Computer Science/B', 'Computer Science/C']) fs.mkdirSync(path.join(study, 'Concept-Space', d), { recursive: true })
    fs.writeFileSync(path.join(study, 'Concept-Space/Computer Science/A/Deep Sets.md'), 'Deep sets.\n')
    fs.writeFileSync(path.join(study, 'Concept-Space/Computer Science/B/Deep Sets.md'), 'Deep sets are permutation-invariant functions written as a sum over elements. Zaheer et al. show every permutation-invariant function has this form.\n')
    fs.writeFileSync(path.join(study, 'Concept-Space/Computer Science/C/Deep Sets.md'), 'Used for point clouds.\n')
    // 교재 폴더 안의 장 노트, 장 번호로 시작하는 노트
    fs.mkdirSync(path.join(study, 'Concept-Space/Computer Science/Resources/Textbooks/Goodfellow'), { recursive: true })
    fs.writeFileSync(path.join(study, 'Concept-Space/Computer Science/Resources/Textbooks/Goodfellow/Linear Algebra.md'), 'Scalars, vectors, matrices and tensors.\n')
    fs.mkdirSync(path.join(study, 'Concept-Space/Mathematics/Topology'))
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Topology/Chap 1. Introduction to surfaces.md'), 'Closed surfaces.\n')
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Topology/map.md'), '- [[Planar graph]]\n- [[Kempe recoloring]]\n')
    // 빈 목록 하나뿐인 빈 노트는 건너뛰지 않고 빈 노트로 옮긴다
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Topology/Hadwiger conjecture.md'), '# Overview\n-\n')
    // 같은 문헌이 본문 목록과 머리말 source-refs에 다른 꼴로 두 번
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Topology/Wheel graph.md'),
      '---\nsource-refs:\n  - L. N. Cobb, J. Ex. Math. 104, 1189 (1956)\n  - M. Tinsley, Introduction to Graph Coloring, 2nd ed.\n---\n# Wheel graph\n\nA wheel graph joins one hub vertex to every vertex of a cycle.\n\n## References\n### External reference\n- L. N. Cobb, "Bound Vertex Pairs in a Degenerate Planar Map", J. Ex. Math. **104**, 1189 (1956). `[needs-verify]` — detail unconfirmed\n- M. Tinsley, *Introduction to Graph Coloring*, 2nd ed. — Cobb problem\n')
    // 출처·쓰는 개념·관련 개념 절이 있는 노트
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Graph Theory/Kempe swap.md'),
      '# Kempe swap\n\nA Kempe swap exchanges two colors along one Kempe chain, keeping the coloring proper.\n\n## References\n\n- Doe et al. 2004, math/0000001\n- Grey et al., arXiv:0000.00005\n- Writer, textbook\n\n## Used in\n\n- [[Planar graph]]\n\n## See also\n\n- [[Kempe recoloring]]\n\n## Related\n\n[[Chromatic number]] is the figure of merit here.\n')
  })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('미리 보기는 아무것도 쓰지 않는다', () => {
    const before = fs.readdirSync(path.join(lib, 'concepts')).sort()
    const items = planStudyImport(study, lib)
    expect(fs.readdirSync(path.join(lib, 'concepts')).sort()).toEqual(before)
    // 이미 옮긴 노트(머리말 study:)는 건너뛴다
    expect(items.find((i) => i.title === 'Planar graph')!.skip).toMatch(/이미 옮김/)
    const ssa = items.find((i) => i.title === 'Brooks theorem')!
    expect(ssa).toMatchObject({ id: 'brooks-theorem', subject: 'Mathematics › Graph Theory', aliases: ['BT'], images: ['tee.png', 'lost.png'], missingImages: ['lost.png'] })
    // QMC는 이미 있는 Planar graph의 별칭과 겹친다
    expect(items.find((i) => i.title === 'plane graph')!.sameName).toEqual(['Planar graph (라이브러리 concepts/planar-graph.md)'])
    // .tex 개념노트와 id가 겹치면 뒤에 번호
    expect(items.find((i) => i.title === 'Kempe chain')!.id).toBe('kempe-chain-2')
    // Study 안의 같은 제목은 하나로 합친다: 가장 긴 노트를 남기고, 그 안에 없는 글은 끝에 붙인다
    const ds = items.filter((i) => i.title === 'Deep Sets')
    // 가장 긴 B를 남기되 번호 없는 id를 준다. A의 글은 B 안에 있어 버리고, C의 글은 끝에 붙인다
    expect(ds.map((i) => [i.study.split('/')[2], i.id, i.skip])).toEqual([['A', 'deep-sets-2', '같은 제목의 노트와 합침 (concepts/deep-sets.md)'], ['B', 'deep-sets', undefined], ['C', 'deep-sets-3', '같은 제목의 노트와 합침 (concepts/deep-sets.md)']])
    const kept = ds[1]!
    expect(kept.sameName).toEqual([])
    expect(kept.meta.study_also).toEqual(['Concept-Space/Computer Science/A/Deep Sets.md', 'Concept-Space/Computer Science/C/Deep Sets.md'])
    expect(kept.body).not.toContain('Computer Science/A/Deep Sets.md')
    expect(kept.body).toContain('## 다른 사본에서 (Study Concept-Space/Computer Science/C/Deep Sets.md)\n\nUsed for point clouds.')
    // 책·강의의 장 노트는 나중에
    expect(items.find((i) => i.title === 'Linear Algebra')!.skip).toMatch(/장·절 노트/)
    expect(items.find((i) => i.title === 'Chap 1. Introduction to surfaces')!.skip).toMatch(/장·절 노트/)
    expect(planStudyImport(study, lib, { includeChapters: true }).find((i) => i.title === 'Linear Algebra')!.skip).toBeUndefined()
    // 라이브러리의 .tex 개념노트와도 겹침으로 잡는다
    expect(items.find((i) => i.title === 'Kempe chain')!.sameName.join()).toMatch(/concepts\/kempe-chain\.tex/)
    // 지도 노트는 건너뛰고, 빈 목록뿐인 노트는 빈 노트로 옮긴다
    expect(items.find((i) => i.title === 'map')!.skip).toMatch(/목차/)
    expect(items.find((i) => i.title === 'Hadwiger conjecture')).toMatchObject({ unfinished: ['제목·틀뿐'] })
    expect(items.find((i) => i.title === 'Hadwiger conjecture')!.skip).toBeUndefined()
    // 같은 문헌은 한 번만 (긴 꼴을 남김)
    expect(items.find((i) => i.title === 'Wheel graph')!.unsorted).toEqual([
      'L. N. Cobb, "Bound Vertex Pairs in a Degenerate Planar Map", J. Ex. Math. **104**, 1189 (1956). `[needs-verify]` — detail unconfirmed',
      'M. Tinsley, *Introduction to Graph Coloring*, 2nd ed. — Cobb problem',
    ])
    const report = importReport(items)
    expect(report).toContain('이름이 겹치는 노트')
    expect(report).toContain('lost.png (찾지 못함)')
  })

  it('출처는 bib 키로, 관련 개념은 related로, 쓰는 개념 목록은 버린다', async () => {
    const items = planStudyImport(study, lib)
    const rm = items.find((i) => i.title === 'Kempe swap')!
    expect(rm.pulled).toEqual(['References', 'Used in', 'See also'])
    expect(rm.sources).toEqual(['doeStructurePlanar2004'])
    expect(rm.toFetch.map((r) => r.arxiv)).toEqual(['0000.00005'])
    expect(rm.unsorted).toEqual(['Writer, textbook'])
    expect(rm.related).toEqual(['Kempe recoloring'])
    expect(rm.keptSections).toEqual(['Related (목록이 아닌 글)'])
    expect(rm.body).not.toMatch(/References|Used in|See also/)
    expect(rm.body).toContain('## Related\n\n[[Chromatic number]] is the figure of merit here.')
    const calls: string[] = []
    const get = (async (url: string) => { calls.push(url); return new Response('<feed><entry><title>Universal recoloring maps</title><published>2015-09-23T00:00:00Z</published><author><name>Gail Grey</name></author></entry></feed>') }) as unknown as typeof fetch
    const newBib = await resolveSources(lib, items, get)
    expect(calls.filter((u) => u.includes('arxiv'))).toHaveLength(1)
    expect(newBib.map((e) => e.key)).toEqual(['greyUniversal2015'])
    expect(rm.sources).toEqual(['doeStructurePlanar2004', 'greyUniversal2015'])
    const fm = splitFrontmatter(contentOf(rm)).fm
    expect(fm).toMatchObject({ sources: ['doeStructurePlanar2004', 'greyUniversal2015'], related: ['Kempe recoloring'], sources_unsorted: ['Writer, textbook'] })
    expect(importReport(items, newBib)).toContain('`greyUniversal2015` Grey, Universal recoloring maps (2015) arXiv:0000.00005')
    applyStudyImport(study, lib, items.filter((i) => i.title === 'Kempe swap'), newBib)
    const bib = fs.readFileSync(path.join(lib, 'references.bib'), 'utf8')
    expect(bib).toContain('@misc{greyUniversal2015,')
    expect(bib).toContain('@article{doeStructurePlanar2004,')
  })

  it('같은 문헌의 다른 꼴을 차례로 시도해 맞춘다 (긴 꼴이 안 맞아도 짧은 꼴로)', async () => {
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Topology/Heawood bound.md'),
      '---\nsource-refs:\n  - P. Heath, L. N. Cobb, J. R. Shore, J. Ex. Math. 108, 1175 (1957)\n---\n# Heawood bound\n\nThe Heawood bound limits the colors needed on a surface of given genus.\n\n## References\n- P. Heath, L. N. Cobb, J. R. Shore, "Theory of Map Coloring", J. Ex. Math. **108**, 1175 (1957). `[needs-verify]` — detail\n')
    const items = planStudyImport(study, lib)
    const hb = items.find((i) => i.title === 'Heawood bound')!
    expect(hb.unsorted).toHaveLength(1)
    const get = (async (url: string) => {
      const q = decodeURIComponent(url)
      const items = q.includes('Theory of Map Coloring') ? [] : [{ DOI: '10.0000/example.1957.001', title: ['Theory of Map Coloring'], author: [{ family: 'Heath', given: 'J.' }], issued: { 'date-parts': [[1957]] } }]
      return new Response(JSON.stringify({ message: { items } }))
    }) as unknown as typeof fetch
    const made = await resolveSources(lib, items.filter((i) => i.title === 'Heawood bound'), get)
    expect(made.map((e) => e.key)).toEqual(['heathTheory1957'])
    expect(hb).toMatchObject({ sources: ['heathTheory1957'], unsorted: [] })
    fs.rmSync(path.join(study, 'Concept-Space/Mathematics/Topology/Heawood bound.md'))
  })

  it('옮기면 본문은 바이트 그대로, 머리말은 새로, 그림은 attachments로. 다시 돌려도 같은 것을 또 쓰지 않는다', () => {
    const src = fs.readFileSync(path.join(study, 'Concept-Space/Mathematics/Graph Theory/Brooks theorem.md'), 'utf8')
    const r = applyStudyImport(study, lib, planStudyImport(study, lib))
    expect(r.written).toContain('brooks-theorem')
    expect(r.images).toEqual(['tee.png'])
    const out = fs.readFileSync(path.join(lib, 'concepts/brooks-theorem.md'), 'utf8')
    expect(splitFrontmatter(out).body).toBe(splitFrontmatter(src).body)
    expect(splitFrontmatter(out).fm).toMatchObject({ title: 'Brooks theorem', aliases: ['BT'], subject: 'Mathematics › Graph Theory', tags: ['coloring'], study: 'Concept-Space/Mathematics/Graph Theory/Brooks theorem.md' })
    expect(fs.readFileSync(path.join(lib, 'concepts/attachments/tee.png'), 'utf8')).toBe('png-bytes')
    const n = listConceptMd(lib).length
    expect(planStudyImport(study, lib).every((i) => i.skip)).toBe(true)
    applyStudyImport(study, lib, planStudyImport(study, lib))
    expect(listConceptMd(lib).length).toBe(n)
  })

  it('글로만 적힌 책 출처는 bib의 책 항목과 저자·제목으로 맞춘다', () => {
    const bibFile = path.join(lib, 'references.bib')
    fs.appendFileSync(bibFile, '\n@book{readerGraphTheory2010,\n  title = {Graph Theory: A First Course},\n  author = {Reader, Rita and Writer, Will},\n  year = {2010},\n}\n@book{tinsleyIntroduction1996,\n  title = {Introduction to Graph Coloring},\n  author = {Tinsley, Michael},\n  year = {1996},\n}\n')
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Topology/Proper coloring.md'), '# Proper coloring\n\nA proper coloring gives adjacent vertices different colors.\n\n## References\n\n- Graphs Theories and First Courses: Reeder Writer\n- RW, Graph theory: A first course\n- M. Wolde, Map Coloring Theory\n- [Xia Lin, *Discharging Rules: A Journey from Graph Theory: A First Course to Planar Maps*]\n')
    const items = planStudyImport(study, lib)
    expect(items.find((i) => i.title === 'Proper coloring')).toMatchObject({ sources: ['readerGraphTheory2010'], unsorted: ['M. Wolde, Map Coloring Theory', '[Xia Lin, *Discharging Rules: A Journey from Graph Theory: A First Course to Planar Maps*]'] })
    expect(items.find((i) => i.title === 'Wheel graph')!.sources).toEqual(['tinsleyIntroduction1996'])
    expect(importReport(items)).toContain('`readerGraphTheory2010` ← Graphs Theories and First Courses: Reeder Writer')
  })
})
