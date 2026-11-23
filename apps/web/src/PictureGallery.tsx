import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { FigureUrlPreview } from './FigurePreview'
import { t } from './i18n'

/**
 * fit: 작은 그림(노트의 svg 등)도 창 폭에 맞춰 키운다. pdf: 첫 쪽을 그린다. figure: 그림 라이브러리의 그림이면 그 id ("그림 화면에서 열기"를 보인다).
 * html: 같은 시안의 html 주소. 있으면 그림 대신 html을 칸 안에 띄우고 머리의 「html · 그림」으로 바꿔 본다, ↗는 새 창
 */
export interface GalleryPicture { src: string; label: string; alt: string; pdf?: boolean; figure?: string; fit?: boolean; html?: string }

/**
 * 그림 크게 보기 (10/13 피드백 "갤러리처럼 넘겨 보기"): 누른 그림 하나를 화면 위에 크게 띄우고,
 * 양옆 화살표 · ← → 키로 넘기고, Esc · × · 바깥 누르기로 닫는다. 위에 "전 1/2"처럼 지금 그림을 적는다.
 * 노트의 그림도 같은 창으로 띄운다(10/15 B′): 라이브러리 그림이면 머리에 "그림 화면에서 열기".
 */
/** foot: 지금 그림 오른쪽에 둘 것 (피드백 시안의 「진행」 · 「논의」, FeedbackMockups.tsx · 대화 시안의 지시 칸, Mockups.tsx).
 * 11/23 피드백 "논의는 오른쪽에 그림은 왼쪽": 아래에 두면 큰 그림이 글칸을 덮었다 */
export function PictureGallery({ pictures, start, onClose, onOpenFigure, foot }: { pictures: GalleryPicture[]; start: number; onClose(): void; onOpenFigure?(id: string): void; foot?(p: GalleryPicture): ReactNode }) {
  const [at, setAt] = useState(start)
  // 11/23 피드백 "그림과 html을 통합": html이 있는 시안은 html을 먼저 보인다
  const [asPic, setAsPic] = useState(false)
  const n = pictures.length
  const step = (d: number) => { setAt((k) => (k + d + n) % n); setAsPic(false) }
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
  return (
    <div className="overlay gallery" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`gallery-box${foot ? ' with-foot' : ''}`} role="dialog" aria-modal="true" aria-label={p.alt} data-ui="그림 크게 보기">
        <div className="gallery-head">
          <span className="gallery-label">{p.label}{n > 1 && <span className="muted"> {at + 1}/{n}</span>}</span>
          {p.html && (
            <span className="segmented small gallery-open" role="group" aria-label={t('시안 보기', 'Mockup view')} data-ui="시안 보기">
              <button type="button" className={asPic ? '' : 'on'} aria-pressed={!asPic} onClick={() => setAsPic(false)}>html</button>
              <button type="button" className={asPic ? 'on' : ''} aria-pressed={asPic} onClick={() => setAsPic(true)}>{t('그림', 'Picture')}</button>
            </span>
          )}
          {p.html && <a className="icon-btn" data-ui="시안 새 창" data-tip={t('html 새 창에서 열기', 'Open html in new window')} aria-label={t('html 새 창에서 열기', 'Open html in new window')} href={p.html} target="_blank" rel="noopener noreferrer">↗</a>}
          {p.figure && onOpenFigure && <button type="button" className="a gallery-open" data-ui="그림 화면에서 열기" onClick={() => onOpenFigure(p.figure!)}>{t('그림 화면에서 열기', 'Open in figure screen')}</button>}
          <button type="button" className="icon-btn" data-tip={t('닫기 (Esc)', 'Close (Esc)')} aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
        </div>
        <div className="gallery-body">
          {n > 1 && <button type="button" className="icon-btn gallery-nav prev" data-tip={t('이전 (←)', 'Previous (←)')} aria-label={t('이전 그림', 'Previous picture')} onClick={() => step(-1)}>{Icon.back}</button>}
          {p.html && !asPic ? <HtmlFrame key={p.html} src={p.html} title={p.alt} /> : p.pdf ? <FigureUrlPreview url={p.src} pdf name={p.alt} className="gallery-pdf" /> : <img src={p.src} alt={p.alt} className={p.fit ? 'gallery-fit' : undefined} />}
          {n > 1 && <button type="button" className="icon-btn gallery-nav next" data-tip={t('다음 (→)', 'Next (→)')} aria-label={t('다음 그림', 'Next picture')} onClick={() => step(1)}>{Icon.forward}</button>}
        </div>
        {foot && <div className="gallery-foot">{foot(p)}</div>}
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
