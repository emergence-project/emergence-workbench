import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { commentsApi, ConflictError, type CommentEntry, type CommentFile, type NoteHighlight, type RecordFile } from './api'
import { askClaude, bumpPending, keyOf, load, patch, revealComment, usePendingTick, useSlot, type CommentTarget } from './Comments'
import { clearRecordComposerRequest, useRecordComposerRequest } from './RecordContext'
import { PaintDots } from './RecordMenus'
import { Icon } from './icons'
import { onListKey } from './listInput'
import { go } from './router'
import { useHighlightColor } from './ui'
import { classifiedRecordCount, filterForActiveRecord, recordRoute, type RecordFilter } from './recordsPanelHelpers'
import { flash } from './flash'
import { RecordList } from './RecordList'

const FILTERS: RecordFilter[] = ['전체', '메모', '할 일', '질문']
const CLASSIFY_TIP = t('Claude(작은 모델)가 분류 전 기록을 메모 · 할 일 · 질문으로 나눕니다', 'Claude (a small model) sorts unsorted records into memos, to-dos, and questions')
/** 필터·기록 종류의 화면 이름 (값은 한국어 그대로) */
const LABEL: Record<string, string> = { 전체: t('전체', 'All'), 메모: t('메모', 'Memo'), '할 일': t('할 일', 'To-do'), 질문: t('질문', 'Question'), 코멘트: t('코멘트', 'Comment'), 하이라이트: t('하이라이트', 'Highlight') }
const labelOf = (k: string) => LABEL[k] ?? k
// Keep a pending target disabled even when its sidebar unmounts and opens again.
const classifying = new Set<string>()
import { RECORD_KINDS, recordDrafts, attachRecordDraft, type ComposerDraft } from './recordDrafts'
import { t } from './i18n'

