import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import type { PdfBox } from './api'
import { Icon } from './icons'
import { loadPdfjs } from './pdfjs'
import { RecordMenu } from './RecordMenus'
import { t } from './i18n'
import { findInPage, readLinks, readOutline, type FindHit, type OutlineItem, type PdfLink, type TextPiece } from './pdfNav'
import { PdfFind, PdfToc } from './PdfNavPanels'
import { store } from './store'

/** 끌어서 고른 글: 쪽, 줄마다 사각형 [x, y, w, h] (PDF 포인트, 쪽 왼쪽 위 원점), 글자 */
export interface PdfSelection { page: number; rects: number[][]; text: string; /** 그 쪽의 높이 (PDF 포인트) */ pageHeight?: number }
/** 칠한 곳 (논문 하이라이트). 색 이름은 tokens.css의 --paint-<색> */
export interface PdfPaint { id: string; page: number; rects: number[][]; color: string }
/** PDF 위에 표시할 코멘트·질문 자리 */
export interface PdfMark { id: string; page: number; rects: number[][]; kind: 'comment' | 'question'; color?: string; on?: boolean; title?: string }

interface Props {
  rootRef?: Ref<HTMLDivElement>
  url: string | null
  /** 원고 → PDF 이동으로 표시할 영역 */
  highlight: PdfBox[]
  /** PDF를 눌렀을 때: 쪽 번호, 쪽 왼쪽 위 기준 좌표(PDF 포인트), 누른 곳의 글자 */
  onPick(page: number, x: number, y: number, text: string): void
  /** 코멘트·질문 자리 */
  marks?: PdfMark[]
  onMark?(id: string): void
  /** 도구 막대 앞쪽에 넣을 단추들 (코멘트·질문). 지금 쪽과 고른 글을 받는다 */
  tools?(ctx: { page: number; sel: PdfSelection | null; clearSel(): void }): ReactNode
  /** 글을 끌어 고르면 그 곁에 띄울 작은 메뉴 */
  selectionMenu?(sel: PdfSelection, clear: () => void): ReactNode
  /** 처음 색으로 칠하기 (고른 글 메뉴의 Enter) */
  onSelectionDefault?(sel: PdfSelection, clear: () => void): void
  /** 도구 막대 아래에 띄울 것 (코멘트 쓰는 칸 등) */
  overlay?: ReactNode
  /** 칠한 곳. 누르면 paintMenu를 그 곁에 띄운다 */
  paints?: PdfPaint[]
  paintMenu?(paint: PdfPaint, close: () => void): ReactNode
  /** 이 쪽의 이 높이(PDF 포인트)로 스크롤. nonce가 바뀔 때마다 */
  reveal?: { page: number; y: number; nonce: number } | null
  /** 다시 열면 읽던 쪽과 배율로 (논문은 bib 키). 이 브라우저가 기억한다 */
  remember?: string
}

interface RenderedPage { page: number; widthPt: number; heightPt: number }

const NO_TEXT: TextPiece[] = []
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const TOC_KEY = 'rw-pdf-toc'
const PLACE_KEY = 'rw-pdf-place'
type Place = { page: number; zoom: number }
/** 주석 중 앱이 읽는 칸 (쪽지 · 하이라이트 · 링크) */
interface Annotation { subtype?: string; rect?: number[]; contentsObj?: { str?: string }; titleObj?: { str?: string }; dest?: unknown; url?: string; unsafeUrl?: string }

/** 누른 곳의 글자. 너무 짧은 조각(기호 하나)이면 같은 줄의 가까운 긴 조각을 쓴다. */
function textAt(pieces: TextPiece[], x: number, y: number): string {
  const sameLine = pieces.filter((p) => p.str.trim() && y >= p.y - p.h - 2 && y <= p.y + 3)
  const dist = (p: TextPiece) => (x < p.x ? p.x - x : x > p.x + p.w ? x - p.x - p.w : 0)
  const byDist = [...sameLine].sort((a, b) => dist(a) - dist(b))
  const hit = byDist[0]
  if (!hit) return ''
  if (/[\p{L}]{2}/u.test(hit.str)) return hit.str
  return byDist.find((p) => /[\p{L}]{2}/u.test(p.str) && dist(p) < 60)?.str ?? hit.str
}

