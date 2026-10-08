import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { buildApp } from './app.js'
import type { AskRunner } from './ask.js'
import { addPaperNote, appendPaperAnswer, deletePaperNote, readPaperComments, updatePaperNote } from './paperComments.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('paper comments, questions and highlights', () => {
  it('keeps a highlight when writing a memo with the same quote, color and page, and restores deleted paint', () => {
    const lib = path.join(tmp, 'pc-memo-color')
    const anchor = { page: 2, rects: [[20, 30, 40, 12]], pageHeight: 800, quote: 'the selected text', color: 'blue' }
    const highlight = addPaperNote(lib, 'paper1', { kind: '하이라이트', ...anchor })
    const memo = addPaperNote(lib, 'paper1', { kind: '메모', ...anchor, text: '다시 볼 부분' })
    const file = readPaperComments(lib, 'paper1')
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0]).toMatchObject({ id: memo.id, kind: '메모', color: 'blue', quote: anchor.quote, page: 2, rects: anchor.rects })
    expect(file.highlights).toHaveLength(1)
    expect(file.highlights[0]).toMatchObject({ id: highlight.id, ...anchor })
    updatePaperNote(lib, 'paper1', highlight.id, { color: 'pink' }, file.hash)
    expect(() => deletePaperNote(lib, 'paper1', highlight.id, file.hash)).toThrow(/바뀌었음/)
    const latest = readPaperComments(lib, 'paper1')
    deletePaperNote(lib, 'paper1', highlight.id, latest.hash)
    expect(readPaperComments(lib, 'paper1').highlights).toEqual([])
    addPaperNote(lib, 'paper1', { kind: '하이라이트', ...latest.highlights[0] })
    const restored = readPaperComments(lib, 'paper1')
    expect(restored.highlights[0]).toMatchObject({ ...anchor, color: 'pink' })
    expect(restored.comments).toEqual(latest.comments)
  })

  it('keeps one Markdown + YAML file per item and serves them in the PDF comment shape', async () => {
    const lib = path.join(tmp, 'pc-lib')
    const pdfs = path.join(tmp, 'pc-pdf')
    fs.mkdirSync(lib, { recursive: true })
    fs.mkdirSync(pdfs, { recursive: true })
    fs.writeFileSync(path.join(lib, 'references.bib'), '@article{exampleDischarging2022, title = {Discharging Rules}, year = {2022}}\n')
    fs.writeFileSync(path.join(pdfs, 'exampleDischarging2022.pdf'), '%PDF-1.4 x')
    const calls: { cwd: string; prompt: string }[] = []
    const ask: AskRunner = async (job) => { calls.push(job); return '식 (3) 때문입니다.' }
    const a = buildApp({ configDir: path.join(tmp, 'config-pc'), ask })
    a.registry.setLibrary(lib)
    a.registry.setPdfFolders([pdfs])
    const U = '/api/papers/exampleDischarging2022/comments'

    // 고른 글에 단 질문: 쪽 3(화면은 1부터), 왼쪽 위 원점 사각형, 쪽 높이 800
    const q = await a.inject({ method: 'POST', url: U, payload: { kind: '질문', page: 3, rects: [[72, 100, 300, 12]], pageHeight: 800, quote: 'the main claim', text: '부호는?', project: 'sample-research' } })
    expect(q.statusCode).toBe(200)
    const qid = q.json().id as string
    const file = path.join(lib, 'comments', 'exampleDischarging2022', `${qid}.md`)
    const raw = fs.readFileSync(file, 'utf8')
    const front = YAML.parse(/^---\n([\s\S]*?)\n---/.exec(raw)![1]!)
    expect(front).toMatchObject({ id: qid, kind: '질문', state: '대기', project: 'sample-research', page: 2, rects: [[72, 688, 372, 700]], pageHeight: 800, quote: { exact: 'the main claim' } })
    expect(raw.trim().endsWith('부호는?')).toBe(true)

    // 논문 전체에 대한 코멘트, 하이라이트
    await a.inject({ method: 'POST', url: U, payload: { kind: '코멘트', text: 'Sec. III과 비교' } })
    const hl = (await a.inject({ method: 'POST', url: U, payload: { kind: '하이라이트', page: 1, rects: [[10, 20, 30, 10]], pageHeight: 800, color: 'green', quote: 'x' } })).json()
    expect((await a.inject({ method: 'POST', url: U, payload: { kind: '하이라이트', page: 1 } })).statusCode).toBe(400)

    const read = (await a.inject({ method: 'GET', url: U })).json()
    expect(read.target).toBe('paper-exampleDischarging2022')
    expect(read.comments.map((c: { kind: string; where: string }) => [c.kind, c.where])).toEqual([['질문', 'p.3'], ['코멘트', '전체']])
    expect(read.comments[0]).toMatchObject({ page: 3, rects: [[72, 100, 300, 12]], quote: 'the main claim', state: '대기', body: '부호는?' })
    expect(read.highlights).toEqual([{ id: hl.id, page: 1, rects: [[10, 20, 30, 10]], pageHeight: 800, color: 'green', quote: 'x' }])
    expect(read.projects).toEqual({ [qid]: 'sample-research' })
    // 목록의 코멘트 수에는 하이라이트를 세지 않는다
    expect((await a.inject({ method: 'GET', url: '/api/papers' })).json().papers[0]).toMatchObject({ comments: 2, waiting: 1 })

    // 색 바꾸기, 해시가 다르면 409와 지금 해시
    const recolor = await a.inject({ method: 'PATCH', url: `${U}/${hl.id}`, payload: { color: 'pink', baseHash: read.hash } })
    expect(recolor.json().highlights[0].color).toBe('pink')
    const stale = await a.inject({ method: 'PATCH', url: `${U}/${qid}`, payload: { state: '끝냄', baseHash: read.hash } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(recolor.json().hash)

    // Claude의 답: PDF가 있는 폴더에서 돌고, 답을 덧붙여 답함으로
    const ans = await a.inject({ method: 'POST', url: `${U}/${qid}/answer` })
    expect(ans.json().comments[0]).toMatchObject({ state: '답함', answers: [{ by: 'claude', body: '식 (3) 때문입니다.' }] })
    expect(calls[0]!.cwd).toBe(pdfs)
    expect(calls[0]!.prompt).toContain('- 파일: exampleDischarging2022.pdf')
    expect(calls[0]!.prompt).toContain('- 고른 글: "the main claim"')

    // 지우기
    const del = await a.inject({ method: 'DELETE', url: `${U}/${hl.id}?baseHash=${ans.json().hash}` })
    expect(del.json().highlights).toEqual([])
    expect((await a.inject({ method: 'DELETE', url: `${U}/c-..%2Fx?baseHash=${del.json().hash}` })).statusCode).toBe(400)
    await a.close()
  })
})

describe('깨진 코멘트 머리말 (10/5 검토)', () => {
  it('머리말을 읽을 수 없으면 답을 덧붙이지 않는다 (kind · page · quote를 잃지 않게)', () => {
    const lib = path.join(tmp, 'pc-broken')
    const dir = path.join(lib, 'comments', 'k1')
    fs.mkdirSync(dir, { recursive: true })
    const id = 'c-20261005-120000-ab12'
    const text = '---\nkind: 질문\npage: 2\nquote: {exact: a: b}\n---\n부호는?\n'
    fs.writeFileSync(path.join(dir, `${id}.md`), text)
    expect(() => appendPaperAnswer(lib, 'k1', id, 'Claude', '답')).toThrow(/머리말/)
    expect(fs.readFileSync(path.join(dir, `${id}.md`), 'utf8')).toBe(text)
  })
})
