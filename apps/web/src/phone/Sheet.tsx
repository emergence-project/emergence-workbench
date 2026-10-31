import type { ReactNode } from 'react'
import { t } from '../i18n'
import { Icon } from '../icons'

/** 폰의 아래에서 올라오는 시트. 바깥(어두운 곳)이나 ×를 누르면 닫힌다 (내 차례 답 · 새 대화 · ＋ 메모) */
export function Sheet({ head, ui = '답 시트', onClose, children }: { head: ReactNode; ui?: string; onClose(): void; children: ReactNode }) {
  return (
    <div className="ph-sheet-wrap" data-ui={ui}>
      <div className="ph-scrim" onClick={onClose} />
      <div className="ph-sheet" role="dialog" aria-modal="true" aria-label={typeof head === 'string' ? head : undefined}>
        <div className="ph-sheet-head"><b>{head}</b><button className="icon-btn" aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
        <div className="ph-sheet-body">{children}</div>
      </div>
    </div>
  )
}
