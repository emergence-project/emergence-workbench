// 연구노트의 소문제 카드 (research.yaml의 topics:)
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { app, noteHash, R, repo, topicsHash, useSampleApp } from './testkit.js'

useSampleApp()

describe('소문제 카드', () => {
  it('카드를 research.yaml의 topics:에만 쓰고, 다른 칸과 주석은 그대로 둔다', async () => {
    const file = path.join(repo, 'workbench', 'research.yaml')
    const before = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, `# 머리 주석\n${before}`)
    expect((await app.inject({ method: 'GET', url: `${R}/topics` })).json().topics).toEqual([])

    const put = async (topics: unknown) => app.inject({ method: 'PUT', url: `${R}/topics`, payload: { baseHash: await topicsHash(), topics } })
    const r = await put([
      { title: 'Example phase diagram', parts: ['a.tex', 'b.tex', 'a.tex'] },
      { title: 'Example phase diagram', parts: [], blocks: ['note-a', 'note-a'], star: true },
      { id: 'sky', title: 'Skyrmion', parts: ['c.tex'], done: true },
    ])
    expect(r.statusCode).toBe(200)
    expect(r.json().topics).toEqual([
      { id: 'example-phase-diagram', title: 'Example phase diagram', parts: ['a.tex', 'b.tex'], blocks: [], done: false, star: false },
      { id: 'example-phase-diagram-2', title: 'Example phase diagram', parts: [], blocks: ['note-a'], done: false, star: true },
      { id: 'sky', title: 'Skyrmion', parts: ['c.tex'], blocks: [], done: true, star: false },
    ])
    const text = fs.readFileSync(file, 'utf8')
    expect(text.startsWith('# 머리 주석\n')).toBe(true)
    const { topics, ...rest } = YAML.parse(text)
    expect(rest).toEqual(YAML.parse(before))
    expect(topics[1]).toEqual({ id: 'example-phase-diagram-2', title: 'Example phase diagram', star: true, parts: [], blocks: ['note-a'] })
    expect(topics[2]).toEqual({ id: 'sky', title: 'Skyrmion', parts: ['c.tex'], done: true })

    expect((await put([{ title: ' ', parts: [] }])).statusCode).toBe(400)
    expect((await put('x')).statusCode).toBe(400)
    expect((await put([])).json()).toMatchObject({ topics: [] })
    expect(YAML.parse(fs.readFileSync(file, 'utf8')).topics).toBeUndefined()
  })
})

