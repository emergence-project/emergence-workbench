import { SubjectPicker, useSubjects, LibrarySubjectSide } from './SubjectPicker'
import { subjectsApi, matchesSubject } from './api/subjects'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { papersApi, type ArxivCandidate, type PaperList, type PaperRow } from './api'
import { useRecordComposerRequest } from './RecordContext'
import { CommentablePdf, CommentsPanel, LIBRARY, libraryPaperTarget, OPEN_CONTEXT } from './Comments'
import { Icon } from './icons'
import { go } from './router'
import { store } from './store'
import { tableHiddenColumns } from './tableColumns'
import { t } from './i18n'
import { loadPdfjs } from './pdfjs'
import { localDate } from '@rw/core'

/**
 * 논문 라이브러리 (10/6 L2: 첫 화면은 LibraryHome.tsx, 이 파일은 "목록").
 * - 목록(표) | 카드. 보기 단추는 머리줄 가운데(디자인 시스템 6절 세 구역). 표의 모든 칸은 한 줄, 머리를 누르면 정렬(한 번 더 누르면 거꾸로), 경계를 끌면 폭.
 *   열은 정해 둔다: 제목 · 저자 · 연도 · 분류 · 태그 · 프로젝트 · PDF (10/31 시안 1절, 열 고르기 뺌). 분류 머리는 누를 때마다 맨 앞에 올 분류를 돌린다.
 * - 찾기는 본문 맨 위 가운데. 머리줄 왼쪽 「보기」 상자: 모두 · 프로젝트에 안 묶임 · 코멘트 있음 · 답 기다리는 질문 (사이드바에서 고른 것 안에서 거름).
 * - 왼쪽 사이드바: 맨 위 "논문 라이브러리"(첫 화면) · "전체 문헌 n"과 그 아래 들인 논문 · 책, 분류, 접어 둔 프로젝트.
 *   첫 화면 통계 · 점검에서 오는 거르기(PDF 없음 · arXiv로 받을 수 있음 · 답이 온 질문)는 사이드바에 줄을 두지 않고 머리줄에 이름을 보인다.
 * - 오른쪽 사이드바: 고른 논문의 정보. 닫힌 채로 시작하고 논문을 고르면 열린다.
 * - 더하기: 표 맨 위 점선 줄(카드 보기는 맨 앞 점선 카드, 새로 더한 것이 가장 최근이라는 뜻)에 arXiv 번호 · DOI를 적거나 PDF를 끌어다 놓는다.
 */

/** 목록이 바뀌면 사이드바와 본문이 함께 다시 읽는다 */
export const PAPERS_CHANGED = 'rw-papers-changed'
const CHANGED = PAPERS_CHANGED
const announce = () => window.dispatchEvent(new Event(CHANGED))
/** 찾기 글 (목록 맨 위 칸): 목록을 다시 열어도 남는다 */
const QUERY = 'rw-papers-query'
let query = ''
const setQuery = (q: string) => { query = q; window.dispatchEvent(new Event(QUERY)) }

function usePapers(): [PaperList | null, string] {
  const [data, setData] = useState<PaperList | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const load = () => papersApi.list().then((v) => { if (live) { setData(v); setError('') } }).catch((e: Error) => { if (live) setError(e.message) })
    void load()
    window.addEventListener(CHANGED, load)
    return () => { live = false; window.removeEventListener(CHANGED, load) }
  }, [])
  return [data, error]
}

function useQuery(): string {
  const [q, setQ] = useState(query)
  useEffect(() => {
    const on = () => setQ(query)
    window.addEventListener(QUERY, on)
    return () => window.removeEventListener(QUERY, on)
  }, [])
  return q
}

/** 거르기: paper · book · comments · waiting · none · nopdf · arxiv · answered · project:<id>. 없으면 모든 논문.
 *  서버 papers.ts paperBrief(첫 화면 숫자)와 같은 조건이다. side: 사이드바에 줄을 둘지 */
export type PaperFilter = string
export const PAPER_FILTERS: { id: PaperFilter; label: string; ko: string; side: boolean; test(p: PaperRow): boolean }[] = [
  { id: 'unclassified', label: t('분류 없음', 'No subject'), ko: '분류 없음', side: false, test: (p) => !p.subjects?.length },
  { id: 'paper', label: t('논문', 'Papers'), ko: '논문', side: true, test: (p) => p.kind === 'paper' },
  { id: 'book', label: t('책', 'Books'), ko: '책', side: true, test: (p) => p.kind === 'book' },
  { id: 'comments', label: t('코멘트 있음', 'With comments'), ko: '코멘트 있는 논문', side: false, test: (p) => p.comments > 0 },
  { id: 'waiting', label: t('답 기다리는 질문', 'Questions awaiting answers'), ko: '답 기다리는 질문', side: false, test: (p) => p.waiting > 0 },
  { id: 'none', label: t('프로젝트에 안 묶임', 'Not in a project'), ko: '프로젝트에 안 묶임', side: false, test: (p) => p.projects.length === 0 },
  { id: 'nopdf', label: t('PDF 없음', 'No PDF'), ko: 'PDF 없음', side: false, test: (p) => p.pdf.where === 'none' },
  { id: 'arxiv', label: t('arXiv로 받을 수 있음', 'Available on arXiv'), ko: 'arXiv로 받을 수 있음', side: false, test: (p) => p.pdf.where === 'none' && !!p.eprint },
  { id: 'answered', label: t('답이 온 질문', 'Answered questions'), ko: '답이 온 질문', side: false, test: (p) => p.answered > 0 },
]
const FILTERS = PAPER_FILTERS
/** 목록 머리줄 「보기」 상자의 거르기 (사이드바에서 고른 것 안에서 한 번 더 거른다, 10/31 시안 1절) */
const SHOWS = ['none', 'comments', 'waiting'] as const
type Show = (typeof SHOWS)[number] | 'all'
const isShow = (f: string | undefined): f is (typeof SHOWS)[number] => SHOWS.some((x) => x === f)
const filterTest = (f: PaperFilter | undefined): ((p: PaperRow) => boolean) => {
  if (f?.startsWith('subject:')) return (p) => matchesSubject(p.subjects, f.slice(8))
  if (f?.startsWith('project:')) { const id = f.slice(8); return (p) => p.projects.includes(id) }
  return FILTERS.find((x) => x.id === f)?.test ?? (() => true)
}

