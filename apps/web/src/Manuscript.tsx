import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConflictError, notesApi, type NoteRow, type BlockRow, type LibraryInfo, type ManuscriptInfo, type ManuscriptPart, type ResearchApi, type ResearchSummary } from './api'
import type { BlockStatus } from '@rw/core'
import type { FlashAction } from './App'
import { statusLabel, statusOf } from './format'
import { StatusDot } from './StatusDot'
import { NOTE_STATE, NoteStatus } from './NoteStatus'
import { applyManuscriptPdf, beginManuscriptRefresh, getSession, hasPendingParts, manuscriptPdfLabel, pdfShortNote, partStateWithoutTab, runManuscriptCompile, sessionKey, setPartSaveState, setSession, useSession, type PartSaveState } from './blockSession'
import { Editor, type EditorHandle } from './Editor'
import { CommentablePdf, manuscriptTarget, noteTarget, useSlot } from './Comments'
import { go } from './router'
import { CitedPapers } from './Materials'
import { openRecordComposer } from './RecordContext'
import { recordRevealRange, recordSelectionFromLines } from './recordHelpers'
import { Icon } from './icons'
import { NoteHead, NoteTitleInput, type ToolbarItem, type ToolbarSave } from './NoteToolbar'
import { NoteScreen } from './NoteScreenFrame'
import { latexSections, sectionAtLine, useRightMode } from './noteScreen'
import { TRASH_DAYS, trashNoteWithUndo } from './Topics'
import { CompileSettings, ExportLink, groupOf, savedLatexChoice } from './NoteExport'
import { MarkdownNoteBody } from './MarkdownNote'
import { NOTE_KIND_LABEL } from './NewNote'
import { groupPartProblems } from './partProblems'
import { useFileEvents } from './autosave'
import { useNoteEdit } from './noteEdit'
import { plural, t } from './i18n'

/** 원고 전체가 한 PDF라 메인 노트마다 세션 하나 */
export const msKey = (rid: string, ms = '') => sessionKey(rid, ms ? `__manuscript-${ms}` : '__manuscript')

function usePartPending(key: string, file: string) {
  const current = useRef({ key, file, state: 'saved' as PartSaveState, open: true })
  useEffect(() => {
    const c = current.current
    if (c.key !== key || c.file !== file) setPartSaveState(c.key, c.file, 'saved')
    c.key = key
    c.file = file
    c.open = true
    setPartSaveState(key, file, c.state)
    // 탭을 닫으면 그 탭의 고치는 중·충돌·오류 표시를 지운다. 진행 중인 자동 저장은 끝나면 스스로 지운다
    return () => { c.open = false; setPartSaveState(c.key, c.file, partStateWithoutTab(c.state)) }
  }, [key, file])
  return useCallback((state: PartSaveState) => {
    const c = current.current
    c.state = state
    setPartSaveState(c.key, c.file, c.open ? state : partStateWithoutTab(state))
  }, [])
}

/** 장 열기. 한 파일 원고의 절이면 그 파일을 열고 \section 줄로 간다 */
export function openPart(rid: string, info: ManuscriptInfo, p: ManuscriptPart) {
  if (p.line) setSession(msKey(rid, info.key), { reveal: { file: p.file, line: p.line, nonce: Date.now() } })
  go({ page: 'part', rid, file: p.file })
}

/** 원고 컴파일 — 장 탭과 PDF 탭이 함께 쓴다. 결과는 세션에 남겨 두 탭이 같이 본다. 서식·저자·날짜는 컴파일 설정에서 기억한 것 */
export async function compileManuscript(rid: string, rapi: ResearchApi, info: Pick<ManuscriptInfo, 'key' | 'kind'> | null | undefined): Promise<void> {
  if (!info) throw new Error(t('원고 정보를 읽은 뒤 컴파일하세요.', 'Compile after the manuscript info has loaded.'))
  const ms = info.key
  const key = msKey(rid, ms)
  await runManuscriptCompile(key, () => rapi.compileManuscript(ms, savedLatexChoice(rid, groupOf(info))))
}

/**
 * 원고의 장·부록 하나: 프로젝트 원고 파일(예: docs/model/chapters/08-phase.tex)을 그 자리에서 고친다.
 * 저장은 블록과 같은 안전장치. 커서를 옮기면 원고 PDF에 그 위치를 표시하고, PDF를 누르면 이 탭의 그 줄로 온다.
 */
