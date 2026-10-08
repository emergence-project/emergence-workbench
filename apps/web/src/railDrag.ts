import { useLayoutEffect, useRef, type DragEvent, type RefObject } from 'react'

/**
 * 레일의 프로젝트 버튼 끌기 (10/7 18:07 피드백).
 * 끄는 그림은 둥근 네모만: 가리킬 때 뜨는 툴팁이 함께 찍히지 않게 툴팁 없는 복사본을 그림으로 쓴다.
 */
export function railDragImage(e: DragEvent<HTMLElement>) {
  const el = e.currentTarget
  const copy = el.cloneNode(true) as HTMLElement
  copy.removeAttribute('data-tip')
  copy.classList.remove('on')
  copy.style.position = 'fixed'
  copy.style.top = '-200px'
  copy.style.left = '-200px'
  copy.style.opacity = '1'
  document.body.appendChild(copy)
  const box = el.getBoundingClientRect()
  e.dataTransfer.setDragImage(copy, e.clientX - box.left, e.clientY - box.top)
  setTimeout(() => copy.remove(), 0)
}

/** 순서가 바뀌면 버튼들이 새 자리로 미끄러진다 (FLIP). order는 지금 보이는 순서 */
export function useRailSlide(box: RefObject<HTMLElement | null>, order: string) {
  const tops = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const next = new Map<string, number>()
    for (const b of el.querySelectorAll<HTMLElement>('[data-rid]')) {
      const id = b.dataset.rid!
      const top = b.offsetTop
      next.set(id, top)
      const before = tops.current.get(id)
      if (before === undefined || before === top || matchMedia('(prefers-reduced-motion: reduce)').matches) continue
      b.style.transition = 'none'
      b.style.transform = `translateY(${before - top}px)`
      requestAnimationFrame(() => { b.style.transition = 'transform .15s ease'; b.style.transform = '' })
    }
    tops.current = next
  }, [box, order])
}
