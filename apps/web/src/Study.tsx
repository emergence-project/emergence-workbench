import { useCallback, useEffect, useState } from 'react'
import { conceptsApi, studyApi, STUDY_KINDS, STUDY_STATES, type StudyBook, type StudyBookRow, type StudyKind, type StudyState } from './api'
import { Dialog } from './dialogs'
import { Icon } from './icons'
import { go } from './router'
import { pushRecent } from './ConceptNotes'
import { shown, t } from './i18n'

/**
 * 공부 (11/10 사용자 결정 "공부는 지식 라이브러리에", 시안 N7ik 4절 안 A).
 * 책 · 강의 하나가 라이브러리 study/<id>.yaml 하나이고, 장마다 상태와 그 장에서 정리한 개념노트를 잇는다.
 * 정리는 개념노트에 쌓이고(11/4 "지식이 흩어지지 않게"), 여기는 차례와 진도만 본다.
 * 왼쪽 사이드바: 지식 사이드바의 「공부」 묶음(ConceptSide). 본문: 책 하나 또는 책 목록.
 */

export const STUDY_CHANGED = 'rw-study-changed'
const changed = () => window.dispatchEvent(new Event(STUDY_CHANGED))

/** 사이드바 · 목록이 함께 쓰는 책 목록. 고치면 STUDY_CHANGED로 다시 받는다 */
export function useStudyBooks(): { books: StudyBookRow[] | null; enabled: boolean } {
  const [state, setState] = useState<{ books: StudyBookRow[] | null; enabled: boolean }>({ books: null, enabled: true })
  useEffect(() => {
    let live = true
    const load = () => studyApi.list().then((r) => { if (live) setState(r) }).catch(() => { if (live) setState({ books: [], enabled: false }) })
    load()
    window.addEventListener(STUDY_CHANGED, load)
    return () => { live = false; window.removeEventListener(STUDY_CHANGED, load) }
  }, [])
  return state
}

const progress = (b: { chapters: number; done: number }) => b.chapters ? Math.round((100 * b.done) / b.chapters) : 0
const stateName = (s: StudyState) => shown(s)
const kindName = (k: StudyKind) => shown(k)

function Bar({ value }: { value: number }) {
  return <span className="st-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></span>
}

export function StudyPage({ book, onSaved }: { book?: string; onSaved(msg: string): void }) {
  const [adding, setAdding] = useState(false)
  return (
    <main className="kn-page st-page" data-ui="공부">
      <div className="scroll st-main">
        {book ? <BookView id={book} onSaved={onSaved} /> : <BookList onAdd={() => setAdding(true)} />}
      </div>
      {adding && <BookDialog onClose={() => setAdding(false)} onDone={(id, msg) => { setAdding(false); changed(); onSaved(msg); go({ page: 'study', book: id }) }} />}
    </main>
  )
}

function BookList({ onAdd }: { onAdd(): void }) {
  const { books, enabled } = useStudyBooks()
  return (
    <section className="st-sec" data-ui="책 · 강의 목록">
      <h2 className="st-h">{t('공부', 'Study')}<span className="sp" />
        {enabled && <button className="btn" data-ui="책 · 강의 더하기" onClick={onAdd}>＋ {t('책 · 강의', 'Book or lecture')}</button>}</h2>
      <p className="st-hint">{t('책 · 강의마다 장의 진도와 그 장에서 정리한 개념노트를 봅니다. 정리는 개념노트에 쌓입니다.', 'See the progress of each chapter of a book or lecture and the concept notes written from it. What you write goes into concept notes.')}</p>
      {!enabled && <p className="empty">{t('지식 라이브러리를 정하면 쓸 수 있습니다.', 'Available once a knowledge library is set.')}</p>}
      {enabled && books?.length === 0 && <p className="empty">{t('아직 책 · 강의가 없습니다. 「책 · 강의」로 더합니다.', 'No books or lectures yet. Add one with "Book or lecture".')}</p>}
      {books && books.length > 0 && <div className="st-rows">{books.map((b) => (
        <button key={b.id} className="st-row" data-ui="책 · 강의 줄" data-ui-item={b.title} onClick={() => go({ page: 'study', book: b.id })}>
          <span className="st-title">{b.title}</span>
          <span className="st-kind">{kindName(b.kind)}</span>
          <Bar value={progress(b)} />
          <span className="st-n">{t(`${b.done}/${b.chapters}장`, `${b.done}/${b.chapters} ch.`)}</span>
        </button>
      ))}</div>}
    </section>
  )
}

