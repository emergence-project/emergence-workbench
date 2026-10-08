import { footnoteEnd, stripHtmlComments } from '@rw/core'
import { findMath, type MathSpan } from './conceptLiveParse'
import { numberNote, resolveNoteRefs, type NoteFigure, type NoteNumberDetails, type NoteSourceSpan } from './noteNumbers'

export interface NotePreview {
  math: MathSpan[]
  references: (NoteSourceSpan & { label: string })[]
  comments: NoteSourceSpan[]
  footnotes: (NoteSourceSpan & { n: number; content: string })[]
  figures: (NoteSourceSpan & NoteFigure)[]
  labels: NoteSourceSpan[]
}

const overlaps = (a: NoteSourceSpan, b: NoteSourceSpan) => a.from < b.to && a.to > b.from
const matches = (src: string, pattern: RegExp): NoteSourceSpan[] => [...src.matchAll(pattern)].map((m) => ({ from: m.index!, to: m.index! + m[0].length }))

/** 원문 자리만 가리키는 노트 미리보기 장식. 읽기의 번호 붙이기를 문서 전체에 한 번 적용한다. */
export function notePreview(src: string, codeRanges: [number, number][] = []): NotePreview {
  const code = codeRanges.map(([from, to]) => ({ from, to }))
  const comments = matches(src, /<!--[\s\S]*?-->/g)
  // 주석 안의 달러·각주 괄호가 바깥 구문을 닫지 않게 하면서 원문 자리는 유지한다.
  const visible = src.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\r\n]/g, ' '))
  const details: NoteNumberDetails = { displays: [], figures: [], labels: new Map() }
  const numbered = numberNote(src, details)
  const displays = new Map(details.displays.map((m) => [m.from, m]))
  const math = findMath(visible, codeRanges).map((m) => {
    const display = m.block ? displays.get(m.from) : undefined
    const delimiter = m.block ? 2 : 1
    const sourceTex = stripHtmlComments(src.slice(m.from + delimiter, m.to - delimiter))
    return { ...m, tex: display?.to === m.to ? display.tex : resolveNoteRefs(m.block ? sourceTex.trim() : sourceTex, details.labels, true) }
  })
  const figures: NotePreview['figures'] = details.figures
    .filter((f) => !code.some((c) => overlaps(c, f)))
    .map(({ from, to, figure }) => ({ from, to, ...figure }))
  // 문단 한가운데의 그림도 원문 기호 대신 그림으로 보인다 (번호는 읽기처럼 독립 문단만).
  for (const m of visible.matchAll(/!\[([^\]\n]*)\]\(([^()\s]+)\)/g)) {
    const span = { from: m.index!, to: m.index! + m[0].length }
    if ([...code, ...math, ...figures].some((r) => overlaps(r, span))) continue
    figures.push({ ...span, n: '', file: m[2]!, caption: resolveNoteRefs(m[1]!, details.labels) })
  }
  figures.sort((a, b) => a.from - b.from)

  const footnotes: NotePreview['footnotes'] = []
  let n = 0
  for (let at = visible.indexOf('^['); at >= 0; at = visible.indexOf('^[', at + 1)) {
    // 읽기에서는 독립 그림을 먼저 자리표시로 바꿔 캡션 안의 각주를 세지 않는다.
    if (details.figures.some((f) => at >= f.from && at < f.to)) continue
    const end = footnoteEnd(visible, at + 1)
    if (end < 0) break
    const span = { from: at, to: end + 1 }
    const content = numbered.footnotes[n++] ?? resolveNoteRefs(visible.slice(at + 2, end).trim(), details.labels)
    if (![...code, ...math, ...figures].some((r) => at >= r.from && at < r.to)) footnotes.push({ ...span, n, content })
    at = end
  }

  const replaced = [...code, ...math, ...comments, ...figures, ...footnotes]
  const references = matches(src, /\\(?:eq|c|C|auto)?ref\{[^{}]*\}/g)
    .filter((span) => !replaced.some((r) => overlaps(r, span)))
    .map((span) => ({ ...span, label: resolveNoteRefs(src.slice(span.from, span.to), details.labels) }))
  const labels = matches(src, /\\label\{[^{}]*\}/g)
    .filter((span) => !replaced.some((r) => overlaps(r, span)))
  return { math, references, comments: comments.filter((c) => !code.some((r) => overlaps(r, c))), footnotes, figures, labels }
}
