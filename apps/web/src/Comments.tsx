import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { commentsApi, ConflictError, papersApi, type CommentEntry, type CommentFile, type CommentKind, type CommentState, type NewComment, type PaintColor, type NoteHighlight, type PdfBox, type PendingQuestion } from './api'
import { PdfView, type PdfMark, type PdfPaint, type PdfSelection } from './PdfView'
import { MemoText } from './memo'
import { go } from './router'
import type { Tab } from './Workspace'
import { onListKey } from './listInput'
import { Icon } from './icons'
import type { LearnFrom } from './api'
import { askConfirm } from './askText'
import { RecordContext, openRecordComposer, setRecordSelectionDraft, clearRecordComposerRequest, useRecordComposerRequest, type RecordDraft, type RecordSelection } from './RecordContext'
import { PaintDots, RecordMenu } from './RecordMenus'
import { useHighlightColor } from './ui'
import { useRecordSelection } from './recordSelection'
import { flash } from './flash'
import { quotedRecordHighlights } from './recordHelpers'
import { openRight, useRightMode } from './noteScreen'
import { shown, t } from './i18n'

/** 기록 종류·상태의 화면 이름 (파일에는 한국어 값 그대로) */
const KIND_TEXT: Record<string, string> = { 메모: t('메모', 'Memo'), 질문: t('질문', 'Question'), 하이라이트: t('하이라이트', 'Highlight'), 코멘트: t('코멘트', 'Comment'), '할 일': t('할 일', 'To-do') }
const kindText = (k: string) => KIND_TEXT[k] ?? k
const STATE_TEXT: Record<string, string> = { 대기: t('대기', 'Waiting'), 끝냄: t('끝냄', 'Done') }
const stateText = (s: string) => STATE_TEXT[s] ?? s

/**
 * PDF 코멘트·질문 (구조 제안 §4·§6). 대상마다 workbench/comments/<대상>.md.
 * - 자료 PDF(논문) `paper-<파일 이름>`, 원고 PDF `manuscript`, 작업노트 결과 PDF `block-<id>`
 * - PDF 칸 가운데 위 도구 막대의 코멘트·질문, 또는 글을 끌어 고르면 뜨는 메뉴로 남긴다
 * - 맥락 칸에 지금 대상의 코멘트, 에이전트 함에 이 프로젝트의 대기 중인 질문
 */

export interface CommentTarget {
  target: string
  /** 파일 머리에 쓸 이름 */
  title: string
  /** 원래 파일 (자료 PDF 이름, 작업노트 id) */
  source?: string
}
const slug = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 160) || '_'
export const paperTarget = (name: string): CommentTarget => ({ target: `paper-${slug(name.replace(/\.pdf$/i, ''))}`, title: `자료 ${name}`, source: name })
/** 원고 PDF. 메인 노트가 여럿이면 둘째부터 `manuscript-<key>` */
export const manuscriptTarget = (name?: string, ms?: string): CommentTarget => ({ target: ms ? `manuscript-${slug(ms)}` : 'manuscript', title: `원고 PDF${name ? ` ${name}` : ''}` })
export const blockTarget = (bid: string, title?: string): CommentTarget => ({ target: `block-${slug(bid)}`, title: `노트 결과 ${title ?? bid}`, source: bid })
/** Markdown 연구·계산 노트 (같은 폴더 이름이어도 기록 대상은 나눈다). */
const NOTE_FILE = /^workbench\/(notes|calc)\/([^/]+)\/note\.md$/
export const noteTarget = (file: string, title?: string): CommentTarget | null => {
  const m = NOTE_FILE.exec(file)
  return m ? { target: `${m[1] === 'calc' ? 'calc' : 'note'}-${slug(m[2]!)}`, title: `${m[1] === 'calc' ? '계산 노트' : '연구노트'} ${title ?? m[2]}`, source: file } : null
}

/** 작업 화면 탭의 코멘트 대상. PDF가 아닌 탭은 null (작업노트 편집 탭은 그 결과 PDF의 코멘트를 함께 본다) */
export function targetOfTab(t: Tab | undefined, titleOf: (t: Tab) => string): CommentTarget | null {
  if (!t) return null
  if (t.k === 'doc') return /\.pdf$/i.test(t.name) ? paperTarget(t.name) : null
  if (t.k === 'mspdf') return manuscriptTarget(undefined, t.ms)
  if (t.k === 'pdf' || t.k === 'block') return blockTarget(t.bid, titleOf({ k: 'block', bid: t.bid }))
  if (t.k === 'part') return noteTarget(t.file, titleOf(t))
  if (t.k === 'statement') return { target: `statement-${slug(t.sid)}`, title: `진술 ${titleOf(t)}`, source: t.sid }
  return null
}

// ---------- 코멘트를 읽고 쓰는 곳 ----------

/**
 * 라이브러리 논문의 코멘트는 프로젝트가 아니라 research-library/comments/<키>/에 있다 (논문 라이브러리 3단계).
 * 그 논문들은 rid 자리에 이 값을 쓰고, 대상은 `paper-<bib 키>`다. 화면 부품(PDF·쓰는 칸·목록)은 연구노트 PDF와 같다.
 */