function BookView({ id, onSaved }: { id: string; onSaved(msg: string): void }) {
  const [book, setBook] = useState<StudyBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const load = useCallback(() => studyApi.get(id).then((b) => { setBook(b); setError(null) }).catch((e: Error) => setError(e.message)), [id])
  useEffect(() => { setBook(null); void load() }, [load])
  useEffect(() => { window.addEventListener(STUDY_CHANGED, load); return () => window.removeEventListener(STUDY_CHANGED, load) }, [load])
  if (error) return <div className="banner danger">{t(`읽지 못했습니다: ${error}`, `Could not read: ${error}`)}</div>
  if (!book) return <div className="cn-loading">{t('읽는 중…', 'Reading…')}</div>
  const done = book.chapters.filter((c) => c.state === '끝').length
  const notes = book.chapters.flatMap((c) => c.concepts)
  const ok = notes.filter((c) => c.checked === 'ok').length
  return (
    <section className="st-sec" data-ui="책 · 강의">
      <h2 className="st-h st-book-h">{book.title}<span className="sp" />
        <button className="icon-btn" data-ui="책 · 강의 고치기" data-tip={t('수정', 'Edit')} aria-label={t('수정', 'Edit')} onClick={() => setEditing(true)}>{Icon.pencil}</button></h2>
      <div className="st-meta">
        <span>{kindName(book.kind)}</span>
        <span>{t(`${book.chapters.length}장 · 끝 ${done}`, `${book.chapters.length} chapters · ${done} done`)}</span>
        <Bar value={progress({ chapters: book.chapters.length, done })} />
        <span>{t(`개념노트 ${notes.length} · 확인함 ${ok}`, `Concept notes ${notes.length} · checked ${ok}`)}</span>
        {book.source && <button className="a" data-ui="책 출처" title={t('논문 라이브러리에서 열기', 'Open in the paper library')} onClick={() => go({ page: 'shelf', open: book.source! })}>{book.source}</button>}
      </div>
      {book.chapters.length === 0
        ? <p className="empty">{t('장이 없습니다. 연필로 장을 적습니다.', 'No chapters. Add them with the pencil.')}</p>
        : <table className="st-table" data-ui="장 표">
          <thead><tr><th>{t('장', 'Chapter')}</th><th>{t('개념노트', 'Concept notes')}</th><th>{t('상태', 'State')}</th></tr></thead>
          <tbody>{book.chapters.map((c, i) => (
            <tr key={i} className={c.state === '아직' ? 'st-todo' : ''} data-ui="장 줄" data-ui-item={c.title}>
              <td className="st-ch"><span className="st-no">{i + 1}</span>{c.title}</td>
              <td><div className="st-notes">{c.concepts.length === 0 ? <span className="st-none">—</span> : c.concepts.map((n) => (
                <button key={n.id} className={`tag st-tag${n.missing ? ' missing' : ''}`} data-ui="장 개념노트" data-ui-item={n.title} disabled={n.missing}
                  title={n.missing ? t(`없는 개념노트: ${n.id}`, `No such concept note: ${n.id}`) : n.checked === 'ok' ? t('확인함', 'Checked') : undefined}
                  onClick={() => { pushRecent(n.id); go({ page: 'library', topic: n.id }) }}>
                  {n.checked === 'ok' && <span className="st-ok" aria-hidden>{Icon.check}</span>}{n.title}</button>
              ))}</div></td>
              <td className="st-state">{stateName(c.state)}</td>
            </tr>
          ))}</tbody>
        </table>}
      {editing && <BookDialog book={book} onClose={() => setEditing(false)} onDone={(_, msg) => { setEditing(false); changed(); onSaved(msg) }} />}
    </section>
  )
}

interface Draft { title: string; state: StudyState; concepts: string }