export function RecordsPanel({ rid, target, version, firstPartOf, onOpenPdf }: {
  rid: string; target: CommentTarget; version: number; firstPartOf(target: string): string | undefined
  onOpenPdf(file: RecordFile): boolean
}) {
  const slot = useSlot(rid, target.target)
  const tick = usePendingTick()
  const key = keyOf(rid, target.target)
  const activeKey = useRef<string | null>(key)
  activeKey.current = key
  useEffect(() => { activeKey.current = key; return () => { activeKey.current = null } }, [key])
  const classifying_ = classifying.has(key)
  const unsorted = slot.file?.comments.filter((c) => c.unsorted) ?? []
  const project = target.target === 'project'
  const [files, setFiles] = useState<RecordFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RecordFilter>('전체')
  useEffect(() => {
    if (!project) return
    let active = true
    commentsApi(rid).records().then((r) => { if (active) { setFiles(r.files); setError(null) } }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [rid, project, version, tick])
  const shown = project ? files : slot.file ? [slot.file] : []
  useEffect(() => {
    const comments = project ? files.find((file) => file.target === target.target)?.comments ?? [] : slot.file?.comments ?? []
    setFilter((current) => filterForActiveRecord(current, comments, slot.active))
  }, [slot.active, slot.file, files, project, target.target])
  const open = (file: RecordFile, c?: CommentEntry) => {
    if (project && !(c?.page && onOpenPdf(file))) {
      const route = recordRoute(rid, file, firstPartOf)
      if (route) go(route)
    }
    if (c && !c.lost) revealComment(rid, file.target, c.id)
  }
  const classify = async () => {
    const file = slot.file
    if (!file || !unsorted.length || classifying.has(key)) return
    classifying.add(key); bumpPending()
    try {
      const updated = await commentsApi(rid).classify(file.target, file.hash)
      patch(key, { file: updated })
      if (activeKey.current === key) flash(t(`${classifiedRecordCount(file.comments, updated.comments)}개를 나눴습니다`, `Sorted ${classifiedRecordCount(file.comments, updated.comments)}`))
    } catch (e) {
      if (e instanceof ConflictError) await load(rid, file.target, true)
      if (activeKey.current === key) flash((e as Error).message)
    } finally { classifying.delete(key); bumpPending() }
  }
  return <section className="records-panel" data-ui="적기">
    <div className="records-filters" role="group" aria-label={t('기록 필터', 'Record filter')}>
      {FILTERS.map((f) => <button key={f} className={`memo-chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{labelOf(f)}</button>)}
    </div>
    {(unsorted.length > 0 || classifying_) && <div className="records-classify">
      <button className="a" data-ui="자동 분류 버튼" data-tip={CLASSIFY_TIP} title={CLASSIFY_TIP} disabled={classifying_} onClick={() => void classify()}>{classifying_ ? t('분류하는 중…', 'Sorting…') : t(`자동 분류 ${unsorted.length}개`, `Auto-sort ${unsorted.length}`)}</button>
    </div>}
    <div className="records-list" data-ui="적기 목록">
      {error && <div className="banner danger" role="alert">{error}</div>}
      {shown.map((file) => <div key={file.target} className="record-group">
        {project && <div className="record-group-title">{file.target === 'project' ? <span>{t('이 프로젝트', 'This project')}</span>
          : <button className="a" title={file.source} onClick={() => open(file)}>{file.title}</button>}</div>}
        <RecordList rid={rid} file={file} filter={filter} onGo={(c) => open(file, c)} />
      </div>)}
      {!shown.length && !error && <p className="muted records-empty">{t('불러오는 중…', 'Loading…')}</p>}
      {!project && !!slot.file?.highlights.some((h) => h.lost) && <LostHighlights rid={rid} file={slot.file} />}
    </div>
    <RecordComposer key={`${rid}|${target.target}`} rid={rid} target={target} />
  </section>
}

function LostHighlights({ rid, file }: { rid: string; file: CommentFile }) {
  const [busy, setBusy] = useState(false)
  const remove = async (h: NoteHighlight) => {
    if (busy) return
    setBusy(true)
    try {
      patch(keyOf(rid, file.target), { file: await commentsApi(rid).remove(file.target, h.id, file.hash) }); bumpPending()
      flash(t('지웠습니다', 'Deleted'), { label: t('되돌리기', 'Undo'), run: () => { void commentsApi(rid).add(file.target, {
        kind: '하이라이트', title: file.title, source: file.source, text: h.body ?? '', quote: h.quote, color: h.color,
        line: h.line, prefix: h.prefix, suffix: h.suffix, page: h.page, rects: h.rects,
      }).then(() => load(rid, file.target)).catch((e: Error) => flash(e.message)) } })
    } catch (e) { if (e instanceof ConflictError) await load(rid, file.target); flash((e as Error).message) }
    finally { setBusy(false) }
  }
  return <details className="record-lost"><summary>{t('자리를 잃은 하이라이트', 'Highlights that lost their place')} · {file.highlights.filter((h) => h.lost).length}</summary>
    {file.highlights.filter((h) => h.lost).map((h) => <div className="record-lost-row" key={h.id}><blockquote className="record-quote" style={{ borderColor: `var(--paint-${h.color})` }}>{h.quote}</blockquote><button className="icon-btn tip-end" data-tip={t('지우기', 'Delete')} aria-label={t('지우기', 'Delete')} disabled={busy} onClick={() => void remove(h)}>{Icon.trash}</button></div>)}
  </details>
}

function RecordComposer({ rid, target }: { rid: string; target: CommentTarget }) {
  const key = keyOf(rid, target.target)
  const defaultColor = useHighlightColor()
  const request = useRecordComposerRequest()
  const state = useSyncExternalStore((listener) => recordDrafts.subscribe(key, listener), () => recordDrafts.read(key, defaultColor))
  const { draft, error } = state
  const busy = state.pending !== null
  const setDraft = (next: ComposerDraft) => recordDrafts.write(key, next)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (busy || !request || request.rid !== rid || request.target.target !== target.target) return
    setDraft(attachRecordDraft(draft, request.draft, defaultColor))
    clearRecordComposerRequest(request.nonce)
    area.current?.focus()
  }, [request, rid, target.target, busy]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const ticket = recordDrafts.begin(key, defaultColor)
    if (!ticket) return
    const draft = ticket.draft
    let error: string | null = null
    try {
      const a = draft.attachment
      const result = await commentsApi(rid).add(target.target, { kind: draft.kind, title: target.title, source: target.source, text: draft.text,
        ...a, ...(a.quote && { color: draft.color }) })
      await load(rid, target.target, true); bumpPending()
      patch(key, { active: result.entry.id })
      if (draft.kind === '질문') void askClaude(rid, target.target, result.entry.id)
    } catch (e) { error = (e as Error).message }
    finally { recordDrafts.finish(key, ticket, defaultColor, error); requestAnimationFrame(() => area.current?.focus()) }
  }
  const a = draft.attachment
  return <div className="record-composer" data-ui="적기 칸">
    <div className="segmented small" role="group" aria-label={t('기록 종류', 'Record kind')}>{RECORD_KINDS.map((k) => <button key={k} className={draft.kind === k ? 'on' : ''} aria-pressed={draft.kind === k} disabled={busy} onClick={() => setDraft({ ...draft, kind: k })}>{labelOf(k)}</button>)}</div>
    {a.quote && <>
      <div className="record-paint"><span>{t('고른 글 색', 'Selection color')}</span><PaintDots color={draft.color} disabled={busy} onChange={(color) => setDraft({ ...draft, color })} /></div>
      <div className="record-attached"><span title={a.quote}>{t('고른 글', 'Selection')}{a.line ? t(` · ${a.line}줄`, ` · line ${a.line}`) : a.page ? t(` · ${a.page}쪽`, ` · p. ${a.page}`) : ''} “{a.quote}”</span><button className="icon-btn" aria-label={t('고른 글 빼기', 'Remove selection')} title={t('빼기', 'Remove')} disabled={busy} onClick={() => setDraft({ ...draft, attachment: {} })}>×</button></div>
    </>}
    <textarea ref={area} rows={3} aria-label={t('기록 입력란', 'Record input')} placeholder={draft.kind === '질문' ? (/^(note|calc)-/.test(target.target) ? t('궁금한 것이나 고칠 것을 적으면 Claude에게 보냅니다. 고친 글은 "노트에 적용"으로 넣습니다.', 'Write a question or something to fix and it goes to Claude. Put the revised text in with "Apply to note".') : t('무엇이 궁금한가요? 적으면 Claude에게 묻습니다.', 'What do you want to know? Claude will answer it.')) : (target.target === 'project' ? t('이 프로젝트에 남길 기록', 'A record for this project') : t('이 노트·PDF에 남길 기록', 'A record for this note or PDF'))} value={draft.text} disabled={busy}
      onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void save() } else onListKey(e, (text) => setDraft({ ...draft, text })) }} />
    {error && <div className="banner danger" role="alert">{error}</div>}
    <div className="record-composer-actions"><span>⌘↵ {t('저장', 'Save')}</span><button className="btn primary sm" disabled={busy || !draft.text.trim()} onClick={() => void save()}>{busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button></div>
  </div>
}