/** 찾기: 제목 · 저자 · 저널 · bib 키 · arXiv 번호 (낱말마다 모두 맞아야) */
export function matchPaper(p: PaperRow, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [p.title, p.authors.join(' '), p.venue ?? '', p.key, p.eprint ?? '', p.year ?? ''].join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function PapersSide({ filter, list }: { filter?: PaperFilter; list: boolean }) {
  const [data] = usePapers()
  const papers = data?.papers ?? []
  const nav = (id: PaperFilter, label: ReactNode, n: number, title?: string, ui?: string, cls = '') => (
    <button key={id} className={`nav${cls}${filter === id ? ' on' : ''}`} data-ui="논문 거르기" data-ui-item={ui ?? (typeof label === 'string' ? label : id)} title={title}
      onClick={() => go({ page: 'shelf', filter: id })}>
      <span className="label">{label}</span><span className="meta">{n}</span>
    </button>
  )
  const all = list && (!filter || isShow(filter))
  const inProject = !!filter?.startsWith('project:')
  return (
    <div className="set-side pl-side" data-ui="논문 목록 거르기">
      <div className="side-quick" data-ui="빠른 이동">
        <button className={`nav side-row${!list ? ' on' : ''}`} aria-current={!list ? 'page' : undefined} data-ui="논문 라이브러리 줄" title={t('최근 더한 논문 · 점검 · 통계', 'Recently added papers · checks · stats')} onClick={() => go({ page: 'shelf' })}>
          <span className="q-ico" aria-hidden>{Icon.papers}</span><span className="label">{t('논문 라이브러리', 'Paper library')}</span></button>
        <button className={`nav side-row${all ? ' on' : ''}`} aria-current={all ? 'page' : undefined} data-ui="목록 줄" title={t('논문과 책 모두 (표 · 카드)', 'All papers and books (table · cards)')} onClick={() => go({ page: 'shelf', list: true })}>
          <span className="q-ico" aria-hidden>{Icon.list}</span><span className="label">{t('전체 문헌', 'All literature')}</span>{data && <span className="meta">{papers.length}</span>}</button>
        {/* 논문 · 책은 전체 문헌의 하위: 프로젝트 목차의 현황 · 변경사항처럼 들이고 왼쪽 선 (10/31 시안 1절) */}
        <div className="tree-notes side-sub">
          {FILTERS.filter((f) => f.side).map((f) => nav(f.id, f.label, papers.filter(f.test).length, undefined, f.ko, ' tree-note'))}
        </div>
      </div>
      <LibrarySubjectSide kind="papers" filter={filter} />
      {data && data.projects.length > 0 && (
        <details className="side-grp pl-side-projects" data-ui="논문 프로젝트" open={inProject || undefined}>
          <summary><span className="chev" aria-hidden>›</span><span className="label">{t('프로젝트', 'Projects')}</span><span className="n">{data.projects.length}</span></summary>
          <div className="side-grp-body">{data.projects.map((p) => nav(`project:${p.id}`, p.title, papers.filter((x) => x.projects.includes(p.id)).length, p.id))}</div>
        </details>
      )}
    </div>
  )
}

// ---------- 열 ----------

type ColId = 'title' | 'authors' | 'year' | 'subjects' | 'tags' | 'venue' | 'arxiv' | 'projects' | 'pdf' | 'comments' | 'opened' | 'added' | 'kind' | 'key'
interface Col { id: ColId; label: string; value(p: PaperRow, ctx: Ctx): string; sort(p: PaperRow, ctx: Ctx): string | number; cell?(p: PaperRow, ctx: Ctx): ReactNode; num?: boolean }
interface Ctx { projectTitle(id: string): string; subjectName(id: string): string }

const WHERE_LABEL = { local: t('이 맥', 'This Mac'), cloud: t('클라우드', 'Cloud'), none: t('없음', 'None') } as const
const CARD_WHERE = { local: '', cloud: t('클라우드', 'Cloud'), none: t('PDF 없음', 'No PDF') } as const
const fmtDate = (ms?: number) => {
  if (!ms) return ''
  return localDate(new Date(ms))
}
const authorLine = (a: string[]) => (a.length > 3 ? t(`${a.slice(0, 3).join(', ')} 외 ${a.length - 3}`, `${a.slice(0, 3).join(', ')} +${a.length - 3}`) : a.join(', '))

const COLS: Col[] = [
  { id: 'title', label: t('제목', 'Title'), value: (p) => p.title, sort: (p) => p.title.toLowerCase() },
  { id: 'authors', label: t('저자', 'Authors'), value: (p) => p.authors.join(', '), cell: (p) => authorLine(p.authors), sort: (p) => (p.authors[0] ?? '').toLowerCase() },
  { id: 'year', label: t('연도', 'Year'), value: (p) => p.year ?? '', sort: (p) => Number(p.year) || 0, num: true },
  { id: 'subjects', label: t('분류', 'Subject'), value: (p, c) => (p.subjects ?? []).map(c.subjectName).join(', '), sort: (p, c) => (p.subjects ?? []).map(c.subjectName).join(', ').toLowerCase() },
  { id: 'tags', label: t('태그', 'Tags'), value: (p) => (p.tags ?? []).map((x) => x.title).join(', '), sort: (p) => (p.tags?.[0]?.title ?? '').toLowerCase() },
  { id: 'venue', label: t('저널·출판사', 'Journal/publisher'), value: (p) => p.venue ?? '', sort: (p) => (p.venue ?? '').toLowerCase() },
  { id: 'arxiv', label: 'arXiv', value: (p) => p.eprint ?? '', sort: (p) => p.eprint ?? '' },
  { id: 'projects', label: t('프로젝트', 'Projects'), value: (p, c) => p.projects.map(c.projectTitle).join(', '), sort: (p, c) => p.projects.map(c.projectTitle).join(', ').toLowerCase() },
  { id: 'pdf', label: 'PDF', value: (p) => WHERE_LABEL[p.pdf.where], sort: (p) => ['local', 'cloud', 'none'].indexOf(p.pdf.where) },
  { id: 'comments', label: t('코멘트', 'Comments'), value: (p) => (p.comments ? String(p.comments) : ''), sort: (p) => p.comments, num: true,
    cell: (p) => (p.comments ? <>{p.comments}{p.waiting > 0 && <span className="pl-wait" title={t(`답 기다리는 질문 ${p.waiting}`, `Questions awaiting answers: ${p.waiting}`)}>{t(' · 대기 ', ' · waiting ')}{p.waiting}</span>}</> : '') },
  { id: 'opened', label: t('최근 연 날', 'Last opened'), value: (p) => fmtDate(p.opened), sort: (p) => p.opened ?? 0, num: true },
  // references.bib에서 몇 번째인지 (앱은 새 논문을 끝에 덧붙이므로 큰 수가 최근에 더한 것). 첫 화면 "최근 더한 논문"이 이 열로 정렬해 연다
  { id: 'added', label: t('더한 순서', 'Added order'), value: (p) => String(p.added + 1), sort: (p) => p.added + 1, num: true },
  { id: 'kind', label: t('종류', 'Kind'), value: (p) => (p.kind === 'book' ? t('책', 'Book') : t('논문', 'Paper')), sort: (p) => p.kind },
  { id: 'key', label: t('bib 키', 'bib key'), value: (p) => p.key, sort: (p) => p.key.toLowerCase() },
]
const colOf = (id: string) => COLS.find((c) => c.id === id)
/** 표의 열은 정해 둔다 (10/31 시안 1절). 좁으면 태그 → 분류 → 프로젝트 순으로 숨긴다. 나머지 열은 정렬에만 쓴다(카드 정렬 · 최근 더한 순) */
const TABLE: ColId[] = ['title', 'authors', 'year', 'subjects', 'tags', 'projects', 'pdf']
const COMPACT: ColId[][] = [['tags'], ['subjects'], ['projects']]

/** 사용자가 끌어 정한 열 폭만 기억한다 */
type Widths = Partial<Record<ColId, number>>
const LAYOUT_KEY = 'rw-papers-columns'
/** 저장된 폭을 믿지 않고 아는 열의 알맞은 값만 남긴다 (예전 배치 { width }도 읽는다) */
export function readWidths(raw: unknown): Widths {
  const r = raw && typeof raw === 'object' ? (raw as { width?: unknown }).width : undefined
  const width: Widths = {}
  if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) { const c = colOf(k); if (c && typeof v === 'number' && v >= 40 && v <= 1200) width[c.id] = v }
  return width
}

