import { numberNote, type NoteFigure } from './noteNumbers'
import { renderObsidian, type RenderOptions } from './ObsidianMarkdown'
import { citeKeys } from './citeKeys'
import { t } from './i18n'

/** 편집 중 새로 넣거나 옮긴 인용도 현재 문서에서 처음 나온 순서로 표시한다. */
export function noteRenderOptions(text: string, options: RenderOptions): RenderOptions {
  const keys = citeKeys(text)
  return { ...options, cite: (key) => { const at = keys.indexOf(key); return at < 0 ? '?' : String(at + 1) } }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
export const noteInline = (s: string, options: RenderOptions) => renderObsidian(s, options).trim().replace(/^<p>([\s\S]*)<\/p>$/, '$1')

/** 읽기와 편집 미리보기에서 같은 그림·각주 표시를 쓴다. PDF는 편집 중 파일 이름으로 간결하게 보인다. */
/** 노트 폴더에 둘 수 있는 그림 파일 (서버 manuscript.ts NOTE_ASSET과 같게) */
const NOTE_ASSET = /\.(png|jpe?g|gif|svg|webp|pdf)$/i

/**
 * 그림 문단의 대상: 파일 이름이면 노트 폴더의 그림(없으면 서버가 같은 이름의 라이브러리 그림을 준다),
 * 확장자 없는 이름이면 그림 라이브러리에서 찾는다 (이 프로젝트 전용 먼저, 그다음 공용).
 */
function figureSource(file: string, options: RenderOptions, asset?: (name: string) => string): { src?: string; pdf: boolean } {
  if (asset && NOTE_ASSET.test(file)) return { src: asset(file), pdf: /\.pdf$/i.test(file) }
  const lib = options.figure?.(file)
  if (lib) return { src: lib.url, pdf: lib.pdf }
  return { src: asset?.(file), pdf: /\.pdf$/i.test(file) }
}

export function renderNoteFigure(f: NoteFigure, options: RenderOptions, asset?: (name: string) => string, compact = false): string {
  const { src, pdf } = figureSource(f.file, options, asset)
  const media = !src || (compact && pdf) ? `<span class="md-fig-missing">${esc(f.file)}</span>`
    : pdf ? `<canvas class="md-fig-pdf" data-src="${esc(src)}" aria-label="${esc(f.file)}"></canvas>`
      : `<img src="${esc(src)}" alt="${esc(f.file)}">`
  const cap = f.n || f.caption ? `<figcaption>${f.n ? `<b>${t('그림', 'Figure')} ${esc(f.n)}.</b> ` : ''}${noteInline(f.caption, options)}</figcaption>` : ''
  return `<figure class="md-fig">${media}${cap}</figure>`
}

export function renderNoteFootnote(text: string, index: number, options: RenderOptions): string {
  return `<sup class="md-fn" title="${esc(noteInline(text, options).replace(/<[^>]*>/g, ''))}">${index + 1}</sup>`
}

/** 원문은 건드리지 않고 문서 전체의 번호를 붙인 뒤 읽기용 HTML만 만든다. */
export function renderNote(text: string, options: RenderOptions, asset?: (name: string) => string): string {
  options = noteRenderOptions(text, options)
  const r = numberNote(text)
  const figure = (k: string) => r.figures[Number(k)] ? renderNoteFigure(r.figures[Number(k)]!, options, asset) : ''
  let html = renderObsidian(r.text, options)
    .replace(/<p>\u0003F(\d+)\u0003<\/p>/g, (_, k: string) => figure(k))
    .replace(/\u0003F(\d+)\u0003/g, (_, k: string) => figure(k))
    .replace(/\u0003N(\d+)\u0003/g, (_, k: string) => renderNoteFootnote(r.footnotes[Number(k)] ?? '', Number(k), options))
  if (r.footnotes.length) html += `<ol class="md-fns">${r.footnotes.map((f) => `<li>${noteInline(f, options)}</li>`).join('')}</ol>`
  return html
}
