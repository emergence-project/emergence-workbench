import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { FigureUrlPreview } from './FigurePreview'
import { t } from './i18n'

/** fit: 작은 그림(노트의 svg 등)도 창 폭에 맞춰 키운다. pdf: 첫 쪽을 그린다. figure: 그림 라이브러리의 그림이면 그 id ("그림 화면에서 열기"를 보인다) */
export interface GalleryPicture { src: string; label: string; alt: string; pdf?: boolean; figure?: string; fit?: boolean }

/**
 * 그림 크게 보기 (10/13 피드백 "갤러리처럼 넘겨 보기"): 누른 그림 하나를 화면 위에 크게 띄우고,
 * 양옆 화살표 · ← → 키로 넘기고, Esc · × · 바깥 누르기로 닫는다. 위에 "전 1/2"처럼 지금 그림을 적는다.
 * 노트·흐름 점의 그림도 같은 창으로 띄운다(10/15 B′): 라이브러리 그림이면 머리에 "그림 화면에서 열기".
 */
export function PictureGallery({ pictures, start, onClose, onOpenFigure }: { pictures: GalleryPicture[]; start: number; onClose(): void; onOpenFigure?(id: string): void }) {
  const [at, setAt] = useState(start)
  const n = pictures.length
  const step = (d: number) => setAt((k) => (k + d + n) % n)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && n > 1) step(-1)
      else if (e.key === 'ArrowRight' && n > 1) step(1)
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
      <div className="gallery-box" role="dialog" aria-modal="true" aria-label={p.alt} data-ui="그림 크게 보기">
        <div className="gallery-head">
          <span className="gallery-label">{p.label}{n > 1 && <span className="muted"> {at + 1}/{n}</span>}</span>
          {p.figure && onOpenFigure && <button type="button" className="a gallery-open" data-ui="그림 화면에서 열기" onClick={() => onOpenFigure(p.figure!)}>{t('그림 화면에서 열기', 'Open in figure screen')}</button>}
          <button type="button" className="icon-btn" data-tip={t('닫기 (Esc)', 'Close (Esc)')} aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
        </div>
        <div className="gallery-body">
          {n > 1 && <button type="button" className="icon-btn gallery-nav prev" data-tip={t('이전 (←)', 'Previous (←)')} aria-label={t('이전 그림', 'Previous picture')} onClick={() => step(-1)}>{Icon.back}</button>}
          {p.pdf ? <FigureUrlPreview url={p.src} pdf name={p.alt} className="gallery-pdf" /> : <img src={p.src} alt={p.alt} className={p.fit ? 'gallery-fit' : undefined} />}
          {n > 1 && <button type="button" className="icon-btn gallery-nav next" data-tip={t('다음 (→)', 'Next (→)')} aria-label={t('다음 그림', 'Next picture')} onClick={() => step(1)}>{Icon.forward}</button>}
        </div>
      </div>
    </div>
  )
}