export const LIBRARY = '@library'
export const libraryPaperTarget = (key: string, title: string): CommentTarget => ({ target: `paper-${key}`, title, source: `${key}.pdf` })
interface Backend {
  read(target: string): Promise<CommentFile>
  add(target: string, c: NewComment & { kind: CommentKind; pageHeight?: number }): Promise<string>
  setState(target: string, id: string, state: CommentState, baseHash: string): Promise<CommentFile>
  answer(target: string, id: string): Promise<CommentFile>
  remove(target: string, id: string, baseHash: string): Promise<CommentFile>
  /** 쓰는 칸 아래에 보일 저장 위치 */
  where(target: string): string
}
const keyOfPaper = (target: string) => target.replace(/^paper-/, '')
export function backend(rid: string): Backend {
  if (rid === LIBRARY) {
    return {
      read: (t) => papersApi.comments(keyOfPaper(t)),
      add: (t, c) => papersApi.addComment(keyOfPaper(t), { kind: c.kind, text: c.text, page: c.page, rects: c.rects, pageHeight: c.pageHeight, quote: c.quote, color: c.color }).then((r) => r.id),
      setState: (t, id, state, h) => papersApi.updateComment(keyOfPaper(t), id, { state }, h),
      answer: (t, id) => papersApi.answer(keyOfPaper(t), id),
      remove: (t, id, h) => papersApi.removeComment(keyOfPaper(t), id, h),
      where: (t) => `research-library/comments/${keyOfPaper(t)}/`,
    }
  }
  const api = commentsApi(rid)
  return {
    read: api.read, add: (t, c) => api.add(t, c).then((r) => r.entry.id), setState: api.setState, answer: api.answer, remove: api.remove,
    where: (t) => `workbench/comments/${t}.md`,
  }
}

// ---------- 같은 대상을 보는 화면들(PDF 탭·맥락 칸)이 함께 쓰는 상태 ----------

interface Slot { file: CommentFile | null; active: string | null; reveal: { id: string; nonce: number } | null }
const slots = new Map<string, Slot>()
const listeners = new Map<string, Set<() => void>>()
export const keyOf = (rid: string, target: string) => `${rid}|${target}`
const EMPTY: Slot = { file: null, active: null, reveal: null }
export function patch(key: string, p: Partial<Slot>) {
  slots.set(key, { ...(slots.get(key) ?? EMPTY), ...p })
  listeners.get(key)?.forEach((f) => f())
}
const loading = new Map<string, Promise<void>>()
export function load(rid: string, target: string, fresh = false): Promise<void> {
  const key = keyOf(rid, target)
  const prev = loading.get(key)
  if (prev) return fresh ? prev.then(() => load(rid, target)) : prev
  const p = backend(rid).read(target).then((file) => patch(key, { file })).catch(() => undefined).finally(() => loading.delete(key))
  loading.set(key, p)
  return p
}
/** 파일이 바뀌었다는 알림 (App의 파일 감시 구독에서 부른다) */
export function commentsChanged(rid: string, target: string) {
  if (listeners.get(keyOf(rid, target))?.size) void load(rid, target)
  bumpPending()
}
/** 에이전트 함을 다시 읽게 한다 */
export function bumpPending() {
  pendingTick++
  pendingListeners.forEach((f) => f())
}
/** 이 코멘트를 PDF에서 보여 달라 (에이전트 함에서 누를 때) */
export function revealComment(rid: string, target: string, id: string) {
  patch(keyOf(rid, target), { active: id, reveal: { id, nonce: Date.now() } })
}

export function useSlot(rid: string, target: string, read = true): Slot {
  const key = keyOf(rid, target)
  const subscribe = useCallback((f: () => void) => {
    const set = listeners.get(key) ?? new Set()
    set.add(f)
    listeners.set(key, set)
    return () => { set.delete(f) }
  }, [key])
  const slot = useSyncExternalStore(subscribe, () => slots.get(key) ?? EMPTY)
  useEffect(() => { if (read) void load(rid, target) }, [rid, target, read])
  return slot
}

let pendingTick = 0
const pendingListeners = new Set<() => void>()
export const usePendingTick = () => useSyncExternalStore((f) => { pendingListeners.add(f); return () => { pendingListeners.delete(f) } }, () => pendingTick)

/** 맥락 칸을 열어 달라는 알림 (App.tsx가 듣는다) */
export const OPEN_CONTEXT = 'rw:open-context'

/** Viewing an existing record must leave the unfinished composer and its quote intact. */
function openRecordsSidebar(rid: string) {
  openRight('records')
  if (rid === LIBRARY) window.dispatchEvent(new Event(OPEN_CONTEXT))
}

// ---------- Claude에게 넘긴 질문 (화면을 옮겨도 "답을 쓰는 중"과 오류가 남게) ----------

