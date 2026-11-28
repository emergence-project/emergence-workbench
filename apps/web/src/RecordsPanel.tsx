import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useCmdEnter } from './cmdEnter'
import { commentsApi, ConflictError, type CommentEntry, type CommentFile, type NoteHighlight, type RecordFile } from './api'
import { bumpPending, keyOf, load, patch, revealComment, usePendingTick, useSlot, type CommentTarget } from './Comments'
import { clearRecordComposerRequest, useRecordComposerRequest } from './RecordContext'
import { PaintPicker } from './RecordMenus'
import { Icon } from './icons'
import { onListKey } from './listInput'
import { go } from './router'
import { useHighlightColor } from './ui'
import { classifiedRecordCount, flatRecords, inSideKinds, isDoneRecord, isUserTurnRecord, recordRoute, recordRuns, recordWhen, SIDE_KINDS, sideKindOf, type PanelFilter, type RecordAt, type SideKind, type SideOrder } from './recordsPanelHelpers'
import { flash } from './flash'
import { RecordList, type RecordPlaceOf } from './RecordList'
import { recordWrites, useRecordActions, type RecordWrites } from './useRecordActions'
import { MoreMenu } from './MoreMenu'
import { askConfirm } from './askText'
import { setRecordsWide } from './noteScreen'
import { calledAgent, LIBRARY_RID } from '@rw/core'
import { chooseRecordFilter, chooseRecordPlace } from './workRecords'
import { recordDrafts, attachRecordDraft, type ComposerDraft } from './recordDrafts'
import { t } from './i18n'
import { uiShown } from './uiNames'
import { RecordPointer, type PointedPart } from './RecordPointer'
import { kindLabel } from './recordLabels'
import { useRecords } from './projectQueries'
import { RecordArchive } from './RecordArchive'

/** 넓게 보기로 넘어갈 때의 종류 필터: 하나만 골랐으면 그 종류, 아니면 전체 */
const tabFilter = (kinds: ReadonlySet<SideKind>): PanelFilter => kinds.size === 1 ? [...kinds][0]! : '전체'
const pickKey = (target: string, id: string) => `${target}\n${id}`
const CLASSIFY_TIP = t('Claude(작은 모델)가 분류 전 기록을 메모 · 할 일 · 질문으로 나눕니다', 'Claude (a small model) sorts unsorted records into memos, to-dos, and questions')
// Keep a pending target disabled even when its sidebar unmounts and opens again.
const classifying = new Set<string>()
const NO_FILES: RecordFile[] = []

