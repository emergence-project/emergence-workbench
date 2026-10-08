// 노트 본문만 남기기 (10/4 15:41 피드백 "제목·저자 같은 것은 원고에 넣지 말라")
import { describe, expect, it } from 'vitest'
import { headDefinitions, needsBodyOnly, stripFrontMatter, toBodyOnly } from './noteBody.js'

// 맥 연구노트에 있던 모양 (논문 PRB.tex에서 복사)
const PAPER = [
  '\\documentclass[aps,prb,twocolumn]{revtex4-2}',
  '\\usepackage{amsmath}',
  '\\newcommand{\\ADA}[1]{{\\color{magenta}(ADA) #1}}',
  '\\newtheorem{theorem}{Theorem}',
  '% \\newcommand{\\old}{x}',
  '\\begin{document}',
  '\\title{An Example Paper}',
  '\\author{A. Author}',
  '%\\email{author@example.org}',
  '\\affiliation{Department of Mathematics, Example University,',
  '  City 00000, Country}',
  '',
  '% 연구노트: PRB.tex에서 복사해 고쳐 쓰는 노트',
  '\\author{B. Coauthor \\thanks{corresponding author}}',
  '\\email{coauthor@example.org}',
  '\\begin{abstract}Research note.\\end{abstract}',
  '\\maketitle',
  '\\section{Main result}\\label{sec:main}',
  'Text \\ADA{check}.',
  '\\end{document}',
  '',
].join('\n')

describe('노트 본문만 남기기', () => {
  it('제목·저자·소속·이메일 줄(주석으로 막은 것, 여러 줄인 것 포함)을 뺀다', () => {
    const r = stripFrontMatter('\\title{A}\n\\affiliation{B,\n C}\n%\\email{x}\nkeep\n\\titlepage\n')
    expect(r.body).toBe('keep\n\\titlepage\n')
    expect(r.removed).toBe(4)
  })

  it('머리와 앞머리를 떼고 초록·\\maketitle·본문은 그대로, 정의는 note-macros로', () => {
    expect(needsBodyOnly(PAPER)).toBe(true)
    const r = toBodyOnly(PAPER)
    expect(r.removedHead).toBe(true)
    expect(r.text).toBe([
      '\\begin{document}', '',
      '% 연구노트: PRB.tex에서 복사해 고쳐 쓰는 노트',
      '\\begin{abstract}Research note.\\end{abstract}',
      '\\maketitle',
      '\\section{Main result}\\label{sec:main}',
      'Text \\ADA{check}.', '',
      '\\end{document}', '',
    ].join('\n'))
    expect(r.macros).toEqual(['\\providecommand{\\ADA}[1]{{\\color{magenta}(ADA) #1}}', '\\ifcsname theorem\\endcsname\\else \\newtheorem{theorem}{Theorem} \\fi'])
    // 이미 본문만 있으면 할 일이 없다
    expect(needsBodyOnly(r.text)).toBe(false)
    expect(toBodyOnly(r.text).text).toBe(r.text)
    expect(headDefinitions(r.text)).toEqual([])
  })
})

describe('뗀 머리에 맞는 서식 고르기', () => {
  it('revtex4-2 + prb는 PRB, article은 article, 모르는 문서 종류는 없음', async () => {
    const { BUILTIN_TEMPLATES } = await import('@rw/core')
    const { guessTemplate } = await import('./noteCopy.js')
    expect(guessTemplate('\\documentclass[aps,english,prb,twocolumn]{revtex4-2}\n', BUILTIN_TEMPLATES)).toBe('prb')
    expect(guessTemplate('\\documentclass[11pt]{article}\n', BUILTIN_TEMPLATES)).toBe('article')
    expect(guessTemplate('\\documentclass{mypaper}\n', BUILTIN_TEMPLATES)).toBeUndefined()
  })
})
