import { useEffect, useRef } from 'react'
import { Icon } from './icons'
import { t } from './i18n'
import type { OutlineItem } from './pdfNav'

/** 목차 칸: PDF 왼쪽에 붙는다. 지금 보는 쪽의 마지막 제목을 표시한다 */
export function PdfToc({ items, current, onGo, onClose }: { items: OutlineItem[]; current: number; onGo(item: OutlineItem): void; onClose(): void }) {
  const here = items.reduce((at, it, i) => (it.page <= current ? i : at), -1)
  return (
    <nav className="pdf-toc" data-ui="목차" aria-label={t('목차', 'Contents')}>
      <div className="pdf-toc-head"><span className="rs-label">{t('목차', 'Contents')}</span><span className="sp" />
        <button className="icon-btn sm" aria-label={t('목차 닫기', 'Close contents')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      <div className="pdf-toc-list">
        {items.map((it, i) => (
          <button key={i} className={`pdf-toc-row${i === here ? ' on' : ''}`} style={{ paddingLeft: `calc(var(--sp-2) + ${it.depth} * var(--sp-3))` }} title={it.title} onClick={() => onGo(it)}>
            <span className="label">{it.title}</span><span className="meta">{it.page}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

/** 찾기 칸: Enter 다음 · ⇧Enter 이전 · Esc 닫기 */
export function PdfFind({ query, onQuery, count, index, loading, onStep, onClose }: {
  query: string; onQuery(q: string): void; count: number; index: number; loading: boolean; onStep(dir: 1 | -1): void; onClose(): void
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  return (
    <div className="pdf-find" data-ui="찾기 칸" role="search">
      <input ref={input} value={query} placeholder={t('PDF에서 찾기', 'Find in PDF')} aria-label={t('PDF에서 찾기', 'Find in PDF')}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onStep(e.shiftKey ? -1 : 1) }
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }} />
      <span className="pdf-find-count muted">{!query.trim() ? '' : loading && !count ? '…' : count ? `${index + 1} / ${count}` : t('없음', 'None')}</span>
      <button className="pdf-tool" aria-label={t('이전 찾은 곳', 'Previous match')} title={t('이전 (⇧Enter)', 'Previous (⇧Enter)')} disabled={!count} onClick={() => onStep(-1)}>↑</button>
      <button className="pdf-tool" aria-label={t('다음 찾은 곳', 'Next match')} title={t('다음 (Enter)', 'Next (Enter)')} disabled={!count} onClick={() => onStep(1)}>↓</button>
      <button className="pdf-tool" aria-label={t('찾기 닫기', 'Close find')} title={t('닫기 (Esc)', 'Close (Esc)')} onClick={onClose}><span className="ico">{Icon.x}</span></button>
    </div>
  )
}
