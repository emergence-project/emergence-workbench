// 연구노트 지우기: 15일 보관 뒤 지움 (10/4 17:04)
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { listTrash } from './noteTrash.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('연구노트 지우기', () => {
  it('지우면 .trash로 옮겨 두고, 되살리면 원래 자리로, 15일이 지나면 정말 지운다. 원고는 지우지 않는다', async () => {
    const proj = makeRepo('note-trash')
    fs.mkdirSync(path.join(proj, 'workbench'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'PRB.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n')
    fs.writeFileSync(path.join(proj, 'workbench/research.yaml'), 'title: N\nsources:\n  manuscript: PRB.tex — 논문 원고\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-note-trash') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const R = `/api/researches/${id}`
    await a.inject({ method: 'POST', url: `${R}/notes`, payload: { kind: 'note', name: 'Wheel partition' } })
    const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; kind: string; name: string }[]
    const note = list.find((m) => m.kind === 'note')!
    const paper = list.find((m) => m.kind === 'paper')!

    expect((await a.inject({ method: 'DELETE', url: `${R}/notes?ms=${encodeURIComponent(paper.key)}` })).statusCode).toBe(400)
    const del = await a.inject({ method: 'DELETE', url: `${R}/notes?ms=${encodeURIComponent(note.key)}` })
    expect(del.statusCode).toBe(200)
    expect(fs.existsSync(path.join(proj, 'workbench/notes/wheel-partition'))).toBe(false)
    expect(((await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as unknown[]).length).toBe(1)
    const trash = (await a.inject({ method: 'GET', url: `${R}/notes/trash` })).json()
    expect(trash).toMatchObject([{ name: 'Wheel partition', from: 'workbench/notes/wheel-partition' }])

    const back = await a.inject({ method: 'POST', url: `${R}/notes/trash/${trash[0].id}/restore` })
    expect(back.json()).toEqual({ path: 'workbench/notes/wheel-partition' })
    expect(fs.existsSync(path.join(proj, 'workbench/notes/wheel-partition/note.md'))).toBe(true)
    expect(fs.existsSync(path.join(proj, 'workbench/notes/wheel-partition/trash.yaml'))).toBe(false)

    const again = (await a.inject({ method: 'DELETE', url: `${R}/notes?ms=${encodeURIComponent(note.key)}` })).json()
    const wbRoot = path.join(proj, 'workbench')
    const wb = { root: wbRoot } as Parameters<typeof listTrash>[0]
    expect(listTrash(wb, new Date(Date.parse(again.at) + 14 * 86400_000))).toHaveLength(1)
    expect(listTrash(wb, new Date(Date.parse(again.at) + 15 * 86400_000))).toHaveLength(0)
    expect(fs.readdirSync(path.join(wbRoot, '.trash'))).toEqual([])
  })
})
