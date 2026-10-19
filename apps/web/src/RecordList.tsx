import { useEffect, useMemo, useRef, useState } from 'react'
import { LIBRARY_RID, splitNoteFixes } from '@rw/core'
import { commentsApi, ConflictError, type CommentEntry, type CommentFile, type RecordFile } from './api'
import { askClaude, askErrors, asking, askKey, bumpPending, keyOf, load, patch, useAskTick, useSlot } from './Comments'
import { MemoText } from './memo'
import { RepoPathContext } from './repoPaths'
import { Icon } from './icons'
import { askConfirm } from './askText'
import { onListKey } from './listInput'
import { go } from './router'
import { filterByStatus, filterRecords, isTalkKind, isUserTurnRecord, recordKind, recordWhen, rebaseRecordEdit, sortRecords, USER_ANSWER_BY, type PanelFilter, type RecordEdit, type StatusFilter } from './recordsPanelHelpers'
import { kindLabel, stateLabel } from './recordLabels'
import { SayCard } from './Conversation'
import { t } from './i18n'
import { uiShown } from './uiNames'
import { chooseRecordFilter } from './workRecords'

/** 붙은 곳의 이름과 툴팁 (주면 줄 번호 대신). 없으면 줄 · 쪽 번호 */
export type RecordPlaceOf = (c: CommentEntry) => { label: string; tip: string } | undefined

