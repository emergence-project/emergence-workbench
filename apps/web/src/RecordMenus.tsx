import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PaintColor } from './api/papers'
import { isDialogHostDisplayed } from './dialogVisibility'
import { t } from './i18n'

const PAINTS: { color: PaintColor; label: string; en: string }[] = [
  { color: 'yellow', label: '노랑', en: 'yellow' }, { color: 'green', label: '초록', en: 'green' },
  { color: 'blue', label: '파랑', en: 'blue' }, { color: 'pink', label: '분홍', en: 'pink' },
]

const paintTip = (paint: { label: string; en: string }, action: '하이라이트' | '바꾸기') =>
  t(`${paint.label}으로 ${action}`, action === '하이라이트' ? `Highlight ${paint.en}` : `Change to ${paint.en}`)

export function PaintDots({ color, onChange, disabled, action = '하이라이트' }: {
  color: PaintColor; onChange(color: PaintColor): void; disabled?: boolean; action?: '하이라이트' | '바꾸기'
}) {
  return <div className="record-colors" role="group" aria-label={t('하이라이트 색', 'Highlight color')}>
    {PAINTS.map((paint) => <button key={paint.color} type="button" className="record-swatch"
      style={{ background: `linear-gradient(var(--paint-${paint.color}), var(--paint-${paint.color})), var(--paper)` }}
      title={paintTip(paint, action)} aria-label={paintTip(paint, action)}
      aria-pressed={color === paint.color} disabled={disabled} onClick={() => onChange(paint.color)} />)}
  </div>
}

/** 글 선택을 유지하면서 스크롤 칸 밖에 띄우는 공용 기록 메뉴. anchor는 뷰포트 좌표다. */
export function RecordMenu({ anchor, highlight = false, owner, onClose, onDefault, children }: {
  anchor: { x: number; y: number }; highlight?: boolean; owner?: HTMLElement | null
  onClose?(): void; onDefault?(): void; children: ReactNode
}) {
  const host = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [displayed, setDisplayed] = useState(false)
  const [position, setPosition] = useState(anchor)
  const callbacks = useRef({ onClose, onDefault })
  callbacks.current = { onClose, onDefault }

  useLayoutEffect(() => {
    const element = owner ?? host.current
    if (!element) return
    const refresh = () => setDisplayed(isDialogHostDisplayed(element))
    refresh()
    const resize = new ResizeObserver(refresh)
    resize.observe(element)
    const changes = new MutationObserver(refresh)
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      changes.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
    }
    return () => { resize.disconnect(); changes.disconnect() }
  }, [owner])

  useLayoutEffect(() => {
    const element = menu.current
    if (!displayed || !element) return
    const positionMenu = () => {
      const rect = element.getBoundingClientRect()
      const gap = parseFloat(getComputedStyle(element).paddingLeft) || 0
      const x = Math.max(gap, Math.min(anchor.x, window.innerWidth - rect.width - gap))
      const preferredY = anchor.y + gap
      const y = Math.max(gap, Math.min(preferredY + rect.height <= window.innerHeight - gap ? preferredY : anchor.y - rect.height - gap, window.innerHeight - rect.height - gap))
      setPosition((current) => current.x === x && current.y === y ? current : { x, y })
    }
    positionMenu()
    const resize = new ResizeObserver(positionMenu)
    resize.observe(element)
    window.addEventListener('resize', positionMenu)
    return () => { resize.disconnect(); window.removeEventListener('resize', positionMenu) }
  }, [anchor.x, anchor.y, displayed])

  useEffect(() => {
    if (!displayed) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) callbacks.current.onClose?.()
    }
    const scroll = (event: Event) => {
      const target = event.target
      const element = owner ?? host.current
      if (target instanceof Node && element && !menu.current?.contains(target) && (target.contains(element) || element.contains(target))) callbacks.current.onClose?.()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !isDialogHostDisplayed(owner ?? host.current)) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); callbacks.current.onClose?.() }
      const target = event.target
      const interactive = target instanceof Element && target.closest('button, input, textarea, select, [contenteditable="true"]')
      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !interactive && callbacks.current.onDefault) {
        event.preventDefault(); event.stopPropagation(); callbacks.current.onDefault()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('scroll', scroll, true)
    }
  }, [displayed, owner])

  return <>
    <span ref={host} className="record-menu-host" aria-hidden="true" />
    {displayed && createPortal(<div ref={menu} className={`record-menu${highlight ? ' record-menu-highlight' : ''}`}
      data-ui={highlight ? '하이라이트 메뉴' : '고른 글 메뉴'} role="toolbar" aria-label={highlight ? t('하이라이트 메뉴', 'Highlight menu') : t('고른 글 메뉴', 'Selection menu')}
      style={{ left: position.x, top: position.y }} onMouseDown={(event) => event.preventDefault()}>
      {children}
    </div>, document.body)}
  </>
}
