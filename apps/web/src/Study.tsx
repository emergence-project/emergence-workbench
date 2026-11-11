import { useCallback, useEffect, useState } from 'react'
import { conceptsApi, libraryCalls, papersApi, studyApi, STUDY_KINDS, STUDY_STATES, type StudyBook, type StudyBookRow, type StudyChapter, type StudyKind, type StudyRead, type StudyState } from './api'
import type { StudyCheckBody } from '@rw/core/contract/study'
import { Dialog } from './dialogs'
import { Icon } from './icons'
import { go } from './router'
import { pushRecent } from './ConceptNotes'
import { shown, t } from './i18n'

/**
 * 공부 (11/10 사용자 결정 "공부는 지식 라이브러리에", 시안 N7ik 4절 안 A).
 * 책 · 강의 하나가 라이브러리 study/<id>.yaml 하나이고, 장(회차)마다 상태 · 학습 목표와 체크리스트 셋(읽을 것 · 개념노트 · 할 일)을 둔다(11/11 시안 5절).
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
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => studyApi.get(id).then((b) => { setBook(b); setError(null) }).catch((e: Error) => setError(e.message)), [id])
  useEffect(() => { setBook(null); void load() }, [load])
  useEffect(() => { window.addEventListener(STUDY_CHANGED, load); return () => window.removeEventListener(STUDY_CHANGED, load) }, [load])
  if (error) return <div className="banner danger">{t(`읽지 못했습니다: ${error}`, `Could not read: ${error}`)}</div>
  if (!book) return <div className="cn-loading">{t('읽는 중…', 'Reading…')}</div>
  const done = book.chapters.filter((c) => c.state === '끝').length
  const notes = book.chapters.flatMap((c) => c.concepts)
  const have = new Set(notes.filter((c) => !c.missing).map((c) => c.id)).size
  const all = new Set(notes.map((c) => c.id)).size
  const check = async (body: StudyCheckBody) => {
    setBusy(true)
    try { setBook(await studyApi.check(book.id, body)); changed() }
    catch (e) { onSaved(e instanceof Error ? e.message : String(e)); void load() }
    finally { setBusy(false) }
  }
  const make = async (cid: string) => {
    // 계획에 적어 둔 이름으로 개념노트를 만든다: 서버가 준 제목(id의 하이픈을 띄어 씀)은 같은 id로 돌아온다
    try {
      const made = await libraryCalls.createConcept({ title: book.chapters.flatMap((c) => c.concepts).find((n) => n.id === cid)?.title ?? cid })
      pushRecent(made.id); go({ page: 'library', topic: made.id })
    } catch (e) { onSaved(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <section className="st-sec" data-ui="책 · 강의">
      <h2 className="st-h st-book-h">{book.title}<span className="sp" />
        <button className="icon-btn" data-ui="책 · 강의 고치기" data-tip={t('수정', 'Edit')} aria-label={t('수정', 'Edit')} onClick={() => setEditing(true)}>{Icon.pencil}</button></h2>
      <div className="st-meta">
        <span>{kindName(book.kind)}</span>
        <span>{t(`${book.chapters.length}${unit(book.kind)} · 끝 ${done}`, `${book.chapters.length} ${unitEn(book.kind)} · ${done} done`)}</span>
        <Bar value={progress({ chapters: book.chapters.length, done })} />
        <span>{t(`개념노트 ${all} · 있음 ${have}`, `Concept notes ${all} · written ${have}`)}</span>
        {book.source && <button className="a" data-ui="책 출처" title={t('논문 라이브러리에서 열기', 'Open in the paper library')} onClick={() => go({ page: 'shelf', open: book.source! })}>{book.source}</button>}
      </div>
      {book.chapters.length === 0
        ? <p className="empty">{t('장이 없습니다. 연필로 장을 적습니다.', 'No chapters. Add them with the pencil.')}</p>
        : <div className="st-sessions" data-ui="장 표">{book.chapters.map((c, ci) => (
          <Session key={ci} no={ci + 1} c={c} busy={busy} onMake={make}
            onCheck={(list, index, item, d) => void check({ chapter: ci, list, index, item, done: d })} />
        ))}</div>}
      {editing && <BookDialog book={book} onClose={() => setEditing(false)} onDone={(_, msg) => { setEditing(false); changed(); onSaved(msg) }} />}
    </section>
  )
}

const unit = (k: StudyKind) => (k === '강의' ? '회' : '장')
const unitEn = (k: StudyKind) => (k === '강의' ? 'sessions' : 'chapters')
const itemOf = (r: StudyRead) => r.key ?? r.text ?? ''

/** 장(회차) 하나: 제목 줄, 학습 목표, 체크리스트 셋 (11/11 "회차별 계획", 시안 N7ik 5절) */
function Session({ no, c, busy, onCheck, onMake }: {
  no: number; c: StudyChapter; busy: boolean
  onCheck(list: StudyCheckBody['list'], index: number, item: string, done: boolean): void
  onMake(id: string): void
}) {
  const total = c.read.length + c.concepts.length + c.do.length
  const ticked = c.read.filter((x) => x.done).length + c.concepts.filter((x) => x.done).length + c.do.filter((x) => x.done).length
  const box = (list: StudyCheckBody['list'], index: number, item: string, on: boolean, label: string) => (
    <input type="checkbox" checked={on} disabled={busy} aria-label={label} onChange={(e) => onCheck(list, index, item, e.target.checked)} />
  )
  return (
    <div className={`st-ses${c.state === '아직' ? ' st-todo' : ''}`} data-ui="장 줄" data-ui-item={c.title}>
      <div className="st-ses-h">
        <span className="st-no">{no}</span><span className="st-ses-t">{c.title}</span><span className="sp" />
        {total > 0 && <span className="st-n">{ticked}/{total}</span>}
        <span className="st-state">{stateName(c.state)}</span>
      </div>
      {c.goals.length > 0 && <div className="st-goals" data-ui="학습 목표"><span className="st-cap">{t('학습 목표', 'Learning goals')}</span>
        <ul>{c.goals.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
      {total > 0 && <div className="st-lists">
        <div className="st-list" data-ui="읽을 것"><span className="st-cap">{t('읽을 것', 'Reading')}</span>
          {c.read.length === 0 ? <span className="st-none">—</span> : c.read.map((r, i) => (
            <div key={i} className={`st-check${r.done ? ' on' : ''}`}>{box('read', i, itemOf(r), r.done, r.label)}
              <span>{r.key && !r.missing
                ? <button className="a" title={r.title} onClick={() => go({ page: 'shelf', open: r.key! })}>{r.label}</button>
                : r.url ? <a className="a" href={r.url} target="_blank" rel="noreferrer">{r.label} ↗</a>
                : <span className={r.missing ? 'st-none' : ''} title={r.missing ? t('references.bib에 없는 키', 'Key not in references.bib') : undefined}>{r.label}</span>}
              {r.at && <span className="st-at">{r.at}</span>}</span>
            </div>
          ))}</div>
        <div className="st-list" data-ui="장 개념노트"><span className="st-cap">{t('개념노트', 'Concept notes')}</span>
          {c.concepts.length === 0 ? <span className="st-none">—</span> : c.concepts.map((n, i) => (
            <div key={n.id} className={`st-check${n.done ? ' on' : ''}`}>{box('concepts', i, n.id, n.done, n.title)}
              <button className={`tag st-tag${n.missing ? ' plan' : ''}`} data-ui-item={n.title}
                title={n.missing ? t(`아직 없는 노트: 누르면 만듭니다 (${n.id})`, `Not written yet: click to create (${n.id})`) : n.checked === 'ok' ? t('확인함', 'Checked') : undefined}
                onClick={() => (n.missing ? onMake(n.id) : (pushRecent(n.id), go({ page: 'library', topic: n.id })))}>
                {n.checked === 'ok' && <span className="st-ok" aria-hidden>{Icon.check}</span>}{n.title}</button>
            </div>
          ))}</div>
        <div className="st-list" data-ui="할 일"><span className="st-cap">{t('할 일', 'To do')}</span>
          {c.do.length === 0 ? <span className="st-none">—</span> : c.do.map((d, i) => (
            <div key={i} className={`st-check${d.done ? ' on' : ''}`}>{box('do', i, d.text, d.done, d.text)}<span>{d.text}</span></div>
          ))}</div>
      </div>}
    </div>
  )
}

interface ReadDraft { key?: string; at?: string; text?: string; url?: string; done?: boolean; label?: string }
interface Line { text: string; done: boolean }
interface Draft { title: string; state: StudyState; goals: string[]; read: ReadDraft[]; concepts: { id: string; done: boolean }[]; todo: Line[]; open: boolean }

const conceptId = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

/** 한 줄에 하나인 목록(학습 목표 · 할 일): 줄마다 밑줄 입력란과 ×, 끝에 「＋」 한 줄. Enter는 다음 줄을 연다 */
function Lines({ items, label, placeholder, onChange }: { items: string[]; label: string; placeholder: string; onChange(next: string[]): void }) {
  const [focus, setFocus] = useState<number | null>(null)
  return (
    <div className="st-lines">
      {items.map((v, k) => (
        <div key={k} className="st-line">
          <input className="st-plain" aria-label={label} placeholder={placeholder} value={v} autoFocus={focus === k}
            onChange={(e) => onChange(items.map((x, j) => (j === k ? e.target.value : x)))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onChange([...items.slice(0, k + 1), '', ...items.slice(k + 1)]); setFocus(k + 1) } }} />
          <button className="icon-btn sm" data-tip={t('제거', 'Remove')} aria-label={t('제거', 'Remove')} onClick={() => onChange(items.filter((_, j) => j !== k))}>{Icon.x}</button>
        </div>
      ))}
      <button className="st-more" onClick={() => { onChange([...items, '']); setFocus(items.length) }}>＋ {label}</button>
    </div>
  )
}

