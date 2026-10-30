import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * PDF 안에서 이동 (10/30 "논문 라이브러리와 읽기 개선" 1번): 목차 · 찾기 · 링크 따라가기.
 * 좌표는 모두 PDF 포인트, 쪽 왼쪽 위 원점 (PdfView와 같다).
 */

/** 쪽 위의 글자 조각. y는 기준선 */
export interface TextPiece { str: string; x: number; y: number; w: number; h: number }
/** 목차 한 줄 */
export interface OutlineItem { title: string; depth: number; page: number; y: number | null }
/** 쪽 안의 링크: 다른 자리(인용 · 식 · 그림 번호) 또는 바깥 주소 */
export interface PdfLink { rect: number[]; to?: { page: number; y: number | null }; url?: string }
/** 찾은 곳: 쪽과 줄마다 사각형 [x, y, w, h] */
export interface FindHit { page: number; rects: number[][] }

const isRef = (v: unknown): v is { num: number; gen: number } =>
  typeof v === 'object' && v !== null && 'num' in v && 'gen' in v

/** 이름 있는 자리나 자리 배열을 쪽 번호(1부터)와 쪽 위 높이로. 읽지 못하면 null */
export async function resolveDest(doc: PDFDocumentProxy, dest: unknown, heights: number[]): Promise<{ page: number; y: number | null } | null> {
  try {
    const arr: unknown = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(arr) || !arr.length) return null
    const head: unknown = arr[0]
    const index = typeof head === 'number' ? head : isRef(head) ? await doc.getPageIndex(head) : -1
    if (index < 0 || index >= doc.numPages) return null
    const mode: unknown = arr[1]
    const name = typeof mode === 'object' && mode !== null && 'name' in mode ? String(mode.name) : ''
    // XYZ left top zoom · FitH top · FitBH top: top은 아래 원점이므로 쪽 높이에서 뺀다
    const top: unknown = name === 'XYZ' ? arr[3] : name === 'FitH' || name === 'FitBH' ? arr[2] : null
    const height = heights[index]
    return { page: index + 1, y: typeof top === 'number' && height ? Math.max(0, height - top) : null }
  } catch { return null }
}

interface OutlineNode { title: string; dest: unknown; items: OutlineNode[] }

/** PDF에 들어 있는 책갈피를 펼친 목록으로. 없으면 빈 목록 */
export async function readOutline(doc: PDFDocumentProxy, heights: number[]): Promise<OutlineItem[]> {
  const tree: OutlineNode[] | null = await doc.getOutline()
  const out: OutlineItem[] = []
  const walk = async (nodes: OutlineNode[], depth: number) => {
    for (const n of nodes) {
      const to = await resolveDest(doc, n.dest, heights)
      if (to) out.push({ title: n.title.trim() || '—', depth, page: to.page, y: to.y })
      if (n.items?.length && depth < 3) await walk(n.items, depth + 1)
    }
  }
  await walk(tree ?? [], 0)
  return out
}

interface LinkAnnotation { subtype?: string; rect?: number[]; dest?: unknown; url?: string; unsafeUrl?: string }

/** 쪽 주석 중 링크만. 자리를 가리키는 링크는 그 쪽 · 높이를 미리 풀어 둔다 */
export async function readLinks(doc: PDFDocumentProxy, annots: LinkAnnotation[], pageHeight: number, heights: number[]): Promise<PdfLink[]> {
  const links: PdfLink[] = []
  for (const a of annots) {
    if (a.subtype !== 'Link' || !a.rect || a.rect.length < 4) continue
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = a.rect
    const rect = [Math.min(x1, x2), pageHeight - Math.max(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)]
    const url = a.url ?? a.unsafeUrl
    if (url && /^https?:\/\//i.test(url)) { links.push({ rect, url }); continue }
    if (a.dest == null) continue
    const to = await resolveDest(doc, a.dest, heights)
    if (to) links.push({ rect, to })
  }
  return links
}

/**
 * 한 쪽에서 찾기 (대소문자 무시, 빈칸 여럿은 하나로). 글자 조각이 한 낱말을 나눠 가져도 이어 찾도록
 * 가까이 붙은 조각은 빈칸 없이, 떨어진 조각은 빈칸 하나로 잇는다. 사각형은 조각 안 글자 폭 비율로 어림한다
 * (measure가 있으면 그 글꼴 폭으로, 없으면 글자 수로).
 */
export function findInPage(pieces: TextPiece[], query: string, page: number, measure?: (s: string) => number): FindHit[] {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!q) return []
  const chars: string[] = []
  const owner: { piece: number; at: number }[] = []
  pieces.forEach((p, i) => {
    const prev = pieces[i - 1]
    const glued = prev && Math.abs(prev.y - p.y) < p.h * 0.5 && p.x - (prev.x + prev.w) < p.h * 0.15
    if (i > 0 && !glued && chars.at(-1) !== ' ') { chars.push(' '); owner.push({ piece: -1, at: 0 }) }
    for (let k = 0; k < p.str.length; k++) {
      const c = /\s/.test(p.str[k]!) ? ' ' : p.str[k]!.toLowerCase()
      if (c === ' ' && chars.at(-1) === ' ') continue
      chars.push(c); owner.push({ piece: i, at: k })
    }
  })
  const text = chars.join('')
  const hits: FindHit[] = []
  for (let from = text.indexOf(q); from >= 0; from = text.indexOf(q, from + q.length)) {
    const spans = new Map<number, [number, number]>()
    for (let j = from; j < from + q.length; j++) {
      const o = owner[j]!
      if (o.piece < 0) continue
      const s = spans.get(o.piece)
      spans.set(o.piece, s ? [s[0], o.at + 1] : [o.at, o.at + 1])
    }
    const rects = [...spans].map(([i, [a, b]]) => {
      const p = pieces[i]!
      const whole = measure?.(p.str) ?? 0
      const at = (k: number) => (whole && measure ? (p.w * measure(p.str.slice(0, k))) / whole : p.str.length ? (p.w * k) / p.str.length : 0)
      return [p.x + at(a), p.y - p.h * 0.85, at(b) - at(a), p.h]
    })
    if (rects.length) hits.push({ page, rects })
  }
  return hits
}
