import type { ReactNode } from 'react'
import { Icon } from './icons'
import { t } from './i18n'
import type { ReadingGroup } from './reading'

/** 읽기 정리의 묶음 하나: 쪽 · 고른 글(칠한 색) · 그 자리의 메모와 질문. 쪽이나 고른 글을 누르면 PDF의 그 자리로 */
export function ReadingCard({ g, on, onGo, onAdd, children }: { g: ReadingGroup; on: boolean; onGo(): void; onAdd?(): void; children: ReactNode[] }) {
  return (
    <div className={`rd-group${on ? ' on' : ''}`} data-ui="정리 묶음">
      <div className="rd-head">
        <button className="cmt-where" title={t('PDF의 그 자리로', 'Go to that spot in the PDF')} onClick={onGo}>{t(`${g.page}쪽`, `p. ${g.page}`)}</button>
        <span className="sp" />
        {onAdd && <button className="icon-btn sm" data-ui="묶음에 추가" aria-label={t('이 자리에 메모 · 질문 추가', 'Add a note or question here')} data-tip={t('메모 · 질문 추가', 'Add note · question')} onClick={onAdd}>{Icon.plus}</button>}
      </div>
      <blockquote className="cmt-quote rd-quote" style={g.color ? { borderColor: `var(--paint-${g.color})`, background: `var(--paint-${g.color})` } : undefined} onClick={onGo}>{g.quote}</blockquote>
      {children.length ? children : <p className="muted rd-only">{t('하이라이트만', 'Highlight only')}</p>}
    </div>
  )
}
