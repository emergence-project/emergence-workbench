import { markdownLanguage } from '@codemirror/lang-markdown'

export interface RecordAnchor { quote: string; line: number; prefix: string; suffix: string }
export interface RecordRange { from: number; to: number }
type AnchorLike = { quote?: string; line?: number; prefix?: string; suffix?: string; lost?: true }

/** Keep the exact selected source (including Markdown), with the server's normalized newlines. */
export function selectionAnchor(source: string, start: number, end: number): RecordAnchor | null {
  const from = Math.max(0, Math.min(source.length, Math.min(start, end)))
  const to = Math.max(0, Math.min(source.length, Math.max(start, end)))
  const normalize = (value: string) => value.replace(/\r\n?/g, '\n')
  const quote = normalize(source.slice(from, to))
  if (!quote.trim()) return null
  return {
    quote, line: normalize(source.slice(0, from)).split('\n').length,
    prefix: normalize(source.slice(0, from)).slice(-32),
    suffix: normalize(source.slice(to)).slice(0, 32),
  }
}

function occurrences(text: string, quote: string): number[] {
  if (!quote) return []
  const out: number[] = []
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) out.push(at)
  return out
}

/** Match the re-anchored line/context, without ever drawing a lost or missing quote. */
export function findRecordRange(source: string, anchor: AnchorLike): RecordRange | null {
  if (anchor.lost || !anchor.quote) return null
  const normalized = source.replace(/\r\n?/g, '\n')
  const quote = anchor.quote.replace(/\r\n?/g, '\n')
  const prefix = (anchor.prefix ?? '').replace(/\r\n?/g, '\n')
  const suffix = (anchor.suffix ?? '').replace(/\r\n?/g, '\n')
  const contextual = occurrences(normalized, prefix + quote + suffix).map((at) => at + prefix.length)
  const candidates = contextual.length ? contextual : occurrences(normalized, quote)
  if (!candidates.length) return null
  const from = candidates.reduce((best, at) => {
    const distance = (offset: number) => Math.abs(normalized.slice(0, offset).split('\n').length - (anchor.line ?? 1))
    return distance(at) < distance(best) ? at : best
  })
  // Map LF offsets back to source offsets, so CRLF files are decorated without rewriting them.
  const rawOffset = (offset: number) => {
    let raw = 0
    for (let normalizedAt = 0; normalizedAt < offset; normalizedAt++, raw++) if (source[raw] === '\r' && source[raw + 1] === '\n') raw++
    return raw
  }
  return { from: rawOffset(from), to: rawOffset(from + quote.length) }
}

export interface RecordProjection { text: string; starts: number[]; ends: number[] }

/** A searchable visible-text projection. Every character retains its original source span. */
export function projectRecordSource(source: string, offset = 0): RecordProjection {
  const body = source.slice(offset)
  const hidden = new Uint8Array(body.length)
  const hide = (from: number, to: number) => hidden.fill(1, from, to)
  const tree = markdownLanguage.parser.parse(body)
  tree.iterate({ enter: (node) => {
    if (['EmphasisMark', 'CodeMark', 'LinkMark', 'CodeInfo', 'TableDelimiter'].includes(node.name)) hide(node.from, node.to)
    if (['HeaderMark', 'QuoteMark', 'ListMark'].includes(node.name)) {
      let end = node.to
      while (body[end] === ' ' || body[end] === '\t') end++
      hide(node.from, end)
    }
    if (node.name === 'URL' && node.node.parent?.name === 'Link') hide(node.from, node.to)
    if (node.name === 'Escape') hide(node.from, node.from + 1)
    if (node.name === 'Image' || node.name === 'HorizontalRule') { hide(node.from, node.to); return false }
  } })
  for (const m of body.matchAll(/==([^=\n]+)==/g)) { hide(m.index, m.index + 2); hide(m.index + m[0].length - 2, m.index + m[0].length) }
  for (const m of body.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)) {
    const label = m[2] ?? m[1]!
    const start = m.index + (m[2] === undefined ? 2 : m[0].indexOf('|') + 1)
    hide(m.index, start); hide(start + label.length, m.index + m[0].length)
  }
  const text: string[] = [], starts: number[] = [], ends: number[] = []
  for (let i = 0; i < body.length; i++) {
    if (hidden[i]) continue
    const c = /\s/.test(body[i]!) ? ' ' : body[i]!
    if (c === ' ' && text[text.length - 1] === ' ') { ends[ends.length - 1] = offset + i + 1; continue }
    text.push(c); starts.push(offset + i); ends.push(offset + i + 1)
  }
  return { text: text.join(''), starts, ends }
}

function commonEnd(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}
function commonStart(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/** Match a range in two visible strings; surrounding text and occurrence order disambiguate repeats. */
export function matchRecordText(origin: string, range: RecordRange, target: string, endpoints = true): RecordRange | null {
  let { from, to } = range
  while (from < to && /\s/.test(origin[from]!)) from++
  while (to > from && /\s/.test(origin[to - 1]!)) to--
  if (from === to) return null
  const quote = origin.slice(from, to)
  const candidates = occurrences(target, quote)
  if (!candidates.length) {
    // Numbered references and rendered equations can differ inside a selected sentence.
    // Require identifiable text at BOTH ends; never guess from one shared word alone.
    if (!endpoints || quote.length < 8) return null
    let first: RecordRange | null = null, last: RecordRange | null = null
    for (let size = Math.min(32, Math.floor(quote.length / 2)); size >= 3; size--) {
      if (!first && quote.slice(0, size).trim().length >= 3) first = matchRecordText(origin, { from, to: from + size }, target, false)
      if (!last && quote.slice(-size).trim().length >= 3) last = matchRecordText(origin, { from: to - size, to }, target, false)
      if (first && last) break
    }
    return first && last && first.to <= last.from ? { from: first.from, to: last.to } : null
  }
  const before = origin.slice(Math.max(0, from - 64), from)
  const after = origin.slice(to, to + 64)
  const ordinal = occurrences(origin.slice(0, to), quote).length - 1
  let best = candidates[0]!, bestScore = -1, bestOrder = Infinity
  candidates.forEach((at, index) => {
    const score = commonEnd(before, target.slice(Math.max(0, at - 64), at)) + commonStart(after, target.slice(at + quote.length, at + quote.length + 64))
    const order = Math.abs(index - ordinal)
    if (score > bestScore || (score === bestScore && order < bestOrder)) { best = at; bestScore = score; bestOrder = order }
  })
  return { from: best, to: best + quote.length }
}

/** Turn a selection in rendered text into an exact raw-source range, including intervening syntax. */
export function sourceRangeFromRendered(source: string, rendered: string, range: RecordRange, offset = 0): RecordRange | null {
  const projection = projectRecordSource(source, offset)
  const found = matchRecordText(rendered, range, projection.text)
  if (!found) return null
  return { from: projection.starts[found.from]!, to: projection.ends[found.to - 1]! }
}

export function renderedRangeFromSource(source: string, rawRange: RecordRange, rendered: string, offset = 0): RecordRange | null {
  const projection = projectRecordSource(source, offset)
  const from = projection.ends.findIndex((end) => end > rawRange.from)
  let to = projection.starts.findIndex((start) => start >= rawRange.to)
  if (to < 0) to = projection.text.length
  if (from < 0 || from >= to) return null
  return matchRecordText(projection.text, { from, to }, rendered)
}