export function RecordList({ rid, file, filter, status, onGo, items: suppliedItems, work = false, showSource = work, placeOf }: {
  rid: string; file: RecordFile; filter: PanelFilter
  /** 오른쪽 사이드바의 상태 고르기 (10/18): 진행 중 | 완료. 주면 그 상태만, 내 차례 먼저 · 최근 것 먼저로 */
  status?: StatusFilter
  onGo(c: CommentEntry): void
  items?: CommentEntry[]; work?: boolean
  /** 줄 아래 왼쪽 링크에 붙은 대상 이름도 적는다 (기록 탭 · 프로젝트의 모든 기록을 모아 볼 때, 10/18) */
  showSource?: boolean
  placeOf?: RecordPlaceOf
}) {
  const active = useSlot(rid, file.target, false).active
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  useAskTick()
  const act = async (operation: () => Promise<CommentFile>) => {
    if (locked.current) return false
    locked.current = true; setBusy(true); setError(null)
    try {
      patch(keyOf(rid, file.target), { file: await operation() }); bumpPending(); return true
    } catch (e) {
      if (e instanceof ConflictError) {
        await load(rid, file.target, true); bumpPending()
        setError(t('그사이 기록이 바뀌어 다시 읽었습니다. 적던 글은 남아 있습니다. 내용을 확인하고 다시 고쳐 주세요.', 'The records changed meanwhile and were reloaded. Your text is kept. Check the content and edit again.'))
      } else setError((e as Error).message)
      return false
    } finally { locked.current = false; setBusy(false) }
  }
  const api = commentsApi(rid)
  const kindItems = filterRecords(file.comments, filter)
  const listed = suppliedItems ?? (status ? sortRecords(filterByStatus(kindItems, status)) : kindItems)
  // 할 일에 대해 물은 질문 · 지시 (10/19 결정 "할 일에 에이전트에게"): 그 할 일 아래 대화로 보이고, 할 일이 목록에 있으면 따로 줄을 두지 않는다
  const linked = useMemo(() => {
    const todos = new Set(file.comments.filter((x) => x.kind === '할 일').map((x) => x.id))
    const map = new Map<string, CommentEntry[]>()
    for (const x of file.comments) if (x.todo && todos.has(x.todo)) map.set(x.todo, [...(map.get(x.todo) ?? []), x])
    return map
  }, [file.comments])
  const shownTodos = new Set(listed.filter((x) => x.kind === '할 일').map((x) => x.id))
  const items = listed.filter((x) => !(x.todo && shownTodos.has(x.todo) && linked.has(x.todo)))
  /** 할 일 아래 입력란에서 보내기: 같은 종류의 열린 대화가 있으면 이어 쓰고, 없으면 새 질문 · 지시를 그 할 일에 잇는다 */
  const askTodo = async (todo: CommentEntry, kind: '질문' | '지시', text: string): Promise<boolean> => {
    const last = linked.get(todo.id)?.at(-1)
    if (last && last.kind === kind && last.state !== '끝냄' && !last.by) {
      const ok = await act(() => api.reply(file.target, last.id, text))
      if (ok && kind === '질문') void askClaude(rid, file.target, last.id)
      return ok
    }
    if (locked.current) return false
    locked.current = true; setBusy(true); setError(null)
    try {
      const r = await api.add(file.target, { kind, title: file.title, ...(file.source && { source: file.source }), text, todo: todo.id })
      await load(rid, file.target, true); bumpPending()
      if (kind === '질문') void askClaude(rid, file.target, r.entry.id)
      return true
    } catch (e) { setError((e as Error).message); return false } finally { locked.current = false; setBusy(false) }
  }
  const askError = (suppliedItems ?? file.comments).map((c) => askErrors.get(askKey(rid, file.target, c.id))).find(Boolean)
  return <>
    {(error ?? askError) && <div className="banner danger" role="alert">{error ?? askError}</div>}
    {!items.length && suppliedItems === undefined && <p className="empty records-empty">{kindItems.length && status ? (status === '완료' ? t('완료한 기록이 없습니다.', 'No done records.') : t('진행 중인 기록이 없습니다.', 'No records in progress.'))
      : filter === '전체' ? t('아직 기록이 없습니다. 아래에서 적어 보세요.', 'No records yet. Write one below.') : t(`${filter} 기록이 없습니다.`, `No ${kindLabel(filter).toLowerCase()} records.`)}</p>}
    {items.map((c) => <RecordRow key={c.id} active={active === c.id} c={c} hash={file.hash} busy={busy} onGo={() => onGo(c)}
      asking={asking.has(askKey(rid, file.target, c.id))} onAsk={() => void askClaude(rid, file.target, c.id)}
      onState={(state) => act(() => api.update(file.target, c.id, { state, baseHash: file.hash }))}
      onEdit={(text, baseHash) => act(() => api.update(file.target, c.id, { text, baseHash }))}
      onApply={/^(note|calc)-/.test(file.target) ? (i) => act(() => api.apply(file.target, c.id, i, file.hash)) : undefined}
      onReply={async (text) => {
        const ok = await act(() => api.reply(file.target, c.id, text))
        // 사용자가 쓴 질문에 이어 물으면 새 질문처럼 맥의 Claude에게 넘긴다 (에이전트가 물은 것에 답하면 넘기지 않는다)
        if (ok && c.kind === '질문' && !c.by) void askClaude(rid, file.target, c.id)
        return ok
      }}
      onDelete={async () => {
        // Capture the read hash before the confirmation: an appended answer must cause a conflict.
        const baseHash = file.hash
        if (await askConfirm({ title: t('이 기록을 지울까요?', 'Delete this record?'), hint: t('되돌릴 수 없습니다. 원문과 다른 기록은 남습니다. 답이 달린 기록은 지울 수 없습니다.', 'This cannot be undone. The source text and other records stay. Records with answers cannot be deleted.'), ok: t('지우기', 'Delete') })) {
          await act(() => api.remove(file.target, c.id, baseHash))
        }
      }} rid={rid} file={file} work={work} showSource={showSource} place={placeOf?.(c)}
      talk={c.kind === '할 일' && rid !== LIBRARY_RID ? { records: linked.get(c.id) ?? [], send: (kind, text) => askTodo(c, kind, text) } : undefined}
      todoText={c.todo ? file.comments.find((x) => x.id === c.todo)?.body : undefined} />)}
  </>
}

