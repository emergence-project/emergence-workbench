import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { t } from './i18n'

export interface GalleryPicture { src: string; label: string; alt: string }

/**
 * 그림 크게 보기 (10/13 피드백 "갤러리처럼 넘겨 보기"): 누른 그림 하나를 화면 위에 크게 띄우고,
 * 양옆 화살표 · ← → 키로 넘기고, Esc · × · 바깥 누르기로 닫는다. 위에 "전 1/2"처럼 지금 그림을 적는다.
 */
export function PictureGallery({ pictures, start, onClose }: { pictures: GalleryPicture[]; start: number; onClose(): void }) {
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
          <button type="button" className="icon-btn" data-tip={t('닫기 (Esc)', 'Close (Esc)')} aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
        </div>
        <div className="gallery-body">
          {n > 1 && <button type="button" className="icon-btn gallery-nav prev" data-tip={t('이전 (←)', 'Previous (←)')} aria-label={t('이전 그림', 'Previous picture')} onClick={() => step(-1)}>{Icon.back}</button>}
          <img src={p.src} alt={p.alt} />
          {n > 1 && <button type="button" className="icon-btn gallery-nav next" data-tip={t('다음 (→)', 'Next (→)')} aria-label={t('다음 그림', 'Next picture')} onClick={() => step(1)}>{Icon.forward}</button>}
        </div>
      </div>
    </div>
  )
}
