import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { app, tmp, useSampleApp } from './testkit.js'
import { parseStudy, studySlug } from './study.js'

useSampleApp()
let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(tmp, 'study-'))
  fs.mkdirSync(path.join(lib, 'concepts'))
  fs.writeFileSync(path.join(lib, 'concepts', 'magnon.md'), '---\ntitle: Magnon\n---\n# Magnon\n\nA spin wave quantum.\n')
  app.registry.setLibrary(lib)
})
const get = async (url: string) => { const r = await app.inject({ url }); expect(r.statusCode, r.body).toBe(200); return r.json() }

describe('study books (공부, library study/<id>.yaml)', () => {
  it('creates a book, lists progress and saves chapters with linked concept notes', async () => {
    expect(await get('/api/library/study')).toEqual({ enabled: true, books: [] })
    const made = await app.inject({ method: 'POST', url: '/api/library/study', payload: { title: 'Interacting Electrons', kind: '책', source: 'auerbach1994', chapters: ['Spin coherent states', '', 'Holstein–Primakoff'] } })
    expect(made.statusCode, made.body).toBe(200)
    const { id } = made.json()
    expect(id).toBe('interacting-electrons')
    const book = await get(`/api/library/study/${id}`)
    expect(book.chapters.map((c: { title: string }) => c.title)).toEqual(['Spin coherent states', 'Holstein–Primakoff'])
    expect(book.chapters[0].state).toBe('아직')

    const saved = await app.inject({ method: 'PUT', url: `/api/library/study/${id}`, payload: { title: 'Interacting Electrons', kind: '책', source: 'auerbach1994', baseHash: book.hash,
      chapters: [{ title: 'Spin coherent states', state: '끝', concepts: ['magnon', 'gone'] }, { title: 'Holstein–Primakoff', state: '읽는 중', concepts: [] }] } })
    expect(saved.statusCode, saved.body).toBe(200)
    const after = saved.json()
    expect(after.chapters[0].concepts).toEqual([{ id: 'magnon', title: 'Magnon', checked: 'none', missing: false, done: false }, { id: 'gone', title: 'Gone', checked: 'none', missing: true, done: false }])
    expect((await get('/api/library/study')).books).toEqual([{ id, title: 'Interacting Electrons', kind: '책', chapters: 2, done: 1 }])
    // 파일은 사람이 읽기 쉽게: 기본값(아직 · 빈 개념노트)은 적지 않는다
    expect(YAML.parse(fs.readFileSync(path.join(lib, 'study', `${id}.yaml`), 'utf8')).chapters[1]).toEqual({ title: 'Holstein–Primakoff', state: '읽는 중' })

    const stale = await app.inject({ method: 'PUT', url: `/api/library/study/${id}`, payload: { title: 'X', kind: '책', baseHash: book.hash, chapters: [] } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(after.hash)
  })
  it('reads hand-written files leniently and refuses bad ids', async () => {
    expect(parseStudy('title: Lectures\nkind: 강의\nchapters:\n  - Week 1\n  - title: Week 2\n    state: 모름\n    concepts: [ok-id, "bad id"]\n', 'x'))
      .toEqual({ title: 'Lectures', kind: '강의', chapters: [{ title: 'Week 1', state: '아직', goals: [], read: [], concepts: [], do: [] }, { title: 'Week 2', state: '아직', goals: [], read: [], concepts: [{ id: 'ok-id', done: false }], do: [] }] })
    expect(parseStudy(': : :', 'fallback').title).toBe('fallback')
    expect((await app.inject({ url: '/api/library/study/..%2Fsecret' })).statusCode).toBe(400)
    expect(studySlug('양자 자성', new Set())).toBe('book')
    expect(studySlug('Many-Body Physics', new Set(['many-body-physics']))).toBe('many-body-physics-2')
  })
  it('plans a session with goals and three checklists, and checks one item at a time', async () => {
    fs.writeFileSync(path.join(lib, 'references.bib'), '@book{vaswaniAttention2017,\n  title = {Attention Is All You Need},\n  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},\n  year = {2017}\n}\n')
    fs.mkdirSync(path.join(lib, 'study'))
    fs.writeFileSync(path.join(lib, 'study', 'nn.yaml'), [
      'title: NN', 'kind: 강의', 'chapters:', '  - title: Attention', '    goals: [Write the attention formula]',
      '    read:', '      - key: vaswaniAttention2017', '        at: §3.2', '      - text: Karpathy video', '        url: https://example.com/v', '      - noSuchKey2020',
      '    concepts: [magnon, self-attention]', '    do: [Compute softmax by hand]', '',
    ].join('\n'))
    const book = await get('/api/library/study/nn')
    const c = book.chapters[0]
    expect(c.goals).toEqual(['Write the attention formula'])
    expect(c.read).toEqual([
      { key: 'vaswaniAttention2017', at: '§3.2', done: false, label: 'Vaswani 외 2017', title: 'Attention Is All You Need', missing: false },
      { text: 'Karpathy video', url: 'https://example.com/v', done: false, label: 'Karpathy video', missing: false },
      { key: 'noSuchKey2020', done: false, label: 'noSuchKey2020', missing: true },
    ])
    expect(c.concepts.map((n: { id: string; missing: boolean }) => [n.id, n.missing])).toEqual([['magnon', false], ['self-attention', true]])
    expect(c.do).toEqual([{ text: 'Compute softmax by hand', done: false }])

    const check = (body: object) => app.inject({ method: 'POST', url: '/api/library/study/nn/check', payload: body })
    expect((await check({ chapter: 0, list: 'read', index: 0, item: 'vaswaniAttention2017', done: true })).statusCode).toBe(200)
    expect((await check({ chapter: 0, list: 'concepts', index: 1, item: 'self-attention', done: true })).statusCode).toBe(200)
    const r = await check({ chapter: 0, list: 'do', index: 0, item: 'Compute softmax by hand', done: true })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().chapters[0].do).toEqual([{ text: 'Compute softmax by hand', done: true }])
    expect((await check({ chapter: 0, list: 'do', index: 0, item: 'Something else', done: true })).statusCode).toBe(409)
    // 체크한 것만 done을 적고, 체크하지 않은 개념노트 · 할 일은 글자 하나로
    expect(YAML.parse(fs.readFileSync(path.join(lib, 'study', 'nn.yaml'), 'utf8')).chapters[0]).toEqual({
      title: 'Attention', goals: ['Write the attention formula'],
      read: [{ key: 'vaswaniAttention2017', at: '§3.2', done: true }, { text: 'Karpathy video', url: 'https://example.com/v' }, { key: 'noSuchKey2020' }],
      concepts: ['magnon', { id: 'self-attention', done: true }], do: [{ text: 'Compute softmax by hand', done: true }],
    })
    // 고치기 창의 저장은 체크를 그대로 둔다
    const now = await get('/api/library/study/nn')
    const saved = await app.inject({ method: 'PUT', url: '/api/library/study/nn', payload: { title: 'NN', kind: '강의', baseHash: now.hash,
      chapters: [{ title: 'Attention', state: '읽는 중', goals: ['Write the attention formula'], read: [{ key: 'vaswaniAttention2017', at: '§3.2', done: true }, { key: 'bad key' }].slice(0, 1),
        concepts: [{ id: 'self-attention', done: true }], do: [{ text: 'Compute softmax by hand', done: true }, { text: 'Read §3.3', done: false }] }] } })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json().chapters[0].concepts[0].done).toBe(true)
    expect(saved.json().chapters[0].do.map((d: { text: string }) => d.text)).toEqual(['Compute softmax by hand', 'Read §3.3'])
    const bad = await app.inject({ method: 'PUT', url: '/api/library/study/nn', payload: { title: 'NN', kind: '강의', baseHash: saved.json().hash, chapters: [{ title: 'A', state: '아직', concepts: [], read: [{ key: 'bad key' }] }] } })
    expect(bad.statusCode).toBe(400)
  })
})