export interface RecordRowProps {
  c: CommentEntry; active: boolean; hash: string; busy: boolean; asking: boolean; onAsk(): void; onGo(): void
  onState(state: '대기' | '끝냄'): Promise<boolean>; onEdit(text: string, baseHash: string): Promise<boolean>; onDelete(): Promise<void>; rid: string
  /** 답 i의 고침을 노트에 적용 (연구 노트의 기록만) */
  onApply?(answer: number): Promise<boolean>
  /** 질문 · 지시 아래에 이어 쓰기 (10/15) */
  onReply?(text: string): Promise<boolean>
  file: Pick<RecordFile, 'target' | 'title'>; work?: boolean; showSource?: boolean; dateLabel?: string; journal?: boolean
  /** 붙은 곳을 줄 번호 대신 이 이름으로 (개념노트의 절 이름, 10/18) */
  place?: { label: string; tip: string }
  /** 할 일에 대해 에이전트에게 (10/19): 이 할 일에 이은 질문 · 지시와 보내기 */
  talk?: { records: CommentEntry[]; send(kind: '질문' | '지시', text: string): Promise<boolean> }
  /** 이 질문 · 지시가 묻는 할 일 글 (할 일과 따로 보일 때, 10/19) */
  todoText?: string
}

export function RecordRow({ c, active, hash, busy, asking: asking_, onAsk, onGo, onState, onEdit, onDelete, onApply, onReply, rid, file, work = false, showSource = work, dateLabel, journal = false, place, talk: todoTalk, todoText }: RecordRowProps) {
  const [talkOpen, setTalkOpen] = useState(false)
  const row = useRef<HTMLElement>(null)
  useEffect(() => { if (active) row.current?.scrollIntoView({ block: 'nearest' }) }, [active])
  const [edit, setEdit] = useState<RecordEdit | null>(null)
  useEffect(() => { setEdit((current) => current ? rebaseRecordEdit(current, c.body, hash) : null) }, [c.body, hash])
  const conflict = edit !== null && edit.hash !== hash
  const kind = recordKind(c)
  const when = recordWhen(c.id)
  const date = dateLabel ?? when.label
  const hasPlace = !c.lost && Boolean(c.line || c.page)
  // 쓴 이 (10/15): 정보 줄에 by가 없으면 사용자. 에이전트가 물은 질문이 대기면 사용자 차례(주황)
  const turn = isUserTurnRecord(c)
  const talk = isTalkKind(kind)
  const [replying, setReplying] = useState(false)
  // 내가 쓴 질문 · 지시에 아직 답이 없으면 덧붙일 대화가 없어 글을 고친다 (10/19 피드백 10:36)
  const unanswered = !c.by && c.answers.length === 0
  const showReply = Boolean(onReply) && talk && c.state !== '끝냄' && (turn || (replying && !unanswered))
  // 아직 적용하지 않은 Claude 답만 "노트에 적용"을 단다 (적용하면 앱이 그 아래에 답을 남긴다)
  const applicable = (i: number) => onApply && c.answers[i]!.by === 'claude' && !c.answers.slice(i + 1).some((a) => a.by === '앱') ? () => void onApply(i) : undefined
  const save = async () => { if (edit && !conflict && edit.text.trim() && await onEdit(edit.text, edit.hash)) setEdit(null) }
  // 글 속 저장소 경로는 링크로, 누르면 파일 탭 (10/19). 지식 라이브러리 기록은 프로젝트 탭이 없어 글 그대로
  const paths = useMemo(() => rid === LIBRARY_RID ? null : { rid, from: { target: file.target, id: c.id } }, [rid, file.target, c.id])
  return <RepoPathContext.Provider value={paths}><article ref={row} className={`record-row${work ? ' record-row-work' : ''}${active ? ' on' : ''}${turn ? ' turn' : ''}${c.state === '끝냄' ? ' done' : ''}${c.split ? ' split' : ''}`} data-ui="기록 줄" data-ui-item={c.id}
    onClick={(e) => { if (!(e.target as Element).closest('button, input, textarea, a, summary')) onGo() }}>
    {/* 줄 모양 (10/18 결정): 위 줄 종류 · 쓴 이와 오른쪽 끝 행동, 가운데 본문, 아래 줄 왼쪽 붙은 곳 · 오른쪽 시점. 좌우 여백은 같다 */}
    <div className="record-row-head">
      {kind === '할 일' ? <input type="checkbox" className="record-marker" aria-label={c.state === '끝냄' ? t('완료 풀기', 'Mark not done') : t('완료', 'Mark done')} checked={c.state === '끝냄'} disabled={busy} onChange={() => void onState(c.state === '끝냄' ? '대기' : '끝냄')} />
        : c.unsorted ? <span className="record-marker unsorted" aria-label={t('분류 전', 'Unsorted')} />
          : <span className="record-marker" aria-hidden>{kind === '질문' ? Icon.ask : kind === '지시' ? Icon.send : Icon.memo}</span>}
      <span className="record-by" title={c.by ? t('쓴 에이전트', 'Written by an agent') : t('사용자가 쓴 기록', 'Written by the user')}>{kindLabel(kind)} · {c.by ? <Author by={c.by} /> : t('사용자', 'User')}</span>
      {turn && <span className="record-turn"><span className="turn-dot" aria-hidden />{t('내 차례', 'Your turn')}</span>}
      <div className={`record-actions${work ? ' hover-actions' : ''}`} data-ui="고치기·지우기">
        {(kind === '질문' || kind === '지시') && <>
          {/* 지시는 에이전트 세션이 MCP로 집어 가서 하고 답한다. 맥의 Claude가 저절로 하지 않는다 */}
          {kind === '질문' && !c.by && <button className="icon-btn sm" data-tip={asking_ ? t('Claude가 답을 쓰는 중…', 'Claude is writing an answer…') : t('Claude에게 묻기', 'Ask Claude')} aria-label={t('Claude에게 묻기', 'Ask Claude')} disabled={busy || asking_} onClick={onAsk}>{Icon.spark}</button>}
          <button className="icon-btn sm" data-tip={c.state === '끝냄' ? t('다시 열기', 'Reopen') : t('완료', 'Close')} aria-label={c.state === '끝냄' ? t('다시 열기', 'Reopen') : t('완료', 'Close')} disabled={busy} onClick={() => void onState(c.state === '끝냄' ? '대기' : '끝냄')}>{c.state === '끝냄' ? Icon.reopen : Icon.check}</button>
        </>}
        <button className="icon-btn sm" data-tip={t('고치기', 'Edit')} aria-label={t('고치기', 'Edit')} disabled={busy} onClick={() => setEdit((current) => current ?? { text: c.body, original: c.body, hash })}>{Icon.pencil}</button>
        <button className="icon-btn sm tip-end" data-tip={t('지우기', 'Delete')} aria-label={t('지우기', 'Delete')} disabled={busy} onClick={() => void onDelete()}>{Icon.trash}</button>
      </div>
    </div>
    <div className="record-content">
      {todoText && <div className="record-part" title={todoText}>{Icon.todo}<span>{t('할 일', 'To-do')} “{todoText.split('\n')[0]}”</span></div>}
      {c.part && <div className="record-part" title={c.part}>{Icon.point}<span>{uiShown(c.part)}{c.partText && ` “${c.partText}”`}</span></div>}
      {c.quote && <blockquote className="record-quote" style={c.color ? { borderColor: `var(--paint-${c.color})` } : undefined}>{c.quote}</blockquote>}
      {edit ? <div className="record-edit">
        {conflict && <div className="record-conflict" role="alert"><p>{t('다른 곳에서 글을 고쳤습니다. 새 글을 확인한 뒤 적던 글로 저장할 수 있습니다.', 'The text was edited elsewhere. Review the new text, then you can save yours.')}</p><MemoText text={c.body} /><button className="btn sm" disabled={busy} onClick={() => setEdit({ ...edit, original: c.body, hash })}>{t('새 글 확인함', 'Reviewed new text')}</button></div>}
        <textarea autoFocus aria-label={t('기록 고치기', 'Edit record')} rows={3} value={edit.text} disabled={busy} onChange={(e) => setEdit({ ...edit, text: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() } else if (e.key === 'Escape') setEdit(null); else onListKey(e, (text) => setEdit({ ...edit, text })) }} />
        <div className="record-edit-actions"><button className="btn sm" disabled={busy} onClick={() => setEdit(null)}>{t('취소', 'Cancel')}</button><button className="btn primary sm" disabled={busy || conflict || !edit.text.trim()} onClick={() => void save()}>{t('저장', 'Save')}</button></div>
      </div> : <div className="record-body"><MemoText text={c.body} /></div>}
      <div className="record-meta">
        <span className="record-meta-left">
          {/* 붙은 곳 링크 (10/18): 누르면 그 노트 · 화면을 열고 본문의 그 자리로 간다. 프로젝트에 붙은 기록은 갈 곳이 없어 기록 탭에서만 이름을 적는다(사이드바는 묶음 이름이 위에 있다) */}
          {showSource && file.target === 'project' && !hasPlace ? work && <span className="record-source">{t('이 프로젝트', 'This project')}</span>
            : (showSource || hasPlace) && <button className="a record-goto" title={place ? `${t('그 자리로 가기', 'Go to the spot')} · ${place.tip}` : t('그 자리로 가기', 'Go to the spot')} onClick={onGo}>
              {[showSource && (file.target === 'project' ? t('이 프로젝트', 'This project') : file.title), hasPlace && (place?.label ?? (c.page ? t(`${c.page}쪽`, `p. ${c.page}`) : t(`${c.line}줄`, `line ${c.line}`)))].filter(Boolean).join(' · ')}</button>}
          {c.lost && <span>{t('자리를 잃음', 'Position lost')}</span>}
          {journal && <span>{t('일지', 'Journal')}</span>}{c.unsorted && <span className="tag">{t('분류 전', 'Unsorted')}</span>}{c.split && <span className="tag">{t('나눔', 'Split')}</span>}
          {kind === '할 일' && !work && rid !== LIBRARY_RID && <button className="a" onClick={() => { chooseRecordFilter('할 일'); go({ page: 'records', rid }) }}>{t('할 일 목록', 'To-do list')} ›</button>}
          {todoTalk && <>{todoTalk.records.length > 0 ? <span>{talkSummary(todoTalk.records)}</span>
            : <><span>·</span><button className="a" data-ui="에이전트에게" aria-expanded={talkOpen} onClick={() => setTalkOpen((v) => !v)}>{t('에이전트에게', 'Ask the agent')}</button></>}</>}
          {talk && <><span>{t('답', 'Answers')} {c.answers.length}</span>{!turn && (work || c.state) && <span>· {work ? stateLabel(c.state ?? (c.answers.length ? '답함' : '대기')) : c.state === '대기' ? t('에이전트 대기', 'Waiting for agent') : stateLabel(c.state!)}</span>}
            {/* 내가 쓰고 아직 답이 없는 기록은 이어 쓰기 대신 고치기 (10/19 피드백 10:36) */}
            {onReply && c.state !== '끝냄' && !turn && (unanswered
              ? !edit && <><span>·</span><button className="a" onClick={() => setEdit({ text: c.body, original: c.body, hash })}>{t('고치기', 'Edit')}</button></>
              : <><span>·</span><button className="a" aria-expanded={replying} onClick={() => setReplying((v) => !v)}>{t('이어 쓰기', 'Follow up')}</button></>)}</>}
        </span>
        {date && <span className="record-when" title={dateLabel ? undefined : when.title}>{date}</span>}
      </div>
      {/* 기록 탭은 답을 대화로(내 글 오른쪽, 에이전트 글 왼쪽), 오른쪽 사이드바는 좁아서 답을 차례로 쌓는다 (10/15) */}
      {work ? c.answers.length > 0 && <ul className="fbp-thread record-thread" data-ui="기록 대화">
        {c.answers.map((a, i) => a.by === '앱' ? <li key={i} className="fbp-say-wait muted">{a.body}</li>
          : <SayCard key={i} me={a.by === USER_ANSWER_BY} ui={a.by === USER_ANSWER_BY ? '사용자 글' : '에이전트 글'} name={a.by === USER_ANSWER_BY ? t('사용자', 'User') : <Author by={a.by} />} when={a.at}>
            <AnswerBody answer={a} busy={busy} onApply={applicable(i)} />
          </SayCard>)}
      </ul>
        : c.answers.map((a, i) => <RecordAnswer key={i} answer={a} busy={busy} onApply={applicable(i)} />)}
      {showReply && onReply && <RecordReply busy={busy} asked={Boolean(c.by)} onReply={async (text) => { const ok = await onReply(text); if (ok) setReplying(false); return ok }}
        onCancel={replying && !turn ? () => setReplying(false) : undefined} />}
      {todoTalk && (todoTalk.records.length > 0 || talkOpen) && <TodoTalk records={todoTalk.records} busy={busy}
        onSend={async (k, text) => { const ok = await todoTalk.send(k, text); if (ok) setTalkOpen(false); return ok }} onCancel={todoTalk.records.length ? undefined : () => setTalkOpen(false)} />}
    </div>
  </article></RepoPathContext.Provider>
}