export const asking = new Set<string>()
export const askErrors = new Map<string, string>()
let askTick = 0
const askListeners = new Set<() => void>()
export const askKey = (rid: string, target: string, id: string) => `${rid}|${target}|${id}`
function bumpAsk() { askTick++; askListeners.forEach((f) => f()) }
export function useAskTick() { return useSyncExternalStore((f) => { askListeners.add(f); return () => { askListeners.delete(f) } }, () => askTick) }
/** 질문을 이 컴퓨터의 Claude에게 넘기고, 답이 오면 그 파일을 다시 그린다. 기다리지 않아도 된다 */
export async function askClaude(rid: string, target: string, id: string): Promise<void> {
  const k = askKey(rid, target, id)
  if (asking.has(k)) return
  asking.add(k); askErrors.delete(k); bumpAsk()
  try { patch(keyOf(rid, target), { file: await backend(rid).answer(target, id) }); bumpPending() } catch (e) {
    askErrors.set(k, t(`Claude에게 묻지 못했습니다 — ${(e as Error).message}`, `Could not ask Claude: ${(e as Error).message}`))
  } finally { asking.delete(k); bumpAsk() }
}

// ---------- PDF + 코멘트 ----------

interface Draft { kind: CommentKind; page?: number; sel: PdfSelection | null; quote?: string; color?: PaintColor; line?: number; prefix?: string; suffix?: string }

/** 코멘트를 달 수 있는 PDF. PdfTab·원고 PDF·자료 보기가 PdfView 대신 쓴다 */
export function CommentablePdf({ rid, target, url, highlight, onPick }: {
  rid: string; target: CommentTarget; url: string | null; highlight: PdfBox[]; onPick(page: number, x: number, y: number, text: string): void
}) {
  const key = keyOf(rid, target.target)
  const slot = useSlot(rid, target.target)
  const owner = useRef<HTMLDivElement>(null)
  const comments = slot.file?.comments ?? []
  const byId = new Map(comments.map((c) => [c.id, c]))
  const color = useHighlightColor()
  const mode = useRightMode()
  const marks: PdfMark[] = comments.filter((c) => c.page).map((c) => ({
    id: c.id, page: c.page!, rects: c.rects, kind: c.kind === '질문' ? 'question' : 'comment', color: c.color, on: slot.active === c.id,
    title: `${kindText(c.kind)} · ${shown(c.where)}${c.state ? ` · ${stateText(c.state)}` : ''}\n${c.body || c.quote || ''}`.slice(0, 300),
  }))
  const revealed = slot.reveal && byId.get(slot.reveal.id)
  const reveal = revealed?.page ? { page: revealed.page, y: revealed.rects[0]?.[1] ?? 0, nonce: slot.reveal!.nonce } : null
  const library = rid === LIBRARY
  const show = (draft: RecordDraft = {}) => {
    openRecordComposer(rid, target, draft)
    if (library) window.dispatchEvent(new Event(OPEN_CONTEXT))
  }
  const open = (page: number, sel: PdfSelection | null) => show({
    page: sel?.page ?? (library ? undefined : page),
    ...(sel && { rects: sel.rects, pageHeight: sel.pageHeight, quote: sel.text, color }),
  })
  const paint = usePaint(rid, target, owner, (h) => show({
    page: h.page, rects: h.rects, pageHeight: h.pageHeight, quote: h.quote, color: h.color,
  }))
  const pending = comments.filter((c) => c.kind === '질문' && c.state === '대기').length
  return (
    <PdfView rootRef={owner} url={url} highlight={highlight} onPick={onPick} marks={marks} reveal={reveal}
      onMark={(id) => { patch(key, { active: id }); openRecordsSidebar(rid) }}
      paints={paint.paints} paintMenu={paint.menu}
      onSelectionDefault={(sel, clear) => { void paint.add(sel, color); clear() }}
      tools={({ page, sel, clearSel }) => <>
        <button className="pdf-tool labeled" data-ui="형광펜 단추" disabled={!sel || paint.busy} title={sel ? t('고른 글을 처음 색으로 하이라이트합니다', 'Highlight the selected text in the first color') : t('글을 끌어 고른 뒤 누르면 하이라이트합니다 (고르면 뜨는 메뉴에서 색을 고릅니다)', 'Select text, then click to highlight it (pick a color in the menu that appears)')}
          onClick={() => { if (sel) { void paint.add(sel, color); clearSel() } }}>
          <span className="ico">{Icon.highlight}</span><span className="pdf-dot" style={{ background: `linear-gradient(var(--paint-${color}), var(--paint-${color})), var(--paper)` }} /> <span className="pdf-tool-label">{t('하이라이트', 'Highlight')}</span>
        </button>
        <button className="pdf-tool labeled" data-ui="코멘트 단추" title={sel ? t('고른 글에 코멘트', 'Comment on the selected text') : library ? t('논문 전체에 코멘트 — 글을 끌어 고르면 그 부분에', 'Comment on the whole paper. Select text to comment on that part') : t(`${page}쪽에 코멘트 — 글을 끌어 고르면 그 부분에`, `Comment on page ${page}. Select text to comment on that part`)}
          onClick={() => { open(page, sel); clearSel() }}><span className="ico">{Icon.comment}</span> <span className="pdf-tool-label">{t('코멘트', 'Comment')}</span></button>
        <button className={`pdf-tool count${mode === 'records' ? ' on' : ''}`} data-ui="코멘트 목록 단추" title={t('이 PDF의 기록 목록', 'Records for this PDF')} aria-pressed={mode === 'records'}
          onClick={() => openRecordsSidebar(rid)}>
          {comments.length}{pending > 0 && <span className="pdf-pending" title={t(`답을 기다리는 질문 ${pending}`, `Questions awaiting an answer: ${pending}`)}>{pending}</span>}
        </button>
      </>}
      selectionMenu={(sel, clear) => <>
        <PaintDots color={color} disabled={paint.busy} onChange={(c) => { void paint.add(sel, c); clear() }} />
        <span className="record-separator" />
        <button onClick={() => { open(sel.page, sel); clear() }}><span className="ico">{Icon.comment}</span> {t('코멘트', 'Comment')}</button>
      </>} />
  )
}


