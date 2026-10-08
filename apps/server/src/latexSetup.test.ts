import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { app, hasLatex, tmp, useSampleApp } from './testkit.js'

useSampleApp()

/** 예제 라이브러리(templates/research-library)를 한 번 복사해 앱에 정한다 */
function withLibrary(a: ReturnType<typeof buildApp>): string {
  const lib = path.join(tmp, 'research-library')
  if (!fs.existsSync(lib)) fs.cpSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/research-library'), lib, { recursive: true })
  a.registry.setLibrary(lib)
  return lib
}

describe('LaTeX 서식 모음과 저자 (앱 설정에 저장)', () => {
  it('처음에는 article·PRL·beamer·PRB·연구노트, 고치면 앱 설정에 남고 다시 열어도 그대로', async () => {
    const first = (await app.inject({ method: 'GET', url: '/api/latex-setup' })).json()
    expect(first.templates.map((t: { id: string }) => t.id)).toEqual(['article', 'prl', 'beamer', 'prb', 'research-note'])
    // 서식 모음에서 묶어 보는 이름표 (10/4 19:30)
    expect(first.templates.find((t: { id: string }) => t.id === 'research-note')).toMatchObject({ tags: ['노트', 'XeLaTeX'], files: ['rw-research-note.sty'] })
    expect(first.defaultTemplate).toBe('prl')
    expect(first.authors).toHaveLength(3)
    expect(first.previews.prl.main).toContain('\\author{Ben Collaborator \\thanks{corresponding author}}')
    expect(first.previews.prl.main.split('\n')[1]).toBe('\\include{setting}')

    const put = await app.inject({ method: 'PUT', url: '/api/latex-templates/prl', payload: { template: { packages: ['physics', 'nope'] } } })
    const prl = put.json().templates.find((t: { id: string }) => t.id === 'prl')
    expect(prl.packages).toEqual(['physics'])
    expect(prl.tags).toEqual(['논문', 'APS'])
    const tagged = (await app.inject({ method: 'PUT', url: '/api/latex-templates/prl', payload: { template: { tags: [' 논문 ', '논문', '', 'PRL'] } } })).json()
    expect(tagged.templates.find((t: { id: string }) => t.id === 'prl').tags).toEqual(['논문', 'PRL'])
    expect(prl.preamble).toBe('\\include{setting}')
    expect(put.json().previews.prl.setting).toContain('\\usepackage{physics}')

    const added = (await app.inject({ method: 'POST', url: '/api/latex-templates', payload: { from: 'article', name: 'PRA 원고' } })).json()
    expect(added.created).toBe('pra')
    expect(added.templates.find((t: { id: string }) => t.id === 'pra')).toMatchObject({ name: 'PRA 원고', documentClass: '\\documentclass[11pt]{article}' })
    expect((await app.inject({ method: 'PUT', url: '/api/latex-templates-default', payload: { id: 'pra' } })).json().defaultTemplate).toBe('pra')
    expect((await app.inject({ method: 'PUT', url: '/api/latex-templates-default', payload: { id: 'ghost' } })).statusCode).toBe(404)
    // 기본 서식을 지우면 첫 서식이 기본이 된다
    expect((await app.inject({ method: 'DELETE', url: '/api/latex-templates/pra' })).json().defaultTemplate).toBe('article')

    const authors = await app.inject({ method: 'PUT', url: '/api/authors', payload: { authors: [{ name: 'B', affiliations: ['Y'] }] } })
    expect(authors.json().authors).toEqual([{ name: 'B', affiliations: ['Y'] }])

    const again = buildApp({ configDir: path.join(tmp, 'config') })
    const v = (await again.inject({ method: 'GET', url: '/api/latex-setup' })).json()
    expect(v.templates.find((t: { id: string }) => t.id === 'prl').packages).toEqual(['physics'])
    expect(v.defaultTemplate).toBe('article')
    expect(v.authors).toEqual([{ name: 'B', affiliations: ['Y'] }])
    await again.close()
  })

  it('예전 설정의 latex:(서식 하나)는 PRL 서식으로 옮긴다', async () => {
    const dir = path.join(tmp, 'old-config')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'config.yaml'), 'researches: []\nlatex:\n  documentClass: \\documentclass{revtex4-2}\n  packages: [braket]\n')
    const old = buildApp({ configDir: dir })
    const v = (await old.inject({ method: 'GET', url: '/api/latex-setup' })).json()
    expect(v.templates.find((t: { id: string }) => t.id === 'prl')).toMatchObject({ documentClass: '\\documentclass{revtex4-2}', packages: ['braket'], preamble: '\\include{setting}' })
    await old.close()
  })

  it('main.tex·setting.tex 받기 (서식을 고를 수 있음), 다른 파일은 없음', async () => {
    const main = await app.inject({ method: 'GET', url: '/api/latex-setup/download/main.tex' })
    expect(main.statusCode).toBe(200)
    expect(main.headers['content-disposition']).toContain('main.tex')
    expect(main.body).toMatch(/\\author\{B(\}| \\\\)/)
    expect((await app.inject({ method: 'GET', url: '/api/latex-setup/download/main.tex?template=beamer' })).body).toContain('{beamer}')
    expect((await app.inject({ method: 'GET', url: '/api/latex-setup/download/..%2Fconfig.yaml' })).statusCode).toBe(404)
    // 발표 서식의 스타일 파일 (그 서식에서만)
    const sty = await app.inject({ method: 'GET', url: '/api/latex-setup/download/knowledge-factory-beamer.sty?template=beamer' })
    expect(sty.statusCode).toBe(200)
    expect(sty.body).toContain('\\ProvidesPackage{knowledge-factory-beamer}')
    expect((await app.inject({ method: 'GET', url: '/api/latex-setup/download/knowledge-factory-beamer.sty?template=prl' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PUT', url: '/api/authors', payload: { authors: 'x' } })).statusCode).toBe(400)
    // 하나는 남긴다
    for (const id of ['prl', 'beamer', 'prb', 'research-note']) expect((await app.inject({ method: 'DELETE', url: `/api/latex-templates/${id}` })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: '/api/latex-templates/article' })).statusCode).toBe(400)
  })

  it('개념노트 컴파일: 없는 서식·발표 서식은 거절한다', async () => {
    withLibrary(app)
    const c = (await app.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: 'Template pick', format: 'tex' } })).json()
    expect((await app.inject({ method: 'POST', url: `/api/library/notes/concept/${c.id}/compile`, payload: { template: 'ghost' } })).statusCode).toBe(404)
    await app.inject({ method: 'POST', url: '/api/latex-templates', payload: { from: 'article', name: 'Slides' } })
    await app.inject({ method: 'PUT', url: '/api/latex-templates/slides', payload: { template: { kind: 'slides' } } })
    expect((await app.inject({ method: 'POST', url: `/api/library/notes/concept/${c.id}/compile`, payload: { template: 'slides' } })).statusCode).toBe(400)
  })
})