/** 할 일 아래 줄의 대화 요약: "· 지시 1 · 에이전트 대기" */
function talkSummary(records: CommentEntry[]): string {
  const counts = (['질문', '지시'] as const).map((k) => [k, records.filter((r) => r.kind === k).length] as const).filter(([, n]) => n > 0)
  const last = records.at(-1)!
  const waiting = last.state === '대기' && !last.by
  return `· ${[...counts.map(([k, n]) => `${kindLabel(k)} ${n}`), waiting ? t('에이전트 대기', 'Waiting for agent') : stateLabel(last.state ?? '답함')].join(' · ')}`
}

/**
 * 할 일에 대해 에이전트에게 묻기 · 맡기기 (10/19 결정, 시안 2절 "채팅 모양"): 이은 질문 · 지시를 기록 대화와 같은 말풍선으로
 * (내 글 오른쪽, 에이전트 글 왼쪽), 아래 입력란의 오른쪽 아래 버튼이 종류다. 에이전트가 답하기 전에는 기다림 한 줄.
 */
function TodoTalk({ records, busy, onSend, onCancel }: { records: CommentEntry[]; busy: boolean; onSend(kind: '질문' | '지시', text: string): Promise<boolean>; onCancel?(): void }) {
  const [text, setText] = useState('')
  const last = records.at(-1)
  const lastWord = last?.answers.at(-1)
  const waiting = !!last && last.state === '대기' && !last.by && (!lastWord || lastWord.by === USER_ANSWER_BY)
  const send = async (kind: '질문' | '지시') => { if (text.trim() && !busy && await onSend(kind, text.trim())) setText('') }
  const label = records.length ? t('이어서 묻거나 덧붙이기', 'Ask more or add to it') : t('이 할 일에 대해 에이전트에게 묻거나 맡기기', 'Ask the agent about this to-do or hand it over')
  return <div className="todo-talk" data-ui="할 일 대화">
    {records.length > 0 && <ul className="fbp-thread">
      {records.flatMap((r) => [
        <SayCard key={r.id} me ui="사용자 글" name={t('사용자', 'User')} tag={kindLabel(recordKind(r))} when={recordWhen(r.id).label}><MemoText text={r.body} /></SayCard>,
        ...r.answers.map((a, i) => a.by === '앱' ? <li key={`${r.id}-${i}`} className="fbp-say-wait muted">{a.body}</li>
          : <SayCard key={`${r.id}-${i}`} me={a.by === USER_ANSWER_BY} ui={a.by === USER_ANSWER_BY ? '사용자 글' : '에이전트 글'} name={a.by === USER_ANSWER_BY ? t('사용자', 'User') : <Author by={a.by} />} when={a.at}>
            <MemoText text={a.body} />
          </SayCard>),
      ])}
    </ul>}
    {waiting ? <p className="fbp-say-wait muted">{t('에이전트의 답을 기다립니다', 'Waiting for the agent to answer')}</p>
      : <div className="fbp-compose record-reply" data-ui="할 일 입력란">
        <textarea rows={2} value={text} disabled={busy} aria-label={label} placeholder={label} autoFocus={!records.length}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => onListKey(e, setText)} />
        <div className="fbp-compose-row"><span className="sp" />
          {onCancel && <button className="btn sm" disabled={busy} onClick={onCancel}>{t('취소', 'Cancel')}</button>}
          <button className="btn sm" disabled={busy || !text.trim()} data-tip={t('질문으로 보내기: 에이전트가 답만 합니다', 'Send as a question: the agent only answers')} onClick={() => void send('질문')}>{t('질문', 'Question')}</button>
          <button className="btn primary sm tip-end" disabled={busy || !text.trim()} data-tip={t('지시로 보내기: 에이전트가 하고 나서 답합니다', 'Send as an instruction: the agent does it, then answers')} onClick={() => void send('지시')}>{t('지시', 'Instruction')}</button>
        </div>
      </div>}
  </div>
}

