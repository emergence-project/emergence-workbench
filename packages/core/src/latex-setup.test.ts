import { describe, expect, it } from 'vitest'
import { buildAuthorLines, buildExportMainTex, buildPlainAuthorLines, buildSettingTex, DEFAULT_AUTHORS, DEFAULT_LATEX_SETUP, normalizeAuthors, normalizeLatexSetup } from './latex-setup.js'

describe('LaTeX 공통 설정과 저자', () => {
  it('기본 저자는 요청에 적힌 줄을 그대로 만든다', () => {
    expect(buildAuthorLines(DEFAULT_AUTHORS)).toEqual([
      '\\author{Ada Researcher}',
      '\\affiliation{Department of Mathematics, Example University, Example City 00000}',
      '\\author{Ben Collaborator \\thanks{corresponding author}}',
      '\\email{ben@example.org}',
      '\\affiliation{Department of Computer Science, Example Institute, Example City 00000}',
      '\\author{Cy Advisor \\thanks{corresponding author}}',
      '\\email{cy@example.org}',
      '\\affiliation{Department of Mathematics, Example University, Example City 00000}',
    ])
  })

  it('main.tex: 문서 종류 줄, 공통 줄, 제목·저자, 본문 순서', () => {
    const tex = buildExportMainTex({ setup: DEFAULT_LATEX_SETUP, authors: DEFAULT_AUTHORS.slice(0, 1), title: 'An example paper', body: 'Hello.\n\n' })
    const lines = tex.split('\n')
    expect(lines[0]).toBe('\\documentclass[prl, twocolumn, english, superscriptaddress, floatfix, longbibliography]{revtex4-1}')
    expect(lines[1]).toBe('\\include{setting}')
    expect(tex.indexOf('\\begin{document}')).toBeLessThan(tex.indexOf('\\title{An example paper}'))
    expect(tex.indexOf('\\author{Ada Researcher}')).toBeLessThan(tex.indexOf('\\maketitle'))
    expect(tex).toContain('\\maketitle\n\nHello.\n\n\\end{document}\n')
  })

  it('setting.tex: 고른 패키지만 목록 순서대로, 옵션과 덧붙인 줄', () => {
    const tex = buildSettingTex({ ...DEFAULT_LATEX_SETUP, packages: ['hyperref', 'amsmath'], settingExtra: '\\newcommand{\\Tr}{\\operatorname{Tr}}' })
    expect(tex.split('\n').filter((l) => l.startsWith('\\usepackage'))).toEqual(['\\usepackage{amsmath}', '\\usepackage[colorlinks=true, allcolors=blue]{hyperref}'])
    expect(tex).toContain('\\newcommand{\\Tr}{\\operatorname{Tr}}')
  })

  it('모르는 패키지·빈 저자는 버리고, 없는 값은 기본값', () => {
    expect(normalizeLatexSetup({ packages: ['amsmath', 'evil}'] }).packages).toEqual(['amsmath'])
    expect(normalizeLatexSetup(undefined)).toEqual(DEFAULT_LATEX_SETUP)
    expect(normalizeLatexSetup({ documentClass: '\\documentclass{article}\n' }).documentClass).toBe('\\documentclass{article}')
    expect(normalizeAuthors(undefined)).toEqual(DEFAULT_AUTHORS)
    expect(normalizeAuthors([])).toEqual([])
    expect(normalizeAuthors([{ name: ' ' }, { name: 'A', email: '', affiliations: ['X', ''], corresponding: 'yes' }])).toEqual([{ name: 'A', affiliations: ['X'] }])
  })
})

describe('revtex가 아닌 문서의 저자 줄', () => {
  it('article 등은 \\affiliation 대신 \\author{이름 \\\\ 소속 \\and …}', () => {
    const authors = [{ name: 'A', email: 'a@x', corresponding: true, affiliations: ['U1'] }, { name: 'B', affiliations: ['U2', 'U3'] }]
    expect(buildPlainAuthorLines(authors)).toEqual(['\\author{A\\thanks{a@x} \\\\ U1 \\and B \\\\ U2 \\\\ U3}'])
    const tex = buildExportMainTex({ setup: { ...DEFAULT_LATEX_SETUP, documentClass: '\\documentclass{article}' }, authors, title: 'T' })
    expect(tex).not.toContain('\\affiliation')
    expect(buildExportMainTex({ setup: DEFAULT_LATEX_SETUP, authors, title: 'T' })).toContain('\\affiliation{U1}')
  })
})

