import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { FigureUrlPreview } from './FigurePreview'
import { t } from './i18n'

/**
 * fit: 작은 그림(노트의 svg 등)도 창 폭에 맞춰 키운다. pdf: 첫 쪽을 그린다. figure: 그림 라이브러리의 그림이면 그 id ("그림 화면에서 열기"를 보인다).
 * html: 같은 시안의 html 주소. 있으면 그림 대신 html만 칸 안에 띄운다
 * (11/23 피드백 "왜 두 개를 구분해야 해?": 그림은 그 html을 찍은 한 장이라 「html · 그림」 바꿔 보기를 없앴다).
 * 새 창은 작은 그림 아래 「html 새 창에서 열기 ↗」로만 연다: 칸 안에서 html을 그대로 누를 수 있어 크게 본 창에는 두지 않는다 (11/23 피드백).
 * tab: 위 줄의 짧은 이름(전 · 후 · 시안 이름). 하나라도 있으면 이름 대신 고르는 줄을 보인다
 */
export interface GalleryPicture { src: string; label: string; alt: string; pdf?: boolean; figure?: string; fit?: boolean; html?: string; tab?: string }

/** 오른쪽 칸(foot)을 접을 수 있게 할 때: count는 접은 띠에 적을 글 수. 접은 뒤 늘면 띠에 점이 붙는다 */
export interface GalleryFold { count: number }

const FOLD_KEY = 'rw-gallery-folded'
const foldedAtStart = () => { try { return localStorage.getItem(FOLD_KEY) === '1' } catch { return false } }

/**
 * 그림 크게 보기 (10/13 피드백 "갤러리처럼 넘겨 보기"): 누른 그림 하나를 화면 위에 크게 띄우고,
 * 양옆 화살표 · ← → 키로 넘기고, Esc · × · 바깥 누르기로 닫는다. 위에 "전 1/2"처럼 지금 그림을 적는다.
 * 노트의 그림도 같은 창으로 띄운다(10/15 B′): 라이브러리 그림이면 머리에 "그림 화면에서 열기".
 */
/** foot: 지금 그림 오른쪽에 둘 것 (피드백 전후 그림 · 시안의 대화와 답 칸, FeedbackViewer.tsx · 대화 시안의 지시 칸, Mockups.tsx).
 * 11/23 피드백 "논의는 오른쪽에 그림은 왼쪽": 아래에 두면 큰 그림이 글칸을 덮었다.
 * fold가 있으면 위 줄 단추로 그 칸을 접어 그림을 넓게 본다 (11/23 피드백 "대화영역을 접을 수도"): 접으면 오른쪽 끝에 말풍선과 글 수만 남고, 접은 상태는 기억한다 */
