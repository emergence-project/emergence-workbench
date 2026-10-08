import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildKnowledge, type KnowledgeTopic } from './knowledge.js'
import { listLibraryNotes } from './libraryNotes.js'
import { app, tmp, useSampleApp } from './testkit.js'

useSampleApp()
let library: string, study: string, reviews: string
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const studyNote = (title: string, body = '') => write(path.join(study, 'Concept-Space', `${title}.md`), body)
const concept = (id: string, title: string, aliases: string[], original = title) => {
  write(path.join(library, 'concepts', `${id}.md`), `---\ntitle: ${title}\naliases: ${JSON.stringify(aliases)}\nstudy: Concept-Space/${original}.md\n---\nA complete concept paragraph with enough content for a sample note.\n`)
}
const build = (reverse = false) => {
  const notes = listLibraryNotes(library)
  return buildKnowledge({ library, study, reviews, notes: reverse ? notes.reverse() : notes, usedBy: {} }).topics
}

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(tmp, 'aliases-'))
  library = path.join(dir, 'library'); study = path.join(dir, 'study'); reviews = path.join(dir, 'reviews')
  studyNote('Original')
  studyNote('X', '---\naliases: [Study alias]\n---\n[[Target]] [[Original]]')
  studyNote('Target')
  studyNote('Incoming', '[[X]] [[Study alias]]')
  concept('survivor', 'Survivor', ['X'], 'Original')
})

describe('merged Study aliases', () => {
  it.each(['X', 'Study alias'])('folds a Study title or alias (%s), preserving both link directions and the original Study path', (name) => {
    concept('survivor', 'Survivor', [name], 'Original')
    const topics = build()
    const survivor = topics.find((t) => t.concept?.id === 'survivor')!
    expect(topics.some((t) => t.key === 'x')).toBe(false)
    expect(survivor.study?.path).toBe('Concept-Space/Original.md')
    expect(survivor.names).toEqual(expect.arrayContaining(['x', 'studyalias']))
    expect(survivor.links).toEqual(['target'])
    expect(topics.find((t) => t.key === 'target')!.linkedBy).toContain(survivor.key)
    expect(topics.find((t) => t.key === 'incoming')!.links).toEqual([survivor.key])
    expect(topics.filter((t) => t.study && !t.concept && !t.review)).toHaveLength(2)
    expect(build(true)).toEqual(topics)
  })

  it('also folds the concept title when study points at a different original', () => {
    concept('survivor', 'X', [], 'Original')
    expect(build().some((t) => t.key === 'x')).toBe(false)
    expect(build().find((t) => t.key === 'original')!.title).toBe('X')
  })

  it('keeps another concept with an overlapping title in either read order', () => {
    concept('x', 'X', [])
    const topics = build()
    expect(topics.find((t) => t.key === 'x')!.concept?.id).toBe('x')
    expect(topics.find((t) => t.key === 'original')!.concept?.id).toBe('survivor')
    expect(topics.find((t) => t.key === 'incoming')!.links).toEqual(['x'])
    expect(build(true)).toEqual(topics)
  })

  it('chooses the same survivor for a shared Study alias in either read order', () => {
    studyNote('Another')
    concept('another', 'Another', ['X'])
    const topics = build()
    expect(topics.some((t) => t.key === 'x')).toBe(false)
    expect(topics.find((t) => t.key === 'incoming')!.links).toEqual(['another'])
    expect(build(true)).toEqual(topics)
  })

  it('leaves a Study topic with a Topic Review intact', () => {
    write(path.join(reviews, 'x.md'), '---\ntitle: X\n---\n[[Target]]')
    expect(build().find((t) => t.key === 'x')).toMatchObject({ review: { path: 'x.md' }, status: 'draft' })
  })

  it('refreshes cached knowledge after adding aliases and deleting the duplicate concept', async () => {
    concept('survivor', 'Survivor', [], 'Original')
    concept('x', 'X', [])
    app.registry.setLibrary(library)
    app.registry.setStudy(study)
    const get = async (): Promise<KnowledgeTopic[]> => {
      const res = await app.inject('/api/knowledge')
      expect(res.statusCode).toBe(200)
      return res.json().topics
    }
    expect((await get()).find((t) => t.key === 'x')!.concept?.id).toBe('x')
    concept('survivor', 'Survivor', ['X'], 'Original')
    fs.unlinkSync(path.join(library, 'concepts/x.md'))
    await expect.poll(async () => (await get()).some((t) => t.key === 'x'), { timeout: 5000 }).toBe(false)
    expect((await get()).find((t) => t.key === 'incoming')!.links).toEqual(['original'])
  })
})
