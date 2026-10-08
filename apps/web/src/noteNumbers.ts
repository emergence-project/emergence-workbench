import { footnoteEnd, stripHtmlComments } from '@rw/core'

/**
 * Markdown 노트 읽기 화면의 번호와 참조 (PDF는 LaTeX가 같은 일을 한다).
 * - 절(## 제목 \label{…}), 식($$ 안 equation·align·eqnarray·subequations의 \label), 그림(그림만 있는 문단 ![캡션 \label{…}](파일)),
 *   표("**표.** 캡션 \label{…}")에 차례로 번호를 달고, 글 속 \ref{…} → 번호, \eqref{…} → (번호). 모르는 이름은 ??
 * - 줄 하나뿐인 \appendix 뒤의 절은 A, B, …
 * - 각주 ^[…] → 위 첨자 번호와 맨 아래 목록, 숨긴 메모 <!-- … -->는 뺀다
 * - KaTeX에 없는 eqnarray는 align으로, 번호는 \tag로 바꿔 그린다 (파일은 그대로)
 * 그림과 각주는 자리표시(\u0003F0\u0003, \u0003N0\u0003)로 두고, 그린 HTML에서 바꾼다.
 */
export interface NoteFigure { n: string; file: string; caption: string }
export interface NumberedNote { text: string; figures: NoteFigure[]; footnotes: string[] }
export interface NoteSourceSpan { from: number; to: number }
export interface NoteNumberDetails {
  displays: (NoteSourceSpan & { tex: string })[]
  figures: (NoteSourceSpan & { figure: NoteFigure })[]
  labels: Map<string, string>
}

const FIGURE = /^!\[(.*)\]\(([^()\s]+)\)$/
const TABLE_CAPTION = /^\*\*(표|Table)\.?\*\*\.?\s*(.*)$/
const LABEL = /\\label\{([^{}]*)\}/
const NUMBERED_ENV = /^\\begin\{(equation|align|eqnarray|gather|multline)(\*?)\}([\s\S]*)\\end\{\1\2\}$/
const HEADING_NUMBER = /^(?:\d+[.)]|\d+(?:\.\d+)+[.)]?|[A-Za-z][.)])(?:\s|$)/

const letters = (n: number) => String.fromCharCode(64 + n)

/** 번호 붙이기의 정규화된 글을 원문 자리로 되돌린다. 원문은 바꾸지 않는다. */
function mappedSource(src: string) {
  let text = ''
  let offsets: number[] = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\r' && src[i + 1] === '\n') continue
    text += src[i]
    offsets.push(i)
  }
  // stripHtmlComments와 같은 두 단계: 메모만 있는 줄은 줄째로 뺀다.
  for (const pattern of [/^[ \t]*<!--[\s\S]*?-->[ \t]*(?:\n|$)/gm, /<!--[\s\S]*?-->/g]) {
    const kept: string[] = []
    const nextOffsets: number[] = []
    let at = 0
    for (const m of text.matchAll(pattern)) {
      kept.push(text.slice(at, m.index))
      for (let i = at; i < m.index!; i++) nextOffsets.push(offsets[i]!)
      at = m.index! + m[0].length
    }
    kept.push(text.slice(at))
    for (let i = at; i < text.length; i++) nextOffsets.push(offsets[i]!)
    text = kept.join('')
    offsets = nextOffsets
  }
  return { text, span: (from: number, to: number): NoteSourceSpan => ({ from: offsets[from] ?? src.length, to: to > from ? offsets[to - 1]! + 1 : offsets[from] ?? src.length }) }
}

/** 읽기와 미리보기에서 같은 이름표·참조 치환을 쓴다. */
export function resolveNoteRefs(s: string, labels: ReadonlyMap<string, string>, inMath = false): string {
  const ref = (key: string) => labels.get(key) ?? '??'
  return s
    .replace(/\\eqref\{([^{}]*)\}/g, (_, k: string) => (inMath ? `\\text{(${ref(k)})}` : `(${ref(k)})`))
    .replace(/\\(?:c|C|auto)?ref\{([^{}]*)\}/g, (_, k: string) => (inMath ? `\\text{${ref(k)}}` : ref(k)))
    .replace(new RegExp(LABEL, 'g'), '')
}