// ---------- PDF 하이라이트 (노트 결과 · 논문) ----------

type PdfHighlight = NoteHighlight & { page: number; pageHeight?: number }

/** 본문 파일은 건드리지 않고 대상의 기록 파일에 쪽·사각형·색을 저장한다. */
function usePaint(rid: string, target: CommentTarget, owner: { current: HTMLElement | null }, onComment: (h: PdfHighlight) => void) {
  const key = keyOf(rid, target.target)
  const slot = useSlot(rid, target.target)
  const file = slot.file
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const undo = useRef<PdfHighlight | null>(null)
  const active = useRef(false)
  const mutate = useCallback(async (write: () => Promise<CommentFile>): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true; setBusy(true)
    try { patch(key, { file: await write() }); return true } catch (e) {
      if (e instanceof ConflictError) {
        await load(rid, target.target)
        flash(t('그사이 기록이 바뀌어 다시 읽었습니다. 다시 눌러 주세요', 'The records changed in the meantime and were reloaded. Please click again.'))
      } else flash((e as Error).message)
      return false
    } finally { busyRef.current = false; setBusy(false) }
  }, [key, rid, target.target])
  const save = useCallback(async (h: Pick<PdfHighlight, 'page' | 'rects' | 'pageHeight' | 'color' | 'quote' | 'line' | 'prefix' | 'suffix' | 'body'>) => {
    await backend(rid).add(target.target, {
      kind: '하이라이트', title: target.title, source: target.source, text: h.body ?? '',
      page: h.page, rects: h.rects, pageHeight: h.pageHeight, color: h.color, quote: h.quote,
      line: h.line, prefix: h.prefix, suffix: h.suffix,
    })
    return backend(rid).read(target.target)
  }, [rid, target.target, target.title, target.source])
  const restore = useCallback(async (h: PdfHighlight) => {
    if (undo.current?.id !== h.id || busyRef.current) return
    undo.current = null
    if (await mutate(() => save(h))) flash(t('되살렸습니다', 'Restored'))
    else undo.current = h
  }, [mutate, save])
  // 마지막으로 누른 PDF에서만 ⌘Z를 처리한다. 숨은 탭과 입력칸의 되돌리기를 가로채지 않는다.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => { active.current = e.target instanceof Node && Boolean(owner.current?.contains(e.target)) }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !undo.current || !active.current || !owner.current?.getClientRects().length) return
      const t = e.target
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(t instanceof Element && t.closest('input, textarea, [contenteditable="true"]'))) {
        e.preventDefault(); void restore(undo.current)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey) }
  }, [owner, restore])
  const highlights = (file?.highlights ?? []).filter((h): h is PdfHighlight => Boolean(h.page && h.rects.length && !h.lost))
  const quoted = quotedRecordHighlights(file?.comments ?? []).filter((h): h is PdfHighlight => Boolean(h.page && h.rects.length && !h.lost))
  const paints: PdfPaint[] = [...highlights, ...quoted].map((h) => ({ id: h.id, page: h.page, rects: h.rects, color: h.color }))
  const add = (sel: PdfSelection, color: PaintColor) => mutate(() => save({ page: sel.page, rects: sel.rects, pageHeight: sel.pageHeight, color, quote: sel.text }))
  const menu = (p: PdfPaint, close: () => void) => {
    const h = highlights.find((x) => x.id === p.id)
    if (!h) {
      const comment = file?.comments.find((entry) => entry.id === p.id)
      return comment ? <button onClick={() => { close(); patch(key, { active: comment.id }); openRecordsSidebar(rid) }}><span className="ico">{Icon.comment}</span> {t('코멘트 보기', 'View comment')}</button> : null
    }
    return <>
      <PaintDots color={h.color} action="바꾸기" disabled={busy} onChange={(color) => {
        close()
        if (color !== h.color && file) void mutate(() => rid === LIBRARY
          ? papersApi.updateComment(keyOfPaper(target.target), h.id, { color }, file.hash)
          : commentsApi(rid).update(target.target, h.id, { color, baseHash: file.hash }))
      }} />
      <span className="record-separator" />
      <button onClick={() => { close(); onComment(h) }}><span className="ico">{Icon.comment}</span> {t('코멘트 달기', 'Add comment')}</button>
      <button aria-label={t('지우기', 'Delete')} title={t('지우기', 'Delete')} disabled={busy || !file} onClick={() => {
        close()
        active.current = true
        if (file) void mutate(() => backend(rid).remove(target.target, h.id, file.hash)).then((removed) => {
          if (removed) { undo.current = h; flash(t('지웠습니다', 'Deleted'), { label: t('되돌리기', 'Undo'), run: () => { void restore(h) } }) }
        })
      }}><span className="ico">{Icon.trash}</span></button>
    </>
  }
  return { paints, add, menu, busy }
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t)

