import { isBodyOnly, parseBlock, parseList, refineSourceLine, type BlockMeta, type BlockStatus, type MetaPatch } from '@rw/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ConflictError, notesApi, type BlockRow, type NoteHeadPatch, type CompileResult, type LibraryInfo, type ManuscriptInfo, type ResearchApi, type ResearchSummary, type WorkbenchEvent } from './api'
import { StatusDialog } from './dialogs'
import { Editor, type EditorHandle } from './Editor'
import { statusLabel, statusOf } from './format'
import { StatusDot } from './StatusDot'
import { getSession, registerHandlers, sessionKey, setSession, useSession } from './blockSession'
import { KIND_COLOR, KIND_LABEL, provesOf, shortLabel } from './notes'
import { CitedPapers } from './Materials'
import { go } from './router'
import { askText } from './askText'
import { Icon } from './icons'
import { MarkdownNoteBody } from './MarkdownNote'
import { blockTarget, useSlot } from './Comments'
import { openRecordComposer } from './RecordContext'
import { recordRevealRange, recordSelectionFromLines } from './recordHelpers'
import { NoteHead, NoteTitleInput } from './NoteToolbar'
import { NoteScreen } from './NoteScreenFrame'
import { NoteStatus } from './NoteStatus'
import { latexSections, registerHeadWriter, sectionAtLine, useRightMode } from './noteScreen'
import { CompileSettings, ExportLink, savedLatexChoice, type ExportNote } from './NoteExport'
import { deleteBlockWithConfirm } from './blockDelete'
import { onOutside } from './autosave'
import { useNoteEdit } from './noteEdit'
import { t } from './i18n'


interface Props {
  rid: string
  bid: string
  rapi: ResearchApi
  summary: ResearchSummary
  manuscripts: ManuscriptInfo[]
  bus: EventTarget
  onChanged(): void
  onSaved(message: string): void
  /** 공유 라이브러리 (개념노트를 고르고 만들 때) */
  library: LibraryInfo | null
  onLibraryChanged(): void
  /** 결과 PDF를 옆 칸에 (컴파일 뒤, ⋯ "PDF 보기") */
  onShowPdf?(): void
  /** 지금 칸에서 보이면 이 탭 key: 절 목차를 알리고 오른쪽 사이드바에 연결을 그린다 */
  tocOwner?: string | null
}

/**
 * 블록 편집 탭: 속성 표 + LaTeX 편집기. 결과 PDF는 따로 된 탭(PdfTab)이고 blockSession으로 이어진다.
 * 탭을 닫거나 다른 칸으로 옮기면 이 컴포넌트가 내려가는데, 그때 고치던 내용이 있으면 먼저 저장한다.
 */