/** 같은 줄의 사각형을 하나로 합친다 (글자 조각마다 하나씩 나오므로) */
function mergeLines(rects: number[][]): number[][] {
  const lines: number[][] = []
  for (const [x, y, w, h] of [...rects].sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!)) {
    const same = lines.find((l) => Math.abs(l[1]! + l[3]! / 2 - (y! + h! / 2)) < Math.max(l[3]!, h!) / 2)
    if (same) {
      const right = Math.max(same[0]! + same[2]!, x! + w!)
      const bottom = Math.max(same[1]! + same[3]!, y! + h!)
      same[0] = Math.min(same[0]!, x!); same[1] = Math.min(same[1]!, y!)
      same[2] = right - same[0]; same[3] = bottom - same[1]
    } else lines.push([x!, y!, w!, h!])
  }
  return lines.map((r) => r.map((n) => Math.round(n * 10) / 10))
}

/** PDF 안의 주석 (컴파일 설정 "기록 넣기"로 넣은 쪽지 · 하이라이트, 10/19). 자리는 쪽 왼쪽 위 원점의 포인트 */
interface PdfNote { kind: 'note' | 'mark'; x: number; y: number; w: number; h: number; title: string; text: string }
const NO_NOTES: PdfNote[] = []

/** 쪽지 아이콘과 누른 주석의 글. 하이라이트는 캔버스가 그리고, 누르면 같은 글 상자가 열린다 */
const NoteLayer = memo(function NoteLayer({ notes, scale, open, onOpen }: { notes: PdfNote[]; scale: number; open: number | null; onOpen(i: number | null): void }) {
  const shown = open !== null ? notes[open] : undefined
  return <>
    {notes.map((n, i) => n.kind === 'note' && (
      <button key={i} className={`pdf-note${open === i ? ' on' : ''}`} data-ui="PDF 쪽지" aria-label={n.title} title={n.title}
        style={{ left: n.x * scale, top: n.y * scale }} onClick={(e) => { e.stopPropagation(); onOpen(open === i ? null : i) }}>{Icon.memo}</button>
    ))}
    {shown && <div className="pdf-note-card" data-ui="PDF 쪽지 글" style={{ left: Math.max(0, (shown.x + shown.w) * scale - 260), top: (shown.y + shown.h) * scale + 4 }} onClick={(e) => e.stopPropagation()}>
      <b>{shown.title}</b>
      <div>{shown.text}</div>
    </div>}
  </>
})

let measureCtx: CanvasRenderingContext2D | null = null
/**
 * 고를 수 있는 글자 층: 보이지 않는 글자를 캔버스의 글자 자리에 겹쳐 둔다 (pdf.js 텍스트 층과 같은 방식).
 * 폭은 글꼴이 달라도 PDF의 폭에 맞게 가로로 늘이거나 줄인다.
 */
const TextLayer = memo(function TextLayer({ pieces, scale }: { pieces: TextPiece[]; scale: number }) {
  const spans = useMemo(() => {
    measureCtx ??= document.createElement('canvas').getContext('2d')
    return pieces.filter((p) => p.str.length > 0 && p.h > 0).map((p) => {
      const fs = p.h * scale
      let sx = 1
      if (measureCtx && p.w > 0) {
        measureCtx.font = `${fs}px sans-serif`
        const m = measureCtx.measureText(p.str).width
        if (m > 0) sx = (p.w * scale) / m
      }
      return { p, fs, sx }
    })
  }, [pieces, scale])
  return (
    <div className="pdf-text" aria-hidden={false}>
      {spans.map(({ p, fs, sx }, i) => (
        <span key={i} style={{ left: p.x * scale, top: (p.y - p.h * 0.85) * scale, fontSize: fs, transform: `scaleX(${sx})` }}>{p.str}{' '}</span>
      ))}
    </div>
  )
})

/**
 * PDF를 폭에 맞춰 그린다. 가운데 위에 도구 막대(코멘트·질문·확대·쪽).
 * SyncTeX 좌표는 PDF 포인트(1/72인치)·왼쪽 위 원점이므로, 화면 좌표 = 포인트 × scale.
 */
