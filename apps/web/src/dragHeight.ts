import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** 저장값·끌기 결과를 지금 칸에 들어가는 높이로 제한한다. */
export function clampDragHeight(height: number, min: number, max: number, fallback = min): number {
  return Math.min(Math.max(min, max), Math.max(min, Number.isFinite(height) ? height : fallback))
}

/**
 * 위쪽 경계를 끌어 높이를 바꾸는 칸 (10/4 피드백: 목차 칸 크기 조절, 인용한 논문을 VS Code 터미널처럼).
 * 위로 끌면 커지고 아래로 끌면 작아진다. 높이는 이 브라우저에만 기억한다.
 */
export function useDragHeight(key: string, initial: number, min = 60, max = 600): [number, (e: ReactPointerEvent) => void] {
  const [h, setH] = useState(() => {
    try { const v = localStorage.getItem(key); return clampDragHeight(v === null ? initial : Number(v), min, max, initial) } catch { return clampDragHeight(initial, min, max) }
  })
  const height = clampDragHeight(h, min, max, initial)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const start = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    cleanup.current?.()
    const y0 = e.clientY
    const h0 = height
    let last = h0
    const onMove = (ev: PointerEvent) => { last = clampDragHeight(h0 - (ev.clientY - y0), min, max); setH(last) }
    const onUp = () => {
      cleanup.current?.()
      try { localStorage.setItem(key, String(last)) } catch { /* 무시 */ }
    }
    cleanup.current = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('resizing-rows')
      cleanup.current = null
    }
    document.body.classList.add('resizing-rows')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  return [height, start]
}