/** 책 · 강의 더하기와 고치기: 여러 칸이라 고치기 창 하나 (디자인 문서 6절). 체크는 여기서 하지 않고 표에서 한다 */
function BookDialog({ book, onClose, onDone }: { book?: StudyBook; onClose(): void; onDone(id: string, msg: string): void }) {
  const [title, setTitle] = useState(book?.title ?? '')
  const [kind, setKind] = useState<StudyKind>(book?.kind ?? '책')
  const [source, setSource] = useState(book?.source ?? '')
  const [rows, setRows] = useState<Draft[]>(book?.chapters.map((c) => ({
    title: c.title, state: c.state, goals: c.goals,
    read: c.read.map((r) => ({ ...(r.key && { key: r.key, label: r.label }), ...(r.at && { at: r.at }), ...(r.text && { text: r.text }), ...(r.url && { url: r.url }), done: r.done })),
    concepts: c.concepts.map((n) => ({ id: n.id, done: n.done })), todo: c.do.map((d) => ({ text: d.text, done: d.done })), open: c.state === '읽는 중',
  })) ?? [])
  const [chapterLines, setChapterLines] = useState('')
  const [ids, setIds] = useState<{ id: string; title: string }[]>([])
  const [papers, setPapers] = useState<{ key: string; label: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!book) return
    conceptsApi.list({ showEmpty: true, limit: 2000 }).then((r) => setIds(r.items.map((x) => ({ id: x.id, title: x.title })))).catch(() => {})
    papersApi.list().then((r) => setPapers(r.papers.map((p) => ({ key: p.key, label: `${shortNames(p.authors)} ${p.year ?? ''} — ${p.title}`.trim() })))).catch(() => {})
  }, [book])
  const titleOf = (id: string) => ids.find((c) => c.id === id)?.title ?? book?.chapters.flatMap((c) => c.concepts).find((c) => c.id === id)?.title ?? id.replace(/[-_.]+/g, ' ')
  const set = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const setRead = (i: number, k: number, patch: Partial<ReadDraft>) => set(i, { read: rows[i]!.read.map((r, j) => (j === k ? { ...r, ...patch } : r)) })
  const save = async () => {
    setBusy(true); setError(null)
    try {
      if (!book) {
        const made = await studyApi.create({ title, kind, ...(source.trim() && { source: source.trim() }), chapters: chapterLines.split('\n') })
        onDone(made.id, t('책 · 강의를 더했습니다', 'Added the book or lecture'))
      } else {
        await studyApi.save(book.id, { title, kind, ...(source.trim() && { source: source.trim() }), baseHash: book.hash,
          chapters: rows.map((r) => ({ title: r.title, state: r.state, goals: r.goals.map((g) => g.trim()).filter(Boolean),
            read: r.read.filter((x) => x.key || x.text?.trim()).map(({ label: _l, ...x }) => ({ ...x, ...(x.at !== undefined && { at: x.at.trim() }), ...(x.text !== undefined && { text: x.text.trim() }), ...(x.url !== undefined && { url: x.url.trim() }) })),
            concepts: r.concepts, do: r.todo.filter((d) => d.text.trim()).map((d) => ({ text: d.text.trim(), done: d.done })) })) })
        onDone(book.id, t('저장했습니다', 'Saved'))
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  const u = unit(kind)
  const count = (r: Draft) => [
    [t('목표', 'goals'), r.goals.filter((g) => g.trim()).length], [t('읽을 것', 'reading'), r.read.length],
    [t('개념노트', 'notes'), r.concepts.length], [t('할 일', 'to do'), r.todo.filter((d) => d.text.trim()).length],
  ].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ')
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
        {!book && <label className="field"><span>{t(`${u === '회' ? '회차' : '장'} (한 줄에 하나)`, 'Chapters (one per line)')}</span><textarea rows={8} value={chapterLines} onChange={(e) => setChapterLines(e.target.value)} /></label>}
        {book && <div className="st-chapters"><div className="st-chapters-h"><span>{u === '회' ? t('회차', 'Sessions') : t('장', 'Chapters')}</span><button className="btn st-add" onClick={() => setRows((rs) => [...rs, { title: '', state: '아직', goals: [], read: [], concepts: [], todo: [], open: true }])}>＋ {u === '회' ? t('회차', 'Session') : t('장', 'Chapter')}</button></div>
          <div className="st-edit-rows">{rows.map((r, i) => (
            <div key={i} className={`st-edit-row${r.open ? ' open' : ''}`} data-ui="장 고치기 줄">
              <button className="icon-btn sm st-fold" aria-expanded={r.open} data-tip={r.open ? t('접기', 'Collapse') : t('펼치기', 'Expand')} aria-label={r.open ? t('접기', 'Collapse') : t('펼치기', 'Expand')} onClick={() => set(i, { open: !r.open })}>{Icon.fold}</button>
              <span className="st-no">{i + 1}</span>
              <input className="st-edit-title" autoFocus={!r.title && i === rows.length - 1} aria-label={t('장 제목', 'Chapter title')} placeholder={t('장 제목', 'Chapter title')} value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
              <div className="segmented small" role="group" aria-label={t('상태', 'State')}>{STUDY_STATES.map((s) => <button key={s} className={r.state === s ? 'on' : ''} aria-pressed={r.state === s} onClick={() => set(i, { state: s })}>{stateName(s)}</button>)}</div>
              <button className="icon-btn sm" data-tip={t('장 제거', 'Remove chapter')} aria-label={t('장 제거', 'Remove chapter')} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{Icon.x}</button>
              {!r.open && count(r) && <button className="st-edit-sum" onClick={() => set(i, { open: true })}>{count(r)}</button>}
              {r.open && <div className="st-edit-plan">
                <section className="st-part st-part-wide">
                  <h4 className="st-cap">{t('학습 목표', 'Learning goals')}</h4>
                  <Lines items={r.goals} label={t('학습 목표', 'Goal')} placeholder={t('이 회차를 마치면 할 수 있어야 하는 것', 'What you should be able to do after this')} onChange={(goals) => set(i, { goals })} />
                </section>
                <section className="st-part">
                  <h4 className="st-cap">{t('읽을 것', 'Reading')}</h4>
                  <div className="st-lines">
                    {r.read.map((x, k) => (
                      <div key={k} className="st-line st-read-line">
                        {x.key
                          ? <span className="st-read-name" title={x.key}>{x.label ?? papers.find((p) => p.key === x.key)?.label.split(' — ')[0] ?? x.key}</span>
                          : <input className="st-plain" aria-label={t('이름', 'Name')} placeholder={t('이름 (영상 · 코드 등)', 'Name (video, code …)')} value={x.text ?? ''} onChange={(e) => setRead(i, k, { text: e.target.value })} />}
                        {x.key
                          ? <input className="st-plain st-at-in" aria-label={t('쪽 · 절', 'Pages or sections')} placeholder={t('쪽 · 절', 'pp. or §')} value={x.at ?? ''} onChange={(e) => setRead(i, k, { at: e.target.value })} />
                          : <input className="st-plain st-at-in" aria-label={t('주소', 'URL')} placeholder="https://" value={x.url ?? ''} onChange={(e) => setRead(i, k, { url: e.target.value })} />}
                        <button className="icon-btn sm" data-tip={t('제거', 'Remove')} aria-label={t('제거', 'Remove')} onClick={() => set(i, { read: r.read.filter((_, j) => j !== k) })}>{Icon.x}</button>
                      </div>
                    ))}
                    <div className="st-adds">
                      <select className="rs-select st-pick" value="" aria-label={t('문헌 추가', 'Add a reference')} onChange={(e) => { const p = papers.find((x) => x.key === e.target.value); if (p) set(i, { read: [...r.read, { key: p.key, label: p.label.split(' — ')[0] }] }) }}>
                        <option value="">{t('＋ 문헌…', '＋ Reference…')}</option>
                        {papers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                      <button className="st-more" onClick={() => set(i, { read: [...r.read, { text: '', url: '' }] })}>＋ {t('주소', 'URL')}</button>
                    </div>
                  </div>
                </section>
                <section className="st-part">
                  <h4 className="st-cap">{t('개념노트', 'Concept notes')}</h4>
                  <div className="st-chips">
                    {r.concepts.map((n) => (
                      <span key={n.id} className={`tag st-chip${ids.some((c) => c.id === n.id) ? '' : ' plan'}`}>{titleOf(n.id)}
                        <button className="x" title={t('제거', 'Remove')} aria-label={t(`제거: ${titleOf(n.id)}`, `Remove: ${titleOf(n.id)}`)} onClick={() => set(i, { concepts: r.concepts.filter((x) => x.id !== n.id) })}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="st-adds">
                    <select className="rs-select st-pick" value="" aria-label={t('개념노트 추가', 'Add concept note')} onChange={(e) => e.target.value && set(i, { concepts: [...r.concepts, { id: e.target.value, done: false }] })}>
                      <option value="">{t('＋ 있는 노트…', '＋ Existing note…')}</option>
                      {ids.filter((c) => !r.concepts.some((x) => x.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <input className="st-plain st-new-note" aria-label={t('만들 개념노트 이름', 'Name of a note to write')} placeholder={t('＋ 만들 노트 (Enter)', '＋ Note to write (Enter)')}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                        const id = conceptId(e.currentTarget.value)
                        if (id && !r.concepts.some((x) => x.id === id)) set(i, { concepts: [...r.concepts, { id, done: false }] })
                        e.currentTarget.value = ''
                      }} />
                  </div>
                </section>
                <section className="st-part st-part-wide">
                  <h4 className="st-cap">{t('할 일', 'To do')}</h4>
                  <Lines items={r.todo.map((d) => d.text)} label={t('할 일', 'To do')} placeholder={t('연습 · 코드', 'Exercise or code')}
                    onChange={(texts) => set(i, { todo: texts.map((text, k) => ({ text, done: r.todo.find((d) => d.text === text)?.done ?? r.todo[k]?.done ?? false })) })} />
                </section>
              </div>}
            </div>
          ))}</div>
        </div>}
      </div>
    </Dialog>
  )
}

const shortNames = (authors: string[]) => (authors.length > 2 ? `${authors[0]} ${t('외', 'et al.')}` : authors.join('–'))
