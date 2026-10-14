// 연구 흐름 (workbench/flow/*.yaml)
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, R, repo, useSampleApp } from './testkit.js'
import { classify } from './watcher.js'

useSampleApp()

const dir = () => path.join(repo, 'workbench', 'flow')
const put = (id: string, text: string) => fs.writeFileSync(path.join(dir(), `${id}.yaml`), text.trim() + '\n')
const get = async () => { const r = await app.inject({ method: 'GET', url: `${R}/flow` }); expect(r.statusCode).toBe(200); return r.json() }
beforeEach(() => { fs.rmSync(dir(), { recursive: true, force: true }); fs.mkdirSync(dir(), { recursive: true }) })

describe('흐름 읽기', () => {
  it('폴더가 없으면 빈 흐름', async () => {
    fs.rmSync(dir(), { recursive: true, force: true })
    expect(await get()).toEqual({ nodes: [], diagnostics: [] })
  })

  it('점을 날짜 순으로 읽고, 선 종류가 없으면 받는 점의 종류로 정한다', async () => {
    put('q', 'format: 1\nkind: question\nprogress: done\nresult: solved\nshort: 물음\ntitle: 물음 하나\ntopics: [coloring]\ndate: 2026-10-01\nfields:\n  question: 되나?')
    put('p', 'format: 1\nkind: proof\nprogress: active\nshort: 증명\ntitle: 증명 하나\ntopics: [coloring]\ndate: 2026-10-02\nfrom: [q]')
    put('q2', 'format: 1\nkind: question\nprogress: open\ntitle: 다음 물음\ntopics: [coloring]\ndate: 2026-10-03\nfrom: [{ id: p }]')
    const { nodes, diagnostics } = await get()
    expect(diagnostics).toEqual([])
    expect(nodes.map((n: { id: string }) => n.id)).toEqual(['q', 'p', 'q2'])
    expect(nodes[0]).toMatchObject({ file: 'workbench/flow/q.yaml', kind: 'question', progress: 'done', result: 'solved', fields: { question: '되나?' }, theorem: false })
    expect(nodes[1].from).toEqual([{ id: 'q', type: 'support' }])
    expect(nodes[2]).toMatchObject({ short: '다음 물음', from: [{ id: 'p', type: 'origin' }] })
  })

  it('사람이 승인한 증명이 근거에 있는 발견은 정리', async () => {
    const ev = (role: string) => `evidence:\n  - kind: proof\n    file: workbench/blocks/a.tex\n    text: 증명\n    checks:\n      - { at: 2026-10-01T10:00, by: x, role: ${role} }`
    put('a', `format: 1\nkind: finding\nprogress: done\nresult: solved\ntitle: 가\ntopics: [t]\n${ev('agent')}`)
    put('b', `format: 1\nkind: finding\nprogress: done\nresult: solved\ntitle: 나\ntopics: [t]\n${ev('human')}`)
    const { nodes } = await get()
    expect(nodes.find((n: { id: string }) => n.id === 'a').theorem).toBe(false)
    expect(nodes.find((n: { id: string }) => n.id === 'b').theorem).toBe(true)
  })

  it('틀린 곳은 진단으로 알리고, 읽을 수 있는 것은 읽는다', async () => {
    put('bad-yaml', 'kind: [')
    put('no-kind', 'format: 1\ntitle: 종류 없음')
    put('Bad_Name', 'format: 1\nkind: question\ntitle: x')
    put('loose', 'format: 2\nkind: finding\nprogress: active\nresult: solved\ntitle: 느슨\nfrom: [ghost]\nevidence:\n  - { kind: paper, text: x }')
    fs.writeFileSync(path.join(dir(), 'layout.yaml'), 'positions: {}\n')
    const { nodes, diagnostics } = await get()
    expect(nodes.map((n: { id: string }) => n.id)).toEqual(['loose'])
    expect(nodes[0]).toMatchObject({ progress: 'active', from: [], topics: [] })
    expect(nodes[0].result).toBeUndefined()
    const codes = diagnostics.map((d: { file: string; code: string }) => `${d.file.split('/').pop()}:${d.code}`).sort()
    expect(codes).toEqual(['Bad_Name.yaml:filename', 'bad-yaml.yaml:yaml', 'loose.yaml:evidence', 'loose.yaml:format', 'loose.yaml:from', 'loose.yaml:result', 'loose.yaml:topics', 'no-kind.yaml:kind'])
  })
})

it('흐름 파일이 바뀌면 화면에 알린다 (layout.yaml도)', () => {
  expect(classify('/r/workbench', '/r/workbench/flow/q.yaml')).toEqual({ type: 'flow' })
  expect(classify('/r/workbench', '/r/workbench/flow/notes.md')).toBeNull()
})
