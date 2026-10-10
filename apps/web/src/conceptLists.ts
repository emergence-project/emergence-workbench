import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState, StateCommand } from '@codemirror/state'
import { listKey } from '@rw/core'

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

/**
 * 목록 줄의 Tab · Shift+Tab · Enter는 피드백 · 코멘트 입력란과 같은 규칙(@rw/core listKey)으로 고친다 (10/9 11:21
 * "문서 편집과 코멘트 다는 설정을 따로 두지 말고 하나로"). 여기서는 코드 블록을 빼는 판정만 더한다.
 */
const listCommand = (key: 'Enter' | 'Tab', shift = false): StateCommand => ({ state, dispatch }) => {
  if (state.selection.ranges.length !== 1 || !selectionInList(state)) return false
  const { from, to } = state.selection.main
  const before = state.doc.toString()
  const r = listKey(before, from, to, key, shift)
  if (!r) return false
  // 바뀐 곳만 바꾼다 (되돌리기 · 다른 표시가 문서 전체를 다시 그리지 않게)
  let a = 0
  while (a < before.length && a < r.value.length && before[a] === r.value[a]) a++
  let b = 0
  while (b < before.length - a && b < r.value.length - a && before[before.length - 1 - b] === r.value[r.value.length - 1 - b]) b++
  dispatch(state.update({ changes: { from: a, to: before.length - b, insert: r.value.slice(a, r.value.length - b) }, selection: { anchor: r.start, head: r.end }, scrollIntoView: true, userEvent: 'input' }))
  return true
}

export const indentListItem = listCommand('Tab')
export const outdentListItem = listCommand('Tab', true)
export const continueListItem = listCommand('Enter')
