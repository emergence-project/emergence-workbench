import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { subjectsApi, type SubjectTree } from './api/subjects'
import { usePlace } from './KnowledgeHome'
import { go } from './router'
import { isDialogHostDisplayed } from './dialogVisibility'
import { t } from './i18n'

export const SUBJECTS_CHANGED = 'rw-subjects-changed'
export const subjectsChanged = () => window.dispatchEvent(new Event(SUBJECTS_CHANGED))
export function useSubjects(note?: string, source?: unknown) {
  const [tree, setTree] = useState<SubjectTree | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1)
    window.addEventListener(SUBJECTS_CHANGED, refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener(SUBJECTS_CHANGED, refresh); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    let live = true
    subjectsApi.tree(note).then((v) => { if (live) { setTree(v); setError('') } }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [note, revision, source])
  return { tree, error }
}

/** One shared picker, with a native top-layer popover and search before suggestions. */
export function SubjectPicker({ tree, value, onChange, disabled = false }: { tree: SubjectTree; value: string[]; onChange(ids: string[]): Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(12)
  const anchor = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const menu = pop.current!
    menu.setAttribute('popover', 'auto')
    anchor.current!.setAttribute('popovertarget', id)
    const toggle = () => { const showing = menu.matches(':popover-open'); setOpen(showing); if (showing) search.current?.focus() }
    menu.addEventListener('toggle', toggle)
    return () => menu.removeEventListener('toggle', toggle)
  }, [id])
  useLayoutEffect(() => {
    const element = anchor.current
    if (!element) return
    const refresh = () => { if (!isDialogHostDisplayed(element)) pop.current?.hidePopover() }
    const resize = new ResizeObserver(refresh)
    resize.observe(element)
    const changes = new MutationObserver(refresh)
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) changes.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
    return () => { resize.disconnect(); changes.disconnect() }
  }, [])
  const at = usePlace(anchor, pop, open)
  const valid = value.length <= 3 && new Set(value).size === value.length && value.every((v) => tree.items.some((s) => s.id === v)) ? value : []
  const save = async (ids: string[]) => {
    if (busy || disabled) return
    setBusy(true); setError('')
    try { await onChange(ids); subjectsChanged(); pop.current?.hidePopover(); setQuery('') }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const suggestions = tree.suggestions ?? []
  const candidates = (words.length ? tree.items.filter((s) => words.every((w) => `${s.name} ${s.id}`.toLowerCase().includes(w)))
    : suggestions.map((s) => tree.items.find((x) => x.id === s.id)!).filter(Boolean)).filter((s) => !valid.includes(s.id))
  return <div className="subject-picker" data-ui="분류 고르기">
    <div className="subject-chips">
      {valid.map((id, i) => <span className="tag subject-chip" key={id} title={id}>
        {i === 0 && <span className="subject-primary">{t('주 분류', 'Main subject')}</span>}<span className="subject-name">{tree.items.find((s) => s.id === id)?.name}</span>
        <button disabled={busy || disabled} data-tip={t('빼기', 'Remove')} aria-label={t(`분류 빼기 — ${tree.items.find((s) => s.id === id)?.name}`, `Remove subject: ${tree.items.find((s) => s.id === id)?.name}`)} onClick={() => void save(valid.filter((v) => v !== id))}>×</button>
      </span>)}
      {!valid.length && <span className="muted">{t('분류 없음', 'No subject')}</span>}
      <button ref={anchor} className="btn sm" disabled={busy || disabled || valid.length >= 3} aria-haspopup="dialog" aria-expanded={open} data-ui="분류 더하기">{t('＋ 분류', '＋ Subject')}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {createPortal(<div id={id} ref={pop} className="menu subject-menu" role="dialog" aria-label={t('분류 고르기', 'Choose subject')} data-ui="분류 고르기 메뉴"
      style={{ top: at?.top ?? 0, left: at?.left ?? 0, visibility: at ? 'visible' : 'hidden' }}>
      <input ref={search} className="rs-select" aria-label={t('분류 찾기', 'Search subjects')} placeholder={t('분류 찾기 — 이름·ID', 'Search subjects by name or ID')} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(12) }} />
      {!words.length && <p className="kh-hint">{t('추천 분류 · 다른 분류는 이름으로 찾기', 'Suggested subjects · search by name for others')}</p>}
      <div className="subject-options">{candidates.slice(0, limit).map((s) => <button key={s.id} className="nav" disabled={busy} title={s.id} onClick={() => void save([...valid, s.id])}>
        <span className="label">{s.name}</span>{!words.length && suggestions.find((x) => x.id === s.id)?.reason && <span className="muted">{suggestions.find((x) => x.id === s.id)?.reason}</span>}
      </button>)}</div>
      {!candidates.length && <p className="kh-hint">{t('고를 분류가 없습니다. 다른 이름으로 찾아보세요.', 'No subjects to choose. Try another name.')}</p>}
      {candidates.length > limit && <button className="a" onClick={() => setLimit((n) => n + 12)}>{t(`${candidates.length - limit}개 더 보기`, `Show ${candidates.length - limit} more`)}</button>}
    </div>, document.body)}
  </div>
}

/** The same collapsed hierarchy is used in the figure and paper sidebars. */
export function LibrarySubjectSide({ kind, filter }: { kind: 'figures' | 'papers'; filter?: string }) {
  const { tree, error } = useSubjects()
  if (error) return <p className="error">{error}</p>
  if (!tree?.enabled) return null
  const open = (id: string) => go({ page: kind === 'papers' ? 'shelf' : 'figures', filter: `subject:${id}` })
  const nodes = (parent: string | null) => tree.items.filter((s) => s.parent === parent)
  const branch = (parent: string | null) => <SubjectBranches parent={parent} tree={tree} kind={kind} filter={filter} onOpen={open} />
  return <div data-ui="라이브러리 분류"><div className="fg-side-head">{t('분류', 'Subjects')}</div>{nodes(null).length > 0 && branch(null)}
    <button className={`nav${filter === 'unclassified' ? ' on' : ''}`} onClick={() => go({ page: kind === 'papers' ? 'shelf' : 'figures', filter: 'unclassified' })}><span className="label">{t('분류 없음', 'No subject')}</span><span className="meta">{tree.unclassified?.[kind] ?? 0}</span></button>
  </div>
}
function SubjectBranches({ parent, tree, kind, filter, onOpen }: { parent: string | null; tree: SubjectTree; kind: 'figures' | 'papers'; filter?: string; onOpen(id: string): void }) {
  const [shown, setShown] = useState(8)
  const nodes = tree.items.filter((s) => s.parent === parent)
  return <>{nodes.slice(0, shown).map((s) => <details className="side-grp cn-subj" key={s.id} open={filter?.startsWith(`subject:${s.id}/`) || undefined}>
    <summary><span className={`chev${tree.items.some((x) => x.parent === s.id) ? '' : ' kl-no-chevron'}`} aria-hidden>›</span>
      <button className={`label kl-subject-name${filter === `subject:${s.id}` ? ' on' : ''}`} title={s.id} onClick={(e) => { e.preventDefault(); onOpen(s.id) }}>{s.name}</button><span className="n">{s[kind]}</span></summary>
    <div className="side-grp-body"><SubjectBranches parent={s.id} tree={tree} kind={kind} filter={filter} onOpen={onOpen} /></div>
  </details>)}{nodes.length > shown && <button className="a" onClick={() => setShown((n) => n + 8)}>{t(`${nodes.length - shown}개 더 보기`, `Show ${nodes.length - shown} more`)}</button>}</>
}