export function Composer({ rid, target, draft, onClose, onSaved }: { rid: string; target: CommentTarget; draft: Draft; onClose(): void; onSaved(id: string): void }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<CommentKind>(draft.kind)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { area.current?.focus() }, [draft])
  useEffect(() => { setKind(draft.kind) }, [draft])
  const save = async () => {
    if (busy || (!text.trim() && !draft.sel && !draft.quote)) return
    setBusy(true)
    try {
      const id = await backend(rid).add(target.target, {
        kind, title: target.title, source: target.source, page: draft.page,
        rects: draft.sel?.rects, pageHeight: draft.sel?.pageHeight, quote: draft.sel?.text ?? draft.quote, text,
        color: draft.color, line: draft.line, prefix: draft.prefix, suffix: draft.suffix,
      })
      await load(rid, target.target)
      bumpPending()
      onSaved(id)
      onClose()
      // 질문은 남기자마자 Claude에게 넘기고, 답이 붙는 맥락 칸을 연다
      if (kind === '질문') { void askClaude(rid, target.target, id); window.dispatchEvent(new Event(OPEN_CONTEXT)) }
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className={`pdf-pop composer ${kind === '질문' ? 'question' : 'comment'}`} data-ui="코멘트 쓰기">
      <div className="pdf-pop-head"><div className="segmented small" role="group" aria-label={t('기록 종류', 'Record kind')}>
        {(['메모', '질문'] as const).map((k) => <button key={k} type="button" className={kind === k || (kind === '코멘트' && k === '메모') ? 'on' : ''} aria-pressed={kind === k || (kind === '코멘트' && k === '메모')} onClick={() => setKind(k)}>{kindText(k)}</button>)}
      </div> <span className="muted">{draft.page ? t(`· ${draft.page}쪽`, `· p. ${draft.page}`) : rid === LIBRARY ? t('· 논문 전체', '· Whole paper') : `· ${target.title}`}{kind === '질문' ? t(' · 남기면 이 컴퓨터의 Claude가 답합니다', ' · Claude on this computer will answer it') : ''}</span></div>
      {(draft.sel?.text ?? draft.quote) && <blockquote className="cmt-quote" style={draft.color ? { borderColor: `var(--paint-${draft.color})` } : undefined}>{clip(draft.sel?.text ?? draft.quote!, 400)}</blockquote>}
      <textarea ref={area} rows={3} value={text} placeholder={kind === '질문' ? t('무엇이 궁금한가요? 검산·정리·반례 찾기 같은 부탁도 됩니다 (⌘↵ 저장)', 'What do you want to know? You can also ask for checks, summaries, or counterexamples (⌘↵ to save)') : t('코멘트 (⌘↵ 저장)', 'Comment (⌘↵ to save)')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() }
          else if (e.key === 'Escape') onClose()
          else onListKey(e, setText)
        }} />
      {err && <div className="banner danger">{err}</div>}
      <div className="cmt-actions">
        <span className="muted mono">{backend(rid).where(target.target)}</span>
        <span className="sp" />
        <button className="btn ghost" onClick={onClose}>{t('취소', 'Cancel')}</button>
        <button className="btn primary" disabled={busy || (!text.trim() && !draft.sel && !draft.quote)} onClick={() => void save()}>{busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button>
      </div>
    </div>
  )
}

// ---------- 목록 (맥락 칸·PDF 위 목록) ----------

export function CommentList({ rid, target }: { rid: string; target: string }) {
  const key = keyOf(rid, target)
  const slot = useSlot(rid, target)
  const [err, setErr] = useState<string | null>(null)
  const items = slot.file?.comments ?? []
  const activeEl = useRef<HTMLDivElement>(null)
  useEffect(() => { activeEl.current?.scrollIntoView({ block: 'nearest' }) }, [slot.active])
  useAskTick()
  const askErr = items.map((c) => askErrors.get(askKey(rid, target, c.id))).find(Boolean)

  const act = async (f: (hash: string) => Promise<CommentFile>) => {
    setErr(null)
    try { patch(key, { file: await f(slot.file?.hash ?? '') }); bumpPending() } catch (e) {
      if (e instanceof ConflictError) { await load(rid, target); setErr(t('그사이 파일이 바뀌어(에이전트의 답 등) 다시 읽었습니다. 한 번 더 눌러 주세요.', "The file changed in the meantime (for example, an agent's answer) and was reloaded. Please click once more.")) } else setErr((e as Error).message)
    }
  }
  const api = backend(rid)
  if (!slot.file) return <p className="muted cmt-empty">{t('불러오는 중…', 'Loading…')}</p>
  if (!items.length) return <p className="muted cmt-empty" title={t('글을 끌어 고르거나 PDF 툴바의 코멘트로 기록을 남깁니다.', 'Select text or use Comment in the PDF toolbar to add a record.')}>{t('없음', 'None')}</p>
  return (
    <div className="cmt-list">
      {(err ?? askErr) && <div className="banner">{err ?? askErr}</div>}
      {items.map((c) => (
        <CommentItem key={c.id} c={c} on={slot.active === c.id} ref_={slot.active === c.id ? activeEl : undefined}
          asking={asking.has(askKey(rid, target, c.id))} onAsk={() => void askClaude(rid, target, c.id)}
          onGo={() => revealComment(rid, target, c.id)}
          onState={(s) => void act((h) => api.setState(target, c.id, s, h))}
          onDelete={() => void askConfirm({ title: t('이 코멘트를 지울까요?', 'Delete this comment?'), hint: t('달린 답도 함께 지워집니다.', 'Its answers are deleted too.'), ok: t('지우기', 'Delete') }).then((y) => { if (y) void act((h) => api.remove(target, c.id, h)) })} />
      ))}
    </div>
  )
}

