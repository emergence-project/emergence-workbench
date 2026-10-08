import type { NoteHighlight } from './api'
import type { RecordSelection } from './RecordContext'
import { findRecordRange, renderedRangeFromSource, selectionAnchor, sourceRangeFromRendered } from './recordAnchors'
import { t } from './i18n'

/** A text-node span, or a whole rendered formula (node = the .katex element) that stands for its TeX source. */
interface TextPoint { node: Text | Element; from: number; to: number }
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'PRE', 'BLOCKQUOTE', 'TR', 'TD', 'TH', 'FIGCAPTION'])

/** Visible text plus text-node offsets; block boundaries and <br> share source newline whitespace. */
function visibleText(root: HTMLElement): { text: string; points: (TextPoint | null)[] } {
  const chars: string[] = [], points: (TextPoint | null)[] = []
  const append = (char: string, point: TextPoint | null) => {
    const c = /\s/.test(char) ? ' ' : char
    if (c === ' ' && chars[chars.length - 1] === ' ') return
    chars.push(c); points.push(point)
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      for (let i = 0; i < text.length; i++) append(text.data[i]!, { node: text, from: i, to: i + 1 })
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.matches('.katex-mathml, .md-eqno, script, style, [hidden]')) return
    // A formula reads as its TeX source between $ marks, as in the note source, so a selection
    // that starts or ends inside rendered math still maps to the source (10/7 12:12).
    const tex = node.matches('.katex') ? node.querySelector('.katex-mathml annotation')?.textContent : null
    if (tex) {
      const mark = node.closest('.katex-display') ? '$$' : '$'
      for (const char of mark + tex + mark) append(char, { node, from: 0, to: node.childNodes.length })
      return
    }
    if (node.tagName === 'BR') { append(' ', null); return }
    const block = BLOCKS.has(node.tagName)
    if (block) append(' ', null)
    node.childNodes.forEach(walk)
    if (block) append(' ', null)
  }
  root.childNodes.forEach(walk)
  return { text: chars.join(''), points }
}

/** Read mode/split preview selection. Quotes always come from source, never HTML textContent. */
export function readRecordSelection(root: HTMLElement, selection: Selection, source: string, contentOffset = 0): RecordSelection | null {
  if (!selection.rangeCount || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const visible = visibleText(root)
  let from = -1, to = -1
  visible.points.forEach((point, index) => {
    if (!point) return
    // Any touched formula is taken whole; text characters must lie inside the selection.
    if (point.node instanceof Text ? range.comparePoint(point.node, point.from) !== 0 || range.comparePoint(point.node, point.to) !== 0 : !range.intersectsNode(point.node)) return
    if (from < 0) from = index
    to = index + 1
  })
  if (from < 0) return null
  const raw = sourceRangeFromRendered(source, visible.text, { from, to }, contentOffset)
  const anchor = raw && selectionAnchor(source, raw.from, raw.to)
  if (!anchor) return null
  const rect = range.getBoundingClientRect()
  return { ...anchor, x: rect.left, y: rect.bottom }
}

/** Add only DOM decorations, preserving the source text and every existing inline element. */
export function paintRecordMarks(root: HTMLElement, source: string, contentOffset: number, highlights: NoteHighlight[]): () => void {
  const marks: HTMLElement[] = []
  for (const highlight of highlights) {
    if (highlight.page || highlight.lost) continue
    const raw = findRecordRange(source, highlight)
    if (!raw) continue
    const visible = visibleText(root)
    const range = renderedRangeFromSource(source, raw, visible.text, contentOffset)
    if (!range) continue
    const nodes = new Map<Text | Element, { from: number; to: number }>()
    for (const point of visible.points.slice(range.from, range.to)) {
      if (!point) continue
      const prev = nodes.get(point.node)
      nodes.set(point.node, { from: Math.min(prev?.from ?? point.from, point.from), to: Math.max(prev?.to ?? point.to, point.to) })
    }
    for (const [node, part] of nodes) {
      // A formula is wrapped whole; a text node is split to the highlighted part.
      let selected: Node = node
      if (node instanceof Text) {
        if (part.to < node.length) node.splitText(part.to)
        selected = part.from ? node.splitText(part.from) : node
      }
      const mark = document.createElement('mark')
      mark.className = 'record-highlight'
      mark.dataset.recordId = highlight.id
      mark.style.backgroundColor = `var(--paint-${highlight.color})`
      mark.style.color = 'inherit'
      mark.setAttribute('role', 'button')
      mark.setAttribute('aria-label', t('하이라이트 메뉴', 'Highlight menu'))
      mark.tabIndex = 0
      ;(selected as ChildNode).replaceWith(mark)
      mark.append(selected)
      marks.push(mark)
    }
  }
  return () => {
    for (const mark of marks.reverse()) if (mark.parentNode) mark.replaceWith(...mark.childNodes)
    root.normalize()
  }
}
