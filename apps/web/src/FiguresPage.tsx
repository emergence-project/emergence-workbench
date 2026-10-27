import { SubjectPicker, useSubjects, LibrarySubjectSide } from './SubjectPicker'
import { subjectsApi, matchesSubject } from './api/subjects'
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { figuresApi, LIBRARY_SCOPE, type FigureList, type FigureRow } from './api'
import { forgetFigures, useFigureList, useFigureListState } from './figureEmbed'
import { FigurePreview } from './FigurePreview'
import { Icon } from './icons'
import { routeOfNote } from './RightSidebar'
import { go } from './router'
import { figureListFilter, rememberFigureList, showFigure } from './figureView'
import { store } from './store'
import { lang, plural, t } from './i18n'

/**
 * 그림 라이브러리 (10/4 19:10 피드백 "반복해서 쓰는 그림을 공용 자산으로").
 * - 공용 shared-library/figures/, 프로젝트 전용 workbench/figures/. 이름과 설명은 그 폴더의 figures.yaml.
 * - 10/6 L2: 첫 화면은 LibraryHome.tsx, 이 파일은 "목록". 표 | 카드(기본), 보기 단추는 머리줄 가운데, 정렬(이름 · 최근 더한 순)은 오른쪽.
 * - 왼쪽 사이드바: 맨 위 "그림 라이브러리"(첫 화면) · "목록 n", 찾기, 공용 · 쓰는 노트 없음, 프로젝트별.
 *   첫 화면 점검 · 통계에서 오는 거르기(원본 종류 · 그림으로 못 바꾼 tikz)는 사이드바에 줄을 두지 않고 머리줄에 이름을 보인다.
 * - 카드·줄을 누르면 그림 보기(#/figures/open/<그림>, 10/15 피드백 "크게 보는 화면" B′): 본문에 크게, 아래에 보던 목록 한 줄, 오른쪽 사이드바에
 *   설명 · 노트에 넣는 글 ![[이름]] · 쓰는 노트 · 원본 고치기 · 파일 경로. ← →로 앞뒤 그림, Esc로 목록.
 * - 더하기: 맨 앞 점선 카드(표는 맨 위 줄)에 tikz · svg · png · pdf 파일을 끌어다 놓는다.
 */

const QUERY = 'rw-figures-query'
let query = ''
const setQuery = (q: string) => { query = q; window.dispatchEvent(new Event(QUERY)) }
function useQuery(): string {
  const [q, setQ] = useState(query)
  useEffect(() => {
    const on = () => setQ(query)
    window.addEventListener(QUERY, on)
    return () => window.removeEventListener(QUERY, on)
  }, [])
  return q
}

/** 거르기: library · unused · tikz · svg · photo · pdf · broken · project:<id>. 없으면 모든 그림.
 *  서버 figures.ts figureBrief(첫 화면 숫자)와 같은 조건이다. side: 사이드바에 줄을 둘지 */
export const FIGURE_FILTERS: { id: string; label: string; ko: string; side: boolean; test(f: FigureRow): boolean }[] = [
  { id: 'library', label: t('공용', 'Shared'), ko: '공용', side: true, test: (f) => f.scope === LIBRARY_SCOPE },
  { id: 'unclassified', label: t('분류 없음', 'No subject'), ko: '분류 없음', side: false, test: (f) => !f.subjects?.length },
  { id: 'unused', label: t('쓰는 노트 없음', 'Not used in notes'), ko: '쓰는 노트 없음', side: true, test: (f) => f.uses.length === 0 },
  { id: 'tikz', label: 'tikz', ko: 'tikz', side: false, test: (f) => f.kind === 'tikz' },
  { id: 'svg', label: 'svg', ko: 'svg', side: false, test: (f) => f.kind === 'svg' },
  { id: 'photo', label: t('사진', 'Photo'), ko: '사진', side: false, test: (f) => f.kind === 'png' || f.kind === 'jpg' },
  { id: 'pdf', label: 'pdf', ko: 'pdf', side: false, test: (f) => f.kind === 'pdf' },
  { id: 'broken', label: t('그림으로 못 바꾼 tikz', 'tikz that failed to render'), ko: '그림으로 못 바꾼 tikz', side: false, test: (f) => !!f.broken },
]
const FILTERS = FIGURE_FILTERS
const filterTest = (id?: string): ((f: FigureRow) => boolean) => {
  if (id?.startsWith('subject:')) return (f) => matchesSubject(f.subjects, id.slice(8))
  if (id?.startsWith('project:')) { const rid = id.slice(8); return (f) => f.scope === rid }
  return FILTERS.find((x) => x.id === id)?.test ?? (() => true)
}

