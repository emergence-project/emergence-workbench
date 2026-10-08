/**
 * 노트 본문만 남기기 (10/4 05:04 "본문만 남기고, 컴파일러가 처리하도록", 15:41 "제목·저자 같은 것은 원고(노트)에 넣지 말라").
 * - 머리(\documentclass … \begin{document})는 앱의 LaTeX 서식이 붙인다.
 * - 제목·저자·소속·이메일·날짜 줄도 앱이 네트워킹의 저자 정보와 노트 이름으로 붙인다.
 * - 머리에 있던 이 노트만의 정의(\newcommand, \def, \DeclareMathOperator, \newtheorem)는 프로젝트 기호 파일로 옮긴다 (@가 든 내부 정의는 서식이 맡아 옮기지 않는다).
 *   서식에 이미 있는 것과 부딪히지 않게 \newcommand는 \providecommand로, \newtheorem은 없을 때만 정의한다.
 */

const stripComments = (s: string) => s.replace(/(^|[^\\])%.*$/gm, '$1')
/** 주석을 같은 길이의 빈칸으로 (찾은 위치를 원문에 그대로 쓰려고) */
const blankComments = (s: string) => s.replace(/(^|[^\\])(%.*)$/gm, (_m, a: string, c: string) => a + ' '.repeat(c.length))

/** \begin{document}과 \end{document} 사이 (없으면 전체) */
export function innerBody(text: string): string {
  const code = blankComments(text)
  const b = code.search(/\\begin\{document\}/)
  const start = b < 0 ? 0 : b + '\\begin{document}'.length
  const e = code.lastIndexOf('\\end{document}')
  const end = e < 0 || e < start ? text.length : e
  return text.slice(start, end).replace(/^[ \t]*\n/, '').replace(/\s+$/, '') + '\n'
}

export const hasMaketitle = (body: string) => /\\maketitle\b/.test(stripComments(body))
/** 본문이 제목이나 저자를 스스로 정하는지 (그러면 앱이 앞머리를 붙이지 않는다) */
export const hasFrontMatter = (body: string) => /\\(?:title|author)\s*[[{]/.test(stripComments(body))

const FRONT = /^\s*%?\s*\\(?:title|author|affiliation|altaffiliation|email|thanks|date|homepage|collaboration)\b/

/** 괄호가 닫힐 때까지 몇 줄을 차지하는지 (i줄부터) */
function spanOf(lines: string[], i: number): number {
  let depth = 0
  for (let j = i; j < lines.length; j++) {
    const code = lines[j]!.replace(/^\s*%/, '').replace(/(^|[^\\])%.*$/, '$1')
    for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth-- }
    if (depth <= 0) return j - i + 1
  }
  return 1
}

/** 제목·저자·소속·이메일·날짜 줄(주석으로 막아 둔 것 포함)을 뺀다. 뺀 줄 수도 돌려준다 */
export function stripFrontMatter(body: string): { body: string; removed: number } {
  const lines = body.split('\n')
  const out: string[] = []
  let removed = 0
  for (let i = 0; i < lines.length; i++) {
    if (FRONT.test(lines[i]!)) {
      const n = spanOf(lines, i)
      removed += n
      i += n - 1
      continue
    }
    out.push(lines[i]!)
  }
  // 앞머리를 빼고 남은 빈 줄이 겹치지 않게
  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, ''), removed }
}

/** 머리에서 이 노트만의 정의를 골라 note-macros.tex 내용으로 */
export function headDefinitions(text: string): string[] {
  const code = blankComments(text)
  const b = code.search(/\\begin\{document\}/)
  if (b < 0) return []
  const lines = text.slice(0, b).split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (!/^\s*\\(?:newcommand|renewcommand|providecommand|def|DeclareMathOperator|newtheorem)\b/.test(l)) continue
    const n = spanOf(lines, i)
    const block = lines.slice(i, i + n).join('\n')
    i += n - 1
    // \makeatletter 안의 내부 정의(@)는 서식이 맡는다 (옮기면 \makeatletter 없이 깨진다)
    if (block.includes('@')) continue
    const thm = /^\s*\\newtheorem\*?\{([A-Za-z]+)\}/.exec(block)
    if (thm) out.push(`\\ifcsname ${thm[1]}\\endcsname\\else ${block.trim()} \\fi`)
    else out.push(block.replace(/^(\s*)\\newcommand\b/, '$1\\providecommand'))
  }
  return out
}

export const NOTE_MACROS = 'note-macros.tex'

export const noteMacrosText = (from: string, lines: string[]) =>
  [`% ${from}의 머리에서 옮긴 정의 (공통 머리는 앱의 LaTeX 서식이 붙인다)`, ...lines, ''].join('\n')

/** 노트 main.tex를 본문만 남긴 글로: \begin{document} … \end{document} 안에 제목 줄 없는 본문. macros는 note-macros.tex에 둘 정의 */
export function toBodyOnly(text: string): { text: string; macros: string[]; removedHead: boolean; removedFront: number } {
  const removedHead = hasHead(text)
  const { body, removed } = stripFrontMatter(innerBody(text))
  return {
    text: ['\\begin{document}', '', body.replace(/\s+$/, ''), '', '\\end{document}', ''].join('\n'),
    macros: removedHead ? headDefinitions(text) : [],
    removedHead,
    removedFront: removed,
  }
}

/** \\begin{document} 앞에 주석·빈 줄 말고 무엇이 있는지 (\\documentclass나 \\input{setting} 같은 머리) */
export const hasHead = (text: string) => {
  const b = blankComments(text).search(/\\begin\{document\}/)
  return b > 0 && blankComments(text.slice(0, b)).trim() !== ''
}

/** 본문만 남길 것이 있는지 (머리나 제목 줄이 있으면) */
export const needsBodyOnly = (text: string) => hasHead(text) || FRONT_ANY.test(innerBody(text))

/**
 * 머리에서 \\input한 같은 폴더의 파일(예: setting.tex)을 그 자리에 펼친다. 떼어 낼 때 그 안의 정의와 \\documentclass도 보도록.
 * files: 펼친 파일 (노트 폴더 기준). 본문에서도 부르는 파일은 펼치지 않는다.
 */
export function expandHeadInputs(text: string, read: (rel: string) => string | null): { text: string; files: string[] } {
  const b = blankComments(text).search(/\\begin\{document\}/)
  if (b <= 0) return { text, files: [] }
  const body = blankComments(text.slice(b))
  const files: string[] = []
  const head = text.slice(0, b).replace(/^([ \t]*)\\(?:input|include)\s*\{([^}]+)\}/gm, (all, _sp: string, name: string) => {
    const rel = name.trim().endsWith('.tex') ? name.trim() : `${name.trim()}.tex`
    if (rel.includes('..') || rel.startsWith('/') || new RegExp(`\\\\(?:input|include)\\s*\\{${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.tex)?\\}`).test(body)) return all
    const inner = read(rel)
    if (inner === null) return all
    files.push(rel)
    return inner.replace(/\s+$/, '')
  })
  return { text: head + text.slice(b), files }
}
const FRONT_ANY = new RegExp(FRONT.source, 'm')
