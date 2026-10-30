import type { CommentEntry, CommentFile, PaintColor } from './api'
import { kindLabel } from './recordLabels'
import { t } from './i18n'

/**
 * 논문 읽기 정리 (10/30 "고른 곳에 질문과 메모를 같이"): 같은 자리(쪽과 고른 글)를 가리키는 하이라이트 · 메모 · 질문을
 * 한 묶음으로. 기록 파일은 그대로이고 화면에서만 묶는다. 고른 글이 없는 기록은 "논문 전체" 묶음 하나.
 */
export interface ReadingGroup {
  key: string
  /** 없으면 논문 전체 */
  page?: number
  y: number
  quote?: string
  rects?: number[][]
  color?: PaintColor
  /** 이 자리의 하이라이트 (메모 없이 칠만 한 곳도 묶음이 된다) */
  highlightId?: string
  items: CommentEntry[]
}

const norm = (q: string) => q.replace(/\s+/g, ' ').trim()

export function readingGroups(file: Pick<CommentFile, 'comments' | 'highlights'>): ReadingGroup[] {
  const groups = new Map<string, ReadingGroup>()
  const at = (e: { page?: number; quote?: string; rects?: number[][] }) => {
    const placed = e.page && e.quote && norm(e.quote)
    const key = placed ? `${e.page}|${norm(e.quote!)}` : 'whole'
    let g = groups.get(key)
    if (!g) {
      g = placed ? { key, page: e.page, y: e.rects?.[0]?.[1] ?? 0, quote: norm(e.quote!), rects: e.rects, items: [] } : { key, y: -1, items: [] }
      groups.set(key, g)
    }
    return g
  }
  for (const h of file.highlights) {
    if (!h.page) continue
    const g = at(h)
    g.highlightId ??= h.id
    g.color ??= h.color
  }
  for (const c of file.comments) {
    const g = at(c)
    g.items.push(c)
    if (g.page && c.color) g.color ??= c.color
  }
  return [...groups.values()].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.y - b.y)
}

/** 정리를 Markdown으로 (쪽 순서). 노트에 붙이거나 에이전트에게 줄 때 */
export function readingMarkdown(title: string, groups: ReadingGroup[]): string {
  const out = [`# ${title}`, '']
  let last: number | undefined | null = null
  for (const g of groups) {
    // 쪽 머리는 쪽이 바뀔 때만
    if (g.page !== last) out.push(g.page ? `## ${t(`${g.page}쪽`, `p. ${g.page}`)}` : `## ${t('논문 전체', 'Whole paper')}`, '')
    last = g.page
    if (g.quote) out.push(`> ${g.quote}`, '')
    for (const c of g.items) {
      if (!c.body.trim() && !c.answers.length) continue
      out.push(`- **${kindLabel(c.kind === '코멘트' ? '메모' : c.kind)}** ${c.body.trim().replace(/\n+/g, ' ')}`)
      for (const a of c.answers) out.push(`  - ${t('답', 'Answer')} (${a.by}): ${a.body.trim().replace(/\n+/g, '\n    ')}`)
    }
    if (out.at(-1) !== '') out.push('')
  }
  return `${out.join('\n').trim()}\n`
}
