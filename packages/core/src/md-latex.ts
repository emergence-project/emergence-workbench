import { stripFrontMatter } from './front-matter.js'

/**
 * Markdown + KaTeX 노트 본문 → LaTeX 본문 (10/4 결정 "연구노트·보조 노트는 개념노트와 같은 Markdown + KaTeX, PDF는 내보낼 때 프로젝트 서식으로").
 * 노트 파일은 그대로 두고, 컴파일·내보내기 때만 이 글을 만든다.
 * - 머리말(맨 위 --- … ---)은 뺀다
 * - # → \section, ## → \section, ### → \subsection, #### → \subsubsection (노트 이름은 앱이 따로 붙인다)
 * - $…$, $$…$$는 그대로 수식으로 (align 같은 환경이 들어 있으면 그 환경을 그대로)
 * - **굵게**, *기울임*, `코드`, [글](주소), ![그림](파일), 목록, 인용문, 표, 코드 블록
 * - [[대상|별칭]] → 별칭(없으면 대상) 글자, [@a; @b] → \cite{a,b}
 * - **Proof.** … ∎ → proof 환경
 * - 번호와 참조는 LaTeX 그대로: \label{…}(제목 끝·그림 캡션·$$ 안), \ref{…}, \eqref{…}. 줄 하나뿐인 \appendix도 그대로
 * - 그림만 있는 문단 ![캡션](파일) → figure 환경(캡션이 있으면 \caption), "**표.** 캡션" 바로 뒤의 표 → table 환경
 * - 각주 ^[…] → \footnote, 숨긴 메모 <!-- … --> → 뺀다
 * 모르는 모양은 글자로 둔다 (LaTeX를 깨는 문자만 막는다).
 */

