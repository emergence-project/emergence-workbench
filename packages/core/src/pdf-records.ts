import { escapeLatexText } from './md-latex.js'

/**
 * 컴파일한 PDF에 기록 넣기 (10/19 결정 "PDF에 기록", 시안 2026-10-19-pdf-records-people 1–3절).
 * 노트 파일은 그대로 두고, 컴파일할 때만 본문에 pdfcomment 명령을 넣는다:
 * - 고른 글이 있고 그 글이 한 문단 안이면 하이라이트 주석(기록 글은 주석 내용). XeLaTeX만: xdvipdfmx의 pdf:bann/eann이
 *   줄마다 나눠 주고, 서버가 컴파일 뒤 QuadPoints를 붙인다(pdfRecords.ts). pdfcomment의 \pdfmarkupcomment는 soul을 써서
 *   한글을 지워 버려 쓰지 않는다(10/19 확인). 다른 엔진은 그 자리 쪽지만
 * - 고른 글이 표시 수식 · 표 · 제목 · 코드에 걸치면 그 자리(그것도 안 되면 그 덩어리 앞)에 \pdfcomment 쪽지만
 * - 고른 글이 없거나 본문에서 찾지 못한 기록은 맨 앞 쪽지 하나에 모은다
 * 표시는 두 단계로 넣는다: 원문에 보이지 않는 표시 글자를 끼우고(markRecords) → Markdown이면 LaTeX로 바꾼 뒤 → 명령으로 바꾼다(resolveRecordMarks).
 */

export interface RecordMark {
  /** 기록 종류 (메모 · 할 일 · 질문 · 지시 · 하이라이트) */
  kind: string
  quote?: string
  prefix?: string
  suffix?: string
  line?: number
  color?: string
  /** 쪽지 첫 줄: "질문 · 사용자 · 10/14" */
  title: string
  /** 쪽지 본문: 기록 글, 그 아래 답들 (빈 줄로 나눔) */
  text: string
}

const OPEN = (i: number) => `${i}`
const CLOSE = (i: number) => `${i}`
const TOKEN = /(\d+)|(\d+)/g

/** 하이라이트 색 (앱 하이라이트 색과 같은 이름) → PDF RGB */
const COLORS: Record<string, string> = { yellow: '1 0.85 0.2', green: '0.55 0.85 0.45', blue: '0.55 0.75 1', pink: '1 0.6 0.75' }
const ICONS: Record<string, string> = { 메모: 'Note', '할 일': 'Insert', 질문: 'Help', 지시: 'Comment', 하이라이트: 'Comment' }

export const PDF_RECORDS_PREAMBLE = '\\makeatletter\\@ifpackageloaded{pdfcomment}{}{\\usepackage{pdfcomment}}\\makeatother'

/** 쪽지 글: LaTeX 특수 문자를 막고 줄바꿈은 \textCR로(빈 줄은 두 번) (PDF 주석 안에서 줄이 바뀐다) */
const popupText = (s: string) => escapeLatexText(s.replace(/[ \t]*\n[ \t]*\n\s*/g, '\u0002').replace(/[ \t]*\n[ \t]*/g, '\u0003').trim()).replace(/\u0002/g, '\\textCR\\textCR ').replace(/\u0003/g, '\\textCR ')
const popup = (m: RecordMark) => popupText(`${m.title}\n\n${m.text}`.trim())
const author = (m: RecordMark) => m.title.split(' · ').slice(0, 2).join(' · ')
const color = (m: RecordMark) => COLORS[m.color ?? 'yellow'] ?? COLORS.yellow
/** 쪽지. margin: 덩어리 앞 · 맨 앞 쪽지는 왼쪽 여백으로 비켜 본문 첫 글자를 가리지 않게 */
const note = (m: RecordMark, margin = false) => `\\pdfcomment[icon=${ICONS[m.kind] ?? 'Note'},color={${color(m)}},author={${popupText(author(m))}}${margin ? ',hoffset=-1.6em' : ''}]{${popup(m)}}`
/** PDF 글 문자열(UTF-16BE 16진): \special 안에 한글 · 특수 문자를 그대로 넣는다 */
const pdfHex = (s: string) => `<FEFF${[...s].flatMap((ch) => {
  const c = ch.codePointAt(0)!
  return c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c]
}).map((n) => n.toString(16).toUpperCase().padStart(4, '0')).join('')}>`
const bann = (m: RecordMark) => `\\special{pdf:bann << /Subtype /Highlight /C [${color(m)}] /T ${pdfHex(author(m))} /Contents ${pdfHex(`${m.title}\n\n${m.text}`.trim())} /F 4 >>}`
const EANN = '\\special{pdf:eann}'