function CommentItem({ c, on, ref_, asking, onAsk, onGo, onState, onDelete }: {
  c: CommentEntry; on: boolean; ref_?: React.Ref<HTMLDivElement>; asking: boolean; onAsk(): void; onGo(): void; onState(s: '대기' | '끝냄'): void; onDelete(): void
}) {
  return (
    <div className={`cmt ${c.kind === '질문' ? 'question' : 'comment'}${on ? ' on' : ''}${c.state === '끝냄' ? ' done' : ''}`} ref={ref_} data-ui="코멘트" data-ui-item={c.id}>
      <div className="cmt-head">
        <div className="cmt-meta">
          <span className="cmt-kind">{c.kind === '질문' ? '?' : <span className="ico">{Icon.comment}</span>} {kindText(c.kind)}</span>
          <button className="cmt-where" title={c.page ? t(`${c.where} · PDF의 그 자리로`, `${c.where} · Go to that spot in the PDF`) : t('노트 전체', 'Whole note')} disabled={!c.page} onClick={onGo}>{shown(c.where)}</button>
          {c.state && <span className={`cmt-state s-${c.state}`}>{c.state === '대기' ? t('에이전트 대기', 'Waiting for agent') : stateText(c.state)}</span>}
        </div>
        <div className="cmt-head-actions">
          {c.kind === '질문' && c.state === '대기' && (
            <button className="btn ghost sm cmt-ask" disabled={asking} title={t('이 컴퓨터의 Claude가 PDF를 읽고 답을 아래에 덧붙입니다 (몇 분 걸릴 수 있음)', 'Claude on this computer reads the PDF and adds an answer below (may take a few minutes)')} onClick={onAsk}>{asking ? t('Claude가 답을 쓰는 중…', 'Claude is writing an answer…') : t('Claude에게 묻기', 'Ask Claude')}</button>
          )}
          {c.kind === '질문' && c.state !== '끝냄' && <button className="btn ghost sm" title={t('이 질문을 끝냄으로', 'Mark this question done')} onClick={() => onState('끝냄')}>{t('끝냄', 'Done')}</button>}
          {c.kind === '질문' && c.state === '끝냄' && <button className="btn ghost sm" title={t('다시 에이전트 대기로', 'Set back to waiting for agent')} onClick={() => onState('대기')}>{t('다시 열기', 'Reopen')}</button>}
          {c.answers.length === 0 && <button className="icon-btn hover-actions" title={t('지우기', 'Delete')} aria-label={t('지우기', 'Delete')} onClick={onDelete}>{Icon.trash}</button>}
        </div>
      </div>
      {c.quote && <blockquote className="cmt-quote" onClick={onGo}>{c.quote}</blockquote>}
      {c.body && <div className="cmt-body">{c.body}</div>}
      {c.answers.map((a, i) => (
        <div key={i} className="cmt-answer">
          <div className="cmt-answer-head"><span>{t('답', 'Answer')}</span><span className="cmt-answer-by" title={a.by}>· {a.by}</span><span className="muted cmt-time">· {a.at}</span></div>
          {/* 답은 에이전트가 쓴 마크다운(목록·굵게·$수식$)이라 메모처럼 그린다 */}
          <div className="cmt-body"><MemoText text={a.body} /></div>
        </div>
      ))}
    </div>
  )
}