describe('주제 기록 (10/5): 설명 · 미리보기 · ★ · 만들기 · 지우기', () => {
  const file = () => path.join(repo, 'workbench', 'research.yaml')
  it('만들고 고치면 설명(여러 줄)·미리보기를 쓰고, 300·30·80자를 넘으면 거절한다', async () => {
    const made = await app.inject({ method: 'POST', url: `${R}/topics`, payload: { baseHash: await topicsHash(), title: 'Recoloring', description: '  두 색을  맞바꾸기 \n- 정확한 경우\n\n\n- 근사 ' } })
    expect(made.statusCode).toBe(200)
    expect(made.json().topic).toMatchObject({ id: 'recoloring', title: 'Recoloring', description: '두 색을 맞바꾸기\n- 정확한 경우\n\n- 근사' })
    const { hash } = (await app.inject({ method: 'GET', url: `${R}/topics` })).json()
    const patch = async (body: unknown) => app.inject({ method: 'PATCH', url: `${R}/topics/recoloring`, payload: { baseHash: await topicsHash(), ...(body as object) } })
    const r = await patch({ preview: { text: 'CMI $I(A:C|B)$', color: 'violet' }, star: true, baseHash: hash })
    expect(r.statusCode).toBe(200)
    expect(r.json().topic).toMatchObject({ star: true, preview: { text: 'CMI $I(A:C|B)$', color: 'violet' } })
    // 그새 바뀐 해시는 409와 지금 해시
    const stale = await patch({ star: false, baseHash: hash })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(r.json().hash)
    // 제한
    expect((await patch({ description: '가'.repeat(301) })).statusCode).toBe(400)
    expect((await patch({ description: `${'가'.repeat(150)}\n${'나'.repeat(150)}` })).statusCode).toBe(200)
    expect((await patch({ preview: { text: 'x'.repeat(31) } })).statusCode).toBe(400)
    expect((await patch({ preview: { color: 'red' } })).statusCode).toBe(400)
    expect((await patch({ preview: { image: '../secret.png' } })).statusCode).toBe(400)
    expect((await patch({ title: '이'.repeat(80) })).statusCode).toBe(200)
    expect((await patch({ title: '이'.repeat(81) })).statusCode).toBe(400)
    // 파일 모양: 여러 줄 설명은 블록 글, 미리보기는 칸마다
    const y = YAML.parse(fs.readFileSync(file(), 'utf8')).topics.find((t: { id: string }) => t.id === 'recoloring')
    expect(y).toMatchObject({ star: true, preview: { text: 'CMI $I(A:C|B)$', color: 'violet' } })
    expect(y.description.split('\n')).toHaveLength(2)
    // 색을 기본으로, 글을 비우면 미리보기 칸이 없어진다
    const cleared = (await patch({ preview: { text: '', color: 'default' } })).json().topic
    expect(cleared.preview).toBeUndefined()
  })

  it('예전 화면의 통째 저장(PUT)은 사람이 길게 적어 둔 이름을 그대로 두고, 새 칸을 잃지 않는다', async () => {
    const before = fs.readFileSync(file(), 'utf8')
    fs.writeFileSync(file(), `${before.replace(/^topics:[\s\S]*$/m, '')}topics:\n  - id: long\n    title: Isomorphism theorem (Prop 3.9 – Thm 3.10)!!\n    description: 설명\n    preview:\n      text: 식\n    parts: []\n    blocks: [kempe-chains]\n`)
    const now = (await app.inject({ method: 'GET', url: `${R}/topics` })).json().topics
    const put = await app.inject({ method: 'PUT', url: `${R}/topics`, payload: { baseHash: await topicsHash(), topics: now.map((t: object) => ({ ...t, star: true })) } })
    expect(put.statusCode).toBe(200)
    expect(put.json().topics[0]).toMatchObject({ id: 'long', star: true, description: '설명', preview: { text: '식' }, blocks: ['kempe-chains'] })
  })

  it('그림을 올리면 workbench/figures/topics/<id>.<확장자>에 두고 미리보기에 건다. 지우면 노트는 "노트들"로', async () => {
    await app.inject({ method: 'POST', url: `${R}/topics`, payload: { baseHash: await topicsHash(), title: 'Pic' } })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    const up = await app.inject({ method: 'PUT', url: `${R}/topics/pic/image?name=a.PNG`, headers: { 'content-type': 'application/octet-stream' }, payload: png })
    expect(up.statusCode).toBe(200)
    expect(up.json().topic.preview).toEqual({ image: 'workbench/figures/topics/pic.png' })
    expect(fs.readFileSync(path.join(repo, 'workbench/figures/topics/pic.png'))).toEqual(png)
    const got = await app.inject({ method: 'GET', url: `${R}/topics/pic/image` })
    expect(got.statusCode).toBe(200)
    expect(got.headers['content-type']).toContain('image/png')
    expect((await app.inject({ method: 'PUT', url: `${R}/topics/pic/image?name=a.exe`, headers: { 'content-type': 'application/octet-stream' }, payload: png })).statusCode).toBe(400)

    // 노트 머리말에 든 주제를 지우면 머리말에서도 빠진다
    await app.inject({ method: 'PATCH', url: `${R}/notes/head`, payload: { file: 'workbench/blocks/kempe-chains.tex', patch: { topics: ['pic', 'long'] }, baseHash: await noteHash('workbench/blocks/kempe-chains.tex') } })
    const del = await app.inject({ method: 'DELETE', url: `${R}/topics/pic?baseHash=${await topicsHash()}` })
    expect(del.statusCode).toBe(200)
    expect(del.json().notes).toBe(1)
    expect(fs.readFileSync(path.join(repo, 'workbench/blocks/kempe-chains.tex'), 'utf8')).toContain('% topics: [long]\n')
    expect(fs.existsSync(path.join(repo, 'workbench/figures/topics/pic.png'))).toBe(true)
    expect((await app.inject({ method: 'DELETE', url: `${R}/topics/pic?baseHash=${await topicsHash()}` })).statusCode).toBe(404)
  })
})