/** 맨 바깥 \\ 에서 줄을 나눈다 (괄호·안쪽 환경 속의 \\는 그대로) */
export function splitRows(body: string): string[] {
  const rows: string[] = []
  let depth = 0
  let env = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '\\') {
      if (body.startsWith('\\begin{', i)) env++
      else if (body.startsWith('\\end{', i)) env--
      else if (body[i + 1] === '\\' && depth === 0 && env === 0) { rows.push(body.slice(start, i)); start = i + 2; i++; continue }
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
  }
  rows.push(body.slice(start))
  return rows
}

/** 표시 수식 하나: 번호를 \tag로 달고 \label의 번호를 적는다. next()는 다음 식 번호 */
export function numberDisplay(tex: string, next: () => number | string, labels: Map<string, string>): string {
  // % 메모는 KaTeX도 무시한다. 그 안의 \\·\nonumber를 세지 않게 먼저 뺀다
  const t = tex.split('\n').map((l) => l.replace(/(?<!\\)%.*$/, '')).join('\n').trim()
  const sub = /^\\begin\{subequations\}([\s\S]*)\\end\{subequations\}$/.exec(t)
  if (sub) {
    const parent = String(next())
    const inner = sub[1]!.trim()
    const m = /\\begin\{(equation|align|eqnarray|gather|multline)\*?\}[\s\S]*\\end\{\1\*?\}/.exec(inner)
    // 안쪽 환경 밖의 \label은 묶음 전체의 번호
    for (const l of (m ? inner.replace(m[0], '') : inner).matchAll(new RegExp(LABEL, 'g'))) labels.set(l[1]!, parent)
    if (!m) return inner.replace(new RegExp(LABEL, 'g'), '')
    // 묶음 안의 줄은 3a, 3b, …
    let k = 0
    return numberDisplay(m[0], () => `${parent}${String.fromCharCode(97 + k++)}`, labels)
  }
  const env = NUMBERED_ENV.exec(t)
  if (!env) return t.replace(new RegExp(LABEL, 'g'), '')
  const [, name, star, body] = env
  const many = name === 'align' || name === 'eqnarray' || name === 'gather'
  const rows = many ? splitRows(body!) : [body!]
  const out = rows.map((row, i) => {
    const last = i === rows.length - 1
    // 마지막 줄이 비었으면 (끝에 \\) 번호를 달지 않는다
    if (many && last && !row.trim() && rows.length > 1) return row
    const plain = /\\(?:nonumber|notag)\b/.test(row) || !!star
    const label = LABEL.exec(row)?.[1]
    let r = row.replace(new RegExp(LABEL, 'g'), '').replace(/\\(?:nonumber|notag)\b/g, '')
    if (!plain) {
      const n = String(next())
      if (label) labels.set(label, n)
      r = `${r.replace(/\s+$/, '')} \\tag{${n}}\n`
    }
    return r
  })
  const target = name === 'eqnarray' ? 'align' : name!
  return `\\begin{${target}*}${out.join('\\\\')}\\end{${target}*}`
}