export function RecordsPanel({ rid, target, firstPartOf, onOpenPdf, placeOf }: {
  rid: string; target: CommentTarget; firstPartOf(target: string): string | undefined
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
  const many = project
  const recordsQuery = useRecords(rid, many)
  const files = recordsQuery.data?.files ?? NO_FILES
  const error = recordsQuery.error?.message ?? null
  // 둘째 줄 (11/28 결정): 왼쪽 수, 오른쪽 필터 · 정렬 · 선택. 필터는 종류마다 체크, 정렬은 최근 것 · 오래된 것
  const [kinds, setKinds] = useState<ReadonlySet<SideKind>>(() => new Set(SIDE_KINDS))
  const [order, setOrder] = useState<SideOrder>('new')
  // 완료한 것은 처음과 대상을 바꿀 때마다 접어 둔다 (끝낸 기록은 숨김, 10/18 결정)
  const [doneOpen, setDoneOpen] = useState(false)
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())
  // 여럿 선택: null이면 끔. 대상을 바꾸면 끈다
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => { setDoneOpen(false); setPicked(null) }, [rid, target.target])
  const shown = useMemo(() => project ? files : slot.file ? [slot.file] : [], [project, files, slot.file])
  // 고른 기록이 보이게 필터 · 상태를 맞추는 것은 고른 기록이 바뀔 때 한 번만 (10/20 검토: 할 일을 체크할 때마다 "완료"로 넘어갔다).
  // 저장 바로 뒤에는 새 기록이 아직 목록에 없을 수 있어, 찾을 때까지 기다린다
  const aligned = useRef<string | null>(null)
  useEffect(() => {
    if (!slot.active || aligned.current === slot.active) return
    const comments = project ? files.find((file) => file.target === target.target)?.comments ?? [] : slot.file?.comments ?? []
    if (!comments.some((c) => c.id === slot.active)) return
    aligned.current = slot.active
    const entry = comments.find((c) => c.id === slot.active)!
    if (entry.kind === '하이라이트') return
    setKinds((current) => inSideKinds(entry, current) ? current : new Set(SIDE_KINDS))
    if (isDoneRecord(entry)) setDoneOpen(true)
  }, [slot.active, slot.file, files, project, target.target])
  // 묶음 없이 한 목록 (11/28): 내 차례, 고정한 것, 나머지, 그리고 맨 아래 접힌 완료
  const flat = useMemo(() => flatRecords(shown, kinds, order), [shown, kinds, order])
  const everything = useMemo(() => flatRecords(shown, new Set(SIDE_KINDS)), [shown])
  const turns = flat.open.filter((r) => isUserTurnRecord(r.c)).length
  const pick = picked ? {
    has: (file: RecordFile) => (c: CommentEntry) => picked.has(pickKey(file.target, c.id)),
    toggle: (file: RecordFile) => (c: CommentEntry) => setPicked((current) => {
      const next = new Set(current ?? []), key = pickKey(file.target, c.id)
      if (!next.delete(key)) next.add(key)
      return next
    }),
  } : null
  const list = (rows: RecordAt[]) => <div className="record-flat">{recordRuns(rows).map((run) =>
    <RecordList key={`${run.file.target}|${run.items[0]!.id}`} rid={rid} file={run.file} filter="전체" items={run.items} showSource={project} placeOf={placeOf} onGo={(c) => open(run.file, c)}
      pick={pick ? { has: pick.has(run.file), toggle: pick.toggle(run.file) } : undefined} />)}</div>
  const open = (file: RecordFile, c?: CommentEntry) => {
    if (many && !(c?.page && onOpenPdf(file))) {
      const route = recordRoute(rid, file, firstPartOf)
      if (route) go(route)
    }
    if (c && !c.lost) revealComment(rid, file.target, c.id)
  }
  // 머리줄의 「넓게 보기」: 고른 종류 그대로, 지금 보던 노트를 왼쪽 기록 화면에서 골라 둔 채로 연다 (10/14 13:33, 10/28 22:25). 지식 라이브러리에는 기록 화면이 없다
  const wide = useRef<() => void>(() => undefined)
  wide.current = () => { chooseRecordFilter(tabFilter(kinds)); chooseRecordPlace(many ? null : slot.file?.target ?? target.target); go({ page: 'records', rid }) }
  useEffect(() => {
    if (rid === LIBRARY_RID) return
    const openWide = () => wide.current()
    setRecordsWide(openWide)
    return () => setRecordsWide(null)
  }, [rid])
  // 여럿을 한꺼번에 (11/28): 화면이 본 판의 hash로 시작해, 쓸 때마다 돌려받은 hash를 이어 쓴다. 그사이 바깥에서 바뀐 파일은 거기서 멈추고 다시 읽는다
  const bulk = useRecordActions(rid, { report: 'flash' })
  const pickedRows = picked ? [...everything.open, ...everything.done].filter((r) => picked.has(pickKey(r.file.target, r.c.id))) : []
  const runBulk = async (does: (w: RecordWrites, r: RecordAt, hash: string) => Promise<CommentFile> | null, said: (n: number) => string) => {
    let ok = 0, skipped = 0
    const hashes = new Map(shown.map((file) => [file.target, file.hash]))
    for (const r of pickedRows) {
      const done = await bulk.run(r.file.target, async (w) => {
        const next = does(w, r, hashes.get(r.file.target)!)
        if (!next) { skipped++; return }
        hashes.set(r.file.target, (await next).hash); ok++
      })
      if (!done) break
    }
    const left = pickedRows.length - ok - skipped
    flash(`${said(ok)}${left > 0 ? t(` · ${left}개는 하지 못했습니다`, ` · ${left} not done`) : ''}`)
    setPicked(null)
  }
  const allPinned = pickedRows.length > 0 && pickedRows.every((r) => r.c.pinned)
  const bulkDone = () => runBulk((w, r, hash) => isDoneRecord(r.c) || r.c.state === '끝냄' ? null : w.setState(r.file.target, r.c.id, '끝냄', hash), (n) => t(`${n}개를 완료로 넘겼습니다`, `Moved ${n} to done`))
  const bulkPin = () => runBulk((w, r, hash) => Boolean(r.c.pinned) === !allPinned ? null : w.update(r.file.target, r.c.id, { pinned: !allPinned, baseHash: hash }), (n) => allPinned ? t(`${n}개의 고정을 풀었습니다`, `Unpinned ${n}`) : t(`${n}개를 위에 고정했습니다`, `Pinned ${n}`))
  const bulkDelete = async () => {
    const deletable = pickedRows.filter((r) => r.c.answers.length === 0)
    if (!deletable.length) return flash(t('답이 달린 기록은 지울 수 없습니다', 'Records with answers cannot be deleted'))
    if (!await askConfirm({ title: t(`기록 ${deletable.length}개를 지울까요?`, `Delete ${deletable.length} ${deletable.length === 1 ? 'record' : 'records'}?`), hint: t('되돌릴 수 없습니다. 원문과 다른 기록은 남습니다. 답이 달린 기록은 지우지 않고 남깁니다.', 'This cannot be undone. The source text and other records stay. Records with answers are kept.'), ok: t('삭제', 'Delete') })) return
    await runBulk((w, r, hash) => r.c.answers.length ? null : w.remove(r.file.target, r.c.id, hash), (n) => t(`${n}개를 지웠습니다`, `Deleted ${n}`))
  }
  const count = (kind: SideKind) => everything.open.filter((r) => sideKindOf(r.c) === kind).length
  const filtered = kinds.size < SIDE_KINDS.length
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
    {picked ? <div className="records-second picking" data-ui="기록 여럿 선택" role="toolbar" aria-label={t('고른 기록에 할 일', 'Actions for the selected records')}>
      <span className="records-count">{t(`${picked.size}개 선택`, `${picked.size} selected`)}</span>
      <span className="sp" />
      <button className="icon-btn sm" data-ui="선택 완료" data-tip={t('완료로 넘기기', 'Move to done')} aria-label={t('완료로 넘기기', 'Move to done')} disabled={!picked.size || bulk.busy} onClick={() => void bulkDone()}>{Icon.check}</button>
      <button className="icon-btn sm" data-ui="선택 고정" data-tip={allPinned ? t('고정 풀기', 'Unpin') : t('위에 고정', 'Pin to top')} aria-label={allPinned ? t('고정 풀기', 'Unpin') : t('위에 고정', 'Pin to top')} disabled={!picked.size || bulk.busy} onClick={() => void bulkPin()}>{Icon.pin}</button>
      <button className="icon-btn sm" data-ui="선택 삭제" data-tip={t('삭제', 'Delete')} aria-label={t('삭제', 'Delete')} disabled={!picked.size || bulk.busy} onClick={() => void bulkDelete()}>{Icon.trash}</button>
      <button className="icon-btn sm tip-end" data-ui="선택 취소" data-tip={t('선택 취소', 'Cancel selection')} aria-label={t('선택 취소', 'Cancel selection')} disabled={bulk.busy} onClick={() => setPicked(null)}>{Icon.x}</button>
    </div> : <div className="records-second" data-ui="기록 둘째 줄">
      <span className="records-count" data-ui="기록 수">{t(`${flat.open.length}개`, `${flat.open.length}`)}{turns > 0 && <> · <b className="turn">{t(`내 차례 ${turns}`, `Your turn ${turns}`)}</b></>}</span>
      <span className="sp" />
      <MoreMenu small icon={Icon.filter} tip={t('필터', 'Filter')} ui="기록 필터" on={filtered} items={[
        ...SIDE_KINDS.map((kind) => ({ label: kindLabel(kind), checked: kinds.has(kind), note: String(count(kind)), onClick: () => setKinds((current) => { const next = new Set(current); if (!next.delete(kind)) next.add(kind); return next }) })),
        { label: t('완료한 것도 보기', 'Show done too'), checked: doneOpen, note: String(everything.done.length), divider: true, onClick: () => setDoneOpen((v) => !v) },
      ]} />
      <MoreMenu small icon={Icon.sort} tip={t('정렬', 'Sort')} ui="기록 정렬" on={order === 'old'} items={[
        { label: t('최근 것 먼저', 'Newest first'), checked: order === 'new', onClick: () => setOrder('new') },
        { label: t('오래된 것 먼저', 'Oldest first'), checked: order === 'old', onClick: () => setOrder('old') },
      ]} />
      <button className="icon-btn sm tip-end" data-ui="기록 선택 켜기" data-tip={t('선택: 여럿을 골라 한꺼번에', 'Select several at once')} aria-label={t('선택', 'Select')} disabled={!flat.open.length && !flat.done.length} onClick={() => setPicked(new Set())}>{Icon.pick}</button>
    </div>}
    {(unsorted.length > 0 || classifying_) && <div className="records-classify">
      <button className="a" data-ui="자동 분류 버튼" data-tip={CLASSIFY_TIP} disabled={classifying_} onClick={() => void classify()}>{classifying_ ? t('분류하는 중…', 'Sorting…') : t(`자동 분류 ${unsorted.length}개`, `Auto-sort ${unsorted.length}`)}</button>
    </div>}
    <div className="records-list" data-ui="적기 목록">
      {error && <div className="banner danger" role="alert">{error}</div>}
      {flat.open.length > 0 && list(flat.open)}
      {shown.length > 0 && !flat.open.length && !error && <p className="empty records-empty">{filtered ? t('고른 종류의 기록이 없습니다.', 'No records of the chosen kinds.') : flat.done.length ? t('남은 기록이 없습니다.', 'No open records.') : t('아직 기록이 없습니다. 아래에서 적어 보세요.', 'No records yet. Write one below.')}</p>}
      {/* 완료한 것은 맨 아래에 접어 둔다 (11/21 시안 코멘트) */}
      {flat.done.length > 0 && <details className="record-done-fold" data-ui="완료한 기록" open={doneOpen} onToggle={(e) => setDoneOpen(e.currentTarget.open)}>
        <summary>{t('완료', 'Done')} <span className="n">{flat.done.length}</span></summary>
        {/* 한 줄 카드 (11/28 틀 ③): 끝난 것은 훑기만 하므로 종류 · 본문 한 줄 · 시각. 누르면 그 줄만 카드로 펼친다 (여럿 선택 중에는 카드로) */}
        {doneOpen && flat.done.map((r) => {
          const k = pickKey(r.file.target, r.c.id)
          if (pick || unfolded.has(k)) return <div key={k}>{list([r])}</div>
          const kind = sideKindOf(r.c), at = recordWhen(r.c.id)
          return <button key={k} type="button" className="record-line" data-ui="한 줄 기록" data-ui-item={r.c.body.slice(0, 20)} data-tip={t('펼치기', 'Expand')}
            onClick={() => setUnfolded((v) => new Set(v).add(k))}>
            <span className="record-marker" aria-hidden>{kind === '질문' ? Icon.ask : kind === '할 일' ? Icon.check : Icon.memo}</span>
            <span className="record-line-text">{r.c.body.replace(/\s+/g, ' ')}</span>
            <span className="record-line-when" title={at.title}>{at.label}</span>
          </button>
        })}
      </details>}
      {!filtered && <RecordArchive rid={rid} target={project ? undefined : target.target} onChanged={() => { if (!project) void load(rid, target.target, true) }} />}
      {!shown.length && !error && <p className="empty records-empty">{slot.error ?? t('불러오는 중…', 'Loading…')}</p>}
      {!project && !!slot.file?.highlights.some((h) => h.lost) && <LostHighlights rid={rid} file={slot.file} />}
    </div>
    <RecordComposer key={`${rid}|${target.target}`} rid={rid} target={target} />
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
    {file.highlights.filter((h) => h.lost).map((h) => <div className="record-lost-row" key={h.id}><blockquote className="record-quote" style={{ borderColor: `var(--paint-${h.color})` }}>{h.quote}</blockquote><button className="icon-btn tip-end" data-tip={t('삭제', 'Delete')} aria-label={t('삭제', 'Delete')} disabled={busy} onClick={() => void remove(h)}>{Icon.trash}</button></div>)}
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
    const next = attachRecordDraft(draft, request.draft, defaultColor)
    // 「질문」으로 연 입력란은 @claude를 먼저 적어 준다 (11/21 안 A3: 질문 = @로 부른 메모)
    const fill = request.fill
    setDraft(fill ? { ...next, text: fill.kind === '질문' ? (calledAgent(fill.text || next.text) ? fill.text || next.text : `@claude ${fill.text || next.text}`) : fill.text || next.text, kind: fill.kind === '할 일' ? '할 일' : '메모' } : next)
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
  const sendKey = useCmdEnter(() => { if (draft.text.trim() && !busy) void save() })
  // @로 에이전트를 부른 메모는 보내는 것이라 「보내기」, 그 밖은 「저장」 (10/28 피드백 22:18, 11/21 안 A3)
  const sends = draft.kind === '메모' && !!calledAgent(draft.text)
  const todo = draft.kind === '할 일'
  const where = target.target === 'project' ? t('이 프로젝트', 'This project') : target.title
  return <div className="record-composer" data-ui="적기 칸" onKeyDown={sendKey.onKeyDown} onCompositionEnd={sendKey.onCompositionEnd}>
    {pointing && <RecordPointer onPick={pick} onCancel={cancelPointing} />}
    {a.part && <div className="record-attached"><span title={a.part}>{t('가리킨 곳', 'Pointed at')} · {uiShown(a.part)}{a.partText && ` “${a.partText}”`}</span><button className="icon-btn sm" aria-label={t('가리킨 곳 제거', 'Remove pointed part')} title={t('제거', 'Remove')} disabled={busy} onClick={() => setDraft({ ...draft, attachment: { ...a, part: undefined, partText: undefined } })}>×</button></div>}
    {a.quote && <>
      {/* 고른 글과 그 색을 한 줄로: 맨 앞 색 동그라미를 누르면 색을 바꾼다 (10/19 피드백 10:09) */}
      <div className="record-attached"><PaintPicker color={draft.color} disabled={busy} onChange={(color) => setDraft({ ...draft, color })} /><span title={a.quote}>{t('고른 글', 'Selection')}{a.line ? t(` · ${a.line}줄`, ` · line ${a.line}`) : a.page ? t(` · ${a.page}쪽`, ` · p. ${a.page}`) : ''} “{a.quote}”</span><button className="icon-btn sm" aria-label={t('고른 글 제거', 'Remove selection')} title={t('제거', 'Remove')} disabled={busy} onClick={() => setDraft({ ...draft, attachment: {} })}>×</button></div>
    </>}
    <textarea ref={area} rows={3} aria-label={t('기록 입력란', 'Record input')} placeholder={`${target.target === 'project' ? t('이 프로젝트에 남길 기록', 'A record for this project') : target.target.startsWith('topic-') ? t('이 주제에 남길 기록', 'A record for this topic') : target.target.startsWith('concept-') ? t('이 개념노트에 남길 기록', 'A record for this concept note') : t('이 노트·PDF에 남길 기록', 'A record for this note or PDF')} · ${t('@claude로 에이전트 부르기', '@claude calls an agent')}`} value={draft.text} disabled={busy}
      onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={(e) => onListKey(e, (text) => setDraft({ ...draft, text }))} />
    {error && <div className="banner danger" role="alert">{error}</div>}
    <div className="record-composer-actions">
      {/* 아랫줄 왼쪽: 가리키기와 남길 곳 (10/15 사용자 코멘트), 오른쪽: 저장 */}
      <button className={`icon-btn${pointing ? ' on' : ''}`} data-ui="가리키기" data-tip={t('가리키기: 이 기록이 화면 어디에 대한 것인지 고릅니다', 'Point: choose the part of the screen this record is about')} aria-label={t('가리키기', 'Point')} aria-pressed={pointing} disabled={busy} onClick={() => setPointing((v) => !v)}>{Icon.point}</button>
      {/* 종류 줄 대신 「할 일」 칩 하나 (11/21 안 A3): 켜면 할 일, 끄면 메모 */}
      <button className={`btn sm record-todo-chip${todo ? ' on' : ''}`} data-ui="할 일 칩" aria-pressed={todo} disabled={busy} data-tip={todo ? t('할 일로 남깁니다. 다시 누르면 메모', 'Saved as a to-do. Press again for a memo') : t('할 일로 남기기', 'Save as a to-do')} onClick={() => setDraft({ ...draft, kind: todo ? '메모' : '할 일' })}><span className="record-kind-ico" aria-hidden>{Icon.todo}</span>{t('할 일', 'To-do')}</button>
      <span className="record-where" data-ui="남길 곳" title={target.source}>{t('남길 곳', 'Saved to')} <b>{where}</b></span>
      <span className="sp" /><button className="btn primary sm tip-end" data-tip={sends ? t('보내기 (⌘↵)', 'Send (⌘↵)') : t('저장 (⌘↵)', 'Save (⌘↵)')} disabled={busy || !draft.text.trim()} onClick={() => void save()}>{state.pending !== null ? (sends ? t('보내는 중…', 'Sending…') : t('저장 중…', 'Saving…')) : sends ? t('보내기', 'Send') : t('저장', 'Save')}</button></div>
  </div>
}
