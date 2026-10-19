import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { commentsApi, ConflictError, type CommentEntry, type CommentFile, type NoteHighlight, type RecordFile } from './api'
import { askClaude, bumpPending, keyOf, load, patch, revealComment, usePendingTick, useSlot, type CommentTarget } from './Comments'
import { clearRecordComposerRequest, useRecordComposerRequest } from './RecordContext'
import { PaintPicker } from './RecordMenus'
import { Icon } from './icons'
import { onListKey } from './listInput'
import { go } from './router'
import { openFlowDot } from './FlowView'
import { useHighlightColor } from './ui'
import { classifiedRecordCount, filterByStatus, filterForActiveRecord, filterRecords, recordRoute, statusForActiveRecord, type PanelFilter, type StatusFilter } from './recordsPanelHelpers'
import { flash } from './flash'
import { RecordList, type RecordPlaceOf } from './RecordList'
import { LIBRARY_RID } from '@rw/core'
import { chooseRecordFilter } from './workRecords'
import { RECORD_KINDS, recordDrafts, attachRecordDraft, type ComposerDraft } from './recordDrafts'
import { t } from './i18n'
import { uiShown } from './uiNames'
import { RecordPointer, type PointedPart } from './RecordPointer'
import { kindLabel } from './recordLabels'
import { useRecords } from './projectQueries'

const FILTERS: PanelFilter[] = ['전체', '메모', '할 일', '질문', '지시']
const STATUSES: StatusFilter[] = ['진행 중', '완료']
const statusName = (s: StatusFilter) => s === '완료' ? t('완료', 'Done') : t('진행 중', 'In progress')
const CLASSIFY_TIP = t('Claude(작은 모델)가 분류 전 기록을 메모 · 할 일 · 질문 · 지시로 나눕니다', 'Claude (a small model) sorts unsorted records into memos, to-dos, questions, and instructions')
/** 기록 종류의 그림 (10/16 아이콘 검토): 적기 칸의 종류 고르기에 글자 앞에 붙인다(필터는 좁은 폭에서 두 줄이 되지 않게 글자만). 기록 줄 맨 앞과 같은 그림 */
const KIND_ICON: Record<string, ReactNode> = { 메모: Icon.memo, '할 일': Icon.todo, 질문: Icon.ask, 지시: Icon.send }
const kindChoice = (k: string) => <>{KIND_ICON[k] && <span className="record-kind-ico" aria-hidden>{KIND_ICON[k]}</span>}{kindLabel(k)}</>
// Keep a pending target disabled even when its sidebar unmounts and opens again.
const classifying = new Set<string>()
const NO_FILES: RecordFile[] = []