type PartProps = {
  rid: string; file: string; info: ManuscriptInfo | null; rapi: ResearchApi; summary: ResearchSummary; onSaved(msg: string, action?: FlashAction): void; library?: LibraryInfo | null; onLibraryChanged?(): void
  /** 컴파일이 끝나면 PDF를 옆 칸에 보인다 (10/5 09:52 피드백). ⋯ "PDF 보기"도 이것 */
  onShowPdf?(): void
  /** 노트 한 목록의 줄 (연구노트·계산 노트면 이름·상태·고친 때) */
  row?: NoteRow | null
  /** 지금 칸에서 보이는 탭이면 그 key (왼쪽 사이드바 절 목차에 알린다) */
  tocOwner?: string | null
  /** 이름을 고치거나 지운 뒤 목록을 다시 읽게 */
  onChanged?(): void
  /** 파일 알림 (workbench/notes·calc의 노트를 에이전트가 바꾸면) */
  bus?: EventTarget
}

/** Markdown 노트(note.md)는 읽기·고치기 화면, LaTeX 원고·노트는 LaTeX 편집기 */
export function PartTab(props: PartProps) {
  return props.file.endsWith('.md') ? <MarkdownPartTab key={props.file} {...props} /> : <LatexPartTab {...props} />
}


/** 원고 PDF의 상태를 이 탭에도 (원고 목록이 가진 값으로 시작, 컴파일하면 세션이 바뀐다) */
function useMsPdf(key: string, info: ManuscriptInfo | null) {
  const s = useSession(key)
  useEffect(() => {
    if (info && !getSession(key).manuscriptPdf) applyManuscriptPdf(key, { ...info, pdfState: info.pdfState ?? (info.hasPdf ? 'unknown' : 'missing') })
  }, [info, key])
  /** 저장하면 보이는 PDF는 이전 결과가 된다 */
  const markStale = useCallback(() => {
    const st = getSession(key).manuscriptPdf
    if (st?.hasPdf && st.pdfState === 'current') setSession(key, { manuscriptPdf: { ...st, pdfState: 'stale' } })
  }, [key])
  return { s, markStale }
}

/** ⋯ 메뉴의 공통 항목: PDF 보기 · 내보내기 · 파일 다시 읽기 · Finder에서 보기 · 지우기 */
function partMenu({ rid, rapi, info, file, row, onShowPdf, onSaved, onChanged, csOpen, exOpen, reload }: {
  rid: string; rapi: ResearchApi; info: ManuscriptInfo | null; file: string; row?: NoteRow | null; onShowPdf?(): void; onSaved(m: string, action?: FlashAction): void; onChanged?(): void
  csOpen(): void; exOpen(): void; reload(): void
}): ToolbarItem[] {
  const note = !!info && info.kind !== 'paper' && info.main === file
  return [
    ...(info && !info.ownHeader ? [{ label: t('컴파일 서식 고르기…', 'Choose compile template…'), ui: '컴파일 설정', tip: t('서식·저자·날짜를 고릅니다. ▶ 컴파일과 내보내기가 같이 씁니다', 'Choose template, authors and date. Used by both ▶ Compile and Export'), onClick: csOpen }] : []),
    ...(onShowPdf ? [{ label: t('PDF 보기', 'View PDF'), ui: 'PDF 보기', tip: t('지난번 컴파일한 PDF를 옆 패널에 엽니다', 'Opens the last compiled PDF in the other pane'), onClick: onShowPdf, disabled: !info?.hasPdf }] : []),
    ...(info ? [{ label: t('내보내기…', 'Export…'), ui: '노트 내보내기', tip: t('그대로 컴파일되는 LaTeX 폴더(zip)로 받습니다', 'Download as a LaTeX folder (zip) that compiles as is'), onClick: exOpen }] : []),
    { label: t('파일 다시 읽기', 'Reload file'), ui: '파일 다시 읽기', tip: t('파일을 다시 읽습니다. 이 화면에서 저장하지 않은 고침은 버립니다', 'Reads the file again. Unsaved edits on this screen are discarded'), onClick: reload },
    ...(row ? [{ label: t('Finder에서 보기', 'Show in Finder'), ui: 'Finder에서 보기', onClick: () => { notesApi(rid).reveal(row.file).catch((e: Error) => onSaved(e.message)) } }] : []),
    ...(note && info ? [{ label: t('지우기', 'Delete'), ui: '노트 지우기', danger: true, tip: t(`${TRASH_DAYS}일 보관 뒤 지웁니다`, `Kept for ${TRASH_DAYS} days, then deleted`), onClick: () => void trashNoteWithUndo(rapi, info, () => onChanged?.(), onSaved) }] : []),
  ]
}

