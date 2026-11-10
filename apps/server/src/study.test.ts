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
    expect(after.chapters[0].concepts).toEqual([{ id: 'magnon', title: 'Magnon', checked: 'none', missing: false }, { id: 'gone', title: 'gone', checked: 'none', missing: true }])
    expect((await get('/api/library/study')).books).toEqual([{ id, title: 'Interacting Electrons', kind: '책', chapters: 2, done: 1 }])
    // 파일은 사람이 읽기 쉽게: 기본값(아직 · 빈 개념노트)은 적지 않는다
    expect(YAML.parse(fs.readFileSync(path.join(lib, 'study', `${id}.yaml`), 'utf8')).chapters[1]).toEqual({ title: 'Holstein–Primakoff', state: '읽는 중' })

    const stale = await app.inject({ method: 'PUT', url: `/api/library/study/${id}`, payload: { title: 'X', kind: '책', baseHash: book.hash, chapters: [] } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(after.hash)
  })
  it('reads hand-written files leniently and refuses bad ids', async () => {
    expect(parseStudy('title: Lectures\nkind: 강의\nchapters:\n  - Week 1\n  - title: Week 2\n    state: 모름\n    concepts: [ok-id, "bad id"]\n', 'x'))
      .toEqual({ title: 'Lectures', kind: '강의', chapters: [{ title: 'Week 1', state: '아직', concepts: [] }, { title: 'Week 2', state: '아직', concepts: ['ok-id'] }] })
    expect(parseStudy(': : :', 'fallback').title).toBe('fallback')
    expect((await app.inject({ url: '/api/library/study/..%2Fsecret' })).statusCode).toBe(400)
    expect(studySlug('양자 자성', new Set())).toBe('book')
    expect(studySlug('Many-Body Physics', new Set(['many-body-physics']))).toBe('many-body-physics-2')
  })
})
