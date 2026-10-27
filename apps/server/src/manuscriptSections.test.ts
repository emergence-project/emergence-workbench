import { describe, expect, it } from 'vitest'
import { sectionsOf } from './manuscript.js'

const PAPER = [
  '\\documentclass{revtex4-2}',
  '\\begin{document}',
  '\\section{Introduction}',
  'text % \\section{Commented out}',
  '\\section{Main Result}\\label{Sec: Main}',
  '\\section{Numerical calculation}',
  '\\label{Sec: Numerics}',
  '\\section*{Acknowledgement}',
  '\\appendix',
  '\\section{Additional Numerical Calculations for \\texorpdfstring{$K_5$}{TEXT}-minor Graphs}\\label{Appx: pi}',
  '\\end{document}',
].join('\n')

describe('한 파일 원고의 절', () => {
  it('\\section마다 한 장으로 보고, 줄·라벨·부록을 읽는다 (\\section*와 주석은 뺀다)', () => {
    expect(sectionsOf(PAPER, 'PRB.tex')).toEqual([
      { id: 'PRB.tex#Introduction', file: 'PRB.tex', title: 'Introduction', appendix: false, line: 3 },
      { id: 'PRB.tex#Sec: Main', file: 'PRB.tex', title: 'Main Result', appendix: false, line: 5 },
      { id: 'PRB.tex#Sec: Numerics', file: 'PRB.tex', title: 'Numerical calculation', appendix: false, line: 6 },
      { id: 'PRB.tex#Appx: pi', file: 'PRB.tex', title: 'Additional Numerical Calculations for $K_5$-minor Graphs', appendix: true, line: 10 },
    ])
  })

})
