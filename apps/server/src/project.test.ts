// 프로젝트 쪽: 자료, 진술, 정본·STATUS.md, 원고, 라이브러리 노트, 메인 노트
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { fetchArxiv, openWithSystem } from './materials.js'
import { app, hasLatex, makeRepo, R, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('자료 (논문·발표자료)', () => {
  it('시스템 앱으로 여는 것은 문서·그림·글뿐이고, 실행 파일은 열지 않는다', async () => {
    for (const f of ['/x/run.command', '/x/Tool.app', '/x/a.sh', '/x/notebook.nb']) await expect(openWithSystem(f)).rejects.toMatchObject({ status: 415 })
  })

  it('이름이 문서여도 링크의 실제 대상이 실행 파일이면 열지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'open-'))
    fs.writeFileSync(path.join(dir, 'run.command'), '#!/bin/sh\n')
    fs.symlinkSync(path.join(dir, 'run.command'), path.join(dir, 'paper.pdf'))
    await expect(openWithSystem(path.join(dir, 'paper.pdf'))).rejects.toMatchObject({ status: 415 })
  })

  it('arXiv PDF는 파일 이름으로 쓸 수 있는 bib 키에만 받는다 (../x 같은 키로 폴더 밖에 쓰지 않음)', async () => {
    const proj = makeRepo('materials-badkey')
    fs.writeFileSync(path.join(proj, 'refs.bib'), ['@article{../escape,', '  title = {Bad},', '  eprint = {0000.00009},', '}'].join('\n'))
    const fakeFetch = (async () => new Response(Buffer.from('%PDF-1.5 fake'), { status: 200 })) as unknown as typeof fetch
    await expect(fetchArxiv(path.join(proj, 'workbench'), '../escape', fakeFetch)).rejects.toMatchObject({ status: 400 })
    expect(fs.existsSync(path.join(proj, 'escape.pdf'))).toBe(false)
  })

  it('arXiv PDF는 이미 있는 materials/<키>.pdf를 덮지 않는다 (409)', async () => {
    const proj = makeRepo('materials-exists')
    fs.writeFileSync(path.join(proj, 'refs.bib'), ['@article{kept,', '  title = {Kept},', '  eprint = {0000.00008},', '}'].join('\n'))
    const wb = path.join(proj, 'workbench')
    fs.mkdirSync(path.join(wb, 'materials'), { recursive: true })
    fs.writeFileSync(path.join(wb, 'materials', 'kept.pdf'), '%PDF-1.5 annotated')
    let called = false
    const fakeFetch = (async () => { called = true; return new Response(Buffer.from('%PDF-1.5 fresh'), { status: 200 }) }) as unknown as typeof fetch
    await expect(fetchArxiv(wb, 'kept', fakeFetch)).rejects.toMatchObject({ status: 409 })
    expect(called).toBe(false)
    expect(fs.readFileSync(path.join(wb, 'materials', 'kept.pdf'), 'utf8')).toBe('%PDF-1.5 annotated')
  })

  it('refs.bib를 읽고, arXiv PDF를 materials/에 받고, 끌어다 놓은 파일을 두며, 저장소 git에는 넣지 않는다', async () => {
    const proj = makeRepo('materials-project')
    fs.writeFileSync(path.join(proj, 'refs.bib'), [
      '@article{sample2020kempe,', '  title = {Kempe chains {R}evisited},', '  author = {Sample, Bea and Tester, Theo and Example, Ada E.},',
      '  year = 2020,', '  eprint = {0000.00002},', '  journal = "Annals of Example Mathematics"', '}', '',
      '@book{nobook,', '  title = {No arXiv},', '}',
    ].join('\n'))
    const calls: string[] = []
    const fakeFetch = (async (url: string) => {
      calls.push(String(url))
      return new Response(Buffer.from('%PDF-1.5 fake'), { status: 200 })
    }) as unknown as typeof fetch
    const m = buildApp({ configDir: path.join(tmp, 'config-mat'), fetch: fakeFetch })
    const id = (await m.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const M = `/api/researches/${id}/materials`

    const list = (await m.inject({ method: 'GET', url: M })).json()
    expect(list.bib).toEqual([
      expect.objectContaining({ key: 'sample2020kempe', title: 'Kempe chains Revisited', author: 'Sample, Bea and Tester, Theo and Example, Ada E.', year: '2020', eprint: '0000.00002', journal: 'Annals of Example Mathematics', source: 'refs.bib' }),
      expect.objectContaining({ key: 'nobook', title: 'No arXiv' }),
    ])
    expect(list.files).toEqual([])

    expect((await m.inject({ method: 'POST', url: `${M}/fetch/nobook` })).statusCode).toBe(400)
    expect((await m.inject({ method: 'POST', url: `${M}/fetch/sample2020kempe` })).statusCode).toBe(200)
    expect(calls).toEqual(['https://arxiv.org/pdf/0000.00002'])
    const after = (await m.inject({ method: 'GET', url: M })).json()
    expect(after.bib[0].file).toBe('sample2020kempe.pdf')
    expect(after.files).toEqual([expect.objectContaining({ name: 'sample2020kempe.pdf', kind: 'pdf', bibKey: 'sample2020kempe' })])
    const pdf = await m.inject({ method: 'GET', url: `${M}/sample2020kempe.pdf` })
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.body.startsWith('%PDF-')).toBe(true)
    // 받은 파일은 저장소 git에 들어가지 않는다 (materials/ 안의 .gitignore)
    expect(fs.readFileSync(path.join(proj, 'workbench/materials/.gitignore'), 'utf8')).toMatch(/^\*$/m)

    const put = (name: string, body: Buffer) => m.inject({ method: 'PUT', url: `${M}/${encodeURIComponent(name)}`, headers: { 'content-type': 'application/octet-stream' }, payload: body })
    expect((await put('Alpha 공리 발표.pptx', Buffer.from('slides'))).statusCode).toBe(200)
    expect((await put('Alpha 공리 발표.pptx', Buffer.from('again'))).statusCode).toBe(409)
    // 경로가 섞인 이름은 라우터나 서버가 막는다 (400 또는 404)
    expect([400, 404]).toContain((await put('..', Buffer.from('x'))).statusCode)
    expect([400, 404]).toContain((await put('../evil.txt', Buffer.from('x'))).statusCode)
    expect(fs.existsSync(path.join(proj, 'workbench/evil.txt'))).toBe(false)
    expect([400, 404]).toContain((await m.inject({ method: 'GET', url: `${M}/${encodeURIComponent('../refs.bib')}` })).statusCode)
    const files = (await m.inject({ method: 'GET', url: M })).json().files
    expect(files.map((f: { name: string; kind: string }) => [f.name, f.kind]).sort()).toEqual([['Alpha 공리 발표.pptx', 'slides'], ['sample2020kempe.pdf', 'pdf']])
    await m.close()
  })
})

