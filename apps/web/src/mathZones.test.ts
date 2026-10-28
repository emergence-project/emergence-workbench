import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { findMathZones, mathZones } from './mathZones'

function marks(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown(), mathZones()] })
  const out: string[] = []
  for (const decorations of state.facet(EditorView.decorations)) {
    if (typeof decorations === 'function') continue
    decorations.between(0, doc.length, (from, to, d) => { out.push(`${d.spec.class}:${doc.slice(from, to)}`) })
  }
  return out
}

describe('math zones in the note editor (10/28 21:39)', () => {
  it('finds the four delimiter kinds with their ranges', () => {
    const text = 'a $x$ b \\(y\\) c\n$$\nE = mc^2\n$$\nd \\[z\\] e'
    expect(findMathZones(text).map((z) => [z.kind, text.slice(z.from, z.to)])).toEqual([
      ['dollar', '$x$'], ['paren', '\\(y\\)'], ['display', '$$\nE = mc^2\n$$'], ['bracket', '\\[z\\]'],
    ])
  })

  it('colours only the delimiters and puts the background on the whole math', () => {
    expect(marks('a \\[x\\] b')).toEqual(['cm-math-zone:\\[x\\]', 'cm-math-delim cm-math-bracket:\\[', 'cm-math-delim cm-math-bracket:\\]'])
    expect(marks('$$x$$')).toEqual(['cm-math-zone:$$x$$', 'cm-math-delim cm-math-display:$$', 'cm-math-delim cm-math-display:$$'])
  })

  it('flags unclosed block and paren openers but not a lone dollar sign', () => {
    expect(marks('a $$ x')).toEqual(['cm-math-delim cm-math-unclosed:$$'])
    expect(marks('a \\( x')).toEqual(['cm-math-delim cm-math-unclosed:\\('])
    expect(marks('costs $5 and $ 6')).toEqual([])
  })

  it('skips escaped dollars, double backslashes and code', () => {
    expect(findMathZones('price \\$5 and \\$6')).toEqual([])
    expect(findMathZones('a \\\\[1em] b')).toEqual([])
    expect(marks('`$x$` and $y$')).toEqual(['cm-math-zone:$y$', 'cm-math-delim cm-math-dollar:$', 'cm-math-delim cm-math-dollar:$'])
  })

  it('does not look for delimiters inside math', () => {
    expect(findMathZones('$$ a \\( b $$').map((z) => z.kind)).toEqual(['display'])
  })
})
