import { useEffect, useLayoutEffect, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { useRecordContext } from './RecordContext'
import { paintRecordMarks } from './recordMarks'
import { recordRevealRange } from './recordHelpers'
import { selectionAnchor } from './recordAnchors'

/**
 * Paint record highlights on rendered Markdown, flash the one to reveal, and open a highlight's menu on click.
 * Research notes (NoteMarkdown) and concept notes (ObsidianMarkdown) share it; without a RecordContext it does nothing.
 * `html` is the rendered markup: painting runs again whenever it changes.
 */
export function useRecordPaint(ref: RefObject<HTMLDivElement | null>, html: string) {
  const records = useRecordContext()
  useLayoutEffect(() => {
    if (ref.current && records) return paintRecordMarks(ref.current, records.source, records.contentOffset, records.highlights)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- records 객체는 렌더마다 새로 만들어지므로 쓰는 칸만 본다
  }, [html, records?.source, records?.contentOffset, records?.highlights])
  useEffect(() => {
    const root = ref.current
    if (!root || !records?.reveal) return
    const reveal = records.reveal
    const range = recordRevealRange(records.source, reveal)
    const anchor = range && selectionAnchor(records.source, range.from, range.to)
    if (!anchor) return
    const selector = `[data-record-id="${CSS.escape(reveal.id)}"]`
    const remove = root.querySelector(selector) ? undefined : paintRecordMarks(root, records.source, records.contentOffset, [{ id: reveal.id, rects: [], color: 'yellow', ...anchor }])
    const marks = [...root.querySelectorAll<HTMLElement>(selector)]
    marks[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const color = getComputedStyle(root).getPropertyValue('--hl-bg').trim()
    const animations = marks.map((mark) => mark.animate([{ backgroundColor: color }, { backgroundColor: getComputedStyle(mark).backgroundColor }], { duration: 1600 }))
    const timer = remove ? setTimeout(remove, 1600) : undefined
    return () => { if (timer) clearTimeout(timer); remove?.(); animations.forEach((animation) => animation.cancel()) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록 열기(nonce)가 바뀔 때만 그 자리로 간다
  }, [html, records?.reveal?.nonce])
  /** True when the event hit a highlight and its menu was opened. */
  const openMark = (event: MouseEvent | KeyboardEvent): boolean => {
    const mark = (event.target as Element).closest<HTMLElement>('[data-record-id]')
    if (!mark || !records) return false
    if ('key' in event ? event.key !== 'Enter' && event.key !== ' ' : window.getSelection()?.isCollapsed === false) return false
    event.preventDefault(); event.stopPropagation()
    const rect = mark.getBoundingClientRect()
    records.onHighlight(mark.dataset.recordId!, { x: rect.left, y: rect.bottom })
    return true
  }
  return openMark
}
