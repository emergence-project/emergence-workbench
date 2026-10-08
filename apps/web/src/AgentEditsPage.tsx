import { useCallback, useEffect, useState } from 'react'
import { agentEditsApi, ConflictError, type EditAction, type EditAttempt, type EditHunk, type EditReview, type EditReviewRow, type EditTarget } from './api'
import { t } from './i18n'
import { Icon } from './icons'
import { go, type Route } from './router'
import { agentName } from './taskView'

/**
 * 에이전트 고침 검토 (10/8 사용자 결정, 첫 판): 에이전트가 고친 노트 · 개념노트를 고치기 전 글(기준판)과 문단 단위로 비교한다.
 * 바뀐 곳마다 승인(기준판에 받아들임, 파일은 그대로) · 되돌리기(그 문단만 기준판 글로) · 고치기(사용자 글로 바꾸고 승인).
 * 위에는 확인된 노트에 대한 쓰기 시도(에이전트가 대화에서 허락을 받아야 하는 것)를 한 줄씩 보인다.
 * "지시"(에이전트에게 다시 맡기기)는 다음 판.
 */
export function AgentEditsPage({ selected, scope, version, onSaved }: { selected?: string; scope?: string; version: number; onSaved(msg: string): void }) {
  const [list, setList] = useState<{ reviews: EditReviewRow[]; attempts: EditAttempt[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => { agentEditsApi.list(scope).then((v) => { setList(v); setError(null) }).catch((e: Error) => setError(e.message)) }, [scope])
  useEffect(() => { load() }, [load, version])
  const key = selected ?? list?.reviews[0]?.key
  const open = (k: string) => go({ page: 'review', key: k, ...(scope && { scope }) })
  const dismiss = async (a: EditAttempt) => {
    try { await agentEditsApi.dismissAttempt(a.key); load() } catch (e) { onSaved((e as Error).message) }
  }

  return (
    <main className="stage full" data-ui="고침 검토">
      <section className="pane">
        <div className="pane-head" data-ui="툴바">
          <span className="crumb"><b>{t('에이전트 고침 검토', 'Review agent edits')}</b></span>
          <span className="sp" />
          <span className="muted">{t('바뀐 곳마다 승인 · 되돌리기 · 고치기', 'For each change: approve, revert or edit')}</span>
        </div>
        <div className="scroll ae-page">
          {error && <div className="banner danger">{error}</div>}
          {list && list.attempts.length > 0 && (
            <section className="ae-sec" data-ui="쓰기 요청">
              <h2 className="ae-h">{t('확인된 노트 고치기 요청', 'Requests to edit reviewed notes')} <span className="rail-count">{list.attempts.length}</span></h2>
              <p className="muted ae-hint">{t('사용자가 확인한 노트라 에이전트가 쓰지 않았습니다. 그 대화에서 허락하면 에이전트가 다시 씁니다.', 'The agent did not write because you reviewed this note. If you agree in that conversation, the agent writes again.')}</p>
              <ul className="ae-rows">
                {list.attempts.map((a) => (
                  <li key={a.key} className="ae-row" data-ui="쓰기 요청 줄" data-ui-item={a.title}>
                    <span className="ae-dot" aria-hidden />
                    <button className="a ae-title" onClick={() => openTargetOf(a.target)}>{a.title}</button>
                    <span className="ae-where">{whereOf(a.target)}</span>
                    {a.summary && <span className="ae-sum" title={a.summary}>{a.summary}</span>}
                    <span className="ae-when">{a.agent ? `${agentName(a.agent)} · ${when(a.at)}` : when(a.at)}</span>
                    <button className="icon-btn" data-tip={t('목록에서 빼기', 'Remove from list')} aria-label={t(`목록에서 빼기 — ${a.title}`, `Remove from list: ${a.title}`)} onClick={() => void dismiss(a)}>{Icon.x}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {list && (
            <section className="ae-sec" data-ui="검토할 노트">
              <h2 className="ae-h">{t('검토할 노트', 'Notes to review')} {list.reviews.length > 0 && <span className="rail-count">{list.reviews.length}</span>}</h2>
              {list.reviews.length === 0 && <p className="muted">{t('지금 검토할 고침이 없습니다.', 'No edits to review right now.')}</p>}
              <div className="segmented small ae-tabs" role="tablist">
                {list.reviews.map((r) => (
                  <button key={r.key} role="tab" aria-selected={r.key === key} className={r.key === key ? 'on' : ''} data-ui="검토할 노트 줄" data-ui-item={r.title} title={whereOf(r.target)} onClick={() => open(r.key)}>
                    {r.title} <span className="muted">{r.changes}</span>
                  </button>
                ))}
              </div>
              {key && list.reviews.some((r) => r.key === key) && <ReviewOf key={key} k={key} version={version} onChanged={load} onSaved={onSaved} />}
            </section>
          )}
        </div>
      </section>
    </main>
  )
}

function ReviewOf({ k, version, onChanged, onSaved }: { k: string; version: number; onChanged(): void; onSaved(msg: string): void }) {
  const [rv, setRv] = useState<EditReview | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { agentEditsApi.review(k).then((r) => setRv(r.review)).catch((e: Error) => onSaved(e.message)) }, [k, onSaved])
  useEffect(() => { if (!busy) load() }, [load, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (h: EditHunk, action: EditAction, text?: string): Promise<boolean> => {
    if (!rv) return false
    setBusy(true)
    try {
      const r = await agentEditsApi.decide(k, rv.hash, h.id, action, text)
      setRv(r.review)
      onChanged()
      return true
    } catch (e) {
      onSaved(e instanceof ConflictError || /409|바뀌었|changed/.test((e as Error).message) ? t('그사이 노트가 바뀌었습니다. 다시 읽었습니다.', 'The note changed in the meantime. Read it again.') : (e as Error).message)
      load()
      return false
    } finally { setBusy(false) }
  }
  if (rv === undefined) return null
  if (rv === null) return <p className="muted">{t('이 노트의 고침은 모두 검토했습니다.', 'All edits to this note are reviewed.')}</p>
  return (
    <div className="ae-review" data-ui="고침 비교" data-ui-item={rv.title}>
      <div className="ae-review-head">
        <button className="a ae-review-title" onClick={() => openTargetOf(rv.target)}>{rv.title}</button>
        <span className="ae-where">{whereOf(rv.target)}</span>
        <span className="ae-when">{rv.agents.length > 0 && `${rv.agents.map(agentName).join(', ')} · `}{t(`${when(rv.since)}부터 · 바뀐 곳 ${rv.hunks.length}`, `Since ${when(rv.since)} · ${rv.hunks.length} changed`)}</span>
      </div>
      {rv.notes.length > 0 && <ul className="ae-notes">{rv.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {rv.hunks.map((h) => <HunkCard key={h.id} h={h} busy={busy} onAct={act} />)}
    </div>
  )
}

function HunkCard({ h, busy, onAct }: { h: EditHunk; busy: boolean; onAct(h: EditHunk, a: EditAction, text?: string): Promise<boolean> }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <article className="ae-hunk" data-ui="바뀐 곳">
      <div className="ae-cols">
        <div className="ae-col">
          <div className="ae-label">{t('전', 'Before')}</div>
          {h.base ? <pre className="ae-text base">{h.base}</pre> : <p className="ae-none">{t('(없음: 새로 더한 문단)', '(none: a new paragraph)')}</p>}
        </div>
        <div className="ae-col">
          <div className="ae-label">{t('후', 'After')}</div>
          {editing !== null
            ? <textarea className="ae-edit" aria-label={t('고칠 글', 'Text to edit')} value={editing} rows={Math.min(16, Math.max(3, editing.split('\n').length + 1))} onChange={(e) => setEditing(e.target.value)} autoFocus />
            : h.current ? <pre className="ae-text">{h.current}</pre> : <p className="ae-none">{t('(없음: 지운 문단)', '(none: a removed paragraph)')}</p>}
        </div>
      </div>
      <div className="ae-actions">
        {editing !== null ? <>
          <button className="btn" disabled={busy} onClick={() => setEditing(null)}>{t('취소', 'Cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={() => void onAct(h, 'edit', editing).then((ok) => { if (ok) setEditing(null) })}>{t('저장', 'Save')}</button>
        </> : <>
          <button className="btn" disabled={busy} data-ui="고치기 버튼" onClick={() => setEditing(h.current)}>{Icon.pencil}{t('고치기', 'Edit')}</button>
          <button className="btn" disabled={busy} data-ui="되돌리기 버튼" title={t('이 부분만 고치기 전 글로 되돌립니다', 'Put back the text from before the edit, for this part only')} onClick={() => void onAct(h, 'revert')}>{t('되돌리기', 'Revert')}</button>
          <button className="btn primary" disabled={busy} data-ui="승인 버튼" title={t('이 고침을 받아들입니다 (파일은 그대로)', 'Accept this edit (the file stays as it is)')} onClick={() => void onAct(h, 'accept')}>{Icon.approve}{t('승인', 'Approve')}</button>
        </>}
      </div>
    </article>
  )
}

const when = (iso: string) => iso.slice(5, 16).replace('-', '/').replace('T', ' ')
const whereOf = (tg: EditTarget) => (tg.kind === 'concept' ? t('개념노트', 'Concept note') : `${tg.rid} · ${tg.file}`)
export function routeOfTarget(tg: EditTarget): Route {
  if (tg.kind === 'concept') return { page: 'library', topic: tg.id }
  const block = /^workbench\/blocks\/([^/]+)\.(md|tex)$/.exec(tg.file)
  return block ? { page: 'block', rid: tg.rid, bid: block[1]! } : { page: 'part', rid: tg.rid, file: tg.file }
}
const openTargetOf = (tg: EditTarget) => go(routeOfTarget(tg))