/** 고친 이름을 노트 머리말에 (연구노트·계산 노트는 note.yaml의 name) */
async function commitTitle(rid: string, row: NoteRow | null | undefined, draft: string | null, onSaved: (m: string) => void): Promise<boolean> {
  const name = draft?.replace(/\s+/g, ' ').trim()
  if (!row || !name || name === row.title) return false
  try { await notesApi(rid).setHead(row.file, { title: name }, row.hash); onSaved(t(`이름을 "${name}"로 바꿨습니다`, `Renamed to "${name}"`)); return true } catch (e) {
    onSaved(e instanceof ConflictError ? t('다른 곳에서 노트 정보가 바뀌어 이름을 바꾸지 않았습니다. 다시 해 주세요.', 'Not renamed: the note info changed elsewhere. Try again.') : (e as Error).message)
    return false
  }
}

/** 연구노트·계산 노트의 상태는 본문과 별개인 note.yaml에, 읽은 머리말 해시로 고친다. */
function ResearchNoteStatus({ row, rapi, onSaved, onChanged }: Pick<PartProps, 'row' | 'rapi' | 'onSaved' | 'onChanged'>) {
  const [busy, setBusy] = useState(false)
  const changeStatus = async (status: BlockStatus) => {
    if (!row || row.ms === undefined || status === row.status || busy) return
    setBusy(true)
    try {
      await rapi.setNoteMeta(row.ms, { state: NOTE_STATE[status] }, row.hash)
      onChanged?.()
      onSaved(t(`상태를 ${statusLabel(status)}으로 바꿨습니다`, `Status changed to ${statusLabel(status)}`))
    } catch (e) {
      onSaved(e instanceof ConflictError ? t('다른 곳에서 노트 정보가 바뀌어 상태를 바꾸지 않았습니다. 다시 해 주세요.', 'Status not changed: the note info changed elsewhere. Try again.') : (e as Error).message)
    } finally { setBusy(false) }
  }
  return row ? <NoteStatus status={row.status} title={row.resume ? t(`다시 열 조건: ${row.resume}`, `Reopen when: ${row.resume}`) : undefined}
    onChange={row.type !== 'block' && row.ms !== undefined ? (status) => void changeStatus(status) : undefined} disabled={busy} /> : null
}

/**
 * Markdown + KaTeX 연구노트·계산 노트 (10/4 결정): 개념노트처럼 읽기가 기본이고 고치기로 편집기를 연다.
 * 고치는 동안 저절로 저장하고 "편집 완료"(Esc)으로 마친다 (10/5 노트 도구 줄). 저장은 원고 장과 같은 안전장치 (읽은 뒤 바깥에서 바뀌었으면 덮어쓰지 않는다).
 */
