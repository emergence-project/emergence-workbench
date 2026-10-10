import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { buildApp } from './app.js'
import type { AskRunner } from './ask.js'
import { readConceptMd, readConceptMemo } from './conceptNotes.js'
import { addLearn, LEARN_FILE, parseDraft, readLearn, removeLearn, setLearnConcept } from './learn.js'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/knowledge')

describe('공부할 것 (모름 → 개념노트 초안)', () => {
  let tmp: string
  let lib: string
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-learn-'))
    lib = path.join(tmp, 'library')
    fs.cpSync(path.join(fixtures, 'library'), lib, { recursive: true })
  })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('파일이 없으면 빈 목록, 더하면 to-learn.yaml에 쌓이고 바깥에서 더한 항목을 지우지 않는다', () => {
    expect(readLearn(lib)).toMatchObject({ items: [], exists: false })
    const at = new Date(2026, 9, 4, 22, 15)
    const a = addLearn(lib, { term: '  Euler   characteristic ', note: '왜 2에서 빼나', from: { project: 'Beta', title: '논문 euler1758', page: 4, quote: 'χ(S)' } }, at).item
    expect(a).toMatchObject({ id: 'l-20261004-2215', term: 'Euler characteristic', at: '2026-10-04 22:15', from: { page: 4 } })
    // 바깥(에이전트)이 같은 파일에 항목을 더해도
    const file = path.join(lib, LEARN_FILE)
    const doc = YAML.parse(fs.readFileSync(file, 'utf8'))
    doc.items.push({ id: 'l-outside', term: 'Kempe swap', at: '2026-10-04 22:16' })
    fs.writeFileSync(file, YAML.stringify(doc))
    const b = addLearn(lib, { term: 'Chromatic gap' }, at).item
    expect(b.id).toBe('l-20261004-2215-2')
    expect(readLearn(lib).items.map((i) => i.term)).toEqual(['Euler characteristic', 'Kempe swap', 'Chromatic gap'])
    removeLearn(lib, 'l-outside')
    expect(readLearn(lib).items.map((i) => i.id)).toEqual([a.id, b.id])
    expect(() => addLearn(lib, { term: '   ' })).toThrow(/비어/)
  })

  it('고칠 때 그 항목만 바꾸고 바깥이 남긴 주석·칸·앱이 못 읽는 항목은 그대로 둔다', () => {
    const file = path.join(lib, LEARN_FILE)
    const before = [
      '# 손으로 남긴 주석',
      'owner: 사람',
      'items:',
      '  - id: l-keep',
      '    term: Kempe swap  # 이 줄 주석',
      '    at: 2026-10-04 22:16',
      '    priority: high',
      '  - term: 아이디 없이 에이전트가 더함',
      '',
    ].join('\n')
    fs.writeFileSync(file, before)
    const a = addLearn(lib, { term: 'Discharging' }, new Date(2026, 9, 10, 3, 0)).item
    setLearnConcept(lib, 'l-keep', 'kempe-chain')
    let text = fs.readFileSync(file, 'utf8')
    for (const kept of ['# 손으로 남긴 주석', 'owner: 사람', '# 이 줄 주석', 'priority: high', '아이디 없이 에이전트가 더함', 'concept: kempe-chain', 'term: Discharging']) expect(text).toContain(kept)
    removeLearn(lib, a.id)
    setLearnConcept(lib, 'l-keep', undefined)
    text = fs.readFileSync(file, 'utf8')
    expect(text).not.toContain('Discharging')
    expect(text).not.toContain('concept:')
    expect(text).toContain('priority: high')
    expect(() => removeLearn(lib, 'l-none')).toThrow(/없음/)
    expect(fs.readFileSync(file, 'utf8')).toBe(text)
    fs.writeFileSync(file, '# 주석만 남은 파일\n')
    addLearn(lib, { term: 'Planar dual' })
    expect(readLearn(lib).items.map((i) => i.term)).toEqual(['Planar dual'])
    fs.writeFileSync(file, '- 맨 위가 목록\n')
    expect(() => addLearn(lib, { term: 'x' })).toThrow(/고치지 않았습니다/)
    expect(fs.readFileSync(file, 'utf8')).toBe('- 맨 위가 목록\n')
    fs.rmSync(file)
  })

  it('Claude 답 읽기: 제목·분류·본문·메모, 이미 있음, 본문 없음', () => {
    expect(parseDraft('TITLE: Chromatic Gap\nSUBJECT: Mathematics › Graph Theory\n---\n## Definition\nThe gap $g$.\n=== MEMO ===\n- check sign'))
      .toEqual({ title: 'Chromatic Gap', subject: 'Mathematics › Graph Theory', body: '## Definition\nThe gap $g$.\n', memo: '- check sign' })
    expect(parseDraft('```markdown\nTITLE: X\nSUBJECT: 없음\n---\n## Definition\nx\n```')).toMatchObject({ title: 'X', subject: undefined })
    expect(parseDraft('EXISTS: planar-graph')).toEqual({ exists: 'planar-graph' })
    expect(() => parseDraft('모르겠습니다')).toThrow(/본문/)
  })

  it('앱에서: 더하기 → 초안 → 개념노트와 옆 메모가 생기고 항목에 이어진다. 이미 있다고 하면 잇기만', async () => {
    const calls: { cwd: string; prompt: string }[] = []
    let reply = 'TITLE: Reducible Configuration\nSUBJECT: Mathematics › Graph Theory\n---\n## Definition\nA subgraph $\\mathcal R$ that no minimal counterexample contains.\n\n## Properties\n\n## Examples\n=== MEMO ===\n- [@lorem1986] is not in the bib yet'
    const ask: AskRunner = async (job) => { calls.push(job); return reply }
    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    const a = buildApp({ configDir: path.join(tmp, 'config'), ask })

    const add = await a.inject({ method: 'POST', url: '/api/learn', payload: { term: 'reducible configuration', from: { project: 'Beta', title: '논문 x', page: 2, quote: 'Kempe reducible' } } })
    expect(add.statusCode).toBe(200)
    const id = add.json().item.id as string
    const res = await a.inject({ method: 'POST', url: `/api/learn/${id}/draft` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ concept: 'reducible-configuration', existed: false, drafting: [] })
    expect((await a.inject({ url: '/api/learn' })).json().items.some((i: { id: string }) => i.id === id)).toBe(true)
    expect(calls[0]!.cwd).toBe(fs.realpathSync(lib))
    expect(calls[0]!.prompt).toContain('- 모르는 말: reducible configuration')
    expect(calls[0]!.prompt).toContain('- 고른 글: "Kempe reducible"')
    const note = readConceptMd(lib, 'reducible-configuration')
    expect(note.meta).toMatchObject({ title: 'Reducible Configuration', subject: 'Mathematics › Graph Theory' })
    expect(note.body).toContain('A subgraph $\\mathcal R$')
    expect(note.checked).toBe('none')
    const memo = readConceptMemo(lib, 'reducible-configuration').text
    expect(memo).toContain('- Beta · 논문 x 2쪽')
    expect(memo).toContain('[@lorem1986] is not in the bib yet')
    expect(readLearn(lib).items.find((i) => i.id === id)!.concept).toBe('reducible-configuration')
    // 두 번은 쓰지 않는다
    expect((await a.inject({ method: 'POST', url: `/api/learn/${id}/draft` })).statusCode).toBe(409)

    reply = 'EXISTS: planar-graph'
    const id2 = (await a.inject({ method: 'POST', url: '/api/learn', payload: { term: 'PG' } })).json().item.id as string
    const r2 = await a.inject({ method: 'POST', url: `/api/learn/${id2}/draft` })
    expect(r2.json()).toMatchObject({ concept: 'planar-graph', existed: true })
    // 잇기를 풀고, 없는 노트에는 잇지 않는다
    expect((await a.inject({ method: 'POST', url: `/api/learn/${id2}/concept`, payload: { concept: '' } })).json().items.find((i: { id: string }) => i.id === id2).concept).toBeUndefined()
    expect((await a.inject({ method: 'POST', url: `/api/learn/${id2}/concept`, payload: { concept: 'nope' } })).statusCode).toBe(404)
    expect((await a.inject({ method: 'DELETE', url: `/api/learn/${id2}` })).json().items.map((i: { id: string }) => i.id)).not.toContain(id2)
    await a.close()
  })
})
