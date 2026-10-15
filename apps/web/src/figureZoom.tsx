import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { PictureGallery, type GalleryPicture } from './PictureGallery'
import { showFigure } from './figureView'

/**
 * 노트 본문 · 흐름 점 설명의 그림을 누르면 크게 (10/15 B′): 그 본문의 그림을 차례대로 겹창에 모아 ← →로 넘긴다.
 * 라이브러리 그림(data-fig-id)이면 겹창 머리에 "그림 화면에서 열기".
 */
const MEDIA = 'figure.md-fig img, figure.md-fig canvas, img.ob-fig, canvas.ob-fig'

function pictureOf(el: HTMLElement): GalleryPicture | null {
  const pdf = el.tagName === 'CANVAS'
  const src = pdf ? el.dataset.src : (el as HTMLImageElement).src
  if (!src) return null
  const name = el.getAttribute(pdf ? 'aria-label' : 'alt') ?? ''
  const box = el.closest<HTMLElement>('figure.md-fig')
  // 그림 설명의 수식은 보이는 글자만 (KaTeX의 MathML 사본을 뺀다)
  const cap = box?.querySelector('figcaption')?.cloneNode(true) as HTMLElement | undefined
  cap?.querySelectorAll('.katex-mathml').forEach((m) => m.remove())
  const caption = cap?.textContent?.replace(/\s+/g, ' ').trim()
  const figure = (box ?? el).dataset.figId
  return { src, pdf, fit: true, alt: name, label: caption || name, ...(figure && { figure }) }
}

/** html: 본문이 바뀌면(다른 노트로 가거나 고치면) 띄운 창을 닫는다 */
export function useFigureZoom(ref: RefObject<HTMLElement | null>, html: string): { onClick(target: EventTarget | null): boolean; gallery: ReactNode } {
  const [open, setOpen] = useState<{ pictures: GalleryPicture[]; start: number } | null>(null)
  useEffect(() => { setOpen(null) }, [html])
  const onClick = (target: EventTarget | null) => {
    const hit = (target as Element | null)?.closest?.<HTMLElement>(MEDIA)
    if (!hit || !ref.current) return false
    const els = [...ref.current.querySelectorAll<HTMLElement>(MEDIA)]
    const pictures: GalleryPicture[] = []
    let start = 0
    for (const el of els) {
      const p = pictureOf(el)
      if (!p) continue
      if (el === hit) start = pictures.length
      pictures.push(p)
    }
    if (!pictures.length) return false
    setOpen({ pictures, start })
    return true
  }
  const gallery = open && <PictureGallery pictures={open.pictures} start={open.start} onClose={() => setOpen(null)} onOpenFigure={(id) => { setOpen(null); showFigure(id) }} />
  return { onClick, gallery }
}
