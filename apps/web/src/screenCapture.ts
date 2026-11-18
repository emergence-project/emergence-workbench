/**
 * 화면 그림 (피드백 모드의 코멘트, 대화에 붙이는 화면 요소). 에이전트는 글만으로는 사용자 화면을 볼 수 없어서 함께 남긴다.
 * 피드백 모드와 고르기 막대처럼 앱 위에 잠시 뜬 창(OWN_UI)은 빼고 찍는다
 */
const OWN_UI = '[data-feedback-ui], [data-picker-ui]'

/**
 * 코멘트를 남기는 순간의 화면 그림 (JPEG). 에이전트는 글만으로는 사용자 화면을 볼 수 없어서 함께 남긴다.
 * 피드백 모드 자체의 창은 빼고, PDF처럼 그림으로 옮길 수 없는 부분은 비어 보일 수 있다. 실패해도 코멘트는 그대로 저장한다.
 * 찍는 일(모든 요소의 스타일 복사)은 화면을 1–3초 멈춘다. 부위를 누를 때 찍으면 입력 창이 늦게 뜨고 쓰는 동안 멈춰서
 * ("피드백 모드에서 유독 렉", 10/16), 등록을 누를 때 찍는다. 그 사이 앱은 눌러도 반응하지 않아 뒤 화면은 그대로다
 */
/**
 * html-to-image는 <svg>를 통째로 복사하고 그 안의 요소에는 계산된 스타일을 옮기지 않는다. 그림 안에는 페이지 CSS가 없어
 * 클래스로 칠한 SVG(차트 등)가 검은 덩어리로 찍혔다 (10/15 09:49 그림). 찍는 동안만 SVG 안 요소에 계산된 칠을 적어 두고 되돌린다
 */
const SVG_PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'paint-order', 'font-size', 'font-weight', 'font-family', 'display', 'visibility'] as const
function inlineSvgPaint(): () => void {
  const saved: [SVGElement, string | null][] = []
  for (const svg of document.querySelectorAll('svg')) {
    if (svg.parentElement?.closest('svg') || !onScreen(svg) || svg.closest(OWN_UI)) continue
    for (const el of svg.querySelectorAll('*')) if (el instanceof SVGElement) saved.push([el, el.getAttribute('style')])
  }
  // 먼저 모두 읽고 나서 쓴다. 읽고 쓰기를 번갈아 하면 요소마다 스타일을 다시 계산해 큰 차트에서 십여 초 멈췄다
  const paints = saved.map(([el]) => { const cs = getComputedStyle(el); return SVG_PAINT.map((k) => cs.getPropertyValue(k)) })
  saved.forEach(([el], i) => SVG_PAINT.forEach((k, j) => el.style.setProperty(k, paints[i]?.[j] ?? '')))
  return () => { for (const [el, style] of saved) { if (style === null) el.removeAttribute('style'); else el.setAttribute('style', style) } }
}

/**
 * 찍는 시간은 복사하는 요소 수에 비례한다. 화면 밖까지 노트 전체를 복사하면 수식이 많은 노트(요소 수만 개)에서 등록이 수십 초
 * 멈췄다 (10/21 09:27). 화면에 보이는 요소만 복사한다. 열어 둔 다른 탭도 숨긴 채 남아 있어 함께 뺀다.
 * html-to-image는 스크롤 위치를 옮기지 않아, 위로 지나간 요소를 빼면 그림이 사용자가 보던 자리에 더 가깝다
 */
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect()
  // 크기가 없으면: 숨긴 탭(display: none)은 통째로 빼고, display: contents처럼 자식이 보일 수 있는 것은 남긴다.
  // checkVisibility()는 상자가 없는 display: contents에도 false라 따로 본다 (11/8 20:31 그림: 지금 처리 카드의 줄이 빠져 빈 칸으로 찍혔다)
  if (!r.width && !r.height) return getComputedStyle(el).display === 'contents' || (el.checkVisibility?.() ?? true)
  // 위아래로 조금 넉넉히: 반쯤 보이는 줄의 수식 첨자처럼 부모 상자 밖으로 나온 조각을 남긴다
  const m = 120
  return r.bottom >= -m && r.top <= innerHeight + m && r.right >= 0 && r.left <= innerWidth
}

/**
 * 그림에 옮기는 스타일. 정하지 않으면 요소마다 계산된 스타일 500여 개를 모두 옮겨, 보이는 요소 4천 개에 6초가 걸렸다.
 * 모양을 바꾸는 것만 옮겨 1초 남짓으로 줄인다 (10/21 09:27)
 */
