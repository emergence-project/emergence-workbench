import { useEffect, useMemo, useRef, useState } from 'react'
import { splitNoteFixes } from '@rw/core'
import { commentsApi, ConflictError, type CommentEntry, type CommentFile, type RecordFile } from './api'
import { askClaude, askErrors, asking, askKey, bumpPending, keyOf, load, patch, useAskTick, useSlot } from './Comments'
import { MemoText } from './memo'
import { Icon } from './icons'
import { askConfirm } from './askText'
import { onListKey } from './listInput'
import { go } from './router'
import { filterRecords, recordDate, recordKind, rebaseRecordEdit, type RecordFilter, type RecordEdit } from './recordsPanelHelpers'
import { t } from './i18n'

/** 기록 종류·상태는 파일에 적는 값이라 한국어 그대로 두고, 보일 때만 바꾼다 */
const KIND_EN: Record<string, string> = { '전체': 'All', '메모': 'Memo', '할 일': 'To-do', '질문': 'Question', '하이라이트': 'Highlight', '코멘트': 'Comment' }
const STATE_EN: Record<string, string> = { '대기': 'Waiting', '답함': 'Answered', '끝냄': 'Closed' }
const kindText = (k: string) => t(k, KIND_EN[k] ?? k)
const stateText = (s: string) => t(s, STATE_EN[s] ?? s)

