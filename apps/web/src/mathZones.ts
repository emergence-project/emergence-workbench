import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { type EditorState, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { t } from './i18n'

/**
 * 노트 · 개념노트 편집기에서 수식 범위를 보인다 (10/28 21:39 피드백, 시안 "안 D + 안 A").
 * - 수식마다 옅은 회색 바탕(`--math-zone`)
 * - 여는 · 닫는 기호는 종류마다 색: `$` `--math-dollar`, `\(` `\)` `--math-paren`, `$$` `--math-display`, `\[` `\]` `--math-bracket`
 * - 닫히지 않은 `$$` · `\[` · `\(`는 여는 기호에 빨강 물결 밑줄 (줄 안 `$`는 금액일 수 있어 표시하지 않는다)
 * 바로 보기에서 커서가 없는 수식은 그림으로 바뀌므로 커서가 들어간 수식과 원문 보기에서 보인다.
 */
export type MathKind = 'dollar' | 'paren' | 'display' | 'bracket'
export type MathZone = { from: number; to: number; kind: MathKind; open: number; close: number; closed: boolean }

const CLOSER: Record<Exclude<MathKind, 'dollar'>, string> = { display: '$$', bracket: '\\]', paren: '\\)' }

/** 수식 범위와 기호 (코드 자리 `skip`은 건너뛴다). 줄 안 `$…$`는 findMath와 같은 규칙. */
export function findMathZones(text: string, skip: [number, number][] = []): MathZone[] {
  const out: MathZone[] = []
  const inSkip = (p: number) => skip.find(([a, b]) => p >= a && p < b)
  let i = 0
  while (i < text.length) {
    const s = inSkip(i)
    if (s) { i = s[1]; continue }
    const c = text[i]
    let kind: Exclude<MathKind, 'dollar'> | undefined
    if (c === '\\') {
      const n = text[i + 1]
      if (n === '[') kind = 'bracket'
      else if (n === '(') kind = 'paren'
      else { i += 2; continue }
    } else if (c === '$' && text[i + 1] === '$') kind = 'display'
    if (kind) {
      const end = text.indexOf(CLOSER[kind], i + 2)
      if (end < 0) { out.push({ from: i, to: i + 2, kind, open: 2, close: 0, closed: false }); i += 2; continue }
      out.push({ from: i, to: end + 2, kind, open: 2, close: 2, closed: true })
      i = end + 2
      continue
    }
    if (c !== '$') { i++; continue }
    let j = i + 1
    while (j < text.length && text[j] !== '\n' && !(text[j] === '$' && text[j - 1] !== '\\')) j++
    if (j < text.length && text[j] === '$' && j > i + 1 && !/\s/.test(text[i + 1]!) && !/\s/.test(text[j - 1]!)) {
      out.push({ from: i, to: j + 1, kind: 'dollar', open: 1, close: 1, closed: true })
      i = j + 1
    } else i++
  }
  return out
}

const zone = Decoration.mark({ class: 'cm-math-zone' })
const delim = Object.fromEntries((['dollar', 'paren', 'display', 'bracket'] as const).map((k) => [k, Decoration.mark({ class: `cm-math-delim cm-math-${k}` })])) as Record<MathKind, Decoration>
const unclosed = Decoration.mark({ class: 'cm-math-delim cm-math-unclosed', attributes: { title: t('닫히지 않은 수식', 'Unclosed math') } })

function build(state: EditorState): DecorationSet {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)
  const code: [number, number][] = []
  tree.iterate({ enter: (n) => { if (n.name === 'InlineCode' || n.name === 'FencedCode' || n.name === 'CodeBlock') { code.push([n.from, n.to]); return false } } })
  const out: Range<Decoration>[] = []
  for (const z of findMathZones(state.doc.toString(), code)) {
    if (!z.closed) { out.push(unclosed.range(z.from, z.from + z.open)); continue }
    out.push(zone.range(z.from, z.to))
    out.push(delim[z.kind].range(z.from, z.from + z.open))
    out.push(delim[z.kind].range(z.to - z.close, z.to))
  }
  return Decoration.set(out, true)
}

const zoneField = StateField.define<DecorationSet>({
  create: build,
  update: (deco, tr) => (tr.docChanged ? build(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
})

const theme = EditorView.baseTheme({
  '.cm-math-zone': { backgroundColor: 'var(--math-zone)', borderRadius: '2px' },
  '.cm-math-delim': { fontWeight: 'var(--fw-strong)' },
  '.cm-math-dollar': { color: 'var(--math-dollar)' },
  '.cm-math-paren': { color: 'var(--math-paren)' },
  '.cm-math-display': { color: 'var(--math-display)' },
  '.cm-math-bracket': { color: 'var(--math-bracket)' },
  '.cm-math-unclosed': { color: 'var(--danger)', textDecoration: 'underline wavy var(--danger)', textUnderlineOffset: '3px' },
})

export function mathZones() {
  return [zoneField, theme]
}
