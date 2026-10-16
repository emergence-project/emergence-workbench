import { useState } from 'react'
import { ConflictError, notesApi, type NoteRow } from './api'
import { Dialog } from './dialogs'
import { LOOSE_NOTES_LABEL } from './noteKinds'
import { StatusDot } from './StatusDot'
import { plural, t } from './i18n'

/**
 * 노트 지정하기 (10/12 14:38, 10/13 이름 바꿈): 이 주제에 없는 노트를 골라 이 주제에도 지정한다. 주제 없는 노트("노트들")를 먼저 보인다.
 * 노트의 topics 끝에 덧붙이므로 주 주제(첫째)는 바뀌지 않는다. 주제가 없던 노트는 이 주제가 주 주제가 된다.
 */
export function AddNotesDialog({ rid, topic, notes, topicIds, titleOf, onClose, onDone }: {
  rid: string; topic: { id: string; title: string }; notes: NoteRow[]; topicIds: string[]
  titleOf(id: string): string | undefined
  onClose(): void; onDone(message: string): void
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loose = (n: NoteRow) => !n.topics.some((x) => topicIds.includes(x))
  const q = query.trim().toLowerCase()
  const rows = notes
    .filter((n) => !n.topics.includes(topic.id))
    .filter((n) => !q || n.title.toLowerCase().includes(q) || n.file.toLowerCase().includes(q))
    .sort((a, b) => Number(loose(b)) - Number(loose(a)) || b.mtime - a.mtime)
  const toggle = (file: string) => setPicked((s) => { const n = new Set(s); if (n.has(file)) n.delete(file); else n.add(file); return n })
  const submit = async () => {
    const chosen = notes.filter((n) => picked.has(n.file))
    if (!chosen.length) return
    setBusy(true); setError('')
    const api = notesApi(rid)
    let added = 0
    try {
      for (const n of chosen) { await api.setHead(n.file, { topics: [...n.topics, topic.id] }, n.hash); added++ }
      onDone(t(`노트 ${added}개를 주제 "${topic.title}"에 지정했습니다`, `Assigned ${plural(added, 'note')} to topic "${topic.title}"`))
    } catch (e) {
      const why = e instanceof ConflictError ? t('다른 곳에서 파일이 바뀌었습니다. 다시 열어 해 보세요.', 'The file changed elsewhere. Reopen and try again.') : (e as Error).message
      if (added) onDone(t(`노트 ${added}개만 지정했습니다: ${why}`, `Assigned only ${plural(added, 'note')}: ${why}`))
      else { setError(why); setBusy(false) }
    }
  }
  return (
    <Dialog title={t(`"${topic.title}"에 노트 지정하기`, `Assign notes to "${topic.title}"`)} ui="있는 노트 넣기" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !picked.size} onClick={() => void submit()}>{picked.size ? t(`지정 (${picked.size})`, `Assign (${picked.size})`) : t('지정', 'Assign')}</button>
    </>}>
      <label className="field"><span>{t('찾기', 'Search')}</span>
        <input autoFocus placeholder={t('노트 이름', 'Note name')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {rows.length === 0
        ? <p className="empty an-empty">{query ? t('맞는 노트가 없습니다.', 'No matching notes.') : t('이 주제에 지정할 다른 노트가 없습니다.', 'There are no other notes to assign to this topic.')}</p>
        : (
          <ul className="an-list" data-ui="넣을 노트 목록">
            {rows.map((n) => (
              <li key={n.file}>
                <label className={`an-row${picked.has(n.file) ? ' on' : ''}`}>
                  <input type="checkbox" checked={picked.has(n.file)} onChange={() => toggle(n.file)} />
                  <StatusDot s={n.status} />
                  <span className="an-title">{n.title}</span>
                  <span className="an-where muted">{loose(n) ? LOOSE_NOTES_LABEL : n.topics.map((x) => titleOf(x)).filter(Boolean).join(' · ')}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      <p className="muted an-hint">{t('지정한 노트는 원래 주제에도 그대로 남습니다. 주 주제를 바꾸려면 노트 정보의 주제 칸에서 고칩니다.', 'Assigned notes stay in their current topics too. To change the main topic, use the Topic field in the note info.')}</p>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  )
}
