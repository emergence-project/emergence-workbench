import { Icon } from './icons'
import { feedbackNote } from './feedbackNote'
import { useEffect, useRef, useState } from 'react'
import { api, feedbackChanged, req, type FeedbackKind } from './api'
import { uiShown } from './uiNames'
import { FeedbackText } from './FeedbackPage'
import { go } from './router'
import { onListKey } from './listInput'
import { MemoText } from './memo'
import { hasFeedbackList, issueDraftUrl } from './feedbackFormat'
import { shown, t } from './i18n'
import { clearFeedbackDraft, readFeedbackDraft, writeFeedbackDraft, type FeedbackDraft } from './feedbackDraft'

/**
 * 피드백 모드: 화면 부위(data-ui가 붙은 요소)에 마우스를 올리면 이름표가 뜨고,
 * 누르면 그 부위에 코멘트를 남긴다. 코멘트는 개인 저장소의 feedback/날짜.md에 쌓인다 (personalRepo.ts).
 * 부위 이름은 바깥 부위부터 이어 붙인다: data-ui="블록" > data-ui="속성 표" > data-ui="다른 시도"
 *   → "블록 › 속성 표 › 다른 시도"
 */
interface Entry { date: string; time: string; kind: FeedbackKind; target: string; text: string; n: number; snippet?: string }

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

/**
 * 코멘트를 남기는 순간의 화면 그림 (JPEG). 에이전트는 글만으로는 사용자 화면을 볼 수 없어서 함께 남긴다.
 * 피드백 모드 자체의 창은 빼고, PDF처럼 그림으로 옮길 수 없는 부분은 비어 보일 수 있다. 실패해도 코멘트는 그대로 저장한다.
 * 찍는 일(모든 요소의 스타일 복사)은 화면을 1–3초 멈춘다. 부위를 누를 때 찍으면 입력 창이 늦게 뜨고 쓰는 동안 멈춰서
 * ("피드백 모드에서 유독 렉", 10/16), 등록을 누를 때 찍는다. 그 사이 앱은 눌러도 반응하지 않아 뒤 화면은 그대로다
 */
/**
 * html-to-image는 <svg>를 통째로 복사하고 그 안의 요소에는 계산된 스타일을 옮기지 않는다. 그림 안에는 페이지 CSS가 없어
 * 클래스로 칠한 SVG(흐름 차트 등)가 검은 덩어리로 찍혔다 (10/15 09:49 그림). 찍는 동안만 SVG 안 요소에 계산된 칠을 적어 두고 되돌린다
 */