export function RecordsPanel({ rid, target, version, firstPartOf, onOpenPdf, placeOf }: {
  rid: string; target: CommentTarget; version: number; firstPartOf(target: string): string | undefined
  onOpenPdf(file: RecordFile): boolean
  /** 붙은 곳을 줄 번호 대신 이 이름으로 (개념노트는 절 이름, 10/18) */
  placeOf?: RecordPlaceOf
}) {
  const slot = useSlot(rid, target.target)
  // 자동 분류 중(classifying)이 바뀌면 다시 그린다
  usePendingTick()
  const key = keyOf(rid, target.target)
  const activeKey = useRef<string | null>(key)
  activeKey.current = key
  useEffect(() => { activeKey.current = key; return () => { activeKey.current = null } }, [key])
  const classifying_ = classifying.has(key)
  const unsorted = slot.file?.comments.filter((c) => c.unsorted) ?? []
  const project = target.target === 'project'
  const recordsQuery = useRecords(rid, project)
  const files = recordsQuery.data?.files ?? NO_FILES
  const error = recordsQuery.error?.message ?? null
  const [filter, setFilter] = useState<PanelFilter>('전체')
  // 상태는 처음과 대상을 바꿀 때마다 진행 중 (끝낸 기록은 숨김, 10/18 결정)
  const [status, setStatus] = useState<StatusFilter>('진행 중')
  useEffect(() => setStatus('진행 중'), [rid, target.target])
  const shown = project ? files : slot.file ? [slot.file] : []
  useEffect(() => {
    const comments = project ? files.find((file) => file.target === target.target)?.comments ?? [] : slot.file?.comments ?? []
    setFilter((current) => filterForActiveRecord(current, comments, slot.active))
    setStatus((current) => statusForActiveRecord(current, comments, slot.active))
  }, [slot.active, slot.file, files, project, target.target])
  const kindShown = shown.flatMap((file) => filterRecords(file.comments, filter))
  const open = (file: RecordFile, c?: CommentEntry) => {
    if (project && !(c?.page && onOpenPdf(file))) {
      const route = recordRoute(rid, file, firstPartOf)
      if (file.target.startsWith('flow-') && file.source) openFlowDot(rid, { id: file.source })
      else if (route) go(route)
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
    <div className="records-filters">
      {/* 종류는 하나만 고르는 선택 칸, 폭에 꽉 참 (10/18 결정) */}
      <div className="segmented small full" role="group" aria-label={t('기록 필터', 'Record filter')}>
        {FILTERS.map((f) => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{kindLabel(f)}</button>)}
      </div>
      <div className="records-subbar">
        <div className="segmented small" role="group" aria-label={t('기록 상태', 'Record status')} data-ui="기록 상태">
          {STATUSES.map((s) => <button key={s} className={status === s ? 'on' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>{statusName(s)} <span className="n">{filterByStatus(kindShown, s).length}</span></button>)}
        </div>
        {/* 프로젝트의 기록을 모두 모은 기록 탭으로 (10/14 13:33 제안). 전체면 메모를 연다. 지식 라이브러리에는 기록 탭이 없다 */}
        {rid !== LIBRARY_RID && <button className="a records-all" data-ui="모두 보기" data-tip={t('기록 탭에서 이 프로젝트의 기록 모두 보기', 'See all records of this project in the Records tab')}
          onClick={() => { chooseRecordFilter(filter === '전체' ? '메모' : filter); go({ page: 'records', rid }) }}>{t('모두 보기 ›', 'See all ›')}</button>}
      </div>
    </div>
    <PublishFailure rid={rid} version={version} />
    {(unsorted.length > 0 || classifying_) && <div className="records-classify">
      <button className="a" data-ui="자동 분류 버튼" data-tip={CLASSIFY_TIP} disabled={classifying_} onClick={() => void classify()}>{classifying_ ? t('분류하는 중…', 'Sorting…') : t(`자동 분류 ${unsorted.length}개`, `Auto-sort ${unsorted.length}`)}</button>
    </div>}
    <div className="records-list" data-ui="적기 목록">
      {error && <div className="banner danger" role="alert">{error}</div>}
      {shown.map((file) => <div key={file.target} className="record-group">
        {project && <div className="record-group-title">{file.target === 'project' ? <span>{t('이 프로젝트', 'This project')}</span>
          : <button className="a" title={file.source} onClick={() => open(file)}>{file.title}</button>}</div>}
        <RecordList rid={rid} file={file} filter={filter} status={status} showSource={project} placeOf={placeOf} onGo={(c) => open(file, c)} />
      </div>)}
      {!shown.length && !error && <p className="empty records-empty">{slot.error ?? t('불러오는 중…', 'Loading…')}</p>}
      {!project && !!slot.file?.highlights.some((h) => h.lost) && <LostHighlights rid={rid} file={slot.file} />}
    </div>
    <RecordComposer key={`${rid}|${target.target}`} rid={rid} target={target} />
  </section>
}

/** 기록을 GitHub에 저절로 올리지 못했을 때만 한 줄 (10/15). 잘 올라가면 아무것도 보이지 않는다 */
function PublishFailure({ rid, version }: { rid: string; version: number }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    commentsApi(rid).publishState().then((s) => { if (active) setError(s.autoPublish ? s.last?.error ?? null : null) }).catch(() => undefined)
    return () => { active = false }
  }, [rid, version])
  if (!error) return null
  const retry = async () => {
    setBusy(true)
    try { await commentsApi(rid).publish(); setError(null); flash(t('GitHub에 올렸습니다', 'Pushed to GitHub')) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="records-publish-error" data-ui="기록 올리기 실패" role="status">
    <span title={error}>{t('기록을 GitHub에 올리지 못했습니다', 'Records were not pushed to GitHub')}: {error}</span>
    <button className="a" disabled={busy} onClick={() => void retry()}>{busy ? t('올리는 중…', 'Pushing…') : t('다시 올리기', 'Push again')}</button>
  </div>
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
  const [pointing, setPointing] = useState(false)
  const pick = useCallback((p: PointedPart) => {
    setPointing(false)
    const current = recordDrafts.read(key, defaultColor).draft
    recordDrafts.write(key, { ...current, attachment: { ...current.attachment, ...p } })
    requestAnimationFrame(() => area.current?.focus())
  }, [key, defaultColor])
  const cancelPointing = useCallback(() => setPointing(false), [])
  const where = target.target === 'project' ? t('이 프로젝트', 'This project') : target.title
  return <div className="record-composer" data-ui="적기 칸">
    <div className="segmented small" role="group" aria-label={t('기록 종류', 'Record kind')}>{RECORD_KINDS.map((k) => <button key={k} className={draft.kind === k ? 'on' : ''} aria-pressed={draft.kind === k} disabled={busy} onClick={() => setDraft({ ...draft, kind: k })}>{kindChoice(k)}</button>)}</div>
    {pointing && <RecordPointer onPick={pick} onCancel={cancelPointing} />}
    {a.part && <div className="record-attached"><span title={a.part}>{t('가리킨 곳', 'Pointed at')} · {uiShown(a.part)}{a.partText && ` “${a.partText}”`}</span><button className="icon-btn sm" aria-label={t('가리킨 곳 빼기', 'Remove pointed part')} title={t('빼기', 'Remove')} disabled={busy} onClick={() => setDraft({ ...draft, attachment: { ...a, part: undefined, partText: undefined } })}>×</button></div>}
    {a.quote && <>
      {/* 고른 글과 그 색을 한 줄로: 맨 앞 색 동그라미를 누르면 색을 바꾼다 (10/19 피드백 10:09) */}
      <div className="record-attached"><PaintPicker color={draft.color} disabled={busy} onChange={(color) => setDraft({ ...draft, color })} /><span title={a.quote}>{t('고른 글', 'Selection')}{a.line ? t(` · ${a.line}줄`, ` · line ${a.line}`) : a.page ? t(` · ${a.page}쪽`, ` · p. ${a.page}`) : ''} “{a.quote}”</span><button className="icon-btn sm" aria-label={t('고른 글 빼기', 'Remove selection')} title={t('빼기', 'Remove')} disabled={busy} onClick={() => setDraft({ ...draft, attachment: {} })}>×</button></div>
    </>}
    <textarea ref={area} rows={3} aria-label={t('기록 입력란', 'Record input')} placeholder={draft.kind === '질문' ? (/^(note|calc)-/.test(target.target) ? t('궁금한 것이나 고칠 것을 적으면 Claude에게 보냅니다. 고친 글은 "노트에 적용"으로 넣습니다.', 'Write a question or something to fix and it goes to Claude. Put the revised text in with "Apply to note".') : t('무엇이 궁금한가요? 적으면 Claude에게 묻습니다.', 'What do you want to know? Claude will answer it.')) : draft.kind === '지시' ? t('에이전트가 할 일을 적으세요. 하고 나서 답을 답니다.', 'What should an agent do? It answers when done.') : (target.target === 'project' ? t('이 프로젝트에 남길 기록', 'A record for this project') : target.target.startsWith('topic-') ? t('이 주제에 남길 기록', 'A record for this topic') : target.target.startsWith('flow-') ? t('이 흐름 점에 남길 기록', 'A record for this flow dot') : target.target.startsWith('concept-') ? t('이 개념노트에 남길 기록', 'A record for this concept note') : t('이 노트·PDF에 남길 기록', 'A record for this note or PDF'))} value={draft.text} disabled={busy}
      onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void save() } else onListKey(e, (text) => setDraft({ ...draft, text })) }} />
    {error && <div className="banner danger" role="alert">{error}</div>}
    <div className="record-composer-actions">
      {/* 아랫줄 왼쪽: 가리키기와 남길 곳 (10/15 사용자 코멘트), 오른쪽: 저장 */}
      <button className={`icon-btn${pointing ? ' on' : ''}`} data-ui="가리키기" data-tip={t('가리키기: 이 기록이 화면 어디에 대한 것인지 고릅니다', 'Point: choose the part of the screen this record is about')} aria-label={t('가리키기', 'Point')} aria-pressed={pointing} disabled={busy} onClick={() => setPointing((v) => !v)}>{Icon.point}</button>
      <span className="record-where" data-ui="남길 곳" title={target.source}>{t('남길 곳', 'Saved to')} <b>{where}</b></span>
      <span className="sp" /><button className="btn primary sm tip-end" data-tip={t('저장 (⌘↵)', 'Save (⌘↵)')} disabled={busy || !draft.text.trim()} onClick={() => void save()}>{busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button></div>
  </div>
}
