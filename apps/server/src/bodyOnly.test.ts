// 본문만 있는 노트: 머리는 앱의 LaTeX 서식이 붙인다 (10/4 사용자 "본문만 남기고, 컴파일러가 처리하도록")
import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_TEMPLATES } from '@rw/core'
import { describe, expect, it } from 'vitest'
import { isBodyOnly, NO_TITLE_BLOCK, wrapBodyOnly } from './manuscript.js'
import { app, hasLatex, R, repo, useSampleApp } from './testkit.js'

useSampleApp()

const BODY = [
  '\\begin{document}',
  '\\title{Body only}',
  '\\maketitle',
  '\\section{Intro}\\label{sec:intro}',
  'See Sec.~\\ref{sec:intro}. \\ADA{check} $\\braket{x|y}$.',
  '\\begin{theorem}A claim.\\end{theorem}',
  '\\end{document}',
  '',
].join('\n')

describe('본문만 있는 노트를 서식으로 감싼다', () => {
  it('\\documentclass가 없으면 본문만 있는 노트, 주석 속 \\documentclass는 세지 않는다', () => {
    expect(isBodyOnly(BODY)).toBe(true)
    expect(isBodyOnly('% \\documentclass{article}\n' + BODY)).toBe(true)
    expect(isBodyOnly('\\documentclass{article}\n' + BODY)).toBe(false)
  })

  it('감싸는 main: 문서 종류 → 공통 줄 → 프로젝트 기호 → pdftitle → 본문', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'prb')!
    const tex = wrapBodyOnly({ template: t, noteFile: 'main note.tex', title: 'Beta {proof} 노트', macros: '../../macros.tex' })
    const at = (s: string) => tex.indexOf(s)
    expect(at('{revtex4-2}')).toBeGreaterThan(0)
    expect(at('{revtex4-2}')).toBeLessThan(at('\\input{setting}'))
    expect(at('\\input{setting}')).toBeLessThan(at('\\input{../../macros.tex}'))
    expect(at('\\input{../../macros.tex}')).toBeLessThan(at('pdftitle={Beta proof 노트}'))
    expect(tex.trimEnd().endsWith('\\input{"main note.tex"}')).toBe(true)
  })

  it('메인 노트 후보에 본문만 있는 노트도 나온다', async () => {
    const dir = path.join(repo, 'notes-src')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'paper.tex'), BODY)
    const r = (await app.inject({ method: 'GET', url: `${R}/main-note/candidates` })).json()
    expect(r.candidates.map((c: { path: string }) => c.path)).toContain('notes-src/paper.tex')
  })
})

describe.skipIf(!hasLatex)('본문만 있는 노트 컴파일', () => {
  // 적지 않은 연구노트의 key는 경로에서 (manuscript.ts msKeyOf)
  const BODY_KEY = 'workbench-notes-body-main'
  // article 서식에는 braket·theorem이 없어 그 줄을 뺀 본문으로
  const plain = BODY.split('\n').filter((l) => !/braket|theorem/.test(l)).join('\n')
  it.each([['article', plain], ['prb', BODY]])('%s 서식: 노트 폴더에는 아무것도 쓰지 않고 PDF를 만든다', async (id, body) => {
    const note = path.join(repo, 'workbench/notes/body')
    fs.mkdirSync(note, { recursive: true })
    fs.writeFileSync(path.join(note, 'main.tex'), body)
    // 연구 전용 기호는 workbench/macros.tex
    fs.writeFileSync(path.join(repo, 'workbench/macros.tex'), '\\newcommand{\\ADA}[1]{{\\color{magenta}\\footnotesize{(ADA) #1}}}\n')
    const research = path.join(repo, 'workbench/research.yaml')
    const yaml = fs.readFileSync(research, 'utf8').replace(/^latex-template:.*\n/m, '')
    fs.writeFileSync(research, `${yaml.trimEnd()}\nlatex-template: ${id}\n`)
    const before = fs.readdirSync(note).sort()
    const r = (await app.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${BODY_KEY}` })).json()
    expect(r.problems).toEqual([])
    expect(r).toMatchObject({ ok: true, hasPdf: true })
    expect(fs.readdirSync(note).sort()).toEqual(before)
    expect(fs.readFileSync(path.join(note, 'main.tex'), 'utf8')).toBe(body)
  }, 120_000)

  it('기호 파일을 research.yaml의 latex-macros:로 정할 수 있다 (저장소에 두는 기호)', async () => {
    fs.rmSync(path.join(repo, 'workbench/macros.tex'), { force: true })
    fs.writeFileSync(path.join(repo, 'macros.tex'), '\\newcommand{\\ADA}[1]{(ADA) #1}\n')
    const research = path.join(repo, 'workbench/research.yaml')
    fs.appendFileSync(research, 'latex-macros: macros.tex\n')
    const r = (await app.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${BODY_KEY}` })).json()
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
  }, 120_000)
})

