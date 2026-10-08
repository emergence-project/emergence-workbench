import { describe, expect, it } from 'vitest'
import { numberDisplay, numberNote, splitRows } from './noteNumbers'

describe('Markdown 노트의 번호와 참조', () => {
  it.each(['1. Introduction', '1) Introduction', '2.3 Details', '2.3. Details', '2.3) Details', 'A. Appendix', 'a) Appendix', '1.'])('does not duplicate a heading number in "%s"', (title) => {
    expect(numberNote(`## ${title}`).text).toBe(`## ${title}`)
  })
  it.each(['Introduction', '3D geometry', 'A theory', 'A.B testing', '2.3D model'])('still numbers an unnumbered heading "%s"', (title) => {
    expect(numberNote(`## ${title}`).text).toBe(`## 1 ${title}`)
  })
  it('keeps counters and references through manually numbered headings and appendices', () => {
    const r = numberNote([
      '## 1. Introduction \\label{sec:intro}',
      '### Scope \\label{sec:scope}',
      '## 2) Methods \\label{sec:methods}',
      '### 2.1 Setup \\label{sec:setup}',
      '### Results \\label{sec:results}',
      '## Discussion \\label{sec:discussion}',
      '\\appendix',
      '## A. Proof \\label{app:proof}',
      '### Details \\label{app:details}',
      '## Data \\label{app:data}',
      '\\ref{sec:intro}, \\ref{sec:scope}, \\ref{sec:methods}, \\ref{sec:setup}, \\ref{sec:results}, \\ref{sec:discussion}, \\ref{app:proof}, \\ref{app:details}, \\ref{app:data}',
    ].join('\n'))
    expect(r.text).toBe([
      '## 1. Introduction',
      '### 1.1 Scope',
      '## 2) Methods',
      '### 2.1 Setup',
      '### 2.2 Results',
      '## 3 Discussion',
      '## A. Proof',
      '### A.1 Details',
      '## B Data',
      '1, 1.1, 2, 2.1, 2.2, 3, A, A.1, B',
    ].join('\n'))
  })
  it('맨 바깥 \\\\ 에서만 줄을 나눈다', () => {
    expect(splitRows('a &= b \\\\ c &= \\begin{matrix} 1 \\\\ 2 \\end{matrix} \\\\ {x \\\\ y}')).toEqual(['a &= b ', ' c &= \\begin{matrix} 1 \\\\ 2 \\end{matrix} ', ' {x \\\\ y}'])
  })
  it('equation·align·eqnarray에 \\tag, \\nonumber와 % 메모는 번호 없음', () => {
    const labels = new Map<string, string>()
    let n = 0
    expect(numberDisplay('\\begin{equation}\na = b \\label{eq: a}\n\\end{equation}', () => ++n, labels)).toBe('\\begin{equation*}\na = b \\tag{1}\n\\end{equation*}')
    expect(numberDisplay('\\begin{eqnarray}\na &=& b \\nonumber \\\\\nc &=& d %\\nonumber \\\\ e\n\\label{eq: c}\n\\end{eqnarray}', () => ++n, labels))
      .toBe('\\begin{align*}\na &=& b  \\\\\nc &=& d \\tag{2}\n\\end{align*}')
    expect(numberDisplay('\\begin{align*}\na &= b \\label{eq: x}\n\\end{align*}', () => ++n, labels)).toBe('\\begin{align*}\na &= b \n\\end{align*}')
    expect(Object.fromEntries(labels)).toEqual({ 'eq: a': '1', 'eq: c': '2' })
  })
  it('subequations는 3a, 3b, 바깥 \\label은 3', () => {
    const labels = new Map<string, string>()
    let n = 2
    const out = numberDisplay('\\begin{subequations}\n\\begin{align}\na &= 0 \\label{eq: A0} \\\\\nb &= 0 \\label{eq: A1}\n\\end{align}\n\\label{eq: axioms}\n\\end{subequations}', () => ++n, labels)
    expect(out).toContain('\\tag{3a}')
    expect(out).toContain('\\tag{3b}')
    expect(Object.fromEntries(labels)).toEqual({ 'eq: axioms': '3', 'eq: A0': '3a', 'eq: A1': '3b' })
  })
  it('절·그림·표·식 번호와 \\ref·\\eqref, \\appendix 뒤는 A', () => {
    const r = numberNote([
      '## 시작 \\label{sec: a}', '', '식 \\eqref{eq: x}, 그림 \\ref{fig: 1}, 표 \\ref{tab: t}, 부록 \\ref{app: b}, 없는 \\ref{nope}.', '',
      '$$', '\\begin{equation}', 'x = 1 \\label{eq: x}', '\\end{equation}', '$$', '',
      '![캡션 $a$ (식 \\eqref{eq: x}) \\label{fig: 1}](Figure_1.pdf)', '',
      '**표.** 기호 \\label{tab: t}', '', '<!-- 숨김 -->', '### 아래', '', '\\appendix', '', '## 증명 \\label{app: b}', '', '끝^[각주 $[0,1]$ 글.]',
    ].join('\n'))
    expect(r.text).toContain('## 1 시작')
    expect(r.text).toContain('식 (1), 그림 1, 표 1, 부록 A, 없는 ??.')
    expect(r.text).toContain('**표 1.** 기호')
    expect(r.text).toContain('### 1.1 아래')
    expect(r.text).toContain('## A 증명')
    expect(r.text).toContain('끝\u0003N0\u0003')
    expect(r.text).not.toContain('숨김')
    expect(r.figures).toEqual([{ n: '1', file: 'Figure_1.pdf', caption: '캡션 $a$ (식 $\\text{(1)}$)'.replace('$\\text{(1)}$', '(1)') }])
    expect(r.footnotes).toEqual(['각주 $[0,1]$ 글.'])
  })
})