describe('진술 (저장소의 statements/)', () => {
  it('진술 폴더를 그대로 읽어 요약에 넣고, 해시가 맞을 때만 고친다', async () => {
    const proj = makeRepo('statements-project')
    fs.mkdirSync(path.join(proj, 'statements'))
    fs.writeFileSync(path.join(proj, 'statements/preamble.tex'), '% 서식\n')
    fs.writeFileSync(path.join(proj, 'statements/skk-cor-x.tex'), [
      '% ---', '% id: skk-cor-x', '% kind: corollary', '% label: Corollary 3.9.1', '% title: Distance preservation',
      '% uses: [skk-prop-y]', '% proofs: [x-proof]', '% source: sampletesterexample2020kempe', '% page: 16', '% ---', '\\begin{corollary}A\\end{corollary}', '',
    ].join('\n'))
    fs.writeFileSync(path.join(proj, 'statements/y.tex'), '% ---\n% id: skk-prop-y\n% kind: proposition\n% ---\nB\n')
    const s = buildApp({ configDir: path.join(tmp, 'config-st') })
    const id = (await s.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const sum = (await s.inject({ method: 'GET', url: `/api/researches/${id}` })).json()
    expect(sum.statements).toEqual([
      expect.objectContaining({ id: 'skk-cor-x', kind: 'corollary', label: 'Corollary 3.9.1', title: 'Distance preservation', uses: ['skk-prop-y'], proofs: ['x-proof'], source: 'sampletesterexample2020kempe', page: '16', file: 'statements/skk-cor-x.tex' }),
      expect.objectContaining({ id: 'skk-prop-y', kind: 'proposition', uses: [], proofs: [], file: 'statements/y.tex' }),
    ])
    // 파일 이름(y.tex)과 머리말 id(skk-prop-y)가 달라도 id로 찾는다
    const y = (await s.inject({ method: 'GET', url: `/api/researches/${id}/statements/skk-prop-y` })).json()
    expect(y.content).toContain('B')
    const put = (body: object) => s.inject({ method: 'PUT', url: `/api/researches/${id}/statements/skk-prop-y`, payload: body })
    expect((await put({ content: 'X', baseHash: 'stale' })).statusCode).toBe(409)
    expect((await put({ content: y.content.replace('B', 'B2'), baseHash: y.hash })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(proj, 'statements/y.tex'), 'utf8')).toContain('B2')
    expect((await s.inject({ method: 'GET', url: `/api/researches/${id}/statements/..%2Fx` })).statusCode).toBe(400)
    // 진술 폴더가 없는 저장소는 빈 목록
    expect((await app.inject({ method: 'GET', url: R })).json().statements).toEqual([])
    await s.close()
  })
})

describe('프로젝트 정본과 STATUS.md', () => {
  it('research.yaml의 sources로 작업 목록·검토 문서·bib·자료 폴더를 읽고, agent-status일 때만 STATUS.md를 쓴다', async () => {
    const proj = makeRepo('gamma-like')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    w('docs/TASK-QUEUE.md', '# Q\n\n| 순위 | 내용 | 상태 | 파일 |\n|---|---|---|---|\n| 1 | [이론 문서](x.md) 작성 | in-review | `a.md` |\n| 2 | 솔버 | pending | b |\n\n본문\n')
    w('docs/theory/00-a.md', '---\ntitle: Topology\nstatus: draft\n---\n# T\n')
    w('docs/theory/01-b.md', '---\nstatus: accepted\n---\n# Accepted one\n')
    w('docs/theory/sources/skip.md', '---\nstatus: draft\n---\n')
    w('docs/model/references.bib', '@article{k1, title={P}, eprint={1402.6069}}\n')
    w('docs/papers/1402.6069v4.pdf', '%PDF-1.4')
    const research = (extra: string) => w('workbench/research.yaml', `title: Model\nquestion: A·B 상\n${extra}`)
    research(['sources:', '  canon:', '    - docs/model — 모형 원고', '    - ../outside — 무시', '  tasks: docs/TASK-QUEUE.md', '  bib: [docs/model/references.bib]',
      '  materials: [docs/papers, /etc]', '  reviews: [docs/theory]', ''].join('\n'))
    const a = buildApp({ configDir: path.join(tmp, 'config-proj') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const P = `/api/researches/${id}`

    const prj = (await a.inject({ method: 'GET', url: `${P}/project` })).json()
    expect(prj.sources).toEqual({ canon: [{ path: 'docs/model', note: '모형 원고' }], tasks: 'docs/TASK-QUEUE.md', bib: ['docs/model/references.bib'], materials: ['docs/papers'], reviews: ['docs/theory'], manuscripts: [] })
    expect(prj.tasks).toEqual({ file: 'docs/TASK-QUEUE.md', columns: ['순위', '내용', '상태', '파일'], rows: [['1', '[이론 문서](x.md) 작성', 'in-review', '`a.md`'], ['2', '솔버', 'pending', 'b']] })
    expect(prj.reviews).toEqual([
      { file: 'docs/theory/00-a.md', title: 'Topology', status: 'draft' },
      { file: 'docs/theory/01-b.md', title: 'Accepted one', status: 'accepted' },
    ])
    expect(prj.agentStatus).toBe(false)

    // 자료: 다른 위치의 bib와 자료 폴더. 자료 폴더 밖 경로는 거절
    const mats = (await a.inject({ method: 'GET', url: `${P}/materials` })).json()
    expect(mats.bib).toEqual([expect.objectContaining({ key: 'k1', source: 'docs/model/references.bib' })])
    expect(mats.files).toEqual([expect.objectContaining({ name: 'docs/papers/1402.6069v4.pdf', kind: 'pdf' })])
    expect((await a.inject({ method: 'GET', url: `${P}/materials/${encodeURIComponent('docs/papers/1402.6069v4.pdf')}` })).statusCode).toBe(200)
    expect((await a.inject({ method: 'GET', url: `${P}/materials/${encodeURIComponent('docs/model/references.bib')}` })).statusCode).toBe(400)

    // STATUS.md: 미리보기는 늘 되고, 쓰기는 agent-status일 때만
    const md = (await a.inject({ method: 'GET', url: `${P}/agent-status` })).json().markdown as string
    expect(md).toContain('# STATUS — Model')
    expect(md).toContain('`docs/model` — 모형 원고')
    expect(md).toContain('| 1 | 이론 문서 작성 | in-review |') // 파일 열은 빼고 링크는 글자만
    expect(md).toContain('**draft** 1: `docs/theory/00-a.md`')
    expect(md).not.toContain('outside')
    expect((await a.inject({ method: 'POST', url: `${P}/agent-status` })).statusCode).toBe(409)
    expect(fs.existsSync(path.join(proj, 'workbench/STATUS.md'))).toBe(false)
    research('agent-status: true\n')
    const wr = (await a.inject({ method: 'POST', url: `${P}/agent-status` })).json()
    expect(wr.written).toBe(true)
    expect(fs.readFileSync(path.join(proj, 'workbench/STATUS.md'), 'utf8')).toContain('# STATUS — Model')
    expect((await a.inject({ method: 'POST', url: `${P}/agent-status` })).json().written).toBe(false) // 같으면 다시 쓰지 않음
    await a.close()
  })
})

describe('원고 (sources.manuscript)', () => {
  it.skipIf(!hasLatex)('장·부록을 순서대로 읽고, 고치고, 원고 폴더에서 컴파일해 결과는 workbench/.build에만 두며, SyncTeX로 장 파일과 PDF를 잇는다', async () => {
    const proj = makeRepo('manuscript-project')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    w('docs/note/main.tex', ['% !TeX program = pdflatex', '\\documentclass{article}', '\\input{preamble}', '\\begin{document}', '\\input{chapters/01-intro}',
      '% \\input{chapters/99-skip}', '\\input{chapters/02-model.tex}', '\\appendix', '\\input{appendices/a-proof}', '\\end{document}', ''].join('\n'))
    w('docs/note/preamble.tex', '\\usepackage{amsmath}\n')
    w('docs/note/chapters/01-intro.tex', '\\section{Introduction \\label{sec:intro}}\nFirst paragraph of the introduction.\n\nSecond line here.\n')
    w('docs/note/chapters/02-model.tex', '\\section{The \\emph{model}}\nEuler formula $V - E + F = 2$.\n')
    w('docs/note/appendices/a-proof.tex', '\\section{Proof}\nDetails.\n')
    w('workbench/research.yaml', 'title: M\nsources:\n  manuscript: docs/note/main.tex — 연구노트\n')
    w('workbench/blocks/model-gap.tex', '% ---\n% id: model-gap\n% title: 모형의 빈틈\n% status: in-progress\n% ---\n\\section{빈틈}\n% 근거: docs/note/chapters/02-model.tex, a-proof.tex, 없는-장.tex\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-ms') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const M = `/api/researches/${id}/manuscript`

    const info = (await a.inject({ method: 'GET', url: M })).json()
    expect(info).toEqual({
      key: '', main: 'docs/note/main.tex', name: '연구노트', kind: 'paper', hasPdf: false, pdfState: 'missing', ownHeader: true,
      parts: [
        { id: 'docs/note/chapters/01-intro.tex', file: 'docs/note/chapters/01-intro.tex', title: 'Introduction', appendix: false },
        { id: 'docs/note/chapters/02-model.tex', file: 'docs/note/chapters/02-model.tex', title: 'The model', appendix: false },
        { id: 'docs/note/appendices/a-proof.tex', file: 'docs/note/appendices/a-proof.tex', title: 'Proof', appendix: true },
      ],
    })
    // 원고에 속하지 않은 파일은 읽지 않는다
    expect((await a.inject({ method: 'GET', url: `${M}/part?file=${encodeURIComponent('workbench/research.yaml')}` })).statusCode).toBe(400)
    const part = (await a.inject({ method: 'GET', url: `${M}/part?file=${encodeURIComponent('docs/note/chapters/02-model.tex')}` })).json()
    const put = (body: object) => a.inject({ method: 'PUT', url: `${M}/part`, payload: body })
    expect((await put({ file: 'docs/note/chapters/02-model.tex', content: 'x', baseHash: 'old' })).statusCode).toBe(409)
    expect((await put({ file: 'docs/note/chapters/02-model.tex', content: part.content.replace('Euler formula', 'The Euler formula'), baseHash: part.hash })).statusCode).toBe(200)

    const r = (await a.inject({ method: 'POST', url: `${M}/compile` })).json()
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    const build = path.join(proj, 'workbench/.build/manuscript')
    const success = JSON.parse(fs.readFileSync(path.join(build, 'result.json'), 'utf8')).lastSuccess
    const freshnessDiagnostic = JSON.stringify({
      complete: success?.complete, changedDuringCompile: success?.changedDuringCompile,
      inputs: success?.inputs?.map((i: { file: string; hash: string | null }) => ({ file: i.file, missing: i.hash === null })),
      fdbHeader: fs.readFileSync(path.join(build, 'main.fdb_latexmk'), 'utf8').split('\n')[0],
      recorderHead: fs.readFileSync(path.join(build, 'main.fls'), 'utf8').split('\n').slice(0, 8),
    })
    expect(r.pdfState, freshnessDiagnostic).toBe('current')
    expect(fs.existsSync(path.join(proj, 'workbench/.build/manuscript/main.pdf'))).toBe(true)
    expect(fs.existsSync(path.join(proj, 'docs/note/main.pdf'))).toBe(false) // 원고 폴더에 부산물을 남기지 않는다
    expect(fs.readdirSync(path.join(proj, 'docs/note')).sort()).toEqual(['appendices', 'chapters', 'main.tex', 'preamble.tex'])

    const view = (await a.inject({ method: 'GET', url: `${M}/synctex/view?file=${encodeURIComponent('docs/note/chapters/02-model.tex')}&line=2` })).json()
    expect(view.boxes.length).toBeGreaterThan(0)
    const b = view.boxes[0]
    const edit = (await a.inject({ method: 'GET', url: `${M}/synctex/edit?page=${b.page}&x=${b.h + b.width / 2}&y=${b.v - b.height / 2}` })).json()
    expect(edit.spot).toEqual({ file: 'docs/note/chapters/02-model.tex', line: 2 })

    // 유도의 "근거:" 줄이 원고 장으로 이어진다 (경로 전체든 파일 이름만이든)
    const sum = (await a.inject({ method: 'GET', url: `/api/researches/${id}` })).json()
    expect(sum.blocks.find((x: { id: string }) => x.id === 'model-gap').grounds).toEqual(['docs/note/chapters/02-model.tex', 'docs/note/appendices/a-proof.tex'])
    // STATUS.md에 원고 절과 마지막 컴파일, 유도의 원고 장
    const md = (await a.inject({ method: 'GET', url: `/api/researches/${id}/agent-status` })).json().markdown as string
    expect(md).toContain('## 원고 — 연구노트 (`docs/note/main.tex`)')
    expect(md).toContain('- 2장 The model — `docs/note/chapters/02-model.tex`')
    expect(md).toMatch(/마지막 앱 컴파일: .* · 오류 없음/)
    expect(md).toContain('  - 원고: 2장 The model · 부록 A Proof')
    await a.close()
  }, 120_000)
})

describe('라이브러리 노트 (개념·문헌)와 Study', () => {
  it('개념노트를 틀로 만들고 Study 원문을 재료로 붙이며, 문헌노트는 bib에서, 쓰는 곳은 작업노트 concepts와 프로젝트 bib에서 모은다', async () => {
    const lib = path.join(tmp, 'lib-notes')
    fs.mkdirSync(lib)
    const study = path.join(tmp, 'Study')
    fs.mkdirSync(path.join(study, 'Concept-Space/Mathematics/Graphs'), { recursive: true })
    fs.writeFileSync(path.join(study, 'Concept-Space/Mathematics/Graphs/Kempe Recoloring.md'), '---\ntags: [x]\n---\n# Kempe\n$K = G[\\{a,b\\}]$\n')
    fs.mkdirSync(path.join(study, 'Concept-Space/_private'), { recursive: true })
    fs.writeFileSync(path.join(study, 'Concept-Space/_private/skip.md'), 'x')
    fs.writeFileSync(path.join(study, 'README.md'), 'outside')
    const cfgDir = path.join(tmp, 'config-lib')
    fs.mkdirSync(cfgDir)
    fs.writeFileSync(path.join(cfgDir, 'config.yaml'), `library: ${lib}\nstudy: ${study}\n`)
    const a = buildApp({ configDir: cfgDir })
    const proj = makeRepo('lib-user')
    fs.writeFileSync(path.join(proj, 'refs.bib'), '@article{st20, title={Coloring rules}, author={Sample, B. and Tester, T.}, year={2020}, eprint={0000.00002}}\n')
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id

    const st = (await a.inject({ method: 'GET', url: '/api/study' })).json()
    expect(st.notes).toEqual([{ path: 'Concept-Space/Mathematics/Graphs/Kempe Recoloring.md', title: 'Kempe Recoloring', subject: 'Mathematics › Graphs', size: expect.any(Number) }])
    expect((await a.inject({ method: 'GET', url: `/api/study/note?path=${encodeURIComponent('README.md')}` })).statusCode).toBe(400)
    expect((await a.inject({ method: 'GET', url: `/api/study/note?path=${encodeURIComponent(st.notes[0].path)}` })).json()).toMatchObject({ title: 'Kempe Recoloring' })
    // 라이브러리 폴더가 git 저장소가 아니어도 Git 상태 칸은 온다
    expect((await a.inject({ method: 'GET', url: '/api/library/repo' })).json().repo).toMatchObject({ state: expect.any(String) })

    // Study에서 가져온 개념노트: 구조 틀 + 원문은 주석으로
    const c = (await a.inject({ method: 'POST', url: '/api/library/concepts', payload: { study: 'Concept-Space/Mathematics/Graphs/Kempe Recoloring.md', format: 'tex' } })).json()
    expect(c.id).toBe('kempe-recoloring')
    const text = fs.readFileSync(path.join(lib, 'concepts/kempe-recoloring.tex'), 'utf8')
    expect(text).toContain('% status: draft')
    expect(text).toContain('% study: Concept-Space/Mathematics/Graphs/Kempe Recoloring.md')
    expect(text).toContain('\\subsection*{유도 스케치}')
    expect(text).toContain('% $K = G[\\{a,b\\}]$')
    expect(text).not.toContain('tags: [x]') // frontmatter는 뗀다
    expect((await a.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: 'Kempe recoloring', format: 'tex' } })).json().id).toBe('kempe-recoloring-2')

    // 문헌노트: 프로젝트 bib에서
    expect((await a.inject({ method: 'POST', url: '/api/library/papers', payload: { rid: id, key: 'st20' } })).json()).toEqual({ id: 'st20', created: true })
    expect((await a.inject({ method: 'POST', url: '/api/library/papers', payload: { rid: id, key: 'st20' } })).json()).toEqual({ id: 'st20', created: false })

    // 작업노트가 개념에 기댄다 (머리말 concepts) → 쓰는 곳
    const R2 = `/api/researches/${id}`
    const blk = (await a.inject({ method: 'GET', url: `${R2}/blocks/kempe-chains` })).json()
    expect((await a.inject({ method: 'PATCH', url: `${R2}/blocks/kempe-chains/meta`, payload: { patch: { concepts: ['kempe-recoloring'] }, baseHash: blk.hash } })).statusCode).toBe(200)

    const L = (await a.inject({ method: 'GET', url: '/api/library' })).json()
    expect(L.notes.map((n: { kind: string; id: string; status: string; empty: boolean }) => `${n.kind}:${n.id}:${n.status}:${n.empty}`).sort())
      .toEqual(['concept:kempe-recoloring-2:draft:true', 'concept:kempe-recoloring:draft:true', 'paper:st20:draft:true'])
    expect(L.usedBy['concept:kempe-recoloring']).toEqual([expect.objectContaining({ rid: id, note: 'kempe-chains' })])
    expect(L.usedBy['paper:st20']).toEqual([expect.objectContaining({ rid: id })])

    // 보조 노트 없이 프로젝트 전체를 개념에 잇기 (research.yaml의 concepts:), 주석과 다른 칸은 그대로
    const ry = path.join(proj, 'workbench/research.yaml')
    fs.appendFileSync(ry, '# 남길 주석\n')
    const linked = (on: boolean, cid = 'kempe-recoloring-2') => a.inject({ method: 'POST', url: `${R2}/concepts`, payload: { id: cid, on } })
    expect((await linked(true)).json()).toEqual({ concepts: ['kempe-recoloring-2'] })
    expect((await linked(true)).json()).toEqual({ concepts: ['kempe-recoloring-2'] })
    expect(fs.readFileSync(ry, 'utf8')).toContain('# 남길 주석')
    const L2 = (await a.inject({ method: 'GET', url: '/api/library' })).json()
    expect(L2.usedBy['concept:kempe-recoloring-2']).toEqual([{ rid: id, project: expect.any(String) }])
    expect((await a.inject({ method: 'GET', url: '/api/knowledge' })).statusCode).toBe(200)
    expect((await linked(false)).json()).toEqual({ concepts: [] })
    expect(fs.readFileSync(ry, 'utf8')).not.toContain('concepts')
    expect((await linked(true, '../x')).statusCode).toBe(400)

    // 읽기·고치기 (해시 확인), 경로 막기
    const n = (await a.inject({ method: 'GET', url: '/api/library/notes/concept/kempe-recoloring' })).json()
    const put = (body: object) => a.inject({ method: 'PUT', url: '/api/library/notes/concept/kempe-recoloring', payload: body })
    expect((await put({ content: 'x', baseHash: 'old' })).statusCode).toBe(409)
    expect((await put({ content: n.content.replace('\\subsection*{정의}', '\\subsection*{정의}\nFor a planar graph G and colors a, b, the Kempe chain is defined as follows.'), baseHash: n.hash })).statusCode).toBe(200)
    expect((await a.inject({ method: 'GET', url: '/api/library' })).json().notes.find((x: { id: string }) => x.id === 'kempe-recoloring').empty).toBe(false)
    expect((await a.inject({ method: 'GET', url: '/api/library/notes/concept/..%2Fx' })).statusCode).toBe(400)
    expect((await a.inject({ method: 'GET', url: '/api/library/notes/other/x' })).statusCode).toBe(400)
    await a.close()
  })
})

