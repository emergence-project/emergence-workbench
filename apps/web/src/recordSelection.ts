import { useEffect, useRef, type RefObject } from 'react'
import type { RecordSelection } from './RecordContext'
import { readRecordSelection } from './recordMarks'

/**
 * Watch text selections inside `box` (read view, `.ob-md`) and report them as source anchors.
 * The editor (`.cn-edit`) and the record menus report their own selections, so they are skipped.
 * Shared by research-note records (Comments.tsx) and concept-note memos (ConceptRecords.tsx).
 */
export function useRecordSelection(box: RefObject<HTMLElement | null>, source: string, contentOffset: number, onSelect: (selection: RecordSelection | null) => void) {
  const report = useRef(onSelect)
  report.current = onSelect
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onUp = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Shift' && !event.key.startsWith('Arrow')) return
      if ((event.target as Element).closest?.('[data-ui="고른 글 메뉴"], [data-ui="하이라이트 메뉴"], .cn-edit')) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const s = window.getSelection()
        if (!s || !box.current || !box.current.contains(s.anchorNode) || !box.current.contains(s.focusNode)) { report.current(null); return }
        const element = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement
        if (element?.closest('.cn-edit')) return
        const root = element?.closest<HTMLElement>('.ob-md')
        report.current(root && box.current.contains(root) ? readRecordSelection(root, s, source, contentOffset) : null)
      }, 0)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keyup', onUp)
    return () => { clearTimeout(timer); document.removeEventListener('mouseup', onUp); document.removeEventListener('keyup', onUp) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- box는 ref라 바뀌지 않는다
  }, [source, contentOffset])
}