describe('머리·제목 줄 떼기와 앱이 붙이는 앞머리 (10/4 15:41 피드백)', () => {
  const PAPER = [
    '\\documentclass[aps,prb]{revtex4-2}',
    '\\usepackage{amsmath}',
    '\\newcommand{\\BP}{\\mathrm{BP}}',
    '\\newcommand{\\ADA}[1]{(ADA) #1}',
    '\\begin{document}',
    '\\title{An Example Paper}',
    '\\author{A. Author}',
    '%\\email{author@example.org}',
    '\\affiliation{Department of Mathematics, Example University}',
    '\\begin{abstract}Research note.\\end{abstract}',
    '\\maketitle',
    '\\section{Intro} $\\BP$.',
    '\\end{document}',
    '',
  ].join('\n')
  const keyOf = async (name: string) => ((await app.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string; needsBodyOnly?: boolean }[]).find((m) => m.name === name)!

  it('연구노트의 머리와 제목·저자 줄을 떼고 정의는 프로젝트 기호 파일로, 서식은 뗀 머리에 맞춰 research.yaml에', async () => {
    // 앞 컴파일 시험이 정한 서식과 기호 파일을 지우고 시작한다
    const research = path.join(repo, 'workbench/research.yaml')
    fs.writeFileSync(research, fs.readFileSync(research, 'utf8').replace(/^latex-(?:template|macros):.*\n/gm, ''))
    fs.rmSync(path.join(repo, 'macros.tex'), { force: true })
    fs.writeFileSync(path.join(repo, 'workbench/macros.tex'), '\\newcommand{\\ADA}[1]{(ADA) #1}\n')
    const dir = path.join(repo, 'workbench/notes/beta-raw')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'main.tex'), PAPER)
    fs.writeFileSync(path.join(dir, 'note.yaml'), 'name: Beta 노트\n')
    const m = await keyOf('Beta 노트')
    expect(m.needsBodyOnly).toBe(true)
    const r = (await app.inject({ method: 'POST', url: `${R}/manuscript/body-only?ms=${encodeURIComponent(m.key)}` })).json()
    expect(r).toMatchObject({ removedHead: true, removedFront: 4, macros: 1, template: 'prb' })
    const body = fs.readFileSync(path.join(dir, 'main.tex'), 'utf8')
    expect(body).not.toMatch(/documentclass|\\title|\\author|affiliation|email/)
    expect(body).toContain('\\maketitle')
    // 정의는 프로젝트 기호 파일(workbench/macros.tex)로, 이미 있는 \\ADA는 다시 넣지 않는다
    const macros = fs.readFileSync(path.join(repo, 'workbench/macros.tex'), 'utf8')
    expect(macros).toContain('\\providecommand{\\BP}')
    expect(macros.match(/\\ADA/g)).toHaveLength(1)
    expect((await keyOf('Beta 노트')).needsBodyOnly).toBeUndefined()
    expect(fs.readFileSync(research, 'utf8')).toMatch(/^latex-template: prb$/m)
  })

  it.skipIf(!hasLatex).each(['prb', 'article'])('%s 서식: 연구노트는 저자·소속·초록 없이 노트 이름만 두고 컴파일한다 (10/4 16:53)', async (id) => {
    const research = path.join(repo, 'workbench/research.yaml')
    const yaml = fs.readFileSync(research, 'utf8').replace(/^latex-template:.*\n/m, '')
    fs.writeFileSync(research, `${yaml.trimEnd()}\nlatex-template: ${id}\n`)
    const m = await keyOf('Beta 노트')
    const r = (await app.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${encodeURIComponent(m.key)}` })).json()
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    const wrap = fs.readFileSync(path.join(repo, 'workbench/.build', `manuscript-${m.key}`, 'rw-wrap-main.tex'), 'utf8')
    expect(wrap).toContain('{\\centering\\large\\bfseries Beta 노트\\par}')
    expect(wrap).not.toMatch(/\\(?:title|author)\{/)
    // 본문에 남은 \maketitle과 초록은 아무것도 찍지 않는다
    expect(wrap).toContain(NO_TITLE_BLOCK)
  }, 120_000)
})

describe('머리를 옆 파일(setting.tex)로 빼 둔 노트 (맥에서 쓰던 노트 모양)', () => {
  it('setting.tex를 펼쳐 정의와 서식을 옮기고, 다 옮긴 setting.tex는 지운다', async () => {
    const research = path.join(repo, 'workbench/research.yaml')
    fs.writeFileSync(research, fs.readFileSync(research, 'utf8').replace(/^latex-(?:template|macros):.*\n/gm, ''))
    fs.writeFileSync(path.join(repo, 'workbench/macros.tex'), '')
    const dir = path.join(repo, 'workbench/notes/beta-setting')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'setting.tex'), '\\documentclass[aps,english,prb,twocolumn]{revtex4-2}\n\\usepackage{amsmath}\n\\newcommand{\\BEA}[1]{(BEA) #1}\n')
    fs.writeFileSync(path.join(dir, 'main.tex'), '\\input{setting}\n\\begin{document}\n\\title{Beta}\n\\maketitle\nText \\BEA{x}.\n\\end{document}\n')
    fs.writeFileSync(path.join(dir, 'note.yaml'), 'name: Beta 옆 파일\n')
    const list = (await app.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string; needsBodyOnly?: boolean }[]
    const m = list.find((x) => x.name === 'Beta 옆 파일')!
    expect(m.needsBodyOnly).toBe(true)
    const r = (await app.inject({ method: 'POST', url: `${R}/notes/body-only` })).json()
    expect(r).toMatchObject({ template: 'prb' })
    expect(fs.readFileSync(path.join(dir, 'main.tex'), 'utf8')).toBe('\\begin{document}\n\n\\maketitle\nText \\BEA{x}.\n\n\\end{document}\n')
    expect(fs.existsSync(path.join(dir, 'setting.tex'))).toBe(false)
    expect(fs.readFileSync(path.join(repo, 'workbench/macros.tex'), 'utf8')).toContain('\\providecommand{\\BEA}')
    expect(fs.readFileSync(research, 'utf8')).toMatch(/^latex-template: prb$/m)
  })
})
