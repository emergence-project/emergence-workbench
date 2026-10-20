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
    const all = { short: n.short, title: n.title, date: n.date, kind: n.kind, progress: n.progress, result: null, topics: n.topics, from: n.from, fields: n.fields,
      evidence: n.evidence.map((e: { kind: string; text: string; file?: string }) => ({ kind: e.kind, text: e.text, file: e.file })) }
    expect((await send('PATCH', '/same', { baseHash: n.hash, set: all })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(dir(), 'same.yaml'), 'utf8')).toBe(text)
    const n2 = (await get()).nodes.find((x: { id: string }) => x.id === 'same')
    await send('PATCH', '/same', { baseHash: n2.hash, set: { ...all, short: 'LSWT canon' } })
    expect(fs.readFileSync(path.join(dir(), 'same.yaml'), 'utf8')).toBe(text.replace('short: Theory + toolkit', 'short: LSWT canon'))
    fs.rmSync(path.join(dir(), 'same.yaml'))
  })

  it('목록 들여쓰기는 글 안의 "…:\\n- " 줄이 아니라 실제 목록으로 잰다', async () => {
    const text = "format: 1\nkind: question\nprogress: active\nshort: Block\ntitle: 블록 글\nfields:\n  question: |\n    확인할 것:\n    - 첫째\nevidence:\n  - kind: other\n    file: a.md\n    text: 근거\n"
    fs.writeFileSync(path.join(dir(), 'block.yaml'), text)
    const n = (await get()).nodes.find((x: { id: string }) => x.id === 'block')
    expect((await send('PATCH', '/block', { baseHash: n.hash, set: { short: 'Block 2' } })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(dir(), 'block.yaml'), 'utf8')).toBe(text.replace('short: Block', 'short: Block 2'))
    fs.rmSync(path.join(dir(), 'block.yaml'))
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
    expect(brief).toMatch(/### 그 밖의 열린 점 1\n\n- 2026-10-01 \? 물음 · `flow-q` · 질문 · 멈춤 — 물음 하나\n  - 물음: 되나\?\n  - 뒤따른 점 → `p` \(폐기 · 갈래 끝\) · `f` \(해결\)\n  - 짐작\(사람 확인 안 함\): 에이전트가 쓴 물음/)
    expect(brief).toContain('### 사람 승인 대기 1\n')
    expect(brief).toContain('`flow-f` · 발견 · 해결 — 발견 하나')
    const map = statusPart(status, '흐름 지도')!
    expect(map).toContain('## 흐름 지도 8')
    expect(map).toContain('- ▶ `q` · 질문 · 멈춤 → 흐름 요약')
    expect(map).toContain('- `p` · 증명 · 폐기 · 갈래 끝 — 증명 하나 ← 발단 q')
    expect(statusSummary(status, 'x')).toContain('## 흐름 요약')
  })
})
