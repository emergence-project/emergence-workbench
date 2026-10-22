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
import { recordWrites, useRecordActions } from './useRecordActions'
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
/** 접두어가 같은 대상의 기록 파일. 적기 대상은 방금 받은 사본으로 (저장 바로 뒤에도 보이게) */
function groupFiles(files: RecordFile[], prefix: string, current: RecordFile | null | undefined): RecordFile[] {
  const list = files.filter((file) => file.target.startsWith(prefix) && file.comments.length > 0)
  if (!current?.target.startsWith(prefix)) return list
  const i = list.findIndex((file) => file.target === current.target)
  if (i >= 0) return list.map((file, j) => j === i ? current : file)
  return current.comments.length ? [current, ...list] : list
}

export function RecordsPanel({ rid, target, firstPartOf, onOpenPdf, placeOf, group }: {
  rid: string; target: CommentTarget; firstPartOf(target: string): string | undefined
  onOpenPdf(file: RecordFile): boolean
  /** 붙은 곳을 줄 번호 대신 이 이름으로 (개념노트는 절 이름, 10/18) */
  placeOf?: RecordPlaceOf
  /** 이 접두어의 대상 기록을 모두 한 목록에 (흐름 화면은 'flow-': 점을 고를 때마다 나뉘지 않게, 10/20 사용자). 적기는 그대로 target에 */
  group?: string
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
  // group이 있으면 점을 고르지 않아(적기 대상이 프로젝트여도) 그 접두어의 기록만 보인다
  const project = target.target === 'project' && !group
  // 여러 대상을 함께 보이는가: 프로젝트 전체, 또는 group 접두어의 대상 모두
  const many = project || !!group
  const recordsQuery = useRecords(rid, many)
  const files = recordsQuery.data?.files ?? NO_FILES
  const error = recordsQuery.error?.message ?? null
  const [filter, setFilter] = useState<PanelFilter>('전체')
  // 상태는 처음과 대상을 바꿀 때마다 진행 중 (끝낸 기록은 숨김, 10/18 결정)
  const [status, setStatus] = useState<StatusFilter>('진행 중')
  useEffect(() => setStatus('진행 중'), [rid, target.target])
  const shown = project ? files : group ? groupFiles(files, group, slot.file) : slot.file ? [slot.file] : []
  // 고른 기록이 보이게 필터 · 상태를 맞추는 것은 고른 기록이 바뀔 때 한 번만 (10/20 검토: 할 일을 체크할 때마다 "완료"로 넘어갔다).
  // 저장 바로 뒤에는 새 기록이 아직 목록에 없을 수 있어, 찾을 때까지 기다린다
  const aligned = useRef<string | null>(null)
  useEffect(() => {
    if (!slot.active || aligned.current === slot.active) return
    const comments = project ? files.find((file) => file.target === target.target)?.comments ?? [] : slot.file?.comments ?? []
    if (!comments.some((c) => c.id === slot.active)) return
    aligned.current = slot.active
    setFilter((current) => filterForActiveRecord(current, comments, slot.active))
    setStatus((current) => statusForActiveRecord(current, comments, slot.active))
  }, [slot.active, slot.file, files, project, target.target])
  const kindShown = shown.flatMap((file) => filterRecords(file.comments, filter))
  const open = (file: RecordFile, c?: CommentEntry) => {
    if (many && !(c?.page && onOpenPdf(file))) {
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
          onClick={() => { chooseRecordFilter(filter); go({ page: 'records', rid }) }}>{t('모두 보기 ›', 'See all ›')}</button>}
      </div>
    </div>
    {(unsorted.length > 0 || classifying_) && <div className="records-classify">
      <button className="a" data-ui="자동 분류 버튼" data-tip={CLASSIFY_TIP} disabled={classifying_} onClick={() => void classify()}>{classifying_ ? t('분류하는 중…', 'Sorting…') : t(`자동 분류 ${unsorted.length}개`, `Auto-sort ${unsorted.length}`)}</button>
    </div>}
    <div className="records-list" data-ui="적기 목록">
      {error && <div className="banner danger" role="alert">{error}</div>}
      {shown.map((file) => <div key={file.target} className="record-group">
        {many && <div className="record-group-title">{file.target === 'project' ? <span>{t('이 프로젝트', 'This project')}</span>
          : <button className="a" title={file.source} onClick={() => open(file)}>{file.title}</button>}</div>}
        <RecordList rid={rid} file={file} filter={filter} status={status} showSource={project} placeOf={placeOf} onGo={(c) => open(file, c)} />
      </div>)}
      {!shown.length && !error && <p className="empty records-empty">{slot.error ?? (group && recordsQuery.data ? t('아직 기록이 없습니다', 'No records yet') : t('불러오는 중…', 'Loading…'))}</p>}
      {!project && !!slot.file?.highlights.some((h) => h.lost) && <LostHighlights rid={rid} file={slot.file} />}
    </div>
    {/* 흐름 화면에서 점을 고르기 전에는 남길 곳이 없다: 프로젝트 기록에 들어가 이 목록(흐름 점의 기록)에 보이지 않았다 (10/20 검토).
        안내를 따로 두지 않고 입력란의 "남길 곳"이 점을 고르라고 한다 (10/20 사용자 코멘트: 비슷한 것을 둘로 두지 않는다) */}
    <RecordComposer key={`${rid}|${target.target}`} rid={rid} target={target} needsDot={!!group && !target.target.startsWith(group)} />
  </section>
}

function LostHighlights({ rid, file }: { rid: string; file: CommentFile }) {
  const { busy, run } = useRecordActions(rid, { report: 'flash' })
  const remove = (h: NoteHighlight) => run(file.target, async (w) => {
    await w.remove(file.target, h.id, file.hash)
    flash(t('지웠습니다', 'Deleted'), { label: t('되돌리기', 'Undo'), run: () => { void w.add(file.target, {
      kind: '하이라이트', title: file.title, source: file.source, text: h.body ?? '', quote: h.quote, color: h.color,
      line: h.line, prefix: h.prefix, suffix: h.suffix, page: h.page, rects: h.rects,
    }).catch((e: Error) => flash(e.message)) } })
  })
  return <details className="record-lost"><summary>{t('자리를 잃은 하이라이트', 'Highlights that lost their place')} · {file.highlights.filter((h) => h.lost).length}</summary>
    {file.highlights.filter((h) => h.lost).map((h) => <div className="record-lost-row" key={h.id}><blockquote className="record-quote" style={{ borderColor: `var(--paint-${h.color})` }}>{h.quote}</blockquote><button className="icon-btn tip-end" data-tip={t('지우기', 'Delete')} aria-label={t('지우기', 'Delete')} disabled={busy} onClick={() => void remove(h)}>{Icon.trash}</button></div>)}
  </details>
}

function RecordComposer({ rid, target, needsDot = false }: { rid: string; target: CommentTarget; needsDot?: boolean }) {
  const key = keyOf(rid, target.target)
  const defaultColor = useHighlightColor()
  const request = useRecordComposerRequest()
  const state = useSyncExternalStore((listener) => recordDrafts.subscribe(key, listener), () => recordDrafts.read(key, defaultColor))
  const { draft, error } = state
  const busy = state.pending !== null || needsDot
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
      const result = await recordWrites(rid).add(target.target, { kind: draft.kind, title: target.title, source: target.source, text: draft.text,
        ...a, ...(a.quote && { color: draft.color }) })
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
    <textarea ref={area} rows={3} aria-label={t('기록 입력란', 'Record input')} placeholder={needsDot ? t('흐름 점을 고르면 그 점에 남깁니다', 'Pick a flow dot to write a record on it') : draft.kind === '질문' ? (/^(note|calc)-/.test(target.target) ? t('궁금한 것이나 고칠 것을 적으면 Claude에게 보냅니다. 고친 글은 "노트에 적용"으로 넣습니다.', 'Write a question or something to fix and it goes to Claude. Put the revised text in with "Apply to note".') : t('무엇이 궁금한가요? 적으면 Claude에게 묻습니다.', 'What do you want to know? Claude will answer it.')) : draft.kind === '지시' ? t('에이전트가 할 일을 적으세요. 하고 나서 답을 답니다.', 'What should an agent do? It answers when done.') : (target.target === 'project' ? t('이 프로젝트에 남길 기록', 'A record for this project') : target.target.startsWith('topic-') ? t('이 주제에 남길 기록', 'A record for this topic') : target.target.startsWith('flow-') ? t('이 흐름 점에 남길 기록', 'A record for this flow dot') : target.target.startsWith('concept-') ? t('이 개념노트에 남길 기록', 'A record for this concept note') : t('이 노트·PDF에 남길 기록', 'A record for this note or PDF'))} value={draft.text} disabled={busy}
      onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void save() } else onListKey(e, (text) => setDraft({ ...draft, text })) }} />
    {error && <div className="banner danger" role="alert">{error}</div>}
    <div className="record-composer-actions">
      {/* 아랫줄 왼쪽: 가리키기와 남길 곳 (10/15 사용자 코멘트), 오른쪽: 저장 */}
      <button className={`icon-btn${pointing ? ' on' : ''}`} data-ui="가리키기" data-tip={t('가리키기: 이 기록이 화면 어디에 대한 것인지 고릅니다', 'Point: choose the part of the screen this record is about')} aria-label={t('가리키기', 'Point')} aria-pressed={pointing} disabled={busy} onClick={() => setPointing((v) => !v)}>{Icon.point}</button>
      <span className="record-where" data-ui="남길 곳" title={needsDot ? undefined : target.source}>{t('남길 곳', 'Saved to')} <b>{needsDot ? t('흐름 점을 고르세요', 'pick a flow dot') : where}</b></span>
      <span className="sp" /><button className="btn primary sm tip-end" data-tip={t('저장 (⌘↵)', 'Save (⌘↵)')} disabled={busy || !draft.text.trim()} onClick={() => void save()}>{state.pending !== null ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button></div>
  </div>
}
