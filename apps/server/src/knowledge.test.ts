import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildKnowledge, firstParagraph, readReview, topicKey, wikiTargets } from './knowledge.js'
import { listLibraryNotes } from './libraryNotes.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/knowledge')
const library = path.join(root, 'library')
const study = path.join(root, 'study')
const reviews = path.join(root, 'topic-reviews')

describe('지식 색인', () => {
  const k = buildKnowledge({ library, study, reviews, notes: listLibraryNotes(library), usedBy: { 'concept:kempe-chain': [{ rid: 'alpha', project: 'Alpha', note: 'p39', noteTitle: 'Prop 3.9' }] } })
  const t = (title: string) => k.topics.find((x) => x.title === title)!

  it('이름이 같은 Study 노트·개념노트·Topic Review를 주제 하나로 묶는다', () => {
    const kc = t('Kempe chain')
    expect(kc.study?.path).toContain('Graph Theory')
    expect(kc.concept).toMatchObject({ id: 'kempe-chain', status: 'draft' })
    expect(kc.review?.path).toBe(path.join('planar-graph-coloring', 'kempe-chain.md'))
    expect(kc.subject).toBe('Mathematics › Graph Theory')
    expect(kc.uses).toEqual([expect.objectContaining({ rid: 'alpha' })])
    expect(k.topics.filter((x) => x.key === topicKey('Kempe chain'))).toHaveLength(1)
  })

  it('상태는 Study에만 → draft → reviewed, Topic Review만 있으면 draft', () => {
    expect(t('Kempe recoloring').status).toBe('study')
    expect(t('Kempe chain').status).toBe('draft')
    expect(t('Euler formula').status).toBe('reviewed')
    expect(t('Learned graph coloring').status).toBe('draft')
    expect(t('Planar graph coloring').review?.path).toBe(path.join('planar-graph-coloring', 'index.md'))
    expect(k.topics.some((x) => x.title === 'Topic Reviews')).toBe(false)
  })

  it('[[링크]]는 전제, 거꾸로는 이어지는 개념. 슬러그 링크도 맞춘다', () => {
    const euler = t('Euler formula').key
    const kc = t('Kempe chain')
    expect(kc.links).toContain(euler)
    expect(t('Euler formula').linkedBy).toContain(kc.key)
    // Topic Review의 [[restricted-boltzmann-machine|…]] → Study의 Restricted Boltzmann Machine
    expect(t('Learned graph coloring').links).toContain(t('Restricted Boltzmann Machine').key)
  })

  it('문헌노트는 인용으로 주제에 붙고, 안 붙은 것은 따로 주제가 된다', () => {
    expect(t('Kempe chain').papers.sort()).toEqual(['grey2006reducible', 'sample2020kempe'])
    expect(t('Learned graph coloring').papers).toEqual(['mock2017solving'])
    expect(k.topics.find((x) => x.key === 'paper:placeholder1992discharging')).toMatchObject({ status: 'paper', subject: '', papers: ['placeholder1992discharging'] })
  })

  it('Topic Review는 그 폴더 안 .md만 읽는다', () => {
    expect(readReview(reviews, 'learned-graph-coloring.md').title).toBe('Learned graph coloring')
    expect(() => readReview(reviews, '../library/papers/sample2020kempe.tex')).toThrow()
  })

  it('도우미', () => {
    expect(wikiTargets('a [[X#h|y]] ![[f.png]] [[dir/Z]]')).toEqual(['X', 'Z'])
    expect(topicKey('Kempe-chain')).toBe(topicKey('kempe chain'))
    // 한글 이름도 key가 비지 않는다 (NFKD로 자모가 풀려 지워지던 것)
    expect(topicKey('오일러 지표')).toBe('오일러지표')
    expect(topicKey('Euler 지표')).toBe('euler지표')
    expect(topicKey('Pólya 색칠')).toBe('polya색칠')
    expect(firstParagraph('# h\n\nshort\n\nThis is a long enough first paragraph with [[Link|alias]].')).toBe('This is a long enough first paragraph with alias.')
  })
})
