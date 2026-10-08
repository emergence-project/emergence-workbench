import { indentLess, indentMore } from '@codemirror/commands'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState, StateCommand } from '@codemirror/state'

const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/

/** Tab only edits list lines; elsewhere the browser can move focus normally. */
function selectionInList(state: EditorState): boolean {
  const end = Math.max(...state.selection.ranges.map((range) => range.to))
  const tree = ensureSyntaxTree(state, end, 100) ?? syntaxTree(state)
  return state.selection.ranges.every(({ from, to }) => {
    // An end at the next line's start does not select that line (same as indentMore).
    const last = state.doc.lineAt(to > from ? to - 1 : to).number
    for (let number = state.doc.lineAt(from).number; number <= last; number++) {
      const line = state.doc.line(number)
      const start = line.from + line.text.search(/\S|$/)
      let inList = false
      for (let node = tree.resolveInner(start, 1); node.parent; node = node.parent) {
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false
        if (node.name === 'ListItem') { inList = true; break }
      }
      // 문단 바로 아래의 빈 "- "는 Markdown에서 아직 목록이 아니지만, 쓰는 사람에게는 목록 줄이다 (10/8 11:55)
      if (!inList && !LIST_LINE.test(line.text)) return false
    }
    return true
  })
}

export const indentListItem: StateCommand = (target) => selectionInList(target.state) && indentMore(target)
export const outdentListItem: StateCommand = (target) => selectionInList(target.state) && indentLess(target)
