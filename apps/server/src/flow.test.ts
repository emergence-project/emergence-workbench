// 연구 흐름 (workbench/flow/*.yaml)
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, R, repo, useSampleApp } from './testkit.js'
import { classify } from './watcher.js'
import { evidenceHash } from './flowGaps.js'
import { flowStatusSections } from './flowStatus.js'
import { statusSummary } from './agentStatus.js'
import { Workbench } from './workbench.js'

useSampleApp()

const dir = () => path.join(repo, 'workbench', 'flow')
/** 시험 점은 사용자가 만든 것으로 (by: user). by도 start도 없는 점은 옛 점이라 빈틈을 세지 않는다 (10/30) */
const put = (id: string, text: string) => fs.writeFileSync(path.join(dir(), `${id}.yaml`), text.trim() + (/^(by|start):/m.test(text) ? '' : '\nby: user') + '\n')
const get = async () => { const r = await app.inject({ method: 'GET', url: `${R}/flow` }); expect(r.statusCode).toBe(200); return r.json() }
beforeEach(() => { fs.rmSync(dir(), { recursive: true, force: true }); fs.mkdirSync(dir(), { recursive: true }) })

describe('흐름 읽기', () => {
  it('폴더가 없으면 빈 흐름', async () => {
    fs.rmSync(dir(), { recursive: true, force: true })
    expect(await get()).toEqual({ nodes: [], diagnostics: [], layout: {}, rows: null })
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
    expect(codes).toEqual(['Bad_Name.yaml:filename', 'bad-yaml.yaml:yaml', 'loose.yaml:evidence', 'loose.yaml:format', 'loose.yaml:from', 'loose.yaml:result', 'no-kind.yaml:kind'])
  })
})

it('흐름 파일이 바뀌면 화면에 알린다 (layout.yaml도)', () => {
  expect(classify('/r/workbench', '/r/workbench/flow/q.yaml')).toEqual({ type: 'flow' })
  expect(classify('/r/workbench', '/r/workbench/flow/notes.md')).toBeNull()
})

