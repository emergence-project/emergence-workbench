import { useSubjects, subjectsChanged } from './SubjectPicker'
import { subjectsApi, type SubjectTree } from './api/subjects'
import { askText } from './askText'
import { Icon } from './icons'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { conceptsApi, type ConceptSort, type ConceptTableRow, type LibraryInfo } from './api'
import { pushRecent } from './ConceptNotes'
import { KnowledgeStorage, MakeConcept, usePlace } from './KnowledgeHome'
import { CHECK_NAMES, ISSUE_NAMES, KNOWLEDGE_LAYOUT_KEY, KNOWLEDGE_SORT_KEY, showKnowledgeList, type KnowledgeFilters, type KnowledgeSort } from './knowledgeListState'
import { findSubject, subjectBelow, subjectTree, type SubjNode } from './knowledgeSubjects'
import { go } from './router'
import { store } from './store'
import { tableHiddenColumns } from './tableColumns'
import { t, locale } from './i18n'

const PAGE = 50
const COLUMNS: { id: ConceptSort; label: string; width: string; num?: boolean }[] = [
  { id: 'title', label: t('제목', 'Title'), width: '--pl-col-title' },
  { id: 'subject', label: t('하위 분류', 'Child subject'), width: '--kl-col-subject' },
  { id: 'projects', label: t('쓰는 프로젝트', 'Used in projects'), width: '--kl-col-projects' },
  { id: 'sources', label: t('출처', 'Sources'), width: '--kl-col-num', num: true },
  { id: 'links', label: t('링크', 'Links'), width: '--kl-col-num', num: true },
  { id: 'issues', label: t('이상', 'Issues'), width: '--kl-col-issues' },
  { id: 'mtime', label: t('고친 날', 'Edited'), width: '--kl-col-date' },
  { id: 'aliases', label: t('다른 이름', 'Aliases'), width: '--kl-col-aliases' },
  { id: 'checked', label: t('확인', 'Review'), width: '--kl-col-checked' },
]
type Layout = { order: ConceptSort[]; hidden: ConceptSort[]; shown: ConceptSort[] }
const isColumn = (s: unknown): s is ConceptSort => COLUMNS.some((c) => c.id === s)
function readLayout(): Layout {
  const saved = store.get<Partial<Layout> | null>(KNOWLEDGE_LAYOUT_KEY, null)
  const order = Array.isArray(saved?.order) ? [...new Set(saved.order.filter(isColumn))] : []
  return { order: [...order, ...COLUMNS.map((c) => c.id).filter((c) => !order.includes(c))],
    hidden: Array.isArray(saved?.hidden) ? saved.hidden.filter((c) => isColumn(c) && c !== 'title') : ['aliases', 'checked'],
    shown: Array.isArray(saved?.shown) ? saved.shown.filter(isColumn) : [] }
}
function readSort(): KnowledgeSort {
  const saved = store.get<KnowledgeSort | null>(KNOWLEDGE_SORT_KEY, null)
  return saved && isColumn(saved.col) && (saved.dir === 'asc' || saved.dir === 'desc') ? saved : { col: 'title', dir: 'asc' }
}
const checkedName = { none: t('확인 전', 'Not reviewed'), ok: t('확인함', 'Reviewed'), changed: t('확인 뒤 바뀜', 'Changed after review') }
function cellText(row: ConceptTableRow, col: ConceptSort, subject?: string, tree?: SubjectTree | null): string {
  switch (col) {
    case 'subject': return tree?.enabled ? ((row.subjects ?? []).map((id) => tree.items.find((s) => s.id === id)?.name ?? '').join(' · ') || '—') : subjectBelow(row.subject, subject) || '—'
    case 'projects': return row.projects.join(' · ') || '—'
    case 'issues': return row.issues.map((i) => ISSUE_NAMES[i]).join(' · ') || '—'
    case 'aliases': return row.aliases.join(' · ') || '—'
    case 'checked': return checkedName[row.checked]
    case 'mtime': {
      const d = new Date(row.mtime)
      return row.mtime ? `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '—'
    }
    default: return String(row[col])
  }
}

/** SQL에서 거른 목록을 50개씩 받는다. 거르기가 바뀐 뒤 도착한 이전 응답은 버린다. */
export function KnowledgeList({ info, filters, rightOpen, onChanged, onSaved }: {
  info: LibraryInfo | null; filters: KnowledgeFilters; rightOpen: boolean; onChanged(): void; onSaved(m: string): void
}) {
  const { tree } = useSubjects(undefined, info)
  const [sort, setSort] = useState(readSort)
  const [layout, setLayout] = useState(readLayout)
  const scroll = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{ available: number; widths: Partial<Record<ConceptSort, number>> } | null>(null)
  useLayoutEffect(() => {
    const el = scroll.current!
    const measure = () => {
      const css = getComputedStyle(el)
      const widths = Object.fromEntries(COLUMNS.map((c) => [c.id, parseFloat(css.getPropertyValue(c.width))]))
      if (el.clientWidth) setMeasured({ available: el.clientWidth, widths })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const hidden = measured ? tableHiddenColumns(layout, measured.available, (id) => measured.widths[id] ?? 0, [['projects'], ['links']]) : layout.hidden
  const [data, setData] = useState<{ total: number; items: ConceptTableRow[] } | null>(null)
  const [subjects, setSubjects] = useState<SubjNode[]>([])
  const [totalNotes, setTotalNotes] = useState<number>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const pendingMore = useRef(false)
  const query = { ...filters, sort: sort.col, dir: sort.dir, limit: PAGE }
  const queryKey = JSON.stringify(query)
  useEffect(() => {
    const current = ++generation.current
    pendingMore.current = false
    setData(null); setBusy(true); setError('')
    conceptsApi.list(query).then((result) => {
      if (generation.current === current) setData(result)
    }).catch((e: Error) => { if (generation.current === current) setError(e.message) })
      .finally(() => { if (generation.current === current) setBusy(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 정리 때 최신 세대 번호를 올려야 늦게 온 응답을 버린다
    return () => { generation.current++ }
  }, [queryKey, info, revision, tree?.hash]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true
    conceptsApi.subjects({ showEmpty: filters.showEmpty }).then((rows) => { if (live) setSubjects(subjectTree(rows)) }).catch((e: Error) => { if (live) setError(e.message) })
    conceptsApi.list({ showEmpty: true, limit: 1 }).then((r) => { if (live) setTotalNotes(r.total) }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [info, filters.showEmpty, revision, tree?.hash])
  const more = async () => {
    if (!data || busy || pendingMore.current) return
    const current = generation.current
    pendingMore.current = true; setBusy(true); setError('')
    try {
      const next = await conceptsApi.list({ ...query, offset: data.items.length })
      if (generation.current === current) setData((prev) => ({ total: next.total, items: [...(prev?.items ?? []), ...next.items] }))
    } catch (e) { if (generation.current === current) setError((e as Error).message) }
    finally { if (generation.current === current) { pendingMore.current = false; setBusy(false) } }
  }
  const changeSort = (col: ConceptSort) => {
    const next: KnowledgeSort = { col, dir: sort.col === col && sort.dir === 'asc' ? 'desc' : 'asc' }
    setSort(next); store.set(KNOWLEDGE_SORT_KEY, next)
  }
  const changeLayout = (next: Layout) => { setLayout(next); store.set(KNOWLEDGE_LAYOUT_KEY, next) }
  const remove = (key: keyof KnowledgeFilters) => {
    const next = { ...filters }
    if (key === 'showEmpty') next.showEmpty = true
    else delete next[key]
    showKnowledgeList(next)
  }
  const tags: { key: keyof KnowledgeFilters; text: string }[] = [
    ...(filters.subjectPrefix !== undefined ? [{ key: 'subjectPrefix' as const, text: `${t('분류', 'Subject')}: ${tree?.enabled ? (tree.items.find((s) => s.id === filters.subjectPrefix)?.name ?? t('분류 없음', 'No subject')) : filters.subjectPrefix.split(' › ').pop() || t('분류 없음', 'No subject')}` }] : []),
    ...(!filters.showEmpty ? [{ key: 'showEmpty' as const, text: t('빈 노트 숨김', 'Empty notes hidden') }] : []),
    ...(filters.issue ? [{ key: 'issue' as const, text: ISSUE_NAMES[filters.issue] }] : []),
    ...(filters.check ? [{ key: 'check' as const, text: CHECK_NAMES[filters.check] }] : []),
  ]
  const cols = layout.order.filter((id) => !hidden.includes(id)).map((id) => COLUMNS.find((c) => c.id === id)!)
  const node = filters.subjectPrefix === undefined ? undefined : findSubject(subjects, filters.subjectPrefix)
  const open = (row: ConceptTableRow) => { pushRecent(row.id); go({ page: 'library', topic: row.id }) }
  return (
    <main className="kn-page kh-page kl-page" data-ui="지식 목록">
      <div className={`kh-layout${rightOpen ? '' : ' no-right'}`}>
        <section className="pane kl-main">
          <div className="pane-head lib-head" data-ui="지식 목록 머리">
            <div className="lib-head-left">{t('개념노트', 'Concept notes')} {data?.total ?? '…'}</div>
            <div className="lib-head-right"><ColumnMenu layout={layout} hidden={hidden} onChange={changeLayout} /></div>
          </div>
          <div className="kl-tags" data-ui="거르기 이름표">
            {tags.map((tag) => <span className="tag" key={tag.key} title={tag.key === 'subjectPrefix' ? filters.subjectPrefix : undefined}>
              <span>{tag.text}</span><button data-tip={t('빼기', 'Remove')} aria-label={t(`필터 빼기 — ${tag.text}`, `Remove filter: ${tag.text}`)} onClick={() => remove(tag.key)}>×</button>
            </span>)}
          </div>
          {error && <div className="banner danger">{t('목록을 읽지 못했습니다: ', 'Could not read the list: ')}{error} <button className="a" onClick={() => setRevision((r) => r + 1)}>{t('다시 읽기', 'Reload')}</button></div>}
          <div ref={scroll} className="scroll pl-scroll kl-scroll">
            <div className="pl-table kl-table" role="table" aria-label={t('개념노트 목록', 'Concept note list')} aria-busy={busy} style={{ minWidth: `calc(${cols.map((c) => `var(${c.width})`).join(' + ')})` }}>
              <div className="pl-tr pl-th" role="row" data-ui="지식 표 머리">
                {cols.map((c) => <div className={`pl-cell${c.num ? ' num' : ''}${c.id === 'mtime' ? ' kl-date' : ''}`} role="columnheader" key={c.id}
                  style={{ width: `var(${c.width})`, flexGrow: c.id === 'title' ? 1 : 0 }} aria-sort={sort.col === c.id ? sort.dir === 'asc' ? 'ascending' : 'descending' : 'none'}>
                  <button className="pl-sort" title={t(`${c.label}로 정렬 (한 번 더 누르면 거꾸로)`, `Sort by ${c.label} (click again to reverse)`)} onClick={() => changeSort(c.id)}>
                    <span className="pl-label">{c.label}</span>{sort.col === c.id && <span className="pl-dir" aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                </div>)}
              </div>
              <div role="row" className="kl-add"><div role="cell" aria-colspan={cols.length}>
                <MakeConcept onChanged={onChanged} onSaved={onSaved} onDrafted={() => setRevision((r) => r + 1)} />
              </div></div>
              {data?.items.map((row) => <div role="row" key={row.id} tabIndex={0} className="pl-tr" data-ui="지식 목록 줄" data-ui-item={row.title}
                onClick={() => open(row)} onKeyDown={(e) => { if (e.key === 'Enter') open(row) }}>
                {cols.map((c) => <div role="cell" key={c.id} className={`pl-cell${c.num ? ' num' : ''}`}
                  style={{ width: `var(${c.width})`, flexGrow: c.id === 'title' ? 1 : 0 }}
                  title={c.id === 'mtime' && row.mtime ? new Date(row.mtime).toLocaleString(locale()) : cellText(row, c.id, filters.subjectPrefix, tree)}>{cellText(row, c.id, filters.subjectPrefix, tree)}</div>)}
              </div>)}
            </div>
            {!data && !error && <p className="kh-empty">{t('불러오는 중…', 'Loading…')}</p>}
            {data?.total === 0 && <p className="kh-empty">{t('이 조건에 맞는 개념노트가 없습니다.', 'No concept notes match these filters.')}</p>}
            {data && data.items.length < data.total && <div className="more-bar"><button className="btn sm" disabled={busy} onClick={() => void more()}>{busy ? t('불러오는 중…', 'Loading…') : t(`${data.total - data.items.length}개 더 보기`, `Show ${data.total - data.items.length} more`)}</button></div>}
          </div>
          {tree?.enabled && filters.subjectPrefix !== undefined && <div className="subject-links" data-ui="분류의 논문과 그림">
            <span>{t('이 분류의', 'In this subject:')}</span><button className="a" onClick={() => go({ page: 'shelf', filter: `subject:${filters.subjectPrefix}` })}>{t('논문', 'Papers')} {(filters.subjectPrefix === '' ? tree.unclassified?.papers : tree.items.find((s) => s.id === filters.subjectPrefix)?.papers) ?? 0}</button>
            <span>·</span><button className="a" onClick={() => go({ page: 'figures', filter: `subject:${filters.subjectPrefix}` })}>{t('그림', 'Figures')} {(filters.subjectPrefix === '' ? tree.unclassified?.figures : tree.items.find((s) => s.id === filters.subjectPrefix)?.figures) ?? 0}</button>
          </div>}
        </section>
        {rightOpen && <aside className="kh-side" data-ui={filters.subjectPrefix !== undefined ? '분류 정보' : '라이브러리 정보'}>
          {filters.subjectPrefix !== undefined ? <SubjectInfo key={filters.subjectPrefix} node={node} path={filters.subjectPrefix} filters={filters} tree={tree} onSaved={onSaved} onChanged={onChanged} />
            : info && <KnowledgeStorage info={info} total={totalNotes} />}
        </aside>}
      </div>
    </main>
  )
}

function SubjectInfo({ node, path, filters, tree, onSaved, onChanged }: { node?: SubjNode; path: string; filters: KnowledgeFilters; tree: SubjectTree | null; onSaved(m: string): void; onChanged(): void }) {
  const [shown, setShown] = useState(8)
  const parentPath = tree?.enabled ? path.split('/').slice(0, -1).map((_, i, parts) => tree.items.find((s) => s.id === parts.slice(0, i + 1).join('/'))?.name).join(' › ') : path.split(' › ').slice(0, -1).join(' › ')
  const change = async (add: boolean) => {
    if (!tree) return
    const name = await askText({ title: add ? t('하위 분류 더하기', 'Add child subject') : t('분류 이름 고치기', 'Rename subject'), label: t('이름', 'Name'), initial: add ? '' : node?.name, ok: add ? t('더하기', 'Add') : t('고치기', 'Edit') })
    if (!name?.trim()) return
    try {
      if (add) {
        const initial = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const slug = await askText({ title: t('하위 분류 ID', 'Child subject ID'), label: t('ID 끝부분', 'Last part of the ID'), initial, hint: t('영문 소문자·숫자·하이픈으로 적습니다.', 'Use lowercase letters, digits and hyphens.'), ok: t('더하기', 'Add') })
        if (!slug) return
        await subjectsApi.add(path, name, slug, tree.hash)
      } else await subjectsApi.rename(path, name, tree.hash)
      subjectsChanged(); onChanged(); onSaved(add ? t('분류를 더했습니다', 'Added the subject') : t('분류 이름을 고쳤습니다', 'Renamed the subject'))
    } catch (e) { subjectsChanged(); onSaved((e as Error).message) }
  }
  return <div className="kh-info">
    <h2 className="kh-side-h">{t('분류 정보', 'Subject info')}</h2>
    {tree?.enabled && path ? <div className="subject-title"><h3 className="kl-subject-title" title={path}>{node?.name ?? path}</h3>
      <button className="icon-btn" data-tip={t('분류 이름 고치기', 'Rename subject')} aria-label={t('분류 이름 고치기', 'Rename subject')} onClick={() => void change(false)}>{Icon.pencil}</button></div>
      : <h3 className="kl-subject-title">{node?.name ?? (path.split(' › ').pop() || t('분류 없음', 'No subject'))}</h3>}
    {tree?.enabled && path && path.split('/').length < 3 && <button className="a" onClick={() => void change(true)}>{t('＋ 하위 분류 더하기', '＋ Add child subject')}</button>}
    {parentPath && <p className="kl-subject-path" title={path}>{parentPath}</p>}
    <span className="kh-side-label">{t('개념노트', 'Concept notes')} {node?.count ?? 0}{!filters.showEmpty && t(' · 빈 노트 숨김', ' · empty notes hidden')}</span>
    {!!node?.kids.length && <div>
      <div className="rs-label">{t('하위 분류', 'Child subjects')}</div>
      {node.kids.slice(0, shown).map((child) => <button className="nav side-row" key={child.path} title={child.path}
        onClick={() => showKnowledgeList({ ...filters, subjectPrefix: child.path })}><span className="label">{child.name}</span><span className="n">{child.count}</span></button>)}
      {node.kids.length > shown && <button className="a" onClick={() => setShown((n) => n + 8)}>{t(`${node.kids.length - shown}개 더`, `${node.kids.length - shown} more`)}</button>}
    </div>}
  </div>
}

/** 브라우저 맨 위 층의 메뉴: 화면 끝에서는 위·왼쪽으로 옮기며 페이지를 떠나면 함께 사라진다. */
function ColumnMenu({ layout, hidden, onChange }: { layout: Layout; hidden: ConceptSort[]; onChange(l: Layout): void }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const [drag, setDrag] = useState<ConceptSort | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const menu = pop.current!
    menu.setAttribute('popover', 'auto')
    anchor.current!.setAttribute('popovertarget', menuId)
    const toggle = () => setOpen(menu.matches(':popover-open'))
    menu.addEventListener('toggle', toggle)
    return () => menu.removeEventListener('toggle', toggle)
  }, [menuId])
  const at = usePlace(anchor, pop, open)
  const move = (target: ConceptSort) => {
    if (!drag || drag === target) return
    const order = layout.order.filter((c) => c !== drag)
    order.splice(order.indexOf(target), 0, drag)
    onChange({ ...layout, order })
  }
  return <>
    <button ref={anchor} className={`btn sm${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} data-ui="지식 열 고르기">{t('열 고르기', 'Columns')}</button>
    {createPortal(<div id={menuId} ref={pop} className="menu kl-column-menu" role="menu" aria-label={t('보일 열', 'Visible columns')}
      style={{ top: at?.top ?? 0, left: at?.left ?? 0, visibility: at ? 'visible' : 'hidden' }}>
      <p className="kh-hint">{t('끌어서 열 순서 바꾸기', 'Drag to reorder columns')}</p>
      {layout.order.map((id) => <label key={id} className={`pl-colitem${drag === id ? ' dragging' : ''}`} draggable
        onDragStart={(e) => { setDrag(id); e.dataTransfer.setData('text/plain', id) }} onDragEnd={() => setDrag(null)}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); move(id); setDrag(null) }}>
        <span className="pl-grip" aria-hidden>⋮⋮</span><input type="checkbox" checked={!hidden.includes(id)} disabled={id === 'title'}
          onChange={() => onChange({ ...layout,
            hidden: hidden.includes(id) ? layout.hidden.filter((c) => c !== id) : [...layout.hidden, id],
            shown: hidden.includes(id) ? [...layout.shown.filter((c) => c !== id), id] : layout.shown.filter((c) => c !== id),
          })} />
        <span>{COLUMNS.find((c) => c.id === id)!.label}</span>
      </label>)}
      <button className="a pl-colreset" onClick={() => onChange({ order: COLUMNS.map((c) => c.id), hidden: ['aliases', 'checked'], shown: [] })}>{t('기본값으로 되돌리기', 'Reset to defaults')}</button>
    </div>, document.body)}
  </>
}
