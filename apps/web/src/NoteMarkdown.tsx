import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useMemo, useRef } from 'react'
import type { RenderOptions } from './ObsidianMarkdown'
import { renderNote } from './noteRender'
import { useRecordPaint } from './recordPaint'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * 연구노트·보조 노트 읽기 화면: 개념노트처럼 그리고, 식·그림·절·표 번호와 \\ref·\\eqref, 각주, 그림(PDF도)을 더한다.
 * asset: 노트 폴더 안의 그림 주소 (없으면 파일 이름만 보인다)
 */
export function NoteMarkdown({ text, options, asset }: { text: string; options: RenderOptions; asset?(name: string): string }) {
  const html = useMemo(() => renderNote(text, options, asset), [text, options, asset])
  const ref = useRef<HTMLDivElement>(null)
  const openMark = useRecordPaint(ref, html)
  // 그림 PDF는 첫 쪽을 그린다
  useEffect(() => {
    let live = true
    for (const c of ref.current?.querySelectorAll<HTMLCanvasElement>('canvas.md-fig-pdf') ?? []) {
      void (async () => {
        try {
          const doc = await pdfjs.getDocument({ url: c.dataset.src! }).promise
          const page = await doc.getPage(1)
          const box = page.getViewport({ scale: 1 })
          const scale = Math.min(2, (c.parentElement?.clientWidth || 600) / box.width) * (window.devicePixelRatio || 1)
          const vp = page.getViewport({ scale })
          if (!live) return
          c.width = vp.width
          c.height = vp.height
          c.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`
          await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
        } catch {
          c.replaceWith(Object.assign(document.createElement('span'), { className: 'md-fig-missing', textContent: c.getAttribute('aria-label') ?? '' }))
        }
      })()
    }
    return () => { live = false }
  }, [html])
  return <div className="ob-md" ref={ref} onClick={(event) => {
    if (!openMark(event) && (event.target as Element).closest('.ob-cite')) event.preventDefault()
  }} onKeyDown={(event) => { openMark(event) }} dangerouslySetInnerHTML={{ __html: html }} />
}