describe('흐름 고치기', () => {
  const send = (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url: `${R}/flow${url}`, payload })
  const make = async (body: object) => { const r = await send('POST', '', body); expect(r.statusCode).toBe(200); return r.json().node }

  it('새 점: 파일 이름은 짧은 제목에서, 겹치면 -2', async () => {
    const a = await make({ kind: 'question', short: 'Five colors?', topics: ['coloring'] })
    expect(a).toMatchObject({ id: 'five-colors', kind: 'question', progress: 'open', title: 'Five colors?', topics: ['coloring'] })
    const b = await make({ kind: 'proof', short: 'Five colors', topics: ['coloring'], from: [{ id: 'five-colors', type: 'support' }] })
    expect(b.id).toBe('five-colors-2')
    expect(b.from).toEqual([{ id: 'five-colors', type: 'support' }])
    const k = await make({ kind: 'finding', short: '한글 제목', topics: ['coloring'] })
    expect(k.id).toMatch(/^step-\d{4}-\d{2}-\d{2}$/)
    expect((await send('POST', '', { kind: 'proof', short: 'x', topics: ['t'], from: [{ id: 'nope', type: 'use' }] })).statusCode).toBe(400)
  })

  it('고치기는 원래 모양을 지킨다: 화면처럼 모든 칸을 그대로 보내면 바이트가 같고, 한 칸만 바꾸면 그 줄만 (10/20 점검)', async () => {
    const text = "format: 1\nkind: question\nprogress: active\nshort: Theory + toolkit\ntitle: 이론을 정리할 수 있는가\ntopics:\n- fundamental\n- toolkit\ndate: '2026-08-01'\nfields:\n  question: Can it?\nevidence:\n- kind: other\n  file: workbench/research.yaml\n  text: research question\n  checks: []\nguesses:\n- 'quoted: guess'\n"
    fs.writeFileSync(path.join(dir(), 'same.yaml'), text)
    const n = (await get()).nodes.find((x: { id: string }) => x.id === 'same')
    const all = { short: n.short, title: n.title, kind: n.kind, progress: n.progress, result: null, topics: n.topics, from: n.from, fields: n.fields,
      evidence: n.evidence.map((e: { kind: string; text: string; file?: string }) => ({ kind: e.kind, text: e.text, file: e.file })) }
    expect((await send('PATCH', '/same', { baseHash: n.hash, set: all })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(dir(), 'same.yaml'), 'utf8')).toBe(text)
    const n2 = (await get()).nodes.find((x: { id: string }) => x.id === 'same')
    await send('PATCH', '/same', { baseHash: n2.hash, set: { ...all, short: 'LSWT canon' } })
    expect(fs.readFileSync(path.join(dir(), 'same.yaml'), 'utf8')).toBe(text.replace('short: Theory + toolkit', 'short: LSWT canon'))
    fs.rmSync(path.join(dir(), 'same.yaml'))
  })

  it('목록 들여쓰기는 글 안의 "…:\\n- " 줄이 아니라 실제 목록으로 잰다', async () => {
    const text = "format: 1\nkind: question\nprogress: active\nshort: Block\ntitle: 블록 글\ndate: '2026-08-01'\nfields:\n  question: |\n    확인할 것:\n    - 첫째\nevidence:\n  - kind: other\n    file: a.md\n    text: 근거\n"
    fs.writeFileSync(path.join(dir(), 'block.yaml'), text)
    const n = (await get()).nodes.find((x: { id: string }) => x.id === 'block')
    expect((await send('PATCH', '/block', { baseHash: n.hash, set: { short: 'Block 2' } })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(dir(), 'block.yaml'), 'utf8')).toBe(text.replace('short: Block', 'short: Block 2'))
    fs.rmSync(path.join(dir(), 'block.yaml'))
  })

  it('시작일 · 끝난 날 · 한 이 · 작업은 앱이 적는다 (10/21): 시작일은 고치기로 못 바꾸고, 없던 옛 점은 처음 고칠 때 적는다', async () => {
    const made = (await send('POST', '', { kind: 'calc', short: 'Dates', by: 'codex', task: '2026-10-05-x' })).json().node
    expect(made).toMatchObject({ by: 'codex', task: '2026-10-05-x' })
    expect(made.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(made.ended).toBeUndefined()
    expect((await send('PATCH', `/${made.id}`, { baseHash: made.hash, set: { date: '2020-01-01' } })).statusCode).toBe(400)
    const done = (await send('PATCH', `/${made.id}`, { baseHash: made.hash, set: { progress: 'done', result: 'dropped', reason: '안 함' } })).json().node
    expect(done.ended).toBe(made.date)
    const open = (await send('PATCH', `/${made.id}`, { baseHash: done.hash, set: { progress: 'active' } })).json().node
    expect(open.ended).toBeUndefined()
    const user = (await send('POST', '', { kind: 'question', short: 'Mine' })).json().node
    expect(user.by).toBe('user')
    put('old', 'format: 1\nkind: question\nprogress: open\nshort: 옛 점\ntitle: 옛 점')
    const old = (await get()).nodes.find((x: { id: string }) => x.id === 'old')
    expect(old.date).toBeUndefined()
    const fixed = (await send('PATCH', '/old', { baseHash: old.hash, set: { short: '옛 점 2' } })).json().node
    expect(fixed.date).toBe(made.date)
  })

  it('고치기: 보낸 칸만, 끝나면 결과, 근거를 고쳐도 확인 기록은 남는다, 낡은 hash는 409', async () => {
    put('p', 'format: 1\nkind: proof\nprogress: active\nshort: 증명\ntitle: 증명 하나\ntopics: [t]\n# 사람이 남긴 주석\nevidence:\n  - kind: proof\n    file: a.tex\n    text: 옛 설명\n    checks:\n      - { at: 2026-10-01T10:00, by: bot, role: agent }')
    const n = (await get()).nodes[0]
    const r = await send('PATCH', '/p', { baseHash: n.hash, set: { progress: 'done', fields: { goal: ' 목표 ', method: '' }, evidence: [{ kind: 'proof', file: 'a.tex', text: '새 설명' }, { kind: 'paper', ref: 'key2020', text: '논문' }] } })
    expect(r.statusCode).toBe(200)
    const m = r.json().node
    expect(m).toMatchObject({ progress: 'done', result: 'solved', short: '증명', fields: { goal: '목표' } })
    expect(m.evidence[0]).toMatchObject({ text: '새 설명', checks: [{ by: 'bot', role: 'agent' }] })
    expect(m.evidence[1]).toMatchObject({ kind: 'paper', ref: 'key2020', checks: [] })
    expect(fs.readFileSync(path.join(dir(), 'p.yaml'), 'utf8')).toContain('# 사람이 남긴 주석')
    expect((await send('PATCH', '/p', { baseHash: n.hash, set: { short: 'x' } })).statusCode).toBe(409)
    const back = (await send('PATCH', '/p', { baseHash: m.hash, set: { progress: 'active' } })).json().node
    expect(back.result).toBeUndefined()
  })

  it('고치기: 같은 파일을 가리키는 근거가 둘이면 확인 기록을 순서대로 짝짓는다 (뒤 근거의 승인이 앞 근거로 옮겨 붙지 않는다)', async () => {
    put('q', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 발견\ntitle: 발견 하나\ntopics: [t]\nevidence:\n  - kind: proof\n    file: a.tex\n    text: 증명\n  - kind: calc\n    file: a.tex\n    text: 계산\n    checks:\n      - { at: 2026-10-01T10:00, by: 사용자, role: human }')
    const before = (await get()).nodes.find((x: { id: string }) => x.id === 'q')
    expect(before.theorem).toBe(false)
    const r = await send('PATCH', '/q', { baseHash: before.hash, set: { evidence: [{ kind: 'proof', file: 'a.tex', text: '증명 고침' }, { kind: 'calc', file: 'a.tex', text: '계산' }] } })
    expect(r.statusCode).toBe(200)
    const m = r.json().node
    expect(m.evidence[0]).toMatchObject({ kind: 'proof', text: '증명 고침', checks: [] })
    expect(m.evidence[1]).toMatchObject({ kind: 'calc', checks: [{ role: 'human' }] })
    expect(m.theorem).toBe(false)
  })

  it('사람 승인과 거두기: 기록은 덧붙이기만, 정리 여부가 따라간다', async () => {
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\ntitle: 가\ntopics: [t]\nevidence:\n  - kind: proof\n    file: a.tex\n    text: 증명')
    let n = (await get()).nodes[0]
    n = (await send('POST', '/f/check', { baseHash: n.hash, ev: 0 })).json().node
    expect(n.theorem).toBe(true)
    n = (await send('POST', '/f/check', { baseHash: n.hash, ev: 0, revoked: true })).json().node
    expect(n.theorem).toBe(false)
    expect(n.evidence[0].checks).toHaveLength(2)
    expect(n.evidence[0].checks[1]).toMatchObject({ role: 'human', revoked: true })
    expect((await send('POST', '/f/check', { baseHash: n.hash, ev: 3 })).statusCode).toBe(400)
  })

  it('승인: 손으로 쓴 파일에 사전이 아닌 근거 항목이 섞여도 화면의 번호와 같은 근거에 붙인다', async () => {
    put('g', 'format: 1\nkind: finding\nprogress: done\nresult: solved\ntitle: 가\ntopics: [t]\nevidence:\n  - 잘못 적은 줄\n  - kind: proof\n    file: a.tex\n    text: 증명')
    let n = (await get()).nodes[0]
    expect(n.evidence).toHaveLength(1)
    n = (await send('POST', '/g/check', { baseHash: n.hash, ev: 0 })).json().node
    expect(n.evidence[0]).toMatchObject({ kind: 'proof', checks: [{ role: 'human' }] })
    expect(n.theorem).toBe(true)
  })

  it('지우기: 파일과 그 점을 가리키던 선, 손으로 옮긴 자리를 뺀다', async () => {
    put('a', 'format: 1\nkind: question\nprogress: open\ntitle: 가\ntopics: [t]')
    put('b', 'format: 1\nkind: proof\nprogress: open\ntitle: 나\ntopics: [t]\nfrom: [a]')
    put('c', 'format: 1\nkind: proof\nprogress: open\ntitle: 다\ntopics: [t]\nfrom: [{ id: a, type: use }, { id: b, type: support }]')
    expect((await send('PUT', '/layout', { id: 'a', at: { c: 2, r: -1 } })).json().layout).toEqual({ a: { c: 2, r: -1 } })
    const a = (await get()).nodes.find((n: { id: string }) => n.id === 'a')
    expect((await send('DELETE', '/a')).statusCode).toBe(400)
    const records = path.join(repo, 'workbench', 'comments', 'flow-a.md')
    fs.mkdirSync(path.dirname(records), { recursive: true })
    fs.writeFileSync(records, '# 흐름 점 가\n\n## 2026-10-17 10:00 · 메모 · 전체\n\n남은 기록\n')
    const r = await send('DELETE', `/a?baseHash=${a.hash}`)
    const { trashed, ...rest } = r.json()
    expect(rest).toEqual({ id: 'a', changed: ['b', 'c'] })
    // 점 파일과 그 점의 기록은 flow/.trash/로 옮겨, 기록 탭에 없는 점의 기록이 남지 않는다
    expect(trashed).toHaveLength(2)
    expect(trashed[0]).toMatch(/^workbench\/flow\/\.trash\/a-\d{8}T\d{6}\.yaml$/)
    expect(trashed[1]).toMatch(/^workbench\/flow\/\.trash\/a-\d{8}T\d{6}\.comments\.md$/)
    expect(fs.existsSync(records)).toBe(false)
    expect(fs.readFileSync(path.join(repo, trashed[1]), 'utf8')).toContain('남은 기록')
    const listed = (await app.inject({ method: 'GET', url: `${R}/records` })).json().files.map((f: { target: string }) => f.target)
    expect(listed).not.toContain('flow-a')
    const { nodes, diagnostics, layout } = await get()
    expect(diagnostics).toEqual([])
    expect(nodes.map((n: { id: string; from: unknown[] }) => [n.id, n.from])).toEqual([['b', []], ['c', [{ id: 'b', type: 'support' }]]])
    expect(layout).toEqual({})
  })

  it('자리: 다른 점이 놓인 칸으로 옮기면 서로 바꾸고, null이면 푼다', async () => {
    put('a', 'format: 1\nkind: question\nprogress: open\ntitle: 가\ntopics: [t]')
    put('b', 'format: 1\nkind: question\nprogress: open\ntitle: 나\ntopics: [t]')
    await send('PUT', '/layout', { id: 'a', at: { c: 0, r: 0 } })
    await send('PUT', '/layout', { id: 'b', at: { c: 1, r: 1 } })
    expect((await send('PUT', '/layout', { id: 'a', at: { c: 1, r: 1 } })).json().layout).toEqual({ a: { c: 1, r: 1 }, b: { c: 0, r: 0 } })
    expect((await send('PUT', '/layout', { id: 'b', at: null })).json().layout).toEqual({ a: { c: 1, r: 1 } })
    expect((await get()).layout).toEqual({ a: { c: 1, r: 1 } })
    expect((await send('PUT', '/layout', { id: 'zz', at: null })).statusCode).toBe(404)
  })

  it('보이는 줄: 적으면 자리를 옮겨도 남고, 자리를 바꿔도 줄은 그대로', async () => {
    put('a', 'format: 1\nkind: question\nprogress: open\ntitle: 가')
    expect((await send('PUT', '/rows', { top: -3, bottom: 1 })).json()).toEqual({ rows: { top: -3, bottom: 1 } })
    await send('PUT', '/layout', { id: 'a', at: { c: 1, r: 0 } })
    expect(await get()).toMatchObject({ rows: { top: -3, bottom: 1 }, layout: { a: { c: 1, r: 0 } } })
    expect(fs.readFileSync(path.join(dir(), 'layout.yaml'), 'utf8')).toContain('rows: { top: -3, bottom: 1 }')
    expect((await send('PUT', '/rows', { top: 1, bottom: 2 })).statusCode).toBe(400)
  })

  it('줄 이름: 주제와 따로 적고, 범위 밖으로 나간 줄의 이름은 빠지며, 이름을 보내지 않으면 둔다', async () => {
    put('a', 'format: 1\nkind: question\nprogress: open\ntitle: 가\ntopics: [t]')
    expect((await send('PUT', '/rows', { top: -1, bottom: 1, names: { '-1': ' 위 줄 ', '0': '가운데', '1': '' } })).json()).toEqual({ rows: { top: -1, bottom: 1, names: { '-1': '위 줄', '0': '가운데' } } })
    expect(fs.readFileSync(path.join(dir(), 'layout.yaml'), 'utf8')).toContain('names:\n    -1: 위 줄\n    0: 가운데')
    expect((await send('PUT', '/rows', { top: 0, bottom: 1 })).json()).toEqual({ rows: { top: 0, bottom: 1, names: { '0': '가운데' } } })
    expect((await send('PUT', '/rows', { top: 0, bottom: 1, names: { x: 'a' } })).statusCode).toBe(400)
  })

  it('줄 옮기기: 그 줄의 점과 이름이 함께 가고 사이 줄은 한 칸씩 밀린다', async () => {
    for (const id of ['a', 'b', 'c']) put(id, `format: 1\nkind: question\nprogress: open\ntitle: ${id}`)
    await send('PUT', '/rows', { top: -1, bottom: 1, names: { '-1': '위', '1': '아래' } })
    const r = (await send('PUT', '/rows/move', { from: -1, to: 1, cells: { a: { c: 0, r: -1 }, b: { c: 0, r: 0 }, c: { c: 1, r: 1 }, zz: { c: 5, r: 0 } } })).json()
    expect(r).toEqual({ rows: { top: -1, bottom: 1, names: { '1': '위', '0': '아래' } }, layout: { a: { c: 0, r: 1 }, b: { c: 0, r: -1 }, c: { c: 1, r: 0 } } })
    expect((await send('PUT', '/rows/move', { from: 0, to: 0.5, cells: {} })).statusCode).toBe(400)
  })

  it('자리: 10/14 오전의 주제별 자리도 읽고, 쓸 때 프로젝트 하나로 옮긴다', async () => {
    put('a', 'format: 1\nkind: question\nprogress: open\ntitle: 가')
    put('b', 'format: 1\nkind: question\nprogress: open\ntitle: 나')
    fs.writeFileSync(path.join(dir(), 'layout.yaml'), 'topics:\n  t: { a: { c: 2, r: 1 } }\n')
    expect((await get()).layout).toEqual({ a: { c: 2, r: 1 } })
    await send('PUT', '/layout', { id: 'b', at: { c: 0, r: 0 } })
    expect(fs.readFileSync(path.join(dir(), 'layout.yaml'), 'utf8')).toMatch(/^dots:\n  a: \{ c: 2, r: 1 \}\n  b: \{ c: 0, r: 0 \}\n$/m)
  })

  it('주제가 없는 점도 만들고 읽는다', async () => {
    const n = await make({ kind: 'question', short: 'loose' })
    expect(n.topics).toEqual([])
    expect((await get()).diagnostics).toEqual([])
  })
})

describe('STATUS의 흐름 절', () => {
  it('요약은 최근 점과 열린 점 · 승인 대기를, 지도는 점마다 한 줄을 싣는다', async () => {
    const { generateStatus, statusPart, statusSummary } = await import('./agentStatus.js')
    const { Workbench } = await import('./workbench.js')
    const wb = new Workbench(path.join(repo, 'workbench'))
    fs.rmSync(dir(), { recursive: true, force: true })
    expect(await generateStatus(wb)).not.toContain('## 흐름')
    fs.mkdirSync(dir(), { recursive: true })
    put('q', 'format: 1\nkind: question\nprogress: paused\nshort: 물음\ntitle: 물음 하나\ndate: 2026-10-01\nfields:\n  question: 되나?\nguesses: [에이전트가 쓴 물음]')
    put('p', 'format: 1\nkind: proof\nprogress: done\nresult: dropped\nshort: 증명\ntitle: 증명 하나\ndate: 2026-10-02\nend: true\nfrom: [{ id: q, type: origin }]')
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 발견\ntitle: 발견 하나\ndate: 2026-10-03\nfrom: [q]\nevidence:\n  - { kind: proof, file: workbench/notes/a/note.md, text: 증명, checks: [{ at: 2026-10-03T10:00, by: claude, role: agent }] }')
    for (let i = 0; i < 5; i++) put(`d${i}`, `format: 1\nkind: calc\nprogress: done\nresult: solved\nshort: 계산 ${i}\ntitle: 계산 ${i}\ndate: 2026-10-1${i}`)
    const status = await generateStatus(wb)
    const brief = statusPart(status, '흐름 요약')!
    expect(brief).toContain('점 8 · 해결 6 · 멈춤 1 · 폐기 1')
    expect(brief).toContain('### 최근 점 5')
    expect(brief).toContain('- 2026-10-14 π 계산 4 · `flow-d4` · 수치 계산 · 해결 — 계산 4')
    // 최근 5개 밖의 열린 점도 핵심 칸까지
    expect(brief).toMatch(/### 그 밖의 열린 점 1\n\n- 2026-10-01 \? 물음 · `flow-q` · 질문 · 멈춤 — 물음 하나\n  - 물음: 되나\?\n  - 뒤따른 점 → `p` \(폐기 · 흐름 종료\) · `f` \(해결\)\n  - 빈틈: 반증 · 폐기 · 멈춤의 이유가 없다\n  - 빈틈: 판정 기준이 없다 \(무엇이 나오면 해결 · 반증인가\)\n  - 짐작\(사람 확인 안 함\): 에이전트가 쓴 물음/)
    expect(brief).toContain('### 사람 승인 대기 1\n')
    expect(brief).toContain('`flow-f` · 명제 · 해결 — 발견 하나')
    const map = statusPart(status, '흐름 지도')!
    expect(map).toContain('## 흐름 지도 8')
    expect(map).toContain('- ▶ `q` · 질문 · 멈춤 · 빈틈 2 → 흐름 요약')
    expect(map).toContain('- `p` · 증명 · 폐기 · 흐름 종료 · 빈틈 2 — 증명 하나 ← 발단 q')
    // 빈틈 절: 새것부터 10점, 나머지는 수만
    expect(brief).toContain('### 빈틈 8 ')
    expect(brief).toContain('- `d4` 계산 4: 해결인데 근거가 없다 · 끝났는데 결과 칸이 비었다 · 다음 할 일도, 뒤따른 점도, 흐름 종료도 없다')
    // 짧으면 그대로, 길면(빈틈 절이 붙어 1.5KB를 넘음) 이름만
    expect(statusSummary(status, 'x')).toMatch(/^(## )?-? ?흐름 요약/m)
  })
})

describe('흐름의 양식 · 해결 문턱 · 빈틈 (10/20)', () => {
  const send = (method: 'POST' | 'PATCH' | 'GET', url: string, payload?: object) => app.inject({ method, url: `${R}/flow${url}`, payload })
  const note = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text) }

  it('실행 · 단계 · 이유 · 다음 할 일 · 근거의 절을 읽고 쓴다', async () => {
    put('c', 'format: 1\nkind: calc\nprogress: active\nshort: 계산\ntitle: 계산 하나\nrun:\n  code: code/a.py\n  params: { L: 800, r: [6, 32] }\nsteps:\n  - 첫 단계\n  - { text: 둘째, uses: 공리 A1 }\nnext: 넓히기\npriority: high\nevidence:\n  - { kind: calc, file: workbench/n.md, section: 결과, text: 표 }')
    const n = (await get()).nodes[0]
    expect(n).toMatchObject({ run: { code: 'code/a.py', params: { L: '800', r: '6, 32' } }, next: '넓히기', priority: 'high', steps: [{ text: '첫 단계', checks: [] }, { text: '둘째', uses: '공리 A1', checks: [] }] })
    expect(n.evidence[0].section).toBe('결과')
    const r = await send('PATCH', '/c', { baseHash: n.hash, set: { run: { code: 'code/b.py', commit: 'abc1234', params: { L: '400', ' ': 'x' } }, steps: [{ text: '하나', uses: '정의' }], reason: ' 멈춘 까닭 ', priority: null } })
    expect(r.statusCode).toBe(200)
    expect(r.json().node).toMatchObject({ run: { code: 'code/b.py', commit: 'abc1234', params: { L: '400' } }, steps: [{ text: '하나', uses: '정의' }], reason: '멈춘 까닭' })
    expect(r.json().node.priority).toBeUndefined()
  })

  it('근거의 절: Markdown · TeX 제목을 이름으로 찾고, \\label은 이름에서 뺀다', () => {
    note('workbench/m.md', '# 노트\n\n## 진행 \\label{sec: progress}\n\n표\n\n### 작은 절\n\n## 남은 문제\n')
    note('workbench/t.tex', '\\section{Setup}\nA\n\\section*{Result}\nB\n')
    const a = evidenceHash(repo, 'workbench/m.md', '진행')
    expect(a).not.toMatch(/missing|no-section/)
    note('workbench/m.md', '# 노트\n\n## 진행 \\label{sec: progress}\n\n표\n\n### 작은 절\n\n## 남은 문제\n\n고침\n')
    expect(evidenceHash(repo, 'workbench/m.md', '진행')).toBe(a)
    expect(evidenceHash(repo, 'workbench/t.tex', 'result')).not.toMatch(/missing|no-section/)
    expect(evidenceHash(repo, 'workbench/t.tex', '없는 절')).toBe('no-section')
    expect(evidenceHash(repo, 'workbench/없음.md')).toBe('missing')
  })

  it('해결 문턱: gate를 켜고 끝내면 빈 필수 칸을 이름으로 거절하고, 다 채우면 받는다', async () => {
    note('workbench/n.md', '# 노트\n\n## 결과\n\n표\n\n## 다음\n')
    put('c', 'format: 1\nkind: calc\nprogress: active\nshort: 계산\ntitle: 계산 하나\nfields:\n  goal: 잰다')
    let n = (await get()).nodes[0]
    const bad = await send('PATCH', '/c', { baseHash: n.hash, gate: true, set: { progress: 'done' } })
    expect(bad.statusCode).toBe(422)
    expect(bad.json().error).toContain('판정 기준 · 설정 · 결과 · 근거 · 실행의 코드')
    // gate가 없으면 (옛 화면) 그대로 저장된다
    expect((await send('PATCH', '/c', { baseHash: n.hash, set: { kind: 'calc' } })).statusCode).toBe(200)
    n = (await get()).nodes[0]
    const ok = await send('PATCH', '/c', { baseHash: n.hash, gate: true, set: { progress: 'done', fields: { goal: '잰다', criterion: '2 % 안', setup: '평면', result: '1 %' }, run: { code: 'code/a.py' }, evidence: [{ kind: 'calc', file: 'workbench/n.md', section: '결과', text: '표' }] } })
    expect(ok.statusCode).toBe(200)
    // 반증 · 멈춤은 이유만 본다
    const m = ok.json().node
    expect((await send('PATCH', '/c', { baseHash: m.hash, gate: true, set: { progress: 'paused' } })).json().error).toContain('이유')
    expect((await send('PATCH', '/c', { baseHash: m.hash, gate: true, set: { progress: 'paused', reason: '기다림' } })).statusCode).toBe(200)
  })

  it('빈틈: 근거 없는 해결 · 검토 안 된 발견 위에 쌓음 · 이유 없는 반증 · 다음이 없는 끝 · 없는 파일 · 확인 안 된 단계', async () => {
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 발견\ntitle: 발견\ndate: 2026-10-01\nevidence:\n  - { kind: calc, file: workbench/없음.md, text: 표 }')
    put('c', 'format: 1\nkind: calc\nprogress: done\nresult: refuted\nshort: 계산\ntitle: 계산\ndate: 2026-10-02\nfrom: [{ id: f, type: use }]\nfields: { result: 아님 }\nend: true')
    put('p', 'format: 1\nkind: proof\nprogress: active\nshort: 증명\ntitle: 증명\ndate: 2026-10-03\nfrom: [{ id: f, type: support }]\nsteps: [{ text: 가, uses: 정의 }, 나]')
    const by = Object.fromEntries((await get()).nodes.map((n: { id: string; gaps: { code: string }[] }) => [n.id, n.gaps.map((g) => g.code)]))
    expect(by).toEqual({ f: ['missing-file'], c: ['unverified-base', 'no-reason'], p: ['unverified-base', 'step-gap'] })
  })

  it('확인한 뒤 근거 절이 바뀌면 확인이 낡고, 정리도 풀린다', async () => {
    note('workbench/n.md', '# 노트\n\n## 증명\n\n가\n\n## 다른 절\n\n나\n')
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 발견\ntitle: 발견\nend: true\nevidence:\n  - { kind: proof, file: workbench/n.md, section: 증명, text: 증명 }')
    let n = (await get()).nodes[0]
    n = (await send('POST', '/f/check', { baseHash: n.hash, ev: 0 })).json().node
    expect(n.theorem).toBe(true)
    expect(n.evidence[0].checks[0].hash).toMatch(/^[0-9a-f]{16}$/)
    note('workbench/n.md', '# 노트\n\n## 증명\n\n가\n\n## 다른 절\n\n나 고침\n')
    expect((await get()).nodes[0].theorem).toBe(true) // 다른 절이 바뀐 것은 상관없다
    note('workbench/n.md', '# 노트\n\n## 증명\n\n가 고침\n\n## 다른 절\n\n나 고침\n')
    n = (await get()).nodes[0]
    expect(n.theorem).toBe(false)
    expect(n.evidence[0].stale).toBe(true)
    expect(n.gaps.map((g: { code: string }) => g.code)).toEqual(['changed-evidence'])
  })

  it('발견의 확인은 진술 · 조건에도 묶인다: 확인한 뒤 진술을 넓히면 낡고, 정리도 풀린다 (10/23)', async () => {
    note('workbench/n.md', '# 노트\n\n## 증명\n\n가\n')
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 발견\ntitle: 발견\nend: true\nfields:\n  statement: 원판에서 J = 1/2\n  condition: 갭이 있을 때\nevidence:\n  - { kind: proof, file: workbench/n.md, section: 증명, text: 증명 }\n  - { kind: paper, ref: zeng2025, text: 같은 값 }')
    let n = (await get()).nodes[0]
    n = (await send('POST', '/f/check', { baseHash: n.hash, ev: 0 })).json().node
    n = (await send('POST', '/f/review', { baseHash: n.hash, by: 'claude', ev: 1 })).json().node
    expect(n.evidence[0].checks[0].claim).toMatch(/^[0-9a-f]{16}$/)
    expect(n.evidence[1].checks[0]).toMatchObject({ role: 'agent', claim: n.evidence[0].checks[0].claim })
    expect(n.theorem).toBe(true)
    n = (await send('PATCH', '/f', { baseHash: n.hash, set: { fields: { statement: '모든 영역에서 J = 1/2', condition: '갭이 있을 때' } } })).json().node
    expect(n.theorem).toBe(false)
    expect(n.evidence.map((e: { stale?: boolean }) => e.stale)).toEqual([true, true])
    expect(n.gaps.map((g: { text: string }) => g.text)).toEqual(['확인한 뒤 진술 · 조건이 바뀌었다'])
    // 되돌리면 확인이 다시 산다. claim이 없는 옛 기록은 진술을 보지 않는다
    n = (await send('PATCH', '/f', { baseHash: n.hash, set: { fields: { statement: '원판에서 J = 1/2', condition: '갭이 있을 때' } } })).json().node
    expect(n.theorem).toBe(true)
    put('g', 'format: 1\nkind: finding\nprogress: active\ntitle: 옛 확인\nfields: { statement: 바뀐 진술 }\nevidence:\n  - { kind: paper, ref: a, text: 근거, checks: [ { at: 2026-10-01T10:00, by: x, role: agent } ] }')
    expect((await get()).nodes.find((m: { id: string }) => m.id === 'g').evidence[0].stale).toBeUndefined()
  })

  it('판단 (10/23): 명제는 승인 · 수정 · 기각, 카드는 시작 · 수정 · 종료. 판단한 내용이 바뀌면 낡는다', async () => {
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 계단\ntitle: 계단 줄어듦\nfields:\n  statement: 계단이 줄어든다\n  condition: κ → 0')
    put('q', 'format: 1\nkind: question\nprogress: open\nshort: 꼭짓점\ntitle: 꼭짓점 Δn\nfields:\n  question: 세 각도만의 함수인가\n  criterion: 0.01 안\n  value: 둘째 보편량\n  budget: 하루\ncard:\n  givens: [f]\n  terms:\n    - { word: Δn, def: n의 변화, ref: workbench/n.md#질문 }\n    - κ′\n  tools: [code/a.py]\n  assignee: claude-code\n  findings: 2')
    put('p', 'format: 1\nkind: question\nprogress: open\ntitle: 카드 아님')
    let { nodes } = await get()
    let f = nodes.find((m: { id: string }) => m.id === 'f'), q = nodes.find((m: { id: string }) => m.id === 'q')
    expect(f.judgments).toEqual([])
    expect(f.verdict).toBeUndefined()
    expect(q.card).toEqual({ givens: ['f'], terms: [{ word: 'Δn', def: 'n의 변화', ref: 'workbench/n.md#질문' }, { word: 'κ′' }], tools: ['code/a.py'], assignee: 'claude-code', findings: 2 })
    // 종류에 맞지 않는 말 · 카드가 아닌 질문은 거절
    expect((await send('POST', '/f/judge', { baseHash: f.hash, verdict: 'start' })).statusCode).toBe(400)
    expect((await send('POST', '/p/judge', { baseHash: nodes.find((m: { id: string }) => m.id === 'p').hash, verdict: 'start' })).statusCode).toBe(400)
    expect((await send('POST', '/f/judge', { baseHash: 'old', verdict: 'approve' })).statusCode).toBe(409)
    f = (await send('POST', '/f/judge', { baseHash: f.hash, verdict: 'send-back', note: '명제를 알 수 없음' })).json().node
    f = (await send('POST', '/f/judge', { baseHash: f.hash, verdict: 'approve' })).json().node
    expect(f.verdict).toBe('approve')
    expect(f.judgments).toHaveLength(2)
    expect(f.judgments[0]).toMatchObject({ by: 'user', verdict: 'send-back', note: '명제를 알 수 없음' })
    expect(f.judgments[1].claim).toMatch(/^[0-9a-f]{16}$/)
    expect(fs.readFileSync(path.join(dir(), 'f.yaml'), 'utf8')).toMatch(/\njudgments:\n {2}- \{ at: [^\n]*send-back[^\n]*\}\n {2}- \{ at: [^\n]*verdict: approve, claim: \w+ \}\n$/)
    // 진술을 바꾸면 판단이 낡아 판단 전으로
    f = (await send('PATCH', '/f', { baseHash: f.hash, set: { fields: { statement: '계단이 사라진다', condition: 'κ → 0' } } })).json().node
    expect(f.verdict).toBeUndefined()
    expect(f.judgments.map((j: { stale?: boolean }) => !!j.stale)).toEqual([true, true])
    // 판단 전 사전 연구로는 카드를 시작하지 않는다
    const refused = await send('POST', '/q/judge', { baseHash: q.hash, verdict: 'start' })
    expect([refused.statusCode, refused.json().error]).toEqual([400, expect.stringContaining('사전 연구가 아직 승인되지 않았습니다: f')])
    f = (await send('POST', '/f/judge', { baseHash: f.hash, verdict: 'approve' })).json().node
    // 카드: 문제 · 완료 칸이 바뀌면 낡고, 가치 · 자원은 판단을 낡게 하지 않는다
    q = (await send('POST', '/q/judge', { baseHash: q.hash, verdict: 'start' })).json().node
    expect(q.verdict).toBe('start')
    q = (await send('PATCH', '/q', { baseHash: q.hash, set: { fields: { question: '세 각도만의 함수인가', criterion: '0.01 안', value: '둘째 보편량', budget: '이틀' } } })).json().node
    expect(q.verdict).toBe('start')
    q = (await send('PATCH', '/q', { baseHash: q.hash, set: { fields: { question: '세 각도만의 함수인가', criterion: '0.01 안', criterion_no: '0.03 넘음', value: '둘째 보편량', budget: '이틀' } } })).json().node
    expect(q.verdict).toBeUndefined()
    expect(q.card.givens).toEqual(['f'])
  })

  it('판단 · 카드의 틀린 곳은 진단으로 알린다', async () => {
    put('a', 'format: 1\nkind: calc\nprogress: active\ntitle: 계산\ncard: { givens: [x] }\njudgments:\n  - { at: 2026-10-23T10:00, by: user, verdict: approve }\n  - { at: 2026-10-23T10:00, verdict: approve }')
    const { nodes, diagnostics } = await get()
    expect(nodes[0].card).toBeUndefined()
    expect(nodes[0].judgments).toEqual([])
    expect(diagnostics.map((d: { code: string }) => d.code).sort()).toEqual(['card', 'judgments', 'judgments'])
  })

  it('판단 대기열 (10/23): 에이전트는 상한 3이 차면 새 명제를, 시작하지 않은 카드 아래에서는 일을 열지 못한다', async () => {
    const finding = (id: string, more = '') => put(id, `format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: ${id}\nfields: { statement: ${id} }\n${more}`)
    finding('a', 'date: 2026-10-23\nby: codex')
    finding('b', 'date: 2026-10-24\nby: claude-code')
    finding('old', 'date: 2026-10-01\nby: claude-code')
    finding('mine', 'date: 2026-10-24\nby: user')
    put('q', 'format: 1\nkind: question\nprogress: open\nshort: 카드\nfields: { question: 왜?, criterion: 맞으면 }\ncard: { givens: [old] }')
    const add = (body: object) => send('POST', '', { short: '새 점', ...body })
    // 대기: 설계 뒤 에이전트가 낸 a · b와 카드가 고른 옛 명제 old. 사용자가 낸 명제와 고르지 않은 옛 명제는 빠진다
    let r = await add({ kind: 'finding', by: 'claude-code' })
    expect([r.statusCode, r.json().error]).toEqual([400, expect.stringContaining('3/3')])
    expect((await add({ kind: 'finding' })).statusCode).toBe(200)
    // 카드 아래 일: 사전 연구가 판단 전이면 막고, 승인 뒤에도 사용자가 시작하기 전에는 막는다
    r = await add({ kind: 'calc', by: 'codex', from: [{ id: 'q', type: 'origin' }] })
    expect([r.statusCode, r.json().error]).toEqual([400, expect.stringContaining('사전 연구가 아직 승인되지 않았습니다')])
    const node = async (id: string) => (await get()).nodes.find((m: { id: string }) => m.id === id)
    await send('POST', '/old/judge', { baseHash: (await node('old')).hash, verdict: 'approve' })
    r = await add({ kind: 'calc', by: 'codex', from: [{ id: 'q', type: 'origin' }] })
    expect(r.json().error).toContain('사용자가 아직 시작하지 않았습니다')
    await send('POST', '/q/judge', { baseHash: (await node('q')).hash, verdict: 'start' })
    expect((await add({ kind: 'calc', by: 'codex', from: [{ id: 'q', type: 'origin' }] })).statusCode).toBe(200)
    // 대기열이 줄면 (old 승인) 새 명제를 낸다
    expect((await add({ kind: 'finding', by: 'claude-code' })).statusCode).toBe(200)
  })

  it('카드 고치기 (10/23 화면 › 점 고치기 › 카드): 질문 점에만, 사전 연구는 명제만, 종류를 바꾸거나 null이면 뺀다', async () => {
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 명제\nfields: { statement: 참 }')
    put('c', 'format: 1\nkind: calc\nprogress: active\nshort: 계산')
    put('q', 'format: 1\nkind: question\nprogress: open\nshort: 물음\nfields: { question: 왜? }')
    const node = async (id: string) => (await get()).nodes.find((m: { id: string }) => m.id === id)
    const card = { givens: ['f'], terms: [{ word: ' Δn ', def: 'n의 변화' }, { word: 'κ′' }, { word: ' ' }], tools: [' code/a.py ', ''], assignee: 'codex', findings: 2 }
    let r = await send('PATCH', '/q', { baseHash: (await node('q')).hash, set: { card, fields: { question: '왜?', value: '예이면 다음 카드' } } })
    expect([r.statusCode, r.json().error]).toEqual([200, undefined])
    expect(r.json().node.card).toEqual({ givens: ['f'], terms: [{ word: 'Δn', def: 'n의 변화' }, { word: 'κ′' }], tools: ['code/a.py'], assignee: 'codex', findings: 2 })
    expect(fs.readFileSync(path.join(dir(), 'q.yaml'), 'utf8')).toContain('    - κ′\n')
    expect((await send('PATCH', '/q', { baseHash: r.json().node.hash, set: { card: { ...card, givens: ['c'] } } })).json().error).toContain('명제가 아닙니다')
    expect((await send('PATCH', '/c', { baseHash: (await node('c')).hash, set: { card } })).statusCode).toBe(400)
    r = await send('PATCH', '/q', { baseHash: (await node('q')).hash, set: { kind: 'calc' } })
    expect(r.json().node.card).toBeUndefined()
    put('q2', 'format: 1\nkind: question\nprogress: open\nshort: 물음\ncard: { givens: [gone] }')
    r = await send('PATCH', '/q2', { baseHash: (await node('q2')).hash, set: { card: { givens: ['gone', 'f'], terms: [], tools: [] } } })
    expect(r.json().node.card).toEqual({ givens: ['gone', 'f'], terms: [], tools: [] })
    r = await send('PATCH', '/q2', { baseHash: r.json().node.hash, set: { card: null } })
    expect(r.json().node.card).toBeUndefined()
  })

  it('짚은 곳 (10/23): 점의 칸에 단 질문은 칸이 바뀌면 changed, 인용이 사라지면 잃음, 판단이 끝나면 닫힌다', async () => {
    fs.rmSync(path.join(repo, 'workbench', 'comments', 'flow-f.md'), { force: true })
    put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 계단\nfields:\n  statement: 계단이 줄고 r = 16과 20이 같다\n  condition: κ → 0')
    const rec = (payload: object) => app.inject({ method: 'POST', url: `${R}/comments/flow-f`, payload: { kind: '질문', title: '흐름 계단', ...payload } })
    const records = async () => (await app.inject({ method: 'GET', url: `${R}/comments/flow-f` })).json().comments
    expect((await rec({ text: '?', field: 'nothing' })).statusCode).toBe(400)
    expect((await rec({ text: '?', field: 'statement', quote: '없는 글' })).statusCode).toBe(400)
    expect((await rec({ text: '계단이 무엇인가요?', field: 'statement', quote: '계단' })).statusCode).toBe(200)
    expect((await rec({ text: 'r = 24는?', field: 'statement', quote: 'r = 16과 20' })).statusCode).toBe(200)
    expect((await rec({ text: '조건은 충분한가요?', field: 'condition' })).statusCode).toBe(200)
    let [a, b, c] = await records()
    expect([a.field, a.fieldHash]).toEqual(['statement', expect.stringMatching(/^[0-9a-f]{16}$/)])
    expect([a.changed, b.lost, c.changed]).toEqual([undefined, undefined, undefined])
    let f = (await get()).nodes[0]
    f = (await send('PATCH', '/f', { baseHash: f.hash, set: { fields: { statement: '계단이 줄고 r = 16, 20, 24가 같다', condition: 'κ → 0' } } })).json().node
    ;[a, b, c] = await records()
    expect([a.changed, a.lost, b.changed, b.lost, c.changed]).toEqual([true, undefined, true, true, undefined])
    // 승인하면 열린 질문이 닫히고 대화는 남는다
    await send('POST', '/f/judge', { baseHash: f.hash, verdict: 'approve' })
    ;[a, b, c] = await records()
    expect([a.state, b.state, c.state]).toEqual(['끝냄', '끝냄', '끝냄'])
    expect(a.answers.at(-1)).toMatchObject({ by: '앱', body: '판단 뒤 닫음 (승인)' })
  })

  it('에이전트 검토는 단계에도 role agent로, 사람 승인은 단계에도 된다', async () => {
    put('p', 'format: 1\nkind: proof\nprogress: active\nshort: 증명\ntitle: 증명\nsteps: [{ text: 가, uses: 정의 }]')
    let n = (await get()).nodes[0]
    expect(n.gaps.map((g: { code: string }) => g.code)).toEqual(['step-gap'])
    n = (await send('POST', '/p/review', { baseHash: n.hash, by: 'claude-code', step: 0, note: '정의대로' })).json().node
    expect(n.steps[0].checks[0]).toMatchObject({ by: 'claude-code', role: 'agent', note: '정의대로' })
    expect(n.gaps).toEqual([])
    n = (await send('POST', '/p/check', { baseHash: n.hash, step: 0 })).json().node
    expect(n.steps[0].checks[1]).toMatchObject({ role: 'human' })
    expect((await send('POST', '/p/check', { baseHash: n.hash, step: 0, ev: 0 })).statusCode).toBe(400)
    // 단계 글을 고치면 그 확인은 낡는다
    n = (await send('PATCH', '/p', { baseHash: n.hash, set: { steps: [{ text: '가 고침', uses: '정의' }] } })).json().node
    expect(n.steps[0].stale).toBe(true)
  })

  it('지난 시도 찾기: 매개변수 · 이유까지 보고, 많이 걸린 것부터', async () => {
    put('a', 'format: 1\nkind: calc\nprogress: done\nresult: refuted\nshort: Flake\ntitle: flake 계산\ndate: 2026-10-01\nrun: { params: { geometry: flake, r: "30" } }\nreason: flake 모양 효과')
    put('b', 'format: 1\nkind: calc\nprogress: done\nresult: solved\nshort: Plane\ntitle: plane 계산\ndate: 2026-10-02\nrun: { params: { geometry: plane } }')
    const rows = (await send('GET', '/search?q=flake%20geometry')).json().rows
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ state: 'refuted', reason: 'flake 모양 효과', params: { geometry: 'flake', r: '30' }, score: 2 })
    expect((await send('GET', '/search?q=x')).json().rows).toEqual([])
    expect((await send('GET', '/a')).json().node.id).toBe('a')
  })

  it('근거 고르기: 노트마다 절 목록과 첫 글 (근거의 절과 같은 규칙)', async () => {
    const dirN = path.join(repo, 'workbench', 'notes', 'sec-test')
    fs.mkdirSync(dirN, { recursive: true })
    fs.writeFileSync(path.join(dirN, 'note.yaml'), 'name: 절 시험\n')
    fs.writeFileSync(path.join(dirN, 'note.md'), '# 절 시험\n\n## Summary\n\n- **H1** holds.\n\n## Results\n\n![fig](a.png)\n\n### H1: 성립 \\label{x}\n\n표 하나.\n')
    const r = await app.inject({ method: 'GET', url: `${R}/flow/sections` })
    expect(r.statusCode).toBe(200)
    const one = r.json().notes.find((n: { file: string }) => n.file === 'workbench/notes/sec-test/note.md')
    expect(one.sections).toEqual([
      { name: 'Summary', level: 2, preview: 'H1 holds.' },
      { name: 'Results', level: 2, preview: '' },
      { name: 'H1: 성립', level: 3, preview: '표 하나.' },
    ])
    fs.rmSync(dirN, { recursive: true, force: true })
  })

  it('지난 시도 찾기: 이어진 맡긴 일의 결론까지 찾고 줄에 싣는다 (flow 칸 · 점의 task · 글의 점 이름)', async () => {
    put('q', 'format: 1\nkind: question\nprogress: open\nshort: Beyond\ntitle: 정수 아닌 지수\ndate: 2026-10-08')
    put('c', 'format: 1\nkind: calc\nprogress: active\nshort: Branch\ntitle: 분기점\ndate: 2026-10-22\ntask: 2026-10-21-made')
    const tasks = path.join(repo, 'workbench', 'tasks')
    fs.mkdirSync(tasks, { recursive: true })
    const task = (id: string, extra: string) => fs.writeFileSync(path.join(tasks, `${id}.md`), `---\ntitle: ${id}\nagent: claude-code\ncreated: 2026-10-15 09:45\n${extra}\n---\n\n## 1. 요약과 결론\n`)
    task('2026-10-15-text', "state: result\ntask: 흐름 점 q의 첫 갈래. noninteger 잔차\nresult-at: 2026-10-20 23:20\nconclusion: 잔차가 같은 빠르기로 줄어든다\noutputs: [code/run.py]")
    task('2026-10-16-field', 'state: working\nflow: q\ntask: 상호작용 상태')
    task('2026-10-21-made', 'state: result\ntask: 계산')
    task('2026-10-17-gone', 'state: stopped\ntask: 흐름 점 q 폐기한 일')
    const rows = (await send('GET', '/search?q=noninteger')).json().rows
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['q'])
    expect(rows[0].tasks).toEqual([
      { id: '2026-10-15-text', title: '2026-10-15-text', state: 'result', link: 'text', resultAt: '2026-10-20 23:20', conclusion: '잔차가 같은 빠르기로 줄어든다', outputs: ['code/run.py'] },
      { id: '2026-10-16-field', title: '2026-10-16-field', state: 'working', link: 'field' },
    ])
    expect((await send('GET', '/search?q=branch')).json().rows[0].tasks).toEqual([{ id: '2026-10-21-made', title: '2026-10-21-made', state: 'result', link: 'dot' }])
    // STATUS 첫 요약의 "흐름 지금": 열린 점 한 줄씩과 이어진 맡긴 일 (흐름 요약은 길어 이름만)
    const summary = statusSummary('# s\n\n' + flowStatusSections(new Workbench(path.join(repo, 'workbench'))).join('\n'), 'how')
    expect(summary).toContain('## 흐름 지금')
    expect(summary).toContain('- ? Beyond · `q` · 미해결 · 기준 없음 · 맡긴 일 `2026-10-15-text` 결과 도착 · 판단 대기 (10/20) · 맡긴 일 `2026-10-16-field` 진행')
    expect(summary).toContain('- π Branch · `c` · 진행 · 기준 없음 · 맡긴 일 `2026-10-21-made` 결과 도착 · 판단 대기')
    fs.rmSync(tasks, { recursive: true, force: true })
  })
})