describe('LaTeX 서식 모음', () => {
  it('저장된 것이 없으면 기본 서식 전부, 예전 latex:는 PRL로', async () => {
    const { normalizeTemplates, newTemplateId } = await import('./latex-setup.js')
    expect(normalizeTemplates(undefined).map((t) => t.id)).toEqual(['article', 'prl', 'beamer', 'prb', 'research-note'])
    expect(normalizeTemplates(undefined, { packages: ['braket'] }).find((t) => t.id === 'prl')!.packages).toEqual(['braket'])
    // id가 겹치거나 비면 버리고, 모르는 id는 article을 바탕으로
    const list = normalizeTemplates([{ id: 'My PRB', name: 'PRB' }, { id: 'my-prb' }, { name: 'no id' }, { id: 'beamer', kind: 'weird' }])
    expect(list.map((t) => `${t.id}:${t.kind}`)).toEqual(['my-prb:document', 'beamer:slides', 'prb:document', 'research-note:document'])
    expect(list[0]!.documentClass).toBe('\\documentclass[11pt]{article}')
    expect(normalizeTemplates([])).toHaveLength(5)
    // 이름표: 빈 것·겹친 것은 빼고, 없으면 기본 서식의 이름표
    expect(normalizeTemplates([{ id: 'prl', tags: [' A ', 'A', ''] }, { id: 'article' }]).map((t) => t.tags)).toEqual([['A'], ['노트'], ['논문', 'APS'], ['노트', 'XeLaTeX']])
    // 새 기본 서식(PRB)은 예전 목록에 한 번만 더한다. 본 적 있는데 없으면 지운 것이라 되살리지 않는다
    expect(normalizeTemplates([{ id: 'article' }], undefined, ['article', 'prl', 'beamer', 'prb', 'research-note']).map((t) => t.id)).toEqual(['article'])
    expect(newTemplateId('PRL', ['prl', 'prl-2'])).toBe('prl-3')
    expect(newTemplateId('한글 이름', [])).toBe('template')
  })

  it('발표 서식: 사용자의 knowledge-factory-beamer, 제목 장면과 \\institute', async () => {
    const { BUILTIN_TEMPLATES, normalizeTemplates, buildExportMainTex } = await import('./latex-setup.js')
    const beamer = BUILTIN_TEMPLATES.find((t) => t.id === 'beamer')!
    expect(beamer.files).toEqual(['knowledge-factory-beamer.sty'])
    // 스타일 파일은 저장된 값으로 바꿀 수 없다
    expect(normalizeTemplates([{ id: 'beamer', files: ['../x.sty'] }])[0]!.files).toEqual(['knowledge-factory-beamer.sty'])
    expect(normalizeTemplates([{ id: 'mine', files: ['x.sty'] }])[0]!.files).toBeUndefined()
    const tex = buildExportMainTex({ setup: beamer, authors: [{ name: 'A', affiliations: ['X'] }, { name: 'B', affiliations: ['X', 'Y'] }], title: 'Talk' })
    // setting.tex(amsmath)는 unicode-math보다 앞
    expect(tex.indexOf('\\input{setting}')).toBeLessThan(tex.indexOf('\\usepackage{unicode-math}'))
    expect(tex).toContain('\\author{A \\and B}\n\\institute[]{\\begin{tabular}[b]{@{}r@{}}X \\\\ Y\\end{tabular}}')
    expect(buildExportMainTex({ setup: beamer, authors: [{ name: 'A', affiliations: ['X'] }], title: 'T' })).toContain('\\institute[]{X}')
    expect(tex.indexOf('\\title{Talk}')).toBeLessThan(tex.indexOf('\\begin{document}'))
    expect(tex).toContain('\\begin{frame}[plain,noframenumbering]\n  \\titlepage\n\\end{frame}')
    expect(tex).not.toContain('\\maketitle')
    expect(tex).not.toContain('\\affiliation')
  })
})