const SVG_PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'paint-order', 'font-size', 'font-weight', 'font-family', 'display', 'visibility'] as const
function inlineSvgPaint(): () => void {
  const saved: [SVGElement, string | null][] = []
  for (const svg of document.querySelectorAll('svg')) {
    if (svg.parentElement?.closest('svg') || !onScreen(svg) || svg.closest('[data-feedback-ui]')) continue
    for (const el of svg.querySelectorAll('*')) if (el instanceof SVGElement) saved.push([el, el.getAttribute('style')])
  }
  // 먼저 모두 읽고 나서 쓴다. 읽고 쓰기를 번갈아 하면 요소마다 스타일을 다시 계산해 흐름 차트에서 십여 초 멈췄다
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
  // 크기가 없으면: 숨긴 탭(display: none)은 통째로 빼고, display: contents처럼 자식이 보일 수 있는 것은 남긴다
  if (!r.width && !r.height) return el.checkVisibility?.() ?? true
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

const loadCapture = () => import('html-to-image')
/** 글꼴을 그림에 넣는 CSS(수백 KB)는 모드를 켠 동안 한 번만 만든다 */
let fontCss: Promise<string> | null = null

async function captureScreen(): Promise<string | null> {
  let restore: (() => void) | null = null
  try {
    const { toJpeg, getFontEmbedCSS } = await loadCapture()
    fontCss ??= getFontEmbedCSS(document.body).catch((e) => { fontCss = null; throw e })
    const fontEmbedCSS = await fontCss
    restore = inlineSvgPaint()
    return await toJpeg(document.body, {
      quality: 0.8, pixelRatio: 1, width: innerWidth, height: innerHeight, fontEmbedCSS, includeStyleProperties: STYLE_PROPS,
      // 그림 주소는 ?path=…로만 다르다(/api/feedback/picture 등). 빼면 html-to-image가 물음표 뒤를 버린 주소로 캐시해 다른 그림을 다시 쓴다 (10/13 09:59 그림)
      includeQueryParams: true,
      filter: (n) => !(n instanceof Element) || (!n.hasAttribute('data-feedback-ui') && onScreen(n)),
    })
  } catch { return null } finally { restore?.() }
}

function isOwnUi(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('[data-feedback-ui]')
}

export function FeedbackMode({ onClose, onSaved }: { onClose(): void; onSaved(message: string): void }) {
  const [hover, setHover] = useState<{ rect: DOMRect; path: string } | null>(null)
  const [pending, setPending] = useState<{ path: string; snippet: string; x: number; y: number; route?: string } | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** 이번에 피드백 모드를 켠 뒤 남긴 코멘트. 모드를 끄면 다시 0부터 */
  const [entries, setEntries] = useState<Entry[]>([])
  const [showList, setShowList] = useState(false)
  const [publishable, setPublishable] = useState(false)
  /** 공개 저장소의 새 이슈 주소와 앱 버전: 다른 사용자가 관리자에게 보내는 곳 (docs/maintaining.md) */
  const [kind, setKind] = useState<'수정' | '질문' | '제안' | null>(null)
  const [issues, setIssues] = useState<{ url: string; version: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  // 적던 글 (10/21): 창에 적는 동안 이 브라우저에 두고, 아래 띠에서 이어 쓰거나 버린다
  const [draft, setDraft] = useState<FeedbackDraft | null>(readFeedbackDraft)
  const hoverEl = useRef<Element | null>(null)
  const pendingRef = useRef(pending)
  useEffect(() => {
    if (!pending || !text.trim()) return
    const d: FeedbackDraft = { text, kind, path: pending.path, snippet: pending.snippet, route: pending.route ?? (location.hash || '#/'), at: new Date().toISOString() }
    writeFeedbackDraft(d)
    setDraft(d)
  }, [pending, text, kind])
  pendingRef.current = pending

  // 그림 찍는 모듈은 모드를 켤 때 미리 받아 둔다 (등록할 때 기다리지 않게)
  useEffect(() => { void loadCapture().catch(() => undefined) }, [])

  useEffect(() => {
    api.feedbackState().then((b) => {
      setPublishable(b.publishable)
      setIssues(typeof b.issues === 'string' ? { url: b.issues, version: b.version ?? null } : null)
    }).catch(() => setPublishable(false))
  }, [])

  useEffect(() => {
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest('[data-ui]') : null)
    const move = (e: MouseEvent) => {
      if (pendingRef.current || isOwnUi(e.target)) return
      const el = target(e)
      // 같은 부위 안에서 움직이면 다시 그리지 않는다 (스크롤하면 refresh가 상자를 옮긴다)
      if (el === hoverEl.current) return
      hoverEl.current = el
      setHover(el ? { rect: el.getBoundingClientRect(), path: uiPath(el) } : null)
    }
    // 앱 자체의 동작(버튼 누르기, 편집기 커서 이동 등)은 막고 코멘트 창만 연다
    const block = (e: Event) => {
      if (isOwnUi(e.target)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const click = (e: MouseEvent) => {
      if (isOwnUi(e.target)) return
      block(e)
      const el = target(e)
      if (!el) return
      setPending({ path: uiPath(el), snippet: snippetOf(el), x: e.clientX, y: e.clientY })
      setText(''); setKind(null); setError(null)
    }
    const refresh = () => { const el = hoverEl.current; if (el) setHover({ rect: el.getBoundingClientRect(), path: uiPath(el) }) }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 뒤에 열린 대화상자까지 닫히지 않게 여기서 멈춘다
      e.preventDefault()
      e.stopPropagation()
      if (pendingRef.current) setPending(null)
      else onClose()
    }
    window.addEventListener('mousemove', move, true)
    for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const) window.addEventListener(t, block, true)
    window.addEventListener('click', click, true)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('keydown', key, true)
    document.body.classList.add('feedback-on')
    return () => {
      window.removeEventListener('mousemove', move, true)
      for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const) window.removeEventListener(t, block, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('keydown', key, true)
      document.body.classList.remove('feedback-on')
    }
  }, [onClose])

  /** 부위 없이 적기: 화면 한 곳이 아니라 앱 전체 방향에 대한 의견 (10/12). 서버는 빈 부위를 "(부위 없음)"으로 적는다 */
  const openWithoutPart = (e: React.MouseEvent) => {
    setHover(null); hoverEl.current = null
    // 단추 위에 연다 (아래 끝은 pop이 화면 안으로 당긴다)
    setPending({ path: '', snippet: '', x: e.currentTarget.getBoundingClientRect().left - 12, y: innerHeight })
    setText(''); setKind('제안'); setError(null)
  }
  /** 적던 글 이어 쓰기: 처음 화면으로 돌아가(그림과 주소가 맞게) 같은 부위의 창을 연다 */
  const resumeDraft = (e: React.MouseEvent) => {
    if (!draft) return
    const left = e.currentTarget.getBoundingClientRect().left - 12
    if ((location.hash || '#/') !== draft.route) location.hash = draft.route
    setHover(null); hoverEl.current = null
    setPending({ path: draft.path, snippet: draft.snippet, x: left, y: innerHeight, route: draft.route })
    setText(draft.text); setKind(draft.kind); setError(null)
  }
  const dropDraft = () => { clearFeedbackDraft(); setDraft(null) }
  const draftTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` }
  const targetName = (path: string) => (path ? uiShown(path) : t('부위 없음 · 앱 전체에 대한 의견', 'No part · about the app as a whole'))

  const themeName = () => {
    const theme = document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    return theme === 'dark' ? t('다크', 'Dark') : t('라이트', 'Light')
  }

  /** 공개 이슈 초안을 새 탭에 열고, 같은 코멘트를 여기에도 저장한다. 창은 누른 순간에 열어야 막히지 않는다 */
  const sendToGithub = () => {
    if (!pending || !text.trim() || !issues || !kind) return
    const url = issueDraftUrl(issues.url, {
      text, area: !pending.path ? targetName('') : uiShown(pending.path) === pending.path ? pending.path : `${uiShown(pending.path)} (${pending.path})`, snippet: pending.snippet, route: location.hash || '#/', version: issues.version,
      environment: `${navigator.platform} · ${innerWidth}×${innerHeight} · ${themeName()}`,
    })
    window.open(url, '_blank', 'noopener')
    void save(kind)
  }

  const save = async (kind: '수정' | '질문' | '제안') => {
    if (!pending || !text.trim() || busy) return
    setBusy(true)
    try {
      // "등록 중…"이 먼저 그려진 뒤 찍는다
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
      const image = (await captureScreen()) ?? undefined
      const res = await req('/api/feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind, target: pending.path, text, snippet: pending.snippet, route: pending.route ?? (location.hash || '#/'), note: feedbackNote(),
          viewport: `${innerWidth}×${innerHeight}`, theme: themeName(), image,
        }),
      })
      const b = await res.json()
      if (!res.ok) throw new Error(b.error)
      setPending(null)
      dropDraft()
      setEntries((prev) => [b.entry as Entry, ...prev])
      feedbackChanged()
      onSaved(t(`피드백 저장됨 — ${pending.path || '부위 없음'}`, `Feedback saved: ${targetName(pending.path)}`))
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  // 코멘트 창을 누른 자리 근처에, 화면 밖으로 나가지 않게
  const pop = pending && { left: Math.max(12, Math.min(pending.x + 12, innerWidth - 380)), top: Math.max(12, Math.min(pending.y + 12, innerHeight - 300)) }

  return (
    <>
      <div className="fb-bar" data-feedback-ui>
        <b>{t('피드백 모드', 'Feedback mode')}</b>
        {draft && !pending
          ? <>
            <span className="fb-draft" title={draft.text}>{t('적던 글', 'Unsent draft')} · {draftTime(draft.at)} · {targetName(draft.path)}{draft.kind && ` · ${shown(draft.kind)}`}</span>
            <button className="a" data-ui="적던 글 이어 쓰기" onClick={resumeDraft}>{t('이어 쓰기', 'Continue')}</button>
            <button className="a" data-ui="적던 글 버리기" onClick={dropDraft}>{t('버리기', 'Discard')}</button>
          </>
          : <span>{t('부위에 마우스를 올리면 이름이 뜹니다. 누르면 그 부위에 피드백을 남깁니다. 앱은 이 동안 눌러도 반응하지 않습니다.', 'Hover over a part to see its name. Click to leave feedback on it. The app does not respond to clicks while this is on.')}</span>}
        <span className="sp" />
        <button className="a" data-ui="부위 없이 적기" title={t('화면 한 곳이 아니라 앱 전체 방향에 대한 의견을 남깁니다', 'Leave feedback about the app as a whole, not one part of the screen')} onClick={openWithoutPart}>{t('부위 없이 적기', 'Without a part')}</button>
        <button className="a" data-ui="이번에 남긴 코멘트" onClick={() => setShowList((v) => !v)}>{t(`이번에 남긴 피드백 ${entries.length}`, `Feedback this session ${entries.length}`)}</button>
        {/* 피드백 등록은 피드백 화면 한 곳에서 (10/4 피드백: 같은 일은 담당 화면 하나에서 하고 나머지는 거기로 가는 길) */}
        <button className="a" data-ui="모아 보기" title={t('모든 피드백과 반영 여부. 피드백 등록도 여기서 합니다', 'All feedback and whether it was applied. Submit feedback there too')} onClick={() => { onClose(); go({ page: 'feedback' }) }}>{publishable ? t('모아 보기·등록', 'View all · submit') : t('모아 보기', 'View all')}</button>
        <button className="btn primary sm" onClick={onClose}>{t('끝내기', 'Exit')} <kbd>Esc</kbd></button>
      </div>

      {hover && !pending && (
        <>
          <div className="fb-box" style={{ left: hover.rect.left - 2, top: hover.rect.top - 2, width: hover.rect.width + 4, height: hover.rect.height + 4 }} />
          <div className="fb-label" style={{ left: Math.max(4, hover.rect.left - 2), top: hover.rect.top > 28 ? hover.rect.top - 24 : hover.rect.bottom + 4 }}>{uiShown(hover.path)}</div>
        </>
      )}

      {pending && pop && (
        <div className="fb-pop" data-feedback-ui style={{ ...pop, maxHeight: `calc(100dvh - ${pop.top}px - var(--sp-3))` }} role="dialog" aria-label={t('피드백 남기기', 'Leave feedback')}>
          <div className="fb-pop-head"><div className="fb-target">{targetName(pending.path)}</div><button className="icon-btn" data-tip={t('닫기', 'Close')} aria-label={t('닫기', 'Close')} onClick={() => setPending(null)}>{Icon.x}</button></div>
          {pending.snippet && <div className="fb-snippet">“{pending.snippet}”</div>}
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('무엇이 어떤지, 어떻게 되면 좋겠는지 (- 로 목록, Tab 들여쓰기 · ⌘↵ 저장)', 'What is wrong and how it should be (- for a list, Tab to indent · ⌘↵ to save)')}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (kind) void save(kind) } else onListKey(e, setText) }} />
          {hasFeedbackList(text) && <div className="fb-preview" aria-label={t('피드백 미리보기', 'Feedback preview')}><MemoText text={text} /></div>}
          {error && <div className="error-text">{error}</div>}
          <div className="fb-actions">
            <div className="segmented small fb-kind" role="radiogroup" aria-label={t('코멘트 유형', 'Comment type')}>
              {(['수정', '질문', '제안'] as const).map((k) => <button key={k} type="button" role="radio" className={kind === k ? 'on' : ''} aria-checked={kind === k} onClick={() => setKind(k)}>{shown(k)}</button>)}
            </div>
            {issues && (
              <button className="btn fb-send" disabled={!text.trim() || !kind || busy} onClick={sendToGithub}
                title={t('공개 저장소에 이슈 초안을 새 탭으로 엽니다. 여기에도 저장합니다. 화면 그림은 붙이지 않으니, 연구 내용이 보이지 않는 그림만 직접 붙이세요', 'Opens an issue draft on the public repository in a new tab. It is also saved here. Screenshots are not attached; add only pictures that show no research content.')}>{t('GitHub에 보내기', 'Send to GitHub')}</button>
            )}
            <button className="btn primary" disabled={!text.trim() || !kind || busy} data-tip={kind ? undefined : t('유형을 고르면 등록됩니다', 'Choose a type to post')} onClick={() => kind && void save(kind)}>{busy ? t('등록 중…', 'Submitting…') : <>{t('의견 등록', 'Submit')} <span className="kbd">⌘↵</span></>}</button>
          </div>
        </div>
      )}

      {showList && (
        <div className="fb-list" data-feedback-ui>
          <div className="fb-list-head"><b>{t('이번에 남긴 피드백', 'Feedback this session')}</b><button className="a" onClick={() => setShowList(false)}>{t('닫기', 'Close')}</button></div>
          {entries.length === 0 ? <p className="muted">{t('아직 없습니다.', 'None yet.')}</p> : entries.map((e, i) => (
            <div key={i} className="fb-entry">
              <div className="fb-entry-head"><span className="tag">{shown(e.kind)}</span><span className="muted">{e.time}</span></div>
              <div className="fb-target">{e.target}</div>
              <FeedbackText e={e} onChanged={(text, kind) => setEntries((prev) => text === null ? prev.filter((x) => x !== e) : prev.map((x) => (x === e ? { ...x, text, ...(kind && { kind }) } : x)))} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('지난 피드백과 반영 여부는 레일의 피드백에서 봅니다. 파일: 개인 저장소의 feedback/', 'See past feedback and whether it was applied under Feedback in the rail. Files: feedback/ in your personal repository')}</p>
        </div>
      )}
    </>
  )
}