describe.skipIf(!hasLatex)('서식 미리보기 (10/4 19:30 "미리보기로 만들어")', () => {
  it.each(['article', 'prb', 'research-note'])('%s: 예문을 컴파일한 PDF, 서식이 그대로면 다시 컴파일하지 않는다', async (tid) => {
    const a = buildApp({ configDir: path.join(tmp, `preview-${tid}`) })
    const res = await a.inject({ method: 'GET', url: `/api/latex-templates/${tid}/preview.pdf` })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    const pdf = path.join(tmp, `preview-${tid}`, 'latex-previews', tid, 'main.pdf')
    const before = fs.statSync(pdf).mtimeMs
    expect((await a.inject({ method: 'GET', url: `/api/latex-templates/${tid}/preview.pdf` })).statusCode).toBe(200)
    expect(fs.statSync(pdf).mtimeMs).toBe(before)
    await a.close()
  }, 90_000)
  it('없는 서식은 404, 컴파일하지 못하면 PDF 대신 첫 오류 (JSON)', async () => {
    const a = buildApp({ configDir: path.join(tmp, 'preview-bad') })
    expect((await a.inject({ method: 'GET', url: '/api/latex-templates/ghost/preview.pdf' })).statusCode).toBe(404)
    await a.inject({ method: 'PUT', url: '/api/latex-templates/article', payload: { template: { documentClass: '\\documentclass{no-such-class-xyz}' } } })
    const bad = await a.inject({ method: 'GET', url: '/api/latex-templates/article/preview.pdf' })
    expect(bad.statusCode).toBe(200)
    expect(bad.headers['content-type']).toContain('application/json')
    expect(bad.json().error).toContain('not found')
    await a.close()
  }, 90_000)
})

describe.skipIf(!hasLatex)('개념노트를 고른 서식으로 컴파일', () => {
  const fresh = () => buildApp({ configDir: path.join(tmp, 'tpl-config') })
  it.each(['article', 'prl'])('%s 서식으로 PDF를 만든다 (setting.tex는 빌드 폴더에만)', async (tid) => {
    const a = fresh()
    const lib = withLibrary(a)
    const c = (await a.inject({ method: 'POST', url: '/api/library/concepts', payload: { title: `Template ${tid}`, format: 'tex' } })).json()
    const compiled = (await a.inject({ method: 'POST', url: `/api/library/notes/concept/${c.id}/compile`, payload: { template: tid } })).json()
    expect(compiled.problems).toEqual([])
    expect(compiled).toMatchObject({ ok: true, hasPdf: true })
    const build = path.join(tmp, 'tpl-config', 'library-build', `concept-${c.id}`)
    expect(fs.readFileSync(path.join(build, 'main.tex'), 'utf8')).toContain(tid === 'prl' ? '{revtex4-1}' : '[11pt]{article}')
    expect(fs.existsSync(path.join(build, 'setting.tex'))).toBe(true)
    expect(fs.existsSync(path.join(lib, 'setting.tex'))).toBe(false)
    await a.close()
  }, 90_000)
})
