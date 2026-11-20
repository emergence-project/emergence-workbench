/**
 * 툴팁 자리 (11/21): 툴팁은 CSS로 요소 아래 가운데에 뜬다(styles/parts/tooltip.css).
 * 창 끝이나 넘친 것을 자르는 조상(패널 · 목록) 밖으로 나가면 잘리므로, 가리키거나 초점이 갈 때 들어갈 자리를 재서
 * 위로 올리거나(data-tip-up) 왼쪽 · 오른쪽 끝에 맞춘다(data-tip-x). 자리를 직접 정한 것(.tip-right, 레일)은 건드리지 않는다.
 */
export type Box = { top: number; bottom: number; left: number; right: number }

/** 보이는 칸: 창과, 넘친 것을 자르는 조상(패널 등)이 겹치는 곳 */
export function visibleBox(el: Element): Box {
  // 폰에서는 넘친 메뉴 자체가 innerWidth를 넓힌다(화면이 축소된다). 넘쳐도 그대로인 문서 폭으로 잰다
  const b: Box = { top: 0, left: 0, bottom: window.innerHeight, right: Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth) }
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
    const r = p.getBoundingClientRect()
    b.top = Math.max(b.top, r.top); b.left = Math.max(b.left, r.left); b.bottom = Math.min(b.bottom, r.bottom); b.right = Math.min(b.right, r.right)
  }
  return b
}

/**
 * 툴팁을 어디에 둘지. up: 아래에 안 들어가고 위에는 들어갈 때만 위로.
 * x: 지금 맞춤(want: 가운데 · start · end)이 칸을 벗어나면 벗어난 쪽 끝에 맞춘다(안 들어가면 반대쪽, 칸보다 넓으면 왼쪽 끝).
 */
export function tipPlace(el: Box, tip: { width: number; height: number }, box: Box, want: 'center' | 'start' | 'end' = 'center', gap = 2): { up: boolean; x: 'start' | 'end' | null } {
  const below = el.bottom + gap + tip.height <= box.bottom
  const above = el.top - gap - tip.height >= box.top
  const leftOf = (at: 'center' | 'start' | 'end') => at === 'start' ? el.left : at === 'end' ? el.right - tip.width : (el.left + el.right) / 2 - tip.width / 2
  const fits = (at: 'center' | 'start' | 'end') => leftOf(at) >= box.left && leftOf(at) + tip.width <= box.right
  const prefer = leftOf(want) + tip.width > box.right ? (['end', 'start'] as const) : (['start', 'end'] as const)
  const x = fits(want) ? null : prefer.find(fits) ?? 'start'
  return { up: !below && above, x: x === want ? null : x }
}

let ruler: HTMLSpanElement | null = null
function tipSize(text: string, wrap: boolean) {
  if (!ruler) { ruler = document.createElement('span'); ruler.setAttribute('aria-hidden', 'true'); document.body.append(ruler) }
  ruler.className = wrap ? 'tip-ruler wrap' : 'tip-ruler'
  ruler.textContent = text
  const r = ruler.getBoundingClientRect()
  return { width: r.width, height: r.height }
}

function place(target: EventTarget | null) {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null
  if (!el || el.classList.contains('tip-right') || el.classList.contains('rail-proj')) return
  const text = el.getAttribute('data-tip')
  if (!text) return
  const want = el.classList.contains('tip-start') ? 'start' : el.classList.contains('tip-end') ? 'end' : 'center'
  const at = tipPlace(el.getBoundingClientRect(), tipSize(text, el.classList.contains('tip-wrap')), visibleBox(el), want)
  el.toggleAttribute('data-tip-up', at.up)
  if (at.x) el.setAttribute('data-tip-x', at.x); else el.removeAttribute('data-tip-x')
}

/** 앱을 켤 때 한 번: 가리킴과 초점에서 툴팁 자리를 맞춘다 */
export function watchTips() {
  document.addEventListener('pointerover', (e) => place(e.target), true)
  document.addEventListener('focusin', (e) => place(e.target), true)
}