/** 쓴 이 이름: Claude가 쓴 기록 · 답은 이름 앞에 무채색 Claude 표시 (10/19 피드백 "무채색 로고". 주황은 내 차례에만) */
function Author({ by }: { by: string }) {
  return <>{/^claude/i.test(by) && <span className="ico agent-mark" aria-hidden>{Icon.claude}</span>}{by}</>
}

/** 기록 파일에 적을 때 머리처럼 보이는 줄 앞에 붙인 \를 보일 때만 뗀다 */
const unguard = (s: string) => s.replace(/^\\(?=#{1,6} )/gm, '')

function RecordAnswer({ answer, busy = false, onApply }: { answer: CommentEntry['answers'][number]; busy?: boolean; onApply?(): void }) {
  const mine = answer.by === USER_ANSWER_BY
  return <div className={`cmt-answer${mine ? ' mine' : ''}`}><div className="cmt-answer-head"><span>{mine ? t('이어 씀', 'Follow-up') : t('답', 'Answer')}</span><span className="cmt-answer-by" title={answer.by}>· {mine ? t('사용자', 'User') : answer.by}</span><span className="muted cmt-time">· {answer.at}</span></div>
    <AnswerBody answer={answer} busy={busy} onApply={onApply} />
  </div>
}

/** 답 글과 고침 제안(바꿀 글 → 바꾼 글, "노트에 적용") */
function AnswerBody({ answer, busy, onApply }: { answer: CommentEntry['answers'][number]; busy: boolean; onApply?(): void }) {
  const { text, fixes } = useMemo(() => splitNoteFixes(answer.body), [answer.body])
  return <>
    {text && <MemoText text={text} />}
    {fixes.length > 0 && <div className="record-fixes" data-ui="고침 제안">
      {fixes.map((f, i) => <div className="record-fix" key={i}>
        <pre className="record-fix-before"><span className="record-fix-label">{t('바꿀 글', 'Text to replace')}{'\n'}</span>{unguard(f.before)}</pre>
        <pre className="record-fix-after"><span className="record-fix-label">{t('바꾼 글', 'Replacement')}{'\n'}</span>{unguard(f.after)}</pre>
      </div>)}
      {onApply && <button className="btn sm" disabled={busy} title={t('바꿀 글을 바꾼 글로 노트에서 바꿉니다', 'Replace the text in the note with the replacement')} onClick={onApply}>{t('노트에 적용', 'Apply to note')}</button>}
    </div>}
  </>
}

/** 질문 · 지시 아래 이어 쓰기 (10/15). 에이전트가 물은 것이면 답이 되어 답함, 내가 쓴 것이면 다시 에이전트 차례 */
function RecordReply({ busy, asked, onReply, onCancel }: { busy: boolean; asked: boolean; onReply(text: string): Promise<boolean>; onCancel?(): void }) {
  const [text, setText] = useState('')
  const send = async () => { if (text.trim() && !busy && await onReply(text.trim())) setText('') }
  const label = asked ? t('에이전트에게 답하기', 'Answer the agent') : t('이어서 묻거나 덧붙이기', 'Ask more or add to it')
  return <div className="fbp-compose record-reply" data-ui="이어 쓰기">
    <textarea rows={2} value={text} disabled={busy} aria-label={label} placeholder={label}
      onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } else onListKey(e, setText) }} />
    <div className="fbp-compose-row"><span className="sp" />{onCancel && <button className="btn sm" disabled={busy} onClick={onCancel}>{t('취소', 'Cancel')}</button>}<button className="btn primary sm" data-tip={t('이어 쓰기 (⌘↵)', 'Follow up (⌘↵)')} disabled={busy || !text.trim()} onClick={() => void send()}>{t('이어 쓰기', 'Follow up')}</button></div>
  </div>
}
