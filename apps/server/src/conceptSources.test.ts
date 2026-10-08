import { describe, expect, it } from 'vitest'
import { bibIndex, bibKeyOf, bibText, fetchArxiv, fetchByText, fetchDoi, findInBib, kindOfHeading, linksOnly, looksLikeCitation, plainTitle, pullSections, refFingerprint, sourceRefs } from './conceptSources.js'
import { inlineCites } from './conceptNotes.js'

describe('개념노트 출처·연결 정리', () => {
  it('절 제목으로 출처·쓰는 개념·관련 개념을 알아본다', () => {
    expect(kindOfHeading('References')).toBe('sources')
    expect(kindOfHeading('참고 문헌')).toBe('sources')
    expect(kindOfHeading('**출처**')).toBe('sources')
    expect(kindOfHeading('Used in')).toBe('usedBy')
    expect(kindOfHeading('이 개념을 쓰는 곳')).toBe('usedBy')
    expect(kindOfHeading('See also')).toBe('related')
    expect(kindOfHeading('관련 개념')).toBe('related')
    expect(kindOfHeading('정의')).toBeNull()
  })

  it('절을 떼어 내고 다른 본문은 그대로 둔다 (코드 블록 안 제목은 무시)', () => {
    const body = '# T\n\nText.\n\n## 정의\n\nDef.\n\n```\n## References\n```\n\n## References\n\n- arXiv:0000.00003\n\n### Old\n\n- x\n\n## 성질\n\nProp.\n\n## Related\n\n- [[A]], [[B|b]]\n'
    const r = pullSections(body)
    expect(r.sections.map((s) => [s.kind, s.heading, s.kept])).toEqual([['sources', 'References', undefined], ['related', 'Related', undefined]])
    expect(r.sections[0]!.refs.map((x) => x.arxiv)).toEqual(['0000.00003'])
    expect(r.sections[1]!.links).toEqual(['A', 'B'])
    // 모르는 소제목(### Old)에서 멈추고 그 뒤는 본문으로 남는다
    expect(r.body).toBe('# T\n\nText.\n\n## 정의\n\nDef.\n\n```\n## References\n```\n\n### Old\n\n- x\n\n## 성질\n\nProp.\n')
    expect(linksOnly('- [[A]] is the parent concept')).toBeNull()
  })

  it('제목만 Reference인 본문을 삼키지 않는다 (맥 미리 보기에서 찾은 경우들)', () => {
    // Polar Decomposition: # Reference 밑에 출처 한 줄, 이어서 정리·증명 콜아웃
    const polar = '# Reference\n- RW, Graph theory: A first course\n> [!note] Polar decomposition\n> Let $A$ be linear.\n\n> [!tip] Proof\n> Long proof.\n'
    let r = pullSections(polar)
    expect(r.sections[0]!.refs.map((x) => x.text)).toEqual(['RW, Graph theory: A first course'])
    expect(r.body).toBe('> [!note] Polar decomposition\n> Let $A$ be linear.\n\n> [!tip] Proof\n> Long proof.\n')
    // Discharging Rules: 같은 H1 밑 출처 두 줄 뒤에 ## 본문 절들
    const rules = '# Discharging Rules\nMoved here.\n# Reference\n- []\n- [Xia Lin, *Discharging Rules*]\n## Charge rules\nIn a triangulation $\\sigma$.\n## Face Transformation\nText.\n'
    r = pullSections(rules)
    expect(r.sections[0]!.refs.map((x) => x.text)).toEqual(['[Xia Lin, *Discharging Rules*]'])
    expect(r.body).toBe('# Discharging Rules\nMoved here.\n## Charge rules\nIn a triangulation $\\sigma$.\n## Face Transformation\nText.\n')
    // Toroidal maps: 출처 목록에 설명 글이 섞임 → 절 전체를 그대로 둔다
    const torus = '# Toroidal maps\nShort.\n## References\n- [[Doe and Roe - Map Coloring]]\n- Toroidal maps are maps on a torus that can need seven colors with\n  - an odd number of countries\n  - J. Doe, R. Roe, and D. Lorem, Annals of Example Mathematics 16, 407 (1961).\n'
    r = pullSections(torus)
    expect(r.sections[0]!.kept).toMatch(/인용으로 보이지 않는 글/)
    expect(r.body).toBe(torus)
    // Kempe pair: References 밑 ### Concept-space(링크)와 ### External reference(인용)
    const pair = '# Kempe pair\nBody.\n## References\n### Concept-space\n- [[Five Color Theory]]\n- [[Map Coloring]]\n### External reference\n- L. N. Cobb, "Bound Vertex Pairs", J. Ex. Math. **104**, 1189 (1956). `[needs-verify]`\n- M. Tinsley, *Introduction to Graph Coloring*, 2nd ed.\n'
    r = pullSections(pair)
    expect(r.sections[0]!.links).toEqual(['Five Color Theory', 'Map Coloring'])
    expect(r.sections[0]!.refs).toHaveLength(2)
    expect(r.body).toBe('# Kempe pair\nBody.\n')
  })

  it('같은 문헌의 다른 꼴은 지문이 같다', () => {
    expect(refFingerprint('L. N. Cobb, "Bound Vertex Pairs", J. Ex. Math. **104**, 1189 (1956). `[needs-verify]` — detail unconfirmed')).toBe('cobb:1956')
    expect(refFingerprint('L. N. Cobb, J. Ex. Math. 104, 1189 (1956)')).toBe('cobb:1956')
    expect(refFingerprint('Reader, R., & Writer, W. (2010). Graph Theory')).toBe('reader:2010')
    expect(refFingerprint('M. Tinsley, *Introduction to Graph Coloring*, 2nd ed. — Cobb problem')).toBe(refFingerprint('M. Tinsley, Introduction to Graph Coloring, 2nd ed.'))
    // 제목에 수식이 있어도 주소가 붙은 인용이면 인용
    expect(looksLikeCitation('[J. Ex. Math. 138, A442 (1965) - Coloring Maps on ${}^4$-Manifolds](https://example.org/abs/10.0000/example.138.A442)')).toBe(true)
    expect(looksLikeCitation('Then $A = UJ$ holds')).toBe(false)
  })

  it('받아 온 제목의 MathML·HTML 태그를 뺀다', () => {
    expect(plainTitle('Coloring Maps on<mml:math xmlns:mml="x"><mml:msup><mml:mi>S</mml:mi><mml:mn>2</mml:mn></mml:msup></mml:math>')).toBe('Coloring Maps on S2')
    expect(plainTitle('A Learning Algorithm for Boltzmann Machines*')).toBe('A Learning Algorithm for Boltzmann Machines')
  })

  it('글로만 적힌 출처는 연도·첫 저자가 맞을 때만 서지 검색 결과를 받는다', async () => {
    const hit = (family: string, year: number) => (async () => new Response(JSON.stringify({ message: { items: [{ DOI: '10.0000/example.1956.001', title: ['Bound Vertex Pairs in a Degenerate Planar Map'], author: [{ family, given: 'Lee N.' }], issued: { 'date-parts': [[year]] }, 'container-title': ['Journal of Example Mathematics'], volume: '104', page: '1189-1190' }] } }))) as unknown as typeof fetch
    const text = 'L. N. Cobb, "Bound Vertex Pairs in a Degenerate Planar Map", J. Ex. Math. **104**, 1189 (1956).'
    expect(await fetchByText(text, hit('Cobb', 1956))).toMatchObject({ doi: '10.0000/example.1956.001', year: '1956', pages: '1189-1190' })
    expect(await fetchByText(text, hit('Cobb', 1957))).toBeNull()
    expect(await fetchByText(text, hit('Smith', 1956))).toBeNull()
    expect(await fetchByText('Reeder Writer', hit('Reader', 2010))).toBeNull()
  })

  it('출처 줄에서 키·arXiv·DOI를 찾고 bib와 맞춘다', () => {
    const refs = sourceRefs('- Ipsum, Dolor, arXiv:0000.00003v3\n- [@exampleDischarging2022]\n- https://doi.org/10.0000/example.2022.001.\n- Doe et al., math/0000001\n- Reader & Writer, textbook')
    expect(refs.map((r) => [r.key, r.arxiv, r.doi])).toEqual([
      [undefined, '0000.00003', undefined], ['exampleDischarging2022', undefined, undefined], [undefined, undefined, '10.0000/example.2022.001'], [undefined, 'math/0000001', undefined], [undefined, undefined, undefined],
    ])
    const idx = bibIndex('@article{ipsumL2015, eprint = {0000.00003}, doi = {10.0000/X}}\n@misc{exampleDischarging2022, title={K}}')
    expect(findInBib(refs[0]!, idx)).toBe('ipsumL2015')
    expect(findInBib(refs[1]!, idx)).toBe('exampleDischarging2022')
    expect(findInBib(refs[2]!, idx)).toBeUndefined()
  })

  it('새 bib 키는 성+제목 첫 낱말+연도, 겹치면 a·b', () => {
    const taken = new Set(['ipsumList2015'])
    const e = { title: 'The List coloring of planar graphs', authors: ['Ipsum, Iris', 'Dolor, Dan'], year: '2015' }
    expect(bibKeyOf(e, taken)).toBe('ipsumList2015a')
    expect(bibKeyOf({ ...e, authors: ['Ö. Çelik'] }, taken)).toBe('celikList2015')
    expect(bibText({ ...e, key: 'k', arxiv: '0000.00003' })).toBe('@misc{k,\n  title = {The List coloring of planar graphs},\n  author = {Ipsum, Iris and Dolor, Dan},\n  year = {2015},\n  eprint = {0000.00003},\n  archiveprefix = {arXiv},\n}\n')
  })

  it('arXiv·Crossref 응답을 읽는다', async () => {
    const arxiv = (async () => new Response('<feed><entry><title>List\n  Coloring</title><published>2014-10-02T00:00:00Z</published><author><name>Iris Ipsum</name></author><author><name>Dan Dolor</name></author><arxiv:doi>10.0000/x</arxiv:doi></entry></feed>')) as unknown as typeof fetch
    expect(await fetchArxiv('0000.00003', arxiv)).toEqual({ title: 'List Coloring', authors: ['Ipsum, Iris', 'Dolor, Dan'], year: '2014', arxiv: '0000.00003', doi: '10.0000/x' })
    const crossref = (async () => new Response(JSON.stringify({ message: { title: ['Discharging'], author: [{ family: 'Example', given: 'Ada E.' }], issued: { 'date-parts': [[2022, 4]] }, 'container-title': ['JEC'], volume: '128', 'article-number': '176402' } }))) as unknown as typeof fetch
    expect(await fetchDoi('10.0000/z', crossref)).toEqual({ title: 'Discharging', authors: ['Example, Ada E.'], year: '2022', doi: '10.0000/z', journal: 'JEC', volume: '128', pages: '176402' })
  })

  it('본문 인용 [@키]: 여러 편·쪽수, 링크·메일·수식·이스케이프는 아님', () => {
    expect(inlineCites('A [@a; @b, p. 3] and [see @c]. [text](http://x@y) [me@x.com] $[@no]$ \\[@lit] [[Link]] [0,1]')).toEqual(['a', 'b', 'c'])
  })
})