describe('메인 노트 정하기 (sources.manuscript)', () => {
  it('\\documentclass가 있는 .tex만 후보로 내고, research.yaml의 주석을 지킨 채 manuscript 한 줄만 더하며, 바깥 수정과 이미 정한 것은 덮지 않는다', async () => {
    const proj = makeRepo('main-note-project')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    w('notes/main.tex', '\\documentclass{article}\n\\title{Alpha \\\\ research note}\n\\begin{document}\\end{document}\n')
    w('notes/chapters/01.tex', '\\section{Intro}\n')
    w('archive/old.tex', '\\documentclass{article}\n')
    w('workbench/research.yaml', '# 연구 정보\ntitle: N  # 제목\nsources:\n  bib: [refs.bib]\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-main-note') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const B = `/api/researches/${id}/main-note`

    const c = (await a.inject({ method: 'GET', url: `${B}/candidates` })).json()
    expect(c.candidates).toEqual([{ path: 'notes/main.tex', title: 'Alpha research note' }])

    const stale = await a.inject({ method: 'PUT', url: B, payload: { path: 'notes/main.tex', name: 'Alpha 연구노트', baseHash: 'nope' } })
    expect(stale.statusCode).toBe(409)
    expect(await a.inject({ method: 'PUT', url: B, payload: { path: '../x.tex', name: '', baseHash: c.hash } })).toMatchObject({ statusCode: 400 })

    expect((await a.inject({ method: 'PUT', url: B, payload: { path: 'notes/main.tex', name: 'Alpha 연구노트', baseHash: c.hash } })).statusCode).toBe(200)
    const yaml = fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')
    expect(yaml).toContain('# 연구 정보')
    expect(yaml).toContain('title: N  # 제목')
    expect(yaml).toContain('manuscript: notes/main.tex — Alpha 연구노트')
    expect((await a.inject({ method: 'GET', url: `/api/researches/${id}/manuscript` })).json()).toMatchObject({ main: 'notes/main.tex', name: 'Alpha 연구노트' })

    const again = (await a.inject({ method: 'GET', url: `${B}/candidates` })).json()
    expect((await a.inject({ method: 'PUT', url: B, payload: { path: 'notes/main.tex', name: '다른 이름', baseHash: again.hash } })).statusCode).toBe(409)
    expect(fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')).toBe(yaml)
    expect(again.candidates).toEqual([])
    await a.close()
  })

  it('메인 노트를 하나 더 정하면 manuscript를 목록으로 바꾸고, 장·컴파일·근거를 메인 노트마다 따로 본다', async () => {
    const proj = makeRepo('two-main-notes')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    w('docs/model/main.tex', '\\documentclass{article}\n\\begin{document}\n\\input{chapters/01}\n\\end{document}\n')
    w('docs/model/chapters/01.tex', '\\section{Model}\n')
    w('docs/dev/main.tex', '\\documentclass{beamer}\n\\begin{document}\n\\input{design}\n\\end{document}\n')
    w('docs/dev/design.tex', '\\section{Solver design}\n')
    w('workbench/research.yaml', 'title: N\nsources:\n  manuscript: docs/model/main.tex — 모형 연구노트  # 원고\n  bib: [refs.bib]\n')
    w('workbench/blocks/x.tex', '% ---\n% id: x\n% title: X\n% ---\n% 근거: design.tex\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-two-main') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const R = `/api/researches/${id}`

    const c = (await a.inject({ method: 'GET', url: `${R}/main-note/candidates` })).json()
    expect(c.candidates.map((x: { path: string }) => x.path)).toEqual(['docs/dev/main.tex'])
    expect((await a.inject({ method: 'PUT', url: `${R}/main-note`, payload: { path: 'docs/dev/main.tex', name: '이론 개발 노트', baseHash: c.hash } })).statusCode).toBe(200)
    const yaml = fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')
    expect(yaml).toBe('title: N\nsources:\n  manuscript:\n    - docs/model/main.tex — 모형 연구노트  # 원고\n    - docs/dev/main.tex — 이론 개발 노트\n  bib: [refs.bib]\n')

    const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json()
    expect(list.map((m: { key: string; name: string }) => [m.key, m.name])).toEqual([['', '모형 연구노트'], ['docs-dev-main', '이론 개발 노트']])
    expect(list[1].parts).toEqual([{ id: 'docs/dev/design.tex', file: 'docs/dev/design.tex', title: 'Solver design', appendix: false }])
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript?ms=docs-dev-main` })).json()).toMatchObject({ main: 'docs/dev/main.tex' })
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript?ms=nope` })).statusCode).toBe(404)
    // 둘째 메인 노트의 장도 읽고, 근거도 찾는다
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/part?file=docs/dev/design.tex` })).json().content).toContain('Solver design')
    expect((await a.inject({ method: 'GET', url: R })).json().blocks.find((b: { id: string }) => b.id === 'x').grounds).toEqual(['docs/dev/design.tex'])
    // PDF가 아직 없으면 위치 이동은 빈 결과
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/synctex/view?file=docs/dev/design.tex&line=1` })).json()).toEqual({ boxes: [] })
    expect((await a.inject({ method: 'GET', url: `${R}/manuscript/synctex/edit?page=1&x=10&y=10&ms=docs-dev-main` })).json()).toEqual({ spot: null })

    // 셋째: 목록 끝에 한 항목
    w('docs/other/main.tex', '\\documentclass{article}\n')
    const c3 = (await a.inject({ method: 'GET', url: `${R}/main-note/candidates` })).json()
    expect((await a.inject({ method: 'PUT', url: `${R}/main-note`, payload: { path: 'docs/other/main.tex', name: '', baseHash: c3.hash } })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')).toBe(yaml.replace('개발 노트\n', '개발 노트\n    - docs/other/main.tex\n'))
    await a.close()
  })
})