/** 기록 자리를 원문에서 찾는다: 앞뒤 글까지 맞는 곳 중 적어 둔 줄에 가장 가까운 곳, 없으면 고른 글만 (comments.ts reanchor와 같은 규칙) */
function locate(text: string, m: RecordMark): number {
  const quote = m.quote!
  const lineOf = (pos: number) => text.slice(0, pos).split('\n').length
  const nearest = (needle: string, offset: number): number => {
    let best = -1
    let distance = Infinity
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
      const d = Math.abs(lineOf(at + offset) - (m.line ?? 1))
      if (d < distance) { best = at + offset; distance = d }
    }
    return best
  }
  const prefix = m.prefix ?? ''
  const full = nearest(prefix + quote + (m.suffix ?? ''), prefix.length)
  return full >= 0 ? full : nearest(quote, 0)
}

/** 1단계: 원문에 표시 글자를 끼운다. 겹치는 기록은 뒤의 것을 쪽지만으로. 찾지 못한 기록 번호도 돌려준다 */
export function markRecords(text: string, marks: RecordMark[]): { text: string; loose: number[] } {
  const spans: { i: number; start: number; end: number }[] = []
  const loose: number[] = []
  marks.forEach((m, i) => {
    if (!m.quote?.trim()) { loose.push(i); return }
    const start = locate(text, m)
    if (start < 0) loose.push(i)
    else spans.push({ i, start, end: start + m.quote.length })
  })
  spans.sort((a, b) => a.start - b.start)
  const inserts: { at: number; s: string }[] = []
  let reach = -1
  for (const sp of spans) {
    inserts.push({ at: sp.start, s: OPEN(sp.i) })
    if (sp.start >= reach) { inserts.push({ at: sp.end, s: CLOSE(sp.i) }); reach = sp.end }
  }
  // 뒤에서부터 끼워 앞 위치가 밀리지 않게 한다. 같은 자리면 닫는 표시가 먼저
  inserts.sort((a, b) => b.at - a.at || (a.s.startsWith('') ? 1 : -1))
  let out = text
  for (const { at, s } of inserts) out = out.slice(0, at) + s + out.slice(at)
  return { text: out, loose }
}

