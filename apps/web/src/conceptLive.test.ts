import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { livePreview, notePreviewFacet, overlapsMath } from './conceptLive'
import { findMath } from './conceptLiveParse'

function bulletLabels(doc: string, anchor = doc.length) {
  const state = EditorState.create({ doc, selection: { anchor }, extensions: [markdown(), livePreview()] })
  const labels: string[] = []
  for (const decorations of state.facet(EditorView.decorations)) {
    if (typeof decorations === 'function') continue
    decorations.between(0, doc.length, (_from, _to, decoration) => {
      if (decoration.spec.widget?.cls === 'cm-bullet') labels.push(decoration.spec.widget.label)
    })
  }
  expect(state.doc.toString()).toBe(doc)
  return labels
}

describe('Markdown list preview', () => {
  it('uses filled, open and square bullets for nested unordered lists', () => {
    expect(bulletLabels('- First\n  - Second\n    - Third\n      - Fourth\n\nEnd'))
      .toEqual(['•', '◦', '▪', '▪'])
  })

  it('counts bullet ancestors only and leaves ordered markers alone', () => {
    expect(bulletLabels('1. Ordered\n   - First\n     1. Ordered child\n        - Second\n\nEnd'))
      .toEqual(['•', '◦'])
  })

  it('widens the indent of nested items, also on the active line (10/8 11:55)', () => {
    for (const anchor of [0, 13]) {
      const doc = '- First\n  - Second'
      const state = EditorState.create({ doc, selection: { anchor }, extensions: [markdown(), livePreview()] })
      const marks: [number, number][] = []
      for (const decorations of state.facet(EditorView.decorations)) {
        if (typeof decorations === 'function') continue
        decorations.between(0, doc.length, (from, to, decoration) => { if (decoration.spec.class === 'cm-list-indent') marks.push([from, to]) })
      }
      expect(marks).toEqual([[8, 10]])
    }
  })

  it('keeps active list lines as source and does not turn code into bullets', () => {
    expect(bulletLabels('- First\n  - Active', 18)).toEqual(['•'])
    expect(bulletLabels('```\n- Code\n```\n\nEnd')).toEqual([])
  })
})

function previewDecorations(doc: string, note = false, anchor = doc.length) {
  const state = EditorState.create({ doc, selection: { anchor }, extensions: [markdown(), livePreview(), notePreviewFacet.of(note ? { options: {}, asset: (name) => `/assets/${name}` } : undefined)] })
  const result: { from: number; to: number; cls?: string; widget?: { tex?: string; html?: string; cls?: string } }[] = []
  for (const decorations of state.facet(EditorView.decorations)) {
    if (typeof decorations === 'function') continue
    decorations.between(0, doc.length, (from, to, decoration) => { result.push({ from, to, cls: decoration.spec.class, widget: decoration.spec.widget }) })
  }
  expect(state.doc.toString()).toBe(doc)
  return result
}

describe('math and emphasis preview', () => {
  it('detects emphasis that begins, ends, or encloses math, but not adjacent text', () => {
    const math = findMath('$a_b$ text $c_d$')
    expect(overlapsMath(2, 13, math)).toBe(true)
    expect(overlapsMath(0, 15, math)).toBe(true)
    expect(overlapsMath(5, 10, math)).toBe(false)
  })

  it.each([false, true])('does not italicize text between inline math (note=%s)', (note) => {
    const doc = '$\\chi(G)_\\Sigma \\le 5$이면 본문 $\\mathcal{K}_{a\\to ab}$가 된다.\n\nEnd'
    expect(previewDecorations(doc, note).filter((d) => d.cls === 'cm-emphasis')).toEqual([])
    expect(previewDecorations(doc, note).filter((d) => d.widget?.tex)).toHaveLength(2)
  })

  it('keeps real italic and strong text outside math for concept notes', () => {
    const doc = '$x_y$ *italic* and **strong**\n\n- item\n\nEnd'
    const d = previewDecorations(doc)
    expect(d.filter((x) => x.cls === 'cm-emphasis').map((x) => doc.slice(x.from, x.to))).toEqual(['*italic*'])
    expect(d.filter((x) => x.cls === 'cm-strong').map((x) => doc.slice(x.from, x.to))).toEqual(['**strong**'])
    expect(d.some((x) => x.widget?.cls === 'cm-bullet')).toBe(true)
  })
})