/** 맥락 칸: 지금 대상의 코멘트. 맥에서 남긴 코멘트를 클라우드의 Claude도 읽게 GitHub에 올릴 수 있다 */
export function CommentsPanel({ rid, target }: { rid: string; target: CommentTarget }) {
  const slot = useSlot(rid, target.target)
  const [unpublished, setUnpublished] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const request = useRecordComposerRequest()
  useEffect(() => {
    if (!request || request.rid !== rid || request.target.target !== target.target) return
    const a = request.draft
    setDraft({ kind: '메모', ...a, sel: a.page && a.rects ? { page: a.page, rects: a.rects, text: a.quote ?? '', pageHeight: a.pageHeight } : null })
    clearRecordComposerRequest(request.nonce)
  }, [request, rid, target.target])
  useEffect(() => { if (rid === LIBRARY) return; commentsApi(rid).unpublished().then(setUnpublished).catch(() => setUnpublished(null)) }, [rid, slot.file?.hash])
  const publish = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await commentsApi(rid).publish()
      setMsg(r.message)
      setUnpublished(await commentsApi(rid).unpublished())
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="ctx-comments" data-ui="맥락 칸 코멘트">
      <div className="pane-head" data-ui="머리줄">
        <span className="crumb"><b>{t('코멘트·질문', 'Comments and questions')}</b>{rid !== LIBRARY && <> · {target.title}</>}</span>
        <span className="sp" />
        <button className={`btn sm${draft ? ' on' : ''}`} data-ui="질문 쓰기 단추" title={t('이 노트·PDF 전체에 대해 Claude에게 질문하거나 부탁합니다 (검산, 정리, 반례 찾기 …)', 'Ask Claude a question or a favor about this whole note or PDF (checks, summaries, counterexamples …)')} aria-pressed={!!draft}
          onClick={() => setDraft(draft ? null : { kind: '질문', sel: null })}>? {t('질문', 'Question')}</button>
        {!!unpublished?.length && (
          <button className="btn sm" data-ui="코멘트 GitHub에 올리기" disabled={busy} title={`${t('이 프로젝트의 코멘트 파일만 커밋해 GitHub에 올려 등록합니다 (클라우드의 Claude가 읽도록)', "Commit only this project's comment files and push them to GitHub (so Claude in the cloud can read them)")}\n${unpublished.join('\n')}`}
            onClick={() => void publish()}>{busy ? t('등록 중…', 'Pushing…') : t(`코멘트 등록 ${unpublished.length}`, `Push comments ${unpublished.length}`)}</button>
        )}
      </div>
      {msg && <div className="banner">{msg}<span className="sp" /><button className="btn ghost sm" onClick={() => setMsg(null)}>{t('닫기', 'Close')}</button></div>}
      {draft && <div className="cmt-inline"><Composer rid={rid} target={target} draft={draft} onClose={() => setDraft(null)}
        onSaved={(id) => patch(keyOf(rid, target.target), { active: id })} /></div>}
      <CommentList rid={rid} target={target.target} />
    </section>
  )
}

/** 에이전트 함: 이 프로젝트의 답을 기다리는 질문. 누르면 그 PDF의 그 자리로 */
export function AgentInbox({ rid, version, firstPartOf }: { rid: string; version: number; firstPartOf(target: string): string | undefined }) {
  const [items, setItems] = useState<PendingQuestion[] | null>(null)
  const tick = useSyncExternalStore((f) => { pendingListeners.add(f); return () => { pendingListeners.delete(f) } }, () => pendingTick)
  useEffect(() => { commentsApi(rid).overview().then((r) => setItems(r.pending)).catch(() => setItems([])) }, [rid, version, tick])
  if (!items?.length) return null
  const openQ = (q: PendingQuestion) => {
    if (q.target.startsWith('paper-') && q.source) go({ page: 'doc', rid, name: q.source })
    else if (q.target.startsWith('block-')) go({ page: 'block', rid, bid: q.source ?? q.target.slice(6) })
    else if ((q.target.startsWith('note-') || q.target.startsWith('calc-')) && q.source) go({ page: 'part', rid, file: q.source })
    else if (q.target === 'manuscript' || q.target.startsWith('manuscript-')) { const f = firstPartOf(q.target); if (f) go({ page: 'part', rid, file: f }) }
    revealComment(rid, q.target, q.id)
  }
  return (
    <section className="agent-inbox" data-ui="에이전트 함">
      <div className="pane-head" data-ui="머리줄"><span className="crumb" title={t('이 저장소에서 Claude Code에 "에이전트 함 처리해"라고 하면 workbench/STATUS.md를 읽고 답을 적습니다.', 'Tell Claude Code in this repository "process the agent inbox" and it reads workbench/STATUS.md and writes the answers.')}><b>{t('에이전트 함', 'Agent inbox')}</b> · {t(`답을 기다리는 질문 ${items.length}`, `Questions awaiting an answer: ${items.length}`)}</span></div>
      {items.map((q) => (
        <button key={`${q.target}/${q.id}`} className="inbox-item" title={q.file} onClick={() => openQ(q)}>
          <span className="inbox-where">{q.title}{q.where !== '전체' ? ` · ${shown(q.where)}` : ''}</span>
          <span className="inbox-text">{q.body || (q.quote && `"${q.quote}"`)}</span>
        </button>
      ))}
    </section>
  )
}

/** 기록은 본문 바깥에 저장하며 읽기·편집기에서 같은 메뉴를 쓴다. */
export function NoteAsk({ rid, target, source = '', contentOffset = 0, children }: { rid: string; target: CommentTarget | null; source?: string; contentOffset?: number; from?: LearnFrom; children: ReactNode }) {
  return target ? <NoteRecords key={`${rid}|${target.target}`} rid={rid} target={target} source={source} contentOffset={contentOffset}>{children}</NoteRecords> : <>{children}</>
}