export function PictureGallery({ pictures, start, onClose, onOpenFigure, foot, fold }: { pictures: GalleryPicture[]; start: number; onClose(): void; onOpenFigure?(id: string): void; foot?(p: GalleryPicture): ReactNode; fold?: GalleryFold }) {
  const [at, setAt] = useState(start)
  const [folded, setFoldedState] = useState(() => !!fold && foldedAtStart())
  // 접을 때의 글 수: 그 뒤 새 글이 오면 띠에 점
  const seen = useRef(fold?.count ?? 0)
  const setFolded = (v: boolean) => {
    setFoldedState(v)
    seen.current = fold?.count ?? 0
    try { localStorage.setItem(FOLD_KEY, v ? '1' : '0') } catch { /* 저장 못 해도 이번에는 접힌다 */ }
  }
  const n = pictures.length
  const step = (d: number) => { setAt((k) => (k + d + n) % n) }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      // 아래 글칸(foot의 논의)에 적는 중이면 ← →는 글 안에서 움직인다
      const paging = n > 1 && !(e.target instanceof HTMLElement && e.target.closest('textarea, input'))
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && paging) step(-1)
      else if (e.key === 'ArrowRight' && paging) step(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [n, onClose]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = pictures[at]
  if (!p) return null
  const fresh = folded && !!fold && fold.count > seen.current
  const foldTip = folded ? t('대화 펼치기', 'Show conversation') : t('대화 접기', 'Hide conversation')
  return (
    <div className="overlay gallery" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`gallery-box${foot ? ' with-foot' : ''}${foot && folded ? ' folded' : ''}`} role="dialog" aria-modal="true" aria-label={p.alt} data-ui="그림 크게 보기">
        <div className="gallery-head">
          {pictures.some((x) => x.tab)
            ? (
              <div className="segmented small gallery-tabs" role="tablist" data-ui="크게 보기 고르기" aria-label={t('볼 그림', 'Picture to view')}>
                {pictures.map((x, k) => <button key={x.src} type="button" role="tab" aria-selected={k === at} className={k === at ? 'on' : ''} title={x.alt} onClick={() => setAt(k)}>{x.tab ?? x.label}</button>)}
              </div>
            )
            : <span className="gallery-label">{p.label}{n > 1 && <span className="muted"> {at + 1}/{n}</span>}</span>}
          {p.figure && onOpenFigure && <button type="button" className="a gallery-open" data-ui="그림 화면에서 열기" onClick={() => onOpenFigure(p.figure!)}>{t('그림 화면에서 열기', 'Open in figure screen')}</button>}
          {foot && fold && <button type="button" className={`icon-btn gallery-fold${folded ? '' : ' on'}`} data-ui="크게 보기 대화 접기" aria-pressed={!folded} data-tip={foldTip} aria-label={foldTip} onClick={() => setFolded(!folded)}>{Icon.panelRight}</button>}
          <button type="button" className="icon-btn" data-tip={t('닫기 (Esc)', 'Close (Esc)')} aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
        </div>
        <div className="gallery-body">
          {n > 1 && <button type="button" className="icon-btn gallery-nav prev" data-tip={t('이전 (←)', 'Previous (←)')} aria-label={t('이전 그림', 'Previous picture')} onClick={() => step(-1)}>{Icon.back}</button>}
          {p.html ? <HtmlFrame key={p.html} src={p.html} title={p.alt} /> : p.pdf ? <FigureUrlPreview url={p.src} pdf name={p.alt} className="gallery-pdf" /> : <img src={p.src} alt={p.alt} className={p.fit ? 'gallery-fit' : undefined} />}
          {n > 1 && <button type="button" className="icon-btn gallery-nav next" data-tip={t('다음 (→)', 'Next (→)')} aria-label={t('다음 그림', 'Next picture')} onClick={() => step(1)}>{Icon.forward}</button>}
        </div>
        {foot && (folded
          ? (
            <button type="button" className="gallery-rail" data-ui="접은 대화" aria-label={`${t('대화 펼치기', 'Show conversation')} · ${fold?.count ?? 0}`} title={t('대화 펼치기', 'Show conversation')} onClick={() => setFolded(false)}>
              {Icon.comment}<span>{fold?.count ?? 0}</span>{fresh && <i className="gallery-rail-dot" aria-label={t('새 글', 'New')} />}
            </button>
          )
          : <div className="gallery-foot">{foot(p)}</div>)}
      </div>
    </div>
  )
}

/** 시안 html의 기준 폭: 시안은 1440 화면으로 그리므로, 칸이 더 좁으면 이 폭으로 그린 뒤 칸 폭에 맞춰 줄인다 */
const HTML_W = 1440

/** 크게 본 시안의 html: 출처 없는 틀(서버 머리와 같은 sandbox)에 띄워 그 안에서 스크롤 · 누르기가 된다 */
function HtmlFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const s = size.w && size.w < HTML_W ? size.w / HTML_W : 1
  return (
    <div ref={box} className="gallery-html" data-ui="시안 html">
      {size.w > 0 && (
        <iframe title={title} src={src} sandbox="allow-scripts allow-popups"
          style={s < 1 ? { width: HTML_W, height: size.h / s, transform: `scale(${s})`, transformOrigin: '0 0' } : { width: '100%', height: '100%' }} />
      )}
    </div>
  )
}
