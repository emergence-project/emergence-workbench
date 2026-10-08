// 연구노트·보조 노트를 Markdown + KaTeX로 (10/4 결정): 새 노트는 .md, 예전 LaTeX 노트는 그대로
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseBlock } from '@rw/core'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { blockHash, hasLatex, makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const NOTE = '## 목표\n\n$V - E + F = 2$의 증명을 [[Euler characteristic|오일러 지표]]으로 본다 [@ex2022].\n\n## 결과\n\n**Proof.** 자명하다. ∎\n'
// 예전 LaTeX 노트에서 옮긴 것: 식·그림 번호와 참조, 각주, 숨긴 메모
const NUMBERED = '## 식 \\label{sec: eq}\n\n$$\n\\begin{eqnarray}\na &=& b \\label{eq: ab}\n\\end{eqnarray}\n$$\n\n식 \\eqref{eq: ab}와 그림 \\ref{fig: dot}, 절 \\ref{sec: eq}^[각주 [@ex2022].]\n<!-- 숨긴 메모 % & _ -->\n\n![점 하나 \\label{fig: dot}](dot.png)\n\n\\appendix\n\n## 부록\n'

async function setup(name: string) {
  const proj = makeRepo(name)
  const w = (rel: string, text: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
  w('workbench/research.yaml', 'title: Sample\nlatex-template: article\n')
  w('workbench/notes/ground/note.md', NOTE)
  w('workbench/notes/ground/note.yaml', 'name: 바닥 상태\n')
  w('workbench/notes/ground/refs.bib', '@article{ex2022, author = {Example, Ada}, title = {Discharging rules}, journal = {PRL}, year = {2022}}\n')
  w('workbench/notes/ground/dot.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
  w('workbench/notes/old/main.tex', '\\begin{document}\n\\section{Old}\n\\end{document}\n')
  w('workbench/notes/old/note.yaml', 'name: 예전 노트\n')
  w('workbench/blocks/old-block.tex', '% ---\n% id: old-block\n% title: 예전 보조 노트\n% status: in-progress\n% ---\n\\section{x}\n')
  const a = buildApp({ configDir: path.join(tmp, `config-${name}`) })
  const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
  return { a, proj, R: `/api/researches/${id}` }
}

describe('Markdown 연구노트', () => {
  it('note.md는 Markdown 노트로 열리고, 절은 ## 제목, 한 줄 설명은 첫 문단에서', async () => {
    const { a, proj, R } = await setup('md-notes')
    const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { name: string; format?: string; main: string; parts: { title: string; line: number }[]; summary?: string; needsBodyOnly?: boolean }[]
    const md = list.find((m) => m.name === '바닥 상태')!
    const old = list.find((m) => m.name === '예전 노트')!
    expect(md).toMatchObject({ format: 'md', main: 'workbench/notes/ground/note.md', parts: [{ title: '목표', line: 1 }, { title: '결과', line: 5 }] })
    expect(md.summary).toBe('$V - E + F = 2$의 증명을 오일러 지표으로 본다.')
    expect(md.needsBodyOnly).toBeUndefined()
    expect(old.format).toBeUndefined()

    // 읽고 쓰기는 원고 장과 같은 안전장치 (해시가 다르면 쓰지 않는다)
    const part = (await a.inject({ method: 'GET', url: `${R}/manuscript/part?file=${encodeURIComponent(md.main)}` })).json()
    expect(part.content).toBe(NOTE)
    const stale = await a.inject({ method: 'PUT', url: `${R}/manuscript/part`, payload: { file: md.main, content: 'x', baseHash: 'nope' } })
    expect(stale.statusCode).toBe(409)
    const ok = await a.inject({ method: 'PUT', url: `${R}/manuscript/part`, payload: { file: md.main, content: `${NOTE}\n더함\n`, baseHash: part.hash } })
    expect(ok.statusCode).toBe(200)

    // 노트 폴더 안의 그림만 내준다
    const img = await a.inject({ method: 'GET', url: `${R}/manuscript/asset?file=${encodeURIComponent(md.main)}&name=dot.png` })
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/asset?file=${encodeURIComponent(md.main)}&name=../old/main.tex` })).statusCode).toBe(400)
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/asset?file=${encodeURIComponent(md.main)}&name=refs.bib` })).statusCode).toBe(400)
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/asset?file=${encodeURIComponent(md.main)}&name=none.png` })).statusCode).toBe(404)
    // 노트 폴더에 없으면 같은 이름의 그림 라이브러리 그림 (그림 문단 ![캡션](disk.png))
    const figures = path.join(proj, 'workbench/figures')
    fs.mkdirSync(figures, { recursive: true })
    fs.writeFileSync(path.join(figures, 'disk.png'), 'library png')
    const shared = await a.inject({ method: 'GET', url: `${R}/manuscript/asset?file=${encodeURIComponent(md.main)}&name=disk.png` })
    expect(shared.statusCode).toBe(200)
    expect(shared.body).toBe('library png')
    await a.close()
  })

  it('내보내기는 Markdown을 LaTeX 본문으로 바꿔 프로젝트 서식에 넣는다 (노트 파일은 그대로)', async () => {
    const { a, proj, R } = await setup('md-export')
    const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string }[]
    const key = list.find((m) => m.name === '바닥 상태')!.key
    const res = await a.inject({ method: 'GET', url: `${R}/export?ms=${encodeURIComponent(key)}` })
    expect(res.statusCode).toBe(200)
    const dir = path.join(tmp, 'md-export-unzip')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'x.zip'), res.rawPayload)
    execFileSync('unzip', ['-q', 'x.zip'], { cwd: dir })
    const [root] = fs.readdirSync(dir).filter((f) => f !== 'x.zip')
    const main = fs.readFileSync(path.join(dir, root!, 'main.tex'), 'utf8')
    expect(main).toContain('\\section{목표}')
    expect(main).toContain('오일러 지표으로 본다 \\cite{ex2022}.')
    expect(main).toContain('\\begin{proof}\n자명하다.\n\\end{proof}')
    expect(main).toContain('\\@ifpackageloaded{amsthm}')
    // 노트 폴더의 .bib로 참고문헌 목록 (article 서식은 bib 꼴도 정한다)
    expect(main).toContain('\\bibliographystyle{unsrt}\n\\bibliography{refs}\n\\end{document}')
    expect(fs.existsSync(path.join(dir, root!, 'refs.bib'))).toBe(true)
    expect(fs.existsSync(path.join(dir, root!, 'note.md'))).toBe(false)
    expect(fs.readFileSync(path.join(proj, 'workbench/notes/ground/note.md'), 'utf8')).toBe(NOTE)
    await a.close()
  })
})

describe('Markdown 보조 노트', () => {
  it('새 보조 노트는 blocks/<id>.md, 예전 .tex도 목록에 있고, 머리말을 고쳐도 본문 바이트는 그대로', async () => {
    const { a, proj, R } = await setup('md-blocks')
    const made = (await a.inject({ method: 'POST', url: `${R}/blocks`, payload: { title: 'Lemma: 경계 항' } })).json()
    expect(made.format).toBe('md')
    const file = path.join(proj, 'workbench/blocks', `${made.id}.md`)
    expect(fs.existsSync(file)).toBe(true)
    expect(parseBlock(fs.readFileSync(file, 'utf8')).meta).toMatchObject({ id: made.id, title: 'Lemma: 경계 항', status: 'in-progress' })

    // 본문을 쓰고 상태를 바꾼다
    const body = '\n$$\n\\sum_i x_i\n$$\n'
    const head = fs.readFileSync(file, 'utf8')
    const r = await a.inject({ method: 'PUT', url: `${R}/blocks/${made.id}`, payload: { content: head.trimEnd() + body, baseHash: made.hash } })
    expect(r.statusCode).toBe(200)
    const before = fs.readFileSync(file, 'utf8')
    const p = await a.inject({ method: 'PATCH', url: `${R}/blocks/${made.id}/meta`, payload: { baseHash: await blockHash(made.id, a, R), patch: { status: 'blocked', 'blocked-reason': '반례: n=3', 'resume-condition': '부록 B' } } })
    expect(p.statusCode).toBe(200)
    const after = fs.readFileSync(file, 'utf8')
    expect(after.slice(parseBlock(after).bodyStart)).toBe(before.slice(parseBlock(before).bodyStart))
    expect(after).toContain('blocked-reason: "반례: n=3"')

    const summary = (await a.inject({ method: 'GET', url: R })).json() as { blocks: { id: string }[] }
    expect(summary.blocks.map((b) => b.id)).toEqual(expect.arrayContaining([made.id, 'old-block']))
    const old = (await a.inject({ method: 'GET', url: `${R}/blocks/old-block` })).json()
    expect(old.format).toBe('tex')
    await a.close()
  })
})

describe.skipIf(!hasLatex)('Markdown 노트 컴파일', () => {
  it('연구노트와 보조 노트를 LaTeX로 바꿔 PDF를 만든다', async () => {
    const { a, proj, R } = await setup('md-compile')
    fs.writeFileSync(path.join(proj, 'workbench/notes/ground/note.md'), NOTE + NUMBERED)
    const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string }[]
    const key = list.find((m) => m.name === '바닥 상태')!.key
    const r = (await a.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${encodeURIComponent(key)}` })).json()
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/pdf?ms=${encodeURIComponent(key)}` })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(proj, 'workbench/notes/ground/note.md'), 'utf8')).toBe(NOTE + NUMBERED)
    // 목차: 제목 끝의 \label은 이름에서 빼고, \appendix 뒤는 부록
    const parts = ((await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; parts: { title: string; appendix: boolean }[] }[]).find((m) => m.key === key)!.parts
    expect(parts.map((p) => [p.title, p.appendix])).toEqual([['목표', false], ['결과', false], ['식', false], ['부록', true]])
    // 참조가 모두 풀리고 참고문헌이 들어간다
    const log = fs.readFileSync(path.join(proj, 'workbench/.build', fs.readdirSync(path.join(proj, 'workbench/.build')).find((d) => d.startsWith('manuscript'))!, 'note.log'), 'utf8')
    expect(log).not.toMatch(/undefined (references|citations)|Reference .* undefined|Citation .* undefined/)

    const made = (await a.inject({ method: 'POST', url: `${R}/blocks`, payload: { title: '경계 항' } })).json()
    await a.inject({ method: 'PUT', url: `${R}/blocks/${made.id}`, payload: { content: `${made.content}\n## 계산\n\n$$\n\\sum_i x_i = 1\n$$\n\n**Proof.** 끝. ∎\n`, baseHash: made.hash } })
    const b = (await a.inject({ method: 'POST', url: `${R}/blocks/${made.id}/compile` })).json()
    expect(b.problems).toEqual([])
    expect(b.ok).toBe(true)
    await a.close()
  }, 120_000)
})