function MarkdownPartTab({ rid, file, info, rapi, onSaved, library, onLibraryChanged, onShowPdf, row, tocOwner, onChanged, bus }: PartProps) {
  const key = msKey(rid, info?.key)
  const { s: ms, markStale } = useMsPdf(key, info)
  const markPending = usePartPending(key, file)
  const [text, setText] = useState<string | null>(null)
  const [cs, setCs] = useState(false)
  const [ex, setEx] = useState(false)
  const edit = useNoteEdit(`${rid}/${file}`, {
    write: async (text, hash) => { const next = await rapi.savePart(file, text, hash); markStale(); return next },
    onState: markPending,
    mtime: row?.mtime,
  })
  const { saver, state: save, editing, view, titleDraft, setTitleDraft, notice, setNotice } = edit
  const load = useCallback(async (msg?: string) => {
    const d = await rapi.readPart(file)
    saver.load(d.content, d.hash)
    setText(d.content)
    if (msg) setNotice(msg)
  }, [rapi, file, saver, setNotice])
  useEffect(() => { load().catch((e: Error) => setNotice(e.message)) }, [load, setNotice])
  const editingRef = useRef(editing)
  editingRef.current = editing
  useFileEvents(bus, saver, (e) => (e.type === 'note' && e.research === rid && e.file === file ? e.hash : undefined), {
    gone: () => setNotice(t('이 노트 파일이 지워졌습니다.', 'This note file was deleted.')),
    // 읽기 화면이면 새 내용을 보이고, 고치는 중이면(저장된 상태여도) 편집기를 닫지 않고 알리기만 한다
    reload: () => { if (editingRef.current) { saver.conflict(); return } void load(t('바깥(에이전트나 다른 편집기)에서 바뀐 내용을 불러왔습니다.', 'Loaded changes made outside (by an agent or another editor).')).catch((e: Error) => setNotice(e.message)) },
  })

  const saveNow = edit.saveNow
  const onDraft = useCallback((full: string) => saver.edit(full), [saver])
  const startEdit = () => edit.start(row?.title ?? info?.name ?? '')
  const finish = () => edit.finish(async (draft) => {
    setText(saver.text)
    if (await commitTitle(rid, row, draft, onSaved)) onChanged?.()
  })
  const reload = () => { edit.setEditing(false); void load(t('파일을 다시 읽었습니다. 이 화면에서 저장하지 않은 고침은 버렸습니다.', 'Reloaded the file. Unsaved edits on this screen were discarded.')).catch((e: Error) => setNotice(e.message)) }
  const compile = async () => {
    if (!(await saveNow())) return setNotice(t('저장하지 못해 컴파일하지 않았습니다.', 'Not compiled: saving failed.'))
    try { await compileManuscript(rid, rapi, info) } catch (e) { setNotice((e as Error).message); return }
    const r = getSession(key).result
    if (r) onSaved(r.ok ? t(`PDF를 만들었습니다 (${(r.durationMs / 1000).toFixed(0)}초)`, `PDF built (${(r.durationMs / 1000).toFixed(0)}s)`) : t(`PDF 만들기: 오류 ${r.problems.length}`, `PDF build: ${plural(r.problems.length, 'error')}`))
    if (r?.hasPdf) onShowPdf?.()
  }
  const problems = ms.result?.problems ?? []
  const title = row?.title ?? info?.name ?? file
  const conflict = save === 'conflict'
  const mode = useRightMode()
  return (
    <NoteScreen ui="원고 장" className="md-note" notice={notice} onCloseNotice={() => setNotice(null)} tocOwner={tocOwner}
      toolbar={{
        title: editing && row ? <NoteTitleInput title={title} draft={titleDraft ?? title} onDraft={setTitleDraft} /> : undefined,
        status: <ResearchNoteStatus row={row} rapi={rapi} onSaved={onSaved} onChanged={onChanged} />, save, savedAt: edit.savedAt, pdfNote: pdfShortNote(ms.manuscriptPdf), editing,
        saveAction: edit.saveAction(reload),
        view, onView: edit.setView,
        onEdit: startEdit, editDisabled: text === null || conflict, onDone: () => void finish(),
        onComment: () => openRecordComposer(rid, noteTarget(file, title) ?? manuscriptTarget(undefined, info?.key)), commentOn: mode === 'records',
        onCompile: () => void compile(), compiling: ms.compiling, compileDisabled: !info || text === null || conflict, compileTip: t(`컴파일 — ${title}`, `Compile: ${title}`), compileUi: '원고 컴파일',
        menu: partMenu({ rid, rapi, info, file, row, onShowPdf, onSaved, onChanged, csOpen: () => setCs(true), exOpen: () => setEx(true), reload }),
        anchors: info && <>
          {cs && <CompileSettings rid={rid} ms={info} control={{ open: cs, setOpen: setCs }} disabled={ms.compiling || text === null} onCompile={() => void compile()} />}
          {ex && <ExportLink rid={rid} ms={info} control={{ open: ex, setOpen: setEx }} />}
        </>,
      }}>
        {problems.length > 0 && (
          <div className="problems"><div className="problems-head">{t(`PDF 오류 ${problems.length}`, `PDF errors ${problems.length}`)}</div>
            {problems.slice(0, 8).map((p, i) => <div key={i} className="problem"><span>{p.message}</span></div>)}
          </div>
        )}
        {text !== null && <MarkdownNoteBody rid={rid} text={text} rapi={rapi} kind="note" file={file} target={noteTarget(file, info?.name)} editing={editing}
          view={view} onDraft={onDraft} tocOwner={tocOwner}
          head={!editing && <NoteHead title={title} editing={false} />}
          footer={<CitedPapers rid={rid} rapi={rapi} text={text} file={file} library={library} onSaved={onSaved} onLibraryChanged={onLibraryChanged} />}
          onSave={(t) => { onDraft(t); void finish() }} onCancel={() => void finish()} />}
    </NoteScreen>
  )
}

