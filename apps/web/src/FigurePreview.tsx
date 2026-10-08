import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import { figuresApi, type FigureRow } from './api/figures'
import { t } from './i18n'

export type FigurePreviewData = Pick<FigureRow, 'id' | 'kind' | 'name'> & Partial<Pick<FigureRow, 'mtime'>>

/** 그림 라이브러리와 카드가 함께 쓰는 미리보기. PDF는 첫 쪽, tikz는 서버가 만든 SVG. */
export function FigurePreview({ fig, big, className = '' }: { fig: FigurePreviewData; big?: boolean; className?: string }) {
  const url = figuresApi.fileUrl(fig.id, fig.mtime)
  // 그림을 바꾸면 이전 그림의 오류·canvas·비동기 작업도 함께 버린다.
  return <FigurePreviewContent key={`${fig.kind}/${url}`} fig={fig} url={url} big={big} className={className} />
}

function FigurePreviewContent({ fig, url, big, className }: { fig: FigurePreviewData; url: string; big?: boolean; className: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const errorRequest = useRef<AbortController | null>(null)
  useEffect(() => () => errorRequest.current?.abort(), [])
  useEffect(() => {
    const el = canvas.current
    if (fig.kind !== 'pdf' || !el) return
    let live = true
    let loading: PDFDocumentLoadingTask | undefined
    let rendering: RenderTask | undefined
    const destroy = () => {
      const task = loading
      loading = undefined
      if (task) void task.destroy().catch(() => { /* 이미 닫힌 작업 */ })
    }
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        if (!live) return
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        loading = pdfjs.getDocument({ url })
        const doc = await loading.promise
        if (!live) return
        const page = await doc.getPage(1)
        if (!live) return
        const vp0 = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: ((el.clientWidth || el.width) * window.devicePixelRatio) / vp0.width })
        el.width = vp.width; el.height = vp.height
        const g = el.getContext('2d')
        if (g) {
          rendering = page.render({ canvasContext: g, viewport: vp, canvas: el })
          await rendering.promise
        }
      } catch (e) { if (live) setFailed((e as Error).message) }
      finally { destroy() }
    })()
    return () => { live = false; rendering?.cancel(); destroy() }
  }, [fig.kind, url])
  const onError = () => {
    if (fig.kind !== 'tikz') { setFailed(t('그림을 읽지 못했습니다', 'Could not read the figure')); return }
    errorRequest.current?.abort()
    const request = new AbortController()
    errorRequest.current = request
    void fetch(url, { signal: request.signal }).then((r) => r.json()).then((b: { error?: string }) => {
      if (!request.signal.aborted) setFailed(b.error ?? t('tikz 그림을 그리지 못했습니다', 'Could not draw the TikZ figure'))
    }).catch(() => { if (!request.signal.aborted) setFailed(t('tikz 그림을 그리지 못했습니다', 'Could not draw the TikZ figure')) })
  }
  return (
    <span className={`fg-pv${big ? ' big' : ''}${className ? ` ${className}` : ''}`} aria-hidden={!big}>
      {failed
        ? <span className="fg-pv-fail" title={failed}>{big ? failed : t('미리보기 없음', 'No preview')}</span>
        : fig.kind === 'pdf' ? <canvas ref={canvas} /> : <img src={url} alt={big ? fig.name : ''} loading="lazy" draggable={false} onError={onError} />}
    </span>
  )
}