const columnWidth = (id: ColId, widths: Widths) => {
  const width = `var(--pl-w-${id}, ${widths[id] == null ? `var(--pl-col-${id})` : `${widths[id]}px`})`
  return id === 'title' ? `max(var(--pl-col-title), ${width})` : width
}

/** lead: 분류 열로 정렬할 때 맨 앞에 올 분류 (머리를 누를 때마다 다음 분류로) */
type Sort = { col: ColId; dir: 1 | -1; lead?: string }
const CARD_SORTS: [ColId, string, 1 | -1][] = [['added', t('최근 더한 순', 'Recently added'), -1], ['opened', t('최근 열어 본 순', 'Recently opened'), -1], ['year', t('연도', 'Year'), -1], ['title', t('제목', 'Title'), 1]]
const SORT_KEY = 'rw-papers-sort'
const VIEW_KEY = 'rw-papers-view'
type View = 'list' | 'cards'

/** 첫 화면에서 목록으로: 고른 논문을 오른쪽 칸에 연 채로 (목록이 처음 그릴 때 한 번 가져간다) */
let pendingPick: string | null = null
export function showPaper(key: string) { pendingPick = key; go({ page: 'shelf', list: true }) }
/** 첫 화면 "최근 더한 논문" 제목: 목록을 더한 순서(최근 것부터)로. 표에서는 그 열을 보이게 한다 */
export function showRecentPapers() {
  store.set(SORT_KEY, { col: 'added', dir: -1 })
  go({ page: 'shelf', list: true })
}

export function sortPapers(papers: PaperRow[], sort: Sort, ctx: Ctx): PaperRow[] {
  const col = colOf(sort.col) ?? COLS[0]!
  const lead = sort.col === 'subjects' && sort.lead ? sort.lead : null
  return [...papers].sort((a, b) => {
    if (lead) { const la = matchesSubject(a.subjects, lead), lb = matchesSubject(b.subjects, lead); if (la !== lb) return la ? -1 : 1 }
    const x = col.sort(a, ctx), y = col.sort(b, ctx)
    // 빈 값은 방향과 관계없이 맨 아래로
    const ex = x === '' || x === 0, ey = y === '' || y === 0
    if (ex !== ey) return ex ? 1 : -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return c * sort.dir || a.title.localeCompare(b.title)
  })
}

// ---------- 화면 ----------

