import { useRef, type CSSProperties, type ReactNode } from 'react'
import { localDate } from '@rw/core'
import type { PaperRow } from './api'
import { matchesSubject } from './api/subjects'
import { t, HERE } from './i18n'
import { go } from './router'

/**
 * 논문 목록의 표 (PapersPage.tsx의 「표」 보기): 열 · 열 폭 · 정렬과 표.
 * 머리를 누르면 정렬(한 번 더 누르면 거꾸로), 경계를 끌면 폭. 카드 보기와 첫 화면 카드도 저자 줄 · PDF 열기를 함께 쓴다
 */

export type ColId = 'title' | 'authors' | 'year' | 'subjects' | 'tags' | 'venue' | 'arxiv' | 'projects' | 'pdf' | 'comments' | 'opened' | 'added' | 'kind' | 'key'
export interface Col { id: ColId; label: string; value(p: PaperRow, ctx: Ctx): string; sort(p: PaperRow, ctx: Ctx): string | number; cell?(p: PaperRow, ctx: Ctx): ReactNode; num?: boolean }
export interface Ctx { projectTitle(id: string): string; subjectName(id: string): string }

const WHERE_LABEL = { local: t(HERE.ko, HERE.En), cloud: t('클라우드', 'Cloud'), none: t('없음', 'None') } as const
const fmtDate = (ms?: number) => {
  if (!ms) return ''
  return localDate(new Date(ms))
}
export const authorLine = (a: string[]) => (a.length > 3 ? t(`${a.slice(0, 3).join(', ')} 외 ${a.length - 3}`, `${a.slice(0, 3).join(', ')} +${a.length - 3}`) : a.join(', '))

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
export const colOf = (id: string) => COLS.find((c) => c.id === id)
/** 표의 열은 정해 둔다 (10/31 시안 1절). 좁으면 태그 → 분류 → 프로젝트 순으로 숨긴다. 나머지 열은 정렬에만 쓴다(카드 정렬 · 최근 더한 순) */
export const TABLE: ColId[] = ['title', 'authors', 'year', 'subjects', 'tags', 'projects', 'pdf']
export const COMPACT: ColId[][] = [['tags'], ['subjects'], ['projects']]

/** 사용자가 끌어 정한 열 폭만 기억한다 */
export type Widths = Partial<Record<ColId, number>>

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
export type Sort = { col: ColId; dir: 1 | -1; lead?: string }

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

/** 논문 하나 열기: 가운데 PDF, 오른쪽에 정보 | 코멘트 (3단계) */
export const openPdf = (p: PaperRow) => { if (p.pdf.where !== 'none') go({ page: 'shelf', open: p.key }) }

export function PaperTable({ rows, cols, widths, onWidths, sort, onSort, leads, ctx, picked, onPick, add }: {
  rows: PaperRow[]; cols: Col[]; widths: Widths; onWidths(w: Widths): void; sort: Sort; onSort(s: Sort): void; leads: string[]; ctx: Ctx
  picked: string | null; onPick(k: string | null): void
  /** 표 맨 위 점선 줄 (더하기) */
  add: ReactNode
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
      {add}
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
