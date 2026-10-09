import type * as Pdfjs from 'pdfjs-dist'

let loaded: Promise<typeof Pdfjs> | undefined
/** pdfjs는 PDF를 처음 그릴 때 한 번 읽는다 (첫 화면 번들에 넣지 않는다). 읽지 못하면 다음에 다시 */
export function loadPdfjs(): Promise<typeof Pdfjs> {
  loaded ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    .then(([pdfjs, worker]) => { pdfjs.GlobalWorkerOptions.workerSrc = worker.default; return pdfjs })
    .catch((e: unknown) => { loaded = undefined; throw e })
  return loaded
}
