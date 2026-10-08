// 원고 노트 key: 적지 않은 연구노트는 경로 key, 예전 key '' 자료 옮기기 (10/5 검토)
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { makeRepo, noteHash, tmp, useSampleApp } from './testkit.js'

useSampleApp()

function project(name: string) {
  const proj = makeRepo(name)
  const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
  w('workbench/notes/b-note/note.md', '# B\n\n본문.\n')
  w('workbench/notes/b-note/note.yaml', 'name: Beta\n')
  w('workbench/notes/a-note/note.md', '# A\n\n본문.\n')
  w('workbench/notes/a-note/note.yaml', 'name: Zeta\n')
  return { proj, w }
}

async function open(name: string, proj: string) {
  const a = buildApp({ configDir: path.join(tmp, `config-${name}`) })
  const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id as string
  const R = `/api/researches/${id}`
  const keys = async () => Object.fromEntries(((await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; main: string }[]).map((m) => [m.main, m.key]))
  return { a, R, keys }
}

describe('원고 노트 key', () => {
  it('적지 않은 연구노트는 경로 key: 이름을 바꾸거나 노트를 더해도 key가 그대로다', async () => {
    const { proj, w } = project('ms-key-stable')
    const { a, R, keys } = await open('ms-key-stable', proj)
    const before = await keys()
    expect(before).toEqual({ 'workbench/notes/b-note/note.md': 'workbench-notes-b-note-note', 'workbench/notes/a-note/note.md': 'workbench-notes-a-note-note' })
    // 이름순 첫째(Beta)를 Zz로 바꾸면 전에는 '' (주 노트 · PDF · 코멘트)가 다른 노트로 옮겨 갔다
    expect((await a.inject({ method: 'PATCH', url: `${R}/notes/head`, payload: { file: 'workbench/notes/b-note/note.md', patch: { title: 'Zz' }, baseHash: await noteHash('workbench/notes/b-note/note.md', a, R) } })).statusCode).toBe(200)
    w('workbench/notes/0-new/note.md', '# 새\n')
    w('workbench/notes/0-new/note.yaml', 'name: Aaa\n')
    const after = await keys()
    expect(after['workbench/notes/b-note/note.md']).toBe(before['workbench/notes/b-note/note.md'])
    expect(after['workbench/notes/a-note/note.md']).toBe(before['workbench/notes/a-note/note.md'])
    expect(Object.values(after)).not.toContain('')
    // ms 없이는 적은 원고가 없다고 알린다 (다른 노트를 고르지 않는다)
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript` })).statusCode).toBe(404)
    await a.close()
  })

  it('research.yaml에 적은 원고는 그대로 key ""', async () => {
    const { proj, w } = project('ms-key-declared')
    w('docs/main.tex', '\\begin{document}\nA\n\\end{document}\n')
    fs.appendFileSync(path.join(proj, 'workbench/research.yaml'), 'sources:\n  manuscript: docs/main.tex — 논문\n')
    const { a, keys } = await open('ms-key-declared', proj)
    expect((await keys())['docs/main.tex']).toBe('')
    await a.close()
  })

  it('예전 key "" 자료(코멘트 · 컴파일 결과)는 처음 열 때 그 노트(이름순 첫째)의 자리로 옮긴다', async () => {
    const { proj, w } = project('ms-key-migrate')
    w('workbench/comments/manuscript.md', '# 코멘트 · 원고 PDF\n\n## c-1 · 코멘트 · p.1\n\n좋다\n')
    w('workbench/.build/manuscript/note.pdf', '%PDF-1.4 old')
    const { a } = await open('ms-key-migrate', proj)
    const wb = (rel: string) => path.join(proj, 'workbench', rel)
    expect(fs.existsSync(wb('comments/manuscript.md'))).toBe(false)
    expect(fs.readFileSync(wb('comments/manuscript-workbench-notes-b-note-note.md'), 'utf8')).toContain('좋다')
    expect(fs.readFileSync(wb('.build/manuscript-workbench-notes-b-note-note/note.pdf'), 'utf8')).toBe('%PDF-1.4 old')
    await a.close()
  })
})