/** 번호·참조를 단 Markdown과 그림·각주 목록 */
export function numberNote(src: string, details?: NoteNumberDetails): NumberedNote {
  const mapped = details ? mappedSource(src) : undefined
  const lines = (mapped?.text ?? stripHtmlComments(src.replace(/\r\n/g, '\n'))).split('\n')
  const starts: number[] = []
  if (details) {
    details.displays.length = 0
    details.figures.length = 0
    details.labels.clear()
    let offset = 0
    for (const line of lines) { starts.push(offset); offset += line.length + 1 }
  }
  const labels = details?.labels ?? new Map<string, string>()
  const figures: NoteFigure[] = []
  let eq = 0
  let fig = 0
  let tab = 0
  const heads = lines.filter((l) => /^#{1,6}\s/.test(l)).map((l) => /^#+/.exec(l)![0].length)
  const base = heads.length ? Math.min(...heads) : 2
  const sec = [0, 0, 0, 0, 0, 0]
  let appendix = false
  const out: string[] = []
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const t = line.trim()
    if (/^(```|~~~)/.test(t)) fence = !fence
    if (fence || /^(```|~~~)/.test(t)) { out.push(line); continue }
    if (t === '\\appendix') { appendix = true; sec.fill(0); continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) {
      const depth = h[1]!.length - base
      const label = LABEL.exec(h[2]!)?.[1]
      const title = h[2]!.replace(new RegExp(LABEL, 'g'), '').trim()
      if (depth >= 0 && depth < sec.length) {
        sec[depth]!++
        sec.fill(0, depth + 1)
        const n = sec.slice(0, depth + 1).map((x, k) => (k === 0 && appendix ? letters(x) : String(x))).join('.')
        if (label) labels.set(label, n)
        // Keep section counters and labels even when the title supplies its own number.
        out.push(`${h[1]} ${HEADING_NUMBER.test(title) ? title : `${n} ${title}`}`)
      } else out.push(`${h[1]} ${title}`)
      continue
    }
    if (t.startsWith('$$')) {
      const from = details ? starts[i]! + line.indexOf('$$') : 0
      let to = details ? starts[i]! + line.lastIndexOf('$$') + 2 : 0
      const rest = t.slice(2)
      let tex: string
      if (rest.endsWith('$$') && rest.length >= 2) tex = rest.slice(0, -2)
      else {
        const math = [rest]
        let j = i + 1
        for (; j < lines.length && !lines[j]!.includes('$$'); j++) math.push(lines[j]!)
        if (j >= lines.length) { out.push(line); continue }
        math.push(lines[j]!.slice(0, lines[j]!.indexOf('$$')))
        if (details) to = starts[j]! + lines[j]!.indexOf('$$') + 2
        i = j
        tex = math.join('\n')
      }
      const numbered = numberDisplay(tex, () => ++eq, labels)
      if (details && mapped) details.displays.push({ ...mapped.span(from, to), tex: numbered })
      out.push('$$', numbered, '$$')
      continue
    }
    const f = FIGURE.exec(t)
    if (f && !(lines[i - 1] ?? '').trim() && !(lines[i + 1] ?? '').trim()) {
      const label = LABEL.exec(f[1]!)?.[1]
      const caption = f[1]!.replace(new RegExp(LABEL, 'g'), '').trim()
      const n = caption || label ? String(++fig) : ''
      if (label) labels.set(label, n)
      const figure = { n, file: f[2]!, caption }
      figures.push(figure)
      if (details && mapped) {
        const from = starts[i]! + line.indexOf(t)
        details.figures.push({ ...mapped.span(from, from + t.length), figure })
      }
      out.push(`\u0003F${figures.length - 1}\u0003`)
      continue
    }
    const c = TABLE_CAPTION.exec(t)
    if (c) {
      const n = String(++tab)
      const label = LABEL.exec(c[2]!)?.[1]
      if (label) labels.set(label, n)
      out.push(`**${c[1]} ${n}.** ${c[2]!.replace(new RegExp(LABEL, 'g'), '').trim()}`)
      continue
    }
    out.push(line)
  }
  // 수식 밖과 안을 나눠 참조를 바꾼다
  const withRefs = (s: string) => s.split(/(\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]+?\$)/).map((p, k) => resolveNoteRefs(p, labels, k % 2 === 1)).join('')
  if (details) for (const display of details.displays) display.tex = resolveNoteRefs(display.tex, labels, true)
  let text = withRefs(out.join('\n'))
  for (const fg of figures) fg.caption = withRefs(fg.caption)
  // 각주
  const footnotes: string[] = []
  for (let at = text.indexOf('^['); at >= 0; at = text.indexOf('^[', at + 1)) {
    const end = footnoteEnd(text, at + 1)
    if (end < 0) break
    footnotes.push(text.slice(at + 2, end).trim())
    text = `${text.slice(0, at)}\u0003N${footnotes.length - 1}\u0003${text.slice(end + 1)}`
  }
  return { text, figures, footnotes }
}