/** 책 · 강의 더하기와 고치기: 여러 칸이라 고치기 창 하나 (디자인 문서 6절) */
function BookDialog({ book, onClose, onDone }: { book?: StudyBook; onClose(): void; onDone(id: string, msg: string): void }) {
  const [title, setTitle] = useState(book?.title ?? '')
  const [kind, setKind] = useState<StudyKind>(book?.kind ?? '책')
  const [source, setSource] = useState(book?.source ?? '')
  const [rows, setRows] = useState<Draft[]>(book?.chapters.map((c) => ({ title: c.title, state: c.state, concepts: c.concepts.map((n) => n.id).join(', ') })) ?? [])
  const [lines, setLines] = useState('')
  const [ids, setIds] = useState<{ id: string; title: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (book) conceptsApi.list({ showEmpty: true, limit: 2000 }).then((r) => setIds(r.items.map((x) => ({ id: x.id, title: x.title })))).catch(() => {}) }, [book])
  const set = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const save = async () => {
    setBusy(true); setError(null)
    try {
      if (!book) {
        const made = await studyApi.create({ title, kind, ...(source.trim() && { source: source.trim() }), chapters: lines.split('\n') })
        onDone(made.id, t('책 · 강의를 더했습니다', 'Added the book or lecture'))
      } else {
        await studyApi.save(book.id, { title, kind, ...(source.trim() && { source: source.trim() }), baseHash: book.hash,
          chapters: rows.map((r) => ({ title: r.title, state: r.state, concepts: r.concepts.split(/[,\s]+/).filter(Boolean) })) })
        onDone(book.id, t('저장했습니다', 'Saved'))
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <Dialog title={book ? t('책 · 강의 수정', 'Edit book or lecture') : t('책 · 강의 추가', 'Add a book or lecture')} ui="책 · 강의" wide onClose={onClose} footer={<>
      {error && <span className="st-err">{error}</span>}
      <button className="btn" onClick={onClose}>{t('취소', 'Cancel')}</button>
      <button className="btn primary" disabled={busy || !title.trim()} onClick={() => void save()}>{book ? t('저장', 'Save') : t('추가', 'Add')}</button>
    </>}>
      <div className="st-form">
        <label className="field"><span>{t('제목', 'Title')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="st-form-row">
          <div className="field"><span>{t('종류', 'Kind')}</span>
            <div className="segmented" role="group">{STUDY_KINDS.map((k) => <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{kindName(k)}</button>)}</div></div>
          <label className="field st-src"><span>{t('출처 키 (references.bib, 없어도 됨)', 'Source key (references.bib, optional)')}</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="auerbach1994" /></label>
        </div>
        {!book && <label className="field"><span>{t('장 (한 줄에 하나)', 'Chapters (one per line)')}</span><textarea rows={8} value={lines} onChange={(e) => setLines(e.target.value)} /></label>}
        {book && <div className="field"><span>{t('장', 'Chapters')}</span>
          <datalist id="st-concepts">{ids.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</datalist>
          <div className="st-edit-rows">{rows.map((r, i) => (
            <div key={i} className="st-edit-row" data-ui="장 고치기 줄">
              <span className="st-no">{i + 1}</span>
              <input aria-label={t('장 제목', 'Chapter title')} value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
              <div className="segmented" role="group" aria-label={t('상태', 'State')}>{STUDY_STATES.map((s) => <button key={s} className={r.state === s ? 'on' : ''} aria-pressed={r.state === s} onClick={() => set(i, { state: s })}>{stateName(s)}</button>)}</div>
              <input list="st-concepts" aria-label={t('개념노트 id (쉼표로)', 'Concept note IDs (comma separated)')} placeholder={t('개념노트 id, 쉼표로', 'Concept note IDs, comma separated')} value={r.concepts} onChange={(e) => set(i, { concepts: e.target.value })} />
              <button className="icon-btn" data-tip={t('장 제거', 'Remove chapter')} aria-label={t('장 제거', 'Remove chapter')} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{Icon.x}</button>
            </div>
          ))}</div>
          <button className="btn st-add" onClick={() => setRows((rs) => [...rs, { title: '', state: '아직', concepts: '' }])}>＋ {t('장', 'Chapter')}</button>
        </div>}
      </div>
    </Dialog>
  )
}
