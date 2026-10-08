import { insertNewlineContinueMarkup, markdown } from '@codemirror/lang-markdown'
import { EditorState, type StateCommand } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { indentListItem, outdentListItem } from './conceptLists'

function run(command: StateCommand, doc: string, anchor = doc.length, head = anchor) {
  let state = EditorState.create({ doc, selection: { anchor, head }, extensions: [markdown()] })
  const handled = command({ state, dispatch: (transaction) => { state = transaction.state } })
  return { handled, doc: state.doc.toString() }
}

describe('Markdown list indentation', () => {
  it('indents and outdents a bullet item without changing its text', () => {
    const doc = '- Parent\n- Child'
    const indented = run(indentListItem, doc)
    expect(indented).toEqual({ handled: true, doc: '- Parent\n  - Child' })
    expect(run(outdentListItem, indented.doc)).toEqual({ handled: true, doc })
  })

  it('also handles an empty nested item and ordered list items', () => {
    expect(run(indentListItem, '- Parent\n  - ')).toEqual({ handled: true, doc: '- Parent\n    - ' })
    expect(run(indentListItem, 'Text\n- ')).toEqual({ handled: true, doc: 'Text\n  - ' })
    expect(run(indentListItem, '1. Parent\n2. Child')).toEqual({ handled: true, doc: '1. Parent\n  2. Child' })
  })

  it('indents selected list lines, excluding a selection ending at the next line start', () => {
    const doc = '- Parent\n- First\n- Second\n\nText'
    expect(run(indentListItem, doc, 9, 26)).toEqual({ handled: true, doc: '- Parent\n  - First\n  - Second\n\nText' })
  })

  it.each(['Plain paragraph', '````\n- Code\n````', '    - Code', '- List\n\nParagraph'])('leaves Tab and Shift-Tab free outside list lines: %s', (doc) => {
    const pos = doc.includes('Code') ? doc.indexOf('Code') + 4 : doc.length
    expect(run(indentListItem, doc, pos)).toEqual({ handled: false, doc })
    expect(run(outdentListItem, doc, pos)).toEqual({ handled: false, doc })
  })

  it('does not capture a selection that includes a paragraph', () => {
    const doc = '- List\n\nParagraph'
    expect(run(indentListItem, doc, 0, doc.length)).toEqual({ handled: false, doc })
  })

  it('keeps the Markdown Enter command continuing nested bullet items', () => {
    expect(run(insertNewlineContinueMarkup, '- Parent\n  - Child'))
      .toEqual({ handled: true, doc: '- Parent\n  - Child\n  - ' })
    expect(run(insertNewlineContinueMarkup, '- Parent\n  - Child\n    - Grandchild'))
      .toEqual({ handled: true, doc: '- Parent\n  - Child\n    - Grandchild\n    - ' })
  })
})
