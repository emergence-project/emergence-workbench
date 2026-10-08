import { ensureSyntaxTree, HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { type EditorState, Facet, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import katex from 'katex'
import { findCites, findMath, findWikiLinks } from './conceptLiveParse'
import { notePreview as prepareNotePreview } from './notePreview'
import { CITE, type RenderOptions } from './ObsidianMarkdown'
import { noteInline, noteRenderOptions, renderNoteFigure, renderNoteFootnote } from './noteRender'

/**
 * 개념노트 편집기의 "바로 보기" (Obsidian처럼): 커서가 없는 줄은 읽기 화면처럼 보이고, 커서가 들어간 줄·수식만 원문이 드러난다.
 * - 제목은 크게, `#`·`**`·`` ` `` 표시는 숨김
 * - `$…$`, `$$…$$`는 KaTeX로 그림 (기호 모음 macros 적용)
 * - `[[링크]]`는 보이는 이름만, `[@인용]`은 흐린 글자
 */
export const macrosFacet = Facet.define<Record<string, string> | undefined, Record<string, string> | undefined>({ combine: (v) => v[v.length - 1] })
type NotePreviewOptions = { options: RenderOptions; asset?(name: string): string } | undefined
export const notePreviewFacet = Facet.define<NotePreviewOptions, NotePreviewOptions>({ combine: (v) => v[v.length - 1] })

/** Markdown의 _·* 해석이 수식 안에서 시작하거나 끝나면 글의 강조가 아니다. */
export function overlapsMath(from: number, to: number, math: { from: number; to: number }[]): boolean {
  return math.some((m) => from < m.to && to > m.from)
}

class HtmlWidget extends WidgetType {
  constructor(readonly html: string, readonly block = false) { super() }
  eq(o: HtmlWidget) { return o.html === this.html && o.block === this.block }
  toDOM(view: EditorView) {
    const el = document.createElement(this.block ? 'div' : 'span')
    el.className = 'cm-note-widget'
    el.innerHTML = this.html
    el.addEventListener('click', (event) => { if ((event.target as Element).closest('.ob-cite')) event.preventDefault() })
    for (const img of el.querySelectorAll('img')) img.addEventListener('load', () => view.requestMeasure(), { once: true })
    return el
  }
  ignoreEvent() { return false }
}

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly block: boolean, readonly macros?: Record<string, string>) { super() }
  eq(o: MathWidget) { return o.tex === this.tex && o.block === this.block && o.macros === this.macros }
  toDOM() {
    const el = document.createElement(this.block ? 'div' : 'span')
    el.className = this.block ? 'cm-math cm-math-block' : 'cm-math'
    // KaTeX는 macros 객체에 \gdef를 적어 넣을 수 있어 수식마다 새로 복사한다
    el.innerHTML = katex.renderToString(this.tex, { displayMode: this.block, throwOnError: false, ...(this.macros && { macros: { ...this.macros } }) })
    return el
  }
  ignoreEvent() { return false } // 누르면 그 자리로 커서가 가서 원문이 열린다
}

class LabelWidget extends WidgetType {
  constructor(readonly label: string, readonly cls: string) { super() }
  eq(o: LabelWidget) { return o.label === this.label && o.cls === this.cls }
  toDOM() { const el = document.createElement('span'); el.className = this.cls; el.textContent = this.label; return el }
  ignoreEvent() { return false }
}

const hide = Decoration.replace({})
const listIndent = Decoration.mark({ class: 'cm-list-indent' })
const bullets = ['•', '◦', '▪'].map((label) => Decoration.replace({ widget: new LabelWidget(label, 'cm-bullet') }))

