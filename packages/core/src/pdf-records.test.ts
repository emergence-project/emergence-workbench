import { describe, expect, it } from 'vitest'
import { markdownToLatex } from './md-latex.js'
import { markRecords, resolveRecordMarks, type RecordMark } from './pdf-records.js'

const mark = (quote: string | undefined, extra: Partial<RecordMark> = {}): RecordMark => ({ kind: '메모', quote, title: '메모 · 사용자 · 10/14', text: '확인할 것', ...extra })
const md = (src: string, marks: RecordMark[], highlight = true) => {
  const { text, loose } = markRecords(src, marks)
  return resolveRecordMarks(markdownToLatex(text), marks, loose, { highlight })
}
const hex = (s: string) => `<FEFF${[...s].map((c) => c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join('')}>`

describe('pdf records', () => {
  it('wraps plain text in a highlight annotation whose contents is the record', () => {
    const out = md('We expand the Hamiltonian. The matrix is diagonal here.\n', [mark('The matrix is diagonal')])
    expect(out).toContain(`\\special{pdf:bann << /Subtype /Highlight /C [1 0.85 0.2] /T ${hex('메모 · 사용자')} /Contents ${hex('메모 · 사용자 · 10/14\n\n확인할 것')} /F 4 >>}The matrix is diagonal\\special{pdf:eann}`)
    expect(out).not.toMatch(/[\uE000-\uE003]/)
  })

  it('highlights across inline math, and puts a note in place without highlighting (not XeLaTeX)', () => {
    expect(md('At each $k$ we get two branches.\n', [mark('each $k$ we')])).toContain('pdf:bann')
    const out = md('We expand the Hamiltonian.\n', [mark('Hamiltonian')], false)
    expect(out).not.toContain('pdf:bann')
    expect(out).toContain('We expand the \\pdfcomment[icon=Note,color={1 0.85 0.2},author={메모 · 사용자}]{메모 · 사용자 · 10/14\\textCR\\textCR 확인할 것}Hamiltonian.')
  })

  it('places a note before the block when the quote is inside display math or a heading', () => {
    const out = md('Intro.\n\n## Spin waves\n\nText.\n\n$$\nE = mc^2\n$$\n', [mark('Spin waves'), mark('mc^2')])
    expect(out).not.toMatch(/\\subsection\{[^}]*pdfcomment/)
    expect(out).not.toMatch(/\\\[[^\]]*pdfcomment/)
    expect(out.match(/\\pdfcomment\[/g)).toHaveLength(2)
  })

  it('collects records without a quote or not found into one note at the top', () => {
    const out = md('Body.\n', [mark(undefined, { text: '전체 메모' }), mark('missing text', { kind: '질문', title: '질문 · claude · 10/15', text: '왜?' })])
    expect(out.startsWith('\\pdfcomment[icon=Note')).toBe(true)
    expect(out).toContain('전체 메모')
    expect(out).toContain('왜?')
  })

  it('escapes LaTeX characters in the note', () => {
    const out = md('Some text here.\n', [mark('text', { text: '50% & $x_1$ {a}' })], false)
    expect(out).toContain('50\\% \\& \\$x\\_1\\$ \\{a\\}')
  })

  it('keeps overlapping records as a note only for the later one', () => {
    const out = md('alpha beta gamma delta\n', [mark('alpha beta gamma'), mark('beta gamma delta')])
    expect(out.match(/pdf:bann/g)).toHaveLength(1)
    expect(out).toContain('\\pdfcomment[icon=Note')
  })

  it('keeps both notes whole when one record starts the paragraph and another sits in its math', () => {
    for (const highlight of [false, true]) {
      const out = md('Intro.\n\nSome text and $x^2$ here.\n', [mark('Some text', { text: 'A' }), mark('x^2', { text: 'B' })], highlight)
      expect(out).not.toMatch(/[\uE000-\uE003]/)
      expect(out).not.toMatch(/}fcomment/)
      expect(out).toContain('Some text')
      expect(out.match(/\\pdfcomment\[/g)!.length + (out.match(/pdf:bann/g)?.length ?? 0)).toBe(2)
    }
  })

  it('places the top note after \\begin{document} in a LaTeX note', () => {
    const tex = '\\begin{document}\nHello world.\n\\end{document}\n'
    const marks = [mark(undefined), mark('world')]
    const { text, loose } = markRecords(tex, marks)
    const out = resolveRecordMarks(text, marks, loose, { highlight: true })
    expect(out).toMatch(/^\\begin\{document\}\n\\pdfcomment/)
    expect(out).toContain('Hello \\special{pdf:bann')
  })
})