const MATH_ENVS = /^(?:equation|align|gather|multline|eqnarray|displaymath|math|split|aligned|cases|array|matrix|pmatrix|bmatrix)\*?$/
const HEADING_LINE = /^\s*\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph|caption)\*?[[{]/
/** 하이라이트로 감쌀 수 없는 것: 표시 수식 · 환경 · 목록 · 각주 · 표 칸 · 빈 줄 (문단 안 글 · 인라인 수식 · 줄바꿈 · 인용은 된다) */
const UNSAFE_INSIDE = /\\\[|\\\]|\\begin\{|\\end\{|\\item\b|\\footnote\b|(?<!\\)&|\n\s*\n/

interface Scan { math: boolean[]; verbatim: boolean[]; depth: number[] }

/** 위치마다 수식 안인지 · verbatim 안인지 · 환경 깊이(document 빼고)를 센다 */
function scan(tex: string): Scan {
  const math: boolean[] = new Array(tex.length).fill(false)
  const verbatim: boolean[] = new Array(tex.length).fill(false)
  const depth: number[] = new Array(tex.length).fill(0)
  let inDollar = false, inDisplay = 0, d = 0, verb = false
  const envs: string[] = []
  for (let i = 0; i < tex.length; i++) {
    if (verb) {
      verbatim[i] = true
      if (tex.startsWith('\\end{verbatim}', i)) { verb = false; d--; envs.pop() }
      depth[i] = d
      continue
    }
    const c = tex[i]
    if (c === '\\') {
      const env = /^\\(begin|end)\{([^}]*)\}/.exec(tex.slice(i, i + 40))
      if (env) {
        const [, which, name] = env
        if (which === 'begin') {
          envs.push(name!)
          if (name !== 'document') d++
          if (MATH_ENVS.test(name!)) inDisplay++
          if (name === 'verbatim') { verb = true; verbatim[i] = true }
        } else {
          envs.pop()
          if (name !== 'document') d = Math.max(0, d - 1)
          if (MATH_ENVS.test(name!)) inDisplay = Math.max(0, inDisplay - 1)
        }
      } else if (tex[i + 1] === '[' || tex[i + 1] === '(') inDisplay++
      else if (tex[i + 1] === ']' || tex[i + 1] === ')') inDisplay = Math.max(0, inDisplay - 1)
      math[i] = inDollar || inDisplay > 0
      depth[i] = d
      if (!env) { math[i + 1] = math[i]!; depth[i + 1] = d; i++ }
      continue
    }
    if (c === '$') inDollar = !inDollar
    math[i] = inDollar || inDisplay > 0
    depth[i] = d
  }
  return { math, verbatim, depth }
}

/** 하이라이트로 감쌀 글: 중괄호가 짝이 맞고 위 금지 목록이 없어야 한다 */
function wrappable(between: string): boolean {
  if (UNSAFE_INSIDE.test(between)) return false
  let b = 0
  for (let i = 0; i < between.length; i++) {
    if (between[i] === '\\') { i++; continue }
    if (between[i] === '{') b++
    else if (between[i] === '}' && --b < 0) return false
  }
  return b === 0
}

/** 덩어리 앞 자리: 그 위치 앞에서 빈 줄 바로 뒤이고 환경 밖(깊이 0)인 줄 머리. 없으면 -1 (맨 앞 쪽지로) */
function blockStart(tex: string, at: number, s: Scan): number {
  for (let p = tex.lastIndexOf('\n', at - 1); p > 0; p = tex.lastIndexOf('\n', p - 1)) {
    const start = p + 1
    const prev = tex.slice(tex.lastIndexOf('\n', p - 1) + 1, p)
    if (!prev.trim() && !s.depth[start] && !s.verbatim[start]) return start
  }
  return -1
}

/**
 * 2단계: 표시 글자를 명령으로 바꾼다. loose: 고른 글이 없거나 찾지 못한 기록 번호(맨 앞 쪽지 하나로).
 * 맨 앞 쪽지는 문서 몸(\begin{document})이 있으면 그 바로 뒤에, 없으면 맨 앞에 둔다.
 * highlight: 하이라이트 주석을 넣을지 (XeLaTeX만, 아니면 그 자리 쪽지)
 */
export function resolveRecordMarks(tex: string, marks: RecordMark[], loose: number[], { highlight = false }: { highlight?: boolean } = {}): string {
  const head = [...loose]
  const s = scan(tex)
  const opens = new Map<number, number>()
  const closes = new Map<number, number>()
  for (const m of tex.matchAll(TOKEN)) {
    if (m[1] !== undefined) opens.set(Number(m[1]), m.index!)
    else closes.set(Number(m[2]), m.index!)
  }
  // 바꿀 일: [from, to)를 글로. 뒤에서부터 바꾼다
  const edits: { from: number; to: number; s: string }[] = []
  const before = new Map<number, string[]>()
  const lineStart = (at: number) => tex.lastIndexOf('\n', at - 1) + 1
  for (const [i, open] of opens) {
    const m = marks[i]!
    const close = closes.get(i)
    const openLen = OPEN(i).length
    const heading = HEADING_LINE.test(tex.slice(lineStart(open), open))
    const plain = !s.math[open] && !s.verbatim[open] && !heading
    if (highlight && close !== undefined && plain && !s.math[close] && close > open) {
      const between = tex.slice(open + openLen, close)
      if (wrappable(between.replace(TOKEN, ''))) {
        edits.push({ from: open, to: open + openLen, s: bann(m) })
        edits.push({ from: close, to: close + CLOSE(i).length, s: EANN })
        continue
      }
    }
    // 하이라이트가 안 되면 쪽지만: 보통 글이면 그 자리, 아니면 그 덩어리 앞
    edits.push({ from: open, to: open + openLen, s: plain ? note(m) : '' })
    if (close !== undefined) edits.push({ from: close, to: close + CLOSE(i).length, s: '' })
    if (!plain) {
      const at = blockStart(tex, open, s)
      if (at < 0) head.push(i)
      else before.set(at, [...(before.get(at) ?? []), note(m, true)])
    }
  }
  // 열지 못한 닫는 표시(겹친 기록)는 지운다
  for (const [i, close] of closes) if (!opens.has(i)) edits.push({ from: close, to: close + CLOSE(i).length, s: '' })
  for (const [at, notes] of before) edits.push({ from: at, to: at, s: `${notes.join('')}\n` })
  // 같은 자리에 넣는 것과 바꾸는 것이 겹치지 않게: 뒤에서부터, 같은 시작이면 넣기(from === to)를 나중에
  edits.sort((a, b) => b.from - a.from || (a.to - a.from) - (b.to - b.from))
  let out = tex
  for (const e of edits) out = out.slice(0, e.from) + e.s + out.slice(e.to)
  if (head.length) {
    const top = `\\pdfcomment[icon=Note,color={${COLORS.yellow}},author={${popupText(`기록 ${head.length}`)}},hoffset=-1.6em]{${popupText(head.map((i) => `${marks[i]!.title}\n\n${marks[i]!.text}`).join('\n\n'))}}\n`
    const doc = /\\begin\{document\}[^\n]*\n/.exec(out)
    out = doc ? out.slice(0, doc.index + doc[0].length) + top + out.slice(doc.index + doc[0].length) : top + out
  }
  return out
}