function LatexPartTab({ rid, file, info, rapi, summary, onSaved, library, onLibraryChanged, onShowPdf, row, tocOwner, onChanged, bus }: PartProps) {
  const key = msKey(rid, info?.key)
  const { s: ms, markStale } = useMsPdf(key, info)
  const markPending = usePartPending(key, file)
  // 한 파일 원고면 장(절)이 여럿이라 파일 하나로 장을 고르지 않는다
  const part = info?.parts.find((p) => p.file === file && !p.line)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [cs, setCs] = useState(false)
  const [ex, setEx] = useState(false)
  const [cursorLine, setCursorLine] = useState(1)
  const editor = useRef<EditorHandle>(null)
  const viewTimer = useRef<number | undefined>(undefined)
  // 본문은 늘 고치는 중이고, 연필은 이름만 고친다 (연구노트·계산 노트만)
  const edit = useNoteEdit(`${rid}/${file}`, {
    write: async (text, hash) => { const next = await rapi.savePart(file, text, hash); markStale(); return next },
    onState: markPending,
    mtime: row?.mtime,
  })
  const { saver, state, titleDraft, setTitleDraft, notice, setNotice } = edit
  /** 편집기의 지금 글 (저장기가 가진다) */
  const content = { get current() { return saver.text } }

  const load = useCallback(async (msg?: string) => {
    const d = await rapi.readPart(file)
    saver.load(d.content, d.hash)
    if (loaded !== null) editor.current?.replaceContent(d.content)
    else setLoaded(d.content)
    if (msg) setNotice(msg)
  }, [rapi, file, loaded, saver, setNotice])
  useEffect(() => { load().catch((e: Error) => setNotice(e.message)) }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = edit.saveNow
  const onChange = useCallback((text: string) => saver.edit(text), [saver])
  useFileEvents(bus, saver, (e) => (e.type === 'note' && e.research === rid && e.file === file ? e.hash : undefined), {
    gone: () => setNotice(t('이 노트 파일이 지워졌습니다.', 'This note file was deleted.')),
    reload: () => void load(t('바깥(에이전트나 다른 편집기)에서 바뀐 내용을 불러왔습니다.', 'Loaded changes made outside (by an agent or another editor).')).catch((e: Error) => setNotice(e.message)),
  })

  const compile = async () => {
    if (!(await save())) return setNotice(t('저장하지 못해 컴파일하지 않았습니다.', 'Not compiled: saving failed.'))
    try { await compileManuscript(rid, rapi, info) } catch (e) { setNotice((e as Error).message); return }
    const r = getSession(key).result
    if (r) onSaved(r.ok ? t(`원고 컴파일 완료 (${(r.durationMs / 1000).toFixed(0)}초)`, `Manuscript compiled (${(r.durationMs / 1000).toFixed(0)}s)`) : t(`원고 컴파일: 오류 ${r.problems.length}`, `Manuscript compile: ${plural(r.problems.length, 'error')}`))
    if (r?.hasPdf) onShowPdf?.()
  }

  const onCursorLine = useCallback((line: number) => {
    setCursorLine(line)
    if (getSession(key).pdfVersion === null) return
    window.clearTimeout(viewTimer.current)
    viewTimer.current = window.setTimeout(() => {
      rapi.manuscriptView(file, line).then((r) => setSession(key, { highlight: r.boxes })).catch(() => undefined)
    }, 200)
  }, [rapi, file, key])

  // PDF에서 이 장의 위치를 누르면 그 줄로
  const lastNonce = useRef(0)
  useEffect(() => {
    const r = ms.reveal
    if (!r || r.file !== file || r.nonce === lastNonce.current || loaded === null) return
    lastNonce.current = r.nonce
    editor.current?.revealLines(r.line, r.line)
  }, [ms.reveal, file, loaded])

  const recordSlot = useSlot(rid, manuscriptTarget(undefined, info?.key).target)
  useEffect(() => {
    if (!recordSlot.reveal || loaded === null) return
    const record = recordSlot.file?.comments.find((entry) => entry.id === recordSlot.reveal!.id)
    const range = record && recordRevealRange(content.current, record)
    if (range) editor.current?.revealLines(content.current.slice(0, range.from).split('\n').length, content.current.slice(0, range.to).split('\n').length)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록 열기(nonce)가 바뀔 때만 그 자리로 간다
  }, [recordSlot.reveal?.nonce, file, loaded])

  // 절 목차: \section 줄. 커서가 든 절이 지금 절 (편집기는 늘 고치는 중이라 커서를 따라간다)
  const sections = useMemo(() => latexSections(loaded === null ? '' : content.current), [loaded, state]) // eslint-disable-line react-hooks/exhaustive-deps
  const jump = useCallback((i: number) => { const sec = sections[i]; if (sec) editor.current?.revealLines(sec.line, sec.line) }, [sections])

  /** 본문만 남긴 노트 (원고 목록이 다시 읽히기 전까지 안내를 숨긴다) */
  const [stripped, setStripped] = useState<string | null>(null)
  const problems = (ms.result?.problems ?? []).filter((p) => p.file === file)
  const { open, records, stopped, solved } = groupPartProblems(info?.parts ?? [], file, summary.blocks)
  const problemChip = (b: BlockRow) => (
    <button key={b.id} className="dep-chip" title={b.next ? t(`다음: ${b.next}`, `Next: ${b.next}`) : undefined} onClick={() => go({ page: 'block', rid, bid: b.id })}>
      <StatusDot s={statusOf(b.status)} /> {b.title ?? b.id} · {statusLabel(statusOf(b.status))}
    </button>
  )
  const title = row?.title ?? (part ? `${part.appendix ? t('부록 · ', 'Appendix · ') : ''}${part.title}` : info?.name ?? file)
  const finishTitle = () => edit.finish(async (draft) => { if (await commitTitle(rid, row, draft, onSaved)) onChanged?.() })
  const mode = useRightMode()
  const toolbarSave: ToolbarSave = state
  return (
    <NoteScreen ui="원고 장" notice={notice} onCloseNotice={() => setNotice(null)} tocOwner={tocOwner} toc={{ sections, current: sectionAtLine(sections, cursorLine), jump }}
      toolbar={{
        title: titleDraft !== null ? <NoteTitleInput title={title} draft={titleDraft} onDraft={setTitleDraft} /> : undefined,
        status: <ResearchNoteStatus row={row} rapi={rapi} onSaved={onSaved} onChanged={onChanged} />, save: toolbarSave, savedAt: edit.savedAt, pdfNote: pdfShortNote(ms.manuscriptPdf), editing: titleDraft !== null, onDone: () => void finishTitle(),
        saveAction: edit.saveAction(() => void load(t('파일을 다시 읽었습니다. 이 화면에서 고친 내용은 버렸습니다.', 'Reloaded the file. Edits on this screen were discarded.')).catch((e: Error) => setNotice(e.message))),
        onEdit: row ? () => edit.start(row.title, false) : undefined,
        onComment: () => openRecordComposer(rid, noteTarget(file, title) ?? manuscriptTarget(undefined, info?.key), recordSelectionFromLines(content.current, editor.current?.selection() ?? null)), commentOn: mode === 'records',
        onCompile: () => void compile(), compiling: ms.compiling, compileDisabled: !info || loaded === null, compileTip: t(`컴파일 — ${info?.name ?? file}`, `Compile: ${info?.name ?? file}`), compileKey: true, compileUi: '원고 컴파일',
        menu: partMenu({ rid, rapi, info, file, row, onShowPdf, onSaved, onChanged, csOpen: () => setCs(true), exOpen: () => setEx(true), reload: () => void load(t('파일을 다시 읽었습니다. 이 화면에서 고친 내용은 버렸습니다.', 'Reloaded the file. Edits on this screen were discarded.')),
        }),
        anchors: info && <>
          {cs && <CompileSettings rid={rid} ms={info} control={{ open: cs, setOpen: setCs }} disabled={ms.compiling || loaded === null} onCompile={() => void compile()} />}
          {ex && <ExportLink rid={rid} ms={info} control={{ open: ex, setOpen: setEx }} />}
        </>,
      }}
      head={titleDraft === null && <NoteHead title={title} editing={false}>
        {!row && info && <span className="nk-tag">{info.name}</span>}
      </NoteHead>}
      banner={info?.needsBodyOnly && file === info.main && stripped !== info.key && (
          // 10/4 15:41 피드백: 머리와 제목·저자는 노트에 두지 않고 앱이 컴파일·내보내기 때 붙인다
          <div className="banner" data-ui="본문만 남기기 안내">{t('이 노트에 머리(문서 종류·패키지 줄)나 제목·저자 줄이 있습니다. 머리는 LaTeX 서식이, 제목·저자는 네트워킹의 저자 정보가 붙이니 노트에는 본문만 둡니다.', 'This note has a preamble (document class and package lines) or title and author lines. The LaTeX template adds the preamble and Networking adds title and authors, so keep only the body in the note.')}
            <span className="sp" /><button className="btn" data-ui="본문만 남기기" disabled={state !== 'saved'} onClick={() => {
              rapi.makeBodyOnly(info.key).then((r) => { setStripped(info.key); return load(t(`본문만 남겼습니다 (${[r.removedHead && '머리', r.removedFront > 0 && `제목·저자 줄 ${r.removedFront}개`].filter(Boolean).join(', ')}를 뗐고${r.macros ? `, 정의 ${r.macros}개는 프로젝트 기호 파일로 옮겼습니다` : ''}${r.template ? `, 프로젝트 서식을 "${r.template}"로 정했습니다` : ''}).`,
                `Kept only the body (removed ${[r.removedHead && 'the preamble', r.removedFront > 0 && plural(r.removedFront, 'title or author line')].filter(Boolean).join(', ')}${r.macros ? `, moved ${plural(r.macros, 'definition')} to the project macros file` : ''}${r.template ? `, set the project template to "${r.template}"` : ''}).`)) })
                .catch((e: Error) => onSaved(e.message))
            }}>{t('본문만 남기기', 'Keep body only')}</button></div>
        )}>
        {(open.length > 0 || records.length > 0) && (
          <div className="part-open" data-ui="이 장의 열린 문제">
            <span className="muted">{t('이 장의 열린 문제', 'Open problems in this chapter')}</span>
            {open.map(problemChip)}
            {records.length > 0 && <details className="part-records" key={file}>
              <summary>{t(`폐기 ${stopped} · 해결 ${solved}`, `Dropped ${stopped} · Solved ${solved}`)}</summary>
              <div className="part-record-list">{records.map(problemChip)}</div>
            </details>}
          </div>
        )}
        {loaded !== null && <Editor key={file} ref={editor} initial={loaded} errorLines={problems.map((p) => p.line)} onChange={onChange} onCursorLine={onCursorLine} onSave={() => void save()} onCompile={() => void compile()} />}
        {problems.length > 0 && (
          <div className="problems"><div className="problems-head">{t(`이 장의 오류 ${problems.length}`, `Errors in this chapter ${problems.length}`)}</div>
            {problems.map((p, i) => <button key={i} className="problem" onClick={() => editor.current?.revealLines(p.line, p.line)}><span className="where">{t(`${p.line}줄`, `line ${p.line}`)}</span><span>{p.message}</span></button>)}
          </div>
        )}
        {loaded !== null && <CitedPapers rid={rid} rapi={rapi} text={content.current} file={file} docked library={library} onSaved={onSaved} onLibraryChanged={onLibraryChanged} onReveal={(n) => editor.current?.revealLines(n, n)} />}
    </NoteScreen>
  )
}

/** 원고 PDF: 앱이 workbench/.build/manuscript/에 만든 것. 누르면 그 장의 그 줄로 */
export function ManuscriptPdfTab({ rid, info, rapi, onSaved, active, pairedEditor, version }: { rid: string; info: ManuscriptInfo | null; rapi: ResearchApi; onSaved(msg: string): void; active: boolean; pairedEditor: boolean; version: number }) {
  const key = msKey(rid, info?.key)
  const s = useSession(key)
  useEffect(() => {
    if (info && !getSession(key).manuscriptPdf) applyManuscriptPdf(key, { ...info, pdfState: info.pdfState ?? (info.hasPdf ? 'unknown' : 'missing') })
  }, [info, key])
  const kind = info?.kind
  useEffect(() => {
    if (!active || !kind) return
    let live = true
    const refresh = async () => {
      if (document.hidden || getSession(key).compiling) return
      const request = beginManuscriptRefresh(key)
      try {
        const latest = await rapi.manuscript(info?.key, savedLatexChoice(rid, groupOf({ kind })))
        if (live && !document.hidden) applyManuscriptPdf(key, latest, request)
      } catch {
        const previous = getSession(key).manuscriptPdf
        if (live && !document.hidden && previous) applyManuscriptPdf(key, { ...previous, pdfState: 'unknown' }, request)
      }
    }
    // 프로젝트 파일 알림(version)과 창으로 돌아올 때 다시 본다. workbench/ 밖 원고를 바깥에서 고친 것은 알림이 없어 1분마다 한 번 더 본다
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    const resume = () => { void refresh() }
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [active, rid, key, kind, info?.key, rapi, version])
  const onPick = (page: number, x: number, y: number) => {
    rapi.manuscriptEdit(page, x, y, info?.key).then(({ spot }) => {
      if (!spot) return onSaved(t('이 위치에 대응하는 원고 줄을 찾지 못했습니다 (서식·자동 생성 부분일 수 있음)', 'No manuscript line matches this spot (it may come from the template or be generated)'))
      setSession(key, { highlight: [], reveal: { ...spot, nonce: Date.now() } })
      if (spot.file !== info?.main || info.parts.some((p) => p.line)) go({ page: 'part', rid, file: spot.file })
    }).catch((e: Error) => onSaved(e.message))
  }
  const errs = s.result?.problems ?? []
  const status = s.manuscriptPdf
  const pending = hasPendingParts(key)
  const showStatus = !!status && (status.lastCompile?.ok === false || status.hasPdf && (status.pdfState === 'stale' || status.pdfState === 'unknown' || !!status.pdfErrors))
  return (
    <div className="ws-doc pdf-tab" data-ui="원고 PDF">
      <div className="pane-head" data-ui="머리줄">
        <span className="crumb">{info && <span className="nk-tag">{NOTE_KIND_LABEL[info.kind]}</span>} PDF · <b>{info?.name ?? t('원고', 'Manuscript')}</b></span>
        <span className="sp" />
        {s.compiling ? <span className="pdf-state">{t('컴파일 중…', 'Compiling…')}</span> : status?.lastCompile?.ok === false && <span className="pdf-state bad" title={errs.slice(0, 8).map((p) => `${p.file}:${p.line} ${p.message}`).join('\n')}>{errs.length ? t(`! 오류 ${errs.length}`, `! Errors ${errs.length}`) : t('! 컴파일 오류', '! Compile error')}</span>}
        {!pairedEditor && <button className="btn primary btn-icon" disabled={!info || s.compiling || pending} aria-label={t(`컴파일 — ${info?.name ?? '원고'}`, `Compile: ${info?.name ?? 'manuscript'}`)} title={t(`컴파일 — ${info?.name ?? '원고'}`, `Compile: ${info?.name ?? 'manuscript'}`)}
          onClick={() => { compileManuscript(rid, rapi, info).catch((e: Error) => onSaved(e.message)) }}>{s.compiling ? '…' : Icon.play}</button>}
      </div>
      {(showStatus || pending) && <div className="banner" role="status">{pending ? t('저장하지 않은 내용이 있습니다. 해당 노트에서 저장하거나 파일을 다시 읽으세요.', 'There are unsaved changes. Save them in that note or reload the file.') : status && manuscriptPdfLabel(status)}</div>}
      <CommentablePdf rid={rid} target={manuscriptTarget(info?.name, info?.key)} url={s.pdfVersion !== null ? rapi.manuscriptPdfUrl(s.pdfVersion, info?.key) : null} highlight={s.highlight} onPick={onPick} />
    </div>
  )
}