describe('research.yaml topics: 지키기 (10/5 검토)', () => {
  const file = () => path.join(repo, 'workbench', 'research.yaml')
  const block = (id: string) => path.join(repo, 'workbench', 'blocks', `${id}.tex`)
  const withTopics = (yaml: string) => {
    const base = fs.readFileSync(file(), 'utf8').replace(/^topics:[\s\S]*$/m, '')
    fs.writeFileSync(file(), `${base}${yaml}`)
  }

  it('주제 하나를 고쳐도 앱이 읽지 못하는 항목·모르는 칸·주석·모양은 그대로 둔다', async () => {
    withTopics([
      'topics:',
      '  # 손으로 적은 주제',
      '  - id: Phase_Diagram',
      '    title: 대문자 id',
      '  - id: ok',
      '    title: OK',
      '    custom: 1',
      '    description: |-',
      '      첫 줄',
      '        - 들여 쓴 목록',
      '    parts: []',
      '  - id: other',
      '    title: Other',
      '    preview:',
      '      image: /abs/outside.png',
      '',
    ].join('\n'))
    const before = fs.readFileSync(file(), 'utf8')
    // 읽을 때 받은 hash 없이 고치는 요청은 거절한다 (바깥 수정을 모르고 덮지 않게)
    expect((await app.inject({ method: 'PATCH', url: `${R}/topics/ok`, payload: { star: true } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'DELETE', url: `${R}/topics/other` })).statusCode).toBe(400)
    expect(fs.readFileSync(file(), 'utf8')).toBe(before)
    const r = await app.inject({ method: 'PATCH', url: `${R}/topics/ok`, payload: { baseHash: await topicsHash(), star: true } })
    expect(r.statusCode).toBe(200)
    const text = fs.readFileSync(file(), 'utf8')
    expect(text).toContain('  # 손으로 적은 주제\n  - id: Phase_Diagram\n    title: 대문자 id\n')
    expect(text).toContain('      첫 줄\n        - 들여 쓴 목록\n')
    const topics = YAML.parse(text).topics
    expect(topics.map((t: { id: string }) => t.id)).toEqual(['Phase_Diagram', 'ok', 'other'])
    expect(topics[1]).toMatchObject({ custom: 1, star: true })
    expect(topics[2].preview).toEqual({ image: '/abs/outside.png' })
    // 지우기도 그 주제만 뺀다
    expect((await app.inject({ method: 'DELETE', url: `${R}/topics/other?baseHash=${await topicsHash()}` })).statusCode).toBe(200)
    expect(YAML.parse(fs.readFileSync(file(), 'utf8')).topics.map((t: { id: string }) => t.id)).toEqual(['Phase_Diagram', 'ok'])
  })

  it('주제를 지워도 예전 기록(blocks:)으로 든 다른 주제에서는 빠지지 않는다', async () => {
    withTopics('topics:\n  - id: a\n    title: A\n    parts: []\n  - id: b\n    title: B\n    parts: []\n    blocks: [broken-example]\n')
    const before = fs.readFileSync(block('broken-example'), 'utf8')
    fs.writeFileSync(block('broken-example'), before.replace('% ---\n', '% ---\n% topics: [a]\n'))
    const notes = async () => (await app.inject({ method: 'GET', url: `${R}/notes` })).json().notes as { id: string; topics: string[] }[]
    expect((await notes()).find((n) => n.id === 'broken-example')!.topics).toEqual(['a', 'b'])
    expect((await app.inject({ method: 'DELETE', url: `${R}/topics/a?baseHash=${await topicsHash()}` })).statusCode).toBe(200)
    expect((await notes()).find((n) => n.id === 'broken-example')!.topics).toEqual(['b'])
    fs.writeFileSync(block('broken-example'), before)
  })
})

describe('주제 통째 저장의 충돌 확인 (10/5 검토)', () => {
  it('PUT에 baseHash를 주면 그 뒤 바뀐 research.yaml은 고치지 않는다', async () => {
    const { hash } = (await app.inject({ method: 'GET', url: `${R}/topics` })).json()
    const file = path.join(repo, 'workbench', 'research.yaml')
    fs.appendFileSync(file, '# 에이전트가 고침\n')
    const r = await app.inject({ method: 'PUT', url: `${R}/topics`, payload: { topics: [], baseHash: hash } })
    expect(r.statusCode).toBe(409)
    expect(fs.readFileSync(file, 'utf8').endsWith('# 에이전트가 고침\n')).toBe(true)
  })
})

