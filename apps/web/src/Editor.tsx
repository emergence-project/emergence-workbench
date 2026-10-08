import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { codeFolding, foldedRanges, foldEffect, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, highlightActiveLine, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { parseBlock } from '@rw/core'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { keepLineBreaks } from './lineBreaks'
import { t, plural } from './i18n'

export interface EditorHandle {
  /** 줄들을 노랗게 표시하고 그 줄로 스크롤한다 (PDF → 원고 이동) */
  revealLines(from: number, to: number): void
  /** 내용을 바꾼다. 달라진 부분만 바꿔 커서와 스크롤을 지킨다 */
  replaceContent(content: string): void
  /** 끌어 고른 글과 그 줄 (고른 것이 없으면 null) */
  selection(): { from: number; to: number; start: number; end: number; text: string } | null
}

interface Props {
  initial: string
  errorLines: number[]
  /** 머리말을 고치는 화면 위치 안내 (별도 고치기 칸이 있을 때만) */
  headerHint?: string
  onChange(content: string): void
  /** 사용자가 커서를 옮긴 줄 (원고 → PDF 이동) */
  onCursorLine(line: number): void
  onSave(): void
  onCompile(): void
}

const setSync = StateEffect.define<{ from: number; to: number } | null>()
const setErrors = StateEffect.define<number[]>()

function lineDecos(state: EditorState, lines: number[], cls: string): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const n of [...new Set(lines)].sort((a, b) => a - b)) {
    if (n >= 1 && n <= state.doc.lines) ranges.push(Decoration.line({ class: cls }).range(state.doc.line(n).from))
  }
  return Decoration.set(ranges)
}

const syncField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setSync)) {
        if (!e.value) return Decoration.none
        const lines: number[] = []
        for (let i = e.value.from; i <= e.value.to; i++) lines.push(i)
        return lineDecos(tr.state, lines, 'cm-sync-line')
      }
    }
    // 사용자가 글을 고치면 이동 표시는 지운다
    return tr.docChanged ? Decoration.none : deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setErrors)) return lineDecos(tr.state, e.value, 'cm-error-line')
    return deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

/**
 * 머리말(% --- … % ---)은 한 줄로 접는다. 고치기 칸이 있으면 위치를 알리고, 누르면 펼쳐 볼 수 있다.
 * 줄 번호는 실제 파일 그대로라 SyncTeX 이동과 오류 줄 번호가 맞는다.
 */
function headerRange(state: EditorState): { from: number; to: number } | null {
  const p = parseBlock(state.doc.toString())
  if (!p.hasHeader || p.bodyStartLine < 3) return null
  return { from: state.doc.line(1).to, to: state.doc.line(p.bodyStartLine - 1).to }
}

function foldHeader(view: EditorView): void {
  const r = headerRange(view.state)
  if (!r) return
  let already = false
  foldedRanges(view.state).between(r.from, r.to, (from) => { if (from === r.from) already = true })
  if (!already) view.dispatch({ effects: foldEffect.of(r) })
}

const headerFolding = (hint?: string) => codeFolding({
  placeholderDOM(view, onclick) {
    const el = document.createElement('span')
    const r = headerRange(view.state)
    const n = r ? view.state.doc.lineAt(r.to).number - 1 : 0
    el.className = 'cm-header-fold'
    el.textContent = t(` 머리말 ${n}줄${hint ? ` — ${hint}` : ''} (눌러서 펼치기)`, ` Header, ${plural(n, 'line')}${hint ? `: ${hint}` : ''} (click to expand)`)
    el.onclick = onclick
    return el
  },
})

const latexHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-cmd)' },
  { tag: tags.tagName, color: 'var(--code-cmd)' },
  { tag: tags.bracket, color: 'var(--text-3)' },
  { tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.atom, tags.number], color: 'var(--code-math)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--code-bg)', color: 'var(--text)' },
  // 글꼴·크기·줄 간격은 설정 화면에서 바꾼다 (ui.ts가 --editor-* 값을 정한다)
  '.cm-scroller': { fontFamily: 'var(--editor-font)', fontSize: 'var(--editor-size)', lineHeight: 'var(--editor-lh)' },
  '.cm-gutters': { backgroundColor: 'var(--code-bg)', color: 'var(--text-3)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-sync-line': { backgroundColor: 'var(--focus)', boxShadow: 'inset 3px 0 0 var(--focus-line)' },
  '.cm-error-line': { backgroundColor: 'var(--danger-bg)', boxShadow: 'inset 3px 0 0 var(--danger)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-header-fold': { color: 'var(--text-3)', fontStyle: 'italic', cursor: 'pointer', fontFamily: '-apple-system, sans-serif', fontSize: '12px' },
  '.cm-header-fold:hover': { color: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--link) 22%, transparent) !important' },
})

export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cb = useRef(props)
  cb.current = props
  const programmatic = useRef(false)

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: props.initial,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => { cb.current.onSave(); return true } },
            { key: 'Mod-Enter', preventDefault: true, run: () => { cb.current.onCompile(); return true } },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          StreamLanguage.define(stex),
          syntaxHighlighting(latexHighlight),
          EditorView.lineWrapping,
          headerFolding(props.headerHint),
          syncField,
          errorField,
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(keepLineBreaks(u.state.doc.toString(), cb.current.initial))
            if (u.selectionSet && !programmatic.current && (u.docChanged || u.transactions.some((t) => t.isUserEvent('select')))) {
              cb.current.onCursorLine(u.state.doc.lineAt(u.state.selection.main.head).number)
            }
          }),
        ],
      }),
    })
    view.current = v
    foldHeader(v)
    return () => v.destroy()
    // 블록이 바뀌면 부모가 key로 새 편집기를 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: setErrors.of(props.errorLines) })
  }, [props.errorLines])

  useImperativeHandle(ref, () => ({
    selection() {
      const v = view.current
      const r = v?.state.selection.main
      if (!v || !r || r.empty) return null
      return { from: v.state.doc.lineAt(r.from).number, to: v.state.doc.lineAt(r.to).number, start: r.from, end: r.to, text: v.state.sliceDoc(r.from, r.to) }
    },
    revealLines(from, to) {
      const v = view.current
      if (!v) return
      const last = v.state.doc.lines
      const a = Math.min(Math.max(1, from), last)
      const b = Math.min(Math.max(a, to), last)
      const pos = v.state.doc.line(a).from
      programmatic.current = true
      v.dispatch({
        selection: { anchor: pos },
        effects: [setSync.of({ from: a, to: b }), EditorView.scrollIntoView(pos, { y: 'center' })],
      })
      programmatic.current = false
      v.focus()
    },
    replaceContent(raw) {
      const v = view.current
      if (!v) return
      // 편집기 안은 \n 하나 (꺼낼 때 keepLineBreaks가 원래 줄바꿈으로 되돌린다)
      const content = raw.replace(/\r\n?/g, '\n')
      const old = v.state.doc.toString()
      if (old === content) return
      let start = 0
      while (start < old.length && start < content.length && old[start] === content[start]) start++
      let endOld = old.length, endNew = content.length
      while (endOld > start && endNew > start && old[endOld - 1] === content[endNew - 1]) { endOld--; endNew-- }
      programmatic.current = true
      v.dispatch({ changes: { from: start, to: endOld, insert: content.slice(start, endNew) } })
      programmatic.current = false
      foldHeader(v)
    },
  }), [])

  return <div className="editor-host" data-ui="LaTeX 편집기" ref={host} />
})
