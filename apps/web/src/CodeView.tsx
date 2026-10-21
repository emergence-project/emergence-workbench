import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StreamParser } from '@codemirror/language'
import { javascript, json, typescript } from '@codemirror/legacy-modes/mode/javascript'
import { julia } from '@codemirror/legacy-modes/mode/julia'
import { python } from '@codemirror/legacy-modes/mode/python'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { tags } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

/**
 * 코드 · 글 파일을 읽기만 하는 보기 (프로젝트 정보 › 파일과 파일 탭, 10/21 "코드는?"): 줄 번호와 문법 색.
 * 색은 LaTeX 편집기(Editor.tsx)와 같은 정도로: 명령·예약어, 주석, 수 · 글자열.
 */
const MODES: Record<string, StreamParser<unknown>> = {
  py: python, jl: julia, sh: shell, zsh: shell, bash: shell, yaml: yaml, yml: yaml, toml: toml,
  js: javascript, mjs: javascript, cjs: javascript, ts: typescript, tsx: typescript, json: json,
  tex: stex, sty: stex, cls: stex, bib: stex,
}

const style = HighlightStyle.define([
  { tag: [tags.keyword, tags.tagName, tags.definitionKeyword], color: 'var(--code-cmd)' },
  { tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.string, tags.number, tags.atom, tags.bool], color: 'var(--code-math)' },
  { tag: tags.bracket, color: 'var(--text-3)' },
])

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--code-bg)', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--editor-font)', fontSize: 'var(--editor-size)', lineHeight: 'var(--editor-lh)' },
  '.cm-gutters': { backgroundColor: 'var(--code-bg)', color: 'var(--text-3)', border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--link) 22%, transparent) !important' },
})

export const codeModeOf = (path: string): string | null => {
  const ext = path.split('/').pop()!.split('.').pop()!.toLowerCase()
  return ext in MODES ? ext : null
}

export function CodeView({ path, text }: { path: string; text: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mode = codeModeOf(path)
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(), EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.lineWrapping, theme,
          ...(mode ? [StreamLanguage.define(MODES[mode]!), syntaxHighlighting(style)] : []),
        ],
      }),
    })
    return () => view.destroy()
  }, [path, text])
  return <div className="code-view" data-ui="코드 보기" ref={host} />
}