const TEXT_ESC: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '#': '\\#', '$': '\\$', '%': '\\%', '&': '\\&', '_': '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}
export const escapeLatexText = (s: string) => s.replace(/[\\{}#$%&_~^]/g, (c) => TEXT_ESC[c]!)

/** 맨 위 YAML 머리말을 뗀 본문 */
export const stripMdFrontMatter = stripFrontMatter

/** $…$ 밖에서 [ ] 짝을 맞춰 ^[…]의 끝을 찾는다 (없으면 -1) */
export function footnoteEnd(t: string, open: number): number {
  let depth = 0
  let math = false
  for (let i = open; i < t.length; i++) {
    const c = t[i]
    if (c === '\\') { i++; continue }
    if (c === '$') { math = !math; continue }
    if (math) continue
    if (c === '[') depth++
    else if (c === ']' && --depth === 0) return i
  }
  return -1
}

/** 숨긴 메모 <!-- … -->를 뺀다. 메모만 있는 줄은 줄째로 (문단이 끊기지 않게) */
export const stripHtmlComments = (s: string) => s.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*(?:\n|$)/gm, '').replace(/<!--[\s\S]*?-->/g, '')

const MATH_ENV = /\\begin\{(?:align|aligned|equation|gather|multline|eqnarray|split|cases|array|matrix|pmatrix|bmatrix)\*?\}/

/** 표시 수식 $$…$$: 바깥 환경이 이미 있으면 그대로, 아니면 \[ … \] */
function displayMath(tex: string): string {
  const t = tex.trim()
  if (/^\\begin\{(align|equation|gather|multline|eqnarray|subequations)\*?\}/.test(t)) return t
  return `\\[\n${t}\n\\]`
}

/** 한 줄(또는 문단) 안의 글: 수식·코드는 그대로 두고 나머지만 바꾼다 */
export function inlineToLatex(src: string, opts: MdLatexOptions = {}): string {
  const slots: string[] = []
  const hold = (s: string) => `\u0001${slots.push(s) - 1}\u0001`
  let t = src
  // 각주 ^[…] (안에 수식·인용·[ ]가 있어도 짝을 맞춘다)
  for (let at = t.indexOf('^['); at >= 0; at = t.indexOf('^[', at + 1)) {
    const end = footnoteEnd(t, at + 1)
    if (end < 0) break
    const note = hold(`\\footnote{${inlineToLatex(t.slice(at + 2, end), opts)}}`)
    t = t.slice(0, at) + note + t.slice(end + 1)
  }
  // 번호와 참조는 LaTeX 그대로
  t = t.replace(/\\(?:label|ref|eqref|cref|Cref|autoref|pageref)\{[^{}]*\}/g, (m) => hold(m))
  // 코드 `…`
  t = t.replace(/`([^`\n]+)`/g, (_, c: string) => hold(`\\texttt{${escapeLatexText(c)}}`))
  // 수식 $…$ (\$는 글자)
  t = t.replace(/(?<!\\)\$\$([\s\S]+?)\$\$/g, (_, m: string) => hold(displayMath(m)))
  t = t.replace(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s|\\)\$(?!\d)/g, (_, m: string) => hold(`$${m}$`))
  // 그림 ![alt](file)
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, _alt: string, f: string) => hold(graphic(f, '0.8\\linewidth', opts)))
  t = t.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, f: string) => {
    const name = f.trim()
    return hold(opts.figure?.(name) ?? `\\includegraphics[width=0.8\\linewidth]{${name}}`)
  })
  // 링크 [[대상|별칭]] → 글자
  t = t.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => hold(escapeLatexText((alias ?? target).trim())))
  // 인용 [@a; @b] / [see @a, p. 3]
  t = t.replace(/(?<!\\)\[((?:[^[\]]*?(?:(?<=\[)|[\s;])-?@[A-Za-z0-9_:.-]*[A-Za-z0-9_][^[\]]*?)+)\](?!\()/g, (_, inner: string) => {
    const keys = [...inner.matchAll(/(?:^|[\s;])-?@([A-Za-z0-9_:.-]*[A-Za-z0-9_])/g)].map((m) => m[1]!)
    // 마지막 키 뒤 ", …"는 쪽·절 표시: p. 3, §II.A, Sec. 4, Eq. (2) … (10/7 17:05: §로 적은 것이 빠졌다)
    const loc = /@[A-Za-z0-9_:.-]*[A-Za-z0-9_]\s*,\s*([^;\]]+)$/.exec(inner)?.[1]
    return hold(`\\cite${loc ? `[${escapeLatexText(loc.trim()).replace(/\.\s+/g, '.~')}]` : ''}{${keys.join(',')}}`)
  })
  // 링크 [글](주소)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => hold(`\\href{${url.replace(/([%#\\])/g, '\\$1')}}{${inlineToLatex(text, opts)}}`))
  // 맨 주소
  t = t.replace(/\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:]/g, (u) => hold(`\\url{${u.replace(/([%#\\])/g, '\\$1')}}`))
  // Markdown 이스케이프 \* \_ \[ 등은 글자로
  t = t.replace(/\\([\\`*_{}[\]()#+\-.!|$])/g, (_, c: string) => hold(escapeLatexText(c)))
  // 나머지 글자 이스케이프 (굵게·기울임 표시는 아래에서)
  t = t.replace(/[^\u0001*=]+|\u0001\d+\u0001/g, (s) => (s.startsWith('\u0001') ? s : escapeLatexText(s)))
  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '\\textbf{$1}')
  t = t.replace(/__(?=\S)([\s\S]*?\S)__/g, '\\textbf{$1}')
  t = t.replace(/(?<![*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '\\emph{$1}')
  t = t.replace(/(?<![\w\\])\\_(?=\S)((?:(?!\\_).)*?\S)\\_(?!\w)/g, '\\emph{$1}')
  t = t.replace(/==(?=\S)([^=]*?\S)==/g, '\\emph{$1}')
  // 남은 *, = 은 글자
  t = t.replace(/\*/g, '\\textasteriskcentered{}')
  for (let i = 0; i < 3 && t.includes('\u0001'); i++) t = t.replace(/\u0001(\d+)\u0001/g, (_, n: string) => slots[Number(n)]!)
  return t
}

/** 한 줄짜리 그림 ![캡션](파일) — 캡션 안에 [ ]가 있어도 마지막 ](까지 */
const FIGURE = /^!\[(.*)\]\(([^()\s]+)\)$/
const TABLE_CAPTION = /^\*\*(?:표|Table)\.?\*\*\.?\s*(.*)$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^(\s*)([-*+])\s+(.*)$/
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/
const SECTION = ['section', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']

export interface MdLatexOptions {
  /** # 하나를 무엇으로 (기본 section) — 노트를 여럿 모을 때 한 단계 내린다 */
  shift?: number
  /** 라이브러리 그림은 원본 형식에 맞는 LaTeX로 바꾼다 (못 찾으면 기존 방식). */
  figure?: (name: string) => string | undefined
  /** ![캡션](대상)의 대상이 노트 폴더에 없는 라이브러리 그림이면 그 그림을 그리는 LaTeX (못 찾으면 \\includegraphics{대상}) */
  image?: (target: string, width: string) => string | undefined
}

const graphic = (file: string, width: string, opts: MdLatexOptions) => opts.image?.(file, width) ?? `\\includegraphics[width=${width}]{${file}}`

/**
 * 표 한 줄을 칸으로 나눈다. 칸 경계는 \| 가 아닌 | 이고, $…$ 수식과 `…` 코드 안의 |는 경계가 아니다
 * (10/8 11:30: $|0\rangle$, $|Y(\omega)|^2$의 |를 칸 경계로 읽어 칸이 넘쳤다. 화면은 수식을 먼저 떼어 두어 바르게 그렸다)
 */
export function tableCells(line: string): string[] {
  const row = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const out: string[] = []
  let cell = ''
  let math = false
  let code = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!
    if (ch === '\\' && i + 1 < row.length) { cell += ch + row[++i]; continue }
    if (ch === '`' && !math) code = !code
    else if (ch === '$' && !code) math = !math
    else if (ch === '|' && !math && !code) { out.push(cell.trim()); cell = ''; continue }
    cell += ch
  }
  out.push(cell.trim())
  // 짝이 없는 $(값 표시 등)가 있으면 예전처럼 | 마다 나눈다
  return math || code ? row.split(/(?<!\\)\|/).map((c) => c.trim()) : out
}

/** Markdown 본문 → LaTeX 본문 */
/**
 * 표의 열 폭. 글이 한 줄 폭에 들어가면 모두 null(줄바꿈 없음), 넘치면 긴 열에 글 길이에 비례한 폭(\linewidth의 몇 배)을 준다
 * (10/7 17:05: 긴 한글 표가 쪽 밖으로 나갔다). 길이는 Markdown 원문 기준이고 한글 · 한자는 두 칸으로 센다. $…$ 수식은 짧게 본다.
 * 줄바꿈은 p{} 열 대신 l 열 안의 \parbox로 한다: TeX Live 2025에서 revtex + dcolumn과 p{} 열을 함께 쓰면
 * 표 머리 해석이 깨져 컴파일이 멈췄다 (10/10 14:01 논문 개요).
 */
function tableWidths(head: string, body: string[]): (number | null)[] {
  const width = (c: string) => [...c.replace(/\$[^$]*\$/g, 'xxxx').replace(/[*`]/g, '')].reduce((n, ch) => n + (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 2 : 1), 0)
  const rows = [tableCells(head), ...body.map(tableCells)]
  const n = rows[0]!.length
  const max = Array.from({ length: n }, (_, k) => Math.max(4, ...rows.map((r) => width(r[k] ?? ''))))
  if (max.reduce((a, b) => a + b, 0) <= 80) return max.map(() => null)
  // 짧은 열(12칸 이하)은 그대로, 남은 폭(열 사이 여백을 뺀 것)을 긴 열이 길이에 비례해 나눈다. 한 줄 폭은 반각 80칸쯤
  const short = (m: number) => m <= 12
  const room = 0.95 - 0.035 * n - max.filter(short).reduce((a, m) => a + m / 80, 0)
  const long = max.filter((m) => !short(m)).reduce((a, b) => a + b, 0)
  return max.map((m) => (short(m) ? null : Math.max(0.1, room * m / long)))
}

const tableCell = (text: string, w: number | null | undefined) => (w ? `\\parbox[t]{${w.toFixed(2)}\\linewidth}{\\raggedright ${text}}` : text)

export function markdownToLatex(src: string, opts: MdLatexOptions = {}): string {
  const lines = stripHtmlComments(stripMdFrontMatter(src).replace(/\r\n/g, '\n')).split('\n')
  const out: string[] = []
  let para: string[] = []
  let caption: string | null = null
  const flush = () => { if (para.length) { out.push(paraText(para.join('\n'), opts), ''); para = [] } }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const t = line.trim()
    // 코드 블록
    if (/^(```|~~~)/.test(t)) {
      flush()
      const fence = t.slice(0, 3)
      const code: string[] = []
      for (i++; i < lines.length && !lines[i]!.trim().startsWith(fence); i++) code.push(lines[i]!)
      out.push('\\begin{verbatim}', ...code, '\\end{verbatim}', '')
      i++
      continue
    }
    // 표시 수식 (여러 줄)
    if (t.startsWith('$$')) {
      flush()
      const rest = t.slice(2)
      if (rest.endsWith('$$') && rest.length >= 2) { out.push(displayMath(rest.slice(0, -2)), ''); i++; continue }
      const math: string[] = [rest]
      for (i++; i < lines.length && !lines[i]!.includes('$$'); i++) math.push(lines[i]!)
      if (i < lines.length) math.push(lines[i]!.slice(0, lines[i]!.indexOf('$$')))
      out.push(displayMath(math.join('\n')), '')
      i++
      continue
    }
    // 수식 환경을 $$ 없이 바로 쓴 것
    if (/^\\begin\{(align|equation|gather|multline)\*?\}/.test(t)) {
      flush()
      const env = /^\\begin\{([a-z]+\*?)\}/.exec(t)![1]!
      const block: string[] = []
      for (; i < lines.length; i++) { block.push(lines[i]!); if (lines[i]!.includes(`\\end{${env}}`)) break }
      out.push(...block, '')
      i++
      continue
    }
    if (!t) { flush(); i++; continue }
    if (t === '\\appendix') { flush(); out.push('\\appendix', ''); i++; continue }
    // 그림만 있는 문단
    const fig = !para.length && !(lines[i + 1] ?? '').trim() ? FIGURE.exec(t) : null
    if (fig) {
      const [, alt, file] = fig
      out.push(alt!.trim()
        ? ['\\begin{figure}[htbp]', '\\centering', graphic(file!, '\\linewidth', opts), `\\caption{${inlineToLatex(alt!.trim(), opts)}}`, '\\end{figure}'].join('\n')
        : ['\\begin{center}', graphic(file!, '0.8\\linewidth', opts), '\\end{center}'].join('\n'), '')
      i++
      continue
    }
    // "**표.** 캡션" 문단 바로 뒤의 표
    const cap = !para.length ? TABLE_CAPTION.exec(t) : null
    if (cap) {
      let j = i + 1
      while (j < lines.length && !lines[j]!.trim()) j++
      if ((lines[j] ?? '').trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[j + 1] ?? '')) { caption = inlineToLatex(cap[1]!.trim(), opts); i = j; continue }
    }
    const h = HEADING.exec(t)
    if (h) {
      flush()
      const level = Math.min(SECTION.length - 1, h[1]!.length - 1 + (opts.shift ?? 0))
      // 제목 안의 \label은 제목 밖으로 뺀다: nameref가 제목을 라벨 이름으로 적어 문서 끝에서 오류가 났다 (10/8 11:42 논문 개요)
      const labels = h[2]!.match(/\\label\{[^{}]*\}/g) ?? []
      const title = h[2]!.replace(/\s*\\label\{[^{}]*\}/g, '').trim()
      out.push(`\\${SECTION[Math.max(0, level)]}{${inlineToLatex(title, opts)}}${labels.join('')}`, '')
      i++
      continue
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); out.push('\\medskip\\noindent\\rule{\\linewidth}{0.4pt}\\medskip', ''); i++; continue }
    // 인용문·콜아웃
    if (t.startsWith('>')) {
      flush()
      const quote: string[] = []
      for (; i < lines.length && lines[i]!.trim().startsWith('>'); i++) quote.push(lines[i]!.trim().replace(/^>\s?/, ''))
      const callout = /^\[!(\w+)\][-+]?\s*(.*)$/.exec(quote[0] ?? '')
      if (callout) quote[0] = callout[2] ? `**${callout[2]}**` : ''
      out.push('\\begin{quote}', markdownToLatex(quote.join('\n'), opts).trim(), '\\end{quote}', '')
      continue
    }
    // 표
    if (t.startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flush()
      const cells = (l: string) => tableCells(l).map((c) => inlineToLatex(c, opts))
      const head = cells(t)
      const rows: string[][] = []
      for (i += 2; i < lines.length && lines[i]!.trim().startsWith('|'); i++) rows.push(cells(lines[i]!))
      const widths = tableWidths(t, lines.slice(i - rows.length, i))
      const row = (r: string[]) => `${r.map((c, k) => tableCell(c, widths[k])).join(' & ')} \\\\`
      const tabular = [`\\begin{tabular}{${'l'.repeat(widths.length)}}`, '\\hline', row(head), '\\hline', ...rows.map(row), '\\hline', '\\end{tabular}']
      out.push(...(caption != null ? ['\\begin{table}[htbp]', '\\centering', `\\caption{${caption}}`, ...tabular, '\\end{table}'] : ['\\begin{center}', ...tabular, '\\end{center}']), '')
      caption = null
      continue
    }
    // 목록
    if (BULLET.test(line) || ORDERED.test(line)) {
      flush()
      const end = listEnd(lines, i)
      out.push(listToLatex(lines.slice(i, end), opts), '')
      i = end
      continue
    }
    para.push(line)
    i++
  }
  flush()
  return proofEnvs(out.join('\n').replace(/\n{3,}/g, '\n\n')).trim() + '\n'
}

/** 문단: 한 줄 바꿈은 Obsidian처럼 줄바꿈으로 본다 (breaks) */
function paraText(text: string, opts: MdLatexOptions): string {
  const lines = text.split('\n').map((l) => inlineToLatex(l.trim(), opts))
  // 표시 수식 앞뒤에서는 줄을 끊지 않는다 (\\ 뒤에 \[가 오면 LaTeX 오류)
  const math = (l: string) => /\\\[|\\\]|\\begin\{|\\end\{/.test(l)
  return lines.map((l, i) => (i < lines.length - 1 && !math(l) && !math(lines[i + 1]!) ? `${l}\\\\` : l)).join('\n')
}

function listEnd(lines: string[], from: number): number {
  let i = from
  for (; i < lines.length; i++) {
    const l = lines[i]!
    if (!l.trim()) {
      // 빈 줄 뒤에 목록이나 들여쓴 줄이 이어지면 같은 목록
      const next = lines[i + 1] ?? ''
      if (BULLET.test(next) || ORDERED.test(next) || /^\s{2,}\S/.test(next)) continue
      break
    }
    if (i > from && !BULLET.test(l) && !ORDERED.test(l) && !/^\s+\S/.test(l)) break
  }
  return i
}

interface Item { indent: number; ordered: boolean; text: string[] }

function listToLatex(lines: string[], opts: MdLatexOptions): string {
  const items: Item[] = []
  for (const l of lines) {
    const b = BULLET.exec(l) ?? ORDERED.exec(l)
    if (b) items.push({ indent: b[1]!.replace(/\t/g, '    ').length, ordered: !BULLET.test(l), text: [b[3]!] })
    else if (items.length) items[items.length - 1]!.text.push(l.trim())
  }
  const out: string[] = []
  const stack: { indent: number; env: string }[] = []
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1]!.indent) out.push(`\\end{${stack.pop()!.env}}`)
    if (!stack.length || it.indent > stack[stack.length - 1]!.indent) {
      const env = it.ordered ? 'enumerate' : 'itemize'
      stack.push({ indent: it.indent, env })
      out.push(`\\begin{${env}}`)
    }
    const body = markdownToLatex(it.text.filter((x, n) => n === 0 || x).join('\n'), opts).trim()
    out.push(`\\item ${body}`)
  }
  while (stack.length) out.push(`\\end{${stack.pop()!.env}}`)
  return out.join('\n')
}

/** **Proof.** … ∎ (또는 □, \qed) → proof 환경. 같은 문단·다음 문단들에 걸쳐도 된다 */
function proofEnvs(tex: string): string {
  return tex.replace(/\\textbf\{(?:Proof|증명)\.?\}\.?\s*([\s\S]*?)\s*(?:∎|□|\\qed\b|\$\\blacksquare\$|\$\\square\$)/g, (_, body: string) => `\\begin{proof}\n${body.trim().replace(/\\\\$/, '').trim()}\n\\end{proof}`)
}

/**
 * Markdown에서 바꾼 본문이 쓰는 것 (proof 환경, 그림, 링크). 서식에 없으면 채운다.
 * 서식의 머리 뒤에 둔다.
 */
export const MD_PREAMBLE = [
  '% Markdown 노트가 쓰는 것 (서식에 없을 때만)',
  '\\makeatletter',
  '\\@ifpackageloaded{amsthm}{}{\\@ifundefined{proof}{\\usepackage{amsthm}}{}}',
  '\\@ifpackageloaded{graphicx}{}{\\usepackage{graphicx}}',
  '\\makeatother',
  '\\providecommand{\\href}[2]{#2}',
  '\\providecommand{\\url}[1]{\\texttt{#1}}',
].join('\n')

/** 본문 안에서만 넣을 수 있을 때 (보조 노트 컴파일: 머리는 workbench/preamble.tex) — 없는 것만 대신 정의한다 */
export const MD_BODY_PRELUDE = [
  '\\makeatletter',
  '\\@ifundefined{proof}{\\newenvironment{proof}{\\par\\noindent\\textit{Proof.}\\ }{\\hfill$\\square$\\par}}{}',
  '\\makeatother',
  '\\providecommand{\\href}[2]{#2}',
  '\\providecommand{\\url}[1]{\\texttt{#1}}',
  '\\providecommand{\\includegraphics}[2][]{\\fbox{\\texttt{#2}}}',
].join('\n')
