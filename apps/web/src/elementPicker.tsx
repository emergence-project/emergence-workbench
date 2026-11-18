import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { uiShown } from './uiNames'
import { t } from './i18n'

/**
 * 화면 부위 고르기: 피드백 모드, 기록의 가리키기, 대화에 화면 요소 붙이기가 함께 쓴다 (한 곳을 고치면 셋 다 바뀌게).
 * 화면 부위(data-ui가 붙은 요소)에 마우스를 올리면 이름표가 뜨고, 누르면 그 부위를 돌려준다. 누른 순간의 앱 동작(버튼, 편집기 커서 등)은 막는다.
 * 부위 이름은 바깥 부위부터 이어 붙인다: data-ui="블록" > data-ui="속성 표" > data-ui="다른 시도"
 *   → "블록 › 속성 표 › 다른 시도"
 */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 같은 종류가 여럿인 부위(카드, 블록 칩 등)는 data-ui-item으로 어느 것인지 덧붙인다: 카드 “Cor 3.9.1 거리 보존” */
export function uiPath(el: Element | null): string {
  const names: string[] = []
  for (let cur = el; cur; cur = cur.parentElement) {
    const n = cur.getAttribute('data-ui')
    if (!n) continue
    const item = cur.getAttribute('data-ui-item')
    names.push(item ? `${n} “${clip(item, 24)}”` : n)
  }
  return names.reverse().join(' › ')
}

/** 가리킨 부위의 글자. 요소 사이 글자가 붙지 않게(<b>다음</b>Prop → 다음 Prop) 글자 조각마다 띄운다 */
export function snippetOf(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return clip(el.value.trim(), 80)
  const parts: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n && parts.join(' ').length < 120; n = walker.nextNode()) parts.push(n.textContent ?? '')
  return clip(parts.join(' ').replace(/\s+/g, ' ').trim(), 80)
}

export interface PickHover { rect: DOMRect; path: string }
/** 누른 부위: 이름, 글자, 누른 자리, 그 순간의 상자 */
export interface Picked { path: string; snippet: string; x: number; y: number; rect: DOMRect }

const BLOCKED = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const

/**
 * skip: 고르지 않는 자기 창(막대, 입력 창)의 선택자. 그 위의 누르기는 앱 동작 그대로 둔다.
 * hold: 참인 동안 이름표를 옮기지 않는다 (피드백 창을 연 동안). 누르면 다시 고른다
 */
export function usePickElement(o: { skip: string; bodyClass: string; onPick(p: Picked): void; onEscape(): void; hold?(): boolean }) {
  const [hover, setHover] = useState<PickHover | null>(null)
  const hoverEl = useRef<Element | null>(null)
  const latest = useRef(o)
  latest.current = o
  const { skip, bodyClass } = o
  useEffect(() => {
    const own = (e: Event) => e.target instanceof Element && !!e.target.closest(skip)
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest('[data-ui]') : null)
    const show = (el: Element | null) => { hoverEl.current = el; setHover(el ? { rect: el.getBoundingClientRect(), path: uiPath(el) } : null) }
    const move = (e: MouseEvent) => {
      if (latest.current.hold?.()) return
      if (own(e)) { if (hoverEl.current) show(null); return }
      const el = target(e)
      // 같은 부위 안에서 움직이면 다시 그리지 않는다 (스크롤하면 refresh가 상자를 옮긴다)
      if (el !== hoverEl.current) show(el)
    }
    const block = (e: Event) => { if (own(e)) return; e.preventDefault(); e.stopPropagation() }
    const click = (e: MouseEvent) => {
      if (own(e)) return
      block(e)
      const el = target(e)
      if (el) latest.current.onPick({ path: uiPath(el), snippet: snippetOf(el), x: e.clientX, y: e.clientY, rect: el.getBoundingClientRect() })
    }
    const refresh = () => { const el = hoverEl.current; if (el) setHover({ rect: el.getBoundingClientRect(), path: uiPath(el) }) }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 뒤에 열린 대화상자까지 닫히지 않게 여기서 멈춘다
      e.preventDefault()
      e.stopPropagation()
      latest.current.onEscape()
    }
    window.addEventListener('mousemove', move, true)
    for (const name of BLOCKED) window.addEventListener(name, block, true)
    window.addEventListener('click', click, true)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('keydown', key, true)
    document.body.classList.add(bodyClass)
    return () => {
      window.removeEventListener('mousemove', move, true)
      for (const name of BLOCKED) window.removeEventListener(name, block, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('keydown', key, true)
      document.body.classList.remove(bodyClass)
    }
  }, [skip, bodyClass])
  return { hover, clear: () => { hoverEl.current = null; setHover(null) } }
}

/** 마우스 아래 부위의 상자와 이름표 */
export function PickHighlight({ hover }: { hover: PickHover | null }) {
  if (!hover) return null
  const { rect } = hover
  return <>
    <div className="fb-box" data-picker-ui style={{ left: rect.left - 2, top: rect.top - 2, width: rect.width + 4, height: rect.height + 4 }} />
    <div className="fb-label" data-picker-ui style={{ left: Math.max(4, rect.left - 2), top: rect.top > 28 ? rect.top - 24 : rect.bottom + 4 }}>{uiShown(hover.path)}</div>
  </>
}

/**
 * 한 번 고르고 끝나는 고르기 (기록의 가리키기, 대화에 화면 요소 붙이기): 상자와 이름표, 아래 막대(제목 · 안내 · 취소).
 * skip에 더 준 선택자 위는 고르지 않는다 (대화 입력란 등). 사이드바 안에서 열어도 화면 기준으로 뜨게 body에 그린다
 */
export function ElementPicker({ title, hint, skip, onPick, onCancel }: { title: string; hint: string; skip?: string; onPick(p: Picked): void; onCancel(): void }) {
  const { hover } = usePickElement({ skip: skip ? `[data-picker-ui], ${skip}` : '[data-picker-ui]', bodyClass: 'element-picking', onPick, onEscape: onCancel })
  return createPortal(<>
    <PickHighlight hover={hover} />
    <div className="fb-bar" data-picker-ui role="status">
      <b>{title}</b><span>{hint}</span>
      <button className="btn sm" onClick={onCancel}>{t('취소', 'Cancel')}</button>
    </div>
  </>, document.body)
}