const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'inset', 'z-index', 'float', 'clear', 'box-sizing', 'width', 'height', 'min-width',
  'min-height', 'max-width', 'max-height', 'aspect-ratio', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius',
  'border-bottom-right-radius', 'border-collapse', 'border-spacing', 'table-layout', 'caption-side', 'empty-cells', 'outline-width', 'outline-style',
  'outline-color', 'outline-offset', 'box-shadow', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'align-items',
  'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self', 'row-gap', 'column-gap', 'grid-template-columns',
  'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows', 'grid-column-start', 'grid-column-end',
  'grid-row-start', 'grid-row-end', 'overflow-x', 'overflow-y', 'text-overflow', 'clip-path', 'transform', 'transform-origin', 'opacity',
  'visibility', 'mix-blend-mode', 'filter', 'color', 'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-clip', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-feature-settings',
  'font-variant-numeric', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration-line', 'text-decoration-color',
  'text-decoration-style', 'text-decoration-thickness', 'text-underline-offset', 'text-transform', 'text-indent', 'text-shadow', 'white-space',
  'word-break', 'overflow-wrap', 'hyphens', 'vertical-align', 'direction', 'unicode-bidi', 'writing-mode', 'tab-size', 'list-style-type',
  'list-style-position', 'list-style-image', 'content', 'quotes', 'counter-reset', 'counter-increment', 'object-fit', 'object-position', 'fill',
  'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'paint-order', 'd',
  '-webkit-line-clamp', '-webkit-box-orient', 'line-clamp', 'column-count', 'column-width', 'scrollbar-width', 'contain', 'isolation',
  '-webkit-text-fill-color', '-webkit-background-clip', 'mask-image', '-webkit-mask-image', 'backdrop-filter'
]

/**
 * 고르기 상자는 그림에 옮기면 맥(WebKit)에서 글자 없이 빈 칸으로 찍혔다 (10/30 · 11/4 그림의 대화 프로젝트 · 피드백 상태 상자).
 * 화면에서는 이름이 보이는데 그림에서만 비어, 사용자 화면이 깨진 것처럼 읽혔다. 찍는 동안만 상자를 같은 모양의 글자 칸으로 바꿔 두고 되돌린다
 */
function swapSelects(): () => void {
  const swapped: [HTMLSelectElement, HTMLSpanElement, string | null][] = []
  for (const sel of document.querySelectorAll('select')) {
    if (sel.multiple || sel.closest(OWN_UI) || !onScreen(sel)) continue
    const r = sel.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const cs = getComputedStyle(sel)
    const span = document.createElement('span')
    for (const k of STYLE_PROPS) span.style.setProperty(k, cs.getPropertyValue(k))
    span.style.setProperty('display', cs.display.startsWith('inline') ? 'inline-flex' : 'flex')
    span.style.setProperty('align-items', 'center')
    span.style.setProperty('overflow', 'hidden')
    span.style.setProperty('white-space', 'nowrap')
    span.style.setProperty('width', `${r.width}px`)
    span.style.setProperty('height', `${r.height}px`)
    span.textContent = sel.selectedOptions[0]?.textContent ?? ''
    swapped.push([sel, span, sel.getAttribute('style')])
    sel.after(span)
    sel.style.setProperty('display', 'none')
  }
  return () => { for (const [sel, span, style] of swapped) { span.remove(); if (style === null) sel.removeAttribute('style'); else sel.setAttribute('style', style) } }
}

export const loadCapture = () => import('html-to-image')
/** 글꼴을 그림에 넣는 CSS(수백 KB)는 한 번만 만든다 */
let fontCss: Promise<string> | null = null

export async function captureScreen(): Promise<string | null> {
  let restore: (() => void) | null = null
  try {
    const { toJpeg, getFontEmbedCSS } = await loadCapture()
    fontCss ??= getFontEmbedCSS(document.body).catch((e) => { fontCss = null; throw e })
    const fontEmbedCSS = await fontCss
    const paint = inlineSvgPaint()
    const selects = swapSelects()
    restore = () => { selects(); paint() }
    return await toJpeg(document.body, {
      quality: 0.8, pixelRatio: 1, width: innerWidth, height: innerHeight, fontEmbedCSS, includeStyleProperties: STYLE_PROPS,
      // 그림 주소는 ?path=…로만 다르다(/api/feedback/picture 등). 빼면 html-to-image가 물음표 뒤를 버린 주소로 캐시해 다른 그림을 다시 쓴다 (10/13 09:59 그림)
      includeQueryParams: true,
      filter: (n) => !(n instanceof Element) || (!n.matches(OWN_UI) && onScreen(n)),
    })
  } catch { return null } finally { restore?.() }
}

/**
 * 화면 그림에서 한 부위(rect, 화면 좌표) 둘레만 잘라 낸다. 그림은 pixelRatio 1이라 화면 좌표가 그대로 그림 좌표다.
 * 둘레를 조금 넉넉히 남겨 부위가 화면 어디에 있는지 보이게 한다
 */
export async function cropShot(url: string, rect: { left: number; top: number; width: number; height: number }, margin = 40): Promise<{ type: 'image/jpeg'; data: string } | null> {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const x = Math.max(0, Math.floor(rect.left - margin)), y = Math.max(0, Math.floor(rect.top - margin))
    const w = Math.min(img.width, Math.ceil(rect.left + rect.width + margin)) - x, h = Math.min(img.height, Math.ceil(rect.top + rect.height + margin)) - y
    if (w <= 0 || h <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')?.drawImage(img, x, y, w, h, 0, 0, w, h)
    const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
    return data ? { type: 'image/jpeg', data } : null
  } catch { return null }
}