describe('프로젝트 정보 고치기 (research.yaml의 title·question·started)', () => {
  it('제목·설명·시작일만 바꾸고 주석과 sources는 지키며, 바깥 수정이 있으면 덮지 않는다', async () => {
    const proj = makeRepo('info-edit-project')
    fs.mkdirSync(path.join(proj, 'workbench'), { recursive: true })
    const yamlPath = path.join(proj, 'workbench/research.yaml')
    fs.writeFileSync(yamlPath, '# 연구 정보\ntitle: Old  # 제목\nquestion: q\nstarted: 2026-01-01\nsources:\n  bib: [refs.bib]  # 참고문헌\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-info-edit') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const U = `/api/researches/${id}/info`
    const { hash } = (await a.inject({ method: 'GET', url: `/api/researches/${id}/project` })).json()

    expect((await a.inject({ method: 'PATCH', url: U, payload: { title: 'New', baseHash: 'nope' } })).statusCode).toBe(409)
    expect((await a.inject({ method: 'PATCH', url: U, payload: { title: '  ', baseHash: hash } })).statusCode).toBe(400)
    expect((await a.inject({ method: 'PATCH', url: U, payload: { started: '어제', baseHash: hash } })).statusCode).toBe(400)

    const r = await a.inject({ method: 'PATCH', url: U, payload: { title: 'New  title', question: '무엇을 묻는가\n둘째 줄', started: '2026-02-03', baseHash: hash } })
    expect(r.statusCode).toBe(200)
    const yaml = fs.readFileSync(yamlPath, 'utf8')
    expect(yaml).toContain('# 연구 정보')
    expect(yaml).toContain('# 참고문헌')
    expect((await a.inject({ method: 'GET', url: `/api/researches/${id}` })).json().research).toMatchObject({ title: 'New title', question: '무엇을 묻는가\n둘째 줄', started: '2026-02-03' })
    expect((await a.inject({ method: 'GET', url: '/api/researches' })).json().researches.find((x: { id: string }) => x.id === id).title).toBe('New title')

    // 예전 해시로는 다시 쓰지 않는다
    expect((await a.inject({ method: 'PATCH', url: U, payload: { title: 'Stale', baseHash: hash } })).statusCode).toBe(409)
    expect(fs.readFileSync(yamlPath, 'utf8')).toBe(yaml)
    await a.close()
  })

  it('카드 그림(image:)은 저장소 안의 그림 파일만 받고, 비우면 뺀다', async () => {
    const proj = makeRepo('image-project')
    fs.mkdirSync(path.join(proj, 'workbench/figures'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'workbench/research.yaml'), 'title: 그림\n')
    fs.writeFileSync(path.join(proj, 'workbench/figures/a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const a = buildApp({ configDir: path.join(tmp, 'config-image') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const U = `/api/researches/${id}/info`
    const hash = async () => (await a.inject({ method: 'GET', url: `/api/researches/${id}/project` })).json().hash
    expect((await a.inject({ method: 'GET', url: `/api/researches/${id}/image` })).statusCode).toBe(404)
    for (const bad of ['../x.svg', 'workbench/research.yaml', 'workbench/figures/none.png']) {
      expect((await a.inject({ method: 'PATCH', url: U, payload: { image: bad, baseHash: await hash() } })).statusCode).toBe(400)
    }
    expect((await a.inject({ method: 'PATCH', url: U, payload: { image: 'workbench/figures/a.svg', baseHash: await hash() } })).statusCode).toBe(200)
    expect((await a.inject({ method: 'GET', url: `/api/researches/${id}` })).json().research.image).toBe('workbench/figures/a.svg')
    const img = await a.inject({ method: 'GET', url: `/api/researches/${id}/image` })
    expect(img.headers['content-type']).toContain('image/svg+xml')
    await a.inject({ method: 'PATCH', url: U, payload: { image: '', baseHash: await hash() } })
    expect(fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')).not.toContain('image')
    await a.close()
  })
})