export function RecordList({ rid, file, filter, onGo, items: suppliedItems, work = false }: {
  rid: string; file: RecordFile; filter: RecordFilter; onGo(c: CommentEntry): void
  items?: CommentEntry[]; work?: boolean
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
  const items = suppliedItems ?? filterRecords(file.comments, filter)
  const askError = (suppliedItems ?? file.comments).map((c) => askErrors.get(askKey(rid, file.target, c.id))).find(Boolean)
  return <>
    {(error ?? askError) && <div className="banner danger" role="alert">{error ?? askError}</div>}
    {!items.length && suppliedItems === undefined && <p className="muted records-empty">{filter === '전체' ? t('아직 기록이 없습니다. 아래에서 적어 보세요.', 'No records yet. Write one below.') : t(`${filter} 기록이 없습니다.`, `No ${kindText(filter).toLowerCase()} records.`)}</p>}
    {items.map((c) => <RecordRow key={c.id} active={active === c.id} c={c} hash={file.hash} busy={busy} onGo={() => onGo(c)}
      asking={asking.has(askKey(rid, file.target, c.id))} onAsk={() => void askClaude(rid, file.target, c.id)}
      onState={(state) => act(() => api.update(file.target, c.id, { state, baseHash: file.hash }))}
      onEdit={(text, baseHash) => act(() => api.update(file.target, c.id, { text, baseHash }))}
      onApply={/^(note|calc)-/.test(file.target) ? (i) => act(() => api.apply(file.target, c.id, i, file.hash)) : undefined}
      onDelete={async () => {
        // Capture the read hash before the confirmation: an appended answer must cause a conflict.
        const baseHash = file.hash
        if (await askConfirm({ title: t('이 기록을 지울까요?', 'Delete this record?'), hint: t('되돌릴 수 없습니다. 원문과 다른 기록은 남습니다. 연결된 일지의 할 일도 남습니다. 답이 달린 기록은 지울 수 없습니다.', 'This cannot be undone. The source text and other records stay. Linked journal to-dos stay too. Records with answers cannot be deleted.'), ok: t('지우기', 'Delete') })) {
          await act(() => api.remove(file.target, c.id, baseHash))
        }
      }} rid={rid} file={file} work={work} />)}
  </>
}

export interface RecordRowProps {
  c: CommentEntry; active: boolean; hash: string; busy: boolean; asking: boolean; onAsk(): void; onGo(): void
  onState(state: '대기' | '끝냄'): Promise<boolean>; onEdit(text: string, baseHash: string): Promise<boolean>; onDelete(): Promise<void>; rid: string
  /** 답 i의 고침을 노트에 적용 (연구 노트의 기록만) */
  onApply?(answer: number): Promise<boolean>
  file: Pick<RecordFile, 'target' | 'title'>; work?: boolean; dateLabel?: string; journal?: boolean
}

export function RecordRow({ c, active, hash, busy, asking: asking_, onAsk, onGo, onState, onEdit, onDelete, onApply, rid, file, work = false, dateLabel, journal = false }: RecordRowProps) {
  const row = useRef<HTMLElement>(null)
  useEffect(() => { if (active) row.current?.scrollIntoView({ block: 'nearest' }) }, [active])
  const [edit, setEdit] = useState<RecordEdit | null>(null)
  useEffect(() => { setEdit((current) => current ? rebaseRecordEdit(current, c.body, hash) : null) }, [c.body, hash])
  const conflict = edit !== null && edit.hash !== hash
  const kind = recordKind(c)
  const date = dateLabel ?? recordDate(c.id)
  const hasPlace = !c.lost && Boolean(c.line || c.page)
  const latestAnswer = c.answers.at(-1)
  // 아직 적용하지 않은 Claude 답만 "노트에 적용"을 단다 (적용하면 앱이 그 아래에 답을 남긴다)
  const applicable = (i: number) => onApply && c.answers[i]!.by === 'claude' && !c.answers.slice(i + 1).some((a) => a.by === '앱') ? () => void onApply(i) : undefined
  const save = async () => { if (edit && !conflict && edit.text.trim() && await onEdit(edit.text, edit.hash)) setEdit(null) }
  return <article ref={row} className={`record-row${work ? ' record-row-work' : ''}${active ? ' on' : ''}${c.state === '끝냄' ? ' done' : ''}${c.split ? ' split' : ''}`} data-ui="기록 줄" data-ui-item={c.id}
    onClick={(e) => { if (!(e.target as Element).closest('button, input, textarea, a, summary')) onGo() }}>
    <div className="record-row-head">
      {kind === '할 일' ? <input type="checkbox" className="record-marker" aria-label={c.state === '끝냄' ? t('완료 풀기', 'Mark not done') : t('끝냄', 'Mark done')} checked={c.state === '끝냄'} disabled={busy} onChange={() => void onState(c.state === '끝냄' ? '대기' : '끝냄')} />
        : c.unsorted ? <span className="record-marker unsorted" aria-label={t('분류 전', 'Unsorted')} />
          : <span className="record-marker" aria-label={kindText(kind)}>{kind === '질문' ? '?' : Icon.memo}</span>}
      <span className="record-place">
        {work && (file.target === 'project' ? <span className="record-source">{t('이 프로젝트', 'This project')}</span>
          : <button className="a record-source" title={file.title} onClick={onGo}>{file.title}</button>)}
        {hasPlace && <button className="a" title={t('그 자리로 가기', 'Go to the spot')} onClick={onGo}>{c.page ? t(`${c.page}쪽`, `p. ${c.page}`) : t(`${c.line}줄`, `line ${c.line}`)}</button>}{c.lost && t('자리를 잃음', 'Position lost')}
      </span>
      <div className={`record-actions${work ? ' hover-actions' : ''}`} data-ui="고치기·지우기">
        {kind === '질문' && <>
          <button className="icon-btn" data-tip={asking_ ? t('Claude가 답을 쓰는 중…', 'Claude is writing an answer…') : t('Claude에게 묻기', 'Ask Claude')} aria-label={t('Claude에게 묻기', 'Ask Claude')} disabled={busy || asking_} onClick={onAsk}>?</button>
          <button className="icon-btn" data-tip={c.state === '끝냄' ? t('다시 열기', 'Reopen') : t('끝냄', 'Close')} aria-label={c.state === '끝냄' ? t('다시 열기', 'Reopen') : t('끝냄', 'Close')} disabled={busy} onClick={() => void onState(c.state === '끝냄' ? '대기' : '끝냄')}>{c.state === '끝냄' ? Icon.reopen : Icon.check}</button>
        </>}
        <button className="icon-btn" data-tip={t('고치기', 'Edit')} aria-label={t('고치기', 'Edit')} disabled={busy} onClick={() => setEdit((current) => current ?? { text: c.body, original: c.body, hash })}>{Icon.pencil}</button>
        <button className="icon-btn tip-end" data-tip={t('지우기', 'Delete')} aria-label={t('지우기', 'Delete')} disabled={busy} onClick={() => void onDelete()}>{Icon.trash}</button>
      </div>
    </div>
    <div className="record-content">
      {c.quote && <blockquote className="record-quote" style={c.color ? { borderColor: `var(--paint-${c.color})` } : undefined}>{c.quote}</blockquote>}
      {edit ? <div className="record-edit">
        {conflict && <div className="record-conflict" role="alert"><p>{t('다른 곳에서 글을 고쳤습니다. 새 글을 확인한 뒤 적던 글로 저장할 수 있습니다.', 'The text was edited elsewhere. Review the new text, then you can save yours.')}</p><MemoText text={c.body} /><button className="btn sm" disabled={busy} onClick={() => setEdit({ ...edit, original: c.body, hash })}>{t('새 글 확인함', 'Reviewed new text')}</button></div>}
        <textarea autoFocus aria-label={t('기록 고치기', 'Edit record')} rows={3} value={edit.text} disabled={busy} onChange={(e) => setEdit({ ...edit, text: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save() } else if (e.key === 'Escape') setEdit(null); else onListKey(e, (text) => setEdit({ ...edit, text })) }} />
        <div className="record-edit-actions"><button className="btn sm" disabled={busy} onClick={() => setEdit(null)}>{t('취소', 'Cancel')}</button><button className="btn primary sm" disabled={busy || conflict || !edit.text.trim()} onClick={() => void save()}>{t('저장', 'Save')}</button></div>
      </div> : <div className="record-body"><MemoText text={c.body} /></div>}
      <div className="record-meta"><span>{kindText(kind)}</span>{journal && <span>· {t('일지', 'Journal')}</span>}{c.unsorted && <span className="tag">{t('분류 전', 'Unsorted')}</span>}{c.split && <span className="tag">{t('나눔', 'Split')}</span>}{date && <span>· {date}</span>}
        {kind === '할 일' && <button className="a" onClick={() => go({ page: 'todo', rid })}>→ {t('작업 목록', 'To-do list')}</button>}
        {kind === '질문' && <><span>· {t('답', 'Answers')} {c.answers.length}</span>{(work || c.state) && <span>· {work ? stateText(c.state ?? (c.answers.length ? '답함' : '대기')) : c.state === '대기' ? t('에이전트 대기', 'Waiting for agent') : stateText(c.state!)}</span>}</>}
      </div>
      {work ? latestAnswer && <details className="record-latest-answer"><summary>{t('최근 답 보기', 'Show latest answer')}</summary><RecordAnswer answer={latestAnswer} busy={busy} onApply={applicable(c.answers.length - 1)} /></details>
        : c.answers.map((a, i) => <RecordAnswer key={i} answer={a} busy={busy} onApply={applicable(i)} />)}
    </div>
  </article>
}

/** 기록 파일에 적을 때 머리처럼 보이는 줄 앞에 붙인 \를 보일 때만 뗀다 */
const unguard = (s: string) => s.replace(/^\\(?=#{1,6} )/gm, '')

function RecordAnswer({ answer, busy = false, onApply }: { answer: CommentEntry['answers'][number]; busy?: boolean; onApply?(): void }) {
  const { text, fixes } = useMemo(() => splitNoteFixes(answer.body), [answer.body])
  return <div className="cmt-answer"><div className="cmt-answer-head"><span>{t('답', 'Answer')}</span><span className="cmt-answer-by" title={answer.by}>· {answer.by}</span><span className="muted cmt-time">· {answer.at}</span></div>
    {text && <MemoText text={text} />}
    {fixes.length > 0 && <div className="record-fixes" data-ui="고침 제안">
      {fixes.map((f, i) => <div className="record-fix" key={i}>
        <pre className="record-fix-before" aria-label={t('바꿀 글', 'Text to replace')}>{unguard(f.before)}</pre>
        <pre className="record-fix-after" aria-label={t('바꾼 글', 'Replacement')}>{unguard(f.after)}</pre>
      </div>)}
      {onApply && <button className="btn sm" disabled={busy} title={t('바꿀 글을 바꾼 글로 노트에서 바꿉니다', 'Replace the text in the note with the replacement')} onClick={onApply}>{t('노트에 적용', 'Apply to note')}</button>}
    </div>}
  </div>
}
