import { useCallback, useEffect, useState } from 'react'
import { api, type LibraryInfo } from './api'
import { useAutosave } from './autosave'
import { ConceptEditor } from './ConceptEditor'
import { useConceptRender } from './ConceptNotes'
import { STATUS_NAME } from './KnowledgeMap'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { Icon } from './icons'
import { go } from './router'
import { t } from './i18n'

/** 머리말(--- … ---)과 본문을 나눈다. 머리말은 이 화면에서 고치지 않고 그대로 붙여 저장한다 */
export function splitPaperNote(content: string): { fm: string; body: string } {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? { fm: m[0], body: content.slice(m[0].length) } : { fm: '', body: content }
}

/** 머리말의 status: 줄 (없으면 draft) */
export const paperStatus = (fm: string) => fm.match(/^status:\s*(\S+)\s*$/m)?.[1] ?? 'draft'
/** 머리말의 status: 줄을 바꾼다. 없으면 끝(---) 앞에 더한다 */
export function setPaperStatus(fm: string, status: string): string {
  if (!fm) return `---\nstatus: ${status}\n---\n`
  return /^status:.*$/m.test(fm) ? fm.replace(/^status:.*$/m, `status: ${status}`) : fm.replace(/\r?\n---\r?\n?$/, `\nstatus: ${status}\n---\n`)
}

/**
 * Markdown 문헌노트 (papers/<키>.md, 11/5 피드백 10/31 23:39 진행): 개념노트처럼 읽기 화면이 기본이고, 연필로 같은 편집기를 연다.
 * 옛 LaTeX 문헌노트(.tex)는 그대로 LibraryNoteEditor가 연다.
 */
export function PaperNoteMd({ id, info, onChanged, onSaved }: { id: string; info: LibraryInfo | null; onChanged(): void; onSaved(msg: string): void }) {
  const note = info?.notes.find((n) => n.kind === 'paper' && n.id === id)
  const uses = info?.usedBy[`paper:${id}`] ?? []
  const [loaded, setLoaded] = useState<{ fm: string; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const render = useConceptRender()
  const { saver, state } = useAutosave(`paper/${id}`, {
    write: (text, hash) => api.saveLibraryNote('paper', id, text, hash),
    onSaved: () => onChanged(),
    onError: (e) => setError(e.message),
  })
  const read = useCallback(() => api.readLibraryNote('paper', id).then((d) => { saver.load(d.content, d.hash); setLoaded(splitPaperNote(d.content)); setError(null) }, (e: Error) => setError(e.message)), [id, saver])
  useEffect(() => { setLoaded(null); setEditing(false); void read() }, [read])
  const fm = loaded?.fm ?? ''
  const status = loaded ? paperStatus(fm) : note?.status ?? 'draft'
  const edit = (body: string) => { if (!loaded) return; setLoaded({ fm, body }); saver.edit(fm + body) }
  const done = async () => { if (await saver.flush()) setEditing(false) }
  const mark = async (next: 'draft' | 'reviewed') => {
    if (!loaded) return
    const nfm = setPaperStatus(fm, next)
    setLoaded({ fm: nfm, body: loaded.body })
    saver.edit(nfm + loaded.body)
    if (await saver.flush()) onSaved(next === 'reviewed' ? t('확인함으로 표시했습니다', 'Marked as reviewed') : t('확인 전으로 되돌렸습니다', 'Set back to not reviewed'))
  }
  const saving = state === 'dirty' || state === 'saving' ? t('저장 중…', 'Saving…') : state === 'conflict' ? t('저장 멈춤', 'Saving stopped') : t('저장됨', 'Saved')
  return (
    <div className="ws-doc" data-ui="문헌노트">
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <span className="crumb">{t('문헌노트', 'Literature note')} · <b>{note?.title ?? id}</b></span>
          <span className={`lib-status ${status}`} title={t('확인 전: 아직 확인하지 않음 · 확인함: 사용자가 내용을 검토함', 'Not reviewed: not checked yet · Reviewed: you reviewed the content')}>{STATUS_NAME[status as 'draft' | 'reviewed'] ?? status}</span>
          {note?.empty && <span className="lib-empty" title={t('구조만 있고 내용이 없습니다', 'Has structure but no content')}>{t('빈 노트', 'Empty note')}</span>}
          <span className="sp" />
          {editing && <span className="muted">{saving}</span>}
          {status === 'reviewed'
            ? <button className="btn" disabled={!loaded} onClick={() => void mark('draft')}>{t('확인 전으로 되돌리기', 'Mark not reviewed')}</button>
            : <button className="btn" disabled={!loaded} onClick={() => void mark('reviewed')} title={t('사용자가 내용을 검토했을 때만', 'Only when you have reviewed the content')}>{t('확인함으로 표시', 'Mark reviewed')}</button>}
          {editing
            ? <button className="icon-btn on" data-ui="다 고침" data-tip={t('보기로', 'View')} aria-label={t('보기로', 'View')} onClick={() => void done()}>{Icon.eye}</button>
            : <button className="icon-btn" data-ui="고치기" data-tip={t('수정', 'Edit')} aria-label={t('수정', 'Edit')} disabled={!loaded} onClick={() => setEditing(true)}>{Icon.pencil}</button>}
        </div>
        {state === 'conflict' && (
          <div className="banner danger">{t('다른 곳(에이전트나 다른 편집기)에서 이 파일이 바뀌어 저장을 멈췄습니다. 덮어쓰지 않았습니다.', 'This file changed elsewhere (an agent or another editor), so saving stopped. Nothing was overwritten.')}
            <span className="sp" /><button className="btn" onClick={() => void read()}>{t('파일 다시 읽기', 'Reload file')}</button></div>
        )}
        {error && <div className="banner danger">{error}</div>}
        <div className="lib-meta" data-ui="쓰는 곳">
          <span className="muted">{t('사용처', 'Used in')}</span>
          {uses.length === 0 && <span className="muted">{t('아직 없음', 'None yet')}</span>}
          {uses.map((u, i) => <button key={i} className="dep-chip" onClick={() => go(u.file ? { page: 'part', rid: u.rid, file: u.file } : { page: 'map', rid: u.rid })}>{u.project}{u.noteTitle ? ` · ${u.noteTitle}` : ''}</button>)}
        </div>
        <div className="scroll">
          {!loaded && !error && <p className="muted page-body">{t('읽는 중…', 'Loading…')}</p>}
          {loaded && (editing
            ? <ConceptEditor initial={loaded.body} options={render} editView="live" onChange={edit} onSave={() => void saver.flush()} onCancel={() => void done()}
              label={t('문헌노트 본문', 'Literature note body')} hint={t('요약부터 적어 보세요.', 'Start with the summary.')} />
            : <div className="page-body cn-body"><ObsidianMarkdown text={loaded.body} options={render} /></div>)}
        </div>
      </section>
    </div>
  )
}
