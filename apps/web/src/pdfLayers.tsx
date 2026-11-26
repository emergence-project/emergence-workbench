import { memo, useMemo } from 'react'
import { Icon } from './icons'
import type { TextPiece } from './pdfNav'
import { store } from './store'

/** 주석 중 앱이 읽는 칸 (쪽지 · 하이라이트 · 링크) */
export interface Annotation { subtype?: string; rect?: number[]; contentsObj?: { str?: string }; titleObj?: { str?: string }; dest?: unknown; url?: string; unsafeUrl?: string }

/** 누른 곳의 글자. 너무 짧은 조각(기호 하나)이면 같은 줄의 가까운 긴 조각을 쓴다. */
export function textAt(pieces: TextPiece[], x: number, y: number): string {
  const sameLine = pieces.filter((p) => p.str.trim() && y >= p.y - p.h - 2 && y <= p.y + 3)
  const dist = (p: TextPiece) => (x < p.x ? p.x - x : x > p.x + p.w ? x - p.x - p.w : 0)
  const byDist = [...sameLine].sort((a, b) => dist(a) - dist(b))
  const hit = byDist[0]
  if (!hit) return ''
  if (/[\p{L}]{2}/u.test(hit.str)) return hit.str
  return byDist.find((p) => /[\p{L}]{2}/u.test(p.str) && dist(p) < 60)?.str ?? hit.str
}

/** 같은 줄의 사각형을 하나로 합친다 (글자 조각마다 하나씩 나오므로) */
export function mergeLines(rects: number[][]): number[][] {
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
export interface PdfNote { kind: 'note' | 'mark'; x: number; y: number; w: number; h: number; title: string; text: string }
export const NO_NOTES: PdfNote[] = []

/** 쪽지 아이콘과 누른 주석의 글. 하이라이트는 캔버스가 그리고, 누르면 같은 글 상자가 열린다 */
export const NoteLayer = memo(function NoteLayer({ notes, scale, open, onOpen }: { notes: PdfNote[]; scale: number; open: number | null; onOpen(i: number | null): void }) {
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
/** 글자 폭을 재는 캔버스 하나를 글 층과 함께 쓴다 */
export function measureContext() { measureCtx ??= document.createElement('canvas').getContext('2d'); return measureCtx }
/**
 * 고를 수 있는 글자 층: 보이지 않는 글자를 캔버스의 글자 자리에 겹쳐 둔다 (pdf.js 텍스트 층과 같은 방식).
 * 폭은 글꼴이 달라도 PDF의 폭에 맞게 가로로 늘이거나 줄인다.
 */
export const TextLayer = memo(function TextLayer({ pieces, scale }: { pieces: TextPiece[]; scale: number }) {
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

/** pdf.js는 서버 오류를 "Unexpected server response (500)"로만 알린다. 서버가 JSON으로 적은 까닭이 있으면 그것을 보인다 (11/8 피드백) */
export async function serverReason(url: string, e: unknown): Promise<string> {
  const plain = e instanceof Error ? e.message : String(e)
  if (!(e instanceof Error && 'status' in e && typeof e.status === 'number' && e.status >= 400)) return plain
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (r.ok) return plain
    const body: unknown = await r.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error) return body.error
  } catch { /* 까닭을 못 읽으면 pdf.js의 말 */ }
  return plain
}
