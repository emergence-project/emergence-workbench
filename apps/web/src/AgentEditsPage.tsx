import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useConceptRender } from './ConceptNotes'
import { onlySpacing, paintDiff } from './diffPaint'
import { ObsidianMarkdown, type RenderOptions } from './ObsidianMarkdown'
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
 * 10/13 시안: 바뀐 곳은 문단 하나씩 전 · 후 · 검토 세 칸의 표 줄이고, 든 절마다 헤더 줄로 묶는다. 바뀐 낱말은 칠하고(diffPaint),
 * 줄을 누르면 앞뒤 문단 펼치기 단추가 보인다. 노트 이름은 고르는 탭에만 둔다.
 * 10/14 사용자 결정: 연구노트의 고침은 프로젝트마다 "고침 검토" 갈래 화면(#/r/<연구>/edits, rid를 넘김)에서 그 프로젝트 것만 본다.
 * 모든 프로젝트를 모은 화면은 없다. 전역 #/review는 개념노트(scope=library)만 보인다.
 */
export function AgentEditsPage({ selected, rid, version, onSaved }: { selected?: string; rid?: string; version: number; onSaved(msg: string): void }) {
  const scope = rid ?? 'library'
  const [list, setList] = useState<{ reviews: EditReviewRow[]; attempts: EditAttempt[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [raw, setRaw] = useState(false)
  const load = useCallback(() => { agentEditsApi.list(scope).then((v) => { setList(v); setError(null) }).catch((e: Error) => setError(e.message)) }, [scope])
  useEffect(() => { load() }, [load, version])
  const key = selected ?? list?.reviews[0]?.key
  const row = list?.reviews.find((r) => r.key === key)
  const open = (k: string) => go(rid ? { page: 'edits', rid, key: k } : { page: 'review', key: k, scope })
  const dismiss = async (a: EditAttempt) => {
    try { await agentEditsApi.dismissAttempt(a.key); load() } catch (e) { onSaved((e as Error).message) }
  }

  return (
    <Frame inProject={!!rid}>
      <section className="pane">
        <div className="pane-head" data-ui="툴바">
          <span className="crumb"><b>{rid ? t('고침 검토', 'Edit review') : t('개념노트 고침 검토', 'Review concept note edits')}</b></span>
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
              {list.reviews.length > 0 && (
                <div className="ae-tabrow">
                  <div className="segmented small ae-tabs" role="tablist">
                    {list.reviews.map((r) => (
                      <button key={r.key} role="tab" aria-selected={r.key === key} className={r.key === key ? 'on' : ''} data-ui="검토할 노트 줄" data-ui-item={r.title} title={whereOf(r.target)} onClick={() => open(r.key)}>
                        {r.title} <span className="muted">{r.changes}</span>
                      </button>
                    ))}
                  </div>
                  {row && isMarkdown(row.target) && (
                    <div className="segmented ae-view" role="radiogroup" aria-label={t('보기', 'View')} data-ui="고침 보기 고르기">
                      <button type="button" role="radio" aria-checked={!raw} className={raw ? '' : 'on'} onClick={() => setRaw(false)}>{t('보기', 'Rendered')}</button>
                      <button type="button" role="radio" aria-checked={raw} className={raw ? 'on' : ''} onClick={() => setRaw(true)}>{t('원문', 'Source')}</button>
                    </div>
                  )}
                </div>
              )}
              {key && row && <ReviewOf key={key} k={key} raw={raw} version={version} onChanged={load} onSaved={onSaved} />}
            </section>
          )}
        </div>
      </section>
    </Frame>
  )
}

/** 프로젝트 안에서는 작업 화면 칸 하나(갈래 화면), 지식의 개념노트 검토는 따로 된 전체 화면 */
function Frame({ inProject, children }: { inProject: boolean; children: ReactNode }) {
  return inProject ? <div className="ws-doc" data-ui="고침 검토">{children}</div> : <main className="stage full" data-ui="고침 검토">{children}</main>
}

/** 바뀐 곳을 든 절마다 묶는다 (문서 순서 그대로, 같은 절이 이어진 동안 한 묶음) */
function groupsOf(hunks: EditHunk[]): { section?: string; hunks: EditHunk[] }[] {
  const out: { section?: string; hunks: EditHunk[] }[] = []
  for (const h of hunks) {
    const last = out[out.length - 1]
    if (last && last.section === h.section) last.hunks.push(h)
    else out.push({ ...(h.section !== undefined && { section: h.section }), hunks: [h] })
  }
  return out
}

function ReviewOf({ k, raw, version, onChanged, onSaved }: { k: string; raw: boolean; version: number; onChanged(): void; onSaved(msg: string): void }) {
  const [rv, setRv] = useState<EditReview | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const render = useConceptRender(rv?.target.kind === 'note' ? rv.target.rid : undefined)
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
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  if (rv === undefined) return null
  if (rv === null) return <p className="muted">{t('이 노트의 고침은 모두 검토했습니다.', 'All edits to this note are reviewed.')}</p>
  const groups = groupsOf(rv.hunks)
  const md = isMarkdown(rv.target) && !raw ? render : undefined
  return (
    <div className="ae-review">
      <div className="ae-meta">
        <span>{whereOf(rv.target)}</span>
        {rv.agents.length > 0 && <span>{rv.agents.map(agentName).join(', ')}</span>}
        <span>{t(`${when(rv.since)}부터`, `Since ${when(rv.since)}`)}</span>
        <span>{t(`바뀐 곳 ${rv.hunks.length}`, `${rv.hunks.length} changed`)}</span>
        <span>{t(`절 ${groups.length}`, `${groups.length} sections`)}</span>
        <button className="a" onClick={() => openTargetOf(rv.target)}>{t('노트 열기', 'Open note')}</button>
      </div>
      {rv.notes.length > 0 && <ul className="ae-notes">{rv.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <div className="ae-table" role="table" aria-label={t('바뀐 곳', 'Changes')} data-ui="고침 비교" data-ui-item={rv.title}>
        <div className="ae-head" role="row">
          <span />
          <span role="columnheader">{t('전', 'Before')}</span>
          <span role="columnheader">{t('후', 'After')}</span>
          <span role="columnheader">{t('검토', 'Review')}</span>
        </div>
        {groups.map((g, gi) => (
          <Fragment key={`${gi}:${g.hunks[0]!.id}`}>
            <div className="ae-sec-head" role="row" data-ui="바뀐 절" title={t('이 고침들이 든 절', 'The section these edits are in')}>
              <SectionName section={g.section} />
              <span className="ae-count">{g.hunks.length}</span>
            </div>
            {g.hunks.map((h) => (
              <HunkRow key={h.id} h={h} picked={picked === h.id} expanded={expanded.has(h.id)} busy={busy} render={md} raw={raw}
                onPick={() => setPicked(h.id)} onToggle={() => toggle(h.id)} onAct={act} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** 절 헤더: 「위 절 › 이 절」(위 절은 옅게), 맨 위 절이면 이름만. 첫 제목 앞이면 "제목 앞" */
function SectionName({ section }: { section?: string }) {
  if (section === undefined) return <span className="ae-crumbs muted">{t('제목 앞', 'Before the first heading')}</span>
  const parts = section.split(' › ')
  const last = parts.pop()!
  return <span className="ae-crumbs">{parts.length > 0 && <span className="ae-up">{parts.join(' › ')} › </span>}<b>{last}</b></span>
}

/** render가 있으면 Markdown을 그린 글로(\label{…}은 문단만 떼어 그리면 번호를 붙일 데가 없어 뺀다), 없으면 원문 그대로 */
function HunkText({ text, render }: { text: string; render?: RenderOptions }) {
  return render ? <div className="ae-text ae-md"><ObsidianMarkdown text={text.replace(/\s*\\label\{[^}]*\}/g, '')} options={render} /></div> : <pre className="ae-text">{text}</pre>
}

function HunkRow({ h, picked, expanded, busy, render, raw, onPick, onToggle, onAct }: {
  h: EditHunk; picked: boolean; expanded: boolean; busy: boolean; render?: RenderOptions; raw: boolean
  onPick(): void; onToggle(): void; onAct(h: EditHunk, a: EditAction, text?: string): Promise<boolean>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  // 고치기를 닫으면 전 · 후 칸을 새로 그려 다시 칠한다
  const [epoch, setEpoch] = useState(0)
  const baseRef = useRef<HTMLDivElement>(null)
  const curRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (baseRef.current && curRef.current && h.base && h.current) paintDiff(baseRef.current, curRef.current)
  }, [h.base, h.current, render, raw, editing === null, epoch]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeEdit = () => { setEditing(null); setEpoch((n) => n + 1) }
  const hasContext = Boolean(h.prev || h.next)
  const pick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ((e.target as Element).closest('button, textarea, a')) return
    if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return
    if (!('key' in e) && window.getSelection()?.toString()) return
    if ('key' in e) e.preventDefault()
    onPick()
    // 줄을 누르면 바로 앞뒤 문단을 펼치고 접는다 (단추만 누르는 길은 잘 안 보였다, 10/13 피드백)
    if (hasContext) onToggle()
  }
  const k = `${epoch}:${raw ? 'raw' : 'md'}`
  return (
    <>
      {expanded && h.prev && <div className="ae-ctx" role="row"><div><HunkText text={h.prev} render={render} /></div></div>}
      <div className={`ae-hunk${picked ? ' picked' : ''}`} role="row" tabIndex={0} data-ui="바뀐 곳" onClick={pick} onKeyDown={pick}>
        {(() => {
          // 단추는 줄 맨 앞 칸(전 왼쪽)에 줄마다 늘 둔다. 펼칠 문단이 없으면(제목 · 다른 바뀐 곳에 붙음 · 노트 끝) 흐리게 두고 이유를 툴팁에 (시안 그대로)
          const tip = !hasContext ? t('앞뒤에 펼칠 문단이 없습니다 (제목이나 다른 바뀐 곳에 붙어 있음)', 'No unchanged paragraph around (next to a heading or another change)')
            : expanded ? t('접기', 'Collapse') : t('앞뒤 문단 펼치기', 'Show the paragraphs around')
          return <div className="ae-tg" role="cell"><button type="button" className="ae-expand" data-ui="펼치기 버튼" aria-expanded={expanded} aria-disabled={!hasContext}
            data-tip={tip} aria-label={tip} onClick={hasContext ? onToggle : undefined}>{expanded ? Icon.collapse : Icon.expand}</button></div>
        })()}
        <div className="ae-cell base" role="cell" ref={baseRef}>
          {h.base ? <HunkText key={`${k}:${h.base}`} text={h.base} render={render} /> : <p className="ae-none">{t('새 문단', 'New paragraph')}</p>}
        </div>
        <div className="ae-cell" role="cell" ref={editing === null ? curRef : undefined}>
          {editing !== null
            ? <textarea className="ae-edit" aria-label={t('고칠 글', 'Text to edit')} value={editing} rows={Math.min(16, Math.max(3, editing.split('\n').length + 1))} onChange={(e) => setEditing(e.target.value)} autoFocus />
            : h.current ? <HunkText key={`${k}:${h.current}`} text={h.current} render={render} /> : <p className="ae-none">{t('지운 문단', 'Removed paragraph')}</p>}
          {editing === null && onlySpacing(h.base, h.current) && <p className="ae-none">{t('띄어쓰기 · 줄바꿈만 바뀜', 'Only spacing or line breaks changed')}</p>}
        </div>
        <div className="ae-cell ae-acts" role="cell">
          {editing !== null ? <>
            <button className="btn" disabled={busy} onClick={closeEdit}>{t('취소', 'Cancel')}</button>
            <button className="btn primary" disabled={busy} onClick={() => void onAct(h, 'edit', editing).then((ok) => { if (ok) closeEdit() })}>{t('저장', 'Save')}</button>
          </> : <>
            <button className="icon-btn" disabled={busy} data-ui="고치기 버튼" data-tip={t('고치기', 'Edit')} aria-label={t('고치기', 'Edit')} onClick={() => setEditing(h.current)}>{Icon.pencil}</button>
            <button className="icon-btn" disabled={busy} data-ui="되돌리기 버튼" data-tip={t('되돌리기', 'Revert')} aria-label={t('되돌리기: 이 부분만 고치기 전 글로', 'Revert: put back the text from before the edit, for this part only')} onClick={() => void onAct(h, 'revert')}>{Icon.revert}</button>
            <button className="icon-btn" disabled={busy} data-ui="승인 버튼" data-tip={t('승인', 'Approve')} aria-label={t('승인: 이 고침을 받아들입니다 (파일은 그대로)', 'Approve: accept this edit (the file stays as it is)')} onClick={() => void onAct(h, 'accept')}>{Icon.approve}</button>
          </>}
        </div>
      </div>
      {expanded && h.next && <div className="ae-ctx" role="row"><div><HunkText text={h.next} render={render} /></div></div>}
    </>
  )
}

const when = (iso: string) => iso.slice(5, 16).replace('-', '/').replace('T', ' ')
/** 그린 글로 볼 수 있는 대상: 개념노트(Markdown 본문)와 .md 노트. LaTeX 노트는 원문 그대로 */
const isMarkdown = (tg: EditTarget) => tg.kind === 'concept' || tg.file.endsWith('.md')
// 연구노트는 그 프로젝트의 화면에서만 보이므로 프로젝트 이름 없이 파일만 (10/14)
const whereOf = (tg: EditTarget) => (tg.kind === 'concept' ? t('개념노트', 'Concept note') : tg.file)
export function routeOfTarget(tg: EditTarget): Route {
  if (tg.kind === 'concept') return { page: 'library', topic: tg.id }
  const block = /^workbench\/blocks\/([^/]+)\.(md|tex)$/.exec(tg.file)
  return block ? { page: 'block', rid: tg.rid, bid: block[1]! } : { page: 'part', rid: tg.rid, file: tg.file }
}
const openTargetOf = (tg: EditTarget) => go(routeOfTarget(tg))
