import { RESEARCH_TARGET, type JournalEntry } from '@rw/core'
import { useRef, useState } from 'react'
import type { CommentEntry, ResearchApi } from './api'
import { askConfirm } from './askText'
import { journalWhen } from './format'
import { journalDeletePrompt } from './journalActions'
import { onListKey } from './listInput'
import { openTarget, targetTitle } from './memo'
import { RecordRow } from './RecordList'
import { WORK_FILTER_LABEL, type RecordFilter } from './workRecords'
import { t } from './i18n'

/** 예전 일지 메모도 공용 기록 줄로 읽되 고치기·지우기는 일지 API를 쓴다. */
export function JournalRecordRow({ entry, rid, titleOf, rapi, reload, onSaved }: {
  entry: JournalEntry; rid: string; titleOf(id: string): string; rapi: ResearchApi
  reload(): Promise<unknown>; onSaved(message: string): void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = useRef(false)
  const act = async (operation: () => Promise<unknown>) => {
    if (locked.current) return false
    locked.current = true; setBusy(true); setError(null)
    try { await operation(); await reload(); return true }
    catch (e) { setError((e as Error).message); return false }
    finally { locked.current = false; setBusy(false) }
  }
  const c: CommentEntry = { id: `journal-${entry.date}-${entry.index}`, kind: '메모', where: '', rects: [], body: entry.text, state: null, answers: [] }
  return <>
    {error && <div className="banner danger" role="alert">{error}</div>}
    <RecordRow c={c} active={false} hash={entry.text} busy={busy} asking={false} onAsk={() => undefined}
      file={{ target: entry.target === RESEARCH_TARGET ? 'project' : entry.target, title: targetTitle(entry.target, titleOf) }}
      work journal dateLabel={journalWhen(entry.date, entry.time)} rid={rid}
      onGo={() => { if (entry.target !== RESEARCH_TARGET) openTarget(rid, entry.target) }}
      onState={async () => false}
      onEdit={async (text, baseHash) => {
        const saved = await act(() => rapi.editJournal({ ...entry, text: baseHash }, text))
        if (saved) onSaved(t('고쳤습니다', 'Edited'))
        return saved
      }}
      onDelete={async () => {
        if (await askConfirm(journalDeletePrompt(entry)) && await act(() => rapi.deleteJournal(entry))) onSaved(t('지웠습니다', 'Deleted'))
      }} />
  </>
}

/** 거르기를 바꾸어도 종류별로 적던 글과 저장 실패를 남긴다. */
export function WorkComposer({ filter, onSave }: { filter: RecordFilter; onSave(kind: RecordFilter, text: string): Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<RecordFilter, string>>({ '할 일': '', 메모: '', 질문: '' })
  const [errors, setErrors] = useState<Partial<Record<RecordFilter, string | null>>>({})
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const text = drafts[filter]
  const setText = (value: string) => setDrafts((current) => ({ ...current, [filter]: value }))
  const save = async () => {
    if (locked.current || !text.trim()) return
    const kind = filter
    locked.current = true; setBusy(true)
    try {
      await onSave(kind, text.trim())
      setDrafts((current) => ({ ...current, [kind]: '' }))
      setErrors((current) => ({ ...current, [kind]: null }))
    } catch (e) { setErrors((current) => ({ ...current, [kind]: (e as Error).message })) }
    finally { locked.current = false; setBusy(false) }
  }
  return <div className={`memo compact${text.trim() ? ' has-text' : ''}`} data-ui="메모 입력">
    <textarea rows={1} value={text} disabled={busy} aria-label={t(`${filter} 입력란`, `${WORK_FILTER_LABEL[filter]} input`)}
      placeholder={filter === '질문' ? t('무엇이 궁금한가요? 적으면 Claude에게 묻습니다.', 'What do you want to know? Claude will answer it.') : t(`이 프로젝트에 남길 ${filter}`, `${WORK_FILTER_LABEL[filter]} for this project`)}
      onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void save() }
        else onListKey(e, setText)
      }} />
    <div className="memo-bar">
      <span className="memo-chip" data-ui="붙는 곳">↳ {t('이 프로젝트', 'This project')}</span>
      <span className="sp" />
      <span className="memo-hint">⌘↵ {t('저장', 'Save')}</span>
      <button className="btn primary sm" data-ui="저장 버튼" disabled={busy || !text.trim()} onClick={() => void save()}>{busy ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button>
    </div>
    {errors[filter] && <div className="banner danger" role="alert">{errors[filter]}</div>}
  </div>
}