describe('note-only live preview', () => {
  it('numbers the whole document, resolves forward references, and keeps source bytes', () => {
    const doc = String.raw`See \eqref{second} and \ref{first}.

$$\begin{equation}a=1 \label{first}\end{equation}$$

$$\begin{equation}b=2 \label{second}\end{equation}$$

End`
    const d = previewDecorations(doc, true)
    const math = d.flatMap((x) => x.widget?.tex ? [x.widget.tex] : [])
    expect(math[0]).toContain('\\tag{1}')
    expect(math[1]).toContain('\\tag{2}')
    expect(math.join('')).not.toContain('\\label')
    expect(d.flatMap((x) => x.widget?.html ? [x.widget.html] : [])).toEqual(['(2)', '1'])
    // 선택된 식은 원문으로 보여도 다음 식의 번호는 바뀌지 않는다.
    const active = previewDecorations(doc, true, doc.indexOf('a=1'))
    expect(active.filter((x) => x.widget?.tex)[0]?.widget?.tex).toContain('\\tag{2}')
  })

  it('renders citations, footnotes and figures and hides comments without overlapping widgets', () => {
    const doc = '[@later] then [@first; @later].\n\nA^[footnote $x_y$].\n\n<!-- hidden $a_b$ -->\n\n![caption](parts.svg)\n\nEnd'
    const d = previewDecorations(doc, true)
    const html = d.flatMap((x) => x.widget?.html ? [x.widget.html] : []).join('\n')
    expect(html).toContain('class="ob-cite"')
    expect(html).toContain('>[1]</a>')
    expect(html).toContain('>[1, 2]</a>')
    expect(html).toContain('class="md-fn"')
    expect(html).toContain('src="/assets/parts.svg"')
    expect(html).toContain('그림 1.')
    expect(d.some((x) => !x.cls && !x.widget && doc.slice(x.from, x.to).includes('<!--'))).toBe(true)
    expect(d.filter((x) => x.widget?.tex)).toHaveLength(0)
  })

  it('leaves code and the selected math as source', () => {
    const doc = '`[@code] \\ref{no} $x_y$`\n\n$$\\begin{equation}a=1\\end{equation}$$\n\nEnd'
    const d = previewDecorations(doc, true, doc.indexOf('a=1'))
    expect(d.filter((x) => x.widget)).toEqual([])
    expect(d.some((x) => x.cls === 'cm-math-src')).toBe(true)
  })

  it('lets the enclosing math widget hide comments inside the equation', () => {
    const doc = '$$\\begin{equation}a<!-- hidden -->=b\\label{x}\\end{equation}$$\n\nEnd'
    const d = previewDecorations(doc, true)
    expect(d.filter((x) => x.widget?.tex)).toHaveLength(1)
    expect(d.find((x) => x.widget?.tex)?.widget?.tex).toContain('a=b \\tag{1}')
    expect(d.find((x) => x.widget?.tex)?.widget?.tex).not.toContain('hidden')
    expect(d.filter((x) => !x.cls && !x.widget)).toHaveLength(0)
  })

  it('does not opt concept notes into note numbering or citation replacement', () => {
    const doc = '[@key]\n\n$$\\begin{equation}a=1 \\label{eq:a}\\end{equation}$$\n\nEnd'
    const d = previewDecorations(doc)
    expect(d.find((x) => x.widget?.tex)?.widget?.tex).toBe('\\begin{equation}a=1 \\label{eq:a}\\end{equation}')
    expect(d.some((x) => x.cls === 'cm-cite')).toBe(true)
    expect(d.some((x) => x.widget?.html)).toBe(false)
  })
})