export function PdfView({ rootRef, url, highlight, onPick, marks = [], onMark, tools, selectionMenu, onSelectionDefault, overlay, reveal, paints, paintMenu, remember }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [texts, setTexts] = useState<Map<number, TextPiece[]>>(new Map())
  const [notes, setNotes] = useState<Map<number, PdfNote[]>>(new Map())
  /** 열린 PDF 주석: 쪽과 그 쪽의 번호 */
  const [noteOpen, setNoteOpen] = useState<{ page: number; i: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const canvases = useRef(new Map<number, HTMLCanvasElement>())
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const [width, setWidth] = useState(0)
  const [current, setCurrent] = useState(1)
  const [pageInput, setPageInput] = useState<string | null>(null)
  const [sel, setSel] = useState<PdfSelection | null>(null)
  const [paintOpen, setPaintOpen] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  // PDF 안에서 이동: 목차 · 링크 · 찾기 · 돌아가기
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [tocOpen, setTocOpenState] = useState(() => store.get<boolean>(TOC_KEY, false))
  const setTocOpen = (v: boolean) => { setTocOpenState(v); store.set(TOC_KEY, v) }
  const [links, setLinks] = useState<Map<number, PdfLink[]>>(new Map())
  const [find, setFind] = useState<{ q: string; i: number } | null>(null)
  const [back, setBack] = useState<{ page: number; top: number }[]>([])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  // 문서 읽기: 쪽 크기와 글자 조각
  useEffect(() => {
    if (!url) { setDoc(null); setPages([]); return }
    let cancelled = false
    let task: PDFDocumentLoadingTask | undefined
    ;(async () => {
      try {
        const pdfjs = await loadPdfjs()
        if (cancelled) return
        task = pdfjs.getDocument({ url })
        const d = await task.promise
        // 쪽 크기만 먼저 읽는다. 글자 조각은 화면 가까이 온 쪽만 (아래)
        const info: RenderedPage[] = []
        for (let n = 1; n <= d.numPages; n++) {
          const vp = (await d.getPage(n)).getViewport({ scale: 1 })
          info.push({ page: n, widthPt: vp.width, heightPt: vp.height })
        }
        if (cancelled) return
        setTexts(new Map())
        setNotes(new Map())
        setNoteOpen(null)
        setPages(info)
        setDoc(d)
        setSel(null)
        setPaintOpen(null)
        setError(null)
        setLinks(new Map())
        setBack([])
        setOutline([])
        readOutline(d, info.map((p) => p.heightPt)).then((o) => { if (!cancelled) setOutline(o) }, () => undefined)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true; void task?.destroy() }
  }, [url])

  const fit = pages.length && width ? Math.min(1.6, (width - 48) / Math.max(...pages.map((p) => p.widthPt))) : 1
  const scale = fit * zoom

  // 화면 가까이(위아래로 한 화면 안) 있는 쪽만 그린다. 긴 원고(수십 쪽)를 한꺼번에 그리면
  // 캔버스 메모리가 1GB를 넘고 여는 순간 화면이 멈춘다. 멀어진 쪽은 캔버스와 글자 층을 내려놓는다
  const [near, setNear] = useState<Set<number>>(() => new Set([1, 2]))
  useEffect(() => {
    const root = wrap.current
    if (!root || !pages.length) return
    const io = new IntersectionObserver((entries) => {
      setNear((prev) => {
        const next = new Set(prev)
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.page)
          if (e.isIntersecting) next.add(n)
          else next.delete(n)
        }
        return next.size === prev.size && [...next].every((n) => prev.has(n)) ? prev : next
      })
    }, { root, rootMargin: '100% 0px' })
    for (const el of pageEls.current.values()) io.observe(el)
    return () => io.disconnect()
  }, [pages])

  // 가까이 온 쪽의 글자 조각 (고르기·누른 곳 찾기용)과 주석. 찾기를 열면 모든 쪽
  const textLoading = useRef(new Set<number>())
  useEffect(() => { textLoading.current.clear() }, [doc])
  const searching = !!find?.q.trim()
  useEffect(() => {
    if (!doc) return
    const heights = pages.map((p) => p.heightPt)
    for (const n of searching ? pages.map((p) => p.page) : near) {
      const info = pages.find((p) => p.page === n)
      if (!info || texts.has(n) || textLoading.current.has(n)) continue
      textLoading.current.add(n)
      void (async () => {
        try {
          const tc = await (await doc.getPage(n)).getTextContent()
          const pieces = tc.items.flatMap((it) => ('str' in it
            ? [{ str: it.str, x: it.transform[4] as number, y: info.heightPt - (it.transform[5] as number), w: it.width, h: it.height || Math.hypot(it.transform[2] as number, it.transform[3] as number) }]
            : []))
          setTexts((prev) => new Map(prev).set(n, pieces))
          // 쪽지(Text) · 하이라이트(Highlight) 주석: 글이 있는 것만
          const annots: Annotation[] = await (await doc.getPage(n)).getAnnotations()
          const found = annots.flatMap((a): PdfNote[] => {
            const text = (a.contentsObj?.str ?? '').replace(/\r\n?/g, '\n').trim()
            if ((a.subtype !== 'Text' && a.subtype !== 'Highlight') || !text || !a.rect) return []
            const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = a.rect
            const [title, ...rest] = text.split('\n')
            return [{ kind: a.subtype === 'Text' ? 'note' : 'mark', x: x1, y: info.heightPt - y2, w: x2 - x1, h: y2 - y1, title: title ?? a.titleObj?.str ?? '', text: rest.join('\n').trim() }]
          })
          if (found.length) setNotes((prev) => new Map(prev).set(n, found))
          // 링크: 인용 · 식 · 그림 번호(PDF 안 자리)와 바깥 주소
          const pageLinks = await readLinks(doc, annots, info.heightPt, heights)
          if (pageLinks.length) setLinks((prev) => new Map(prev).set(n, pageLinks))
        } catch { /* 문서가 바뀌어 닫힘 */ }
      })()
    }
  }, [doc, near, pages, texts, searching])

  // 캔버스 그리기. 선명하게 기기 픽셀 비율만큼 크게 그린다. 배율이 바뀌면 다시 그린다.
  // 같은 캔버스에 두 번 동시에 그릴 수 없으므로, 앞 그리기가 취소되어 끝난 뒤에 시작한다
  const drawing = useRef<Promise<void>>(Promise.resolve())
  /** 캔버스마다 그린 배율. 새로 붙은 캔버스나 배율이 바뀐 캔버스만 다시 그린다 */
  const drawn = useRef(new WeakMap<HTMLCanvasElement, number>())
  useEffect(() => { drawn.current = new WeakMap() }, [doc])
  useEffect(() => {
    if (!doc || !pages.length || !width) return
    let cancelled = false
    let task: { cancel(): void } | null = null
    const before = drawing.current
    drawing.current = (async () => {
      await before
      await new Promise((r) => requestAnimationFrame(r))
      const dpr = window.devicePixelRatio || 1
      // 보고 있는 쪽부터
      const order = [...near].sort((a, b) => Math.abs(a - current) - Math.abs(b - current))
      for (const page of order) {
        const canvas = canvases.current.get(page)
        if (cancelled) return
        if (!canvas || !canvas.isConnected || drawn.current.get(canvas) === scale * dpr) continue
        try {
          const p = await doc.getPage(page)
          if (cancelled) return
          const vp = p.getViewport({ scale: scale * dpr })
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          const t = p.render({ canvas, viewport: vp })
          task = t
          await t.promise
          drawn.current.set(canvas, scale * dpr)
        } catch { /* 다시 그리느라 취소됨 */ } finally { task = null }
      }
    })()
    return () => { cancelled = true; task?.cancel() }
  }, [doc, pages, scale, width, near]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToPage = (page: number, y = 0, mid = false) => {
    const pageEl = pageEls.current.get(page)
    const container = wrap.current
    if (!pageEl || !container) return
    container.scrollTo({ top: pageEl.offsetTop + y * scale - (mid ? container.clientHeight / 3 : 56), behavior: 'smooth' })
  }

  // 링크 · 목차로 옮기기 전 자리를 쌓아 두고 "돌아가기"로 되돌린다
  const jumpTo = (page: number, y: number | null) => {
    const c = wrap.current
    if (c) setBack((b) => [...b.slice(-19), { page: current, top: c.scrollTop }])
    setCurrent(page)
    scrollToPage(page, y === null ? 0 : Math.max(0, y - 12))
  }
  const goBack = () => {
    const last = back.at(-1)
    if (!last) return
    setBack(back.slice(0, -1))
    wrap.current?.scrollTo({ top: last.top, behavior: 'smooth' })
  }

  // 찾기: 글자를 다 읽은 쪽부터 찾은 곳이 늘어난다. 새 찾기 글은 지금 쪽부터
  const hits: FindHit[] = useMemo(() => {
    if (!find?.q.trim()) return []
    // 글자 층과 같은 글꼴로 재어 찾은 곳의 가로 자리를 맞춘다
    measureCtx ??= document.createElement('canvas').getContext('2d')
    if (measureCtx) measureCtx.font = '100px sans-serif'
    const measure = (str: string) => measureCtx?.measureText(str).width ?? 0
    return pages.flatMap((p) => findInPage(texts.get(p.page) ?? NO_TEXT, find.q, p.page, measure))
  }, [find?.q, texts, pages])
  const findLoading = searching && pages.some((p) => !texts.has(p.page))
  const showHit = (i: number) => { const h = hits[i]; if (h) scrollToPage(h.page, h.rects[0]![1]!, true) }
  useEffect(() => {
    if (!find || find.i >= 0 || !hits.length) return
    const i = Math.max(0, hits.findIndex((h) => h.page >= current))
    setFind({ q: find.q, i })
    showHit(i)
  }, [hits, find]) // eslint-disable-line react-hooks/exhaustive-deps
  const stepFind = (dir: 1 | -1) => {
    if (!find || !hits.length) return
    const i = ((find.i < 0 ? 0 : find.i + dir) + hits.length) % hits.length
    setFind({ q: find.q, i })
    showHit(i)
  }
  // ⌘F: 마우스가 PDF 위에 있거나 PDF 안에 초점이 있을 때만 (브라우저 찾기 대신)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const shell = wrap.current?.parentElement
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'f' || !shell || !pages.length) return
      if (!shell.matches(':hover') && !shell.contains(document.activeElement)) return
      e.preventDefault()
      setFind((f) => f ? { ...f } : { q: '', i: -1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages.length])

  // 읽던 자리: 처음 그릴 때 한 번 되돌리고, 그 뒤로 쪽 · 배율이 바뀌면 적어 둔다
  const restored = useRef('')
  useEffect(() => {
    const id = `${remember}|${url}`
    if (!remember || !pages.length || !width || restored.current === id) return
    restored.current = id
    const place = store.get<Record<string, Place>>(PLACE_KEY, {})[remember]
    if (!place || place.page > pages.length) return
    if (ZOOMS.includes(place.zoom)) setZoom(place.zoom)
    if (place.page <= 1) return
    setCurrent(place.page)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = pageEls.current.get(place.page)
      if (el && wrap.current) wrap.current.scrollTop = el.offsetTop - 56
    }))
  }, [remember, url, pages.length, width])
  useEffect(() => {
    if (!remember || restored.current !== `${remember}|${url}`) return
    const all = store.get<Record<string, Place>>(PLACE_KEY, {})
    delete all[remember]
    const keep = Object.entries(all).slice(-199)
    store.set(PLACE_KEY, Object.fromEntries([...keep, [remember, { page: current, zoom }]]))
  }, [current, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // 표시할 영역이 생기면 그 쪽의 해당 위치로 스크롤
  useEffect(() => {
    const box = highlight[0]
    if (box) scrollToPage(box.page, box.v - box.height, true)
  }, [highlight, scale]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reveal && pages.length) scrollToPage(reveal.page, reveal.y, true)
  }, [reveal?.nonce, pages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // 배율이나 칸 폭(목차 칸 · 창 크기)이 바뀌어도 보던 쪽에 머문다
  const keepPage = useRef(1)
  useEffect(() => { keepPage.current = current }, [current])
  useEffect(() => {
    const el = pageEls.current.get(keepPage.current)
    if (el && wrap.current && keepPage.current > 1) wrap.current.scrollTop = el.offsetTop - 56
  }, [scale])

  const onScroll = () => {
    setSel(null)
    setPaintOpen(null)
    const c = wrap.current
    if (!c) return
    const mark = c.scrollTop + c.clientHeight / 3
    let n = 1
    for (const p of pages) { const el = pageEls.current.get(p.page); if (el && el.offsetTop <= mark) n = p.page }
    if (n !== current) setCurrent(n)
  }

  /** 끌어 고른 글을 읽는다 (한 쪽 안에서만) */
  const readSelection = () => {
    const s = window.getSelection()
    if (!s || s.isCollapsed || s.rangeCount === 0) return setSel(null)
    const range = s.getRangeAt(0)
    const node = range.startContainer
    const pageEl = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('.pdf-page')
    if (!pageEl || !wrap.current?.contains(pageEl)) return setSel(null)
    const page = Number(pageEl.dataset.page)
    const box = pageEl.getBoundingClientRect()
    const rects = [...range.getClientRects()]
      .filter((r) => r.width > 1 && r.height > 1 && r.top < box.bottom && r.bottom > box.top)
      .map((r) => [(r.left - box.left) / scale, (r.top - box.top) / scale, r.width / scale, r.height / scale])
    const text = s.toString().replace(/\s+/g, ' ').trim()
    if (!text || !rects.length) return setSel(null)
    const last = rects.at(-1)!
    setMenuAnchor({ x: box.left + (last[0]! + last[2]!) * scale, y: box.top + (last[1]! + last[3]!) * scale })
    setPaintOpen(null)
    setSel({ page, rects: mergeLines(rects).slice(0, 60), text, pageHeight: pages.find((x) => x.page === page)?.heightPt })
  }
  const clearSel = () => { setSel(null); window.getSelection()?.removeAllRanges() }

  if (!url) return <div className="pdf-area" data-ui="PDF" ref={wrap}><p className="empty center pdf-empty">{t('아직 컴파일하지 않았습니다. ', 'Not compiled yet. Press ')}<kbd>⌘↵</kbd>{t('로 컴파일하세요.', ' to compile.')}</p></div>

  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 1e-6)
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 1e-6) : [...ZOOMS].reverse().find((z) => z < zoom - 1e-6)
    setZoom(next ?? ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))]!)
  }
  const goPage = (n: number) => { const p = Math.max(1, Math.min(pages.length, n)); setCurrent(p); scrollToPage(p) }

  return (
    <div className={`pdf-shell${tocOpen && outline.length ? ' toc-open' : ''}`} ref={rootRef}>
      <div className="pdf-tools" data-ui="PDF 도구 막대" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}>
        <button className={`pdf-tool${tocOpen && outline.length ? ' on' : ''}`} data-ui="목차 단추" aria-label={t('목차', 'Contents')} aria-pressed={tocOpen && !!outline.length} disabled={!outline.length}
          title={outline.length ? t('목차', 'Contents') : t('이 PDF에는 목차가 없습니다', 'This PDF has no contents')} onClick={() => setTocOpen(!tocOpen)}><span className="ico">{Icon.list}</span></button>
        <button className={`pdf-tool${find ? ' on' : ''}`} data-ui="찾기 단추" aria-label={t('PDF에서 찾기', 'Find in PDF')} aria-pressed={!!find} disabled={!pages.length}
          title={t('PDF에서 찾기 (⌘F)', 'Find in PDF (⌘F)')} onClick={() => setFind(find ? null : { q: '', i: -1 })}><span className="ico">{Icon.search}</span></button>
        <span className="pdf-tools-sep" />
        {tools?.({ page: current, sel, clearSel })}
        {tools && <span className="pdf-tools-sep" />}
        <button className="pdf-tool" data-ui="축소" title={t('축소', 'Zoom out')} aria-label={t('축소', 'Zoom out')} disabled={zoom <= ZOOMS[0]!} onClick={() => zoomStep(-1)}>−</button>
        <button className="pdf-tool zoom" data-ui="폭에 맞춤" title={t('폭에 맞춤', 'Fit width')} onClick={() => setZoom(1)}>{Math.round(scale * 100)}%</button>
        <button className="pdf-tool" data-ui="확대" title={t('확대', 'Zoom in')} aria-label={t('확대', 'Zoom in')} disabled={zoom >= ZOOMS.at(-1)!} onClick={() => zoomStep(1)}>＋</button>
        <span className="pdf-tools-sep" />
        <button className="pdf-tool" data-ui="이전 쪽" title={t('이전 쪽', 'Previous page')} aria-label={t('이전 쪽', 'Previous page')} disabled={current <= 1} onClick={() => goPage(current - 1)}>‹</button>
        <span className="pdf-pageno" data-ui="쪽 번호">
          <input aria-label={t('쪽', 'Page')} value={pageInput ?? String(current)} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onFocus={(e) => e.target.select()} onBlur={() => setPageInput(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') { goPage(Number(pageInput) || current); setPageInput(null); (e.target as HTMLInputElement).blur() } }} />
          <span className="muted">/ {pages.length || '–'}</span>
        </span>
        <button className="pdf-tool" data-ui="다음 쪽" title={t('다음 쪽', 'Next page')} aria-label={t('다음 쪽', 'Next page')} disabled={current >= pages.length} onClick={() => goPage(current + 1)}>›</button>
      </div>
      {overlay}
      {tocOpen && outline.length > 0 && <PdfToc items={outline} current={current} onGo={(it) => jumpTo(it.page, it.y)} onClose={() => setTocOpen(false)} />}
      {find && <PdfFind query={find.q} onQuery={(q) => setFind({ q, i: -1 })} count={hits.length} index={find.i} loading={findLoading} onStep={stepFind} onClose={() => setFind(null)} />}
      {back.length > 0 && <button className="pdf-back" data-ui="돌아가기" title={t('링크 · 목차로 옮기기 전 자리로', 'Back to where you were before the link or contents jump')} onClick={goBack}>
        ← {t(`돌아가기 · ${back.at(-1)!.page}쪽`, `Back · p. ${back.at(-1)!.page}`)}</button>}
      <div className="pdf-area" data-ui="PDF" ref={wrap} onScroll={onScroll}
        onMouseUp={() => { window.setTimeout(readSelection, 0) }}
        onKeyUp={(e) => { if (e.key === 'Shift' || e.key.startsWith('Arrow')) readSelection() }}
        onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('.record-menu, .pdf-selmenu')) { setSel(null); setPaintOpen(null) } }}>
        {error && <p className="empty center pdf-empty">{t('PDF를 열지 못했습니다', 'Could not open the PDF')}: {error}</p>}
        {pages.map((p) => (
          <div
            key={p.page}
            className="pdf-page"
            data-page={p.page}
            ref={(el) => { if (el) pageEls.current.set(p.page, el) }}
            style={{ width: p.widthPt * scale, height: p.heightPt * scale }}
            onClick={(e) => {
              if (!window.getSelection()?.isCollapsed) return // 글을 고르는 중
              if ((e.target as HTMLElement).closest('.pdf-pin, .pdf-selmenu, .record-menu, .pdf-note, .pdf-note-card, .pdf-link')) return
              const rect = e.currentTarget.getBoundingClientRect()
              const x = (e.clientX - rect.left) / scale
              const y = (e.clientY - rect.top) / scale
              // PDF에 넣은 하이라이트를 누르면 그 글 상자 (10/19 "기록 넣기")
              const mark = (notes.get(p.page) ?? []).findIndex((q) => q.kind === 'mark' && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h)
              if (mark >= 0) { setNoteOpen({ page: p.page, i: mark }); return }
              if (noteOpen) setNoteOpen(null)
              const hit = paints?.find((q) => q.page === p.page && q.rects.some((r) => x >= r[0]! && x <= r[0]! + r[2]! && y >= r[1]! && y <= r[1]! + r[3]!))
              if (hit && paintMenu) { setMenuAnchor({ x: e.clientX, y: e.clientY }); setPaintOpen(hit.id); return }
              onPick(p.page, x, y, textAt(texts.get(p.page) ?? [], x, y))
            }}
          >
            {near.has(p.page) && <canvas ref={(el) => { if (el) canvases.current.set(p.page, el) }} style={{ width: '100%', height: '100%' }} />}
            {paints?.filter((q) => q.page === p.page).map((q) => (
              <div key={q.id} className={`pdf-paint-group${paintOpen === q.id ? ' on' : ''}`}>
                {q.rects.map((r, i) => <div key={i} className="pdf-paint" style={{ left: r[0]! * scale, top: r[1]! * scale, width: r[2]! * scale, height: r[3]! * scale, background: `var(--paint-${q.color})` }} />)}
              </div>
            ))}
            {marks.filter((m) => m.page === p.page).map((m) => (
              <div key={m.id} className={`pdf-mark-group ${m.kind}${m.on ? ' on' : ''}`}>
                {m.rects.map((r, i) => <div key={i} className="pdf-mark" style={{ left: r[0]! * scale - 1, top: r[1]! * scale - 1, width: r[2]! * scale + 2, height: r[3]! * scale + 2, ...(m.color && { background: `var(--paint-${m.color})` }) }} />)}
                <button className="pdf-pin" title={m.title} aria-label={m.kind === 'question' ? t('질문 보기', 'View question') : t('코멘트 보기', 'View comment')}
                  style={{ top: (m.rects[0]?.[1] ?? 8) * scale - 2 }} onClick={() => onMark?.(m.id)}>{m.kind === 'question' ? '?' : <span className="ico">{Icon.comment}</span>}</button>
              </div>
            ))}
            {near.has(p.page) && <TextLayer pieces={texts.get(p.page) ?? NO_TEXT} scale={scale} />}
            {find && hits.map((h, i) => h.page === p.page && h.rects.map((r, k) => (
              <div key={`${i}-${k}`} className={`pdf-find-hit${i === find.i ? ' on' : ''}`} style={{ left: r[0]! * scale, top: r[1]! * scale, width: r[2]! * scale, height: r[3]! * scale }} />
            )))}
            {near.has(p.page) && links.get(p.page)?.map((l, i) => (
              <a key={i} className="pdf-link" data-ui="PDF 링크" href={l.url ?? '#'} target={l.url ? '_blank' : undefined} rel={l.url ? 'noreferrer' : undefined}
                title={l.url ?? t(`${l.to!.page}쪽으로`, `Go to p. ${l.to!.page}`)} style={{ left: l.rect[0]! * scale, top: l.rect[1]! * scale, width: l.rect[2]! * scale, height: l.rect[3]! * scale }}
                onClick={(e) => { if (l.to) { e.preventDefault(); jumpTo(l.to.page, l.to.y) } }} />
            ))}
            {near.has(p.page) && notes.has(p.page) && <NoteLayer notes={notes.get(p.page) ?? NO_NOTES} scale={scale} open={noteOpen?.page === p.page ? noteOpen.i : null} onOpen={(i) => setNoteOpen(i === null ? null : { page: p.page, i })} />}
            {highlight.filter((b) => b.page === p.page).map((b, i) => (
              <div
                key={i}
                className="pdf-highlight"
                style={{ left: b.h * scale - 3, top: (b.v - b.height) * scale - 3, width: b.width * scale + 6, height: b.height * scale + 6 }}
              />
            ))}
            {sel && menuAnchor && sel.page === p.page && selectionMenu && (
              <RecordMenu anchor={menuAnchor} owner={wrap.current} onClose={() => setMenuAnchor(null)}
                onDefault={onSelectionDefault ? () => onSelectionDefault(sel, clearSel) : undefined}>
                {selectionMenu(sel, clearSel)}
              </RecordMenu>
            )}
            {paintMenu && menuAnchor && paints?.filter((q) => q.id === paintOpen && q.page === p.page).map((q) => (
              <RecordMenu key={q.id} anchor={menuAnchor} owner={wrap.current} highlight onClose={() => setPaintOpen(null)}>
                <span className="pdf-paint-menu" data-ui="칠한 곳 메뉴">
                  {paintMenu(q, () => setPaintOpen(null))}
                </span>
              </RecordMenu>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