function NoteRecords({ rid, target, source, contentOffset, children }: { rid: string; target: CommentTarget; source: string; contentOffset: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const slot = useSlot(rid, target.target)
  const key = keyOf(rid, target.target)
  const color = useHighlightColor()
  const [sel, setSel] = useState<RecordSelection | null>(null)
  const [active, setActive] = useState<{ id: string; x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const highlights = [...(slot.file?.highlights ?? []), ...quotedRecordHighlights(slot.file?.comments ?? [])]
  const revealed = slot.reveal && slot.file?.comments.find((record) => record.id === slot.reveal!.id)
  const reveal = revealed && !revealed.lost && revealed.line ? { id: revealed.id, line: revealed.line, quote: revealed.quote, prefix: revealed.prefix, suffix: revealed.suffix, nonce: slot.reveal!.nonce } : undefined
  useEffect(() => {
    setRecordSelectionDraft(rid, target.target, sel && { quote: sel.quote, line: sel.line, prefix: sel.prefix, suffix: sel.suffix, color })
    return () => setRecordSelectionDraft(rid, target.target, null)
  }, [rid, target.target, sel, color])
  const selected = highlights.find((h) => h.id === active?.id)
  useRecordSelection(box, source, contentOffset, (selection) => { setSel(selection); if (selection) setActive(null) })
  const done = () => { setSel(null); window.getSelection()?.removeAllRanges() }
  const write = async (operation: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try { await operation() } catch (e) {
      if (e instanceof ConflictError) { await load(rid, target.target); flash(t('그사이 기록이 바뀌어 다시 읽었습니다. 한 번 더 눌러 주세요.', 'The records changed in the meantime and were reloaded. Please click once more.')) }
      else flash((e as Error).message)
    } finally { locked.current = false; setBusy(false) }
  }
  const add = (paint: PaintColor) => {
    if (!sel) return
    const { quote, line, prefix, suffix } = sel
    void write(async () => {
      await commentsApi(rid).add(target.target, { kind: '하이라이트', title: target.title, source: target.source, color: paint, quote, line, prefix, suffix, text: '' })
      await load(rid, target.target)
      done()
    })
  }
  const remove = () => {
    if (!selected || !slot.file) return
    const h = selected
    void write(async () => {
      patch(key, { file: await commentsApi(rid).remove(target.target, h.id, slot.file!.hash) })
      setActive(null)
      let restored = false
      const restore = async () => {
        if (restored) return
        restored = true
        try {
          await commentsApi(rid).add(target.target, { kind: '하이라이트', title: target.title, source: target.source, color: h.color, quote: h.quote, line: h.line, prefix: h.prefix, suffix: h.suffix, page: h.page, rects: h.rects, text: h.body ?? '' })
          await load(rid, target.target)
          flash(t('되살렸습니다', 'Restored'))
        } catch (e) { restored = false; flash((e as Error).message, { label: t('되돌리기', 'Undo'), run: () => { void restore() } }) }
      }
      flash(t('지웠습니다', 'Deleted'), { label: t('되돌리기', 'Undo'), run: () => { void restore() } })
    })
  }
  return (
    <RecordContext.Provider value={{ source, contentOffset, highlights, reveal,
      onSelect: (selection) => { setSel(selection); if (selection) setActive(null) },
      onHighlight: (id, point) => {
        done()
        if (slot.file?.comments.some((record) => record.id === id)) { patch(key, { active: id }); openRecordsSidebar(rid) }
        else setActive({ id, ...point })
      },
    }}><div ref={box} className="note-ask">
      {children}
      {sel && (
        <RecordMenu anchor={sel} owner={box.current} onClose={() => setSel(null)} onDefault={() => add(color)}>
          <PaintDots color={color} onChange={add} disabled={busy} />
          <span className="record-menu-sep" />
          <button disabled={busy} onClick={() => { openRecordComposer(rid, target, { quote: sel.quote, line: sel.line, prefix: sel.prefix, suffix: sel.suffix, color }); done() }}><span className="ico">{Icon.comment}</span> {t('코멘트', 'Comment')}</button>
        </RecordMenu>
      )}
      {active && selected && <RecordMenu anchor={active} highlight owner={box.current} onClose={() => setActive(null)}>
        <PaintDots color={selected.color} action="바꾸기" disabled={busy} onChange={(paint) => { if (paint !== selected.color && slot.file) void write(async () => { patch(key, { file: await commentsApi(rid).update(target.target, selected.id, { color: paint, baseHash: slot.file!.hash }) }) }) }} />
        <span className="record-menu-sep" />
        <button disabled={busy} onClick={() => { openRecordComposer(rid, target, { quote: selected.quote, line: selected.line, prefix: selected.prefix, suffix: selected.suffix, color: selected.color }); setActive(null) }}><span className="ico">{Icon.comment}</span> {t('코멘트 달기', 'Add comment')}</button>
        <button disabled={busy} aria-label={t('지우기', 'Delete')} title={t('지우기', 'Delete')} onClick={remove}><span className="ico">{Icon.trash}</span></button>
      </RecordMenu>}
    </div></RecordContext.Provider>
  )
}