export function PapersPage({ filter: routeFilter, open, onSaved }: { filter?: PaperFilter; open?: string; onSaved(m: string): void }) {
  const { tree } = useSubjects()
  const [data, error] = usePapers()
  const q = useQuery()
  const [view, setViewState] = useState<View>(() => (store.get<string>(VIEW_KEY, 'list') === 'cards' ? 'cards' : 'list'))
  const setView = (v: View) => { setViewState(v); store.set(VIEW_KEY, v) }
  const [widths, setWidthsState] = useState<Widths>(() => readWidths(store.get(LAYOUT_KEY, null)))
  const setWidths = (w: Widths) => { setWidthsState(w); store.set(LAYOUT_KEY, { width: w }) }
  const [sort, setSortState] = useState<Sort>(() => { const s = store.get<Sort | null>(SORT_KEY, null); return s && colOf(s.col) && (s.dir === 1 || s.dir === -1) ? s : { col: 'year', dir: -1 } })
  const setSort = (s: Sort) => { setSortState(s); store.set(SORT_KEY, s) }
  // 첫 화면 통계에서 온 안 묶임 · 코멘트 · 질문은 「보기」 상자의 값으로 연다 (사이드바는 전체 문헌)
  const filter = isShow(routeFilter) ? undefined : routeFilter
  const [show, setShowState] = useState<Show>(isShow(routeFilter) ? routeFilter : 'all')
  useEffect(() => { if (isShow(routeFilter)) setShowState(routeFilter) }, [routeFilter])
  const setShow = (v: Show) => { setShowState(v); if (isShow(routeFilter)) go({ page: 'shelf', list: true }) }
  const [picked, setPicked] = useState<string | null>(() => { const k = pendingPick; pendingPick = null; return k })
  const scroll = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState<number | null>(null)
  const subjects = !!tree?.enabled
  const order = TABLE.filter((c) => subjects || c !== 'subjects')
  const hidden = available === null ? [] : tableHiddenColumns({ order, hidden: [], shown: [] }, available, (id) => widths[id] ?? (scroll.current ? parseFloat(getComputedStyle(scroll.current).getPropertyValue(`--pl-col-${id}`)) : 0), COMPACT)

  const ctx: Ctx = useMemo(() => {
    const titles = new Map((data?.projects ?? []).map((p) => [p.id, p.title]))
    const names = new Map((tree?.items ?? []).map((x) => [x.id, x.name]))
    return { projectTitle: (id) => titles.get(id) ?? id, subjectName: (id) => names.get(id) ?? id }
  }, [data, tree])
  const showTest = show === 'all' ? () => true : filterTest(show)
  const rows = useMemo(() => sortPapers((data?.papers ?? []).filter(filterTest(filter)).filter(showTest).filter((p) => matchPaper(p, q)), sort, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showTest는 show로 정해진다
    [data, filter, show, q, sort, ctx])
  /** 분류 머리를 누를 때 차례로 맨 앞에 올 분류: 맨 위 분류 가운데 이 라이브러리에 논문이 있는 것, 많은 것부터 */
  const leads = (tree?.items ?? []).filter((x) => x.parent === null && x.papers > 0).sort((a, b) => b.papers - a.papers).map((x) => x.id)
  const paper = data?.papers.find((p) => p.key === picked)
  const opened = open ? data?.papers.find((p) => p.key === open) : undefined
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    const measure = () => { if (el.clientWidth) setAvailable(el.clientWidth) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 정보 창이 열렸는지만 본다
  }, [view, !!opened])
  // 정보 창이 열리면 카드 열 수가 줄어 고른 논문이 화면 밖으로 밀린다: 창이 열린 뒤 고른 것을 보이게 한다
  useEffect(() => {
    if (!picked) return
    const frame = requestAnimationFrame(() => scroll.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 정보 창이 열렸는지만 본다
  }, [picked, !!paper])
  if (open && opened) return <PaperOpen paper={opened} data={data!} ctx={ctx} onSaved={onSaved} />
  const filterLabel = filter?.startsWith('subject:') ? ctx.subjectName(filter.slice(8)) : filter?.startsWith('project:') ? ctx.projectTitle(filter.slice(8)) : FILTERS.find((f) => f.id === filter)?.label
  // 표에 없는 열로 정렬하면(첫 화면 "최근 더한 논문") 무엇으로 정렬했는지 머리줄에 적는다
  const sortNote = view === 'list' && !order.includes(sort.col) ? colOf(sort.col)?.label : undefined

  return (
    <main className={`stage full pl${paper ? ' with-side' : ''}`} data-ui="논문">
      <section className="pane">
        {/* 찾기는 본문 맨 위 가운데 (10/31 시안 1절, 사이드바의 찾기를 옮김) */}
        <div className="pl-find" data-ui="논문 찾기">
          <input className="cn-search" type="search" value={q} placeholder={t('찾기 — 제목 · 저자 · 저널 · arXiv', 'Search title, author, journal, arXiv')} aria-label={t('논문 찾기', 'Search papers')} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {/* 세 구역: 왼쪽 무엇(거르기 · 수 · 보기) · 가운데 표 · 카드 · 오른쪽 카드 정렬 (디자인 시스템 6절) */}
        <div className="pane-head bar3 lib-head" data-ui="머리줄">
          <span className="lib-head-left pl-head-left">
            <span className="crumb">{filterLabel ?? t('전체 문헌', 'All literature')} · {t(`${rows.length}편`, `${rows.length}`)}{sortNote ? ` · ${sortNote} ${sort.dir === 1 ? '↑' : '↓'}` : ''}</span>
            <select className="rs-select pl-show" data-ui="논문 보기" aria-label={t('보기', 'Show')} value={show} onChange={(e) => setShow(e.target.value === 'all' ? 'all' : SHOWS.find((x) => x === e.target.value) ?? 'all')}>
              <option value="all">{t('보기: 모두', 'Show: all')}</option>
              {SHOWS.map((id) => { const f = FILTERS.find((x) => x.id === id)!; return <option key={id} value={id}>{f.label} {(data?.papers ?? []).filter(filterTest(filter)).filter(f.test).length}</option> })}
            </select>
          </span>
          <div className="segmented small lib-head-mid" role="radiogroup" aria-label={t('보기', 'View')} data-ui="보기 전환">
            <button className={view === 'list' ? 'on' : ''} role="radio" aria-checked={view === 'list'} onClick={() => setView('list')}>{t('표', 'Table')}</button>
            <button className={view === 'cards' ? 'on' : ''} role="radio" aria-checked={view === 'cards'} onClick={() => setView('cards')}>{t('카드', 'Cards')}</button>
          </div>
          <div className="lib-head-right">
            {view === 'cards' && (
              <label className="pl-pick" data-ui="카드 정렬">{t('정렬', 'Sort')}<select className="mini-select" value={sort.col} onChange={(e) => { const s = CARD_SORTS.find(([col]) => col === e.target.value); if (s) setSort({ col: s[0], dir: s[2] }) }}>
                  {CARD_SORTS.some(([col]) => col === sort.col) ? null : <option value={sort.col}>{colOf(sort.col)?.label}</option>}
                  {CARD_SORTS.map(([col, label]) => <option key={col} value={col}>{label}</option>)}
                </select></label>
            )}
          </div>
        </div>
        <div className="scroll pl-scroll" ref={scroll}>
          {error && <div className="banner danger">{t('논문 목록을 읽지 못했습니다: ', 'Could not read the paper list: ')}{error}</div>}
          {data && !data.library && <p className="empty pl-empty">{t('공유 라이브러리가 설정되지 않았습니다. 설정 › 공유 라이브러리에서 정해 주세요.', 'The shared library is not set. Set it in Settings › Shared library.')}</p>}
          {data && data.library && data.folders.length === 0 && (
            <div className="banner">{t('PDF 폴더가 아직 없습니다. ', 'No PDF folder yet. Set an iCloud or Google Drive folder in ')}<button className="a" onClick={() => go({ page: 'settings', part: 'papers' })}>{t('설정 › 논문 PDF 폴더', 'Settings › Paper PDF folder')}</button>{t('에서 iCloud나 Google Drive 폴더를 정하면 PDF를 찾고 받아 둡니다.', ' and PDFs will be found and downloaded there.')}</div>
          )}
          {!data && !error && <p className="empty pl-empty">{t('불러오는 중…', 'Loading…')}</p>}
          {data?.library && (view === 'list'
            ? <PaperTable rows={rows} cols={order.filter((c) => !hidden.includes(c)).map((c) => colOf(c)!)} widths={widths} onWidths={setWidths} sort={sort} onSort={setSort} leads={leads} ctx={ctx} picked={picked} onPick={setPicked} onSaved={onSaved} />
            : <PaperCards rows={rows} ctx={ctx} picked={picked} onPick={setPicked} onSaved={onSaved} />)}
        </div>
      </section>
      {paper && data && <PaperSide paper={paper} projects={data.projects} ctx={ctx} onClose={() => setPicked(null)} onSaved={onSaved} />}
    </main>
  )
}

/** 논문 하나 열기: 가운데 PDF, 오른쪽에 정보 | 코멘트 (3단계) */
const openPdf = (p: PaperRow) => { if (p.pdf.where !== 'none') go({ page: 'shelf', open: p.key }) }

function PaperTable({ rows, cols, widths, onWidths, sort, onSort, leads, ctx, picked, onPick, onSaved }: {
  rows: PaperRow[]; cols: Col[]; widths: Widths; onWidths(w: Widths): void; sort: Sort; onSort(s: Sort): void; leads: string[]; ctx: Ctx
  picked: string | null; onPick(k: string | null): void; onSaved(m: string): void
}) {
  const table = useRef<HTMLDivElement>(null)
  const cellStyle = (c: Col): CSSProperties => c.id === 'title'
    ? { flex: `var(--pl-title-grow, ${widths.title == null ? 1 : 0}) 0 ${columnWidth(c.id, widths)}` }
    : { width: columnWidth(c.id, widths) }
  const startResize = (c: Col, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const el = table.current!
    const x0 = e.clientX, w0 = e.currentTarget.parentElement!.getBoundingClientRect().width
    const min = c.id === 'title' ? parseFloat(getComputedStyle(el).getPropertyValue('--pl-col-title')) : 48
    let w = w0
    const move = (ev: PointerEvent) => {
      w = Math.max(min, Math.min(1000, w0 + ev.clientX - x0))
      el.style.setProperty(`--pl-w-${c.id}`, `${w}px`)
      if (c.id === 'title') el.style.setProperty('--pl-title-grow', '0')
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      el.style.removeProperty(`--pl-w-${c.id}`)
      el.style.removeProperty('--pl-title-grow')
      onWidths({ ...widths, [c.id]: Math.round(w) })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  /** 머리 누르기: 같은 열이면 거꾸로. 분류는 누를 때마다 맨 앞에 올 분류를 다음으로 돌린다(마지막 다음은 처음) */
  const next = (c: Col): Sort => {
    if (c.id === 'subjects' && leads.length) {
      const i = sort.col === 'subjects' && sort.lead ? leads.indexOf(sort.lead) : -1
      return { col: 'subjects', dir: 1, lead: leads[(i + 1) % leads.length] }
    }
    return sort.col === c.id ? { col: c.id, dir: sort.dir === 1 ? -1 : 1 } : { col: c.id, dir: c.num ? -1 : 1 }
  }
  const label = (c: Col) => (c.id === 'subjects' && sort.col === 'subjects' && sort.lead ? t(`${c.label} · ${ctx.subjectName(sort.lead)} 먼저`, `${c.label} · ${ctx.subjectName(sort.lead)} first`) : c.label)
  const total = `calc(${cols.map((c) => columnWidth(c.id, widths)).join(' + ')})`
  return (
    <div className="pl-table" ref={table} role="table" aria-label={t('논문 목록', 'Paper list')} style={{ minWidth: total }}>
      <div className="pl-tr pl-th" role="row" data-ui="표 머리">
        {cols.map((c) => (
          <div key={c.id} role="columnheader" className={`pl-cell${c.num ? ' num' : ''}`} style={cellStyle(c)}
            aria-sort={sort.col === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
            <button className="pl-sort" title={c.id === 'subjects' ? t('누를 때마다 맨 앞에 올 분류를 바꿉니다', 'Each click brings the next subject to the top') : t(`${c.label}로 정렬 (한 번 더 누르면 거꾸로)`, `Sort by ${c.label} (click again to reverse)`)} onClick={() => onSort(next(c))}>
              <span className="pl-label">{label(c)}</span>{sort.col === c.id && c.id !== 'subjects' && <span className="pl-dir" aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span>}
            </button>
            <span className="pl-resize" role="separator" aria-label={t(`${c.label} 폭`, `${c.label} width`)} onPointerDown={(e) => startResize(c, e)} onClick={(e) => e.stopPropagation()} />
          </div>
        ))}
      </div>
      <AddPaper look="row" onSaved={onSaved} onAdded={onPick} />
      {rows.map((p) => (
        <div key={p.key} role="row" className={`pl-tr${picked === p.key ? ' on' : ''}`} data-ui="논문 줄" data-ui-item={p.key} tabIndex={0}
          title={p.pdf.where === 'none' ? undefined : t('두 번 누르면 PDF를 엽니다', 'Double-click to open the PDF')}
          onClick={() => onPick(picked === p.key ? null : p.key)} onDoubleClick={() => openPdf(p)}
          onKeyDown={(e) => { if (e.key === 'Enter') openPdf(p) }}>
          {cols.map((c) => {
            const full = c.value(p, ctx)
            return <div key={c.id} role="cell" className={`pl-cell${c.num ? ' num' : ''}${c.id === 'pdf' ? ` where-${p.pdf.where}` : ''}`} style={cellStyle(c)} title={full || undefined}>{c.cell ? c.cell(p, ctx) : full}</div>
          })}
        </div>
      ))}
    </div>
  )
}

function PaperCards({ rows, ctx, picked, onPick, onSaved }: { rows: PaperRow[]; ctx: Ctx; picked: string | null; onPick(k: string | null): void; onSaved(m: string): void }) {
  return (
    <div className="pl-cards">
      <AddPaper look="card" onSaved={onSaved} onAdded={onPick} />
      {rows.map((p) => <PaperCard key={p.key} paper={p} projectTitle={ctx.projectTitle} on={picked === p.key} onClick={() => onPick(picked === p.key ? null : p.key)} />)}
    </div>
  )
}

/** 논문 카드 (목록의 카드 보기와 첫 화면 "최근 더한 논문"이 함께 쓴다). 두 번 누르면 PDF를 연다 */
export function PaperCard({ paper: p, projectTitle, on, onClick, compact = false }: { paper: PaperRow; projectTitle(id: string): string; on?: boolean; onClick(): void; compact?: boolean }) {
  if (compact) return (
    <button className={`pl-card card-link lh-card${on ? ' on' : ''}`} data-ui="논문 카드" data-ui-item={p.key} onClick={onClick} onDoubleClick={() => openPdf(p)}>
      <PaperCover paper={p} />
      <span className="lh-card-text">
        <span className="lh-card-title" title={p.title}>{p.title}</span>
        <span className="lh-card-meta" title={[p.authors.join(', '), p.year].filter(Boolean).join(' · ')}>{[authorLine(p.authors), p.year].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
  return (
    <button className={`pl-card card-link${on ? ' on' : ''}`} data-ui="논문 카드" data-ui-item={p.key} onClick={onClick} onDoubleClick={() => openPdf(p)}>
      <PaperCover paper={p} />
      <span className="pl-card-title">{p.title}</span>
      <span className="pl-card-sub">
        <span className="pl-card-authors" title={p.authors.join(', ')}>{authorLine(p.authors)}</span>
        {p.year && <span className="pl-card-year">{p.authors.length ? ' · ' : ''}{p.year}</span>}
      </span>
      <span className="pl-card-foot">
        <span className="pl-card-proj">{p.projects.map(projectTitle).join(', ')}</span>
        <span className={`where-${p.pdf.where}`}>{CARD_WHERE[p.pdf.where]}</span>
        {p.comments > 0 && <span className="pl-card-cm"><span className="ico">{Icon.comment}</span>{p.comments}</span>}
      </span>
    </button>
  )
}

/** 카드 표지: 이 맥에 PDF가 있으면 첫 쪽(화면에 들어올 때 그린다), 없으면 저널 · 연도. 클라우드의 PDF는 표지 때문에 받지 않는다 */
function PaperCover({ paper }: { paper: PaperRow }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const el = canvas.current
    if (!el || paper.pdf.where !== 'local') return
    let cancelled = false
    // 일찍 끝나거나(카드가 사라짐·오류) 다 그린 뒤 모두 PDF 문서를 닫는다
    let task: { destroy: () => Promise<void> } | undefined
    const io = new IntersectionObserver(async (seen) => {
      if (!seen.some((s) => s.isIntersecting)) return
      io.disconnect()
      try {
        const pdfjs = await loadPdfjs()
        const loading = pdfjs.getDocument({ url: `${papersApi.pdfUrl(paper.key)}?peek=1` })
        task = loading
        const doc = await loading.promise
        const page = await doc.getPage(1)
        const vp0 = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: (el.clientWidth * window.devicePixelRatio) / vp0.width })
        el.width = vp.width; el.height = vp.height
        const g = el.getContext('2d')
        if (!g || cancelled) return
        await page.render({ canvasContext: g, viewport: vp, canvas: el }).promise
        if (!cancelled) setDrawn(true)
      } catch { /* 표지 없이 저널 · 연도로 */ } finally { void task?.destroy() }
    })
    io.observe(el)
    return () => { cancelled = true; io.disconnect(); void task?.destroy() }
  }, [paper.key, paper.pdf.where])
  return (
    <span className={`pl-cover${drawn ? ' drawn' : ''}`} aria-hidden>
      {paper.pdf.where === 'local' && <canvas ref={canvas} />}
      {!drawn && <span className="pl-cover-text">{paper.venue || <span className="ico">{Icon.papers}</span>}{paper.year ? `${paper.venue ? ' · ' : ' '}${paper.year}` : ''}</span>}
    </span>
  )
}

/** 더하기: arXiv 번호 · DOI를 적거나 PDF를 끌어다 놓는다 */
export function AddPaper({ look, onSaved, onAdded, compact = false }: { look: 'row' | 'card'; onSaved(m: string): void; onAdded(key: string): void; compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hover, setHover] = useState(false)
  const [pending, setPending] = useState<File | null>(null)
  const done = (r: { key: string; existed: boolean; pdfError?: string }) => {
    announce(); onAdded(r.key); setEditing(false); setText(''); setPending(null); setErr('')
    const pdf = r.pdfError ? ` (${r.pdfError})` : ''
    onSaved(r.existed ? t(`이미 있는 논문입니다: ${r.key}${pdf}`, `Paper already exists: ${r.key}${pdf}`) : t(`더했습니다: ${r.key}${pdf}`, `Added: ${r.key}${pdf}`))
  }
  const run = async (f: () => Promise<{ key: string; existed: boolean; pdfError?: string }>) => {
    setBusy(true); setErr('')
    try { done(await f()) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const submit = () => {
    if (pending) void run(() => papersApi.upload(pending, text.trim() || undefined))
    else if (text.trim()) void run(() => papersApi.add(text.trim()))
  }
  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault(); setHover(false)
    const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!file) { setErr(t('PDF 파일만 놓을 수 있습니다', 'Only PDF files can be dropped')); setEditing(true); return }
    setEditing(true)
    void (async () => {
      setBusy(true); setErr('')
      try { done(await papersApi.upload(file)) } catch (x) {
        // 번호를 못 찾으면 적어 달라고 한다
        setPending(file); setErr((x as Error).message)
      } finally { setBusy(false) }
    })()
  }
  const dropProps = {
    onDragOver: (e: ReactDragEvent) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setHover(true) } },
    onDragLeave: () => setHover(false),
    onDrop,
  }
  if (!editing) {
    return (
      <button className={`pl-add add-card ${look}${compact && look === 'card' ? ' lh-add' : ''}${hover ? ' hover' : ''}`} data-ui="논문 더하기" onClick={() => setEditing(true)} {...dropProps}>
        {t('＋ 논문 추가', '＋ Add paper')} <span className="muted">{t('arXiv 번호 · DOI, 또는 PDF를 여기에 놓기', 'arXiv ID · DOI, or drop a PDF here')}</span>
      </button>
    )
  }
  return (
    <div className={`pl-add add-card ${look} editing${compact && look === 'card' ? ' lh-add' : ''}${hover ? ' hover' : ''}`} data-ui="논문 더하기" {...dropProps}>
      {pending && <span className="muted">{pending.name}:</span>}
      <input autoFocus value={text} disabled={busy} placeholder={pending ? t('이 PDF의 arXiv 번호나 DOI', 'arXiv ID or DOI of this PDF') : t('arXiv 번호(0000.00001)나 DOI(10.1103/…) — PDF를 놓아도 됩니다', 'arXiv ID (0000.00001) or DOI (10.1103/…). You can also drop a PDF')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setEditing(false); setPending(null); setErr('') } }} />
      <button className="btn sm primary" disabled={busy || !text.trim()} onClick={submit}>{busy ? t('받는 중…', 'Downloading…') : t('추가', 'Add')}</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => { setEditing(false); setPending(null); setErr('') }}>{t('취소', 'Cancel')}</button>
      {err && <span className="pl-add-err">{err}</span>}
    </div>
  )
}

