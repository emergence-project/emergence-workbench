import { useEffect, useRef, type RefObject } from 'react'

/**
 * 열린 메뉴를 바깥 누르기와 Escape로 닫는다. Escape는 RecordMenu(RecordMenus.tsx)처럼 캡처 단계에서 받아
 * 막으므로 뒤에 있는 창 · 패널은 함께 닫히지 않는다.
 */
export function useDismiss(open: boolean, box: RefObject<Element | null>, close: () => void) {
  const onClose = useRef(close)
  onClose.current = close
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose.current() }
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      e.preventDefault(); e.stopPropagation(); onClose.current()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keydown, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keydown, true) }
  }, [open, box])
}
