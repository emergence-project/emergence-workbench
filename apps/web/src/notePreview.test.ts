import { describe, expect, it } from 'vitest'
import { numberNote, type NoteNumberDetails } from './noteNumbers'
import { notePreview } from './notePreview'

const equation = (body: string) => `$$\n\\begin{equation}\n${body}\n\\end{equation}\n$$`
const tags = (tex: string) => [...tex.matchAll(/\\tag\{([^{}]+)\}/g)].map((m) => m[1])

describe('노트 미리보기 번호와 원문 자리', () => {
  it('uses document-wide equation numbers and resolves forward references inside and outside math', () => {
    const source = [
      String.raw`먼저 \eqref{eq:second}, \ref{eq:first}, $\eqref{eq:second}$, \ref{missing}.`,
      equation(String.raw`a=1 \label{eq:first}`),
      equation(String.raw`b=\ref{eq:first} \label{eq:second}`),
    ].join('\n\n')
    const preview = notePreview(source)
    expect(preview.math.map((m) => m.tex)).toEqual([
      String.raw`\text{(2)}`,
      '\\begin{equation*}\na=1 \\tag{1}\n\\end{equation*}',
      '\\begin{equation*}\nb=\\text{1} \\tag{2}\n\\end{equation*}',
    ])
    expect(preview.references.map((r) => r.label)).toEqual(['(2)', '1', '??'])
    expect(preview.math.every((m) => !m.tex.includes('\\label'))).toBe(true)
    for (const m of preview.math.filter((m) => m.block)) expect(numberNote(source).text).toContain(m.tex)
  })

  it('keeps align row, nonumber, starred and subequations numbering identical to reading', () => {
    const source = [
      equation(String.raw`a=1 \label{first}`),
      String.raw`$$
\begin{align}
a&=b \label{row:a} \\
c&=d \nonumber \\
e&=f \label{row:b}
\end{align}
$$`,
      String.raw`$$\begin{equation*}x=0 \label{star}\end{equation*}$$`,
      String.raw`$$
\begin{subequations}\label{group}
\begin{align}
x&=y \label{sub:a} \\
y&=z \label{sub:b}
\end{align}
\end{subequations}
$$`,
      equation(String.raw`z=5 \label{last}`),
      String.raw`\ref{first}, \ref{row:a}, \ref{row:b}, \ref{star}, \ref{group}, \eqref{sub:b}, \ref{last}`,
    ].join('\n\n')
    const preview = notePreview(source)
    expect(preview.math.map((m) => tags(m.tex))).toEqual([['1'], ['2', '3'], [], ['4a', '4b'], ['5']])
    expect(preview.references.map((r) => r.label)).toEqual(['1', '2', '3', '??', '4', '(4b)', '5'])
    for (const m of preview.math) expect(numberNote(source).text).toContain(m.tex)
  })

  it('maps through CRLF, whole comment lines and comments within equations without changing source bytes', () => {
    const source = [
      '<!-- hidden\n' + equation('hidden=0') + '\n-->',
      '앞 <!-- inline --> 글',
      '  $$\\begin{equation}a=1 <!-- \\label{hidden} --> \\label{a}\\end{equation}$$  ',
      equation(String.raw`b=2 \label{b}`),
      String.raw`\eqref{b}`,
    ].join('\n\n').replace(/\n/g, '\r\n')
    const originalBytes = new TextEncoder().encode(source)
    const preview = notePreview(source)
    expect(preview.math.map((m) => tags(m.tex))).toEqual([['1'], ['2']])
    expect(preview.math.map((m) => source.slice(m.from, m.to))).toEqual([
      '$$\\begin{equation}a=1 <!-- \\label{hidden} --> \\label{a}\\end{equation}$$',
      equation(String.raw`b=2 \label{b}`).replace(/\n/g, '\r\n'),
    ])
    expect(preview.references[0]?.label).toBe('(2)')
    expect(preview.comments).toHaveLength(3)
    expect(new TextEncoder().encode(source)).toEqual(originalBytes)
  })

  it('does not count commented or fenced equations and does not decorate code examples', () => {
    const fenced = '```tex\n' + equation(String.raw`fake=1 \label{fake}`) + '\n```'
    const inline = String.raw`\ref{fake} $raw$`
    const source = ['<!-- ' + equation('hidden=0') + ' -->', fenced, '`' + inline + '`', equation(String.raw`real=1 \label{real}`), String.raw`\eqref{real}`].join('\n\n')
    const code: [number, number][] = [
      [source.indexOf(fenced), source.indexOf(fenced) + fenced.length],
      [source.indexOf('`' + inline), source.indexOf('`' + inline) + inline.length + 2],
    ]
    const preview = notePreview(source, code)
    expect(preview.math.map((m) => tags(m.tex))).toEqual([['1']])
    expect(preview.references.map((r) => r.label)).toEqual(['(1)'])
    expect(preview.labels).toEqual([])
  })

  it('removes inline math labels and resolves heading, figure and table references', () => {
    const source = [
      String.raw`## 시작 \label{sec}`, '',
      String.raw`$x_i\label{inline}$`, '',
      String.raw`![식 \eqref{eq} \label{fig}](parts.svg)`, '',
      String.raw`**표.** 자료 \label{tab}`, '',
      equation(String.raw`x=1 \label{eq}`), '',
      String.raw`\ref{sec}, \ref{fig}, \ref{tab}, \ref{inline}`,
    ].join('\n')
    const preview = notePreview(source)
    expect(preview.math[0]?.tex).toBe('x_i')
    expect(preview.references.map((r) => r.label)).toEqual(['1', '1', '1', '??'])
    expect(preview.figures).toEqual([{ from: source.indexOf('!['), to: source.indexOf('parts.svg)') + 'parts.svg)'.length, n: '1', file: 'parts.svg', caption: '식 (1)' }])
    expect(preview.labels.map((r) => source.slice(r.from, r.to))).toEqual([String.raw`\label{sec}`, String.raw`\label{tab}`])
  })

  it('renders footnote markers with nested brackets and math in the same order as reading', () => {
    const source = ['첫째^[구간 $[0,1]$과 [글](https://example.test)]', equation(String.raw`x=1 \label{x}`), String.raw`둘째^[식 \eqref{x}, <!-- ] --> 뒤]`].join('\n\n')
    const preview = notePreview(source)
    expect(preview.footnotes.map(({ n, content }) => ({ n, content }))).toEqual([
      { n: 1, content: '구간 $[0,1]$과 [글](https://example.test)' },
      { n: 2, content: '식 (1),  뒤' },
    ])
    for (const note of preview.footnotes) expect(source.slice(note.from, note.to)).toMatch(/^\^\[[\s\S]*\]$/)
    expect(preview.references).toEqual([])
  })

  it('keeps unnumbered inline images as compact figure candidates', () => {
    const source = '문장 ![도해](parts.svg) 뒤'
    expect(notePreview(source).figures).toEqual([{ from: 3, to: 19, n: '', file: 'parts.svg', caption: '도해' }])
  })

  it('removes comments inside inline math rather than replacing their content with spaces', () => {
    const source = String.raw`$\text{a<!-- hidden $ and $$ -->b}$`
    expect(notePreview(source).math.map((m) => m.tex)).toEqual([String.raw`\text{ab}`])
  })

  it('collecting preview metadata preserves the existing reading result', () => {
    const source = ['<!-- comment -->', String.raw`## 제목 \label{sec}`, equation(String.raw`a=1 \label{a}`), String.raw`![식 \eqref{a} \label{fig}](figure.pdf)`, String.raw`글^[각주 \ref{sec}]`].join('\n\n')
    const details: NoteNumberDetails = { displays: [], figures: [], labels: new Map() }
    expect(numberNote(source, details)).toEqual(numberNote(source))
    expect(details.displays).toHaveLength(1)
    expect(details.figures[0]?.figure.caption).toBe('식 (1)')
  })
})
