import { startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { Decoration, EditorView, highlightActiveLine, keymap, placeholder } from '@codemirror/view'
import { useEffect, useRef, useState } from 'react'
import { conceptCommands, type Command } from './conceptCommands'
import { livePreview, macrosFacet, notePreviewFacet, sourceHighlight } from './conceptLive'
import { continueListItem, indentListItem, outdentListItem } from './conceptLists'
import { ObsidianMarkdown, type RenderOptions } from './ObsidianMarkdown'
import { NoteMarkdown } from './NoteMarkdown'
import { RecordContext, useRecordContext } from './RecordContext'
import { findRecordRange, selectionAnchor } from './recordAnchors'
import { readRecordSelection } from './recordMarks'
import { recordRevealRange } from './recordHelpers'
import { keepLineBreaks } from './lineBreaks'
import { t } from './i18n'

/**
 * 개념노트 본문 고치기 (3단계 편집기).
 * - 바로 보기(기본): Obsidian처럼 커서가 없는 줄은 읽기 화면처럼, 커서가 들어간 줄·수식만 원문이 보인다.
 * - 원문과 미리보기: 왼쪽 원문, 오른쪽 미리보기 (첫 판의 모양. 긴 수식을 고칠 때)
 * - "/"(줄 머리나 빈칸 뒤) 또는 ⌘K로 명령 메뉴, `[[`로 개념노트 찾기, `[@`로 출처 찾기.
 * 머리말은 여기서 고치지 않는다 (서버가 그대로 둔다). ⌘S · Esc는 바깥에 알린다 (노트 화면에서는 둘 다 "편집 완료").
 */
type Mode = 'live' | 'split' | 'source'

export function ConceptEditor({ initial, options, onSave, onCancel, commands, label = t('개념노트 본문', 'Concept note body'), hint = t('정의부터 적어 보세요. "/"로 틀과 수식을 넣을 수 있습니다.', 'Start with the definition. Type "/" to insert outlines and math.'), editView: mode, onChange, notePreview = false, asset }: {
  initial: string; options: RenderOptions; onSave(body: string): void; onCancel(dirty: boolean): void
  /**
   * 보기는 노트 툴바가 가진다 (10/10 노트 화면 틀): 원문(source) · 원문과 미리보기(split) · 미리보기(live, 커서가 있는 줄만 원문).
   * 저장 상태 · "편집 완료"도 툴바에 있다
   */
  editView: Mode
  /** 고칠 때마다 (자동 저장) */
  onChange?(body: string): void
  /** "/" 명령 목록 (연구노트·보조 노트는 자기 틀). 빼면 개념노트 틀 */
  commands?: Command[]
  /** 편집 칸 이름과 빈 칸 안내 */
  label?: string
  hint?: string
  /** 연구·계산·보조 노트만 문서 전체의 번호·참조·그림을 읽기 화면과 같이 그린다. */
  notePreview?: boolean
  asset?(name: string): string
}) {
  const host = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const parts = useRef({ mode: new Compartment(), macros: new Compartment(), note: new Compartment(), records: new Compartment() })
  const records = useRecordContext()
  const recordsRef = useRef(records)
  recordsRef.current = records
  const [text, setText] = useState(initial)
  const [shown, setShown] = useState(initial)
  const cb = useRef({ onSave, onCancel, initial, onChange })
  cb.current = { onSave, onCancel, initial, onChange }

  useEffect(() => {
    let selectionTimer: ReturnType<typeof setTimeout> | undefined
    const selected = (editor: EditorView) => {
      clearTimeout(selectionTimer)
      selectionTimer = setTimeout(() => {
        const context = recordsRef.current
        if (!context) return
        const selection = editor.state.selection.main
        const source = context.source.slice(0, context.contentOffset) + editor.state.doc.toString()
        const anchor = selectionAnchor(source, context.contentOffset + selection.from, context.contentOffset + selection.to)
        const rect = anchor && editor.coordsAtPos(selection.to)
        context.onSelect(anchor && rect ? { ...anchor, x: rect.left, y: rect.bottom } : null)
      }, 0)
    }
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          highlightActiveLine(),
          history(),
          // markdown()의 Enter(목록 잇기)보다 앞에 둔다: 목록은 코멘트 입력란과 같은 규칙으로. 자동 완성의 Enter(highest)는 그대로 먼저
          Prec.high(keymap.of([{ key: 'Enter', run: continueListItem }])),
          markdown(),
          conceptCommands(commands),
          parts.current.mode.of(mode === 'live' ? livePreview() : sourceHighlight()),
          parts.current.macros.of(macrosFacet.of(options.macros)),
          parts.current.note.of(notePreviewFacet.of(notePreview ? { options, asset } : undefined)),
          parts.current.records.of([]),
          placeholder(hint),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: (view) => { cb.current.onSave(keepLineBreaks(view.state.doc.toString(), cb.current.initial)); return true } },
            { key: 'Mod-k', preventDefault: true, run: startCompletion },
            { key: 'Escape', run: (view) => { cb.current.onCancel(keepLineBreaks(view.state.doc.toString(), cb.current.initial) !== cb.current.initial); return true } },
            { key: 'Tab', run: indentListItem, shift: outdentListItem },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.domEventHandlers({
            mouseup: (_event, editor) => { selected(editor); return false },
            click: (event, editor) => {
              const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-record-id]')
              if (!mark || !recordsRef.current || !editor.state.selection.main.empty) return false
              clearTimeout(selectionTimer)
              const rect = mark.getBoundingClientRect()
              recordsRef.current.onHighlight(mark.dataset.recordId!, { x: rect.left, y: rect.bottom })
              event.preventDefault(); event.stopPropagation()
              return true
            },
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) { const t = keepLineBreaks(u.state.doc.toString(), cb.current.initial); setText(t); cb.current.onChange?.(t) }
            if (u.selectionSet) selected(u.view)
          }),
        ],
      }),
    })
    view.current = v
    v.focus()
    return () => { clearTimeout(selectionTimer); v.destroy(); view.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 바로 보기 ↔ 원문과 미리보기
  useEffect(() => {
    view.current?.dispatch({ effects: parts.current.mode.reconfigure(mode === 'live' ? livePreview() : sourceHighlight()) })
  }, [mode])
  // 기호 모음(macros)은 나중에 도착할 수 있다
  useEffect(() => { view.current?.dispatch({ effects: parts.current.macros.reconfigure(macrosFacet.of(options.macros)) }) }, [options.macros])
  useEffect(() => { view.current?.dispatch({ effects: parts.current.note.reconfigure(notePreviewFacet.of(notePreview ? { options, asset } : undefined)) }) }, [notePreview, options, asset])
  useEffect(() => {
    const highlights = records?.highlights ?? []
    const contentOffset = records?.contentOffset ?? 0
    const prefix = records?.source.slice(0, contentOffset) ?? ''
    const decoration = EditorView.decorations.compute(['doc'], (state) => {
      const source = prefix + state.doc.toString()
      return Decoration.set(highlights.flatMap((highlight) => {
        if (highlight.page) return []
        const range = findRecordRange(source, highlight)
        if (!range || range.from < contentOffset) return []
        return [Decoration.mark({ class: 'record-highlight', attributes: { 'data-record-id': highlight.id, style: `background-color:var(--paint-${highlight.color});color:inherit` } }).range(range.from - contentOffset, range.to - contentOffset)]
      }), true)
    })
    view.current?.dispatch({ effects: parts.current.records.reconfigure(records ? decoration : []) })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- records 객체는 렌더마다 새로 만들어지므로 쓰는 칸만 본다
  }, [records?.highlights, records?.contentOffset, records?.source])

  useEffect(() => {
    const editor = view.current
    if (!editor || !records?.reveal) return
    const offset = records.contentOffset
    const source = records.source.slice(0, offset) + editor.state.doc.toString()
    const range = recordRevealRange(source, records.reveal)
    if (!range || range.from < offset) return
    const anchor = range.from - offset, head = range.to - offset
    editor.dispatch({ selection: { anchor, head }, effects: EditorView.scrollIntoView(anchor, { y: 'center' }) })
    editor.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록 열기(nonce)가 바뀔 때만 그 자리로 간다
  }, [records?.reveal?.nonce])

  // 미리보기는 입력이 잠깐 멈춘 뒤에 다시 그린다 (긴 노트에서도 타자가 밀리지 않게)
  useEffect(() => { if (mode !== 'split') return; const h = setTimeout(() => setShown(text), 200); return () => clearTimeout(h) }, [text, mode])
  const previewRecords = records && { ...records, source: records.source.slice(0, records.contentOffset) + shown }
  const selectPreview = () => {
    const selection = window.getSelection()
    if (records && preview.current && selection && previewRecords) records.onSelect(readRecordSelection(preview.current, selection, previewRecords.source, records.contentOffset))
  }
  return (
    <div className={`cn-edit ${mode === 'live' ? 'cn-edit-live' : mode === 'split' ? 'cn-edit-split' : 'cn-edit-source'}${notePreview ? ' md-note-preview' : ''}`} data-ui="개념노트 편집기">
      <div className="cn-edit-panes">
        <div className="cn-edit-src" ref={host} />
        {mode === 'split' && <div ref={preview} className="cn-edit-preview page-body cn-body" onMouseUp={selectPreview} onKeyUp={(event) => { if (event.key === 'Shift' || event.shiftKey) selectPreview() }}><RecordContext.Provider value={previewRecords}>{notePreview ? <NoteMarkdown text={shown} options={options} asset={asset} /> : <ObsidianMarkdown text={shown} options={options} />}</RecordContext.Provider></div>}
      </div>
    </div>
  )
}