export function BlockPage({ rid, bid, rapi, summary, manuscripts, bus, onChanged, onSaved, library, onLibraryChanged, onShowPdf, tocOwner }: Props) {
  const key = sessionKey(rid, bid)
  const { pdfVersion } = useSession(key)
  const [loaded, setLoaded] = useState<{ id: string; content: string; md: boolean; ownHeader?: boolean } | null>(null)
  const [meta, setMeta] = useState<BlockMeta | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [result, setResult] = useState<CompileResult | null>(null)
  const [statusDialog, setStatusDialog] = useState<'blocked' | 'stopped' | null>(null)
  const [csOpen, setCsOpen] = useState(false)
  const [exOpen, setExOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deletePending = useRef(false)
  const deleted = useRef(false)

  const editor = useRef<EditorHandle>(null)
  const viewTimer = useRef<number | undefined>(undefined)
  const row: BlockRow | undefined = summary.blocks.find((b) => b.id === bid)
  // 저장은 저장기 하나가 맡는다 (autosave.ts): 차례로 저장, 바깥에서 바뀌면 멈춤, 탭을 닫으면 저장.
  // 고치기 · 보기 · 이름 초안(연필을 누르면 제목이 글 칸이 된다, 10/5 사용자 결정)은 노트 화면 공통 흐름
  const edit = useNoteEdit(key, {
    write: async (text, h) => {
      const next = await rapi.saveBlock(bid, text, h)
      setLoaded((l) => l ? { ...l, ownHeader: !l.md && !isBodyOnly(text) } : l)
      return next
    },
    onSaved: () => onChanged(),
    mtime: row?.mtime,
    blocked: () => deleted.current || deletePending.current,
  })
  const { saver, state: saveState, editing, setEditing, view, titleDraft, setTitleDraft, notice, setNotice } = edit
  /** 편집기의 지금 글과 파일 hash, 저장 상태 (저장기가 가진다) */
  const content = { get current() { return saver.text } }
  const hash = { get current() { return saver.hash } }
  const saveStateRef = { get current() { return saver.state } }

  const byId = useMemo(() => new Map(summary.blocks.map((b) => [b.id, b])), [summary.blocks])
  const titleOf = (id: string) => byId.get(id)?.title ?? id

  // ---------- 불러오기 ----------
  useEffect(() => {
    let cancelled = false
    setLoaded(null); setResult(null); setSession(key, { highlight: [] }); setNotice(null)
    ;(async () => {
      try {
        const d = await rapi.readBlock(bid)
        if (cancelled) return
        saver.load(d.content, d.hash)
        setMeta(d.meta)
        setLoaded({ id: bid, content: d.content, md: d.format === 'md', ownHeader: d.ownHeader })
        setEditing(false)
        if (getSession(key).pdfVersion === null) {
          const head = await fetch(rapi.pdfUrl(bid, 0), { method: 'HEAD' }).catch(() => null)
          if (!cancelled && head?.ok && getSession(key).pdfVersion === null) setSession(key, { pdfVersion: Date.now() })
        }
      } catch (e) {
        if (!cancelled) setNotice((e as Error).message)
      }
    })()
    // 탭을 닫거나 옮기면 내려간다. 고치던 내용은 저장기가 내려가며 저장한다 (바깥에서 바뀐 경우는 서버가 해시로 막는다)
    return () => { cancelled = true }
  }, [bid, rapi, key, saver, setEditing, setNotice])

  // ---------- 저장 ----------
  const save = edit.saveNow

  const onChange = useCallback((text: string) => {
    if (deleted.current) return
    if (text === saver.text) return // 앱이 바꾼 내용
    saver.edit(text)
    setMeta(parseBlock(text).meta) // 편집기에서 머리말을 직접 고쳐도 속성 표가 따라간다
  }, [saver])

  /** 속성 표에서 머리말 고치기: 고치던 원고를 먼저 저장하고, 서버가 고친 머리말을 편집기에 반영 */
  const patch = useCallback(async (p: MetaPatch) => {
    if (saver.state === 'dirty' || saver.state === 'saving') {
      if (!(await save())) throw new Error(t('원고를 저장하지 못해 속성을 고치지 않았습니다.', 'Could not save the text, so the properties were not changed.'))
    }
    if (saver.state === 'conflict') throw new Error(t('파일이 바깥에서 바뀌어 있습니다. 먼저 다시 읽어 주세요.', 'The file changed outside the app. Reload it first.'))
    try {
      const r = await rapi.patchMeta(bid, p, saver.hash)
      saver.adopt(r.content, r.hash)
      editor.current?.replaceContent(r.content)
      setLoaded((l) => (l?.md ? { ...l, content: r.content } : l))
      setMeta(r.meta)
      onChanged()
    } catch (e) {
      if (e instanceof ConflictError) saver.conflict()
      throw e
    }
  }, [bid, rapi, save, onChanged, saver])

  const tryPatch = (p: MetaPatch) => { patch(p).catch((e: Error) => setNotice(e.message)) }

  /** 오른쪽 사이드바의 머리말 고치기(성격 · 주제 · 설명 · ★): 서버가 파일을 고치는 동안 오는 파일 알림은 이 고침이 끝난 뒤에 본다 */
  const headWrite = useRef<Promise<void> | null>(null)
  const writeHead = useCallback(async (file: string, p: NoteHeadPatch) => {
    if (saver.state === 'dirty' || saver.state === 'saving') {
      if (!(await save())) throw new Error(t('본문을 저장하지 못해 노트 정보를 고치지 않았습니다.', 'Could not save the body, so the note info was not changed.'))
    }
    if (saver.state === 'conflict') throw new Error(t('파일이 바깥에서 바뀌어 있습니다. 먼저 다시 읽어 주세요.', 'The file changed outside the app. Reload it first.'))
    const run = (async () => {
      await notesApi(rid).setHead(file, p, saver.hash)
      const d = await rapi.readBlock(bid)
      saver.adopt(d.content, d.hash)
      editor.current?.replaceContent(d.content)
      setLoaded((l) => (l?.md ? { ...l, content: d.content } : l))
      setMeta(d.meta)
    })()
    headWrite.current = run
    try { await run } catch (e) {
      if (e instanceof ConflictError) saver.conflict()
      throw e
    } finally { if (headWrite.current === run) headWrite.current = null }
  }, [bid, rid, rapi, save, saver])
  const loadedMd = loaded ? loaded.md : null
  useEffect(() => {
    if (loadedMd === null) return
    const file = `workbench/blocks/${bid}.${loadedMd ? 'md' : 'tex'}`
    return registerHeadWriter(rid, file, (p) => writeHead(file, p))
  }, [rid, bid, loadedMd, writeHead])

  const reloadFromDisk = useCallback(async (message = t('파일을 다시 읽었습니다. 이 화면에서 고친 내용은 버렸습니다.', 'Reloaded the file. Edits made on this screen were discarded.')) => {
    const d = await rapi.readBlock(bid)
    saver.load(d.content, d.hash)
    editor.current?.replaceContent(d.content)
    setLoaded({ id: bid, content: d.content, md: d.format === 'md', ownHeader: d.ownHeader })
    setEditing(false)
    setMeta(d.meta)
    setNotice(message)
  }, [bid, rapi, saver, setEditing, setNotice])

  // 에이전트·다른 편집기가 파일을 바꾸면: 고치던 중이 아니면 새 내용을 불러오고, 고치던 중이면 저장을 멈춘다
  useEffect(() => {
    const on = (ev: Event) => {
      const e = (ev as CustomEvent<WorkbenchEvent>).detail
      if (e.research !== rid || e.type !== 'block' || e.id !== bid || e.hash === saver.hash) return
      // 오른쪽 사이드바가 고치는 중이면 그 고침의 알림일 수 있다: 끝난 뒤 새 해시와 견준다
      if (headWrite.current) { void headWrite.current.catch(() => undefined).then(() => on(ev)); return }
      if (deleted.current || deletePending.current) return
      onOutside(saver, e.hash, {
        gone: () => setNotice(t('이 노트 파일이 지워졌습니다.', 'This note file was deleted.')),
        reload: () => void reloadFromDisk(t('바깥(에이전트나 다른 편집기)에서 바뀐 내용을 불러왔습니다.', 'Loaded changes made outside the app (by an agent or another editor).')),
      })
    }
    bus.addEventListener('rw', on)
    return () => bus.removeEventListener('rw', on)
  }, [bus, rid, bid, reloadFromDisk, saver, setNotice])

  // ---------- 컴파일·이동 ----------
  const compile = useCallback(async () => {
    if (compiling || deleted.current) return
    if (saver.state !== 'saved' && !(await save())) return setNotice(t('저장하지 못해 컴파일하지 않았습니다.', 'Could not save, so did not compile.'))
    setCompiling(true)
    setSession(key, { compiling: true })
    setNotice(null)
    try {
      const r = await rapi.compile(bid, savedLatexChoice(rid, 'note'))
      setResult(r)
      setSession(key, { result: r, highlight: [], ...(r.hasPdf && { pdfVersion: Date.now() }) })
      rapi.pdfState(bid).then((st) => setSession(key, { blockPdf: st })).catch(() => undefined)
      if (r.hasPdf) onShowPdf?.()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setCompiling(false)
      setSession(key, { compiling: false })
    }
  }, [rid, bid, rapi, compiling, save, saver, key, onShowPdf, setNotice])

  const onCursorLine = useCallback((line: number) => {
    if (pdfVersion === null) return
    window.clearTimeout(viewTimer.current)
    viewTimer.current = window.setTimeout(() => {
      rapi.view(bid, line).then((r) => setSession(key, { highlight: r.boxes })).catch(() => setSession(key, { highlight: [] }))
    }, 200)
  }, [bid, rapi, pdfVersion, key])

  const onPick = useCallback((page: number, x: number, y: number, text: string) => {
    // Markdown 보조 노트의 PDF는 바꾼 글에서 나와 줄을 짚을 수 없다
    if (saver.text.startsWith('---')) return
    rapi.edit(bid, page, x, y).then(({ spot }) => {
      if (!spot) return setNotice(t('이 위치에 대응하는 원고를 찾지 못했습니다.', 'Could not find the source for this position.'))
      if (!spot.inBlock) return setNotice(t(`이 위치는 이 노트가 아니라 ${spot.file} ${spot.line}줄에서 나왔습니다.`, `This position comes from ${spot.file} line ${spot.line}, not from this note.`))
      setNotice(null)
      setSession(key, { highlight: [] })
      const line = refineSourceLine(saver.text, spot.line, text)
      editor.current?.revealLines(line, line)
    }).catch((e: Error) => setNotice(e.message))
  }, [bid, rapi, key, saver, setNotice])

  const recordSlot = useSlot(rid, blockTarget(bid).target)
  useEffect(() => {
    if (!recordSlot.reveal || !loaded || loaded.md) return
    const record = recordSlot.file?.comments.find((entry) => entry.id === recordSlot.reveal!.id)
    const range = record && recordRevealRange(content.current, record)
    if (range) editor.current?.revealLines(content.current.slice(0, range.from).split('\n').length, content.current.slice(0, range.to).split('\n').length)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록 열기(nonce)가 바뀔 때만 그 자리로 간다
  }, [recordSlot.reveal?.nonce, loaded])

  // 결과 PDF 탭이 부를 수 있게: PDF를 누르면 이 편집기의 원고 줄로, 컴파일 단추
  useEffect(() => registerHandlers(key, { pick: onPick, compile: () => void compile() }), [key, onPick, compile])

  const errorLines = useMemo(() => (result?.problems ?? []).filter((p) => p.inBlock).map((p) => p.line), [result])

  // ---------- 속성 표 ----------
  const status = statusOf(meta?.status)
  const descendants = useMemo(() => {
    const out = new Set<string>([bid])
    const walk = (id: string) => (summary.tree.children[id] ?? []).forEach((c) => { out.add(c); walk(c) })
    walk(bid)
    return out
  }, [bid, summary.tree.children])
  const parentOptions = summary.blocks.filter((b) => !descendants.has(b.id))
  const altOptions = summary.blocks.filter((b) => b.id !== bid && !(meta?.alternatives ?? []).includes(b.id))

  const chooseStatus = (s: BlockStatus) => {
    if (s === status) return
    if (s === 'blocked' || s === 'stopped') return setStatusDialog(s)
    tryPatch({ status: s })
  }

  const parentTitle = meta?.parent ? titleOf(meta.parent) : null

  // ---------- 고치기 (Markdown은 저절로 저장하고 "편집 완료"으로 마친다, 10/5 노트 도구 줄) ----------
  const startEdit = () => edit.start(meta?.title ?? bid, !!loaded?.md)
  const onDraft = useCallback((full: string) => onChange(full), [onChange])
  const finish = () => edit.finish((draft) => {
    const newTitle = draft?.replace(/\s+/g, ' ').trim()
    if (loaded?.md) setLoaded((l) => (l ? { ...l, content: content.current } : l))
    if (newTitle && newTitle !== (meta?.title ?? bid)) tryPatch({ title: newTitle })
  })
  const editingAny = editing || titleDraft !== null

  // 절 목차: LaTeX 보조 노트는 \section 줄 (Markdown은 본문이 알린다)
  const [cursorLine, setCursorLine] = useState(1)
  const sections = useMemo(() => (loaded && !loaded.md ? latexSections(content.current) : []), [loaded, saveState]) // eslint-disable-line react-hooks/exhaustive-deps
  const jump = useCallback((i: number) => { const sec = sections[i]; if (sec) editor.current?.revealLines(sec.line, sec.line) }, [sections])

  // ---------- 결과 PDF가 이전 결과인지 (C3를 보조 노트에도) ----------
  const s = useSession(key)
  const loadPdfState = useCallback(() => { rapi.pdfState(bid).then((st) => setSession(key, { blockPdf: st })).catch(() => undefined) }, [rapi, bid, key])
  useEffect(() => { loadPdfState() }, [loadPdfState, row?.mtime])
  const pdfNote = !s.blockPdf?.hasPdf ? null : result && !result.ok ? t('이번 컴파일 실패 · PDF는 이전 결과', 'This compile failed · PDF is from before') : s.blockPdf.stale ? t('PDF는 이전 결과', 'PDF is from before') : null

  // ---------- 오른쪽 사이드바에 그리는 연결 (증명할 진술 · 개념 · 기대는 노트 · 다른 방법 · 다음 할 일) ----------
  const links = meta && (
    <dl className="props side-props" data-ui="속성 표">
              {summary.statements.length > 0 && <>
                <dt data-ui="증명할 진술">{t('증명할 진술', 'Statements to prove')}</dt>
                <dd data-ui="증명할 진술">
                  {provesOf(summary, bid).map((x) => (
                    <span key={x.id} className="chip" data-ui="진술 칩"><span className="kind-dot" style={{ background: KIND_COLOR[x.kind] ?? KIND_COLOR.statement }} />
                      <button type="button" className="a" title={`${KIND_LABEL[x.kind] ?? x.kind} · ${x.title ?? ''}`} onClick={() => go({ page: 'statement', rid, sid: x.id })}>{shortLabel(x)}</button></span>
                  ))}
                  {provesOf(summary, bid).length === 0 && <span className="muted" title={t(`진술 파일 머리말의 proofs에 이 노트의 id(${bid})를 넣으면 이어집니다`, `Add this note's id (${bid}) to proofs in a statement file's front matter to link it`)}>{t('없음', 'None')}</span>}
                </dd>
              </>}
              {(row?.grounds?.length ?? 0) > 0 && <>
                <dt data-ui="원고 장" title={t('결론을 옮길 원고 장', 'Manuscript chapter that takes the conclusion')}>{t('원고 장', 'Manuscript chapter')}</dt>
                <dd data-ui="원고 장">
                  {row!.grounds!.map((f) => {
                    const title = manuscripts.flatMap((m) => m.parts).find((p) => p.id === f)?.title
                      ?? (f.includes('#') ? f.slice(f.indexOf('#') + 1) : f.split('/').pop()!.replace(/\.tex$/, ''))
                    return <span key={f} className="chip" data-ui="원고 장 칩"><span className="ico" aria-hidden>{Icon.manuscript}</span><button type="button" className="a" title={f} onClick={() => go({ page: 'part', rid, file: f.split('#')[0]! })}>{title}</button></span>
                  })}
                </dd>
              </>}
              <dt className="rs-label" data-ui="개념" title={t('노트 머리말의 concepts에 연결한 개념노트', 'Concept notes linked in concepts in the note front matter')}>{t('머리말에 연결한 개념노트', 'Linked concept notes')}</dt>
              <dd data-ui="개념">
                {(() => {
                  const ids = meta.extra.concepts ? parseList(meta.extra.concepts) : []
                  const all = (library?.notes ?? []).filter((n) => n.kind === 'concept')
                  const titleOfC = (id: string) => all.find((n) => n.id === id)?.title ?? id
                  return <>
                    {ids.map((c) => (
                      <span key={c} className="chip" data-ui="개념 칩"><span className="lib-mark ico" aria-hidden>{Icon.concept}</span>
                        <button type="button" className="a" title={t('공유 라이브러리의 개념노트', 'Concept note in the shared library')} onClick={() => go({ page: 'concept', rid, id: c })}>{titleOfC(c)}</button>
                        <button className="x" title={t('연결 끊기', 'Unlink')} aria-label={t(`${titleOfC(c)} 연결 끊기`, `Unlink ${titleOfC(c)}`)} onClick={() => tryPatch({ concepts: ids.filter((x) => x !== c) })}>×</button></span>
                    ))}
                    {ids.length === 0 && <span className="muted">{t('없음', 'None')}</span>}
                    {library?.path && <>
                      <select className="rs-select" value="" aria-label={t('개념 연결', 'Link concept')} onChange={(e) => e.target.value && tryPatch({ concepts: [...ids, e.target.value] })}>
                        <option value="">＋ {t('연결…', 'Link…')}</option>
                        {all.filter((n) => !ids.includes(n.id)).map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                      </select>
                      <button className="a" title={t('공유 라이브러리에 새 개념노트 초안을 만들고 연결합니다', 'Create a draft concept note in the shared library and link it')}
                        onClick={async () => {
                          const name = await askText({ title: t('새 개념노트', 'New concept note'), label: t('제목', 'Title'), hint: t('교과서 수준으로, 이 프로젝트와 무관하게 적습니다.', 'Write at textbook level, independent of this project.'), ok: t('만들기', 'Create') })
                          if (!name?.trim()) return
                          api.createConcept({ title: name }).then(({ id: c }) => { onLibraryChanged(); return patch({ concepts: [...ids, c] }).then(() => go({ page: 'concept', rid, id: c })) }).catch((e: Error) => setNotice(e.message))
                        }}>＋ {t('개념노트 만들기', 'New concept note')}</button>
                    </>}
                  </>
                })()}
              </dd>
              <dt data-ui="기대는 작업노트">{t('기대는 노트', 'Relies on note')}</dt>
              <dd data-ui="기대는 작업노트">
                {meta.parent
                  ? <span className="chip" data-ui="작업노트 칩"><StatusDot s={statusOf(byId.get(meta.parent)?.status)} />
                    <button type="button" className="a" onClick={() => go({ page: 'block', rid, bid: meta.parent! })}>{parentTitle}</button>
                    <button className="x" title={t('연결 끊기', 'Unlink')} aria-label={t(`${parentTitle} 연결 끊기`, `Unlink ${parentTitle}`)} onClick={() => tryPatch({ parent: null })}>×</button></span>
                  : <span className="muted">{t('없음', 'None')}</span>}
                <select className="rs-select" value="" onChange={(e) => e.target.value && tryPatch({ parent: e.target.value })} aria-label={t('기대는 노트 바꾸기', 'Change the note it relies on')}>
                  <option value="">{t('바꾸기…', 'Change…')}</option>
                  {parentOptions.map((b) => <option key={b.id} value={b.id}>{b.title ?? b.id}</option>)}
                </select>
              </dd>
              <dt data-ui="다른 방법">{t('다른 방법', 'Other approaches')}</dt>
              <dd data-ui="다른 시도">
                {meta.alternatives.map((a) => {
                  const st = statusOf(byId.get(a)?.status)
                  return (
                    <span key={a} className="chip" data-ui="작업노트 칩" data-ui-item={titleOf(a)}><StatusDot s={st} />
                      <button type="button" className="a" onClick={() => go({ page: 'block', rid, bid: a })}>{titleOf(a)}</button>
                      {st !== 'in-progress' && <span className="muted">· {statusLabel(st)}</span>}
                      <button className="x" title={t('빼기', 'Remove')} aria-label={t(`${titleOf(a)} 빼기`, `Remove ${titleOf(a)}`)} onClick={() => tryPatch({ alternatives: meta.alternatives.filter((x) => x !== a) })}>×</button>
                    </span>
                  )
                })}
                {meta.alternatives.length === 0 && <span className="muted">{t('없음', 'None')}</span>}
                {altOptions.length > 0 && (
                  <select className="rs-select" value="" onChange={(e) => e.target.value && tryPatch({ alternatives: [...meta.alternatives, e.target.value] })} aria-label={t('다른 시도 더하기', 'Add another approach')}>
                    <option value="">＋ {t('더하기…', 'Add…')}</option>
                    {altOptions.map((b) => <option key={b.id} value={b.id}>{b.title ?? b.id}</option>)}
                  </select>
                )}
              </dd>
              {status === 'blocked' && <>
                <dt data-ui="막힌 이유">{t('멈춘 이유', 'Blocked because')}</dt><dd data-ui="막힌 이유">{meta.blockedReason} <button type="button" className="a" onClick={() => setStatusDialog('blocked')}>{t('고치기', 'Edit')}</button></dd>
              </>}
              {status === 'stopped' && <><dt data-ui="중지 이유">{t('폐기 이유', 'Dropped because')}</dt><dd data-ui="중지 이유">{meta.stoppedReason} <button type="button" className="a" onClick={() => setStatusDialog('stopped')}>{t('고치기', 'Edit')}</button></dd></>}
              <dt data-ui="다음 할 일">{t('다음 할 일', 'Next step')}</dt>
              <dd data-ui="다음 할 일"><InlineInput value={meta.next ?? ''} placeholder={t('다음에 할 일을 한 문장으로', 'The next step in one sentence')} onCommit={(v) => tryPatch({ next: v.trim() || null })} /></dd>
    </dl>
  )

  // ---------- 본문 머리: 제목. 상태 메뉴는 도구 줄 첫 자리 ----------
  const head = meta && !editingAny && <NoteHead title={meta.title ?? bid} editing={false} />
  const toolbarStatus = meta && <NoteStatus status={status} onChange={chooseStatus} disabled={saveState === 'conflict'} />
  const mode = useRightMode()
  const file = `workbench/blocks/${bid}.${loaded?.md ? 'md' : 'tex'}`
  const exportNote: ExportNote = { block: bid, name: meta?.title ?? bid, kind: 'note', ownHeader: loaded?.ownHeader }
  const remove = async () => {
    if (!loaded || deletePending.current || compiling || saveStateRef.current === 'saving' || headWrite.current) return
    // 확인 중 자기 자동저장이 해시를 바꾸지 않게 잠시 멈춘다. 취소·실패하면 다시 이어 간다.
    deletePending.current = true
    saver.hold()
    setDeleting(true)
    try {
      await deleteBlockWithConfirm(rapi, { id: bid, name: meta?.title ?? bid, file, hash: hash.current }, () => {
        deleted.current = true
        saver.stop()
        window.clearTimeout(viewTimer.current)
        setLoaded(null)
        setMeta(null)
        setSession(key, { highlight: [], blockPdf: { hasPdf: false, stale: false }, pdfVersion: null })
        onChanged()
        go({ page: 'notes', rid })
      }, onSaved)
    } finally {
      deletePending.current = false
      setDeleting(false)
      if (!deleted.current) saver.release()
    }
  }
  if (deleted.current) return <div className="space-empty" data-ui="작업노트">{t('이 노트를 지웠습니다.', 'This note was deleted.')}</div>
  return (
    <NoteScreen ui="작업노트" paneUi="편집 칸" conflictUi="저장 충돌 안내" notice={notice} noticeUi="알림" onCloseNotice={() => setNotice(null)}
      tocOwner={tocOwner} toc={loaded && !loaded.md ? { sections, current: sectionAtLine(sections, cursorLine), jump } : null} side={links}
      overlay={statusDialog && row && meta && (
        <StatusDialog block={{ ...row, ...meta }} to={statusDialog} onClose={() => setStatusDialog(null)}
          onSubmit={async (f) => { await patch(f); setStatusDialog(null) }} />
      )}
      toolbar={{
        status: toolbarStatus, save: saveState, savedAt: edit.savedAt, pdfNote, editing: editingAny,
        title: meta && <NoteTitleInput title={meta.title ?? bid} draft={titleDraft ?? undefined} onDraft={setTitleDraft} />,
        saveAction: edit.saveAction(() => void reloadFromDisk()),
        view: editing ? view : undefined, onView: edit.setView,
        onEdit: startEdit, editDisabled: !loaded || saveState === 'conflict', onDone: () => void finish(),
        onComment: () => openRecordComposer(rid, blockTarget(bid, meta?.title), loaded?.md ? undefined : recordSelectionFromLines(content.current, editor.current?.selection() ?? null)), commentOn: mode === 'records',
        onCompile: () => void compile(), compiling, compileDisabled: !loaded || editing, compileTip: `${t('컴파일', 'Compile')}: ${meta?.title ?? bid}`, compileKey: !!loaded && !loaded.md,
        menu: [
            loaded && !loaded.ownHeader && { label: t('컴파일 서식 고르기…', 'Choose compile template…'), ui: '컴파일 설정', tip: t('서식·저자·날짜를 고릅니다. ▶ 컴파일과 내보내기가 같이 씁니다', 'Choose template, author and date. Used by both ▶ Compile and Export'), onClick: () => setCsOpen(true) },
            onShowPdf && { label: t('PDF 보기', 'View PDF'), ui: 'PDF 보기', tip: t('지난번 컴파일한 PDF를 옆 패널에 엽니다', 'Open the last compiled PDF in the side pane'), onClick: onShowPdf, disabled: !s.blockPdf?.hasPdf && pdfVersion === null },
            { label: t('내보내기…', 'Export…'), ui: '노트 내보내기', tip: t('그대로 컴파일되는 LaTeX 폴더(zip)로 받습니다', 'Download as a LaTeX folder (zip) that compiles as is'), onClick: () => setExOpen(true), disabled: !loaded },
            { label: t('파일 다시 읽기', 'Reload file'), ui: '파일 다시 읽기', tip: t('파일을 다시 읽습니다. 이 화면에서 저장하지 않은 고침은 버립니다', 'Reload the file. Unsaved edits on this screen are discarded'), onClick: () => void reloadFromDisk() },
            { label: t('Finder에서 보기', 'Show in Finder'), ui: 'Finder에서 보기', onClick: () => { notesApi(rid).reveal(file).catch((e: Error) => setNotice(e.message)) } },
            { label: t('지우기', 'Delete'), ui: '노트 지우기', danger: true, tip: t('원문 파일만 영구히 지웁니다. 기록·링크·기존 PDF는 남습니다', 'Permanently deletes only the source file. Records, links and existing PDFs stay'), disabled: !loaded || deleting || compiling || saveState === 'saving', onClick: () => void remove() },
        ],
        anchors: loaded && <>
          {csOpen && <CompileSettings rid={rid} ms={exportNote} control={{ open: csOpen, setOpen: setCsOpen }} disabled={compiling || editing} onCompile={() => void compile()} />}
          {exOpen && <ExportLink rid={rid} ms={exportNote} control={{ open: exOpen, setOpen: setExOpen }} />}
        </>,
      }}>
        {loaded && !loaded.md && head}
        {loaded?.md && (
          <MarkdownNoteBody rid={rid} text={loaded.content} rapi={rapi} kind="aux" file={file} editing={editing} saving={saveState === 'saving'} view={view} onDraft={onDraft} tocOwner={tocOwner}
            footer={<CitedPapers rid={rid} rapi={rapi} text={content.current} file={file} library={library} onSaved={setNotice} onLibraryChanged={onLibraryChanged} />}
            head={head} target={{ ...blockTarget(bid), title: `노트 ${meta?.title ?? bid}` }} onSave={(t) => { onDraft(t); void finish() }} onCancel={() => void finish()} empty={t('아직 본문이 없습니다. 고치기를 눌러 주장 하나를 적습니다.', 'No body yet. Click Edit to write one claim.')} />
        )}
        {loaded && !loaded.md && (
          <Editor
            key={loaded.id}
            ref={editor}
            initial={loaded.content}
            errorLines={errorLines}
            headerHint={t('오른쪽 사이드바 정보에서 고칩니다', 'Edit in the info of the right sidebar')}
            onChange={onChange}
            onCursorLine={(n) => { setCursorLine(n); onCursorLine(n) }}
            onSave={() => void save()}
            onCompile={() => void compile()}
          />
        )}
        {result && result.problems.length > 0 && (
          <div className="problems" data-ui="오류 목록">
            <div className="problems-head">{t('오류', 'Errors')} {result.problems.length}</div>
            {result.problems.map((p, i) => (
              <button key={i} className="problem" data-ui="오류" onClick={() => p.inBlock && editor.current?.revealLines(p.line, p.line)} disabled={!p.inBlock}>
                <span className="where">{loaded?.md ? '' : p.inBlock ? t(`${p.line}줄`, `line ${p.line}`) : `${p.file}:${p.line}`}</span>
                <span>{p.message}</span>
              </button>
            ))}
          </div>
        )}
        {loaded && !loaded.md && <CitedPapers rid={rid} rapi={rapi} text={content.current} file={file} docked library={library} onSaved={setNotice} onLibraryChanged={onLibraryChanged} />}
    </NoteScreen>
  )
}

function InlineInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit(v: string): void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input className="inline-input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
    onBlur={() => { if (v !== value) onCommit(v) }}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur() } }} />
}