/** 찾기: 이름 · 설명 · 파일 이름 (낱말마다 모두 맞아야) */
export function matchFigure(f: FigureRow, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = [f.name, f.description ?? '', f.file].join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

export const scopeTitle = (data: Pick<FigureList, 'projects'> | null, scope: string) => (scope === LIBRARY_SCOPE ? t('공용', 'Shared') : data?.projects.find((p) => p.id === scope)?.title ?? scope)
const usesLabel = (n: number) => (n ? t(`노트 ${n}개`, plural(n, 'note')) : t('쓰는 노트 없음', 'Not used in notes'))

export function FiguresSide({ filter, list }: { filter?: string; list: boolean }) {
  const data = useFigureList()
  const q = useQuery()
  const figs = data?.figures ?? []
  const nav = (id: string, label: string, n: number, title?: string, ui = label) => (
    <button key={id} className={`nav${filter === id ? ' on' : ''}`} data-ui="그림 거르기" data-ui-item={ui} title={title}
      onClick={() => go({ page: 'figures', filter: id })}>
      <span className="label">{label}</span><span className="meta">{n}</span>
    </button>
  )
  return (
    <div className="set-side fg-side" data-ui="그림 목록 거르기">
      <div className="side-quick" data-ui="빠른 이동">
        <button className={`nav side-row${!list ? ' on' : ''}`} aria-current={!list ? 'page' : undefined} data-ui="그림 라이브러리 줄" title={t('최근 더한 그림 · 점검 · 통계', 'Recently added figures · Checks · Stats')} onClick={() => go({ page: 'figures' })}>
          <span className="q-ico" aria-hidden>{Icon.figures}</span><span className="label">{t('그림 라이브러리', 'Figure library')}</span></button>
        <button className={`nav side-row${list && !filter ? ' on' : ''}`} aria-current={list && !filter ? 'page' : undefined} data-ui="목록 줄" title={t('모든 그림 (카드 · 표)', 'All figures (cards · table)')} onClick={() => go({ page: 'figures', list: true })}>
          <span className="q-ico" aria-hidden>{Icon.list}</span><span className="label">{t('목록', 'List')}</span>{data && <span className="meta">{figs.length}</span>}</button>
      </div>
      <input className="cn-search" value={q} placeholder={t('찾기 — 이름·설명', 'Search name, description')} aria-label={t('그림 찾기', 'Search figures')}
        onChange={(e) => { setQuery(e.target.value); if (!list) go({ page: 'figures', list: true }) }} />
      {FILTERS.filter((f) => f.side).map((f) => nav(f.id, f.label, figs.filter(f.test).length, undefined, f.ko))}
      <LibrarySubjectSide kind="figures" filter={filter} />
      {data && data.projects.length > 0 && <div className="fg-side-head">{t('프로젝트 전용', 'Project only')}</div>}
      {data?.projects.map((p) => nav(`project:${p.id}`, p.title, figs.filter((f) => f.scope === p.id).length, p.id))}
    </div>
  )
}

type View = 'cards' | 'list'
const VIEW_KEY = 'rw-figures-view'
type Order = 'name' | 'recent'
const ORDER_KEY = 'rw-figures-order'

export { figureListFilter, showFigure }
/** 첫 화면 "최근 더한 그림" 제목: 목록을 최근 더한 순으로 */
export function showRecentFigures() { store.set(ORDER_KEY, 'recent'); go({ page: 'figures', list: true }) }

export function FiguresPage({ filter: routeFilter, open, onSaved }: { filter?: string; open?: string; onSaved(m: string): void }) {
  const { tree } = useSubjects()
  const { data, error } = useFigureListState()
  const q = useQuery()
  const [view, setViewState] = useState<View>(() => (store.get<string>(VIEW_KEY, 'cards') === 'list' ? 'list' : 'cards'))
  const setView = (v: View) => { setViewState(v); store.set(VIEW_KEY, v) }
  const [order, setOrderState] = useState<Order>(() => (store.get<string>(ORDER_KEY, 'name') === 'recent' ? 'recent' : 'name'))
  const setOrder = (o: Order) => { setOrderState(o); store.set(ORDER_KEY, o) }
  if (!open) rememberFigureList(routeFilter)
  const filter = open ? figureListFilter() : routeFilter
  const rows = useMemo(() => {
    const r = (data?.figures ?? []).filter(filterTest(filter)).filter((f) => matchFigure(f, q))
    // 이름 순은 서버 순서 그대로 (공용 먼저, 그다음 프로젝트마다 이름 순)
    return order === 'recent' ? [...r].sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name)) : r
  }, [data, filter, q, order])
  const filterLabel = filter?.startsWith('subject:') ? (tree?.items.find((s) => s.id === filter.slice(8))?.name ?? t('분류 없음', 'No subject')) : filter?.startsWith('project:') ? scopeTitle(data, filter.slice(8)) : FILTERS.find((f) => f.id === filter)?.label
  // 더할 곳: 프로젝트를 거르고 있으면 그 프로젝트, 아니면 공용
  const addScope = filter?.startsWith('project:') ? filter.slice(8) : LIBRARY_SCOPE
  const pick = (id: string) => showFigure(id, true)

  if (open) {
    // 보던 목록에 없는 그림(찾기를 바꾼 뒤 등)이면 모든 그림을 줄에 둔다
    const strip = rows.some((f) => f.id === open) ? rows : data?.figures ?? []
    return <FigureView open={open} data={data} error={error} strip={strip} listLabel={filterLabel ?? t('모든 그림', 'All figures')} onSaved={onSaved} />
  }

  return (
    <main className="stage full fg" data-ui="그림">
      <section className="pane">
        {/* 세 구역: 왼쪽 무엇(거르기 · 수) · 가운데 보기 · 오른쪽 정렬 (디자인 시스템 6절) */}
        <div className="pane-head bar3 lib-head" data-ui="머리줄">
          <span className="crumb lib-head-left">{filterLabel ?? t('모든 그림', 'All figures')} · {t(`${rows.length}개`, String(rows.length))}{q ? t(` (찾기 "${q}")`, ` (search "${q}")`) : ''}</span>
          <div className="segmented small lib-head-mid" role="radiogroup" aria-label={t('보기', 'View')} data-ui="보기 전환">
            <button className={view === 'list' ? 'on' : ''} role="radio" aria-checked={view === 'list'} onClick={() => setView('list')}>{t('표', 'Table')}</button>
            <button className={view === 'cards' ? 'on' : ''} role="radio" aria-checked={view === 'cards'} onClick={() => setView('cards')}>{t('카드', 'Cards')}</button>
          </div>
          <div className="lib-head-right">
            <div className="segmented small" role="radiogroup" aria-label={t('정렬', 'Sort')} data-ui="그림 정렬">
              <button className={order === 'name' ? 'on' : ''} role="radio" aria-checked={order === 'name'} onClick={() => setOrder('name')}>{t('이름', 'Name')}</button>
              <button className={order === 'recent' ? 'on' : ''} role="radio" aria-checked={order === 'recent'} onClick={() => setOrder('recent')}>{t('최근 더한 순', 'Recently added')}</button>
            </div>
          </div>
        </div>
        <div className="scroll fg-scroll">
          {!data && (error
            ? <p className="empty fg-empty">{t('그림 목록을 읽지 못했습니다', 'Could not read the figure list')}: {error} <button className="btn sm" onClick={forgetFigures}>{t('다시 읽기', 'Reload')}</button></p>
            : <p className="empty fg-empty">{t('불러오는 중…', 'Loading…')}</p>)}
          {data && !data.library && <div className="banner">{t('공유 라이브러리가 설정되지 않아 프로젝트 전용 그림만 보입니다. 설정 › 공유 라이브러리에서 정해 주세요.', 'No shared library is set, so only project figures show. Set it in Settings › Shared library.')}</div>}
          {data && (view === 'cards'
            ? (
              <div className="fg-cards">
                <AddFigure look="card" scope={addScope} scopeLabel={scopeTitle(data, addScope)} onSaved={onSaved} onAdded={pick} />
                {rows.map((f) => <FigureCard key={f.id} fig={f} scope={scopeTitle(data, f.scope)} onClick={() => pick(f.id)} />)}
              </div>
            )
            : (
              <div className="fg-table" role="table" aria-label={t('그림 목록', 'Figure list')}>
                <div className="fg-tr fg-th" role="row"><span>{t('이름', 'Name')}</span><span>{t('원본', 'Source')}</span><span>{t('어디', 'Where')}</span><span className="num">{t('쓰는 노트', 'Used in')}</span><span>{t('파일', 'File')}</span></div>
                <AddFigure look="row" scope={addScope} scopeLabel={scopeTitle(data, addScope)} onSaved={onSaved} onAdded={pick} />
                {rows.map((f) => (
                  <div key={f.id} role="row" tabIndex={0} className="fg-tr" data-ui="그림 줄" data-ui-item={f.name}
                    onClick={() => pick(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') pick(f.id) }}>
                    <span title={f.name}>{f.name}</span><span>{f.kind}</span><span>{scopeTitle(data, f.scope)}</span><span className="num">{f.uses.length || ''}</span><span className="mono" title={f.path}>{f.file}</span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </section>
    </main>
  )
}

/**
 * 그림 보기 (10/15 B′): 머리줄(보던 목록 › 이름 · 몇째 · 앞뒤), 본문에 크게, 아래에 보던 목록 한 줄, 오른쪽에 그림 정보.
 * ← → 앞뒤 그림, Esc 목록으로 (입력란에 쓰는 중이면 그대로 둔다).
 */
function FigureView({ open, data, error, strip, listLabel, onSaved }: { open: string; data: FigureList | null; error: string | null; strip: FigureRow[]; listLabel: string; onSaved(m: string): void }) {
  const fig = data?.figures.find((f) => f.id === open)
  const at = strip.findIndex((f) => f.id === open)
  const n = strip.length
  const back = () => { const filter = figureListFilter(); go(filter ? { page: 'figures', filter } : { page: 'figures', list: true }) }
  const step = (d: number) => { if (at >= 0 && n > 1) showFigure(strip[(at + d + n) % n]!.id, true) }
  const keys = useRef({ step, back })
  keys.current = { step, back }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if (e.key === 'ArrowLeft') keys.current.step(-1)
      else if (e.key === 'ArrowRight') keys.current.step(1)
      else if (e.key === 'Escape') keys.current.back()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  // 지금 그림을 목록 줄 안에 보이게
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => { stripRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [open, n])
  return (
    <main className="stage full fg with-side fg-open" data-ui="그림 보기">
      <section className="pane fg-view">
        <div className="pane-head" data-ui="머리줄">
          <span className="crumb"><button className="a" onClick={back}>{listLabel}</button> › <b title={fig?.name}>{fig?.name ?? ''}</b></span>
          <span className="sp" />
          {at >= 0 && n > 1 && <>
            <span className="muted fg-count">{at + 1}/{n}</span>
            <button className="icon-btn" data-ui="앞뒤 그림" data-ui-item="이전" data-tip={t('이전 그림 (←)', 'Previous figure (←)')} aria-label={t('이전 그림', 'Previous figure')} onClick={() => step(-1)}>{Icon.back}</button>
            <button className="icon-btn" data-ui="앞뒤 그림" data-ui-item="다음" data-tip={t('다음 그림 (→)', 'Next figure (→)')} aria-label={t('다음 그림', 'Next figure')} onClick={() => step(1)}>{Icon.forward}</button>
          </>}
        </div>
        <div className="fg-view-stage" data-ui="그림 크게">
          {fig ? <FigurePreview key={fig.id} fig={fig} big className="fg-view-pv" />
            : <p className="empty fg-empty">{!data ? (error ? `${t('그림 목록을 읽지 못했습니다', 'Could not read the figure list')}: ${error}` : t('불러오는 중…', 'Loading…')) : t('이 그림이 없습니다. 지웠거나 이름을 바꿨을 수 있습니다.', 'This figure is not here. It may have been deleted or renamed.')}</p>}
        </div>
        {n > 1 && (
          <div ref={stripRef} className="fg-strip" data-ui="그림 보기 목록" role="list" aria-label={listLabel}>
            {strip.map((f) => (
              <button key={f.id} role="listitem" className={`fg-thumb${f.id === open ? ' on' : ''}`} aria-current={f.id === open ? 'true' : undefined} title={f.name} aria-label={f.name}
                data-ui="그림 카드" data-ui-item={f.name} onClick={() => showFigure(f.id, true)}>
                <FigurePreview fig={f} />
              </button>
            ))}
          </div>
        )}
      </section>
      {fig && data && <FigureSide fig={fig} data={data} onClose={back} onSaved={onSaved} />}
    </main>
  )
}

/** 그림 카드 (목록의 카드 보기와 첫 화면 "최근 더한 그림"이 함께 쓴다) */
export function FigureCard({ fig: f, scope, on, onClick, compact = false }: { fig: FigureRow; scope: string; on?: boolean; onClick(): void; compact?: boolean }) {
  if (compact) return (
    <button className={`fg-card card-link lh-card${on ? ' on' : ''}`} data-ui="그림 카드" data-ui-item={f.name} onClick={onClick}>
      <FigurePreview fig={f} />
      <span className="lh-card-text">
        <span className="lh-card-title" title={f.name}>{f.name}</span>
        <span className="lh-card-meta" title={`${f.kind} · ${scope} · ${t('노트', 'Notes')} ${f.uses.length}`}>{f.kind} · {scope} · {t('노트', 'Notes')} {f.uses.length}</span>
      </span>
    </button>
  )
  return (
    <button className={`fg-card card-link${on ? ' on' : ''}`} data-ui="그림 카드" data-ui-item={f.name} onClick={onClick}>
      <FigurePreview fig={f} />
      <span className="fg-card-name">{f.name}</span>
      <span className="fg-card-meta"><span className="fg-kind mono">{f.kind}</span><span className="fg-card-scope">{scope}</span></span>
      <span className="fg-card-meta">{usesLabel(f.uses.length)}</span>
    </button>
  )
}

/** 더하기: 파일을 끌어다 놓거나 골라서 */
export function AddFigure({ look, scope, scopeLabel, onSaved, onAdded, compact = false }: { look: 'card' | 'row'; scope: string; scopeLabel: string; onSaved(m: string): void; onAdded(id: string): void; compact?: boolean }) {
  const [hover, setHover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const add = async (files: File[]) => {
    if (!files.length) return
    setBusy(true); setErr('')
    const added: string[] = []
    for (const f of files) {
      try { added.push((await figuresApi.upload(f, scope)).id) } catch (e) { setErr(`${f.name}: ${(e as Error).message}`) }
    }
    setBusy(false)
    if (added.length) { forgetFigures(); onAdded(added[added.length - 1]!); onSaved(t(`그림 ${added.length}개를 더했습니다 (${scopeLabel})`, `Added ${plural(added.length, 'figure')} (${scopeLabel})`)) }
  }
  const drop = {
    onDragOver: (e: ReactDragEvent) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setHover(true) } },
    onDragLeave: () => setHover(false),
    onDrop: (e: ReactDragEvent) => { e.preventDefault(); setHover(false); void add([...e.dataTransfer.files]) },
  }
  return (
    <div className={`fg-add add-card ${look}${compact && look === 'card' ? ' lh-add' : ''}${hover ? ' hover' : ''}`} data-ui="그림 더하기" {...drop}>
      <button className="fg-add-btn" disabled={busy} onClick={() => input.current?.click()}>
        <span>＋ {t('그림 더하기', 'Add figure')}</span>
        <span className="muted">{busy ? t('올리는 중…', 'Uploading…') : t(`tikz · svg · png · pdf 끌어다 놓기 · ${scopeLabel}에 둠`, `Drop tikz · svg · png · pdf · goes to ${scopeLabel}`)}</span>
      </button>
      <input ref={input} type="file" hidden multiple accept=".tikz,.tex,.svg,.png,.jpg,.jpeg,.pdf" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = '' }} />
      {err && <span className="fg-add-err">{err}</span>}
    </div>
  )
}

/** 그림 보기의 오른쪽 사이드바: 고른 그림의 정보 (그림은 본문에 크게 있으니 여기서는 뺀다) */
function FigureSide({ fig, data, onClose, onSaved }: { fig: FigureRow; data: FigureList; onClose(): void; onSaved(m: string): void }) {
  const { tree } = useSubjects()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(fig.name)
  const [desc, setDesc] = useState(fig.description ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setEditing(false); setName(fig.name); setDesc(fig.description ?? '') }, [fig.id, fig.name, fig.description])
  const embed = `![[${fig.name}]]`
  const save = async () => {
    setBusy(true)
    try { await figuresApi.setMeta(fig.id, { name, description: desc }); forgetFigures(); setEditing(false) } catch (e) { onSaved(`${t('고치지 못했습니다', 'Could not save')}: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const run = (f: () => Promise<unknown>) => { void f().catch((e: Error) => onSaved(e.message)) }
  const usageRow = (u: FigureRow['uses'][number]): ReactNode => (u.rid && u.type !== 'concept'
    ? <button className="a fg-use" onClick={() => go(routeOfNote(u.rid!, { ...u, type: u.type as 'note' | 'calc' }))}>{u.title}<span className="muted"> · {scopeTitle(data, u.rid)}</span></button>
    : <span className="fg-use">{u.title}<span className="muted"> · {t('개념노트', 'Concept note')}</span></span>)
  return (
    <aside className="pane fg-rs" data-ui="그림 정보" aria-label={t('고른 그림', 'Selected figure')}>
      <div className="rs-head"><span className="rs-label">{t('그림', 'Figure')}</span><span className="sp" /><button className="icon-btn" aria-label={t('닫기', 'Close')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      <div className="rs-scroll rs-pad fg-rs-body">
        {!editing ? (
          <div className="fg-rs-about">
            <div className="hover-actions"><button className="icon-btn" aria-label={t('이름과 설명 고치기', 'Edit name and description')} data-tip={t('고치기', 'Edit')} onClick={() => setEditing(true)}>{Icon.pencil}</button></div>
            <h3 className="fg-rs-title">{fig.name}</h3>
            <p className="fg-rs-sub"><span className="fg-kind mono">{fig.kind}</span>{scopeTitle(data, fig.scope)}</p>
            {fig.description ? <p className="fg-rs-desc">{fig.description}</p> : <p className="muted">{t('설명 없음', 'No description')}</p>}
          </div>
        ) : (
          <div className="fg-rs-edit">
            <label className="rs-label" htmlFor="fg-name">{t('이름', 'Name')}</label>
            <input id="fg-name" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
            <label className="rs-label" htmlFor="fg-desc">{t('설명', 'Description')}</label>
            <textarea id="fg-desc" rows={3} value={desc} disabled={busy} onChange={(e) => setDesc(e.target.value)} />
            <p className="muted">{t('이름을 바꾸면 노트의 ![[예전 이름]]은 파일 이름으로만 이어집니다.', 'After a rename, ![[old name]] in notes still links only by file name.')}</p>
            <div className="fg-rs-row">
              <button className="btn sm primary" disabled={busy || !name.trim()} onClick={() => void save()}>{t('저장', 'Save')}</button>
              <button className="btn sm ghost" disabled={busy} onClick={() => setEditing(false)}>{t('취소', 'Cancel')}</button>
            </div>
          </div>
        )}
        {tree?.enabled && <div className="rs-field"><div className="rs-label">{t('분류', 'Subject')}</div><SubjectPicker key={fig.id} tree={tree} value={fig.subjects ?? []} onChange={async (ids) => {
          try { await subjectsApi.figure(fig.id, ids, fig.subjectsHash!); onSaved(t('분류를 고쳤습니다', 'Subjects updated')) } finally { forgetFigures() }
        }} /></div>}
        <div className="rs-field">
          <div className="rs-label">{t('노트에 넣는 글', 'Embed in a note')}</div>
          <div className="fg-embed">
            <code className="mono">{embed}</code>
            <button className="btn sm" onClick={() => run(() => navigator.clipboard.writeText(embed).then(() => onSaved(`${t('복사했습니다', 'Copied')}: ${embed}`)))}>{t('복사', 'Copy')}</button>
          </div>
        </div>
        <div className="rs-field">
          <div className="rs-label">{t('쓰는 노트', 'Used in')} · {fig.uses.length}</div>
          {fig.uses.length ? <ul className="fg-uses">{fig.uses.map((u) => <li key={`${u.rid ?? ''}/${u.file}`}>{usageRow(u)}</li>)}</ul> : <p className="muted">{lang === 'ko' ? <>아직 어느 노트도 ![[{fig.name}]]로 쓰지 않습니다.</> : <>No note uses ![[{fig.name}]] yet.</>}</p>}
        </div>
        <div className="fg-rs-row">
          <button className="btn" onClick={() => run(() => figuresApi.open(fig.id))}>{t('원본 고치기', 'Edit source')}</button>
          <button className="a" onClick={() => run(() => figuresApi.open(fig.id, true))}>{t('Finder에서 보기', 'Show in Finder')}</button>
        </div>
        <div className="rs-field fg-rs-path"><div className="muted mono" title={fig.path}>{fig.path.split('/').filter(Boolean).pop() || fig.path}</div></div>
      </div>
    </aside>
  )
}