function build(state: EditorState): DecorationSet {
  const doc = state.doc
  const text = doc.toString()
  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state)
  const sel = state.selection.ranges
  const touches = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from)
  const lineOf = (p: number) => doc.lineAt(p)
  const lineTouched = (p: number) => { const l = lineOf(p); return touches(l.from, l.to) }

  // 1) 코드 자리 (그 안의 $는 수식이 아니다)
  const code: [number, number][] = []
  tree.iterate({ enter: (n) => { if (n.name === 'InlineCode' || n.name === 'FencedCode' || n.name === 'CodeBlock') { code.push([n.from, n.to]); return false } } })
  const note = state.facet(notePreviewFacet)
  const preview = note ? prepareNotePreview(text, code) : undefined
  const options = note && noteRenderOptions(text, note.options)
  const math = preview?.math ?? findMath(text, code)
  const inMath = (p: number) => math.some((m) => p >= m.from && p < m.to)

  const out: Range<Decoration>[] = []
  const spans = [...(preview?.comments ?? []), ...(preview?.footnotes ?? []), ...(preview?.figures ?? [])]
  // 큰 위젯 안의 각주·그림·주석은 그 위젯이 그린다. 겹친 replacement를 만들지 않는다.
  const covered = spans.filter((r) => !spans.some((outer) => outer !== r && outer.from <= r.from && outer.to >= r.to)
    && !(preview?.comments.includes(r) && math.some((m) => m.from <= r.from && m.to >= r.to)))
  const replace = (span: { from: number; to: number }, html: string) => {
    if (touches(span.from, span.to)) return
    const block = lineOf(span.from).from === span.from && lineOf(span.to).to === span.to
    out.push((html ? Decoration.replace({ widget: new HtmlWidget(html, block), block }) : hide).range(span.from, span.to))
  }
  if (preview && options) {
    for (const c of preview.comments) if (covered.includes(c)) replace(c, '')
    for (const f of preview.figures) if (covered.includes(f)) replace(f, renderNoteFigure(f, options, note?.asset, true))
    for (const f of preview.footnotes) if (covered.includes(f)) replace(f, renderNoteFootnote(f.content, f.n - 1, options))
    for (const r of preview.references) if (!overlapsMath(r.from, r.to, [...math, ...covered])) replace(r, noteInline(r.label, options))
    for (const l of preview.labels) if (!overlapsMath(l.from, l.to, [...math, ...covered])) replace(l, '')
    // 그림만 있는 문단 외의 Markdown 그림과 Obsidian 그림도 간결하게 보여 준다.
    const images: { from: number; to: number; html: string }[] = []
    tree.iterate({ enter: (n) => {
      if (n.name !== 'Image') return
      const m = /^!\[([^]*)\]\(([^()\s]+)\)$/.exec(text.slice(n.from, n.to))
      if (m) images.push({ from: n.from, to: n.to, html: renderNoteFigure({ n: '', caption: m[1]!, file: m[2]! }, options, note?.asset, true) })
      return false
    } })
    for (const m of text.matchAll(/!\[\[[^\]\n]+\]\]/g)) {
      images.push({ from: m.index, to: m.index + m[0].length, html: noteInline(m[0], options).replace(/<canvas[^>]*aria-label="([^"]*)"[^>]*><\/canvas>/g, '<span class="md-fig-missing">$1</span>') })
    }
    for (const img of images) if (!overlapsMath(img.from, img.to, [...math, ...covered, ...code.map(([from, to]) => ({ from, to }))])) {
      covered.push(img)
      replace(img, img.html)
    }
  }
  const macros = state.facet(macrosFacet)
  for (const m of math) {
    if (overlapsMath(m.from, m.to, covered)) continue
    if (touches(m.from, m.to)) { out.push(Decoration.mark({ class: 'cm-math-src' }).range(m.from, m.to)); continue }
    // 줄 전체를 차지하는 $$…$$만 블록으로 그린다 (글 사이의 $$는 줄 안에)
    const whole = m.block && lineOf(m.from).from === m.from && lineOf(m.to).to === m.to
    out.push(Decoration.replace({ widget: new MathWidget(m.tex, m.block, macros), block: whole }).range(m.from, m.to))
  }

  // 2) Markdown 표시
  tree.iterate({
    enter: (n) => {
      if (overlapsMath(n.from, n.to, covered) && covered.some((r) => n.from >= r.from && n.to <= r.to)) return false
      if (n.name === 'Emphasis' || n.name === 'StrongEmphasis') {
        if (overlapsMath(n.from, n.to, [...math, ...covered])) return false
        out.push(Decoration.mark({ class: n.name === 'Emphasis' ? 'cm-emphasis' : 'cm-strong' }).range(n.from, n.to))
      }
      const h = /^ATXHeading(\d)$/.exec(n.name)
      if (h) { out.push(Decoration.line({ class: `cm-h cm-h${h[1]}` }).range(lineOf(n.from).from)); return }
      if (inMath(n.from)) return math.some((m) => n.from >= m.from && n.to <= m.to) ? false : undefined
      switch (n.name) {
        case 'HeaderMark': {
          if (lineTouched(n.from)) return
          const to = doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to
          out.push(hide.range(n.from, to))
          return
        }
        case 'EmphasisMark':
          if (!lineTouched(n.from)) out.push(hide.range(n.from, n.to))
          return
        case 'CodeMark':
          if (n.node.parent?.name === 'InlineCode' && !lineTouched(n.from)) out.push(hide.range(n.from, n.to))
          return
        case 'ListMark': {
          // 10/8 11:55 피드백: 하위 항목의 들여쓰기 칸을 넓게 보인다 (글은 그대로, 커서가 있는 줄도 같은 폭)
          const line = lineOf(n.from)
          if (n.from > line.from && /^\s+$/.test(doc.sliceString(line.from, n.from))) out.push(listIndent.range(line.from, n.from))
          if (!/^[-*+]$/.test(doc.sliceString(n.from, n.to)) || lineTouched(n.from)) return
          let depth = 0
          for (let node = n.node.parent; node; node = node.parent) if (node.name === 'BulletList') depth++
          out.push(bullets[Math.min(depth, 3) - 1]!.range(n.from, n.to))
          return
        }
        case 'InlineCode': out.push(Decoration.mark({ class: 'cm-icode' }).range(n.from, n.to)); return
      }
    },
  })

  // 3) [[링크]]와 [@인용]
  for (const l of findWikiLinks(text)) {
    if (overlapsMath(l.from, l.to, [...math, ...covered]) || code.some(([a, b]) => l.from >= a && l.from < b)) continue
    out.push(touches(l.from, l.to) ? Decoration.mark({ class: 'cm-wikilink' }).range(l.from, l.to) : Decoration.replace({ widget: new LabelWidget(l.label, 'cm-wikilink') }).range(l.from, l.to))
  }
  if (options) {
    for (const c of text.matchAll(new RegExp(CITE))) {
      const span = { from: c.index, to: c.index + c[0].length }
      if (overlapsMath(span.from, span.to, [...math, ...covered]) || code.some(([a, b]) => span.from >= a && span.from < b)) continue
      replace(span, noteInline(c[0], options))
    }
  } else {
    for (const c of findCites(text)) if (!inMath(c.from)) out.push(Decoration.mark({ class: 'cm-cite' }).range(c.from, c.to))
  }

  return Decoration.set(out, true)
}

const liveField = StateField.define<DecorationSet>({
  create: build,
  update: (deco, tr) => (tr.docChanged || tr.selection || tr.reconfigured ? build(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
})

const style = HighlightStyle.define([
  { tag: tags.strong, fontWeight: 'var(--fw-strong)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.processingInstruction, color: 'var(--text-3)' }, // 숨기지 않은 # * ` 표시
  { tag: tags.quote, color: 'var(--text-2)' },
  { tag: tags.monospace, fontFamily: 'var(--editor-font)' },
])
// 강조만은 syntaxHighlighting에 맡기지 않는다: Markdown 트리는 수식 안의 _도 강조로 읽는다.
const liveStyle = HighlightStyle.define(style.specs.filter((s) => s.tag !== tags.emphasis && s.tag !== tags.strong))

/** 바로 보기: 읽기 화면처럼 그리기 */
export function livePreview() {
  return [liveField, syntaxHighlighting(liveStyle)]
}

/** 원문 보기: 색만 입힌 원문 (# * ` 표시가 그대로 보인다) */
export function sourceHighlight() {
  return syntaxHighlighting(style)
}
