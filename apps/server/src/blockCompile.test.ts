import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { app, hasLatex, R, repo, useSampleApp } from './testkit.js'

useSampleApp()

const file = (id: string, ext = 'tex') => path.join(repo, 'workbench/blocks', `${id}.${ext}`)
const built = (id: string, name = 'main.tex') => fs.readFileSync(path.join(repo, 'workbench/.build', id, name), 'utf8')
const compile = (id: string, query = '') => app.inject({ method: 'POST', url: `${R}/blocks/${id}/compile${query ? `?${query}` : ''}` })

describe('보조 노트 컴파일 설정', () => {
  it('자체 머리가 있는 LaTeX만 ownHeader로 알려 준다', async () => {
    fs.writeFileSync(file('header'), '% ---\n% id: header\n% title: Header\n% ---\n\\documentclass{article}\n\\begin{document}\nOwn.\n\\end{document}\n')
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/header` })).json().ownHeader).toBe(true)
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/kempe-chains` })).json().ownHeader).toBeUndefined()
    fs.writeFileSync(file('commented-header'), '% \\documentclass{article}\nBody.\n')
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/commented-header` })).json().ownHeader).toBeUndefined()
    fs.writeFileSync(file('md-header', 'md'), '---\nid: md-header\ntitle: Markdown\n---\n`\\documentclass{article}`\n')
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/md-header` })).json().ownHeader).toBeUndefined()
  })

  it('연구노트와 같은 날짜 검증을 거친다', async () => {
    const before = fs.readFileSync(file('kempe-chains'))
    const r = await compile('kempe-chains', 'tpl=article&date=wrong')
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toBe('날짜는 none, today 또는 YYYY-MM-DD')
    expect(fs.readFileSync(file('kempe-chains'))).toEqual(before)
  })

  it.skipIf(!hasLatex)('Markdown에 고른 서식·저자·날짜를 붙이고 원본을 그대로 둔다', async () => {
    const content = '---\nid: choice-md\ntitle: Selected markdown\n---\n## Result\n\nA selected template.\n'
    fs.writeFileSync(file('choice-md', 'md'), content)
    await app.inject({ method: 'PUT', url: '/api/authors', payload: { authors: [{ name: 'Ann', affiliations: ['Lab'] }, { name: 'Bo', affiliations: [] }] } })
    const r = await compile('choice-md', 'tpl=article&au=Bo&au=Ann&au=Bo&date=2026-10-06')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ ok: true, hasPdf: true, problems: [] })
    const main = built('choice-md')
    expect(main).toContain('\\documentclass[11pt]{article}')
    expect(main).toContain('\\author{Bo \\and Ann \\\\ Lab}')
    expect(main).toContain('\\date{2026-10-06}')
    expect(main).toContain(`\\input{${path.join(repo, 'workbench/preamble.tex')}}`)
    expect(built('choice-md', 'block-body.tex')).toContain('\\section{Result}')
    expect(fs.readFileSync(file('choice-md', 'md'), 'utf8')).toBe(content)
  })

  it.skipIf(!hasLatex)('LaTeX 본문은 원래 파일로 연결하고 빈 저자·날짜는 넣지 않는다', async () => {
    const content = '% ---\n% id: choice-tex\n% title: Selected TeX\n% ---\n\\section{Result}\n$\\kc{1}{3}{v_1}$.\n'
    fs.writeFileSync(file('choice-tex'), content)
    const r = await compile('choice-tex', 'tpl=article&au=&date=none')
    expect(r.json()).toMatchObject({ ok: true, hasPdf: true, problems: [] })
    const main = built('choice-tex')
    expect(main).toContain(`\\input{${file('choice-tex')}}`)
    expect(main).toContain('Selected TeX')
    expect(main).not.toContain('\\author{')
    expect(main).not.toContain('\\date{')
    expect(fs.readFileSync(file('choice-tex'), 'utf8')).toBe(content)
  })

  it.skipIf(!hasLatex)('서식을 따로 고르지 않은 노트는 한 단 연구노트 서식으로 컴파일된다 (10/8 11:42)', async () => {
    fs.writeFileSync(file('choice-default'), '% ---\n% id: choice-default\n% title: Default\n% ---\n$\\kc{1}{3}{v_1}$.\n')
    expect((await compile('choice-default', 'au=&date=none')).json()).toMatchObject({ ok: true, problems: [] })
    expect(built('choice-default')).toContain('rw-research-note')
    expect(built('choice-default')).not.toContain('revtex4-1')
    expect(built('choice-default')).toContain('\\input{setting}')
  }, 120_000)

  it.skipIf(!hasLatex)('없는 선택 서식은 연구노트처럼 프로젝트 기본 서식으로 돌아간다', async () => {
    fs.appendFileSync(path.join(repo, 'workbench/research.yaml'), '\nlatex-template: article\n')
    fs.writeFileSync(file('choice-fallback'), '% ---\n% id: choice-fallback\n% title: Fallback\n% ---\nFallback.\n')
    expect((await compile('choice-fallback', 'tpl=missing-template&date=today')).json()).toMatchObject({ ok: true, problems: [] })
    expect(built('choice-fallback')).toContain('\\documentclass[11pt]{article}')
    expect(built('choice-fallback')).toContain('\\today')
  })

  it.skipIf(!hasLatex)('선택 query가 없는 호출은 기존 블록 서식을 유지한다', async () => {
    fs.writeFileSync(file('choice-legacy'), '% ---\n% id: choice-legacy\n% title: Legacy\n% ---\nLegacy.\n')
    expect((await compile('choice-legacy')).json()).toMatchObject({ ok: true, problems: [] })
    expect(built('choice-legacy')).not.toContain('\\input{setting}')
    expect(built('choice-legacy')).not.toContain('Legacy')
  })

  it.skipIf(!hasLatex)('연구노트 서식도 기존 프로젝트 preamble과 함께 컴파일된다', async () => {
    fs.writeFileSync(file('choice-research'), '% ---\n% id: choice-research\n% title: Research note\n% ---\n$\\kc{1}{3}{v_1}$.\n')
    const before = fs.readFileSync(path.join(repo, 'workbench/preamble.tex'))
    expect((await compile('choice-research', 'tpl=research-note&au=&date=none')).json()).toMatchObject({ ok: true, problems: [] })
    expect(built('choice-research')).toContain('\\usepackage{rw-research-note}')
    expect(fs.readFileSync(path.join(repo, 'workbench/preamble.tex'))).toEqual(before)
  })

  it.skipIf(!hasLatex)('자체 머리가 있는 노트는 선택 서식과 프로젝트 preamble을 덧붙이지 않는다', async () => {
    const content = '% ---\n% id: choice-own\n% title: Own header\n% ---\n\\documentclass{article}\n\\begin{document}\nOwn header.\n\\end{document}\n'
    fs.writeFileSync(file('choice-own'), content)
    expect((await compile('choice-own', 'tpl=research-note&au=Ann&date=today')).json()).toMatchObject({ ok: true, problems: [] })
    const main = built('choice-own')
    expect(main).toContain(`\\input{"${file('choice-own')}"}`)
    expect(main).not.toContain('preamble.tex')
    expect(main).not.toContain('\\documentclass')
    expect(fs.readFileSync(file('choice-own'), 'utf8')).toBe(content)
  })
})