/** 오른쪽 사이드바: 고른 논문 */
function PaperSide({ paper, projects, ctx, onClose, onSaved }: { paper: PaperRow; projects: { id: string; title: string }[]; ctx: Ctx; onClose(): void; onSaved(m: string): void }) {
  return (
    <aside className="pane pl-rs" data-ui="논문 정보" aria-label={t('고른 논문', 'Selected paper')}>
      <div className="rs-head"><span className="rs-label">{paper.kind === 'book' ? t('책', 'Book') : t('논문', 'Paper')}</span><span className="sp" /><button className="icon-btn" aria-label={t('닫기', 'Close')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      <PaperInfo paper={paper} projects={projects} ctx={ctx} onSaved={onSaved} />
    </aside>
  )
}

/** PDF가 없고 arXiv 번호가 있으면 받는다: 첫 논문 PDF 폴더에 <키>.pdf로 (10/7 19:12 "논문 추가 요청") */
function FetchPdf({ paper, onSaved }: { paper: PaperRow; onSaved(m: string): void }) {
  const [busy, setBusy] = useState(false)
  const fetchPdf = async () => {
    setBusy(true)
    try {
      const r = await papersApi.add(paper.eprint!)
      onSaved(r.pdf ? t(`PDF를 받았습니다 — ${paper.title}`, `Downloaded the PDF: ${paper.title}`) : r.pdfError ? t(`PDF를 받지 못했습니다 — ${r.pdfError}`, `Could not download the PDF: ${r.pdfError}`) : t('먼저 설정 › 논문 PDF 폴더를 정해 주세요', 'First set Settings › Paper PDF folder'))
      announce()
    } catch (e) { onSaved(t(`PDF를 받지 못했습니다 — ${(e as Error).message}`, `Could not download the PDF: ${(e as Error).message}`)) } finally { setBusy(false) }
  }
  return <button className="btn primary" disabled={busy} title={t(`arXiv ${paper.eprint}에서 PDF를 받아 논문 PDF 폴더에 둡니다`, `Download the PDF from arXiv ${paper.eprint} into the paper PDF folder`)} onClick={() => void fetchPdf()}>{busy ? t('받는 중…', 'Downloading…') : t('arXiv에서 PDF 받기', 'Download PDF from arXiv')}</button>
}

/** arXiv 번호가 없는 논문의 arXiv 판 후보 (10/11 12:46): 맞는 것을 골라야 bib에 적는다. 잘못 이어지지 않게 저절로 적지 않는다 */
function FindArxiv({ paper, onClose, onSaved }: { paper: PaperRow; onClose(): void; onSaved(m: string): void }) {
  const [list, setList] = useState<ArxivCandidate[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => {
    let live = true
    papersApi.findArxiv(paper.key).then((r) => { if (live) setList(r.candidates) }, (e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [paper.key])
  const choose = async (c: ArxivCandidate) => {
    setBusy(c.eprint)
    try { await papersApi.setEprint(paper.key, c.eprint); onSaved(t(`arXiv 번호를 적었습니다 — ${c.eprint}`, `Saved the arXiv number: ${c.eprint}`)); announce(); onClose() }
    catch (e) { onSaved(t(`arXiv 번호를 적지 못했습니다 — ${(e as Error).message}`, `Could not save the arXiv number: ${(e as Error).message}`)) } finally { setBusy('') }
  }
  return (
    <div className="pl-ax" data-ui="arXiv 후보">
      <div className="pl-ax-head"><span className="rs-label">{t('arXiv 후보', 'arXiv candidates')}</span><span className="sp" /><button className="icon-btn" aria-label={t('닫기', 'Close')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      {error ? <p className="pl-ax-msg bad">{error}</p>
        : !list ? <p className="pl-ax-msg muted">{t('찾는 중…', 'Searching…')}</p>
        : !list.length ? <p className="pl-ax-msg muted">{t('arXiv에서 맞는 논문을 찾지 못했습니다.', 'No matching paper found on arXiv.')}</p>
        : list.map((c) => (
          <div key={c.eprint} className="pl-ax-row">
            <div className="pl-ax-title">{c.title}</div>
            <div className="pl-ax-sub muted">{c.authors.slice(0, 3).join(', ')}{c.authors.length > 3 ? ' …' : ''}{c.year ? ` · ${c.year}` : ''}</div>
            <div className="pl-ax-acts">
              <a className="a" href={`https://arxiv.org/abs/${c.eprint}`} target="_blank" rel="noreferrer">arXiv {c.eprint}</a>
              {c.match === 'doi' && <span className="muted">{t('DOI 같음', 'Same DOI')}</span>}
              <span className="sp" />
              <button className="btn sm" disabled={!!busy} onClick={() => void choose(c)}>{busy === c.eprint ? t('적는 중…', 'Saving…') : t('이 번호 적기', 'Use this number')}</button>
            </div>
          </div>
        ))}
    </div>
  )
}

/** 고른 논문의 정보 (목록의 오른쪽 칸과 논문 열기의 "정보"가 함께 쓴다) */
function PaperInfo({ paper, projects, ctx, opened, onSaved }: { paper: PaperRow; projects: { id: string; title: string }[]; ctx: Ctx; opened?: boolean; onSaved(m: string): void }) {
  const { tree } = useSubjects()
  const [adding, setAdding] = useState(false)
  const [finding, setFinding] = useState(false)
  useEffect(() => setFinding(false), [paper.key])
  const manual = paper.projects.filter((p) => !paper.autoProjects.includes(p))
  const save = async (next: string[]) => {
    try { await papersApi.setProjects(paper.key, next); announce() } catch (e) { onSaved(t(`프로젝트를 바꾸지 못했습니다: ${(e as Error).message}`, `Could not change projects: ${(e as Error).message}`)) }
  }
  const free = projects.filter((p) => !paper.projects.includes(p.id))
  return (
      <div className="rs-scroll rs-pad pl-rs-body">
        <h3 className="pl-rs-title">{paper.title}</h3>
        <p className="pl-rs-sub">{paper.authors.join(', ')}{paper.year ? ` · ${paper.year}` : ''}</p>
        {paper.venue && <p className="pl-rs-sub muted">{paper.venue}</p>}
        <div className="pl-rs-links">
          {paper.eprint && <a className="a" href={`https://arxiv.org/abs/${paper.eprint}`} target="_blank" rel="noreferrer">arXiv {paper.eprint}</a>}
          {paper.doi && <a className="a" href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">DOI</a>}
          {!paper.eprint && paper.kind === 'paper' && !finding && <button className="a" title={t('제목과 첫 저자로 arXiv 판을 찾습니다. 고른 번호만 references.bib에 적습니다', 'Search arXiv by title and first author. Only the number you choose is written to references.bib')} onClick={() => setFinding(true)}>{t('arXiv 찾기', 'Find on arXiv')}</button>}
        </div>
        {finding && !paper.eprint && <FindArxiv key={paper.key} paper={paper} onClose={() => setFinding(false)} onSaved={onSaved} />}
        {!opened && (paper.pdf.where === 'none' && paper.eprint
          ? <FetchPdf paper={paper} onSaved={onSaved} />
          : (
            <button className={`btn${paper.pdf.where === 'none' ? '' : ' primary'}`} disabled={paper.pdf.where === 'none'} title={paper.pdf.where === 'cloud' ? t('클라우드에만 있으면 여는 동안 맥이 받아 옵니다', 'If it is only in the cloud, the Mac downloads it while opening') : undefined} onClick={() => openPdf(paper)}>
              {paper.pdf.where === 'none' ? t('PDF 없음', 'No PDF') : t('열기', 'Open')}
            </button>
          ))}
        {tree?.enabled && <div className="rs-field"><div className="rs-label">{t('분류', 'Subject')}</div><SubjectPicker key={paper.key} tree={tree} value={paper.subjects ?? []} onChange={async (ids) => {
          try { await subjectsApi.paper(paper.key, ids, paper.subjectsHash!); onSaved(t('분류를 고쳤습니다', 'Updated subjects')) } finally { announce() }
        }} /></div>}
        <div className="rs-field">
          <div className="rs-label">{t('프로젝트', 'Projects')}</div>
          <div className="pl-rs-chips">
            {paper.projects.map((id) => (
              <span key={id} className="tag" title={paper.autoProjects.includes(id) ? t('이 프로젝트의 bib에 있어서 자동으로 이어졌습니다', 'Linked automatically because it is in this project\'s bib') : undefined}>
                {ctx.projectTitle(id)}
                {!paper.autoProjects.includes(id) && <button className="pl-chip-x" aria-label={t(`${ctx.projectTitle(id)} 제거`, `Remove ${ctx.projectTitle(id)}`)} onClick={() => void save(manual.filter((x) => x !== id))}>×</button>}
              </span>
            ))}
            {free.length > 0 && !adding && <button className="btn sm" onClick={() => setAdding(true)}>{t('＋ 추가', '＋ Add')}</button>}
            {adding && (
              <select className="rs-select" autoFocus value="" onBlur={() => setAdding(false)} onChange={(e) => { setAdding(false); if (e.target.value) void save([...manual, e.target.value]) }}>
                <option value="">{t('프로젝트 고르기', 'Choose project')}</option>
                {free.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="rs-field">
          <div className="rs-label">{t('코멘트', 'Comments')}</div>
          <p className="muted">{paper.comments ? t(`${paper.comments}개${paper.waiting ? ` · 답 기다리는 질문 ${paper.waiting}` : ''}`, `${paper.comments}${paper.waiting ? ` · questions awaiting answers ${paper.waiting}` : ''}`) : t('아직 없음', 'None yet')}</p>
        </div>
        <div className="rs-field pl-rs-path">
          <div className="muted mono" title={paper.key}>{paper.key}</div>
          <div className="muted mono" title={paper.pdf.file}>{paper.pdf.file?.split('/').filter(Boolean).pop() ?? t('PDF 폴더에 없음', 'Not in the PDF folder')}{paper.pdf.where === 'cloud' ? t(' (클라우드)', ' (cloud)') : ''}</div>
        </div>
      </div>
  )
}

/**
 * 논문 하나 열기 (10/5 저녁 고침): 가운데 PDF, 오른쪽에 정보 | 코멘트.
 * PDF와 코멘트는 연구노트 PDF와 같은 부품(Comments.tsx). 형광펜 네 색, 글을 고르지 않고 남긴 코멘트·질문은 논문 전체에 대한 것.
 */
function PaperOpen({ paper, data, ctx, onSaved }: { paper: PaperRow; data: PaperList; ctx: Ctx; onSaved(m: string): void }) {
  const [side, setSideState] = useState<'info' | 'comments'>(() => (store.get<string>(SIDE_KEY, 'comments') === 'info' ? 'info' : 'comments'))
  const setSide = (v: 'info' | 'comments') => { setSideState(v); store.set(SIDE_KEY, v) }
  const target = libraryPaperTarget(paper.key, `논문 ${paper.title}`)
  const request = useRecordComposerRequest()
  useEffect(() => { if (request?.rid === LIBRARY && request.target.target === target.target) setSide('comments') }, [request, target.target])
  useEffect(() => {
    const open = () => setSide('comments')
    window.addEventListener(OPEN_CONTEXT, open)
    return () => window.removeEventListener(OPEN_CONTEXT, open)
  }, [])
  return (
    <main className="stage full pl with-side pl-open" data-ui="논문 열기">
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <span className="crumb"><button className="a" onClick={() => go({ page: 'shelf' })}>{t('논문', 'Papers')}</button> › <b title={paper.title}>{paper.title}</b></span>
          <span className="sp" />
          <span className="muted">{paper.pdf.where === 'cloud' ? t('클라우드 (여는 동안 받아 옵니다)', 'Cloud (downloads while opening)') : t('이 맥에 있음', 'On this Mac')}</span>
        </div>
        <CommentablePdf rid={LIBRARY} target={target} url={paper.pdf.where === 'none' ? null : papersApi.pdfUrl(paper.key)} highlight={NO_BOXES} onPick={() => undefined} remember={paper.key} />
      </section>
      <aside className="pane pl-rs" data-ui="논문 열기 오른쪽" aria-label={t('논문 정보와 코멘트', 'Paper info and comments')}>
        <div className="rs-head">
          <div className="segmented small" role="radiogroup" aria-label={t('오른쪽 사이드바', 'Right sidebar')}>
            <button className={side === 'info' ? 'on' : ''} role="radio" aria-checked={side === 'info'} onClick={() => setSide('info')}>{t('정보', 'Info')}</button>
            <button className={side === 'comments' ? 'on' : ''} role="radio" aria-checked={side === 'comments'} onClick={() => setSide('comments')}>{t('정리', 'Notes')} {paper.comments || ''}</button>
          </div>
        </div>
        {side === 'info' ? <PaperInfo paper={paper} projects={data.projects} ctx={ctx} opened onSaved={onSaved} /> : <div className="rs-col"><CommentsPanel rid={LIBRARY} target={target} /></div>}
      </aside>
    </main>
  )
}
const NO_BOXES: never[] = []
const SIDE_KEY = 'rw-paper-side'
