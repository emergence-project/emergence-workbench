import type { CommentEntry, NoteHighlight } from './api'
import { findRecordRange, selectionAnchor, type RecordAnchor, type RecordRange } from './recordAnchors'

/** The LaTeX editor exposes source line numbers with its selection text. */
export function recordSelectionFromLines(source: string, selection: { from: number; start?: number; text: string } | null): RecordAnchor | undefined {
  if (!selection?.text.trim()) return undefined
  // CodeMirror stores line endings as LF; records use normalized anchors as well.
  const normalized = source.replace(/\r\n?/g, '\n')
  if (selection.start !== undefined) {
    if (normalized.slice(selection.start, selection.start + selection.text.length) !== selection.text) return undefined
    return selectionAnchor(normalized, selection.start, selection.start + selection.text.length) ?? undefined
  }
  const lineStart = normalized.split('\n').slice(0, selection.from - 1).reduce((offset, line) => offset + line.length + 1, 0)
  const start = normalized.indexOf(selection.text, lineStart)
  if (start < 0 || normalized.slice(lineStart, start).includes('\n')) return undefined
  return selectionAnchor(normalized, start, start + selection.text.length) ?? undefined
}

/** Prefer the exact quote; an old unquoted anchor still reveals its current source line. */
export function recordRevealRange(source: string, anchor: { quote?: string; line?: number; prefix?: string; suffix?: string; lost?: true }): RecordRange | null {
  if (anchor.lost) return null
  if (anchor.quote) return findRecordRange(source, anchor)
  if (!anchor.line || anchor.line < 1) return null
  const lines = source.split('\n')
  if (anchor.line > lines.length) return null
  const from = lines.slice(0, anchor.line - 1).reduce((offset, line) => offset + line.length + 1, 0)
  return { from, to: from + lines[anchor.line - 1]!.replace(/\r$/, '').length }
}

/** Quoted records paint their anchor without becoming highlight records in the list. */
export function quotedRecordHighlights(comments: CommentEntry[]): NoteHighlight[] {
  return comments.flatMap((comment) => comment.quote && comment.color ? [{
    id: comment.id, rects: comment.rects, color: comment.color, page: comment.page,
    quote: comment.quote, line: comment.line, prefix: comment.prefix, suffix: comment.suffix,
    lost: comment.lost,
  }] : [])
}
